'use client';
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import {
  User, ChevronRight, Plus, Trash2, X, BrainCircuit, Sparkles,
  Ghost, Power, Clock, Activity, MessageSquare, Folder,
  ToggleLeft, ToggleRight, CheckCircle, ExternalLink
} from 'lucide-react';
import StarConstellationView from './StarConstellationView';
import FloatingHintSidebar from './FloatingHintSidebar';

// ─── Types ───
type TimelineActivity = {
  activity_id: string; timestamp: string; phase?: string; type?: string;
  activity_type?: string; description?: string; app_class?: string;
  window_title?: string; layout_state?: any; details?: any; duration_ms?: number;
};

type ExpertSession = {
  id: string; title: string; description: string; expertName: string;
  mode: string; timestamp: string; activities: TimelineActivity[];
  duration_seconds: number; cognitive_signals: any;
};

type JuniorSession = {
  id: string; title: string; description: string;
  timestamp: string; project_dir: string;
  activities: TimelineActivity[]; duration_seconds: number;
  cognitive_signals: any; matchedExpertId?: string;
};

type Hint = { id: string; message: string; expertName?: string; sessionTitle?: string; type: 'match' | 'guide' | 'external'; };

type Props = {
  inTauri: boolean;
  geminiKey: string;
  isRecording: boolean;
  duration: number;
  onToggleRecording: () => void;
  juniorSessions: JuniorSession[];
  setJuniorSessions: React.Dispatch<React.SetStateAction<JuniorSession[]>>;
  selectedJuniorSessionId: string;
  setSelectedJuniorSessionId: (id: string) => void;
};

const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

