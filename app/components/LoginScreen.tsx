import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Ghost, Briefcase, GraduationCap, ChevronRight } from 'lucide-react';

type AuthUser = {
  name: string;
  role: 'expert' | 'junior';
};

interface LoginScreenProps {
  onLogin: (user: AuthUser) => void;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [name, setName] = useState('');
  const [role, setRole] = useState<'expert' | 'junior'>('expert');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Silakan masukkan nama Anda.');
      return;
    }
    onLogin({ name: name.trim(), role });
  };

  return (
    <div className="fixed inset-0 bg-[#0A0A0C] flex flex-col items-center justify-center p-6 z-50">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-violet-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-fuchsia-600/10 blur-[120px] rounded-full" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-[#121317] border border-[#222228] p-8 rounded-2xl relative z-10 shadow-2xl"
      >
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-12 h-12 rounded-xl bg-violet-500/20 flex items-center justify-center border border-violet-500/30">
            <Ghost className="w-6 h-6 text-violet-400" />
          </div>
          <h1 className="text-3xl font-medium tracking-tight text-zinc-100">GhostFlow</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider">Nama Anda</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Misal: Budi Developer"
              className="w-full bg-[#0A0A0C] border border-[#222228] rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:border-violet-500/50 transition-colors"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider">Peran Anda</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole('expert')}
                className={`flex flex-col items-center gap-3 p-4 rounded-xl border transition-all ${
                  role === 'expert' 
                  ? 'bg-violet-500/10 border-violet-500/50 text-violet-400' 
                  : 'bg-[#0A0A0C] border-[#222228] text-zinc-500 hover:border-zinc-700'
                }`}
              >
                <Briefcase className="w-6 h-6" />
                <span className="text-sm font-medium">Expert</span>
              </button>
              
              <button
                type="button"
                onClick={() => setRole('junior')}
                className={`flex flex-col items-center gap-3 p-4 rounded-xl border transition-all ${
                  role === 'junior' 
                  ? 'bg-fuchsia-500/10 border-fuchsia-500/50 text-fuchsia-400' 
                  : 'bg-[#0A0A0C] border-[#222228] text-zinc-500 hover:border-zinc-700'
                }`}
              >
                <GraduationCap className="w-6 h-6" />
                <span className="text-sm font-medium">Junior</span>
              </button>
            </div>
          </div>

          <button 
            type="submit"
            className="w-full flex items-center justify-center gap-2 bg-white text-black py-3 px-4 rounded-xl font-medium hover:bg-zinc-200 transition-colors"
          >
            <span>Masuk ke Workspace</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </form>
      </motion.div>
    </div>
  );
}
