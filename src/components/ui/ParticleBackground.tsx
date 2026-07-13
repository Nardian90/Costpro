// Math.random() is used here for particle animation (non-cryptographic, visual-only). Safe per CWE-338 exception.
'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { useScroll, useTransform, motion } from 'framer-motion';
import { getTipForView } from '@/config/navigation/view-tips';

interface Particle {
  x: number;
  y: number;
  size: number;
  speedY: number;
  speedX: number;
  opacity: number;
  drift: number;
  driftSpeed: number;
  driftPhase: number;
  type: 'dot' | 'glow' | 'streak';
  trail: { x: number; y: number }[];
  hue: number;
}

/**
 * ParticleBackground — Enhanced mode premium backdrop.
 *
 * FIX-PERF-TIPS (2026-07-13):
 * - Removida la lista aleatoria de greetings ("¡Hola!", "Listo", etc.)
 * - Reemplazada por tips profesionales contextuales según la vista actual
 * - El tip se pasa como prop `viewId` y se obtiene de VIEW_TIPS
 * - En modo performance: ORBS, TEXTO y CANVAS se ocultan completamente
 * - En modo enhanced: se muestran con animación
 *
 * Professional approach (used by Apple, Stripe, Linear):
 *   1. Mesh gradient orbs (CSS only, 0 GPU cost)
 *   2. Background tip text (contextual, professional)
 *   3. Particle canvas (green dots/glows/streaks)
 *
 * Performance mode: all layers hidden (opacity: 0 via .enhanced-layer).
 */
interface ParticleBackgroundProps {
  /** Vista actual para mostrar tip contextual relevante */
  viewId?: string | null;
}

