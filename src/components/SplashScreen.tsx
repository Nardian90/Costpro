'use client';

import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CostProLogo from './CostProLogo';

interface SplashScreenProps {
  onFinish: () => void;
}

/* ------------------------------------------------------------------ */
/*  CSS-only particles rendered as tiny circles floating upward       */
/* ------------------------------------------------------------------ */
const PARTICLES = Array.from({ length: 28 }, (_, i) => ({
  id: i,
  left: `${(i / 28) * 100}%`,
  size: 2 + (i % 4) * 1.5,          // 2 – 6.5 px
  delay: (i * 0.37) % 3,            // staggered start
  duration: 4 + (i % 5) * 1.2,      // 4 – 10 s
  opacity: 0.15 + (i % 3) * 0.12,  // 0.15 – 0.39
}));

const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const [isVisible, setIsVisible] = useState(true);
  const finishedRef = useRef(false);
  // Store onFinish in a ref so the timer never resets on re-renders
  const onFinishRef = useRef(onFinish);
  React.useEffect(() => {
    onFinishRef.current = onFinish;
  });

  const handleFinish = React.useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setIsVisible(false);
    // Give time for exit animation (0.5s)
    setTimeout(() => onFinishRef.current(), 500);
  }, []);

  useEffect(() => {
    // Main timer — splash visible for ~2 seconds
    const timer = setTimeout(handleFinish, 2000);
    // Failsafe — ensure splash closes after 4s max
    const failsafe = setTimeout(handleFinish, 4000);

    return () => {
      clearTimeout(timer);
      clearTimeout(failsafe);
    };
  }, [handleFinish]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden allow-animations"
          style={{
            background:
              'linear-gradient(145deg, #052e16 0%, #0c1222 45%, #020617 100%)',
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
                className="splash-particle absolute rounded-full"
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
                'radial-gradient(ellipse 50% 40% at 50% 0%, rgba(34,197,94,0.08) 0%, transparent 70%)',
            }}
          />

          {/* ---- Logo section ---- */}
          <div className="relative z-10 flex flex-col items-center">
            {/* Pulsing glow behind logo */}
            <div className="relative">
              <div
                aria-hidden="true"
                className="splash-pulse-glow absolute inset-0 -m-10 rounded-full"
              />
              <CostProLogo size={160} animated={true} />
            </div>

            {/* "Cargando..." text */}
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.8, ease: 'easeOut' }}
              className="splash-loading-text mt-6 text-sm font-medium uppercase tracking-[0.25em]"
              style={{ color: 'rgba(74, 222, 128, 0.6)' }}
            >
              Cargando…
            </motion.p>
          </div>

          {/* ---- Progress bar ---- */}
          <div className="absolute bottom-0 left-0 right-0 z-20 h-[2px] overflow-hidden bg-white/[0.04]">
            <div className="splash-progress-fill h-full w-full" />
          </div>

          {/* ---- Embedded keyframes (avoids external CSS file edits) ---- */}
          <style>{`
            /* ---------- Particle float ---------- */
            .splash-particle {
              animation: splash-float var(--particle-duration, 6s) var(--particle-delay, 0s) ease-in infinite;
            }
            @keyframes splash-float {
              0%   { transform: translateY(0) translateX(0); opacity: 0; }
              8%   { opacity: var(--particle-opacity, 0.25); }
              85%  { opacity: var(--particle-opacity, 0.25); }
              100% { transform: translateY(-100vh) translateX(20px); opacity: 0; }
            }

            /* ---------- Pulsing glow ---------- */
            .splash-pulse-glow {
              background: radial-gradient(circle, rgba(34,197,94,0.25) 0%, transparent 70%);
              animation: splash-glow-pulse 2.4s ease-in-out infinite;
            }
            @keyframes splash-glow-pulse {
              0%, 100% { transform: scale(0.85); opacity: 0.5; }
              50%      { transform: scale(1.15); opacity: 1; }
            }

            /* ---------- Loading text shimmer ---------- */
            .splash-loading-text {
              animation: splash-text-shimmer 2s ease-in-out infinite;
            }
            @keyframes splash-text-shimmer {
              0%, 100% { opacity: 0.6; }
              50%      { opacity: 1; }
            }

            /* ---------- Progress bar fill ---------- */
            .splash-progress-fill {
              background: linear-gradient(90deg, rgba(34,197,94,0.1), rgba(74,222,128,0.7), rgba(34,197,94,0.1));
              background-size: 200% 100%;
              animation: splash-progress 2s ease-in-out forwards;
            }
            @keyframes splash-progress {
              0%   { background-position: 200% 0; width: 0%; }
              60%  { width: 75%; background-position: 0% 0; }
              100% { width: 100%; background-position: -100% 0; }
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SplashScreen;
