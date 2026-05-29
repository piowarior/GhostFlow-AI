'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Terminal, FileCode, CheckCircle, Database, Ghost, 
  MessageSquare, Layout, Server, AlertCircle, 
  Search, X, Play, Zap, BrainCircuit, Activity, Power, Clock, 
  Folder, User, Cpu, Sparkles, ChevronRight, History
} from 'lucide-react';

// Tauri API
import { invoke } from '@tauri-apps/api/core';

import rawSessionData from '../data/ghostflow_session.json';

type TimelineActivity = {
  activity_id: string;
  timestamp: string;
  phase: string;
  type: string;
  activity_type?: string;
  description: string;
  app_class?: string;
  window_title?: string;
  layout_state: {
    focused_app: string;
    screen_mode: string;
    left_window_app: string | null;
    right_window_app: string | null;
    split_ratio: string;
  };
  details?: any;
  duration_ms?: number;
};

type SessionItem = {
  id: string;
  title: string;
  description: string;
  mode: 'expert' | 'junior';
  timestamp: string;
  total_activities: number;
  duration_seconds: number;
  activities: TimelineActivity[];
  cognitive_signals: {
    fast_file_switch_count: number;
    research_phase_count: number;
    retry_pattern_count: number;
    total_app_switches: number;
  };
};