export function ParticleBackground({ viewId }: ParticleBackgroundProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const modeRef = useRef<string>('enhanced');

  const createParticle = useCallback((w: number, h: number, startY?: number): Particle => {
    const rand = Math.random();
    const type = rand < 0.35 ? 'streak' : rand < 0.7 ? 'glow' : 'dot';
    return {
      x: Math.random() * w,
      y: startY !== undefined ? startY : Math.random() * h * 1.2,
      size: type === 'streak'
        ? Math.random() * 0.8 + 0.8
        : type === 'glow'
          ? Math.random() * 1.2 + 0.8
          : Math.random() * 1.0 + 0.4,
      speedY: type === 'streak'
        ? Math.random() * 0.6 + 0.3
        : type === 'glow'
          ? Math.random() * 0.25 + 0.1
          : Math.random() * 0.35 + 0.15,
      speedX: (Math.random() - 0.5) * 0.15,
      opacity: type === 'streak'
        ? Math.random() * 0.2 + 0.15
        : type === 'glow'
          ? Math.random() * 0.25 + 0.12
          : Math.random() * 0.3 + 0.18,
      drift: Math.random() * 0.8 + 0.3,
      driftSpeed: Math.random() * 0.008 + 0.003,
      driftPhase: Math.random() * Math.PI * 2,
      type,
      trail: [],
      hue: Math.random() * 30 - 15,
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    const PARTICLE_COUNT = 18;
    particlesRef.current = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particlesRef.current.push(createParticle(w, h));
    }

    const animate = () => {
      const html = document.documentElement;
      modeRef.current = html.classList.contains('mode-enhanced') ? 'enhanced' : 'performance';

      if (modeRef.current === 'performance') {
        ctx.clearRect(0, 0, w, h);
        animRef.current = requestAnimationFrame(animate);
        return;
      }

      ctx.clearRect(0, 0, w, h);

      const isDark = html.classList.contains('dark');
      const baseR = isDark ? 74 : 160;
      const baseG = isDark ? 222 : 165;
      const baseB = isDark ? 128 : 175;

      for (const p of particlesRef.current) {
        p.y += p.speedY;
        p.driftPhase += p.driftSpeed;
        p.x += Math.sin(p.driftPhase) * p.drift * 0.4 + p.speedX;

        if (p.type === 'streak') {
          p.trail.push({ x: p.x, y: p.y });
          if (p.trail.length > 5) p.trail.shift();
        }

        if (p.y > h + 20) {
          p.y = -20;
          p.x = Math.random() * w;
          p.trail = [];
        }
        if (p.x < -20) p.x = w + 20;
        if (p.x > w + 20) p.x = -20;

        const r = Math.min(255, Math.max(0, baseR + p.hue));
        const g = Math.min(255, Math.max(0, baseG + p.hue * 0.5));
        const b = Math.min(255, Math.max(0, baseB - p.hue * 0.3));

        if (p.type === 'streak' && p.trail.length > 1) {
          ctx.beginPath();
          ctx.moveTo(p.trail[0].x, p.trail[0].y);
          for (let i = 1; i < p.trail.length; i++) {
            ctx.lineTo(p.trail[i].x, p.trail[i].y);
          }
          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${p.opacity * 0.5})`;
          ctx.lineWidth = p.size * 0.6;
          ctx.lineCap = 'round';
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${p.opacity})`;
          ctx.fill();
        } else if (p.type === 'glow') {
          const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
          gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${p.opacity * 0.6})`);
          gradient.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${p.opacity * 0.2})`);
          gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
          ctx.fillStyle = gradient;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 0.8, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${p.opacity * 1.2})`;
          ctx.fill();
        } else {
          const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2);
          gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${p.opacity})`);
          gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
          ctx.fillStyle = gradient;
          ctx.fill();
        }
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animRef.current);
    };
  }, [createParticle]);

  /* ── Scroll fade-out for mesh background ── */
  const { scrollY } = useScroll();
  const meshFade = useTransform(scrollY, [0, 400], [1, 0]);

  /* ── FIX-PERF-TIPS: Tip profesional contextual según la vista ── */
  const tipText = getTipForView(viewId);

  return (
    <>
      {/* ── Layer 1: Mesh Gradient — animated orbs (pure CSS, 0 GPU cost) ── */}
      {/* FIX-PERF-ORBS: clase 'enhanced-layer' asegura que se oculte en performance */}
      <motion.div
        className="absolute inset-0 z-[-3] pointer-events-none enhanced-layer overflow-hidden"
        aria-hidden="true"
        style={{ opacity: meshFade }}
      >
        <div className="mesh-orb mesh-orb-1" />
        <div className="mesh-orb mesh-orb-2" />
        <div className="mesh-orb mesh-orb-3" />
      </motion.div>

      {/* ── Layer 2: Background Tip Text (contextual, professional) ── */}
      {/* FIX-PERF-TIPS-V2: reemplaza los greetings aleatorios por tips profesionales.
          Clase 'enhanced-layer' asegura display:none en performance mode.
          Removido whitespace-nowrap para permitir salto de línea en tips largos. */}
      <motion.div
        className="absolute inset-0 z-[-1] pointer-events-none flex items-center justify-center overflow-hidden enhanced-layer"
        aria-hidden="true"
        style={{ opacity: meshFade }}
      >
        <span className="bg-tip-text select-none" key={tipText}>
          {tipText}
        </span>
      </motion.div>

      {/* ── Layer 3: Particle canvas ── */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-0 pointer-events-none w-full h-full enhanced-layer"
        aria-hidden="true"
      />

      <style jsx global>{`
        /* ── Enhanced layers: hidden by default, fade in when active ── */
        /* FIX-PERF-ORBS-V2 (2026-07-13): en modo performance (default sin
           .mode-enhanced), TODAS las layers están OCULTAS con display:none
           (no solo opacity:0, que seguía ocupando espacio y renderizando).
           Solo se muestran cuando html tiene clase .mode-enhanced. */
        .enhanced-layer {
          display: none;
        }
        html.mode-enhanced .enhanced-layer {
          display: block;
          opacity: 0;
          animation: enhanced-fade-in 0.8s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        @keyframes enhanced-fade-in {
          to { opacity: 1; }
        }

        /* ── Mesh Gradient Orbs ── */
        .mesh-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(100px);
          will-change: transform;
        }
        .mesh-orb-1 {
          width: 50vw; height: 50vh;
          top: -10%; left: -10%;
          background: radial-gradient(circle, rgba(34,197,94,0.18) 0%, rgba(34,197,94,0.08) 40%, transparent 70%);
          animation: mesh-float-1 18s ease-in-out infinite;
        }
        .mesh-orb-2 {
          width: 45vw; height: 45vh;
          bottom: -15%; right: -5%;
          background: radial-gradient(circle, rgba(20,184,166,0.15) 0%, rgba(6,182,212,0.06) 40%, transparent 70%);
          animation: mesh-float-2 22s ease-in-out infinite;
        }
        .mesh-orb-3 {
          width: 35vw; height: 35vh;
          top: 30%; right: 20%;
          background: radial-gradient(circle, rgba(74,222,128,0.08) 0%, rgba(34,211,238,0.04) 40%, transparent 70%);
          animation: mesh-float-3 25s ease-in-out infinite;
        }

        @keyframes mesh-float-1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(8vw, 12vh) scale(1.1); }
          66% { transform: translate(-5vw, 5vh) scale(0.95); }
        }
        @keyframes mesh-float-2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-10vw, -8vh) scale(1.05); }
          66% { transform: translate(6vw, -3vh) scale(1.1); }
        }
        @keyframes mesh-float-3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-8vw, 10vh) scale(1.15); }
        }

        /* ── Respect reduced motion ── */
        @media (prefers-reduced-motion: reduce) {
          .mesh-orb { animation: none !important; }
        }

        /* ── Background Tip Text (contextual, professional) ── */
        /* FIX-PERF-TIPS-V2 (2026-07-13): estilo más elegante y menos ruidoso.
           - Salto de línea automático (white-space: normal, no nowrap)
           - Tamaño menor, peso ligero
           - Opacity muy baja para no distraer
           - Max-width para forzar wrap en tips largos */
        .bg-tip-text {
          font-size: clamp(1.5rem, 3.5vw, 2.5rem);
          font-weight: 400;
          letter-spacing: 0;
          line-height: 1.4;
          color: rgba(34, 197, 94, 0.035);
          text-align: center;
          max-width: min(600px, 70vw);
          padding: 0 2rem;
          white-space: normal;
          word-wrap: break-word;
          overflow-wrap: break-word;
          font-style: italic;
          letter-spacing: 0.02em;
        }
        html:not(.dark) .bg-tip-text {
          color: rgba(0, 0, 0, 0.03);
        }

        /* ── Enhanced mode: frosted glass content panels ── */
        html.mode-enhanced .enhanced-glass {
          background: rgba(255, 255, 255, 0.55) !important;
          backdrop-filter: blur(40px) saturate(1.4) brightness(1.05) !important;
          -webkit-backdrop-filter: blur(40px) saturate(1.4) brightness(1.05) !important;
          border-color: rgba(255, 255, 255, 0.3) !important;
        }
        html.dark.mode-enhanced .enhanced-glass {
          background: rgba(10, 15, 25, 0.45) !important;
          backdrop-filter: blur(40px) saturate(1.3) brightness(1.1) !important;
          -webkit-backdrop-filter: blur(40px) saturate(1.3) brightness(1.1) !important;
          border-color: rgba(255, 255, 255, 0.08) !important;
        }

        /* ── Enhanced mode: sidebar gradient shadow edge ── */
        html.mode-enhanced .enhanced-sidebar-edge::after {
          content: '';
          position: absolute;
          top: 0;
          right: -32px;
          bottom: 0;
          width: 32px;
          background: linear-gradient(to right, rgba(0,0,0,0.06), transparent);
          pointer-events: none;
          z-index: 35;
        }
        html.dark.mode-enhanced .enhanced-sidebar-edge::after {
          background: linear-gradient(to right, rgba(0,0,0,0.3), transparent);
        }

        /* ── Enhanced mode: cards get subtle glass ── */
        html.mode-enhanced .enhanced-card {
          background: rgba(255, 255, 255, 0.5) !important;
          backdrop-filter: blur(20px) saturate(1.2) !important;
          -webkit-backdrop-filter: blur(20px) saturate(1.2) !important;
          border-color: rgba(255, 255, 255, 0.25) !important;
        }
        html.dark.mode-enhanced .enhanced-card {
          background: rgba(255, 255, 255, 0.04) !important;
          backdrop-filter: blur(20px) saturate(1.2) !important;
          -webkit-backdrop-filter: blur(20px) saturate(1.2) !important;
          border-color: rgba(255, 255, 255, 0.06) !important;
        }
      `}</style>
    </>
  );
}
