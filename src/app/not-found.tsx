'use client';

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { FileQuestion, Home, LogIn } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

/* ------------------------------------------------------------------ */
/*  Random fun greetings for the 404 page                            */
/* ------------------------------------------------------------------ */
const GREETINGS = [
  '¡Vamos!',
  '¡Dale!',
  '¡Hola!',
  '¡Arrancamos!',
  '¡Siempre adelante!',
  'Listo',
  '¡Genial!',
  '¡Vamos con todo!',
  '¡A ganar!',
  '¡Éxito!',
  '¡Bravo!',
  '¡Positivo!',
  '¡Súper!',
  '¡Arranca!',
  '¡Levanta!',
  '¡Boom!',
];

function useRandomGreeting(): string {
  return useMemo(() => {
    return GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
  }, []);
}

/* ------------------------------------------------------------------ */
/*  CSS-only particles floating upward (same pattern as SplashScreen) */
/* ------------------------------------------------------------------ */
const PARTICLES = Array.from({ length: 24 }, (_, i) => ({
  id: i,
  left: `${(i / 24) * 100}%`,
  size: 2 + (i % 4) * 1.5,
  delay: (i * 0.37) % 3,
  duration: 4 + (i % 5) * 1.2,
  opacity: 0.15 + (i % 3) * 0.12,
}));

export default function NotFound() {
  const t = useTranslations('notFound');
  const greeting = useRandomGreeting();

  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden"
      style={{
        background:
          'linear-gradient(145deg, #052e16 0%, #064e3b 50%, #0f172a 100%)',
      }}
    >
      {/* ---- Radial vignette overlay ---- */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 60% at 50% 50%, transparent 30%, #020617 100%)',
        }}
      />

      {/* ---- Animated particles (CSS-only) ---- */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {PARTICLES.map((p) => (
          <span
            key={p.id}
            className="nf-particle absolute rounded-full"
            style={{
              left: p.left,
              bottom: '-8px',
              width: p.size,
              height: p.size,
              opacity: 0,
              '--particle-delay': `${p.delay}s`,
              '--particle-duration': `${p.duration}s`,
              '--particle-opacity': p.opacity,
            } as React.CSSProperties}
          />
        ))}
      </div>

      {/* ---- Subtle top-down light rays ---- */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2"
        style={{
          width: '60%',
          height: '70%',
          background:
            'radial-gradient(ellipse 50% 40% at 50% 0%, rgba(34,197,94,0.06) 0%, transparent 70%)',
        }}
      />

      {/* ---- Main content ---- */}
      <div className="relative z-10 flex flex-col items-center px-6 text-center">
        {/* Radial glow behind 404 */}
        <div
          aria-hidden="true"
          className="nf-pulse-glow absolute -top-20 left-1/2 -translate-x-1/2 rounded-full"
          style={{ width: 300, height: 300 }}
        />

        {/* 404 number */}
        <motion.h1
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="relative mb-4 text-[120px] font-black leading-none tracking-tighter sm:text-[160px] md:text-[200px]"
          style={{
            background: 'linear-gradient(135deg, #22c55e 0%, #4ade80 50%, #16a34a 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            filter: 'drop-shadow(0 0 40px rgba(34,197,94,0.3))',
          }}
        >
          404
        </motion.h1>

        {/* Ghost / FileQuestion icon */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6, ease: 'easeOut' }}
          className="mb-5"
        >
          <FileQuestion
            className="nf-icon-float"
            size={48}
            style={{ color: 'rgba(74, 222, 128, 0.7)' }}
            strokeWidth={1.5}
          />
        </motion.div>

        {/* Random greeting */}
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6, ease: 'easeOut' }}
          className="mb-3 text-3xl font-bold sm:text-4xl md:text-5xl"
          style={{
            background: 'linear-gradient(135deg, #4ade80 0%, #22d3ee 50%, #4ade80 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            filter: 'drop-shadow(0 0 20px rgba(34,197,94,0.25))',
          }}
        >
          {greeting}
        </motion.h2>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, duration: 0.6, ease: 'easeOut' }}
          className="mb-8 max-w-md text-base text-slate-400 sm:text-lg"
        >
          {t('description')}
        </motion.p>

        {/* Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.6, ease: 'easeOut' }}
          className="flex flex-col gap-3 sm:flex-row sm:gap-4"
        >
          {/* Primary button */}
          <Link
            href="/"
            className="group inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-green-500/25 sm:text-base"
            style={{
              background: 'linear-gradient(135deg, #16a34a 0%, #22c55e 50%, #15803d 100%)',
            }}
          >
            <Home size={18} className="transition-transform duration-300 group-hover:-translate-x-0.5" />
            {t('goHome')}
          </Link>

          {/* Ghost button */}
          <Link
            href="/"
            className="group inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 px-6 py-3 text-sm font-semibold text-white/80 backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:border-white/40 hover:bg-white/10 hover:text-white sm:text-base"
          >
            <LogIn size={18} className="transition-transform duration-300 group-hover:translate-x-0.5" />
            {t('goLogin')}
          </Link>
        </motion.div>
      </div>

      {/* ---- Footer ---- */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.8 }}
        className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 text-xs tracking-wider text-slate-500"
      >
        CostPro v5.8
      </motion.p>

      {/* ---- Embedded keyframes ---- */}
      <style>{`
        /* ---------- Particle float ---------- */
        .nf-particle {
          background: rgba(34, 197, 94, 0.6);
          animation: nf-float var(--particle-duration, 6s) var(--particle-delay, 0s) ease-in infinite;
        }
        @keyframes nf-float {
          0%   { transform: translateY(0) translateX(0); opacity: 0; }
          8%   { opacity: var(--particle-opacity, 0.25); }
          85%  { opacity: var(--particle-opacity, 0.25); }
          100% { transform: translateY(-100vh) translateX(20px); opacity: 0; }
        }

        /* ---------- Pulsing glow ---------- */
        .nf-pulse-glow {
          background: radial-gradient(circle, rgba(34,197,94,0.2) 0%, transparent 70%);
          animation: nf-glow-pulse 3s ease-in-out infinite;
        }
        @keyframes nf-glow-pulse {
          0%, 100% { transform: scale(0.85); opacity: 0.4; }
          50%      { transform: scale(1.15); opacity: 0.9; }
        }

        /* ---------- Icon floating ---------- */
        .nf-icon-float {
          animation: nf-icon-bob 3s ease-in-out infinite;
        }
        @keyframes nf-icon-bob {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-8px); }
        }
      `}</style>
    </div>
  );
}
