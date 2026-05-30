'use client';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Ghost, BrainCircuit, X, ChevronRight, Sparkles, CheckCircle } from 'lucide-react';

type Hint = {
  id: string;
  message: string;
  expertName?: string;
  sessionTitle?: string;
  type: 'match' | 'guide' | 'external';
};

type Props = {
  hints: Hint[];
  onDismiss: (id: string) => void;
  isActive: boolean;
};

export default function FloatingHintSidebar({ hints, onDismiss, isActive }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [visibleHints, setVisibleHints] = useState<Hint[]>([]);
  const hasNew = hints.length > 0;

  useEffect(() => {
    if (hints.length > 0) {
      setVisibleHints(hints.slice(0, 3));
      setExpanded(true);
      const timer = setTimeout(() => setExpanded(false), 12000);
      return () => clearTimeout(timer);
    }
  }, [hints]);

  if (!isActive) return null;

  return (
    <div className="fixed right-0 top-1/2 -translate-y-1/2 z-50 flex flex-col items-end gap-2">
      {/* Trigger tab */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`
          relative flex items-center justify-center w-10 h-10 rounded-l-xl
          border border-r-0 shadow-lg transition-all duration-300
          ${hasNew
            ? 'bg-violet-500/20 border-violet-500/40 text-violet-400'
            : 'bg-[#121317] border-[#222228] text-zinc-500 hover:text-zinc-300'}
        `}
      >
        <BrainCircuit className="w-4.5 h-4.5 w-4" />
        {hasNew && (
          <span className="absolute -top-1 -left-1 w-3 h-3 bg-violet-500 rounded-full flex items-center justify-center text-[8px] font-bold text-white">
            {hints.length}
          </span>
        )}
      </button>

      {/* Hint cards panel */}
      <AnimatePresence>
        {expanded && visibleHints.length > 0 && (
          <motion.div
            initial={{ opacity: 0, x: 80 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 80 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="flex flex-col gap-2 mr-1"
          >
            {visibleHints.map((hint) => (
              <motion.div
                key={hint.id}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 40 }}
                className="relative bg-[#0f1115]/95 backdrop-blur-xl border border-[#222228] rounded-xl p-4 shadow-2xl max-w-[280px]"
                style={{
                  borderColor: hint.type === 'match' ? '#7c3aed44' : hint.type === 'guide' ? '#0d9488aa' : '#22222888',
                }}
              >
                <button
                  onClick={() => onDismiss(hint.id)}
                  className="absolute top-2.5 right-2.5 text-zinc-600 hover:text-zinc-300"
                >
                  <X className="w-3 h-3" />
                </button>

                {/* Type badge */}
                <div className="flex items-center gap-2 mb-2">
                  {hint.type === 'match' ? (
                    <span className="flex items-center gap-1 text-[9px] font-mono text-violet-400 uppercase tracking-wider">
                      <CheckCircle className="w-3 h-3" /> Expert Match
                    </span>
                  ) : hint.type === 'guide' ? (
                    <span className="flex items-center gap-1 text-[9px] font-mono text-teal-400 uppercase tracking-wider">
                      <Ghost className="w-3 h-3" /> GhostFlow Guide
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[9px] font-mono text-zinc-500 uppercase tracking-wider">
                      <Sparkles className="w-3 h-3" /> External
                    </span>
                  )}
                </div>

                {/* Expert info */}
                {hint.expertName && (
                  <p className="text-[10px] text-zinc-500 font-mono mb-1.5">
                    dari Expert <span className="text-violet-400 font-bold">{hint.expertName}</span>
                    {hint.sessionTitle && <> — <span className="text-zinc-400">{hint.sessionTitle}</span></>}
                  </p>
                )}

                <p className="text-zinc-200 text-[12px] leading-relaxed font-mono">
                  {hint.message}
                </p>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
