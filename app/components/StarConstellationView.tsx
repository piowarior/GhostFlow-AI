'use client';
import React, { useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { FileCode, Terminal, Search, Server, Activity, GitBranch, Layout, X, ZoomIn, ZoomOut, RotateCcw, BrainCircuit, Sparkles } from 'lucide-react';

type Activity = {
  activity_id: string;
  timestamp: string;
  phase?: string;
  type?: string;
  activity_type?: string;
  description?: string;
  app_class?: string;
  window_title?: string;
  layout_state?: any;
  details?: any;
  duration_ms?: number;
};

type Props = {
  activities: Activity[];
  sessionTitle: string;
  expertName?: string;
  geminiKey?: string;
};

const PHASE_COLORS: Record<string, string> = {
  discovery: '#38bdf8',
  development: '#818cf8',
  debug: '#f87171',
  ship: '#34d399',
  default: '#fbbf24',
};

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  'VS Code': <FileCode className="w-3 h-3" />,
  'Antigravity': <FileCode className="w-3 h-3" />,
  'Cursor IDE': <FileCode className="w-3 h-3" />,
  'Terminal': <Terminal className="w-3 h-3" />,
  'Google Chrome': <Search className="w-3 h-3" />,
  'Microsoft Edge': <Search className="w-3 h-3" />,
  'Firefox': <Search className="w-3 h-3" />,
  'Docker': <Server className="w-3 h-3" />,
  'Git': <GitBranch className="w-3 h-3" />,
  'Figma': <Layout className="w-3 h-3" />,
};

function getStarPositions(count: number, width: number, height: number) {
  const positions: { x: number; y: number }[] = [];
  const cols = Math.ceil(Math.sqrt(count * 1.6));
  const rows = Math.ceil(count / cols);
  const cellW = (width - 80) / cols;
  const cellH = (height - 80) / rows;

  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const jitterX = (Math.sin(i * 7.3) * 0.35) * cellW;
    const jitterY = (Math.cos(i * 3.7) * 0.35) * cellH;
    positions.push({
      x: 40 + col * cellW + cellW / 2 + jitterX,
      y: 40 + row * cellH + cellH / 2 + jitterY,
    });
  }
  return positions;
}

function getPhaseColor(phase?: string, actType?: string) {
  if (phase) {
    const p = phase.toLowerCase();
    if (p in PHASE_COLORS) return PHASE_COLORS[p];
  }
  const t = (actType || '').toLowerCase();
  if (t.includes('research') || t.includes('web')) return PHASE_COLORS.discovery;
  if (t.includes('code') || t.includes('edit')) return PHASE_COLORS.development;
  if (t.includes('error') || t.includes('debug') || t.includes('fix')) return PHASE_COLORS.debug;
  if (t.includes('git') || t.includes('deploy')) return PHASE_COLORS.ship;
  return PHASE_COLORS.default;
}

function getStarSize(act: Activity) {
  const t = (act.activity_type || act.type || '').toLowerCase();
  if (t.includes('resolution') || t.includes('fix')) return 14;
  if (t.includes('git')) return 12;
  if (act.duration_ms && act.duration_ms > 30000) return 12;
  return 8;
}

function buildInsight(act: Activity): string {
  const type = (act.activity_type || act.type || '').toLowerCase();
  const app = act.app_class || '';
  const title = act.window_title || act.description || '';
  const details = act.details || {};

  if (type.includes('git')) {
    const ins = details.insertions ?? 0;
    const del = details.deletions ?? 0;
    if (ins > 0 || del > 0) {
      return `Expert melakukan commit/edit dengan +${ins} baris ditambah dan -${del} baris dihapus. Ini menandakan iterasi aktif pada kode.`;
    }
    return `Expert memperbarui repositori Git — langkah penting dalam menjaga history kode tetap bersih.`;
  }
  if (type.includes('research') || type.includes('web')) {
    return `Expert sedang melakukan riset di "${title.slice(0, 60)}". Ini menunjukkan fase problem-solving dengan mencari referensi eksternal.`;
  }
  if (type.includes('code') || type.includes('edit')) {
    return `Expert mengedit ${details.filename || 'berkas kode'}. Aktivitas coding aktif — ini adalah inti dari workflow pengembang.`;
  }
  if (type.includes('terminal') || type.includes('command')) {
    return `Expert menjalankan perintah terminal: ${details.active_commands?.[0] || title}. Menandakan proses build, test, atau deployment sedang berjalan.`;
  }
  if (app === 'Figma') {
    return `Expert bekerja di Figma — fase desain UI/UX sebelum implementasi kode dimulai.`;
  }
  return `Expert aktif di ${app || 'workspace'}: "${title.slice(0, 80)}". Pola ini menunjukkan fokus yang konsisten pada satu konteks kerja.`;
}