export default function JuniorDashboard({
  inTauri, geminiKey, isRecording, duration, onToggleRecording,
  juniorSessions, setJuniorSessions, selectedJuniorSessionId, setSelectedJuniorSessionId,
}: Props) {
  const [exportedExperts, setExportedExperts] = useState<ExpertSession[]>([]);
  const [selectedExpertId, setSelectedExpertId] = useState<string>('');
  const [selectedExpertSession, setSelectedExpertSession] = useState<ExpertSession | null>(null);

  const [isAiActive, setIsAiActive] = useState(false);
  const [hints, setHints] = useState<Hint[]>([]);
  const [aiMatchResult, setAiMatchResult] = useState<string>('');
  const [isMatchLoading, setIsMatchLoading] = useState(false);

  // New session modal
  const [showModal, setShowModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newProjDir, setNewProjDir] = useState('/home/piowarior/perkuliahan');

  // Chat
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: 'Halo Junior! Saya Ghost Cognitive Assistant. Aktifkan Cognitive Assistant dan pilih sesi Expert untuk mendapatkan panduan.' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const currentJunior = juniorSessions.find(s => s.id === selectedJuniorSessionId);
  const uniqueExperts = Array.from(new Map(exportedExperts.map(s => [s.expertName, s])).keys());

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Load exported expert sessions
  useEffect(() => {
    loadExportedSessions();
  }, [inTauri]);

  const loadExportedSessions = async () => {
    try {
      let loaded: ExpertSession[] = [];
      if (inTauri) {
        const files: any[] = await invoke('load_exported_sessions');
        loaded = files.map((f: any) => ({
          id: f.session_metadata?.session_id || `session-${Date.now()}`,
          title: f.session_metadata?.title || 'Untitled Exported Session',
          description: f.session_metadata?.description || '',
          expertName: f.session_metadata?.expert_name || 'Expert',
          mode: f.session_metadata?.mode || 'expert',
          timestamp: f.session_metadata?.created_at || new Date().toISOString(),
          duration_seconds: f.session_metadata?.duration_seconds || 0,
          activities: f.timeline_activities || [],
          cognitive_signals: f.cognitive_signals || {},
        }));
      }
      // Also load from localStorage
      const stored = localStorage.getItem('ghostflow_exports');
      if (stored) {
        const fromStorage: ExpertSession[] = JSON.parse(stored);
        loaded = [...loaded, ...fromStorage].filter((s, i, arr) => arr.findIndex(x => x.id === s.id) === i);
      }
      setExportedExperts(loaded);
    } catch (e) {
      console.error('Failed to load exported sessions:', e);
    }
  };

  const handleCreateJuniorSession = () => {
    if (!newTitle.trim()) { alert('Masukkan judul sesi terlebih dahulu!'); return; }
    const ns: JuniorSession = {
      id: `junior-${Date.now()}`,
      title: newTitle, description: newDesc || 'Sesi belajar junior',
      timestamp: new Date().toISOString(),
      project_dir: newProjDir || '.',
      activities: [], duration_seconds: 0,
      cognitive_signals: { fast_file_switch_count: 0, research_phase_count: 0, retry_pattern_count: 0, total_app_switches: 0 },
    };
    setJuniorSessions(prev => [ns, ...prev]);
    setSelectedJuniorSessionId(ns.id);
    setShowModal(false);
    setNewTitle(''); setNewDesc(''); setNewProjDir('.');
    setChatMessages(prev => [...prev, {
      role: 'assistant',
      text: `Sesi "${ns.title}" dibuat! Aktifkan Cognitive Assistant untuk mendapatkan panduan dari Expert.`
    }]);
  };

  const handleDeleteJuniorSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Hapus sesi ini?')) return;
    setJuniorSessions(prev => {
      const filtered = prev.filter(s => s.id !== id);
      setSelectedJuniorSessionId(filtered[0]?.id || '');
      return filtered;
    });
  };

  // AI Expert Match
  const runExpertMatching = async () => {
    if (!geminiKey || !currentJunior || exportedExperts.length === 0) return;
    setIsMatchLoading(true);
    try {
      const expertSummaries = exportedExperts.map(e => ({
        id: e.id, title: e.title, expertName: e.expertName,
        description: e.description,
        activities_count: e.activities.length,
        activity_types: [...new Set(e.activities.map(a => a.activity_type || a.type))],
      }));

      const prompt = `Kamu adalah GhostFlow AI. Junior developer sedang mengerjakan sesi: "${currentJunior.title}" — "${currentJunior.description}".

Berikut adalah daftar session Expert yang sudah di-export:
${JSON.stringify(expertSummaries, null, 2)}

Tentukan:
1. Apakah ada sesi Expert yang cocok? (berdasarkan topik/judul/tipe aktivitas)
2. Jika ada: sebutkan nama expert, judul sesi, dan jelaskan mengapa cocok dalam 2 kalimat.
3. Jika tidak ada: beri saran umum dengan label "External Knowledge" — bukan dari database expert.

Format respons: JSON dengan field: matched (boolean), expert_name (string|null), session_title (string|null), reasoning (string), hint (string — kalimat coaching pendek untuk Junior, max 2 kalimat).`;

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const data = await res.json();
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text 
        || (data.error?.message ? `Error Gemini: ${data.error.message}` : '');
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      
      let parsed = null;
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (e) {
          console.error("AI JSON Parse Error:", e);
        }
      }

      if (parsed) {
        setAiMatchResult(parsed.reasoning || '');
        const newHint: Hint = {
          id: `hint-${Date.now()}`,
          message: parsed.hint || parsed.reasoning,
          expertName: parsed.expert_name || undefined,
          sessionTitle: parsed.session_title || undefined,
          type: parsed.matched ? 'match' : 'external',
        };
        setHints(prev => [newHint, ...prev].slice(0, 5));
        setChatMessages(prev => [...prev, { role: 'assistant', text: `🧠 ${parsed.reasoning}` }]);

        // Emit to Tauri hint window
        if (inTauri) {
          try {
            await invoke('show_hint_window');
            await invoke('send_hint_to_overlay', { hint: newHint });
          } catch (e) {
            console.error('Failed to send overlay hint:', e);
          }
        }

        // If matched, set the expert session in view
        if (parsed.matched && parsed.expert_name) {
          const matchedSession = exportedExperts.find(e =>
            e.expertName === parsed.expert_name && e.title === parsed.session_title
          );
          if (matchedSession) {
            setSelectedExpertSession(matchedSession);
            setSelectedExpertId(matchedSession.expertName);
          }
        }
      } else {
        // Fallback if AI didn't return JSON
        setAiMatchResult("AI merespon tanpa format terstruktur.");
        setChatMessages(prev => [...prev, { role: 'assistant', text: `🧠 ${raw}` }]);
      }
    } catch (err) {
      console.error('AI matching error:', err);
    }
    setIsMatchLoading(false);
  };

  const handleToggleAi = async () => {
    const nextState = !isAiActive;
    setIsAiActive(nextState);
    if (nextState && inTauri) {
      try {
        await invoke('show_hint_window');
      } catch (e) {
        console.error('Failed to open hint window:', e);
      }
    }
  };

  // Auto-run matching when AI activated with a session
  useEffect(() => {
    if (isAiActive && currentJunior && geminiKey && exportedExperts.length > 0) {
      runExpertMatching();
    }
  }, [isAiActive, selectedJuniorSessionId]);

  const handleChat = async (text: string) => {
    if (!text.trim()) return;
    setChatMessages(prev => [...prev, { role: 'user', text }]);
    setChatInput('');

    if (!geminiKey) {
      setChatMessages(prev => [...prev, { role: 'assistant', text: 'Masukkan Gemini API Key di panel Expert untuk mengaktifkan AI.' }]);
      return;
    }

    const context = selectedExpertSession
      ? `Expert "${selectedExpertSession.expertName}" dengan sesi "${selectedExpertSession.title}" memiliki ${selectedExpertSession.activities.length} aktivitas.`
      : 'Belum ada expert session yang dipilih.';

    const prompt = `Kamu adalah GhostFlow Junior Cognitive Assistant. ${context}

Junior bertanya: "${text}"

Jawab dalam Bahasa Indonesia, profesional dan memotivasi. Jika ada data expert, gunakan untuk memberi panduan spesifik.`;

    try {
      setChatMessages(prev => [...prev, { role: 'assistant', text: '...' }]);
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const data = await res.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text 
        || (data.error?.message ? `Error Gemini: ${data.error.message}` : 'Tidak ada respons.');
      setChatMessages(prev => [...prev.filter(m => m.text !== '...'), { role: 'assistant', text: reply }]);
    } catch (err: any) {
      setChatMessages(prev => [...prev.filter(m => m.text !== '...'), { role: 'assistant', text: `Gagal terhubung ke Gemini API: ${err.message || err}` }]);
    }
  };

  const expertsByName = uniqueExperts.reduce<Record<string, ExpertSession[]>>((acc, name) => {
    acc[name] = exportedExperts.filter(s => s.expertName === name);
    return acc;
  }, {});

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* ── Left Sidebar: Expert Picker ── */}
      <div className="w-[280px] flex-shrink-0 border-r border-[#222228] bg-[#0a0a0c] flex flex-col">
        <div className="p-4 border-b border-[#222228] bg-[#0d0e12]">
          <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest block mb-3">Pilih Expert</span>
          {uniqueExperts.length === 0 ? (
            <p className="text-[11px] text-zinc-600 font-mono">Belum ada expert yang export sesi. Minta expert klik "Export Session".</p>
          ) : (
            <div className="space-y-1">
              {uniqueExperts.map(name => (
                <button key={name}
                  onClick={() => setSelectedExpertId(selectedExpertId === name ? '' : name)}
                  className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 text-[12px] font-mono transition-all ${selectedExpertId === name ? 'bg-violet-500/15 text-violet-300 border border-violet-500/30' : 'text-zinc-400 hover:bg-[#121317] border border-transparent'}`}
                >
                  <User className="w-3.5 h-3.5 flex-shrink-0" /> {name}
                  <span className="ml-auto text-[9px] text-zinc-600">{expertsByName[name]?.length || 0} sesi</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Expert sessions list */}
        {selectedExpertId && expertsByName[selectedExpertId] && (
          <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-hide">
            <span className="text-[9px] text-zinc-600 uppercase tracking-widest font-mono">Sesi Expert</span>
            {expertsByName[selectedExpertId].map(s => (
              <div key={s.id}
                onClick={() => setSelectedExpertSession(selectedExpertSession?.id === s.id ? null : s)}
                className={`p-3 rounded-xl cursor-pointer border transition-all ${selectedExpertSession?.id === s.id ? 'bg-violet-500/10 border-violet-500/30' : 'bg-[#121317]/50 border-[#222228] hover:bg-[#121317]'}`}
              >
                <p className={`text-[12px] font-semibold ${selectedExpertSession?.id === s.id ? 'text-violet-200' : 'text-zinc-400'}`}>{s.title}</p>
                <p className="text-[10px] text-zinc-600 font-mono mt-0.5">{s.activities.length} aktivitas • {formatTime(s.duration_seconds)}</p>
              </div>
            ))}
          </div>
        )}

        {/* Junior sessions */}
        <div className="border-t border-[#222228] p-3 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-mono">Sesi Saya</span>
            <button onClick={() => setShowModal(true)} className="p-1 text-teal-400 hover:text-teal-300 rounded border border-[#222228] hover:border-teal-500/30">
              <Plus className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto scrollbar-hide">
            {juniorSessions.map(s => (
              <div key={s.id} onClick={() => setSelectedJuniorSessionId(s.id)}
                className={`group flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer text-[11px] font-mono transition-all ${selectedJuniorSessionId === s.id ? 'bg-teal-500/10 text-teal-300 border border-teal-500/20' : 'text-zinc-500 hover:text-zinc-300 hover:bg-[#121317]'}`}
              >
                <span className="flex-1 truncate">{s.title}</span>
                <button onClick={e => handleDeleteJuniorSession(s.id, e)} className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-rose-400">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Center: Star Constellation ── */}
      <div className="flex-1 bg-[#0a0a0c] p-6 flex flex-col overflow-hidden">
        {/* Controls */}
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div>
            <h2 className="text-base font-medium text-zinc-100">
              {selectedExpertSession
                ? `${selectedExpertSession.expertName} — ${selectedExpertSession.title}`
                : currentJunior ? `Sesi: ${currentJunior.title}` : 'Pilih Sesi'}
            </h2>
            <p className="text-[11px] text-zinc-600 font-mono mt-0.5">
              {selectedExpertSession
                ? `${selectedExpertSession.activities.length} aktivitas expert`
                : 'Pilih sesi expert dari sidebar atau buat sesi baru'}
            </p>
          </div>

          {/* Cognitive Toggle (Junior only) */}
          <div className="flex items-center gap-3 bg-[#121317] border border-[#222228] p-2 rounded-xl">
            <span className="text-[10px] font-mono text-zinc-400">Cognitive Assistant</span>
            <button onClick={handleToggleAi}>
              {isAiActive
                ? <ToggleRight className="w-7 h-7 text-violet-400 cursor-pointer" />
                : <ToggleLeft className="w-7 h-7 text-zinc-600 cursor-pointer" />}
            </button>
            {isMatchLoading && <span className="text-[9px] font-mono text-violet-400 animate-pulse">Mencocokkan...</span>}
          </div>
        </div>

        {/* AI Match Banner */}
        <AnimatePresence>
          {aiMatchResult && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mb-4 p-3 bg-violet-500/10 border border-violet-500/20 rounded-xl flex items-start gap-3 flex-shrink-0">
              <BrainCircuit className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />
              <p className="text-[12px] text-zinc-300 font-mono leading-relaxed flex-1">{aiMatchResult}</p>
              <button onClick={() => setAiMatchResult('')}><X className="w-3.5 h-3.5 text-zinc-600" /></button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Star Constellation */}
        <div className="flex-1 min-h-0">
          <StarConstellationView
            activities={selectedExpertSession?.activities || currentJunior?.activities || []}
            sessionTitle={selectedExpertSession?.title || currentJunior?.title || ''}
            expertName={selectedExpertSession?.expertName}
            geminiKey={geminiKey}
          />
        </div>
      </div>

      {/* ── Right Panel: Chat ── */}
      <div className="w-[300px] flex-shrink-0 border-l border-[#222228] bg-[#0a0a0c] flex flex-col">
        <div className="p-4 border-b border-[#222228] bg-[#0d0e12] flex items-center justify-between">
          <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest flex items-center gap-2">
            <MessageSquare className="w-3.5 h-3.5" /> Junior Chat
          </span>
          <span className="text-[9px] font-mono text-zinc-600">
            {isAiActive ? <span className="text-violet-400">AI ON</span> : 'AI OFF'}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
          {chatMessages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] p-3 text-[12px] leading-relaxed rounded-xl font-mono ${msg.role === 'user' ? 'bg-violet-950/30 border border-violet-500/20 text-violet-100' : 'bg-[#181a1f] border border-[#222228] text-zinc-400'}`}>
                {msg.text}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <div className="p-3 border-t border-[#222228] bg-[#121317]">
          <form onSubmit={e => { e.preventDefault(); handleChat(chatInput); }} className="relative flex items-center">
            <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
              placeholder="Tanya ke Junior AI..." className="w-full bg-[#181a1f] border border-[#222228] rounded-lg py-2 pl-3 pr-9 text-[12px] font-mono text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-600" />
            <button type="submit" disabled={!chatInput.trim()} className="absolute right-2 text-zinc-500 hover:text-zinc-300 disabled:opacity-0">
              <ChevronRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Floating Hint Sidebar */}
      <FloatingHintSidebar hints={hints} onDismiss={id => setHints(prev => prev.filter(h => h.id !== id))} isActive={isAiActive} />

      {/* New Session Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0f1115] border border-[#222228] rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
              <button onClick={() => setShowModal(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-200"><X className="w-4 h-4" /></button>
              <h3 className="text-base font-semibold text-zinc-100 mb-5 flex items-center gap-2"><Plus className="w-5 h-5 text-teal-400" />Buat Sesi Belajar Junior</h3>
              <div className="space-y-4 font-mono text-xs">
                <div>
                  <label className="block text-zinc-500 mb-1.5">JUDUL SESI</label>
                  <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Contoh: Membuat Company Profile" className="w-full bg-[#181a1f] border border-[#222228] rounded-lg py-2 px-3 text-zinc-200 focus:outline-none focus:border-zinc-600" />
                </div>
                <div>
                  <label className="block text-zinc-500 mb-1.5">DESKRIPSI</label>
                  <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={2} placeholder="Apa yang ingin kamu pelajari?" className="w-full bg-[#181a1f] border border-[#222228] rounded-lg py-2 px-3 text-zinc-200 focus:outline-none focus:border-zinc-600 resize-none" />
                </div>
                <div>
                  <label className="block text-zinc-500 mb-1.5">WORKSPACE DIRECTORY</label>
                  <input value={newProjDir} onChange={e => setNewProjDir(e.target.value)} className="w-full bg-[#181a1f] border border-[#222228] rounded-lg py-2 px-3 text-zinc-200 focus:outline-none focus:border-zinc-600" />
                </div>
                <div className="pt-2 flex gap-3 justify-end">
                  <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-[#222228] text-zinc-400 rounded-lg hover:text-zinc-200">Batal</button>
                  <button onClick={handleCreateJuniorSession} className="px-4 py-2 bg-teal-500 text-black font-bold rounded-lg hover:bg-teal-400">Buat Sesi</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
