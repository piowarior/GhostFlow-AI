'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Terminal, FileCode, CheckCircle, Database, Ghost,
  MessageSquare, Layout, Server, AlertCircle,
  Search, X, Play, Zap, BrainCircuit, Activity, Power, Clock,
  Folder, User, Cpu, Sparkles, ChevronRight, History, Plus, Trash2, Sliders, ToggleLeft, ToggleRight
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
    organization_score?: string;
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
  project_dir: string;
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
  // --- Sessions & History Management (ChatGPT/Gemini-style) ---
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [currentStep, setCurrentStep] = useState(0);

  // Cognitive Telemetry & AI Assistant Switches
  const [isRecording, setIsRecording] = useState(false); // Telemetry On/Off
  const [isAiActive, setIsAiActive] = useState(true);    // AI Mentor On/Off
  const [duration, setDuration] = useState(0);
  const [inTauri, setInTauri] = useState(false);

  // Sesi Baru Modal/Form State
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newMode, setNewMode] = useState<'expert' | 'junior'>('expert');
  const [newProjDir, setNewProjDir] = useState('/home/piowarior/perkuliahan/GhostFlow-AI');

  // Chat/Mentor States
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: `Halo! Saya Ghost Cognitive Mentor. Hubungkan telemetri untuk merekam kegiatan koding Anda secara real-time, atau telusuri reasoning kognitif expert dari riwayat sesi.` }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [geminiKey, setGeminiKey] = useState('');

  const handleSaveGeminiKey = (key: string) => {
    setGeminiKey(key);
    localStorage.setItem('ghostflow_gemini_key', key);
  };

  // Selected session data
  const currentSession = sessions.find(s => s.id === selectedSessionId) || sessions[0];
  const activeActivity = currentSession?.activities[currentStep];

  // AI Insights mapping
  const currentInsight = activeActivity
    ? rawSessionData.ai_analysis.reasoning_insights.find(i => i.target_activity_id === activeActivity.activity_id) || {
      insight: `Analisis AI Mendeteksi aktivitas ${activeActivity.app_class || activeActivity.layout_state?.focused_app} (${activeActivity.activity_type || activeActivity.type}). Ini mencerminkan pola pemecahan masalah ${currentSession.mode === 'expert' ? 'expert terarah & diagnosis bersih' : 'junior - tahap trial-error awal'}.`,
      reasoning_confidence: currentSession.mode === 'expert' ? 0.94 : 0.81
    }
    : null;

  const chatEndRef = useRef<HTMLDivElement>(null);

  // --- Initialize & Load from File System ---
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedKey = localStorage.getItem('ghostflow_gemini_key') || '';
      setGeminiKey(savedKey);
    }
    if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
      setInTauri(true);
      loadAllSessionsFromFileSystem();
      checkTauriStatus();
    } else {
      // Browser static mockup
      const mockBudi: SessionItem = {
        id: 'preloaded-budi-siakad',
        title: 'SIAKAD Web — CORS & PostgreSQL Recovery',
        description: 'Expert: Budi Santoso (Lead Backend)',
        mode: 'expert',
        timestamp: new Date().toISOString(),
        project_dir: '.',
        total_activities: rawSessionData.timeline_activities.length,
        duration_seconds: rawSessionData.session_metadata.duration_seconds,
        activities: rawSessionData.timeline_activities as any[],
        cognitive_signals: {
          fast_file_switch_count: 3,
          research_phase_count: 2,
          retry_pattern_count: 4,
          total_app_switches: 15
        }
      };
      setSessions([mockBudi]);
      setSelectedSessionId('preloaded-budi-siakad');
    }
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // --- Telemetry Polling & Auto-saving to File ---
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording && inTauri && selectedSessionId) {
      interval = setInterval(() => {
        pollLiveTelemetryAndAppend();
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [isRecording, inTauri, selectedSessionId]);

  const loadAllSessionsFromFileSystem = async () => {
    try {
      const files: any[] = await invoke('load_all_sessions');
      if (files && files.length > 0) {
        const loaded: SessionItem[] = files.map((f: any) => ({
          id: f.session_metadata.session_id,
          title: f.session_metadata.title,
          description: f.session_metadata.description || 'Perekaman telemetri kognitif...',
          mode: f.session_metadata.mode as 'expert' | 'junior',
          timestamp: f.session_metadata.created_at,
          project_dir: f.session_metadata.project_dir || '.',
          total_activities: f.timeline_activities.length,
          duration_seconds: f.session_metadata.duration_seconds,
          activities: f.timeline_activities,
          cognitive_signals: f.cognitive_signals
        }));
        const uniqueSessions = loaded.filter(
          (session, index, self) =>
            index === self.findIndex(s => s.id === session.id)
        );

        setSessions(uniqueSessions);
        setSelectedSessionId(loaded[0].id);
      } else {
        // First-time fallback: Save preloaded expert Budi session into the user's directory
        const defaultBudi: SessionItem = {
          id: 'preloaded-budi-siakad',
          title: 'SIAKAD Web — CORS & PostgreSQL Recovery',
          description: 'Expert: Budi Santoso (Lead Backend)',
          mode: 'expert',
          timestamp: new Date().toISOString(),
          project_dir: '.',
          total_activities: rawSessionData.timeline_activities.length,
          duration_seconds: rawSessionData.session_metadata.duration_seconds,
          activities: rawSessionData.timeline_activities as any[],
          cognitive_signals: {
            fast_file_switch_count: 3,
            research_phase_count: 2,
            retry_pattern_count: 4,
            total_app_switches: 15
          }
        };
        setSessions([defaultBudi]);
        setSelectedSessionId('preloaded-budi-siakad');
        saveSessionToDisk(defaultBudi);
      }
    } catch (e) {
      console.error("Gagal load session files:", e);
    }
  };

  const checkTauriStatus = async () => {
    try {
      const status: any = await invoke('get_recording_status');
      setIsRecording(status.is_recording);
      setDuration(status.duration_seconds);
    } catch (e) {
      console.error("Tauri status error:", e);
    }
  };

  // --- Save Session directly into its corresponding JSON file ---
  const saveSessionToDisk = async (session: SessionItem) => {
    if (!inTauri) return;
    try {
      const exportData = {
        session_metadata: {
          session_id: session.id,
          title: session.title,
          description: session.description,
          created_at: session.timestamp,
          ended_at: new Date().toISOString(),
          duration_seconds: session.duration_seconds,
          mode: session.mode,
          project_dir: session.project_dir,
          total_activities: session.activities.length
        },
        desktop_context_summary: {
          os: "Ubuntu",
          active_apps_during_session: Array.from(new Set(session.activities.map(a => a.app_class || 'VS Code')))
        },
        timeline_activities: session.activities,
        cognitive_signals: session.cognitive_signals
      };

      await invoke('save_session_file', {
        title: session.title,
        sessionData: exportData
      });
    } catch (e) {
      console.error("Gagal menyimpan file sesi:", e);
    }
  };

  // --- Poll backend, append new activities, and save them in the same file ---
  const pollLiveTelemetryAndAppend = async () => {
    if (!selectedSessionId) return;
    try {
      const status: any = await invoke('get_recording_status');
      setDuration(status.duration_seconds);

      const newActs: TimelineActivity[] = await invoke('get_live_activities', { offset: 0 });

      setSessions(prev => prev.map(s => {
        if (s.id === selectedSessionId) {
          const updated: SessionItem = {
            ...s,
            total_activities: newActs.length,
            duration_seconds: status.duration_seconds,
            activities: newActs,
            cognitive_signals: status.cognitive_signals
          };
          // Persist the updated session list into the single file
          saveSessionToDisk(updated);
          return updated;
        }
        return s;
      }));

      // Focus latest step automatically only if user is at the end or has no step selected
      if (newActs.length > 0) {
        setCurrentStep(prev => {
          if (prev === -1 || prev === newActs.length - 2 || prev >= newActs.length) {
            return newActs.length - 1;
          }
          return prev;
        });
      }
    } catch (e) {
      console.error("Poll telemetry error:", e);
    }
  };

  // --- Create Manual Session ---
  const handleCreateNewSession = () => {
    if (!newTitle.trim()) {
      alert("Masukkan judul sesi terlebih dahulu!");
      return;
    }

    const newSession: SessionItem = {
      id: `session-${Date.now()}`,
      title: newTitle,
      description: newDesc || `Sesi pencatatan mode ${newMode}`,
      mode: newMode,
      timestamp: new Date().toISOString(),
      project_dir: newProjDir || '.',
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

    setSessions(prev => [newSession, ...prev]);
    setSelectedSessionId(newSession.id);
    setCurrentStep(0);
    saveSessionToDisk(newSession);

    // Reset Form
    setNewTitle('');
    setNewDesc('');
    setNewMode('expert');
    setNewProjDir('.');
    setShowNewSessionModal(false);

    setChatMessages(prev => [...prev, {
      role: 'assistant',
      text: `Sesi Baru "${newTitle}" berhasil dibuat! Aktifkan "Perekaman Telemetri Kognitif" di atas untuk merekam kegiatan koding Anda.`
    }]);
  };

  // --- Delete Session ---
  const handleDeleteSession = async (session: SessionItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Hapus sesi "${session.title}" secara permanen?`)) return;

    try {
      if (inTauri) {
        await invoke('delete_session_file', { title: session.title });
      }
      setSessions(prev => {
        const filtered = prev.filter(s => s.id !== session.id);
        if (filtered.length > 0) {
          setSelectedSessionId(filtered[0].id);
          setCurrentStep(0);
        } else {
          setSelectedSessionId('');
          setCurrentStep(0);
        }
        return filtered;
      });
    } catch (err) {
      console.error("Gagal delete file:", err);
    }
  };

  // --- Toggle Telemetry Recording ON/OFF for current session ---
  const toggleRecording = async () => {
    if (!inTauri) {
      alert("Fitur perekaman telemetri kognitif real-time hanya tersedia di desktop app (Tauri).");
      return;
    }

    if (!currentSession) {
      alert("Pilih atau buat sesi koding terlebih dahulu di sidebar!");
      return;
    }

    try {
      if (isRecording) {
        // STOP - Fetch status and final activities before turning off
        const status: any = await invoke('get_recording_status');
        const finalActs: TimelineActivity[] = await invoke('stop_recording');
        setIsRecording(false);

        setSessions(prev => prev.map(s => {
          if (s.id === selectedSessionId) {
            const updated = {
              ...s,
              total_activities: finalActs.length,
              duration_seconds: status.duration_seconds,
              activities: finalActs,
              cognitive_signals: status.cognitive_signals
            };
            saveSessionToDisk(updated);
            return updated;
          }
          return s;
        }));

        setChatMessages(prev => [...prev, {
          role: 'assistant',
          text: `Pencatatan dihentikan. Seluruh log aktivitas Anda berhasil disimpan di ~/GhostFlow_Data/${currentSession.title.toLowerCase().replace(/[^a-z0-str]/g, '_')}.json`
        }]);
      } else {
        // START
        await invoke('start_recording', {
          mode: currentSession.mode,
          projectDir: currentSession.project_dir
        });
        setIsRecording(true);
        setDuration(0);

        setChatMessages(prev => [...prev, {
          role: 'assistant',
          text: `🔴 Perekam Telemetri AKTIF. Saya mendeteksi posisi & kegiatan Anda di VS Code, Terminal, dan Chrome secara real-time. Silakan mulai koding.`
        }]);
      }
    } catch (e) {
      console.error("Gagal toggling recording:", e);
      alert("Gagal toggling engine: " + e);
    }
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

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;
    setChatMessages(prev => [...prev, { role: 'user', text }]);
    setChatInput('');

    if (geminiKey.trim()) {
      try {
        setChatMessages(prev => [...prev, { role: 'assistant', text: 'Thinking...' }]);

        const systemPrompt = `Anda adalah GhostFlow AI Cognitive Mentor, asisten kognitif cerdas untuk memandu junior developer belajar dari pola kerja senior/expert.
Berikut adalah data aktivitas dari sesi kerja expert saat ini:
Judul Sesi: ${currentSession?.title || "Sesi Tanpa Judul"}
Deskripsi: ${currentSession?.description || "Tidak ada deskripsi"}
Mode: ${currentSession?.mode || "expert"}
Durasi: ${currentSession?.duration_seconds || 0} detik
Aktivitas: ${JSON.stringify((currentSession?.activities || []).map(a => ({
  time: a.timestamp,
  app: a.app_class,
  title: a.window_title,
  type: a.activity_type || a.type,
  details: a.details
})))}

Tugas Anda adalah menjawab pertanyaan user berdasarkan log aktivitas kognitif expert di atas. Jelaskan mengapa expert mengambil tindakan tersebut, pola pikirnya (mindset), kerapian tata letaknya (layout), serta analisis debugging atau risetnya. Jawablah dalam Bahasa Indonesia dengan nada professional, memotivasi, dan edukatif. Jika log kognitif di atas kosong, beri tahu user untuk mengaktifkan telemetri terlebih dahulu.`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `${systemPrompt}\n\nUser: ${text}`
                  }
                ]
              }
            ]
          })
        });

        const data = await response.json();
        const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Maaf, tidak ada respon dari Gemini. Pastikan API Key Anda benar.";

        setChatMessages(prev => {
          const filtered = prev.filter(m => m.text !== 'Thinking...');
          return [...filtered, { role: 'assistant', text: replyText }];
        });
      } catch (err) {
        console.error("Gemini API Error:", err);
        setChatMessages(prev => {
          const filtered = prev.filter(m => m.text !== 'Thinking...');
          return [...filtered, { role: 'assistant', text: "Gagal terhubung ke Gemini API. Silakan cek koneksi internet dan API Key Anda." }];
        });
      }
    } else {
      setTimeout(() => {
        let reply = `Sebagai Mentor Kognitif, saya mendeteksi sesi "${currentSession?.title || "aktif"}" sedang terpilih. (Masukkan Gemini API Key di kanan atas obrolan untuk analisis real-time menggunakan AI model Gemini 1.5 Flash). `;
        
        const actType = activeActivity?.activity_type || activeActivity?.type || "";
        if (actType.includes("resolution") || actType.includes("fix")) {
          reply += `Developer expert mendeteksi error, mencari akar masalahnya, dan melakukan perbaikan cepat pada kode sebelum menjalankan kembali web server. Pola ini efisien karena tidak berputar-putar di satu error.`;
        } else if (actType.includes("code_edit")) {
          reply += `Developer sedang fokus menulis kode di file ${activeActivity?.details?.filename || "sumber"}. Ini adalah tahap kognitif implementasi murni.`;
        } else if (actType.includes("research")) {
          reply += `Riset web dilakukan pada halaman "${activeActivity?.window_title}". Ini memperlihatkan bahwa senior dev aktif memverifikasi dokumentasi untuk menghindari bug implementasi.`;
        } else if (currentSession?.mode === 'expert') {
          reply += `Secara umum, pola kerja expert di sesi ini terstruktur dengan pergantian fokus yang minimal (CPU & mental overhead rendah).`;
        } else {
          reply += `Sesi ini merekam aktivitas pembelajaran awal. Rekomendasi: telusuri riwayat editor dan perhatikan transisi command terminal.`;
        }
        setChatMessages(prev => [...prev, { role: 'assistant', text: reply }]);
      }, 700);
    }
  };

  const transition = { ease: [0.2, 0.8, 0.2, 1] as [number, number, number, number], duration: 0.4 };

  return (
    <div className="min-h-screen h-screen bg-[#0a0a0c] text-zinc-200 font-sans overflow-hidden flex flex-col selection:bg-teal-500/30">

      {/* --- Top Control Bar (Clean Switches) --- */}
      <header className="h-[76px] flex-shrink-0 border-b border-[#222228] bg-[#0a0a0c]/80 backdrop-blur-xl px-6 flex items-center justify-between z-20">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2.5 text-zinc-100">
            <div className="w-9 h-9 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center relative">
              <Ghost className="w-5 h-5 text-teal-400" />
              {isRecording && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full animate-ping"></span>}
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-sm tracking-tight">GhostFlow AI</span>
              <span className="text-[10px] text-zinc-500 font-mono tracking-wider">TELEMETRY ENGINE</span>
            </div>
          </div>
          <div className="h-7 w-[1px] bg-[#222228]"></div>

          {/* SEPARATED SWITCH 1: TELEMETRY POLLER ON/OFF */}
          {currentSession && (
            <div className="flex items-center space-x-4 bg-[#121317] border border-[#222228] p-1.5 rounded-xl shadow-inner">
              <button
                onClick={toggleRecording}
                className={`flex items-center px-4 py-1.5 rounded-lg font-bold text-xs transition-all ${isRecording
                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.1)]'
                    : 'bg-teal-500 text-black hover:bg-teal-400'
                  }`}
              >
                <Power className="w-4 h-4 mr-2" />
                {isRecording ? 'MATIKAN TELEMETRI' : 'AKTIFKAN TELEMETRI'}
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
                    <div className="text-zinc-300 flex items-center"><Clock className="w-3.5 h-3.5 mr-1 text-zinc-500" /> {formatTime(duration)}</div>
                    <div className="text-zinc-600">|</div>
                    <div className="text-teal-400 flex items-center"><Activity className="w-3.5 h-3.5 mr-1 text-teal-500" /> {currentSession?.activities.length || 0} logs</div>
                  </>
                ) : (
                  <div className="text-zinc-500 flex items-center">
                    <div className="w-2 h-2 rounded-full bg-zinc-700 mr-2"></div> TELEMETRI OFF (CPU 0%)
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* SEPARATED SWITCH 2: AI COGNITIVE MENTOR ON/OFF */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3 bg-[#121317] border border-[#222228] p-1.5 rounded-xl">
            <span className="text-xs font-mono text-zinc-400 pl-2">Asisten Kognitif AI</span>
            <button
              onClick={() => setIsAiActive(!isAiActive)}
              className="text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              {isAiActive ? (
                <ToggleRight className="w-8 h-8 text-teal-400 cursor-pointer" />
              ) : (
                <ToggleLeft className="w-8 h-8 text-zinc-600 cursor-pointer" />
              )}
            </button>
          </div>

          <div className="px-3 py-1.5 rounded-lg bg-[#121317] border border-[#222228] flex items-center space-x-2 text-xs font-mono text-zinc-400">
            <Cpu className="w-3.5 h-3.5 text-zinc-500" />
            <span>Ubuntu Wayland • Live File & Process polling</span>
          </div>
        </div>
      </header>

      {/* Workflow DNA Bar at Top */}
      <div className="w-full h-1 flex items-center bg-[#0a0a0c]">
        {currentSession?.activities.map((act, i) => (
          <div key={i} className={`flex-1 h-full transition-all duration-500 ${getPhaseColor(act.phase || 'development', i === currentStep)} mx-[1px] rounded-full ${i === currentStep ? 'opacity-100 shadow-[0_0_8px_rgba(255,255,255,0.3)]' : 'opacity-60'}`}></div>
        ))}
      </div>

      <main className="flex-1 flex overflow-hidden">

        {/* --- Gemini-style Sidebar (RIWAYAT SESI & LANGKAH DETAIL) --- */}
        <div className="w-[300px] flex-shrink-0 border-r border-[#222228] bg-[#0a0a0c] flex flex-col z-10">

          {/* Header Sidebar with "+ Sesi Baru" button */}
          <div className="p-4 border-b border-[#222228] flex items-center justify-between bg-[#0d0e12]">
            <span className="text-xs font-mono text-zinc-400 tracking-wider">RIWAYAT SESI</span>
            <button
              onClick={() => setShowNewSessionModal(true)}
              className="p-1.5 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-teal-500/50 hover:bg-[#181a1f] text-teal-400 transition-all flex items-center justify-center space-x-1.5 font-bold text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Sesi Baru</span>
            </button>
          </div>

          {/* Sesi List Panel */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">

            {sessions.map((s, idx) => {
              const isSelected = s.id === selectedSessionId;
              return (
                <div
                  key={`${s.id}-${idx}`}
                  onClick={() => { setSelectedSessionId(s.id); setCurrentStep(0); }}
                  className={`w-full text-left p-4 rounded-xl flex flex-col transition-all border relative group cursor-pointer ${isSelected
                      ? 'bg-[#181a1f] border-[#333] shadow-md'
                      : 'bg-[#121317]/30 border-[#222228] hover:bg-[#121317]'
                    }`}
                >
                  <button
                    onClick={(e) => handleDeleteSession(s, e)}
                    className="absolute top-3 right-3 text-zinc-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-black/20"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex items-center justify-between mb-2 pr-6">
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${s.mode === 'expert'
                        ? 'bg-teal-500/10 text-teal-400 border-teal-500/20'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      }`}>
                      {s.mode}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {formatTime(s.duration_seconds)}
                    </span>
                  </div>

                  <h3 className={`text-[13px] font-semibold leading-snug mb-1 ${isSelected ? 'text-zinc-200' : 'text-zinc-400'}`}>
                    {s.title}
                  </h3>

                  <p className="text-[11px] text-zinc-500 line-clamp-2 leading-relaxed">
                    {s.description}
                  </p>

                  {isSelected && s.activities.length > 0 && (
                    <div className="mt-3.5 pt-3 border-t border-[#222228] space-y-1.5 max-h-48 overflow-y-auto scrollbar-hide">
                      <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1.5 font-bold">Langkah Aktivitas</div>
                      {s.activities.map((act, i) => (
                        <div
                          key={act.activity_id}
                          onClick={(e) => { e.stopPropagation(); setCurrentStep(i); }}
                          className={`px-2.5 py-1.5 rounded font-mono text-[11px] flex items-center justify-between transition-colors ${currentStep === i
                              ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
                              : 'hover:bg-black/30 text-zinc-500'
                            }`}
                        >
                          <span className="truncate pr-2">{act.window_title || act.description}</span>
                          <span className="text-[9px] text-zinc-600 flex-shrink-0">
                            {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

          </div>
        </div>

        {/* --- Center Morphic Inspector --- */}
        <div className="flex-1 bg-[#0f1115] p-8 flex flex-col overflow-y-auto scrollbar-hide">

          {currentSession ? (
            <>
              <div className="flex items-center justify-between mb-6 flex-shrink-0">
                <div className="flex flex-col">
                  <h2 className="text-lg font-medium text-zinc-100 flex items-center">
                    Morphic Workspace Inspector
                    {activeActivity && (
                      <span className="ml-4 px-2.5 py-0.5 text-[10px] bg-[#181a1f] text-zinc-400 rounded-lg border border-[#2a2a32] font-mono">
                        {activeActivity.activity_type || activeActivity.type || 'IDLE'}
                      </span>
                    )}
                  </h2>
                  <p className="text-[12px] text-zinc-500 mt-1 font-mono">{currentSession.title} ({currentSession.activities.length} logs)</p>
                  <p>hallo test</p>
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

                          {isRecording && (
                            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping"></span>
                          )}
                        </div>

                        <h3 className="text-xl font-medium text-zinc-100 mb-2">{activeActivity.app_class || activeActivity.layout_state?.focused_app || 'Application View'}</h3>
                        <p className="text-zinc-400 mb-8 text-[13px] leading-relaxed font-mono max-w-md">{activeActivity.window_title || activeActivity.description}</p>

                        <div className="w-full bg-[#121317] rounded-xl p-5 text-left border border-[#222228] shadow-inner font-mono text-[13px]">
                          <div className="text-[10px] text-zinc-500 mb-4 font-bold uppercase tracking-wider">Live Metrics Data</div>

                          <div className="grid grid-cols-2 gap-4 text-zinc-300">
                            <div className="flex items-center"><Activity className="w-4 h-4 mr-2 text-amber-500/70" /> Type: {activeActivity.activity_type || activeActivity.type}</div>
                            <div className="flex items-center"><Clock className="w-4 h-4 mr-2 text-zinc-500" /> Duration: {activeActivity.duration_ms ? `${(activeActivity.duration_ms / 1000).toFixed(1)}s` : 'Background'}</div>
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
                    <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 font-mono text-sm border border-dashed border-[#222228] rounded-2xl p-8 text-center">
                      <Folder className="w-12 h-12 text-zinc-800 mb-4" />
                      {currentSession.activities.length === 0 ? (
                        <span>
                          Sesi ini masih kosong.<br />
                          Nyalakan <b>"Perekaman Telemetri Kognitif"</b> di bagian atas untuk merekam kegiatan koding Anda secara real-time.
                        </span>
                      ) : (
                        <span>Tidak ada langkah aktivitas yang terpilih. Silakan klik salah satu baris di sidebar.</span>
                      )}
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 font-mono text-sm border border-dashed border-[#222228] rounded-2xl p-8 text-center">
              <Sparkles className="w-12 h-12 text-zinc-800 mb-4" />
              <span>
                Tidak ada sesi aktif.<br />
                Silakan klik tombol <b>"+ Sesi Baru"</b> di sidebar kiri untuk membuat sesi pencatatan koding!
              </span>
            </div>
          )}

        </div>

        {/* --- Right Cognitive Advisor Panel (Fully Optional AI Switch) --- */}
        <div className="w-[320px] flex-shrink-0 border-l border-[#222228] bg-[#0a0a0c] flex flex-col hidden lg:flex z-10">

          <AnimatePresence mode="wait">
            {isAiActive ? (
              <motion.div
                key="ai-active"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
                className="flex-1 flex flex-col overflow-hidden"
              >
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

                  {activeActivity ? (
                    <div className="space-y-5">
                      {/* Mindset Analysis */}
                      <div className="space-y-1.5">
                        <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-mono">Pola Pikir Developer</span>
                        <div className="flex items-center space-x-2">
                          {(() => {
                            let badgeColor = "bg-teal-500/10 text-teal-400 border-teal-500/20";
                            let icon = <BrainCircuit className="w-3.5 h-3.5" />;
                            let text = "Coding Mode";
                            
                            const actType = activeActivity.activity_type || activeActivity.type || "";
                            if (actType.includes("research")) {
                              badgeColor = "bg-sky-500/10 text-sky-400 border-sky-500/20";
                              icon = <Search className="w-3.5 h-3.5" />;
                              text = "Riset & Analisis";
                            } else if (actType.includes("terminal")) {
                              badgeColor = "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
                              icon = <Terminal className="w-3.5 h-3.5" />;
                              text = "Runtime & Debug";
                            } else if (actType.includes("document")) {
                              badgeColor = "bg-amber-500/10 text-amber-400 border-amber-500/20";
                              icon = <Clock className="w-3.5 h-3.5" />;
                              text = "Analisis Spesifikasi";
                            } else if (actType.includes("resolution") || actType.includes("fix")) {
                              badgeColor = "bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.05)]";
                              icon = <AlertCircle className="w-3.5 h-3.5 animate-pulse" />;
                              text = "Pemecahan Masalah (Fix)";
                            }
                            
                            return (
                              <div className={`px-2.5 py-1 rounded border font-mono text-[11px] flex items-center space-x-1.5 ${badgeColor}`}>
                                {icon}
                                <span>{text}</span>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Layout Organization Score */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-[9px] text-zinc-500 uppercase tracking-widest font-mono">
                          <span>Kerapian Tata Letak</span>
                          <span className={
                            activeActivity.layout_state?.organization_score?.includes("Acak-acakan") 
                            ? "text-rose-400" 
                            : "text-teal-400"
                          }>
                            {activeActivity.layout_state?.organization_score || "Teratur"}
                          </span>
                        </div>
                        {(() => {
                          const org = activeActivity.layout_state?.organization_score || "";
                          let percent = 100;
                          let barColor = "bg-teal-500";
                          if (org.includes("Acak-acakan")) {
                            percent = 45;
                            barColor = "bg-rose-500";
                          } else if (org.includes("Split-Screen")) {
                            percent = 90;
                            barColor = "bg-indigo-400";
                          }
                          return (
                            <div className="space-y-1">
                              <div className="w-full bg-[#121317] h-2 rounded-full overflow-hidden border border-[#222228]">
                                <div className={`h-full ${barColor} rounded-full`} style={{ width: `${percent}%` }}></div>
                              </div>
                              <span className="text-[10px] text-zinc-500 leading-relaxed font-mono">
                                {org.includes("Acak-acakan") 
                                  ? "Workspace tumpang tindih. Fokus terdistorsi oleh tumpukan window."
                                  : org.includes("Split-Screen")
                                  ? "Tata letak side-by-side terstruktur. Mempercepat integrasi referensi."
                                  : "Fokus penuh satu window. Efektif untuk coding intensif."}
                              </span>
                            </div>
                          );
                        })()}
                      </div>

                      {/* AI Mentor Mentoring */}
                      <div className="space-y-1.5">
                        <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-mono">Penjelasan Kognitif AI</span>
                        <div className="text-zinc-300 text-[12px] leading-relaxed font-mono bg-[#121317]/50 border border-[#222228] p-3.5 rounded-xl">
                          {(() => {
                            const actType = activeActivity.activity_type || activeActivity.type || "";
                            const app = activeActivity.app_class || activeActivity.layout_state?.focused_app || "";
                            const title = activeActivity.window_title || activeActivity.description || "";
                            
                            if (actType.includes("document")) {
                              return `Senior developer sedang membuka dokumen spesifikasi. Ini menunjukkan tindakan terencana untuk memahami requirement fungsionalitas sebelum melakukan perubahan kode, menghindari trial-and-error yang sia-sia.`;
                            } else if (actType.includes("resolution") || actType.includes("fix")) {
                              return `Sistem mendeteksi pemecahan masalah kognitif! Developer menemui error di logs server, membuka Chrome untuk menganalisis, mengedit file konfigurasi/sumber kode, dan berhasil membetulkan kesalahan tersebut secara instan.`;
                            } else if (actType.includes("code_edit")) {
                              return `Mengedit berkas kode aktif di editor ${app}. Tindakan ini difokuskan pada implementasi baris instruksi baru. Pola perubahan terdeteksi sebagai kontribusif.`;
                            } else if (actType.includes("terminal")) {
                              return `Melakukan eksekusi terminal shell. Developer sedang memantau output compiler atau me-restart runtime web server untuk meninjau perubahan terbaru.`;
                            } else if (actType.includes("research")) {
                              return `Sedang melakukan pencarian referensi teknis di browser. Membaca dokumentasi API untuk memverifikasi sintaksis atau parameter fungsi yang dibutuhkan.`;
                            }
                            return `Developer berinteraksi dengan ${app} (${title}). Pola tindakan teratur dan terarah dalam sesi ${currentSession.mode}.`;
                          })()}
                        </div>
                      </div>

                      {/* Document References / Edited File */}
                      <div className="space-y-1.5 pt-2 border-t border-[#222228]">
                        <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-mono">Sumber Rujukan / Berkas</span>
                        <div className="bg-[#121317] border border-[#222228] p-3 rounded-lg flex items-center justify-between">
                          <div className="flex items-center space-x-2 truncate">
                            {activeActivity.activity_type?.includes("document") ? (
                              <FileCode className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                            ) : (
                              <FileCode className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" />
                            )}
                            <span className="text-[11px] font-mono text-zinc-300 truncate">
                              {(() => {
                                const details = activeActivity.details;
                                if (details && details.filename) return details.filename;
                                if (details && details.document_name) return details.document_name;
                                if (details && details.document_title) return details.document_title;
                                if (details && details.tab_title) return details.tab_title;
                                return "Tidak ada berkas spesifik";
                              })()}
                            </span>
                          </div>
                          <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider pl-2 flex-shrink-0">
                            {activeActivity.activity_type?.includes("document") ? "DOCS" : "CODE"}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-zinc-600 p-6 border border-dashed border-[#222228] rounded-xl font-mono text-center">
                      <span className="text-[11px]">Pilih langkah aktivitas koding untuk melahirkan reasoning kognitif AI.</span>
                    </div>
                  )}
                </div>

                {/* Assistant Chatbot interface */}
                <div className="h-[40%] bg-[#0f1115] flex flex-col">
                  <div className="px-4 py-2 border-b border-[#222228] flex items-center bg-[#121317] justify-between flex-shrink-0">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center">
                      <MessageSquare className="w-3.5 h-3.5 mr-2 text-zinc-500" />
                      Cognitive Chat
                    </span>
                    <input
                      type="password"
                      value={geminiKey}
                      onChange={e => handleSaveGeminiKey(e.target.value)}
                      placeholder="Gemini API Key..."
                      className="bg-[#181a1f] border border-[#222228] rounded py-1 px-2 text-[9px] font-mono text-zinc-400 focus:outline-none focus:border-teal-500/50 w-32"
                    />
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] p-3 text-[12px] leading-relaxed rounded-xl ${msg.role === 'user'
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
              </motion.div>
            ) : (
              <motion.div
                key="ai-inactive"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
                className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-600 font-mono text-xs"
              >
                <Sparkles className="w-12 h-12 text-zinc-800 mb-4" />
                <span>
                  Asisten Kognitif AI Nonaktif.<br /><br />
                  Aktifkan switch <b>"Asisten Kognitif AI"</b> di kanan atas untuk menyalakan cognitive reasoning, signals, dan chatbot mentor.
                </span>
              </motion.div>
            )}
          </AnimatePresence>

        </div>

      </main>

      {/* --- MANUAL NEW SESSION CREATION MODAL --- */}
      <AnimatePresence>
        {showNewSessionModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={transition}
              className="bg-[#0f1115] border border-[#222228] rounded-2xl max-w-md w-full p-6 shadow-2xl relative"
            >
              <button
                onClick={() => setShowNewSessionModal(false)}
                className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <h3 className="text-base font-semibold text-zinc-100 mb-6 flex items-center">
                <Plus className="w-5 h-5 text-teal-400 mr-2" />
                Buat Sesi Kerja Baru
              </h3>

              <div className="space-y-4 font-mono text-xs">
                <div>
                  <label className="block text-zinc-500 mb-1.5">JUDUL SESI</label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    placeholder="Contoh: Web E-Commerce - Payment Gateway"
                    className="w-full bg-[#181a1f] border border-[#222228] rounded-lg py-2 px-3 text-zinc-200 focus:outline-none focus:border-zinc-600 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-zinc-500 mb-1.5">DESKRIPSI SINGKAT</label>
                  <textarea
                    value={newDesc}
                    onChange={e => setNewDesc(e.target.value)}
                    placeholder="Contoh: Mengerjakan checkout API menggunakan Midtrans"
                    rows={3}
                    className="w-full bg-[#181a1f] border border-[#222228] rounded-lg py-2 px-3 text-zinc-200 focus:outline-none focus:border-zinc-600 transition-colors resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-zinc-500 mb-1.5">MODE SESI</label>
                    <select
                      value={newMode}
                      onChange={e => setNewMode(e.target.value as 'expert' | 'junior')}
                      className="w-full bg-[#181a1f] border border-[#222228] rounded-lg py-2 px-3 text-zinc-200 focus:outline-none focus:border-zinc-600 cursor-pointer"
                    >
                      <option value="expert">Expert Mode</option>
                      <option value="junior">Junior Mode</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-zinc-500 mb-1.5">WORKSPACE DIRECTORY</label>
                    <input
                      type="text"
                      value={newProjDir}
                      onChange={e => setNewProjDir(e.target.value)}
                      placeholder="Folder Path (default: .)"
                      className="w-full bg-[#181a1f] border border-[#222228] rounded-lg py-2 px-3 text-zinc-200 focus:outline-none focus:border-zinc-600 transition-colors"
                    />
                  </div>
                </div>

                <div className="pt-4 flex space-x-3 justify-end">
                  <button
                    onClick={() => setShowNewSessionModal(false)}
                    className="px-4 py-2 border border-[#222228] text-zinc-400 hover:text-zinc-200 rounded-lg"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleCreateNewSession}
                    className="px-4 py-2 bg-teal-500 text-black hover:bg-teal-400 font-bold rounded-lg transition-colors"
                  >
                    Buat Sesi
                  </button>
                </div>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
