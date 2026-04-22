'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from 'next-themes';
import {
  Sun, Moon, ChevronDown, ArrowRight, LogIn, Menu,
  Search, Sparkles, Shield,
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

/* ── Subtle falling particles (Enhanced mode only) ── */
function ParticleRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const particlesRef = useRef<Array<{
    x: number; y: number; r: number; speed: number; opacity: number;
    drift: number; color: string;
  }>>([]);

  useEffect(() => {
    // Only render in enhanced mode
    const html = document.documentElement;
    if (!html.classList.contains('mode-enhanced')) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth * devicePixelRatio;
        canvas.height = parent.clientHeight * devicePixelRatio;
        canvas.style.width = parent.clientWidth + 'px';
        canvas.style.height = parent.clientHeight + 'px';
        ctx.scale(devicePixelRatio, devicePixelRatio);
      }
    };
    resize();
    window.addEventListener('resize', resize);

    const w = () => canvas.parentElement?.clientWidth || 0;
    const h = () => canvas.parentElement?.clientHeight || 0;

    // Particle colors: dark blues, metallic grays, subtle teal
    const colors = [
      'rgba(100,160,220,', // soft blue
      'rgba(80,130,180,',  // steel blue
      'rgba(140,160,180,', // metallic gray
      'rgba(60,100,150,',  // deep blue
      'rgba(34,197,94,',   // accent green (sparse)
    ];

    // Init particles — low count for performance
    const COUNT = Math.min(45, Math.floor(w() / 30));
    particlesRef.current = Array.from({ length: COUNT }, () => ({
      x: Math.random() * w(),
      y: Math.random() * h(),
      r: Math.random() * 1.5 + 0.5,
      speed: Math.random() * 0.3 + 0.1,
      opacity: Math.random() * 0.25 + 0.05,
      drift: (Math.random() - 0.5) * 0.15,
      color: Math.random() < 0.15 ? colors[4] : colors[Math.floor(Math.random() * 4)],
    }));

    let lastTime = performance.now();

    const draw = (now: number) => {
      const dt = Math.min((now - lastTime) / 16, 3); // normalize to ~60fps
      lastTime = now;

      ctx.clearRect(0, 0, w(), h());

      for (const p of particlesRef.current) {
        p.y += p.speed * dt;
        p.x += p.drift * dt;

        // Wrap around
        if (p.y > h() + 5) { p.y = -5; p.x = Math.random() * w(); }
        if (p.x < -5) p.x = w() + 5;
        if (p.x > w() + 5) p.x = -5;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color + p.opacity + ')';
        ctx.fill();

        // Faint trail (motion blur illusion)
        if (p.speed > 0.15) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.drift * 8, p.y - p.speed * 12);
          ctx.strokeStyle = p.color + (p.opacity * 0.3) + ')';
          ctx.lineWidth = p.r * 0.5;
          ctx.stroke();
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    // Observe mode changes
    const observer = new MutationObserver(() => {
      if (!html.classList.contains('mode-enhanced')) {
        cancelAnimationFrame(rafRef.current);
      }
    });
    observer.observe(html, { attributes: true, attributeFilter: ['class'] });

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      observer.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: 0.7 }}
    />
  );
}

export interface HeroSectionProps {
  mounted: boolean;
  theme: string | undefined;
  cursorVisible: boolean;
  heroInView: boolean;
  animatedStatsVisible: boolean;
  showChangelogPopover: boolean;
  showMobileNav: boolean;
  mouseGlowPos: { x: number; y: number };
  leftPanelRef: React.RefObject<HTMLDivElement | null>;
  heroRef: React.RefObject<HTMLDivElement | null>;
  animatedStatsRef: React.RefObject<HTMLDivElement | null>;
  handleToggleTheme: () => void;
  setShowLoginModal: (v: boolean) => void;
  setShowMobileNav: (v: boolean) => void;
  setShowChangelogPopover: (v: boolean) => void;
  setShowWhatsNew: (v: boolean) => void;
  setShowCommandPalette?: (v: boolean) => void;
  children?: React.ReactNode;
  bottomContent?: React.ReactNode;
  socialProofPopup?: React.ReactNode;
}

