'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import {
  ChevronDown, ArrowRight,
  Search, Sparkles, Shield, X,
} from 'lucide-react';

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
      />
    </div>
  );
}

export interface HeroSectionProps {
  heroInView: boolean;
  showMobileNav: boolean;
  leftPanelRef: React.RefObject<HTMLDivElement | null>;
  heroRef: React.RefObject<HTMLDivElement | null>;
  animatedStatsRef: React.RefObject<HTMLDivElement | null>;
  setShowLoginModal: (v: boolean) => void;
  setShowMobileNav: (v: boolean) => void;
  setShowCommandPalette?: (v: boolean) => void;
  setLoginDefaultTab?: (tab: 'login' | 'register') => void;
  children?: React.ReactNode;
  bottomContent?: React.ReactNode;
  socialProofPopup?: React.ReactNode;
  showPromo?: boolean;
  handleDismissPromo?: () => void;
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
    { label: 'Inicio', href: '#hero' },
    { label: 'Costos', href: '#features' },
    { label: 'Plantillas', href: '#pricing' },
    { label: 'FAQ', href: '#faq' },
  ];

  return (
    <div ref={leftPanelRef} className="relative flex-1 bg-[#020617]">
      {/* ── Hero viewport: overflow-hidden for Ken Burns zoom ── */}
      <div className="relative w-full overflow-hidden" style={{ height: '100vh' }}>

      {/* ── Layer 1: Background image — Ken Burns + Parallax (Apple/Stripe style) ── */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          top: '-8%',
          left: '-8%',
          right: '-8%',
          bottom: '-8%',
          backgroundImage: `url('/enhanced-bg.jpg')`,
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
                <span className="text-xs font-bold text-white tracking-wide">
                  Lanzamiento v5.8 — Motor de costos con IA integrada
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
                className="nav-link-hover px-4 py-2.5 text-[13px] font-medium text-white/40 hover:text-white/80 transition-colors duration-200"
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            {/* Login CTA */}
            <button
              onClick={() => setShowLoginModal(true)}
              className="hidden sm:flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.08] text-white/80 text-sm font-medium hover:bg-white/[0.1] hover:text-white transition-all duration-200 cursor-pointer"
            >
              <span>Iniciar Sesión</span>
            </button>

            {/* Mobile hamburger */}
            <button
              onClick={() => setShowMobileNav(!showMobileNav)}
              className="flex md:hidden items-center justify-center w-9 h-9 rounded-lg hover:bg-white/[0.06] transition-colors"
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

        {/* FIX #019: Mobile hamburger menu dropdown */}
        <AnimatePresence>
          {showMobileNav && (
            <motion.div
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="md:hidden absolute top-full left-0 right-0 z-50 bg-[#0a0f1a]/98 backdrop-blur-xl border-b border-white/[0.08] overflow-hidden"
            >
              <div className="px-6 py-4 space-y-1">
                {navLinks.map((link, idx) => (
                  <a
                    key={`${link.href}-${idx}`}
                    href={link.href}
                    onClick={(e) => {
                      e.preventDefault();
                      document.querySelector(link.href)?.scrollIntoView({ behavior: 'smooth' });
                      setShowMobileNav(false);
                    }}
                    className="nav-link-hover block px-4 py-3 text-sm text-white/60 hover:text-white/90 rounded-lg hover:bg-white/[0.06] transition-all"
                  >
                    {link.label}
                  </a>
                ))}
                <div className="h-px bg-white/[0.08] my-2" />
                <button
                  onClick={() => { setShowLoginModal(true); setShowMobileNav(false); }}
                  className="block w-full text-left px-4 py-3 text-sm text-[#22c55e] font-medium rounded-lg hover:bg-[#22c55e]/10 transition-all"
                >
                  Iniciar Sesión
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── HERO CENTER ── */}
        <div ref={heroRef} id="hero" className="flex-1 flex flex-col items-center justify-center px-6 text-center -mt-10">
          {/* Main brand name */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          >
            <h1 className="text-6xl sm:text-7xl md:text-8xl lg:text-[9rem] xl:text-[10rem] font-black tracking-tighter leading-none font-[family-name:var(--font-space-grotesk)]">
              <span className="text-white">Cost</span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#22c55e] via-[#4ade80] to-[#22c55e]">Pro</span>
            </h1>
          </motion.div>

          {/* Subtle tagline with typewriter */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="mt-6 max-w-lg"
          >
            <p className="text-base sm:text-lg text-white/30 leading-relaxed">
              <TypewriterText
                text="Gestiona costos, inventario y ventas — todo en una plataforma."
                start={heroInView}
                className="text-base sm:text-lg text-white/30 leading-relaxed"
              />
            </p>
          </motion.div>

          {/* ── HERO CTA BUTTONS ── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65, duration: 0.6 }}
            className="mt-8 flex flex-col sm:flex-row items-center gap-3"
          >
            {/* Primary CTA — "Comenzar Gratis" */}
            <button
              onClick={() => {
                if (setLoginDefaultTab) setLoginDefaultTab('register');
                setShowLoginModal(true);
              }}
              className="group relative px-8 py-3.5 rounded-2xl font-bold text-sm tracking-tight text-white transition-all duration-300 hover:scale-[1.03] active:scale-[0.98]"
              style={{
                background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 50%, #15803d 100%)',
                boxShadow: '0 0 30px rgba(34,197,94,0.25), 0 4px 15px rgba(34,197,94,0.2), inset 0 1px 0 rgba(255,255,255,0.15)',
                minWidth: '200px',
              }}
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                Comenzar Gratis
                <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </span>
              {/* Shimmer overlay */}
              <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{
                    background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.15) 50%, transparent 60%)',
                    animation: 'none',
                  }}
                />
              </div>
            </button>

            {/* Secondary CTA — "Ver Demo" */}
            <button
              onClick={() => {
                if (setLoginDefaultTab) setLoginDefaultTab('login');
                setShowLoginModal(true);
              }}
              className="px-8 py-3.5 rounded-2xl font-semibold text-sm text-white/60 border border-white/[0.08] hover:text-white/90 hover:bg-white/[0.04] hover:border-white/[0.15] transition-all duration-300"
              style={{ minWidth: '140px' }}
            >
              Iniciar Sesión
            </button>
          </motion.div>

          {/* CTA subtext — trust signal */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.0, duration: 0.5 }}
            className="mt-3 text-[11px] text-white/20"
          >
            Sin tarjeta de crédito · Configuración en 2 minutos · Cancela cuando quieras
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
                placeholder="¿Qué quieres gestionar hoy?"
                className="flex-1 bg-transparent text-sm text-white/70 placeholder-white/25 outline-none"
                onFocus={handleSearchFocus}
                onBlur={handleSearchBlur}
                readOnly
              />
              <kbd className="hidden sm:flex items-center px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-[10px] text-white/20 font-mono">
                ⌘K
              </kbd>
            </div>
          </motion.div>

          {/* Subtle announcement */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5, duration: 0.6 }}
            className="mt-6 flex items-center gap-3"
          >
            <button
              className="group flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-all duration-200"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#22c55e]/60 group-hover:text-[#22c55e] transition-colors" />
              <span className="text-[12px] text-white/30 group-hover:text-white/50 transition-colors">Novedades v5.8</span>
              <ArrowRight className="w-3 h-3 text-white/15 group-hover:text-white/30 group-hover:translate-x-0.5 transition-all" />
            </button>
            <span className="text-white/10 text-[11px]">·</span>
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-[#22c55e]/40" />
              <span className="text-[12px] text-white/25">Encriptación end-to-end</span>
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
