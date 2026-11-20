'use client';

/**
 * HeroSection — HERO EDITORIAL ADNegocio
 * ============================================================================
 * MISIÓN ADN-BRAND-HERO-REFINEMENT-002 (2026-11-18) — rediseño creativo del
 * hero sobre el PR #1651 (ADN-BRAND-REBUILD-001 sigue en la misma rama).
 *
 * CONCEPTO CREATIVO — «DEL CAOS AL ORDEN»
 *   MENOS MALABARES.  → «MALABARES.» en hueco (stroke): el caos se desvanece;
 *                        sus letras entran dispersas y SE ASENTAN en la línea.
 *   MÁS negocio.      → sans monumental sólida + «negocio.» en serif italic
 *                        verde: lo que permanece, la voz editorial de acento.
 *   La animación tipográfica ES la narrativa: las operaciones dejan de estar
 *   dispersas (letras dispersas → ordenadas; chips de caos → un solo sistema).
 *
 * DIRECCIÓN DE ARTE (referencias Awwwards verificadas — ver expediente
 * docs/audits/adnegocio-brand-hero-refinement-002/ART_DIRECTION.md):
 *   Grids/Obys (SOTD) → retícula estructural visible (.hero-grid-bg).
 *   Cyera · Greenlock → contraste sans black + serif de acento en B2B.
 *   Anduril · North   → dark tech monumental, tracking negativo, labels mono.
 *   Frontier/Planhat  → cinta editorial (marquee) con los módulos reales.
 *   Bridgement        → microinteracciones sobrias (hover, flechas, pausas).
 *
 * CORRECCIÓN DE IDENTIDAD (ADN-LANDING-FINAL-POLISH-003 §3):
 *   - El encabezado del landing usa el MISMO tratamiento que el menú lateral
 *     autenticado (src/components/views/terminal/Sidebar.tsx): wordmark
 *     tipográfico «ADNegocio» con «ADN» verde + «egocio» blanco, en una sola
 *     línea, sin repetición ni versiones tipográficas contradictorias.
 *   - El hero YA NO repite la marca junto al titular: ni isotipo «ADN» ni
 *     lockup duplicado.
 *   - El símbolo ADN queda reservado a favicon/PWA/rail (AdnMonograma).
 *
 * ACCESIBILIDAD Y RENDIMIENTO:
 *   - h1 con texto sr-only completo; la capa visual es aria-hidden.
 *   - prefers-reduced-motion: sin dispersión de letras, sin ticker en
 *     movimiento, sin flotación (useReducedMotion + media queries CSS).
 *   - Animaciones solo transform/opacity (GPU); partículas solo en
 *     mode-enhanced y pausadas fuera de pantalla (IntersectionObserver).
 *   - Offsets deterministas (arrays fijos): hidratación estable, sin Math.random.
 * ============================================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, useReducedMotion, useTransform, useMotionValue, type MotionValue } from 'framer-motion';
import {
  ChevronDown, ArrowRight,
  Search, X,
  Calculator, LayoutGrid, PlayCircle,
} from 'lucide-react';
import { enterFichaDeCosto } from '@/lib/fcEntry';
import { entrarACostpro } from '@/lib/auth-recovery';
import { BrandWordmark } from '@/components/landing/BrandWordmark';

/* ── Controlled immersion particles ──
   Landing version: dots + soft glows only (no streaks).
   Respects mode-enhanced / prefers-reduced-motion. */
function ParticleRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  interface Particle {
    x: number; y: number; size: number;
    speedY: number; speedX: number;
    opacity: number;
    drift: number; driftPhase: number; driftSpeed: number;
    type: 'dot' | 'glow';
  }

  const particlesRef = useRef<Particle[]>([]);

  useEffect(() => {
    const html = document.documentElement;
    const isEnhanced = html.classList.contains('mode-enhanced');

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    // Respect prefers-reduced-motion
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motionQuery.matches) {
      return;
    }

    let isVisible = true;

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

    const isMobile = w < 768;
    const COUNT = isMobile ? Math.min(10, Math.floor(w / 80)) : Math.min(16, Math.floor(w / 70));

    particlesRef.current = Array.from({ length: COUNT }, () => {
      const isGlow = Math.random() < 0.35;
      return {
        x: Math.random() * w,
        y: Math.random() * h * 1.2,
        size: isGlow
          ? Math.random() * 2.5 + 1.5
          : Math.random() * 1.5 + 0.5,
        speedY: isGlow
          ? Math.random() * 0.15 + 0.06
          : Math.random() * 0.25 + 0.08,
        speedX: (Math.random() - 0.5) * 0.1,
        opacity: isGlow
          ? Math.random() * 0.14 + 0.06
          : Math.random() * 0.15 + 0.04,
        drift: Math.random() * 0.4 + 0.1,
        driftSpeed: Math.random() * 0.004 + 0.001,
        driftPhase: Math.random() * Math.PI * 2,
        type: isGlow ? 'glow' as const : 'dot' as const,
      };
    });

    // IntersectionObserver to pause when off-screen
    const intersectionObserver = new IntersectionObserver(
      ([entry]) => { isVisible = entry.isIntersecting; },
      { threshold: 0 }
    );
    if (containerRef.current) intersectionObserver.observe(containerRef.current);

    // Base colors (dark theme — green accent + cool blues)
    const baseR = 74, baseG = 222, baseB = 128;

    const animate = () => {
      if (!html.classList.contains('mode-enhanced')) {
        ctx.clearRect(0, 0, w, h);
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      if (!isVisible) {
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      ctx.clearRect(0, 0, w, h);

      for (const p of particlesRef.current) {
        p.y += p.speedY;
        p.driftPhase += p.driftSpeed;
        p.x += Math.sin(p.driftPhase) * p.drift * 0.3 + p.speedX;

        if (p.y > h + 15) { p.y = -15; p.x = Math.random() * w; }
        if (p.x < -15) p.x = w + 15;
        if (p.x > w + 15) p.x = -15;

        const r = baseR, g = baseG, b = baseB;

        if (p.type === 'glow') {
          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 5);
          grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${p.opacity * 0.5})`);
          grad.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${p.opacity * 0.15})`);
          grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 5, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();

          // Bright core
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 0.7, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${p.opacity * 1.1})`;
          ctx.fill();
        } else {
          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2);
          grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${p.opacity})`);
          grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
        }
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    animate();

    const observer = new MutationObserver(() => {
      if (!html.classList.contains('mode-enhanced')) {
        ctx.clearRect(0, 0, w, h);
      }
    });
    observer.observe(html, { attributes: true, attributeFilter: ['class'] });

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      intersectionObserver.disconnect();
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ opacity: 0.8 }}
        aria-hidden="true"
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TITULAR MONUMENTAL — «MENOS MALABARES. MÁS negocio.»
   ─────────────────────────────────────────────────────────────────────────
   Reveal tipográfico sincronizado en 3 tiempos:
     1. «MENOS» asciende (fade+rise, t≈0.15s).
     2. Las letras de «MALABARES.» entran DISPERSAS (offsets fijos) y se
        asientan en la línea base con spring escalonado (t≈0.32s→0.7s):
        la dispersión se ordena — el mensaje ES la animación.
     3. «MÁS negocio.» asciende tras una máscara (t≈0.9s): la promesa llega
        cuando el caos ya se ordenó. El acento verde es el remate.
   «MALABARES.» en hueco (hero-outline-word): lo que se deja atrás queda
   vacío; «negocio.» serif sólido: lo que se gana tiene cuerpo.
   ======================================================================== */