export default function HeroSection({
  mounted,
  theme,
  heroInView,
  showMobileNav,
  leftPanelRef,
  heroRef,
  animatedStatsRef,
  handleToggleTheme,
  setShowLoginModal,
  setShowMobileNav,
  setShowCommandPalette,
  children,
  bottomContent,
  socialProofPopup,
}: HeroSectionProps) {
  const [showNotifications, setShowNotifications] = React.useState(false);
  const [searchFocused, setSearchFocused] = React.useState(false);
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
    <div ref={leftPanelRef} className="relative flex-1">
      {/* ── Dark background (like x.ai — near-black) ── */}
      <div className="absolute inset-0 bg-[#020617]" />

      {/* ── Nebula glow effect (x.ai-inspired cosmic cloud) ── */}
      <div className="absolute top-0 right-0 w-full h-full pointer-events-none z-0 overflow-hidden">
        {/* Large soft nebula — right side */}
        <div
          className="absolute -top-[20%] -right-[15%] w-[60vw] h-[80vh] rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(34,197,94,0.15) 0%, rgba(34,197,94,0.08) 25%, rgba(74,222,128,0.04) 45%, transparent 65%)',
            filter: 'blur(60px)',
          }}
        />
        {/* Brighter core glow */}
        <div
          className="absolute top-[5%] right-[5%] w-[30vw] h-[50vh] rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.06) 0%, rgba(187,247,208,0.10) 20%, transparent 60%)',
            filter: 'blur(40px)',
          }}
        />
      </div>

      {/* ── Floating particles ── */}
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
                className="px-3.5 py-1.5 text-[13px] font-medium text-white/40 hover:text-white/80 transition-colors duration-200"
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            {/* Theme toggle */}
            <button
              onClick={handleToggleTheme}
              className="hidden sm:flex items-center justify-center w-9 h-9 rounded-lg hover:bg-white/[0.06] transition-colors"
              aria-label="Cambiar tema"
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={theme === 'dark' ? 'dark' : 'light'}
                  initial={{ rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 90, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {mounted && theme === 'dark' ? (
                    <Sun className="w-4 h-4 text-white/50" />
                  ) : (
                    <Moon className="w-4 h-4 text-white/50" />
                  )}
                </motion.div>
              </AnimatePresence>
            </button>

            {/* Notification */}
            <div className="relative hidden sm:block">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative flex items-center justify-center w-9 h-9 rounded-lg hover:bg-white/[0.06] transition-colors"
                aria-label="Notificaciones"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/50">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
                </svg>
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500" />
              </button>
              <AnimatePresence>
                {showNotifications && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="absolute top-full right-0 mt-2 z-50 w-72 rounded-xl bg-[#111827]/95 backdrop-blur-xl border border-white/[0.08] shadow-2xl shadow-black/50 p-4"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-white/90">Notificaciones</span>
                        <span className="text-[10px] font-semibold text-amber-500 px-2 py-0.5 rounded-full bg-amber-500/10">Próximamente</span>
                      </div>
                      <div className="flex items-center justify-center py-6">
                        <div className="text-center">
                          <p className="text-xs text-white/40 leading-relaxed">Las notificaciones en tiempo real estarán disponibles próximamente.</p>
                          <p className="text-[10px] text-white/20 mt-1">Inicia sesión para ver las novedades del sistema.</p>
                        </div>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* Login CTA */}
            <button
              onClick={() => setShowLoginModal(true)}
              className="hidden sm:flex items-center gap-2 px-5 py-2 rounded-xl bg-white/[0.06] border border-white/[0.08] text-white/80 text-sm font-medium hover:bg-white/[0.1] hover:text-white transition-all duration-200"
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
                    className="block px-4 py-3 text-sm text-white/60 hover:text-white/90 rounded-lg hover:bg-white/[0.06] transition-all"
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

          {/* Search bar — centered */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.5 }}
            className="mt-10 w-full max-w-xl"
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
            transition={{ delay: 1.2, duration: 0.6 }}
            className="mt-8 flex items-center gap-3"
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

      {/* ── All other landing sections below (seamless dark continuation) ── */}
      <div className="relative z-10 bg-[#020617]">
        {children}
      </div>

      {/* Bottom content */}
      {bottomContent}
      {socialProofPopup}
    </div>
  );
}
