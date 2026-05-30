'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Ghost, Briefcase, GraduationCap, ChevronRight, Eye, EyeOff, Mail, Lock, ArrowLeft, CheckCircle } from 'lucide-react';

export type AuthUser = {
  name: string;
  email: string;
  role: 'expert' | 'junior';
  avatar?: string;
};

type Screen = 'landing' | 'email-form' | 'role-select';

interface LoginScreenProps {
  onLogin: (user: AuthUser) => void;
}

const GOOGLE_ICON = (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [screen, setScreen] = useState<Screen>('landing');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingUser, setPendingUser] = useState<Omit<AuthUser, 'role'> | null>(null);

  const simulateLogin = async (userData: Omit<AuthUser, 'role'>) => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 1200));
    setLoading(false);
    setPendingUser(userData);
    setScreen('role-select');
  };

  const handleGoogleLogin = () => {
    simulateLogin({
      name: name || 'Pengguna Google',
      email: email || 'user@gmail.com',
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'G')}&background=4285F4&color=fff&size=64`,
    });
  };

  const handleEmailLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      alert('Silakan isi email dan password.');
      return;
    }
    const derivedName = name.trim() || email.split('@')[0];
    simulateLogin({
      name: derivedName,
      email: email.trim(),
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(derivedName)}&background=6d28d9&color=fff&size=64`,
    });
  };

  const handleSelectRole = (role: 'expert' | 'junior') => {
    if (!pendingUser) return;
    onLogin({ ...pendingUser, role });
  };

  const slideVariants = {
    enter: { opacity: 0, x: 30 },
    center: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -30 },
  };

  return (
    <div className="fixed inset-0 bg-[#07070A] flex flex-col items-center justify-center p-6 z-50 overflow-hidden">
      {/* Background glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-15%] left-[-10%] w-[55%] h-[55%] bg-violet-700/10 blur-[130px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-5%] w-[45%] h-[60%] bg-fuchsia-700/8 blur-[130px] rounded-full" />
      </div>

      {/* Subtle grid */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: 'linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />

      <AnimatePresence mode="wait">
        {/* ── LANDING SCREEN ── */}
        {screen === 'landing' && (
          <motion.div key="landing"
            variants={slideVariants} initial="enter" animate="center" exit="exit"
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="w-full max-w-[400px] relative z-10"
          >
            {/* Logo */}
            <div className="flex flex-col items-center mb-10">
              <div className="w-16 h-16 rounded-2xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center mb-4 shadow-lg shadow-violet-500/10">
                <Ghost className="w-8 h-8 text-violet-400" />
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-zinc-100">GhostFlow</h1>
              <p className="text-sm text-zinc-500 mt-1.5 font-mono">Cognitive Workspace Intelligence</p>
            </div>

            <div className="space-y-3">
              {/* Google */}
              <button
                onClick={() => { setScreen('email-form'); setName(''); }}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 bg-white hover:bg-zinc-100 text-zinc-900 py-3.5 px-4 rounded-xl font-medium text-[14px] transition-all shadow-sm"
              >
                {GOOGLE_ICON}
                Masuk dengan Google
              </button>

              <div className="flex items-center gap-3 my-1">
                <div className="h-px flex-1 bg-[#222228]" />
                <span className="text-[11px] text-zinc-600 font-mono">atau</span>
                <div className="h-px flex-1 bg-[#222228]" />
              </div>

              {/* Email */}
              <button
                onClick={() => setScreen('email-form')}
                className="w-full flex items-center justify-center gap-2 bg-[#121317] border border-[#222228] hover:border-zinc-600 text-zinc-300 py-3.5 px-4 rounded-xl font-medium text-[14px] transition-all"
              >
                <Mail className="w-4 h-4 text-zinc-500" />
                Masuk dengan Email
              </button>
            </div>

            <p className="text-center text-[11px] text-zinc-600 mt-6 font-mono">
              Dengan masuk, Anda menyetujui Syarat Penggunaan GhostFlow.
            </p>
          </motion.div>
        )}

        {/* ── EMAIL FORM ── */}
        {screen === 'email-form' && (
          <motion.div key="email-form"
            variants={slideVariants} initial="enter" animate="center" exit="exit"
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="w-full max-w-[400px] relative z-10"
          >
            <div className="flex items-center gap-3 mb-8">
              <button onClick={() => setScreen('landing')} className="p-2 rounded-lg hover:bg-[#222228] text-zinc-500 hover:text-zinc-200 transition-colors">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-violet-500/15 border border-violet-500/25 flex items-center justify-center">
                  <Ghost className="w-4 h-4 text-violet-400" />
                </div>
                <span className="text-sm font-semibold text-zinc-200">GhostFlow</span>
              </div>
            </div>

            <h2 className="text-xl font-semibold text-zinc-100 mb-1">Masuk ke Workspace</h2>
            <p className="text-sm text-zinc-500 font-mono mb-7">Daftarkan atau masuk dengan email Anda</p>

            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <label className="block text-[11px] text-zinc-500 font-mono uppercase tracking-wider mb-1.5">Nama Tampilan</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Misal: Budi Santoso"
                  className="w-full bg-[#0A0A0C] border border-[#222228] focus:border-violet-500/50 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-500 font-mono uppercase tracking-wider mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="budi@example.com"
                    className="w-full bg-[#0A0A0C] border border-[#222228] focus:border-violet-500/50 rounded-xl pl-10 pr-4 py-3 text-sm text-zinc-200 outline-none transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-zinc-500 font-mono uppercase tracking-wider mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#0A0A0C] border border-[#222228] focus:border-violet-500/50 rounded-xl pl-10 pr-10 py-3 text-sm text-zinc-200 outline-none transition-colors"
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white py-3.5 px-4 rounded-xl font-medium text-sm transition-all mt-2">
                {loading ? (
                  <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>Lanjutkan <ChevronRight className="w-4 h-4" /></>
                )}
              </button>
            </form>

            <div className="flex items-center gap-3 my-5">
              <div className="h-px flex-1 bg-[#222228]" />
              <span className="text-[11px] text-zinc-600 font-mono">atau</span>
              <div className="h-px flex-1 bg-[#222228]" />
            </div>

            <button onClick={handleGoogleLogin} disabled={loading}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-zinc-100 disabled:opacity-50 text-zinc-900 py-3 px-4 rounded-xl font-medium text-sm transition-all">
              {GOOGLE_ICON}
              Masuk dengan Google
            </button>
          </motion.div>
        )}

        {/* ── ROLE SELECTION ── */}
        {screen === 'role-select' && pendingUser && (
          <motion.div key="role-select"
            variants={slideVariants} initial="enter" animate="center" exit="exit"
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="w-full max-w-[420px] relative z-10"
          >
            <div className="flex flex-col items-center mb-8">
              <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-violet-500/30 mb-3">
                {pendingUser.avatar
                  ? <img src={pendingUser.avatar} alt={pendingUser.name} className="w-full h-full object-cover" />
                  : <div className="w-full h-full bg-violet-500/20 flex items-center justify-center text-violet-400 text-xl font-bold">{pendingUser.name[0]?.toUpperCase()}</div>
                }
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span className="text-sm text-zinc-300 font-medium">Halo, <span className="text-white">{pendingUser.name}</span>!</span>
              </div>
              <p className="text-[11px] text-zinc-600 font-mono mt-1">{pendingUser.email}</p>
            </div>

            <h2 className="text-lg font-semibold text-zinc-100 text-center mb-1.5">Masuk sebagai apa hari ini?</h2>
            <p className="text-[12px] text-zinc-500 text-center font-mono mb-7">
              Pilih peran Anda. Anda dapat berganti sewaktu-waktu melalui ikon profil.
            </p>

            <div className="grid grid-cols-2 gap-4">
              {/* Expert */}
              <button onClick={() => handleSelectRole('expert')}
                className="group flex flex-col items-center gap-4 p-6 rounded-2xl border border-[#222228] bg-[#0D0E12] hover:border-teal-500/50 hover:bg-teal-500/5 transition-all">
                <div className="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/20 group-hover:border-teal-500/40 group-hover:bg-teal-500/15 transition-all flex items-center justify-center">
                  <Briefcase className="w-7 h-7 text-teal-400" />
                </div>
                <div className="text-center">
                  <div className="text-sm font-semibold text-zinc-200 group-hover:text-white transition-colors">Expert</div>
                  <div className="text-[10px] text-zinc-600 font-mono mt-0.5">Rekam & Analisis</div>
                </div>
              </button>

              {/* Junior */}
              <button onClick={() => handleSelectRole('junior')}
                className="group flex flex-col items-center gap-4 p-6 rounded-2xl border border-[#222228] bg-[#0D0E12] hover:border-violet-500/50 hover:bg-violet-500/5 transition-all">
                <div className="w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-500/20 group-hover:border-violet-500/40 group-hover:bg-violet-500/15 transition-all flex items-center justify-center">
                  <GraduationCap className="w-7 h-7 text-violet-400" />
                </div>
                <div className="text-center">
                  <div className="text-sm font-semibold text-zinc-200 group-hover:text-white transition-colors">Junior</div>
                  <div className="text-[10px] text-zinc-600 font-mono mt-0.5">Belajar & Mentoring</div>
                </div>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