export default function StarConstellationView({ activities, sessionTitle, expertName, geminiKey }: Props) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInsight, setAiInsight] = useState<string>('');
  const W = 900;
  const H = 540;

  const positions = useMemo(() => getStarPositions(activities.length, W, H), [activities.length]);

  const handleStarClick = useCallback(async (idx: number) => {
    if (selectedIdx === idx) { setSelectedIdx(null); setAiInsight(''); return; }
    setSelectedIdx(idx);
    setAiInsight('');
    const act = activities[idx];

    // Generate quick local insight first
    const localInsight = buildInsight(act);
    setAiInsight(localInsight);

    // If Gemini key available, enhance with AI
    if (geminiKey) {
      setAiLoading(true);
      try {
        const prompt = `Kamu adalah GhostFlow AI Mentor. Analisis aktivitas pengembang expert berikut dalam 2 kalimat singkat yang insightful untuk junior developer:\n\nAktivitas: ${act.activity_type || act.type}\nAplikasi: ${act.app_class}\nJudul: ${act.window_title || act.description}\nDetail: ${JSON.stringify(act.details || {}).slice(0, 200)}\n\nBeri insight kenapa pola ini penting dan apa yang bisa dipelajari junior dari momen ini.`;
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) setAiInsight(text.slice(0, 300));
        else if (data.error?.message) setAiInsight(`Error Gemini: ${data.error.message}`);
      } catch (e: any) {
        setAiInsight(`Gagal terhubung ke Gemini API: ${e.message || e}`);
      }
      setAiLoading(false);
    }
  }, [selectedIdx, activities, geminiKey]);

  if (activities.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 font-mono text-sm border border-dashed border-[#222228] rounded-2xl p-8 text-center">
        <Activity className="w-14 h-14 text-zinc-800 mb-4" />
        <span>Belum ada aktivitas di sesi ini.<br />Pilih sesi expert yang sudah di-export untuk melihat constellation.</span>
      </div>
    );
  }

  const selected = selectedIdx !== null ? activities[selectedIdx] : null;
  const hovered = hoveredIdx !== null ? activities[hoveredIdx] : null;

  return (
    <div className="relative w-full h-full min-h-[480px] bg-[#080810] rounded-2xl border border-[#1a1a2e] overflow-hidden">

      {/* Header */}
      <div className="absolute top-4 left-5 z-10 pointer-events-none">
        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
          {expertName ? `Expert: ${expertName}` : 'Expert Session'} — {sessionTitle}
        </span>
        <div className="flex items-center gap-3 mt-1">
          {Object.entries(PHASE_COLORS).filter(([k]) => k !== 'default').map(([phase, color]) => (
            <span key={phase} className="flex items-center gap-1 text-[9px] font-mono uppercase" style={{ color }}>
              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: color }} />
              {phase}
            </span>
          ))}
        </div>
      </div>

      {/* Zoom Controls */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-1">
        <span className="text-[9px] font-mono text-zinc-600 text-right mb-1">scroll = zoom · drag = pan · click = detail</span>
      </div>

      {/* Zoomable canvas */}
      <TransformWrapper
        minScale={0.4}
        maxScale={3}
        limitToBounds={false}
        wheel={{ step: 0.08 }}
        doubleClick={{ disabled: true }}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            {/* Zoom buttons */}
            <div className="absolute bottom-4 right-4 z-10 flex gap-1.5">
              <button onClick={() => zoomIn()} className="w-7 h-7 bg-[#111317] border border-[#222228] rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:border-zinc-600 transition-all">
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => zoomOut()} className="w-7 h-7 bg-[#111317] border border-[#222228] rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:border-zinc-600 transition-all">
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => resetTransform()} className="w-7 h-7 bg-[#111317] border border-[#222228] rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:border-zinc-600 transition-all">
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }} contentStyle={{ width: '100%', height: '100%' }}>
              {/* Star bg */}
              <div className="absolute inset-0 pointer-events-none">
                {Array.from({ length: 60 }).map((_, i) => (
                  <div key={i} className="absolute rounded-full bg-white/10 animate-pulse"
                    style={{
                      width: Math.random() * 2 + 1,
                      height: Math.random() * 2 + 1,
                      left: `${Math.random() * 100}%`,
                      top: `${Math.random() * 100}%`,
                      animationDelay: `${Math.random() * 4}s`,
                      animationDuration: `${2 + Math.random() * 3}s`,
                    }} />
                ))}
              </div>

              <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="absolute inset-0" style={{ width: W, height: H }}>
                {/* Connection lines */}
                {positions.slice(0, -1).map((pos, i) => {
                  const next = positions[i + 1];
                  const color = getPhaseColor(activities[i]?.phase, activities[i]?.activity_type || activities[i]?.type);
                  const isNearSelected = selectedIdx !== null && (i === selectedIdx || i === selectedIdx - 1);
                  return (
                    <line key={`line-${i}`}
                      x1={pos.x} y1={pos.y} x2={next.x} y2={next.y}
                      stroke={color} strokeOpacity={isNearSelected ? 0.5 : 0.15} strokeWidth={isNearSelected ? 1.5 : 1}
                      strokeDasharray="3 5"
                    />
                  );
                })}

                {/* Stars */}
                {positions.map((pos, i) => {
                  const act = activities[i];
                  const color = getPhaseColor(act?.phase, act?.activity_type || act?.type);
                  const size = getStarSize(act);
                  const isSelected = selectedIdx === i;
                  const isHov = hoveredIdx === i;

                  return (
                    <g key={`star-${i}`}
                      onMouseEnter={() => setHoveredIdx(i)}
                      onMouseLeave={() => setHoveredIdx(null)}
                      onClick={() => handleStarClick(i)}
                      style={{ cursor: 'pointer' }}
                    >
                      {/* Selection ring */}
                      {isSelected && (
                        <circle cx={pos.x} cy={pos.y} r={size + 14}
                          fill="none" stroke={color} strokeOpacity={0.6} strokeWidth="1.5"
                          strokeDasharray="4 3" />
                      )}
                      {/* Glow */}
                      <circle cx={pos.x} cy={pos.y} r={size + 8}
                        fill={color} opacity={isSelected ? 0.25 : isHov ? 0.18 : 0.06} />
                      {/* Core */}
                      <circle cx={pos.x} cy={pos.y} r={isSelected ? size / 2 + 2 : size / 2}
                        fill={color} opacity={isSelected ? 1 : isHov ? 1 : 0.85}
                        stroke="white" strokeOpacity={isSelected ? 0.8 : isHov ? 0.5 : 0.1} strokeWidth="0.5"
                      />
                      {/* Hover label */}
                      {isHov && !isSelected && (
                        <text x={pos.x} y={pos.y - size - 6}
                          textAnchor="middle" fill="white" fontSize="9"
                          fontFamily="monospace" opacity="0.9"
                        >
                          {act?.app_class || 'App'}
                        </text>
                      )}
                      {/* Number */}
                      <text x={pos.x} y={pos.y + size + 14}
                        textAnchor="middle" fill={color} fontSize="7"
                        fontFamily="monospace" opacity={isSelected ? 0.9 : 0.5}
                      >
                        {i + 1}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </TransformComponent>
          </>
        )}
      </TransformWrapper>

      {/* Detail card (click) */}
      <AnimatePresence>
        {selected && selectedIdx !== null && (
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-4 left-4 right-16 bg-[#0d0e14]/96 backdrop-blur-xl border border-[#2a2a3a] rounded-2xl p-4 z-20 shadow-2xl max-w-lg"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                {/* Header badges */}
                <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border uppercase"
                    style={{
                      color: getPhaseColor(selected.phase, selected.activity_type || selected.type),
                      borderColor: getPhaseColor(selected.phase, selected.activity_type || selected.type) + '44',
                      background: getPhaseColor(selected.phase, selected.activity_type || selected.type) + '15',
                    }}>
                    #{selectedIdx + 1} · {selected.activity_type || selected.type || 'activity'}
                  </span>
                  <span className="text-zinc-500 text-[10px] font-mono">
                    {new Date(selected.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>

                <p className="text-zinc-100 text-[13px] font-medium mb-0.5">
                  {selected.app_class || selected.layout_state?.focused_app || 'Application'}
                </p>
                <p className="text-zinc-500 text-[11px] font-mono truncate mb-3">
                  {selected.window_title || selected.description}
                </p>

                {/* Git stats if available */}
                {selected.details?.insertions !== undefined && (
                  <div className="flex items-center gap-3 mb-3 font-mono text-[10px]">
                    <span className="text-emerald-400">+{selected.details.insertions} ins</span>
                    <span className="text-rose-400">-{selected.details.deletions} del</span>
                    {selected.details.changed_files?.length > 0 && (
                      <span className="text-zinc-500">{selected.details.changed_files.slice(0, 2).join(', ')}</span>
                    )}
                  </div>
                )}

                {/* AI Insight */}
                <div className="bg-violet-500/8 border border-violet-500/15 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    {aiLoading
                      ? <span className="inline-block w-3 h-3 border-2 border-violet-500/30 border-t-violet-400 rounded-full animate-spin" />
                      : <BrainCircuit className="w-3 h-3 text-violet-400 flex-shrink-0" />
                    }
                    <span className="text-[9px] font-mono text-violet-400 uppercase tracking-wider">
                      {aiLoading ? 'Generating Insight…' : geminiKey ? 'AI Insight' : 'Quick Insight'}
                    </span>
                    {geminiKey && !aiLoading && <Sparkles className="w-3 h-3 text-violet-400/50" />}
                  </div>
                  <p className="text-[11px] text-zinc-300 font-mono leading-relaxed">
                    {aiInsight || 'Klik bintang untuk melihat analisis aktivitas expert di sini.'}
                  </p>
                </div>
              </div>

              <button onClick={() => { setSelectedIdx(null); setAiInsight(''); }}
                className="text-zinc-700 hover:text-zinc-400 flex-shrink-0 mt-0.5 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
