'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Terminal, FileCode, CheckCircle, Database, Ghost, 
  MessageSquare, Layout, Server, AlertCircle, 
  Search, X, Play, Zap, BrainCircuit, Activity, Power, Clock, Download
} from 'lucide-react';

// Tauri API
import { invoke } from '@tauri-apps/api/core';

import rawSessionData from '../data/ghostflow_session.json';

type TimelineActivity = typeof rawSessionData.timeline_activities[0] | any;
type ReasoningInsight = typeof rawSessionData.ai_analysis.reasoning_insights[0];

export default function GhostFlowDashboard() {
  const sessionData = rawSessionData;
  const [currentStep, setCurrentStep] = useState(0);
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: `Halo! Saya asisten kognitif dari GhostFlow. Di mode Live Telemetry, saya akan menganalisis aktivitas Anda secara real-time.` }
  ]);
  const [chatInput, setChatInput] = useState('');
  
  // Telemetry Engine State
  const [isRecording, setIsRecording] = useState(false);
  const [liveActivities, setLiveActivities] = useState<TimelineActivity[]>([]);
  const [duration, setDuration] = useState(0);
  const [mode, setMode] = useState('expert');
  const [lastExportPath, setLastExportPath] = useState('');
  const [inTauri, setInTauri] = useState(false);

  const activeActivity = isRecording && liveActivities.length > 0 
    ? liveActivities[liveActivities.length - 1] 
    : (liveActivities.length > 0 ? liveActivities[currentStep] : sessionData.timeline_activities[currentStep]);

  const insights = sessionData.ai_analysis.reasoning_insights as ReasoningInsight[];
  const currentInsight = activeActivity ? insights.find(i => i.target_activity_id === activeActivity.activity_id) : null;

  const chatEndRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    // Check if running in Tauri
    if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
      setInTauri(true);
      checkStatus();
    } else {
      // Fallback to mock data if not in Tauri
      setLiveActivities(sessionData.timeline_activities);
    }
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Polling mechanism
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording && inTauri) {
      interval = setInterval(() => {
        pollData();
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [isRecording, liveActivities.length, inTauri]);

  const checkStatus = async () => {
    try {
      const status: any = await invoke('get_recording_status');
      setIsRecording(status.is_recording);
      setDuration(status.duration_seconds);
      if (status.is_recording) {
        pollData();
      }
    } catch (e) {
      console.error("Tauri Error:", e);
    }
  };

  const pollData = async () => {
    try {
      const status: any = await invoke('get_recording_status');
      setDuration(status.duration_seconds);
      
      const newActs: TimelineActivity[] = await invoke('get_live_activities', { offset: 0 });
      setLiveActivities(newActs);
      if (newActs.length > 0 && isRecording) {
         setCurrentStep(newActs.length - 1);
      }
    } catch (e) {
      console.error("Poll Error:", e);
    }
  };

  const toggleRecording = async () => {
    if (!inTauri) {
      alert("Fitur perekaman hanya tersedia di desktop app (Tauri).");
      return;
    }

    try {
      if (isRecording) {
        // Stop
        const path: string = await invoke('stop_recording');
        setIsRecording(false);
        if (path) setLastExportPath(path);
        setChatMessages(prev => [...prev, { role: 'assistant', text: `Sesi dihentikan. Data diekspor ke: ${path}` }]);
      } else {
        // Start
        await invoke('start_recording', { mode, projectDir: '.' }); // Provide actual dir later
        setIsRecording(true);
        setLastExportPath('');
        setLiveActivities([]);
        setDuration(0);
        setCurrentStep(0);
        setChatMessages([{ role: 'assistant', text: `Mulai merekam di latar belakang dengan mode: ${mode}. CPU Overhead dijamin < 1%.` }]);
      }
    } catch (e) {
      console.error("Toggle Error:", e);
      alert("Error: " + e);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleSendMessage = (text: string) => {
    if (!text.trim()) return;
    setChatMessages(prev => [...prev, { role: 'user', text }]);
    setChatInput('');
    
    setTimeout(() => {
      setChatMessages(prev => [...prev, { 
        role: 'assistant', 
        text: `Saya memantau Anda. Jika ini sesi nyata, saya akan menganalisis buffer memori Rust Anda.`
      }]);
    }, 800);
  };
  
  const transition = { ease: [0.2, 0.8, 0.2, 1] as [number, number, number, number], duration: 0.4 };

  const getPhaseColor = (phase: string, isActive: boolean) => {
    if (!phase) return 'bg-[#222228]';
    switch (phase.toLowerCase()) {
      case 'discovery': return isActive ? 'bg-sky-400' : 'bg-sky-900/20';
      case 'development': return isActive ? 'bg-indigo-400' : 'bg-indigo-900/20';
      case 'debug': return isActive ? 'bg-rose-400' : 'bg-rose-900/20';
      case 'ship': return isActive ? 'bg-teal-400' : 'bg-teal-900/20';
      default: return isActive ? 'bg-amber-400' : 'bg-amber-900/20'; // For live unknown
    }
  };

  const displayActivities = liveActivities.length > 0 ? liveActivities : sessionData.timeline_activities;

  const renderWorkflowDnaBar = () => {
    return (
      <div className="w-full h-1 flex items-center bg-[#0a0a0c]">
         {displayActivities.map((act, i) => (
           <div key={i} className={`flex-1 h-full transition-all duration-500 ${getPhaseColor(act.phase || 'live', i === currentStep)} mx-[1px] rounded-full ${i === currentStep ? 'opacity-100 shadow-[0_0_8px_rgba(255,255,255,0.3)]' : 'opacity-60'}`}></div>
         ))}
      </div>
    )
  };

  const renderMorphicWorkspace = (activity: any) => {
    if (!activity) return null;
    const focusedApp = activity.layout_state?.focused_app || activity.app_class;
    
    return (
      <motion.div 
        key={activity.activity_id}
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={transition}
        className="w-full h-full flex items-center justify-center bg-[#181a1f] rounded-xl border border-[#2a2a32] p-8 shadow-sm"
      >
        <div className="max-w-md w-full flex flex-col items-center text-center">
          <div className="w-20 h-20 bg-[#212329] rounded-2xl flex items-center justify-center mb-6 border border-[#2a2a32] shadow-lg relative">
            {focusedApp?.includes('Chrome') || focusedApp?.includes('Firefox') ? <Search className="w-10 h-10 text-sky-400" /> :
             focusedApp?.includes('Docker') ? <Server className="w-10 h-10 text-indigo-400" /> :
             focusedApp?.includes('VS Code') ? <FileCode className="w-10 h-10 text-teal-400" /> :
             focusedApp?.includes('Terminal') ? <Terminal className="w-10 h-10 text-zinc-400" /> :
             focusedApp?.includes('Figma') ? <Layout className="w-10 h-10 text-purple-400" /> :
             focusedApp?.includes('Git') ? <CheckCircle className="w-10 h-10 text-orange-400" /> :
             <Activity className="w-10 h-10 text-zinc-500" />}
             
             {isRecording && <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping"></span>}
          </div>
          <h3 className="text-xl font-medium text-zinc-100 mb-2">{focusedApp || 'Application View'}</h3>
          <p className="text-zinc-400 mb-8 text-[14px] leading-relaxed font-mono">{activity.window_title || activity.description}</p>
          
          <div className="w-full bg-[#121317] rounded-xl p-5 text-left border border-[#2a2a32]">
            <div className="text-[11px] text-zinc-500 mb-3 font-medium uppercase tracking-widest">Telemetry Detail</div>
            <div className="text-zinc-300 text-[13px] font-mono flex items-start"><Activity className="w-4 h-4 mr-3 mt-0.5 text-amber-400" /> Type: {activity.activity_type || activity.type}</div>
            <div className="text-zinc-300 text-[13px] font-mono flex items-start mt-2"><Clock className="w-4 h-4 mr-3 mt-0.5 text-zinc-500" /> Duration: {activity.duration_ms ? `${(activity.duration_ms/1000).toFixed(1)}s` : 'Unknown'}</div>
            
            {activity.details && (
              <pre className="mt-4 text-[10px] text-zinc-500 overflow-auto max-h-32 p-2 bg-black/30 rounded border border-white/5">
                {JSON.stringify(activity.details, null, 2)}
              </pre>
            )}
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen h-screen bg-[#0a0a0c] text-zinc-200 font-sans overflow-hidden flex flex-col selection:bg-teal-500/30">
      
      {/* Privacy-First Engine Header */}
      <header className="h-[72px] flex-shrink-0 border-b border-[#222228] bg-[#0a0a0c]/80 backdrop-blur-xl px-6 flex items-center justify-between z-20">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2 text-zinc-100">
            <Ghost className="w-5 h-5 text-zinc-400" />
            <div className="flex flex-col">
              <span className="font-bold text-sm tracking-tight">GhostFlow Engine</span>
              <span className="text-[10px] text-zinc-500 font-mono">v0.1.0-alpha • Rust/Tauri</span>
            </div>
          </div>
          <div className="h-6 w-[1px] bg-[#2a2a32]"></div>
          
          {/* PRIVACY SWITCH */}
          <div className="flex items-center space-x-4 bg-[#121317] border border-[#2a2a32] p-1.5 rounded-lg">
            <button 
              onClick={toggleRecording}
              className={`flex items-center px-4 py-2 rounded-md font-bold text-xs transition-all ${
                isRecording 
                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.1)]' 
                : 'bg-teal-500 text-black hover:bg-teal-400'
              }`}
            >
              <Power className="w-4 h-4 mr-2" />
              {isRecording ? 'STOP & EXPORT' : 'START RECORDING'}
            </button>
            
            <div className="flex items-center px-3 space-x-3 text-[12px] font-mono">
              {isRecording ? (
                <>
                  <div className="flex items-center text-rose-400"><div className="w-2 h-2 rounded-full bg-rose-500 mr-2 animate-pulse"></div> RECORDING</div>
                  <div className="text-zinc-500">|</div>
                  <div className="text-zinc-300"><Clock className="w-3.5 h-3.5 inline mr-1 opacity-70"/> {formatTime(duration)}</div>
                  <div className="text-zinc-500">|</div>
                  <div className="text-sky-400"><Activity className="w-3.5 h-3.5 inline mr-1 opacity-70"/> {liveActivities.length} logs</div>
                </>
              ) : (
                <div className="text-zinc-500 flex items-center">
                  <div className="w-2 h-2 rounded-full bg-zinc-600 mr-2"></div> ENGINE OFF (0% CPU)
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-5">
          <select 
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            disabled={isRecording}
            className="bg-[#121317] border border-[#2a2a32] text-zinc-300 text-xs rounded-md px-3 py-2 outline-none disabled:opacity-50"
          >
            <option value="expert">Expert Session</option>
            <option value="junior">Junior Session</option>
          </select>
        </div>
      </header>
      
      {renderWorkflowDnaBar()}

      <main className="flex-1 flex overflow-hidden">
         {/* Live Activity Feed */}
         <div className="w-[28%] flex-shrink-0 border-r border-[#222228] bg-[#0a0a0c] overflow-y-auto flex flex-col scrollbar-hide">
           <div className="px-6 py-4 sticky top-0 bg-[#0a0a0c]/90 backdrop-blur-sm z-10 border-b border-[#222228] flex justify-between items-center">
             <h2 className="text-[11px] font-medium text-zinc-500 uppercase tracking-widest">{isRecording ? 'Live Telemetry' : 'Session Timeline'}</h2>
             {lastExportPath && <span className="text-[9px] text-teal-400 font-mono bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/20 truncate max-w-[150px]" title={lastExportPath}>Saved!</span>}
           </div>
           
           <div className="p-4 space-y-2 pb-20">
             {displayActivities.length === 0 && (
               <div className="text-center p-8 text-zinc-600 text-sm font-mono border border-dashed border-[#222228] rounded-xl mt-4">
                 Buffer is empty.<br/><br/>Click START RECORDING to capture OS-level telemetry.
               </div>
             )}
             
             {displayActivities.map((act, i) => {
               const isActive = currentStep === i;
               return (
                 <button
                   key={act.activity_id}
                   onClick={() => setCurrentStep(i)}
                   className={`w-full text-left px-4 py-3 rounded-xl flex flex-col transition-colors ${
                     isActive ? 'bg-[#181a1f] border border-[#333] shadow-lg' : 
                     'hover:bg-[#121216] border border-transparent'
                   }`}
                 >
                   <div className="flex items-center justify-between mb-2">
                     <span className={`text-[10px] font-mono px-2 py-0.5 rounded-sm ${isActive ? 'bg-zinc-800 text-zinc-200' : 'bg-transparent text-zinc-600'}`}>
                       {new Date(act.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}
                     </span>
                     <span className={`text-[10px] font-medium ${isActive ? 'text-teal-400' : 'text-zinc-600'}`}>
                       {act.app_class || act.layout_state?.focused_app || 'App'}
                     </span>
                   </div>
                   <span className={`text-[13px] line-clamp-2 font-mono leading-relaxed mb-2 break-all ${isActive ? 'text-zinc-300' : 'text-zinc-500'}`}>
                     {act.window_title || act.description?.split('.')[0]}
                   </span>
                 </button>
               )
             })}
           </div>
         </div>

         {/* Center Inspector */}
         <div className="flex-1 bg-[#0f1115] relative p-8 flex flex-col">
           <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-medium text-zinc-100 flex items-center">
                Morphic Buffer Inspector
                <span className="ml-4 px-2 py-1 text-[10px] bg-[#181a1f] text-zinc-400 rounded border border-[#2a2a32] font-mono">
                  {activeActivity?.activity_type || activeActivity?.type?.replace('_', ' ') || 'IDLE'}
                </span>
              </h2>
           </div>
           
           <div className="flex-1 relative">
             <AnimatePresence mode="wait">
                {activeActivity ? renderMorphicWorkspace(activeActivity) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-600 font-mono text-sm">Waiting for telemetry data...</div>
                )}
             </AnimatePresence>
           </div>
         </div>

         {/* Right Assistant */}
         <div className="w-[28%] flex-shrink-0 border-l border-[#222228] bg-[#0a0a0c] flex flex-col hidden lg:flex">
           <div className="h-[50%] border-b border-[#222228] bg-[#0f1115] flex flex-col">
              <div className="p-4 border-b border-[#222228] flex items-center bg-[#121317]">
                 <div className="w-2 h-2 rounded-full bg-teal-500 mr-3 opacity-80 animate-pulse"></div>
                 <span className="text-[12px] font-bold text-zinc-300 uppercase tracking-widest">Ghost Mentor</span>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
                {chatMessages.map((msg, i) => (
                  <motion.div 
                    initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
                    key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                     <div className={`max-w-[85%] p-3 text-[13px] leading-relaxed rounded-xl ${
                       msg.role === 'user' 
                         ? 'bg-teal-900/30 border border-teal-500/20 text-teal-100' 
                         : 'bg-[#181a1f] border border-[#2a2a32] text-zinc-300'
                     }`}>
                       {msg.text}
                     </div>
                  </motion.div>
                ))}
                <div ref={chatEndRef} />
              </div>
              
              <div className="p-4 bg-[#121317] border-t border-[#2a2a32]">
                <form 
                  onSubmit={e => { e.preventDefault(); handleSendMessage(chatInput); }}
                  className="relative flex items-center"
                >
                  <input 
                    type="text" 
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    placeholder="Tanya AI tentang sesi ini..." 
                    className="w-full bg-[#181a1f] border border-[#2a2a32] rounded-lg py-2.5 pl-4 pr-10 text-[13px] text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors"
                  />
                  <button 
                    type="submit" 
                    disabled={!chatInput.trim()}
                    className="absolute right-2 p-1.5 text-zinc-500 hover:text-zinc-300 disabled:opacity-0 transition-colors"
                  >
                    <MessageSquare className="w-4 h-4" />
                  </button>
                </form>
              </div>
           </div>

           <div className="flex-1 p-6 flex flex-col overflow-y-auto scrollbar-hide bg-[#0a0a0c]">
             <div className="text-[11px] font-medium text-zinc-500 mb-6 uppercase tracking-widest">AI Reasoning Analysis</div>
             
             {currentInsight ? (
               <div className="mb-8">
                 <p className="text-zinc-300 text-[13px] leading-relaxed mb-6 font-mono border-l-2 border-indigo-500/50 pl-4">
                   {currentInsight.insight}
                 </p>
                 <div className="flex items-center justify-between py-3 border-t border-[#222228]">
                    <span className="text-[11px] text-zinc-500 font-medium">Confidence Score</span>
                    <span className="text-[13px] font-mono text-teal-400">{Math.round(currentInsight.reasoning_confidence * 100)}%</span>
                 </div>
               </div>
             ) : (
               <div className="flex-1 flex flex-col items-center justify-center text-zinc-600 mb-8 p-8 border border-dashed border-[#222228] rounded-xl">
                 <span className="text-[12px] text-center">Menunggu data konteks historis untuk analisis reasoning.</span>
               </div>
             )}
           </div>
         </div>
      </main>
    </div>
  );
}
