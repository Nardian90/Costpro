'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import {
  ChevronDown, ArrowRight,
  Search, Shield, X,
  Calculator, LayoutGrid, PlayCircle,
} from 'lucide-react';
import { enterFichaDeCosto, hasCostproSession } from '@/lib/fcEntry';

/* ── Typewriter Text Component ── */
function TypewriterText({ text, start, className }: { text: string; start: boolean; className?: string }) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!start) return;
    let i = 0;
    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplayed(text.slice(0, i + 1));
        i++;
      } else {
        clearInterval(interval);
        setDone(true);
      }
    }, 30);
    return () => clearInterval(interval);
  }, [start, text]);

  return (
    <span className={className}>
      {displayed}
      {!done && (
        <span className="inline-block w-0.5 h-5 bg-[#22c55e] ml-0.5 align-middle animate-cursor-blink" />
      )}
    </span>
  );
}

/* ── Green orb / glow particle component ── */
function GreenOrb({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="absolute inset-0 rounded-full bg-[#22c55e]/20 blur-2xl" />
      <div className="absolute inset-[20%] rounded-full bg-[#22c55e]/30 blur-xl" />
      <div className="absolute inset-[40%] rounded-full bg-[#22c55e]/50 blur-md" />
    </div>
  );
}

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
  children?: React.ReactNode;
  bottomContent?: React.ReactNode;
  socialProofPopup?: React.ReactNode;
  showPromo?: boolean;
  handleDismissPromo?: () => void;
  onOpenDemo?: () => void;
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
  children,
  bottomContent,
  socialProofPopup,
  showPromo,
  handleDismissPromo,
  onOpenDemo,
}: HeroSectionProps) {
  const [searchFocused, setSearchFocused] = React.useState(false);

  /* ── Ken Burns + Fade-out + Zoom on scroll for background image ── */
  const { scrollY } = useScroll();
  const bgOpacity = useTransform(scrollY, [0, 500], [1, 0]);
  // FIX #006: Search input connected to Command Palette via prop
  const handleSearchFocus = () => {
    setSearchFocused(true);
    // Notify parent to open Command Palette
    if (setShowCommandPalette) setShowCommandPalette(true);
  };

  const handleSearchBlur = () => setSearchFocused(false);

  const navLinks = [
    { label: 'Cómo funciona', href: '#como-funciona' },
    { label: 'Funciones', href: '#features' },
    { label: 'Precios', href: '#precios' },
    { label: 'FAQ', href: '#faq' },
  ];

  return (
    <div ref={leftPanelRef} className="relative flex-1 bg-[#020617]">
      {/* ── Hero viewport: overflow-hidden for Ken Burns zoom ──
          FIX-ENTRY (2026-09-20): height 100vh → minHeight 100vh. Con el selector
          de 3 caminos el contenido del hero puede exceder el viewport en pantallas
          cortas (320×690, 375×667) — con height fijo + overflow-hidden las
          tarjetas 2 y 3 quedaban recortadas e inalcanzables. Con min-height el
          hero crece y el fondo Ken Burns sigue cubriendo todo el contenedor. */}
      <div className="relative w-full overflow-hidden" style={{ minHeight: '100vh' }}>

      {/* ── Layer 1: Background image — Ken Burns + Parallax (Apple/Stripe style) ── */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          top: '-8%',
          left: '-8%',
          right: '-8%',
          bottom: '-8%',
          backgroundImage: `url('/fondo-landing.webp')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center center',
          backgroundRepeat: 'no-repeat',
          opacity: bgOpacity,
        }}
        initial={{ scale: 1 }}
        animate={{ scale: 1.12 }}
        transition={{ duration: 12, ease: [0.25, 0.1, 0.25, 1] }}
        aria-hidden="true"
      />

      {/* ── Layer 2: Readability overlay — controls how subtle the image appears ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(165deg, rgba(2,6,23,0.78) 0%, rgba(2,6,23,0.65) 40%, rgba(2,6,23,0.72) 100%)',
        }}
        aria-hidden="true"
      />

      {/* ── Layer 3: Nebula glow (x.ai-inspired cosmic cloud) ── */}
      <div className="absolute top-0 right-0 w-full h-full pointer-events-none z-0 overflow-hidden">
        <div
          className="absolute -top-[20%] -right-[15%] w-[60vw] h-[80vh] rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(34,197,94,0.15) 0%, rgba(34,197,94,0.08) 25%, rgba(74,222,128,0.04) 45%, transparent 65%)',
            filter: 'blur(60px)',
          }}
        />
        <div
          className="absolute top-[5%] right-[5%] w-[30vw] h-[50vh] rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.06) 0%, rgba(187,247,208,0.10) 20%, transparent 60%)',
            filter: 'blur(40px)',
          }}
        />
      </div>

      {/* ── Layer 4: Controlled immersion particles ── */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        <ParticleRain />
        <GreenOrb className="absolute top-[15%] right-[20%] w-3 h-3 opacity-40" />
        <GreenOrb className="absolute top-[35%] right-[35%] w-2 h-2 opacity-25" />
        <GreenOrb className="absolute top-[60%] right-[15%] w-2.5 h-2.5 opacity-30" />
        <GreenOrb className="absolute top-[25%] right-[50%] w-1.5 h-1.5 opacity-20" />
        <GreenOrb className="absolute top-[75%] right-[40%] w-2 h-2 opacity-15" />
      </div>

      {/* ── Content layer ── */}
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* ── PROMO BANNER (inside hero layered system — no top cut) ── */}
        <AnimatePresence>
          {showPromo && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 32, opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="relative overflow-hidden w-full bg-gradient-to-r from-emerald-600 via-green-500 to-emerald-500 shadow-lg shadow-emerald-500/20 shrink-0"
            >
              <div className="absolute inset-0 promo-shimmer" />
              <div className="relative flex items-center justify-center px-4 h-8 gap-2">
                {/* FIX-ENTRY (2026-09-20): copy concreto — «gratis» solo donde tiene significado real (Ficha de Costo) */}
                <span className="text-xs font-bold text-white tracking-wide">
                  Plataforma multi-tienda · Vitrina digital por tienda · Ficha de Costo gratis
                </span>
                <button
                  onClick={handleDismissPromo}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors pointer-events-auto"
                  aria-label="Cerrar promoción"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Top Navigation Bar ── */}
        <motion.nav
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="flex items-center justify-between px-6 sm:px-10 lg:px-16 xl:px-20 py-5"
        >
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#22c55e]/10 border border-[#22c55e]/15 flex items-center justify-center">
              <Shield className="w-4 h-4 text-[#22c55e]" strokeWidth={1.5} />
            </div>
            <span className="text-lg font-bold tracking-tight text-white/90 font-[family-name:var(--font-space-grotesk)]">
              Cost<span className="text-[#22c55e]">Pro</span>
            </span>
          </div>

          {/* Center nav links — desktop */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link, idx) => (
              <a
                key={`${link.href}-${idx}`}
                href={link.href}
                onClick={(e) => { e.preventDefault(); document.querySelector(link.href)?.scrollIntoView({ behavior: 'smooth' }); }}
                className="nav-link-hover px-4 py-2.5 text-[13px] font-medium text-white/60 hover:text-white/80 transition-colors duration-200" /* FIX-ACC-014 */
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* FIX-ENTRY (2026-09-20): header sin CTAs de acción — los tres caminos
              (COSTPRO · Ficha de Costo · Demostración) viven UNICAMENTE en el
              selector del hero. El header sirve a navegación e identidad y no
              compite con la decisión principal. El hamburger móvil abre el
              drawer de navegación (único menú — se eliminó el dropdown duplicado). */}
          <div className="flex items-center gap-2">
            {/* Mobile hamburger */}
            <button
              onClick={() => setShowMobileNav(!showMobileNav)}
              className="flex md:hidden items-center justify-center w-11 h-11 rounded-lg hover:bg-white/[0.06] transition-colors"
              aria-label="Abrir menú"
            >
              <div className={`hamburger-icon ${showMobileNav ? 'open' : ''}`}>
                <span />
                <span />
                <span />
              </div>
            </button>
          </div>
        </motion.nav>

        {/* FIX-ENTRY B1 (2026-09-20): dropdown móvil del hero ELIMINADO —
            duplicaba el drawer lateral de LandingPage (ambos se abrían a la vez
            con el mismo estado showMobileNav y el dropdown quedaba muerto bajo
            el overlay). Menú móvil único = drawer de navegación. */}

        {/* ── HERO CENTER ── */}
        <div ref={heroRef} id="hero" className="flex-1 flex flex-col items-center justify-center px-6 text-center -mt-10">
          {/* Main brand name */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          >
            {/* FIX-ENTRY (2026-09-20): tamaño de marca defendido en ultra-small —
                ver excepción .landing-tokens h1 en base.css (el hardening ≤380px
                global reducía este h1 a 16px, solapado con el nav). */}
            <h1 className="text-[3.75rem] sm:text-7xl md:text-8xl lg:text-[9rem] xl:text-[10rem] font-black tracking-tighter leading-none font-[family-name:var(--font-space-grotesk)]">
              <span className="text-white">Cost</span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#22c55e] via-[#4ade80] to-[#22c55e]">Pro</span>
            </h1>
          </motion.div>

          {/* Tagline — static text, no typewriter effect */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="mt-6 max-w-lg"
          >
            <p className="text-base sm:text-lg text-white/50 leading-relaxed">
              Administra todas tus tiendas desde un solo lugar. Inventario, ventas y vitrina digital.
            </p>
          </motion.div>

          {/* ── SELECTOR DE TRES CAMINOS (FIX-ENTRY 2026-09-20) ──
              Una decisión, tres intenciones — NO tres botones iguales.
              Jerarquía derivada del usuario, no arbitraria:
                1. Ficha de Costo (PRIMARIA)   → la única promesa «gratis» real:
                   módulo de COSTPRO, Res. 148/2023, con Google o invitado.
                2. Entrar a COSTPRO (SECUNDARIA) → plataforma completa, requiere cuenta.
                3. Ver demostración (EXPLORATORIA) → conocer el producto, sin registro.
              Diferenciación por ESTRUCTURA (icono + eyebrow + descripción + acción +
              micro-trust), no solo por color (WCAG: el color nunca es el único
              mecanismo). Un solo elemento interactivo por tarjeta = 1 tab stop,
              target ≥44px, sin link-in-link. */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65, duration: 0.6 }}
            className="mt-8 w-full max-w-5xl mx-auto"
          >
            <h2 className="text-base sm:text-lg font-semibold text-white/85 tracking-tight text-center">
              ¿Qué quieres hacer?
            </h2>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 text-left">

              {/* ── CAMINO 1 · PRIMARIA — Ficha de Costo gratis ── */}
              <motion.a
                href="/fc/"
                data-testid="path-ficha-costo"
                aria-label="Ficha de Costo gratis, módulo de COSTPRO. Crea y calcula fichas conforme a la Resolución 148 de 2023, con tu cuenta de Google o como invitado."
                onClick={(e) => {
                  e.preventDefault();
                  enterFichaDeCosto(() => { if (setLoginDefaultTab) setLoginDefaultTab('login'); setShowLoginModal(true); });
                }}
                className="group relative flex flex-col rounded-2xl border border-[#2dd4bf]/30 bg-gradient-to-b from-[#004d40]/45 to-[#004d40]/15 p-5 transition-all duration-300 hover:border-[#2dd4bf]/60 hover:from-[#004d40]/60 hover:-translate-y-0.5 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2dd4bf]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#020617]"
              >
                <span className="flex items-center justify-between mb-4" aria-hidden="true">
                  <span className="w-10 h-10 rounded-xl bg-[#004d40]/70 border border-[#2dd4bf]/35 flex items-center justify-center">
                    <Calculator className="w-5 h-5 text-[#5eead4]" strokeWidth={1.5} />
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-[#2dd4bf]/15 border border-[#2dd4bf]/30 text-[10px] font-bold uppercase tracking-widest text-[#5eead4]">
                    Gratis
                  </span>
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#5eead4] mb-1" aria-hidden="true">
                  COSTPRO · Ficha de Costo
                </span>
                <span className="text-lg font-bold text-white tracking-tight mb-1.5">
                  Ficha de Costo gratis
                </span>
                <span className="text-[13px] leading-relaxed text-white/60 mb-5">
                  Crea y calcula fichas conforme a la Res. 148/2023. Con tu cuenta de Google o como invitado — sin instalar nada.
                </span>
                <span className="mt-auto inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl bg-[#00695c] group-hover:bg-[#00796b] text-white text-sm font-bold transition-colors" aria-hidden="true">
                  Crear ficha gratis
                  <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </span>
              </motion.a>

              {/* ── CAMINO 2 · SECUNDARIA — Entrar a COSTPRO ── */}
              <motion.a
                href="/"
                data-testid="path-costpro"
                aria-label="Entrar a COSTPRO, la plataforma completa: tiendas, inventario, punto de venta y vitrina digital. Requiere cuenta."
                onClick={(e) => {
                  e.preventDefault();
                  // FIX-ENTRY: con sesión COSTPRO → directo a la app; sin sesión → login.
                  if (hasCostproSession()) {
                    window.location.assign('/');
                  } else {
                    if (setLoginDefaultTab) setLoginDefaultTab('login');
                    setShowLoginModal(true);
                  }
                }}
                className="group relative flex flex-col rounded-2xl border border-white/[0.10] bg-white/[0.04] p-5 transition-all duration-300 hover:border-[#22c55e]/45 hover:bg-white/[0.06] hover:-translate-y-0.5 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22c55e]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#020617]"
              >
                <span className="flex items-center justify-between mb-4" aria-hidden="true">
                  <span className="w-10 h-10 rounded-xl bg-[#22c55e]/10 border border-[#22c55e]/25 flex items-center justify-center">
                    <LayoutGrid className="w-5 h-5 text-[#4ade80]" strokeWidth={1.5} />
                  </span>
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#4ade80] mb-1" aria-hidden="true">
                  Plataforma completa
                </span>
                <span className="text-lg font-bold text-white tracking-tight mb-1.5">
                  Entrar a COSTPRO
                </span>
                <span className="text-[13px] leading-relaxed text-white/60 mb-5">
                  Gestiona todas tus tiendas: inventario, punto de venta, reportes y vitrina digital en un solo lugar.
                </span>
                <span className="mt-auto inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl text-white text-sm font-bold transition-all" style={{ background: 'linear-gradient(135deg, #15803d 0%, #15803d 45%, #166534 100%)' }} aria-hidden="true">
                  Entrar a COSTPRO
                  <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </span>
              </motion.a>

              {/* ── CAMINO 3 · EXPLORATORIA — Ver demostración ── */}
              <motion.button
                type="button"
                data-testid="path-demo"
                aria-label="Ver demostración de COSTPRO: recorre la plataforma en dos minutos, sin registro."
                onClick={onOpenDemo}
                className="group relative flex flex-col rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 transition-all duration-300 hover:border-white/25 hover:bg-white/[0.04] hover:-translate-y-0.5 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#020617] text-left cursor-pointer"
              >
                <span className="flex items-center justify-between mb-4" aria-hidden="true">
                  <span className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center">
                    <PlayCircle className="w-5 h-5 text-white/70" strokeWidth={1.5} />
                  </span>
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60 mb-1" aria-hidden="true">
                  Sin registro
                </span>
                <span className="text-lg font-bold text-white tracking-tight mb-1.5">
                  Ver demostración
                </span>
                <span className="text-[13px] leading-relaxed text-white/60 mb-5">
                  Recorre la plataforma en 2 minutos y descubre cómo automatiza tus fichas de costo.
                </span>
                <span className="mt-auto inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl border border-white/[0.14] text-white/80 group-hover:text-white group-hover:border-white/30 text-sm font-semibold transition-all" aria-hidden="true">
                  Ver demo
                  <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </span>
              </motion.button>
            </div>
          </motion.div>

          {/* CTA subtext — trust signal (sin «gratis» vago: el «gratis» real vive en la tarjeta FC) */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.0, duration: 0.5 }}
            className="mt-4 text-[11px] text-white/50"
          >
            Inventario y ventas multi-tienda · Vitrina digital propia · Ficha de Costo Res. 148/2023 integrada
          </motion.p>

          {/* Search bar — centered */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.1, duration: 0.5 }}
            className="mt-6 w-full max-w-xl"
          >
            <div className={`relative flex items-center gap-3 px-5 py-3.5 rounded-2xl border transition-all duration-300 ${
              searchFocused
                ? 'bg-white/[0.06] border-[#22c55e]/30 shadow-[0_0_30px_rgba(34,197,94,0.08)]'
                : 'bg-white/[0.03] border-white/[0.06] hover:border-white/[0.1]'
            }`}>
              <Search className="w-4 h-4 text-white/25 shrink-0" />
              <input
                type="text"
                placeholder="Busca productos, tiendas o funciones…"
                className="flex-1 bg-transparent text-sm text-white/70 placeholder-white/25 outline-none"
                onFocus={handleSearchFocus}
                onBlur={handleSearchBlur}
                readOnly
                aria-label="Buscar funciones"
              />
              <kbd className="hidden sm:flex items-center px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-[10px] text-white/20 font-mono">
                ⌘K
              </kbd>
            </div>
          </motion.div>


        </div>

        {/* ── Scroll indicator ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5, duration: 0.8 }}
          className="flex justify-center pb-8"
        >
          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="flex flex-col items-center gap-1 cursor-pointer group"
            onClick={() => document.querySelector('#features')?.scrollIntoView({ behavior: 'smooth' })}
          >
            <span className="text-[10px] text-white/15 uppercase tracking-[0.2em] group-hover:text-white/30 transition-colors">Explorar</span>
            <ChevronDown className="w-4 h-4 text-white/15 group-hover:text-white/30 transition-colors" />
          </motion.div>
        </motion.div>
      </div>

      {/* ── Bottom gradient fade — inside hero viewport, overlaps children ── */}
      <div
        className="absolute bottom-0 left-0 right-0 h-72 z-10 pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, transparent 0%, rgba(2,6,23,0.5) 25%, rgba(2,6,23,0.8) 55%, #020617 100%)',
        }}
        aria-hidden="true"
      />
      </div>{/* end hero viewport */}

      {/* ── All other landing sections below (seamless dark continuation) ── */}
      <div className="relative z-10">
        {children}
      </div>

      {/* Bottom content */}
      {bottomContent}
      {socialProofPopup}
    </div>
  );
}
