'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Ghost, X, ChevronRight, ExternalLink, MessageSquare } from 'lucide-react';

type Hint = {
  id: string;
  message: string;
  expertName?: string;
  sessionTitle?: string;
  type: 'match' | 'guide' | 'external';
  timestamp: string;
};

export default function HintWindow() {
  const [hints, setHints] = useState<Hint[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [windowPos, setWindowPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Listen for hints from main window via Tauri events
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!(window as any).__TAURI_INTERNALS__) return;

    // Position window on right side of screen
    const initWindow = async () => {
      try {
        const { getCurrentWindow, PhysicalPosition, PhysicalSize } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        const monitor = await (await import('@tauri-apps/api/window')).currentMonitor();
        if (monitor) {
          const screenW = monitor.size.width;
          const screenH = monitor.size.height;
          // Position at right side, vertically centered
          await win.setPosition(new PhysicalPosition(screenW - 80, Math.floor(screenH / 2) - 32));
        }
      } catch (e) {
        console.error('Failed to init window position:', e);
      }
    };

    initWindow();

    // Listen for hint events
    const unlisten = listen<any>('ghost-hint', (event) => {
      const hint: Hint = {
        id: event.payload.id || `hint-${Date.now()}`,
        message: event.payload.message || event.payload.hint || '',
        expertName: event.payload.expertName,
        sessionTitle: event.payload.sessionTitle,
        type: event.payload.type || 'guide',
        timestamp: new Date().toISOString(),
      };
      setHints(prev => [hint, ...prev].slice(0, 8));
      setHasUnread(true);
      // Auto-expand for 3 seconds when hint arrives
      setIsExpanded(true);
      setTimeout(() => {
        if (!isExpanded) setIsExpanded(false);
      }, 5000);
    });

    return () => {
      unlisten.then(f => f());
    };
  }, []);

  // Resize window when expanding/collapsing
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!(window as any).__TAURI_INTERNALS__) return;

    const resizeWindow = async () => {
      try {
        const { getCurrentWindow, PhysicalSize, PhysicalPosition } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        const monitor = await (await import('@tauri-apps/api/window')).currentMonitor();
        if (!monitor) return;

        const screenW = monitor.size.width;
        const screenH = monitor.size.height;

        if (isExpanded) {
          const newW = 320;
          const newH = 420;
          await win.setSize(new PhysicalSize(newW, newH));
          await win.setPosition(new PhysicalPosition(screenW - newW - 8, Math.floor(screenH / 2) - newH / 2));
        } else {
          await win.setSize(new PhysicalSize(64, 64));
          await win.setPosition(new PhysicalPosition(screenW - 80, Math.floor(screenH / 2) - 32));
        }
      } catch (e) {
        console.error('Resize failed:', e);
      }
    };
    resizeWindow();
  }, [isExpanded]);

  const handleToggle = () => {
    setIsExpanded(prev => !prev);
    if (!isExpanded) {
      setHasUnread(false);
    }
  };

  const handleOpenApp = async () => {
    try {
      await invoke('focus_main_window');
    } catch (e) {
      console.error('Failed to focus main window:', e);
    }
  };

  const dismissHint = (id: string) => {
    setHints(prev => prev.filter(h => h.id !== id));
  };

  const getHintColor = (type: string) => {
    switch (type) {
      case 'match': return 'border-violet-500/40 bg-violet-500/10';
      case 'guide': return 'border-teal-500/40 bg-teal-500/10';
      case 'external': return 'border-amber-500/40 bg-amber-500/10';
      default: return 'border-zinc-500/40 bg-zinc-500/10';
    }
  };

  const getHintTextColor = (type: string) => {
    switch (type) {
      case 'match': return 'text-violet-300';
      case 'guide': return 'text-teal-300';
      case 'external': return 'text-amber-300';
      default: return 'text-zinc-300';
    }
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-end justify-end overflow-hidden"
      style={{ background: 'transparent' }}
    >
      <AnimatePresence mode="wait">
        {isExpanded ? (
          // ── Expanded panel ──
          <motion.div
            key="expanded"
            initial={{ opacity: 0, scale: 0.8, x: 40 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.8, x: 40 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="w-[320px] h-[420px] rounded-2xl border border-[#2a2a35] bg-[#0d0e12]/95 backdrop-blur-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{ boxShadow: '0 0 40px rgba(139, 92, 246, 0.15), 0 20px 60px rgba(0,0,0,0.6)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#222228] bg-[#0f1115] flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-violet-500/20 rounded-lg flex items-center justify-center">
                  <Ghost className="w-3.5 h-3.5 text-violet-400" />
                </div>
                <span className="text-[11px] font-bold text-zinc-300 tracking-wide">Ghost AI Hints</span>
                {hints.length > 0 && (
                  <span className="text-[9px] bg-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded-full font-mono">
                    {hints.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleOpenApp}
                  title="Buka di Desktop App"
                  className="p-1.5 rounded-lg hover:bg-[#222228] text-zinc-500 hover:text-teal-400 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleToggle}
                  className="p-1.5 rounded-lg hover:bg-[#222228] text-zinc-500 hover:text-zinc-200 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Hints list */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 scrollbar-hide">
              {hints.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-zinc-600 font-mono text-[11px] px-4">
                  <Ghost className="w-8 h-8 text-zinc-800 mb-3" />
                  <p>Belum ada hint dari AI.<br />Aktifkan Cognitive Assistant di mode Junior.</p>
                </div>
              ) : (
                hints.map(hint => (
                  <motion.div
                    key={hint.id}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className={`p-3 rounded-xl border text-[11px] font-mono relative ${getHintColor(hint.type)}`}
                  >
                    <button
                      onClick={() => dismissHint(hint.id)}
                      className="absolute top-2 right-2 text-zinc-600 hover:text-zinc-300 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    {hint.expertName && (
                      <div className="text-[9px] text-zinc-500 mb-1.5 uppercase tracking-widest">
                        Expert: {hint.expertName}
                        {hint.sessionTitle && ` · ${hint.sessionTitle}`}
                      </div>
                    )}
                    <p className={`leading-relaxed pr-4 ${getHintTextColor(hint.type)}`}>
                      {hint.message}
                    </p>
                    <div className="text-[9px] text-zinc-600 mt-2">
                      {new Date(hint.timestamp).toLocaleTimeString()}
                    </div>
                  </motion.div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-[#222228] bg-[#0f1115] flex-shrink-0">
              <button
                onClick={handleOpenApp}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/30 rounded-lg text-[11px] font-bold text-violet-300 transition-all"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Lanjutkan Chat di Desktop App
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        ) : (
          // ── Collapsed: floating icon button ──
          <motion.button
            key="collapsed"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleToggle}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            className="w-14 h-14 rounded-2xl bg-[#0d0e12]/90 border border-[#2a2a35] backdrop-blur-xl shadow-2xl flex items-center justify-center relative group hover:border-violet-500/50 transition-all"
            style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 20px rgba(139,92,246,0.1)' }}
          >
            <Ghost className="w-6 h-6 text-violet-400 group-hover:text-violet-300 transition-colors" />
            {/* Unread badge */}
            {hasUnread && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center"
              >
                <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping" />
                <span className="text-[8px] font-bold text-white relative z-10">
                  {hints.length > 9 ? '9+' : hints.length}
                </span>
              </motion.span>
            )}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