const MALABARES_LETTERS = 'MALABARES.'.split('');

/** Offsets deterministas de dispersión (sin Math.random → hidratación estable). */
const MALABARES_SCATTER: ReadonlyArray<{ x: number; y: number; r: number }> = [
  { x: -7, y: 24, r: -5.5 },
  { x: 5, y: -15, r: 6 },
  { x: -4, y: 19, r: -8 },
  { x: 9, y: -21, r: 4.5 },
  { x: -10, y: 13, r: -6.5 },
  { x: 6, y: -11, r: 8.5 },
  { x: -5, y: 21, r: -4.5 },
  { x: 8, y: -17, r: 6.5 },
  { x: -3, y: 15, r: -7.5 },
  { x: 4, y: -19, r: 7.5 },
];

/* ═══════════════════════════════════════════════════════════════════════════
   ADN-LANDING-HERO-AND-PAGER-FIX-004 §4.1 — LA MARCA FIRMA EL MENSAJE
   ─────────────────────────────────────────────────────────────────────────
   Problema (diagnóstico de la misión): el nombre ADNegocio solo existía como
   logotipo pequeño del header; el peso visual recaía en «negocio.» del
   eslogan — el visitante recordaba la frase, no el producto.

   Composición elegida (evaluadas tres alternativas, ver expediente §HERO):
     A1 «La marca abre»  — marca sobre el titular (clásica, menos memorable)
     A2 «La firma»       — ELEGIDA: la marca es la pieza protagónica de la
       columna principal, entre el titular y la promesa — ocupa la zona muerta
       que separaba titular y subtítulo (vacío accidental → pieza intencional)
       y queda cerca del centro óptico del hero.
     B  «Fusión»         — «MÁS ADNegocio.» alteraba el eslogan aprobado:
       DESCARTADA (no se modifica texto de misión 002 sin justificación).

   Narrativa de la animación: el caos se ordena (MALABARES disperso se asienta)
   → la promesa llega (MÁS negocio.) → la firma revela QUIÉN lo hace
   (ADNegocio por máscara ascendente, 0.78s). La marca es el remate:
   el mensaje firma el nombre. Reduced-motion: visible sin animar.

   Identidad: MISMO BrandWordmark del sidebar autenticado (ADN verde +
   egocio blanco, Space Grotesk bold) — sin segunda identidad gráfica.
   La descendente de la «g» exige máscara con pb 0.3em (lección §4 de la
   misión 003: el overflow-hidden recorta tinta si el padding no la cubre).
   ======================================================================== */
function HeroBrandSignOff() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="mt-[clamp(12px,2.2svh,32px)] flex items-center gap-5 [@media(max-height:950px)]:mt-[clamp(6px,1.2svh,18px)] [@media(max-height:760px)]:mt-1!">
      <span className="h-px w-9 sm:w-14 bg-[#22c55e]/55 shrink-0" aria-hidden="true" />
      <span className="block overflow-hidden pb-[0.3em] -mb-[0.22em]">
        <motion.span
          className="block"
          initial={reduceMotion ? false : { y: '148%' }}
          animate={{ y: '0%' }}
          transition={{ delay: 0.78, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <BrandWordmark
            className="inline-block font-[family-name:var(--font-space-grotesk)] font-bold tracking-[-0.03em] leading-[1.04] text-[clamp(2.7rem,5vw,4.9rem)] [@media(max-height:920px)]:text-[clamp(2.5rem,4.6vw,4.5rem)] select-none"
          />
        </motion.span>
      </span>
    </div>
  );
}

