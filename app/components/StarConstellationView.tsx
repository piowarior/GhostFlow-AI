'use client';
import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileCode, Terminal, Search, Server, Activity, GitBranch, Layout, X } from 'lucide-react';

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

export default function StarConstellationView({ activities, sessionTitle, expertName }: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const W = 800;
  const H = 480;

  const positions = useMemo(() => getStarPositions(activities.length, W, H), [activities.length]);

  if (activities.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 font-mono text-sm border border-dashed border-[#222228] rounded-2xl p-8 text-center">
        <Activity className="w-14 h-14 text-zinc-800 mb-4" />
        <span>Belum ada aktivitas di sesi ini.<br />Pilih sesi expert yang sudah di-export untuk melihat constellation.</span>
      </div>
    );
  }

  const hovered = hoveredIdx !== null ? activities[hoveredIdx] : null;

  return (
    <div className="relative w-full h-full min-h-[480px] bg-[#080810] rounded-2xl border border-[#1a1a2e] overflow-hidden">
      {/* Stars bg */}
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

      {/* Header */}
      <div className="absolute top-4 left-5 z-10">
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

      <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} className="absolute inset-0">
        {/* Connection lines */}
        {positions.slice(0, -1).map((pos, i) => {
          const next = positions[i + 1];
          const color = getPhaseColor(activities[i]?.phase, activities[i]?.activity_type || activities[i]?.type);
          return (
            <line key={`line-${i}`}
              x1={pos.x} y1={pos.y} x2={next.x} y2={next.y}
              stroke={color} strokeOpacity="0.18" strokeWidth="1"
              strokeDasharray="3 5"
            />
          );
        })}

        {/* Stars */}
        {positions.map((pos, i) => {
          const act = activities[i];
          const color = getPhaseColor(act?.phase, act?.activity_type || act?.type);
          const size = getStarSize(act);
          const isHov = hoveredIdx === i;

          return (
            <g key={`star-${i}`}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              style={{ cursor: 'pointer' }}
            >
              {/* Glow */}
              <circle cx={pos.x} cy={pos.y} r={size + 8}
                fill={color} opacity={isHov ? 0.18 : 0.06} />
              {/* Core */}
              <circle cx={pos.x} cy={pos.y} r={size / 2}
                fill={color} opacity={isHov ? 1 : 0.85}
                stroke="white" strokeOpacity={isHov ? 0.5 : 0.1} strokeWidth="0.5"
              />
              {/* Label */}
              {isHov && (
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
                fontFamily="monospace" opacity="0.5"
              >
                {i + 1}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute bottom-4 left-4 right-4 bg-[#0f1115]/95 backdrop-blur-md border border-[#2a2a38] rounded-xl p-4 z-20 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border uppercase"
                    style={{
                      color: getPhaseColor(hovered.phase, hovered.activity_type || hovered.type),
                      borderColor: getPhaseColor(hovered.phase, hovered.activity_type || hovered.type) + '33',
                      background: getPhaseColor(hovered.phase, hovered.activity_type || hovered.type) + '11',
                    }}>
                    {hovered.activity_type || hovered.type || 'activity'}
                  </span>
                  <span className="text-zinc-500 text-[10px] font-mono">
                    {new Date(hovered.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-zinc-200 text-[13px] font-medium truncate">
                  {hovered.app_class || hovered.layout_state?.focused_app || 'Application'}
                </p>
                <p className="text-zinc-500 text-[11px] font-mono mt-0.5 truncate">
                  {hovered.window_title || hovered.description}
                </p>
                {hovered.details && (
                  <p className="text-zinc-600 text-[10px] font-mono mt-1 truncate">
                    {hovered.details.filename || hovered.details.tab_title || hovered.details.document_name || ''}
                  </p>
                )}
              </div>
              <button onClick={() => setHoveredIdx(null)} className="text-zinc-700 hover:text-zinc-400 flex-shrink-0 mt-0.5">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