export default function GhostFlowDashboard() {
  // --- Sessions & History Management (Gemini-style) ---
  const [sessions, setSessions] = useState<SessionItem[]>([
    {
      id: 'preloaded-budi-siakad',
      title: 'SIAKAD Web — CORS & PostgreSQL Recovery',
      description: 'Expert: Budi Santoso (Lead Backend)',
      mode: 'expert',
      timestamp: '2026-05-29T10:00:00Z',
      total_activities: rawSessionData.timeline_activities.length,
      duration_seconds: rawSessionData.session_metadata.duration_seconds,
      activities: rawSessionData.timeline_activities as any[],
      cognitive_signals: {
        fast_file_switch_count: rawSessionData.session_metadata.difficulty_signal.fast_file_switching ? 3 : 0,
        research_phase_count: 2,
        retry_pattern_count: rawSessionData.session_metadata.difficulty_signal.retry_count,
        total_app_switches: 15
      }
    }
  ]);
  
  const [selectedSessionId, setSelectedSessionId] = useState<string>('preloaded-budi-siakad');
  const [currentStep, setCurrentStep] = useState(0);
  const [leftTab, setLeftTab] = useState<'history' | 'steps'>('history');
  
  // Cognitive Assistant State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMode, setRecordingMode] = useState<'expert' | 'junior'>('expert');
  const [duration, setDuration] = useState(0);
  const [inTauri, setInTauri] = useState(false);
  const [liveActivitiesCount, setLiveActivitiesCount] = useState(0);

  // Chat/Mentor States
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: `Halo! Saya Ghost Cognitive Mentor. Silakan aktifkan 'Cognitive Assistant' untuk merekam aktivitas secara real-time, atau pilih salah satu Sesi di riwayat sebelah kiri untuk menelaah pola pikir expert.` }
  ]);
  const [chatInput, setChatInput] = useState('');

  // Selected session data
  const currentSession = sessions.find(s => s.id === selectedSessionId) || sessions[0];
  const activeActivity = currentSession?.activities[currentStep];
  
  // AI Insights mapping
  const currentInsight = activeActivity 
    ? rawSessionData.ai_analysis.reasoning_insights.find(i => i.target_activity_id === activeActivity.activity_id) || {
        insight: `AI Mendeteksi aktivitas ${activeActivity.app_class || activeActivity.layout_state?.focused_app} (${activeActivity.activity_type || activeActivity.type}). Ini menunjukkan pola pemecahan masalah ${currentSession.mode === 'expert' ? 'terarah & metodis' : 'tahap trial-error awal'}.`,
        reasoning_confidence: currentSession.mode === 'expert' ? 0.92 : 0.81
      }
    : null;

  const chatEndRef = useRef<HTMLDivElement>(null);

  // --- Environment Check & Initial Status ---
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
      setInTauri(true);
      checkTauriStatus();
    }
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // --- Telemetry Polling (Every 2s when recording) ---
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording && inTauri) {
      interval = setInterval(() => {
        pollLiveTelemetry();
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [isRecording, inTauri]);

  const checkTauriStatus = async () => {
    try {
      const status: any = await invoke('get_recording_status');
      setIsRecording(status.is_recording);
      setDuration(status.duration_seconds);
      setRecordingMode(status.mode as 'expert' | 'junior');
      
      if (status.is_recording) {
        // Create active live session in history if not present
        handleStartLiveSession(status.mode);
        pollLiveTelemetry();
      }
    } catch (e) {
      console.error("Tauri status error:", e);
    }
  };

  const handleStartLiveSession = (mode: string) => {
    // Check if we already have a live session
    setSessions(prev => {
      if (prev.some(s => s.id === 'live-recording-session')) {
        return prev;
      }
      const newLive: SessionItem = {
        id: 'live-recording-session',
        title: `🔴 Live Telemetry Session (${mode === 'expert' ? 'Expert' : 'Junior'})`,
        description: 'Perekaman telemetri kognitif real-time...',
        mode: mode as 'expert' | 'junior',
        timestamp: new Date().toISOString(),
        total_activities: 0,
        duration_seconds: 0,
        activities: [],
        cognitive_signals: {
          fast_file_switch_count: 0,
          research_phase_count: 0,
          retry_pattern_count: 0,
          total_app_switches: 0
        }
      };
      return [newLive, ...prev];
    });
    setSelectedSessionId('live-recording-session');
    setLeftTab('steps');
  };

  const pollLiveTelemetry = async () => {
    try {
      const status: any = await invoke('get_recording_status');
      setDuration(status.duration_seconds);
      
      const newActs: TimelineActivity[] = await invoke('get_live_activities', { offset: 0 });
      setLiveActivitiesCount(newActs.length);

      setSessions(prev => prev.map(s => {
        if (s.id === 'live-recording-session') {
          return {
            ...s,
            total_activities: newActs.length,
            duration_seconds: status.duration_seconds,
            activities: newActs,
            cognitive_signals: status.cognitive_signals
          };
        }
        return s;
      }));

      // Auto-focus latest step
      if (newActs.length > 0) {
        setCurrentStep(newActs.length - 1);
      }
    } catch (e) {
      console.error("Poll telemetry error:", e);
    }
  };

  // --- Toggle Telemetry On/Off ---
  const toggleCognitiveAssistant = async () => {
    if (!inTauri) {
      alert("Fitur perekaman telemetri kognitif real-time hanya tersedia di desktop app (Tauri).");
      return;
    }

    try {
      if (isRecording) {
        // STOP & EXPORT
        const path: string | null = await invoke('stop_recording');
        setIsRecording(false);
        
        if (path) {
          // Finalize session in state
          setSessions(prev => {
            const live = prev.find(s => s.id === 'live-recording-session');
            if (!live) return prev;

            const finalized: SessionItem = {
              ...live,
              id: `finalized-${Date.now()}`,
              title: live.mode === 'expert' 
                ? `Sesi Expert — ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`
                : `Sesi Junior — ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`,
              description: `Exported to: ${path.replace(window.navigator.userAgent, '')}`
            };

            return [finalized, ...prev.filter(s => s.id !== 'live-recording-session')];
          });

          // Open the newly finalized session
          setTimeout(() => {
            setSessions(prev => {
              const newest = prev[0];
              if (newest) {
                setSelectedSessionId(newest.id);
                setCurrentStep(0);
                setLeftTab('history');
              }
              return prev;
            });
          }, 100);

          setChatMessages(prev => [...prev, { 
            role: 'assistant', 
            text: `Asisten dinonaktifkan. Data telemetri kognitif berhasil dianalisis & disimpan di ~/GhostFlow_Data/`
          }]);
        }
      } else {
        // START
        await invoke('start_recording', { mode: recordingMode, projectDir: '.' });
        setIsRecording(true);
        setDuration(0);
        setLiveActivitiesCount(0);
        handleStartLiveSession(recordingMode);
        
        setChatMessages(prev => [...prev, { 
          role: 'assistant', 
          text: `Asisten Kognitif AKTIF. Memantau aktivitas workspace di latar belakang dengan CPU overhead < 1%...` 
        }]);
      }
    } catch (e) {
      console.error("Toggle engine error:", e);
      alert("Gagal mengaktifkan asisten: " + e);
    }
  };

  const selectSessionFromHistory = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setCurrentStep(0);
    setLeftTab('steps');
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
      let reply = `Sebagai Mentor Kognitif, saya melihat Anda sedang menelaah sesi ${currentSession.title}. `;
      if (currentSession.mode === 'expert') {
        reply += `Expert (Budi) memprioritaskan perbaikan isolasi infrastruktur PostgreSQL sebelum melakukan konfigurasi CORS untuk menghemat runtime memori.`;
      } else {
        reply += `Junior Developer mengalami loop kebingungan karena melompat-lompat berkas tanpa membaca log error terminal. Rekomendasi saya: telusuri stack trace NodeJS terlebih dahulu.`;
      }
      setChatMessages(prev => [...prev, { role: 'assistant', text: reply }]);
    }, 800);
  };

  const getPhaseColor = (phase: string, isActive: boolean) => {
    if (!phase) return 'bg-[#222228]';
    switch (phase.toLowerCase()) {
      case 'discovery': return isActive ? 'bg-sky-400' : 'bg-sky-900/20';
      case 'development': return isActive ? 'bg-indigo-400' : 'bg-indigo-900/20';
      case 'debug': return isActive ? 'bg-rose-400' : 'bg-rose-900/20';
      case 'ship': return isActive ? 'bg-teal-400' : 'bg-teal-900/20';
      default: return isActive ? 'bg-amber-400' : 'bg-amber-900/20';
    }
  };

  const transition = { ease: [0.2, 0.8, 0.2, 1] as [number, number, number, number], duration: 0.4 };

  return (
    <div className="min-h-screen h-screen bg-[#0a0a0c] text-zinc-200 font-sans overflow-hidden flex flex-col selection:bg-teal-500/30">
      
      {/* --- State-of-the-Art Cognitive Assistant Switch & Selector --- */}
      <header className="h-[76px] flex-shrink-0 border-b border-[#222228] bg-[#0a0a0c]/80 backdrop-blur-xl px-6 flex items-center justify-between z-20">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2.5 text-zinc-100">
            <div className="w-9 h-9 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center relative">
              <Ghost className="w-5 h-5 text-teal-400" />
              {isRecording && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full animate-ping"></span>}
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-sm tracking-tight">GhostFlow AI</span>
              <span className="text-[10px] text-zinc-500 font-mono tracking-wider">TELEMETRY HUD</span>
            </div>
          </div>
          <div className="h-7 w-[1px] bg-[#222228]"></div>
          
          {/* COGNITIVE ASSISTANT WIDGET */}
          <div className="flex items-center space-x-4 bg-[#121317] border border-[#222228] p-1.5 rounded-xl shadow-inner">
            <select 
              value={recordingMode}
              onChange={(e) => setRecordingMode(e.target.value as 'expert' | 'junior')}
              disabled={isRecording}
              className="bg-[#181a1f] border border-[#2a2a32] text-zinc-300 text-xs rounded-lg px-3 py-1.5 outline-none font-medium disabled:opacity-50 transition-all cursor-pointer"
            >
              <option value="expert">Expert Mode (Budi Santoso)</option>
              <option value="junior">Junior Mode (Simulated Struggle)</option>
            </select>

            <button 
              onClick={toggleCognitiveAssistant}
              className={`flex items-center px-4 py-1.5 rounded-lg font-bold text-xs transition-all ${
                isRecording 
                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.1)]' 
                : 'bg-teal-500 text-black hover:bg-teal-400'
              }`}
            >
              <Power className="w-4 h-4 mr-2" />
              {isRecording ? 'STOP & EXPORT' : 'AKTIFKAN ASISTEN'}
            </button>
            
            <div className="flex items-center px-2 space-x-3 text-[12px] font-mono border-l border-[#222228] pl-4">
              {isRecording ? (
                <>
                  <div className="flex items-center text-rose-400">
                    <span className="relative flex h-2 w-2 mr-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                    </span>
                    RECORDING
                  </div>
                  <div className="text-zinc-600">|</div>
                  <div className="text-zinc-300 flex items-center"><Clock className="w-3.5 h-3.5 mr-1 text-zinc-500"/> {formatTime(duration)}</div>
                  <div className="text-zinc-600">|</div>
                  <div className="text-teal-400 flex items-center"><Activity className="w-3.5 h-3.5 mr-1 text-teal-500"/> {liveActivitiesCount} logs</div>
                </>
              ) : (
                <div className="text-zinc-500 flex items-center">
                  <div className="w-2 h-2 rounded-full bg-zinc-700 mr-2"></div> COGNITIVE ASISTEN INAKTIF (0% CPU)
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="px-3 py-1.5 rounded-lg bg-[#121317] border border-[#222228] flex items-center space-x-2 text-xs font-mono text-zinc-400">
            <Cpu className="w-3.5 h-3.5 text-zinc-500" />
            <span>Ubuntu Wayland • Low Power Polling</span>
          </div>
        </div>
      </header>
      
      {/* Workflow DNA Bar at Top */}
      <div className="w-full h-1 flex items-center bg-[#0a0a0c]">
         {currentSession?.activities.map((act, i) => (
           <div key={i} className={`flex-1 h-full transition-all duration-500 ${getPhaseColor(act.phase, i === currentStep)} mx-[1px] rounded-full ${i === currentStep ? 'opacity-100 shadow-[0_0_8px_rgba(255,255,255,0.3)]' : 'opacity-60'}`}></div>
         ))}
      </div>

      <main className="flex-1 flex overflow-hidden">
        
        {/* --- Gemini-style Sidebar (RIWAYAT SESI & LANGKAH DETAIL) --- */}
        <div className="w-[300px] flex-shrink-0 border-r border-[#222228] bg-[#0a0a0c] flex flex-col z-10">
          
          {/* Tabs Switcher at top of left panel */}
          <div className="flex border-b border-[#222228] p-2 space-x-1 bg-[#0d0e12]">
            <button
              onClick={() => setLeftTab('history')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-2 ${
                leftTab === 'history' 
                ? 'bg-zinc-800 text-zinc-200 border border-[#2a2a32] shadow-sm' 
                : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Riwayat Sesi</span>
            </button>
            <button
              onClick={() => setLeftTab('steps')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-2 ${
                leftTab === 'steps' 
                ? 'bg-zinc-800 text-zinc-200 border border-[#2a2a32] shadow-sm' 
                : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Aktivitas ({currentSession?.activities.length || 0})</span>
            </button>
          </div>

          {/* Left Panel Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
            
            {/* RIWAYAT SESI TAB */}
            {leftTab === 'history' && (
              <div className="space-y-3">
                {sessions.map(s => {
                  const isSelected = s.id === selectedSessionId;
                  return (
                    <button
                      key={s.id}
                      onClick={() => selectSessionFromHistory(s.id)}
                      className={`w-full text-left p-4 rounded-xl flex flex-col transition-all border ${
                        isSelected 
                        ? 'bg-[#181a1f] border-[#333] shadow-md' 
                        : 'bg-[#121317]/50 border-[#222228] hover:bg-[#121317]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                          s.mode === 'expert' 
                          ? 'bg-teal-500/10 text-teal-400 border-teal-500/20' 
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        }`}>
                          {s.mode}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {formatTime(s.duration_seconds)}
                        </span>
                      </div>
                      <h3 className={`text-[13px] font-medium leading-snug mb-1 ${isSelected ? 'text-zinc-200 font-semibold' : 'text-zinc-400'}`}>
                        {s.title}
                      </h3>
                      <p className="text-[11px] text-zinc-500 line-clamp-2 leading-relaxed">
                        {s.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}

            {/* AKTIVITAS TIMELINE STEPS TAB */}
            {leftTab === 'steps' && (
              <div className="space-y-2">
                {currentSession?.activities.length === 0 ? (
                  <div className="text-center py-12 text-zinc-600 text-xs font-mono border border-dashed border-[#222228] rounded-xl">
                    Sesi kosong.<br/><br/>Nyalakan telemetry assistant untuk memantau aktivitas Anda.
                  </div>
                ) : (
                  currentSession?.activities.map((act, i) => {
                    const isActive = currentStep === i;
                    return (
                      <button
                        key={act.activity_id}
                        onClick={() => setCurrentStep(i)}
                        className={`w-full text-left px-3.5 py-3 rounded-xl flex flex-col transition-all border ${
                          isActive 
                          ? 'bg-[#181a1f] border-[#333] shadow-sm' 
                          : 'bg-transparent border-transparent hover:bg-[#121317]/50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className={`text-[10px] font-mono ${isActive ? 'text-zinc-300' : 'text-zinc-600'}`}>
                            {new Date(act.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}
                          </span>
                          <span className={`text-[10px] font-bold ${isActive ? 'text-teal-400' : 'text-zinc-500'}`}>
                            {act.app_class || act.layout_state?.focused_app}
                          </span>
                        </div>
                        <span className={`text-[12px] font-mono leading-relaxed line-clamp-2 break-all ${isActive ? 'text-zinc-200' : 'text-zinc-500'}`}>
                          {act.window_title || act.description}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            )}

          </div>
        </div>

        {/* --- Center Morphic Inspector --- */}
        <div className="flex-1 bg-[#0f1115] p-8 flex flex-col overflow-y-auto scrollbar-hide">
          <div className="flex items-center justify-between mb-6 flex-shrink-0">
             <div className="flex flex-col">
               <h2 className="text-lg font-medium text-zinc-100 flex items-center">
                 Morphic Telemetry Inspector
                 <span className="ml-4 px-2 py-0.5 text-[10px] bg-[#181a1f] text-zinc-400 rounded-lg border border-[#2a2a32] font-mono">
                   {activeActivity?.activity_type || activeActivity?.type?.replace('_', ' ') || 'IDLE'}
                 </span>
               </h2>
               <p className="text-[12px] text-zinc-500 mt-1 font-mono">{currentSession.title}</p>
             </div>
          </div>
          
          <div className="flex-1 relative min-h-[400px]">
            <AnimatePresence mode="wait">
              {activeActivity ? (
                <motion.div 
                  key={activeActivity.activity_id}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={transition}
                  className="w-full h-full min-h-[400px] flex items-center justify-center bg-[#181a1f] rounded-2xl border border-[#222228] p-8 shadow-sm"
                >
                  <div className="max-w-lg w-full flex flex-col items-center text-center">
                    <div className="w-20 h-20 bg-[#212329] rounded-2xl flex items-center justify-center mb-6 border border-[#2a2a32] shadow-lg relative">
                      {activeActivity.app_class?.includes('Chrome') || activeActivity.layout_state?.focused_app?.includes('Chrome') ? <Search className="w-10 h-10 text-sky-400" /> :
                       activeActivity.app_class?.includes('Docker') || activeActivity.layout_state?.focused_app?.includes('Docker') ? <Server className="w-10 h-10 text-indigo-400" /> :
                       activeActivity.app_class?.includes('VS Code') || activeActivity.layout_state?.focused_app?.includes('VS Code') ? <FileCode className="w-10 h-10 text-teal-400" /> :
                       activeActivity.app_class?.includes('Terminal') || activeActivity.layout_state?.focused_app?.includes('Terminal') ? <Terminal className="w-10 h-10 text-zinc-400" /> :
                       activeActivity.app_class?.includes('Figma') || activeActivity.layout_state?.focused_app?.includes('Figma') ? <Layout className="w-10 h-10 text-purple-400" /> :
                       activeActivity.app_class?.includes('Git') ? <CheckCircle className="w-10 h-10 text-orange-400" /> :
                       <Activity className="w-10 h-10 text-zinc-500" />}
                       
                       {isRecording && selectedSessionId === 'live-recording-session' && (
                         <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping"></span>
                       )}
                    </div>
                    
                    <h3 className="text-xl font-medium text-zinc-100 mb-2">{activeActivity.app_class || activeActivity.layout_state?.focused_app || 'Application View'}</h3>
                    <p className="text-zinc-400 mb-8 text-[13px] leading-relaxed font-mono max-w-md">{activeActivity.window_title || activeActivity.description}</p>
                    
                    <div className="w-full bg-[#121317] rounded-xl p-5 text-left border border-[#222228] shadow-inner font-mono text-[13px]">
                      <div className="text-[10px] text-zinc-500 mb-4 font-bold uppercase tracking-wider">Live Metrics Data</div>
                      
                      <div className="grid grid-cols-2 gap-4 text-zinc-300">
                        <div className="flex items-center"><Activity className="w-4 h-4 mr-2 text-amber-500/70" /> Type: {activeActivity.activity_type || activeActivity.type}</div>
                        <div className="flex items-center"><Clock className="w-4 h-4 mr-2 text-zinc-500" /> Duration: {activeActivity.duration_ms ? `${(activeActivity.duration_ms/1000).toFixed(1)}s` : 'Background'}</div>
                        <div className="flex items-center"><Layout className="w-4 h-4 mr-2 text-indigo-400" /> Mode: {activeActivity.layout_state?.screen_mode}</div>
                        <div className="flex items-center"><Sparkles className="w-4 h-4 mr-2 text-teal-400" /> Ratio: {activeActivity.layout_state?.split_ratio || '100:0'}</div>
                      </div>
                      
                      {activeActivity.details && (
                        <div className="mt-4">
                          <div className="text-[10px] text-zinc-500 mb-2 font-bold uppercase tracking-wider">Payload Context</div>
                          <pre className="text-[11px] text-zinc-400 overflow-auto max-h-36 p-3.5 bg-black/40 rounded-lg border border-white/5 whitespace-pre-wrap leading-relaxed">
                            {JSON.stringify(activeActivity.details, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-600 font-mono text-sm border border-dashed border-[#222228] rounded-2xl">
                  Tidak ada aktivitas yang terpilih. Silakan klik salah satu log di panel kiri.
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* --- Right Cognitive Advisor Panel --- */}
        <div className="w-[320px] flex-shrink-0 border-l border-[#222228] bg-[#0a0a0c] flex flex-col hidden lg:flex z-10">
          
          {/* Cognitive Signals Summary */}
          <div className="p-5 border-b border-[#222228] bg-[#0d0e12]">
            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4 flex items-center">
              <Cpu className="w-3.5 h-3.5 mr-2 text-indigo-400" />
              Cognitive Signals
            </h3>
            <div className="grid grid-cols-2 gap-3 font-mono text-[11px]">
              <div className="bg-[#121317] border border-[#222228] p-3 rounded-lg flex flex-col">
                <span className="text-zinc-500 text-[9px] mb-1">Fast File Switches</span>
                <span className="text-teal-400 font-bold text-sm">{currentSession?.cognitive_signals?.fast_file_switch_count || 0}</span>
              </div>
              <div className="bg-[#121317] border border-[#222228] p-3 rounded-lg flex flex-col">
                <span className="text-zinc-500 text-[9px] mb-1">Deep Research Loops</span>
                <span className="text-sky-400 font-bold text-sm">{currentSession?.cognitive_signals?.research_phase_count || 0}</span>
              </div>
              <div className="bg-[#121317] border border-[#222228] p-3 rounded-lg flex flex-col">
                <span className="text-zinc-500 text-[9px] mb-1">Retry Command Patterns</span>
                <span className="text-rose-400 font-bold text-sm">{currentSession?.cognitive_signals?.retry_pattern_count || 0}</span>
              </div>
              <div className="bg-[#121317] border border-[#222228] p-3 rounded-lg flex flex-col">
                <span className="text-zinc-500 text-[9px] mb-1">Total App Switches</span>
                <span className="text-zinc-300 font-bold text-sm">{currentSession?.cognitive_signals?.total_app_switches || 0}</span>
              </div>
            </div>
          </div>

          {/* AI Reasoning Advisor Section */}
          <div className="flex-1 p-5 border-b border-[#222228] flex flex-col overflow-y-auto scrollbar-hide bg-[#0a0a0c]">
            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4 flex items-center">
              <BrainCircuit className="w-3.5 h-3.5 mr-2 text-teal-400" />
              AI Cognitive Reasoning
            </h3>
            
            {currentInsight ? (
              <div className="flex-1 flex flex-col justify-between">
                <p className="text-zinc-300 text-[13px] leading-relaxed font-mono border-l-2 border-indigo-500/50 pl-4 py-1">
                  {currentInsight.insight}
                </p>
                <div className="flex items-center justify-between py-3 border-t border-[#222228] mt-6 flex-shrink-0">
                  <span className="text-[11px] text-zinc-500 font-medium">Confidence Score</span>
                  <span className="text-[13px] font-mono text-teal-400 font-bold">{Math.round(currentInsight.reasoning_confidence * 100)}%</span>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-zinc-600 p-6 border border-dashed border-[#222228] rounded-xl font-mono text-center">
                <span className="text-[11px]">Pilih langkah aktivitas untuk melahirkan reasoning kognitif AI.</span>
              </div>
            )}
          </div>

          {/* Assistant Chatbot interface */}
          <div className="h-[40%] bg-[#0f1115] flex flex-col">
            <div className="px-4 py-3 border-b border-[#222228] flex items-center bg-[#121317] justify-between flex-shrink-0">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center">
                <MessageSquare className="w-3.5 h-3.5 mr-2 text-zinc-500" />
                Cognitive Chat
              </span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-3 text-[12px] leading-relaxed rounded-xl ${
                    msg.role === 'user' 
                      ? 'bg-teal-950/20 border border-teal-500/10 text-teal-100 font-mono' 
                      : 'bg-[#181a1f] border border-[#222228] text-zinc-400 font-mono'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            
            <div className="p-3 bg-[#121317] border-t border-[#222228] flex-shrink-0">
              <form 
                onSubmit={e => { e.preventDefault(); handleSendMessage(chatInput); }}
                className="relative flex items-center"
              >
                <input 
                  type="text" 
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  placeholder="Tanyakan pola kerja expert..." 
                  className="w-full bg-[#181a1f] border border-[#222228] rounded-lg py-2 pl-3 pr-9 text-[12px] font-mono text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 transition-colors"
                />
                <button 
                  type="submit" 
                  disabled={!chatInput.trim()}
                  className="absolute right-2 p-1.5 text-zinc-500 hover:text-zinc-300 disabled:opacity-0 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>

        </div>

      </main>
    </div>
  );
}