function HeroHeadline() {
  const reduceMotion = useReducedMotion();

  return (
    <h1 className="font-[family-name:var(--font-display)] font-black [font-stretch:125%] tracking-[-0.045em] leading-[0.94] text-[clamp(2.35rem,10.5vw,6.5rem)] sm:text-[clamp(2.8rem,6.6vw,6.6rem)] [@media(min-width:640px)_and_(max-height:950px)]:text-[clamp(2.5rem,5.4vw,5.4rem)] [@media(min-width:640px)_and_(max-height:820px)]:text-[clamp(2.3rem,4.9vw,4.9rem)] [@media(min-width:640px)_and_(max-height:760px)]:text-[clamp(2.05rem,4.35vw,4.35rem)]! text-white select-none">
      {/* Nombre accesible completo; la capa visual es decorativa (letras
          separadas por spans no se leen bien en SR). */}
      <span className="sr-only">MENOS MALABARES. MÁS NEGOCIO.</span>
      <span aria-hidden="true">
        {/* Línea 1 — MENOS (sólido) + MALABARES. (hueco, se asienta).
            En móvil cada palabra es su propia línea monumental (el ancho de
            390px no cabe la línea completa y una palabra partida a mitad es
            inaceptable); desde sm vuelven a la misma línea. */}
        <span className="block">
          <motion.span
            className="inline-block"
            initial={reduceMotion ? false : { opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.12 }}
          >
            MENOS&nbsp;
          </motion.span>
          {/* whitespace-nowrap: la palabra MALABARES. es UNA unidad — el quiebre
              de línea solo puede ocurrir antes de la palabra (límite de
              palabra), jamás entre letterforms (evita «MA / LABARES.» en
              cualquier viewport; el tamaño fluido 7.2vw/cap 7.2rem mantiene la
              línea completa «MENOS MALABARES.» dentro del contenedor). */}
          <span className="block sm:inline whitespace-nowrap">
            {MALABARES_LETTERS.map((ch, i) => (
              <motion.span
                key={`${ch}-${i}`}
                className="hero-outline-word inline-block"
                initial={reduceMotion ? false : {
                  opacity: 0,
                  x: MALABARES_SCATTER[i].x,
                  y: MALABARES_SCATTER[i].y,
                  rotate: MALABARES_SCATTER[i].r,
                }}
                animate={{ opacity: 1, x: 0, y: 0, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 220, damping: 20, delay: 0.3 + i * 0.042, mass: 0.9 }}
              >
                {ch}
              </motion.span>
            ))}
          </span>
        </span>
        {/* Línea 2 — MÁS + negocio. (serif italic verde, máscara ascendente).
            ADN-LANDING-FINAL-POLISH-003 §4: la descendente de la «g» de
            «negocio.» (Instrument Serif) desborda la caja de línea (leading
            0.9 < 1) — el padding inferior de la máscara debe cubrir la tinta
            real (≈0.29em) o el overflow-hidden la recorta. El margen negativo
            compensa el padding para no alterar el ritmo vertical, y el punto
            de partida del reveal se recalcula (y ≥ 1 + pb/alturaDeLínea) para
            que la línea siga oculta al inicio de la animación. */}
        <span className="block overflow-hidden pb-[0.34em] -mb-[0.34em] md:ml-[0.08em]">
          <motion.span
            className="block"
            initial={reduceMotion ? false : { y: '146%' }}
            animate={{ y: '0%' }}
            transition={{ delay: 0.92, duration: 0.95, ease: [0.16, 1, 0.3, 1] }}
          >
            MÁS&nbsp;
            <em className="font-[family-name:var(--font-editorial)] italic font-normal text-[#22c55e] text-[1.07em] leading-[0.9] pr-[0.08em]">
              negocio.
            </em>
          </motion.span>
        </span>
      </span>
    </h1>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   LOS CUATRO MALABARES — pieza editorial ESTÁTICA del hero (decorativa,
   aria-hidden; lectura accesible completa vía sr-only en el bloque padre)
   ─────────────────────────────────────────────────────────────────────────
   ADN-LANDING-FINAL-POLISH-003 §5:
   - ELIMINADO por completo el movimiento vertical cíclico (la flotación
     `y:[0,-6,0] repeat:Infinity` del diseño anterior) y con él cualquier
     bucle, marquee o retorno: la pieza es ESTÁTICA — sin framer-motion —
     y se lee perfecta desde la primera pintura, con o sin movimiento.
   - Composición asimétrica tipo mesa de edición: los cuatro problemas reales
     conviven en una misma escena y cada uno tiene identidad gráfica propia:
       N.01 ventas en cuadernos   → papel pautado con margen de cuaderno
       N.02 inventario en papel   → retícula de hoja de control (celdas)
       N.03 costos a ojo          → anotación serif con subrayado manual
       N.04 deudas en chats       → fragmento de conversación (burbuja)
   - Recursos sobrios: numeración editorial, hairlines, un solo acento verde.
   - Rotaciones ligeras FIJAS (±1.5°): transmiten el desorden sin animar nada.
   - Posiciones en % sobre un contenedor con aspect-ratio: la composición
     escala sin solapes de 1024 a 1920 (validado en RESPONSIVE_VISUAL_VALIDATION).
   ======================================================================== */
const SHEET_CELLS: ReadonlyArray<'tick' | 'cross' | 'blank'> = [
  'tick', 'blank', 'blank', 'cross',
  'blank', 'tick', 'blank', 'blank',
  'cross', 'blank', 'blank', 'tick',
  'blank', 'cross', 'blank', 'blank',
];

function SceneLabel({ n, context, className = '' }: { n: string; context: string; className?: string }) {
  return (
    <span
      className={`absolute -top-[9px] bg-[#05070A] px-2 font-mono text-[9px] uppercase tracking-[0.28em] text-white/35 ${className}`}
    >
      {n} — {context}
    </span>
  );
}

function ProblemsEditorialScene({ exitProgress }: { exitProgress?: MotionValue<number> | null }) {
  /* ADN-005 — coreografía de salida: al consumirse el pasillo del Acto 1, los
     cuatro fragmentos del caos SE RECOGEN hacia la línea ADN (borde derecho)
     — «lo disperso → un solo sistema». Sin progreso de salida (móvil,
     reduced-motion, flujo) la pieza permanece ESTÁTICA (misión 003 §5). */
  return (
    <div
      aria-hidden="true"
      className="relative hidden lg:block w-full max-w-[440px] aspect-[440/330] select-none [@media(max-height:800px)_and_(min-height:761px)]:max-w-[390px]! [@media(max-height:760px)_and_(min-height:661px)]:max-w-[340px]! [@media(max-height:660px)]:max-w-[300px]!"
    >
      {/* Marcas de registro — la mesa de edición */}
      <span className="absolute top-0 left-0 h-3 w-3 border-t border-l border-white/20" />
      <span className="absolute top-0 right-0 h-3 w-3 border-t border-r border-white/20" />
      <span className="absolute bottom-0 left-0 h-3 w-3 border-b border-l border-white/20" />
      <span className="absolute bottom-0 right-0 h-3 w-3 border-b border-r border-white/20" />

      {/* N.01 — ventas en cuadernos: papel pautado con margen verde */}
      <DriftFragment
        mv={exitProgress}
        className="absolute left-[0%] top-[1%] w-[52%] rotate-[-1.5deg]"
        base={-1.5}
        x={70} y={-44} r={-2}
        range={[0.05, 0.62]}
      >
        <div
          className="relative border border-white/[0.09] bg-white/[0.02] px-4 pb-4 pt-3"
          style={{
            backgroundImage:
              'repeating-linear-gradient(to bottom, transparent 0px, transparent 23px, rgba(255,255,255,0.055) 23px, rgba(255,255,255,0.055) 24px)',
          }}
        >
          <span className="absolute bottom-0 top-0 left-[26px] w-px bg-[#22c55e]/35" />
          <SceneLabel n="N.01" context="cuaderno" className="left-3" />
          <p className="pl-7 pt-[2px] font-[family-name:var(--font-editorial)] italic text-white/85" style={{ fontSize: 'clamp(20px, 2.1vw, 27px)', lineHeight: 1.15 }}>
            ventas en<br />cuadernos
          </p>
        </div>
      </DriftFragment>

      {/* N.02 — inventario en papel: hoja de control con celdas */}
      <DriftFragment
        mv={exitProgress}
        className="absolute right-[1%] top-[28%] w-[45%] rotate-[1.25deg]"
        base={1.25}
        x={120} y={-12} r={1.5}
        range={[0.16, 0.72]}
      >
        <div className="relative border border-white/[0.09] bg-white/[0.02] p-3">
          <SceneLabel n="N.02" context="papel" className="left-3" />
          <p className="mb-2.5 mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-white/55">
            inventario<br />en papel
          </p>
          <div className="grid grid-cols-4 border border-white/[0.09]">
            {SHEET_CELLS.map((cell, i) => (
              <span
                key={i}
                className="flex h-[22px] items-center justify-center border border-white/[0.07] font-mono text-[10px]"
              >
                {cell === 'tick' && <span className="text-[#22c55e]">✓</span>}
                {cell === 'cross' && <span className="text-white/30">×</span>}
              </span>
            ))}
          </div>
        </div>
      </DriftFragment>

      {/* N.03 — costos a ojo: anotación serif con subrayado manual (SVG fijo) */}
      <DriftFragment
        mv={exitProgress}
        className="absolute left-[7%] top-[58%] w-[46%] rotate-[-0.75deg]"
        base={-0.75}
        x={150} y={-72} r={-2.5}
        range={[0.28, 0.86]}
      >
        <div className="relative pt-1">
          <SceneLabel n="N.03" context="estimación" className="left-2" />
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/55">costos</p>
          <p className="font-[family-name:var(--font-editorial)] italic text-white/85" style={{ fontSize: 'clamp(30px, 3vw, 42px)', lineHeight: 1.05 }}>
            a ojo
          </p>
          <svg viewBox="0 0 120 10" className="mt-0.5 h-[9px] w-[46%]" preserveAspectRatio="none">
            <path d="M2 7 Q 30 2.5 60 6 T 118 4.5" fill="none" stroke="#22c55e" strokeWidth="2.4" strokeLinecap="round" opacity="0.9" />
          </svg>
        </div>
      </DriftFragment>

      {/* N.04 — deudas en chats: fragmento de conversación (puntos estáticos) */}
      <DriftFragment
        mv={exitProgress}
        className="absolute bottom-[8%] right-[2%] w-[52%] rotate-[1deg]"
        base={1}
        x={190} y={30} r={2}
        range={[0.34, 0.95]}
      >
        <div className="relative rounded-2xl rounded-bl-sm border border-white/[0.11] bg-white/[0.03] px-4 py-3">
          <SceneLabel n="N.04" context="chats" className="right-3" />
          <p className="font-mono text-[11px] leading-relaxed text-white/65">
            deudas <span className="text-white/40">en</span> chats
          </p>
          <span className="mt-2 flex gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
            <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
            <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
          </span>
        </div>
      </DriftFragment>

      {/* Pie editorial — el mensaje aprobado, en la base de la mesa */}
      <DriftFragment
        mv={exitProgress}
        className="absolute bottom-0 left-[7%] font-mono text-[10px] uppercase tracking-[0.26em] text-white/40"
        fadeOnly
        range={[0.1, 0.55]}
      >
        Lo disperso — <span className="text-[#22c55e]">un solo sistema</span>
      </DriftFragment>
    </div>
  );
}

/* Fragmento del caos que SE RECOGE hacia la línea ADN durante la salida del
   Acto 1 (solo escritorio con movimiento). Sin `mv` (móvil / reduced-motion)
   renderiza el div estático ORIGINAL — píxel-idéntico a la misión 003.
   El motion.div hereda el className completo: la rotación base viaja en el
   transform inline (mismo ángulo que la clase en reposo → píxel-idéntico). */
function DriftFragment({
  mv, className, base = 0, x = 0, y = 0, r = 0, range, fadeOnly = false,
  children,
}: {
  mv?: MotionValue<number> | null;
  className: string;
  base?: number;
  x?: number;
  y?: number;
  r?: number;
  range: [number, number];
  fadeOnly?: boolean;
  children: React.ReactNode;
}) {
  /* Hooks estables: si no hay progreso se usa un MotionValue neutro. */
  const neutral = useMotionValue(0);
  const source = mv ?? neutral;
  const translate = useTransform(
    source,
    range,
    [`rotate(${base}deg)`, `translate3d(${x}px, ${y}px, 0px) rotate(${base + r}deg)`],
  );
  const opacity = useTransform(source, range, [1, 0.06]);

  if (!mv) return <div className={className}>{children}</div>;

  return (
    <motion.div
      aria-hidden="true"
      className={className}
      style={fadeOnly ? { opacity } : { transform: translate, opacity }}
    >
      {children}
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CINTA EDITORIAL — módulos REALES de la plataforma (sin datos inventados)
   Pausa al hover; estática con prefers-reduced-motion (CSS en globals.css).
   ======================================================================== */
const TICKER_ITEMS: ReadonlyArray<string> = [
  'Estados financieros',
  'Ventas',
  'Punto de venta',
  'Inventario',
  'Almacén',
  'Compras',
  'Proveedores y clientes',
  'Ficha de costo',
  'Multi-tienda',
  'Reportes y analítica',
  'Documentos',
];

function LandingTicker() {
  return (
    <div aria-hidden="true" className="landing-ticker relative overflow-hidden border-t border-white/[0.06] py-2">
      <div className="landing-ticker-track flex w-max">
        {[0, 1].map((half) => (
          <div key={half} className="flex items-center">
            {TICKER_ITEMS.map((item) => (
              <span
                key={`${half}-${item}`}
                className="inline-flex items-center gap-3 whitespace-nowrap px-6 font-mono text-[10px] uppercase tracking-[0.26em] text-white/[0.42]"
              >
                <span className="h-1 w-1 rounded-full bg-[#22c55e]/70" />
                {item}
              </span>
            ))}
          </div>
        ))}
      </div>
      {/* Desvanecido en los bordes (la cinta nace y muere en el fondo) */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-[#05070A] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#05070A] to-transparent" />
    </div>
  );
}

export interface HeroSectionProps {
  heroInView: boolean;
  showMobileNav: boolean;
  leftPanelRef: React.RefObject<HTMLDivElement | null>;
  heroRef: React.RefObject<HTMLDivElement | null>;
  animatedStatsRef?: React.RefObject<HTMLDivElement | null>;
  setShowLoginModal: (v: boolean) => void;
  setShowMobileNav: (v: boolean) => void;
  setShowCommandPalette?: (v: boolean) => void;
  setLoginDefaultTab?: (tab: 'login' | 'register') => void;
  onOpenDemo?: () => void;
  /* ADN-005 — progreso de salida del Acto 1 (0→1 durante el pasillo fijado).
     Solo presente en escritorio con movimiento permitido; los fragmentos del
     caos se recogen hacia la línea ADN con este valor. */
  exitProgress?: MotionValue<number> | null;
}

export default function HeroSection({
  heroInView,
  showMobileNav,
  leftPanelRef,
  heroRef,
  animatedStatsRef,
  setShowLoginModal,
  setShowMobileNav,
  setShowCommandPalette,
  setLoginDefaultTab,
  onOpenDemo,
  exitProgress,
}: HeroSectionProps) {
  const [searchFocused, setSearchFocused] = React.useState(false);
  const reduceMotion = useReducedMotion();

  // FIX #006: Search input connected to Command Palette via prop
  const handleSearchFocus = () => {
    setSearchFocused(true);
    // Notify parent to open Command Palette
    if (setShowCommandPalette) setShowCommandPalette(true);
  };

  const handleSearchBlur = () => setSearchFocused(false);

  /* ADN-005: este componente ES la escena del Acto 1 — llena la caja fijada
     (h-full dentro de .act-scene--pinned). El header fijo ya no vive aquí:
     un ancestro con transform convierte position:fixed en absoluto, así que
     LandingHeader se renderiza en la raíz de LandingPage (chrome
     persistente de todo el recorrido). El espacio del header se compensa
     con el padding superior del contenido. */
  return (
    <div ref={leftPanelRef} className="relative w-full min-h-[100svh] bg-[#05070A]">
      {/* ── Hero viewport (escena del Acto 1) ──
          La caja fijada es 100svh (ActStage); el contenido se organiza dentro
          con ritmo basado en svh para caber completo sin recortes en alturas
          de escritorio 700–1100px (el selector de caminos comprime su paso
          vertical antes que desaparecer contenido). overflow-hidden contiene
          la dispersión tipográfica/chips sin generar scroll horizontal. */}
      <div className="relative w-full min-h-[100svh] overflow-hidden">

        {/* ── Layer 1: retícula estructural (ref. Grids/Anduril) — el orden
              espacial es el fondo del mensaje: nada de fotos de stock. ── */}
        <div className="hero-grid-bg absolute inset-0 pointer-events-none" aria-hidden="true" />

        {/* ── Layer 2: un solo glow verde + un contrapeso neutro ── */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          <div
            className="absolute -top-[18%] right-[-12%] w-[58vw] h-[75vh] rounded-full"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(34,197,94,0.11) 0%, rgba(34,197,94,0.05) 35%, transparent 68%)',
              filter: 'blur(64px)',
            }}
          />
          <div
            className="absolute bottom-[-22%] left-[-10%] w-[42vw] h-[52vh] rounded-full"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.05) 0%, transparent 65%)',
              filter: 'blur(56px)',
            }}
          />
        </div>

        {/* ── Layer 3: partículas controladas (mode-enhanced, reduced-motion safe) ── */}
        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
          <ParticleRain />
        </div>

        {/* ── Content layer ──
            ADN-005: el PROMO BANNER salió de la escena — es chrome global del
            landing y ahora vive en la raíz (LandingPage), justo bajo el header.
            Dentro de la escena fijada quedaba solapado con el header y además
            consumía 36px del presupuesto de 100svh. */}
        <div className="relative z-10 flex flex-col min-h-[100svh]">
          {/* FIX-ENTRY B1 (2026-09-20): menú móvil único = drawer de LandingPage. */}

          {/* ── HERO EDITORIAL (asimétrico, alineado a la izquierda) ── */}
          {/* ADN-005: el id "hero" vive ahora en el WRAPPER del acto (ActStage)
              — posiciones estables para pager/scrollspy/E2E aunque la escena
              esté fijada. heroRef se conserva para el IntersectionObserver. */}
          <div ref={heroRef} className="flex-1 flex flex-col justify-center px-6 sm:px-10 lg:px-16 xl:px-20 pt-[0.6svh] pb-[0.4svh]">
            <div className="w-full max-w-[1360px] mx-auto">

              {/* Eyebrow mono — declaración de categoría (ref. North) */}
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center gap-3.5 mb-[clamp(8px,1.6svh,28px)] [@media(max-height:760px)]:mb-1.5!"
              >
                <span className="h-2 w-2 rounded-full bg-[#22c55e] shadow-[0_0_14px_rgba(34,197,94,0.85)] shrink-0" aria-hidden="true" />
                <span className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.32em] text-white/50">
                  Plataforma de gestión empresarial — multi-tienda
                </span>
              </motion.div>

              {/* Titular monumental (la animación ES la narrativa) */}
              <HeroHeadline />

              {/* Propuesta + acción | pieza «del caos al orden»
                  ADN-LANDING-HERO-AND-PAGER-FIX-004 (ciclo 2): items-start —
                  la pila marca→promesa→CTAs abraza el titular (items-center la
                  centraba contra la escena alta y recreaba el vacío que la
                  firma debía eliminar). */}
              <div className="mt-[clamp(14px,2.6svh,40px)] grid lg:grid-cols-12 lg:gap-10 items-start [@media(max-height:950px)]:mt-[clamp(6px,1.4svh,22px)] [@media(max-height:760px)]:mt-[clamp(4px,0.9svh,12px)]!">
                <div className="lg:col-span-7">
                  {/* ADN-LANDING-HERO-AND-PAGER-FIX-004 §4.1 — LA FIRMA:
                      la marca ocupa el vacío entre titular y promesa (era la
                      zona muerta de la composición anterior) y queda cerca
                      del centro óptico. Primer pantallazo = nombre + mensaje. */}
                  <HeroBrandSignOff />

                  {/* Subtítulo — la promesa concreta, sin estadísticas inventadas */}
                  <motion.p
                    initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.08, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                    className="mt-[clamp(12px,2.2svh,30px)] max-w-xl text-base sm:text-lg text-white/60 leading-relaxed [@media(max-height:950px)]:max-w-2xl [@media(max-height:950px)]:text-base [@media(max-height:760px)]:mt-[clamp(6px,1.1svh,14px)]! [@media(max-height:760px)]:text-sm!"
                  >
                    Las operaciones de tu empresa dejan de estar dispersas —inventario,
                    ventas, costos, documentos— y empiezan a funcionar como{' '}
                    <span className="text-white/90 font-medium">un solo sistema</span>.
                  </motion.p>

                  {/* CTAs — principal (entrar) + secundario (conocer) */}
                  <motion.div
                    initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.22, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                    className="mt-[clamp(12px,2.4svh,32px)] flex flex-col sm:flex-row sm:items-center gap-3.5 [@media(max-height:950px)]:mt-[clamp(6px,1.4svh,20px)] [@media(max-height:760px)]:mt-[clamp(4px,0.9svh,12px)]! [@media(max-height:760px)]:gap-2.5!"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        void entrarACostpro({
                          openLogin: () => {
                            if (setLoginDefaultTab) setLoginDefaultTab('login');
                            setShowLoginModal(true);
                          },
                          setLoginDefaultTab,
                        });
                      }}
                      className="group inline-flex items-center justify-center gap-2.5 min-h-[50px] [@media(max-height:760px)]:min-h-[44px]! px-8 rounded-xl bg-[#22c55e] text-[#05070A] text-sm font-bold transition-all hover:bg-[#4ade80] hover:-translate-y-0.5 motion-reduce:transform-none shadow-[0_10px_36px_rgba(34,197,94,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22c55e]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#05070A]"
                    >
                      Entrar a la plataforma
                      <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transform-none" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => document.querySelector('#features')?.scrollIntoView({ behavior: 'smooth' })}
                      className="inline-flex items-center justify-center gap-2 min-h-[50px] [@media(max-height:760px)]:min-h-[44px]! px-8 rounded-xl border border-white/[0.14] text-white/85 text-sm font-semibold transition-all hover:bg-white/[0.05] hover:border-white/25 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#05070A]"
                    >
                      Conocer las funcionalidades
                    </button>
                  </motion.div>
                </div>

                {/* Pieza memorable ESTÁTICA (ADN-LANDING-FINAL-POLISH-003 §5):
                    los cuatro malabares como fragmentos editoriales sobre la
                    mesa — sin bucles ni movimiento automático */}
                <div className="lg:col-span-5 mt-10 lg:mt-0 flex items-center">
                  <ProblemsEditorialScene exitProgress={exitProgress} />
                </div>
              </div>

              {/* ── SELECTOR DE TRES CAMINOS (FIX-ENTRY 2026-09-20) ──
                  Una decisión, tres intenciones — NO tres botones iguales.
                  Jerarquía derivada del usuario, no arbitraria:
                    1. Ficha de Costo (PRIMARIA)   → la única promesa «gratis» real.
                    2. Entrar a ADNegocio (SECUNDARIA) → plataforma completa, requiere cuenta.
                    3. Ver demostración (EXPLORATORIA) → conocer el producto, sin registro.
                  Reestilo editorial: numeración mono, hairline y flecha — la
                  estructura (eyebrow + título + descripción + acción) conserva la
                  diferenciación accesible; 1 tab stop por tarjeta, target ≥44px. */}
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.42, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                className="mt-[clamp(14px,2.6svh,44px)] w-full [@media(max-height:950px)]:mt-[clamp(6px,1.4svh,22px)] [@media(max-height:760px)]:mt-[clamp(4px,0.9svh,12px)]!"
              >
                {/* ADN-005: cabecera del selector fusionada con la navegación
                    secundaria (búsqueda ⌘K + explorar) — una sola fila, la
                    búsqueda abre la misma paleta que antes. */}
                <div className="flex items-center gap-4 sm:gap-5 mb-4 [@media(max-height:1100px)]:mb-2 [@media(max-height:950px)]:mb-2">
                  <h2 className="text-base sm:text-lg font-semibold text-white/85 tracking-tight whitespace-nowrap">
                    ¿Qué quieres hacer?
                  </h2>
                  <span className="h-px flex-1 bg-white/[0.08]" aria-hidden="true" />
                  <div
                    className={`relative hidden sm:flex items-center gap-2.5 px-3.5 py-2 rounded-lg border transition-all duration-300 w-64 ${
                      searchFocused
                        ? 'bg-white/[0.05] border-[#22c55e]/40 shadow-[0_0_24px_rgba(34,197,94,0.07)]'
                        : 'bg-white/[0.03] border-white/[0.08] hover:border-white/[0.16]'
                    }`}
                  >
                    <Search className="w-3.5 h-3.5 text-white/30 shrink-0" />
                    <input
                      type="text"
                      placeholder="Buscar en la plataforma…"
                      className="flex-1 min-w-0 bg-transparent font-mono text-[11px] text-white/70 placeholder-white/30 outline-none"
                      onFocus={handleSearchFocus}
                      onBlur={handleSearchBlur}
                      readOnly
                      aria-label="Buscar funciones"
                    />
                    <kbd className="flex items-center px-1.5 py-0.5 rounded-md bg-white/[0.05] border border-white/[0.08] text-[9px] text-white/35 font-mono">
                      ⌘K
                    </kbd>
                  </div>
                  <button
                    type="button"
                    onClick={() => document.querySelector('#features')?.scrollIntoView({ behavior: 'smooth' })}
                    className="group hidden md:flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded-md"
                    aria-label="Explorar funcionalidades"
                  >
                    <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/40 group-hover:text-white/70 transition-colors">
                      Explorar
                    </span>
                    <motion.span
                      animate={reduceMotion ? undefined : { y: [0, 5, 0] }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                      className="inline-flex"
                    >
                      <ChevronDown className="w-4 h-4 text-white/40 group-hover:text-white/70 transition-colors" />
                    </motion.span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 text-left">

                  {/* ── CAMINO 1 · PRIMARIA — Ficha de Costo gratis ── */}
                  <motion.a
                    href="/fc/"
                    data-testid="path-ficha-costo"
                    aria-label="Ficha de Costo gratis, módulo de ADNegocio. Crea y calcula fichas conforme a la Resolución 148 de 2023, con tu cuenta de Google o como invitado."
                    onClick={(e) => {
                      e.preventDefault();
                      void enterFichaDeCosto(() => { if (setLoginDefaultTab) setLoginDefaultTab('login'); setShowLoginModal(true); });
                    }}
                    className="group relative flex flex-col rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 [@media(max-height:1100px)]:py-3 [@media(max-height:950px)]:py-2.5 [@media(max-height:760px)]:py-2! transition-all duration-300 hover:border-[#22c55e]/45 hover:bg-white/[0.045] hover:-translate-y-0.5 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22c55e]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#05070A]"
                  >
                    <span className="flex items-center justify-between mb-5 [@media(max-height:1100px)]:mb-2.5" aria-hidden="true">
                      <span className="w-9 h-9 rounded-lg border border-white/10 bg-white/[0.04] flex items-center justify-center">
                        <Calculator className="w-[18px] h-[18px] text-[#22c55e]" strokeWidth={1.5} />
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full border border-[#22c55e]/40 text-[10px] font-bold uppercase tracking-widest text-[#22c55e]">
                        Gratis
                      </span>
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40 mb-2" aria-hidden="true">
                      01 — Ficha de Costo · Res. 148/2023
                    </span>
                    <span className="text-lg font-bold text-white tracking-tight mb-1.5 [@media(max-height:1100px)]:text-base [@media(max-height:660px)]:text-sm!">
                      Ficha de Costo gratis
                    </span>
                    <span className="text-[13px] leading-relaxed text-white/55 mb-6 [@media(max-height:1100px)]:mb-2.5 [@media(max-height:1100px)]:line-clamp-2 [@media(max-height:760px)_and_(min-height:661px)]:text-xs! [@media(max-height:660px)]:text-[11px]!">
                      Crea y calcula fichas conforme a la Res. 148/2023. Con tu cuenta de Google o como invitado — sin instalar nada.
                    </span>
                    <span className="mt-auto inline-flex items-center gap-2 text-sm font-bold text-[#22c55e] [@media(max-height:760px)_and_(min-height:661px)]:text-xs! [@media(max-height:660px)]:text-[11px]!" aria-hidden="true">
                      Crear ficha gratis
                      <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transform-none" />
                    </span>
                  </motion.a>

                  {/* ── CAMINO 2 · SECUNDARIA — Entrar a ADNegocio ── */}
                  <motion.a
                    href="/"
                    data-testid="path-costpro"
                    aria-label="Entrar a ADNegocio, la plataforma completa: tiendas, inventario, punto de venta y vitrina digital. Requiere cuenta."
                    onClick={(e) => {
                      e.preventDefault();
                      // CP-AUTH-RESILIENCE-003 (2026-11-08): el CTA «Entrar a la plataforma»
                      // JAMÁS recarga ni navega con `window.location.assign('/')`.
                      // Antes confiaba en la PRESENCIA de `sb-*-auth-token` (no prueba
                      // de autenticación): con un token residual/vencido, la
                      // verificación del shell expulsaba al landing de nuevo y el
                      // usuario quedaba atrapado en recargas sin ver el modal.
                      // Ahora: recuperación real vía Supabase Auth
                      // (src/lib/auth-recovery.ts) — sesión válida → shell reactivo;
                      // irrecuperable → limpieza controlada + modal; auth caída →
                      // modal con reconexión. El modal queda SIEMPRE disponible.
                      void entrarACostpro({
                        openLogin: () => {
                          if (setLoginDefaultTab) setLoginDefaultTab('login');
                          setShowLoginModal(true);
                        },
                        setLoginDefaultTab,
                      });
                    }}
                    className="group relative flex flex-col rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 [@media(max-height:1100px)]:py-3 [@media(max-height:950px)]:py-2.5 [@media(max-height:760px)]:py-2! transition-all duration-300 hover:border-[#22c55e]/45 hover:bg-white/[0.045] hover:-translate-y-0.5 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22c55e]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#05070A]"
                  >
                    <span className="flex items-center justify-between mb-5 [@media(max-height:1100px)]:mb-2.5" aria-hidden="true">
                      <span className="w-9 h-9 rounded-lg border border-white/10 bg-white/[0.04] flex items-center justify-center">
                        <LayoutGrid className="w-[18px] h-[18px] text-white/65" strokeWidth={1.5} />
                      </span>
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40 mb-2" aria-hidden="true">
                      02 — Plataforma completa
                    </span>
                    <span className="text-lg font-bold text-white tracking-tight mb-1.5 [@media(max-height:1100px)]:text-base [@media(max-height:660px)]:text-sm!">
                      Entrar a ADNegocio
                    </span>
                    <span className="text-[13px] leading-relaxed text-white/55 mb-6 [@media(max-height:1100px)]:mb-2.5 [@media(max-height:1100px)]:line-clamp-2 [@media(max-height:760px)_and_(min-height:661px)]:text-xs! [@media(max-height:660px)]:text-[11px]!">
                      Gestiona todas tus tiendas: inventario, punto de venta, reportes y vitrina digital en un solo lugar.
                    </span>
                    <span className="mt-auto inline-flex items-center gap-2 text-sm font-bold text-[#22c55e] [@media(max-height:760px)_and_(min-height:661px)]:text-xs! [@media(max-height:660px)]:text-[11px]!" aria-hidden="true">
                      Entrar
                      <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transform-none" />
                    </span>
                  </motion.a>

                  {/* ── CAMINO 3 · EXPLORATORIA — Ver demostración ── */}
                  <motion.button
                    type="button"
                    data-testid="path-demo"
                    aria-label="Ver demostración de ADNegocio: recorre la plataforma en dos minutos, sin registro."
                    onClick={onOpenDemo}
                    className="group relative flex flex-col rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 [@media(max-height:1100px)]:py-3 [@media(max-height:950px)]:py-2.5 [@media(max-height:760px)]:py-2! transition-all duration-300 hover:border-[#22c55e]/45 hover:bg-white/[0.045] hover:-translate-y-0.5 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#05070A] text-left cursor-pointer"
                  >
                    <span className="flex items-center justify-between mb-5 [@media(max-height:1100px)]:mb-2.5" aria-hidden="true">
                      <span className="w-9 h-9 rounded-lg border border-white/10 bg-white/[0.04] flex items-center justify-center">
                        <PlayCircle className="w-[18px] h-[18px] text-white/65" strokeWidth={1.5} />
                      </span>
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40 mb-2" aria-hidden="true">
                      03 — Sin registro
                    </span>
                    <span className="text-lg font-bold text-white tracking-tight mb-1.5 [@media(max-height:1100px)]:text-base [@media(max-height:660px)]:text-sm!">
                      Ver demostración
                    </span>
                    <span className="text-[13px] leading-relaxed text-white/55 mb-6 [@media(max-height:1100px)]:mb-2.5 [@media(max-height:1100px)]:line-clamp-2 [@media(max-height:760px)_and_(min-height:661px)]:text-xs! [@media(max-height:660px)]:text-[11px]!">
                      Recorre la plataforma en 2 minutos y descubre cómo automatiza tus fichas de costo.
                    </span>
                    <span className="mt-auto inline-flex items-center gap-2 text-sm font-bold text-white/85 group-hover:text-white transition-colors" aria-hidden="true">
                      Ver demo
                      <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transform-none" />
                    </span>
                  </motion.button>
                </div>
              </motion.div>

              {/* ADN-005: la búsqueda (⌘K) y «Explorar» viven ahora en la
                  cabecera del selector de caminos (una sola fila editorial).
                  La cinta inferior conserva el ritmo al pie de la escena. */}

            </div>
          </div>

          {/* Cinta editorial de módulos reales — ritmo al pie del hero */}
          <LandingTicker />
        </div>

        {/* ── Bottom gradient fade — transición al siguiente bloque; altura
              contenida para no apagar la cinta editorial del pie del hero ── */}
        <div
          className="absolute bottom-0 left-0 right-0 h-24 z-10 pointer-events-none"
          style={{
            background: 'linear-gradient(to bottom, transparent 0%, rgba(5,7,10,0.5) 55%, #05070A 100%)',
          }}
          aria-hidden="true"
        />
      </div>{/* end hero viewport */}

      {/* ADN-005: las secciones restantes ya no cuelgan del hero — cada una es
          su propio acto (ActStage en LandingPage). La escena del Acto 1 es
          EXACTAMENTE un viewport. */}
    </div>
  );
}
