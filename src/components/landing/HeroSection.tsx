'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from 'next-themes';
import {
  Sparkles, Sun, Moon, ChevronDown, ArrowRight, LogIn, Menu,
  Zap, Clock, CreditCard, RefreshCw, Shield, TrendingUp, Search,
} from 'lucide-react';
import { fadeIn } from './animations';
import { AnimatedStatCounter } from './hooks';
import {
  animatedStatsData, clientLogos, v58Features,
} from './data';

/* ── Sparkline data ── */
const sparklines = [
  { label: 'Ventas', data: [20, 35, 28, 52, 48, 65, 78], color: '#22c55e' },
  { label: 'Usuarios', data: [15, 25, 22, 40, 55, 60, 72], color: '#10b981' },
  { label: 'Ingresos', data: [30, 22, 38, 45, 42, 68, 85], color: '#34d399' },
];

function SparklineCard({ label, data, color, visible }: { label: string; data: number[]; color: string; visible: boolean }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 80;
  const h = 28;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.9 }}
      animate={visible ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ duration: 0.4, delay: 0.6 }}
      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] backdrop-blur-sm"
    >
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
        <defs>
          <linearGradient id={`grad-${label}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline
          points={points}
          fill={`url(#grad-${label})`}
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={points.split(' ').pop()?.split(',')[0]} cy={points.split(' ').pop()?.split(',')[1]} r="2.5" fill={color} />
      </svg>
      <div className="flex flex-col">
        <span className="text-[9px] font-medium text-white/40 uppercase tracking-wider">{label}</span>
        <span className="text-[10px] font-bold text-white/70 tabular-nums">+{(data[data.length - 1] / data[0] * 100 - 100).toFixed(0)}%</span>
      </div>
    </motion.div>
  );
}

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
  children?: React.ReactNode;
  bottomContent?: React.ReactNode;
  socialProofPopup?: React.ReactNode;
}

export default function HeroSection({
  mounted,
  theme,
  cursorVisible,
  heroInView,
  animatedStatsVisible,
  showChangelogPopover,
  showMobileNav,
  mouseGlowPos,
  leftPanelRef,
  heroRef,
  animatedStatsRef,
  handleToggleTheme,
  setShowLoginModal,
  setShowMobileNav,
  setShowChangelogPopover,
  setShowWhatsNew,
  children,
  bottomContent,
  socialProofPopup,
}: HeroSectionProps) {
  const [showNotifications, setShowNotifications] = React.useState(false);

  return (
    <div ref={leftPanelRef} className="relative flex-1 lg:flex-[3] xl:flex-[3]">
      {/* Static clean gradient background */}
      <div
        className="absolute inset-0 bg-[#052e16]"
      />

      <div className="relative z-10 flex flex-col justify-between min-h-[auto] lg:min-h-screen p-6 sm:p-10 lg:p-12 xl:p-16">
        {/* Top: Logo + nav */}
        <motion.div
          variants={fadeIn(0)}
          initial="hidden"
          animate="visible"
          className="flex items-center gap-3 nav-glass rounded-b-xl -mx-6 -mt-6 sm:-mx-10 lg:-mx-12 xl:-mx-16 px-6 sm:px-10 lg:px-12 xl:px-16 py-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#22c55e]/15 border border-[#22c55e]/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-[#22c55e]" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black tracking-tight text-white font-[family-name:var(--font-space-grotesk)] costpro-brand-3d">
                  Cost<span className="text-[#22c55e]">Pro</span>
                </span>
                {/* Live Activity Indicator */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 1.5, duration: 0.5 }}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#22c55e]/10 border border-[#22c55e]/20"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22c55e] opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#22c55e]" />
                  </span>
                  <span className="text-[9px] font-semibold text-[#22c55e] hidden sm:inline">En vivo</span>
                </motion.div>
              </div>
              <span className="text-[10px] font-medium text-[#22c55e]/60 tracking-wide -mt-0.5">
                v5.8
              </span>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* Theme Toggle Button */}
            <button
              onClick={handleToggleTheme}
              className="hidden sm:flex items-center justify-center w-11 h-11 rounded-lg bg-white/10 border border-white/10 hover:bg-white/20 transition-all duration-200"
              aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
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
                    <Sun className="w-4 h-4 text-amber-400" />
                  ) : (
                    <Moon className="w-4 h-4 text-blue-300" />
                  )}
                </motion.div>
              </AnimatePresence>
            </button>

            {/* What's New badge with popover */}
            <div className="relative hidden sm:block">
              <button
                onClick={() => setShowChangelogPopover(!showChangelogPopover)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#22c55e]/10 border border-[#22c55e]/20 text-[10px] font-semibold text-[#22c55e] hover:bg-[#22c55e]/20 transition-colors"
                aria-label="Novedades de la versión 5.8"
                aria-expanded={showChangelogPopover}
              >
                <span>🆕</span>
                <span>Novedades v5.8</span>
                <motion.span
                  animate={{ rotate: showChangelogPopover ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className="w-3 h-3" />
                </motion.span>
              </button>
              {/* Changelog floating card with glass effect */}
              <AnimatePresence>
                {showChangelogPopover && (
                  <>
                    {/* Backdrop to close */}
                    <div className="fixed inset-0 z-40" onClick={() => setShowChangelogPopover(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.95 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      className="absolute top-full right-0 mt-2 z-50 w-72 rounded-xl bg-white/[0.08] backdrop-blur-xl border border-white/[0.12] shadow-xl shadow-black/30 p-4"
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <Sparkles className="w-4 h-4 text-[#22c55e]" />
                        <span className="text-xs font-bold text-white/90">Novedades v5.8</span>
                      </div>
                      <div className="space-y-2">
                        {v58Features.map((feature, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.08, duration: 0.2 }}
                            className="flex items-start gap-2.5"
                          >
                            <div className="w-5 h-5 rounded-md bg-[#22c55e]/10 flex items-center justify-center shrink-0 mt-0.5">
                              <Shield className="w-3 h-3 text-[#22c55e]" />
                            </div>
                            <span className="text-[11px] text-white/60 leading-relaxed">{feature}</span>
                          </motion.div>
                        ))}
                      </div>
                      <div className="mt-3 pt-3 border-t border-white/[0.08]">
                        <button
                          onClick={() => { setShowChangelogPopover(false); setShowWhatsNew(true); }}
                          className="flex items-center gap-1.5 text-[10px] font-semibold text-[#22c55e] hover:text-[#16a34a] transition-colors"
                        >
                          Ver todas las novedades
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* Notification Bell */}
            <div className="relative hidden sm:block">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative flex items-center justify-center w-11 h-11 rounded-lg bg-white/10 border border-white/10 hover:bg-white/20 transition-all duration-200 glow-pulse-interactive"
                aria-label="Notificaciones"
                aria-expanded={showNotifications}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/70">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
                </svg>
                {/* Notification dot */}
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-[#22c55e] border-2 border-[#064e3b]">
                  <span className="absolute inset-0 rounded-full bg-[#22c55e] animate-ping opacity-75" />
                </span>
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
                      className="absolute top-full right-0 mt-2 z-50 w-72 rounded-xl bg-white/[0.08] backdrop-blur-xl border border-white/[0.12] shadow-xl shadow-black/30 p-4"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-white/90">Notificaciones</span>
                        <span className="text-[10px] font-semibold text-[#22c55e] px-2 py-0.5 rounded-full bg-[#22c55e]/10">3 nuevas</span>
                      </div>
                      <div className="space-y-2">
                        {[
                          { icon: '🚀', text: 'Nueva función: IA avanzada', time: 'Hace 2h' },
                          { icon: '📊', text: 'Reportes mejorados disponibles', time: 'Hace 1d' },
                          { icon: '🎉', text: '¡Bienvenido a CostPro v5.8!', time: 'Hace 3d' },
                        ].map((notif, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.08 }}
                            className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer"
                          >
                            <span className="text-sm">{notif.icon}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] text-white/70 leading-relaxed">{notif.text}</p>
                              <p className="text-[9px] text-white/30 mt-0.5">{notif.time}</p>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                      <div className="mt-3 pt-3 border-t border-white/[0.08] text-center">
                        <span className="text-[10px] font-semibold text-[#22c55e] hover:text-[#16a34a] cursor-pointer transition-colors">Ver todas las notificaciones</span>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* Iniciar Sesión button */}
            <button
              onClick={() => setShowLoginModal(true)}
              className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl bg-[#22c55e] text-white text-sm font-semibold hover:bg-[#16a34a] transition-colors glow-pulse-interactive ripple-effect"
            >
              <LogIn className="w-4 h-4" />
              <span>Iniciar Sesión</span>
            </button>

            {/* Ctrl+K shortcut hint */}
            <button
              onClick={() => {}}
              className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[10px] text-white/25 hover:text-white/40 hover:bg-white/[0.08] transition-colors cursor-default"
              aria-label="Abrir paleta de comandos"
            >
              <Search className="w-3 h-3" />
              <span>Buscar</span>
              <kbd className="px-1 py-0.5 rounded bg-white/[0.06] text-[9px] font-mono border border-white/[0.06]">⌘K</kbd>
            </button>

            {/* Mobile hamburger */}
            <button
              onClick={() => setShowMobileNav(!showMobileNav)}
              className="flex lg:hidden items-center justify-center w-11 h-11 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15 transition-colors"
              aria-label="Abrir menú"
            >
              <div className={`hamburger-icon ${showMobileNav ? 'open' : ''}`}>
                <span />
                <span />
                <span />
              </div>
            </button>
          </div>
        </motion.div>

        {/* Middle: Hero content */}
        <div className="flex-1 flex flex-col justify-center py-10 lg:py-0">
          {/* ── HERO SECTION ── */}
          <div ref={heroRef} id="hero">
            <motion.div variants={fadeIn(0.1).hidden ? { hidden: { opacity: 0, x: -30 }, visible: { opacity: 1, x: 0, transition: { delay: 0.1, duration: 0.5, ease: 'easeOut' as any } } } : undefined} initial="hidden" animate={heroInView ? "visible" : "hidden"} className="mb-8 max-w-lg">
              <motion.div
                animate={{ y: [0, -3, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#22c55e]/10 border border-[#22c55e]/20 mb-4 animated-underline-gradient"
              >
                <Zap className="w-3.5 h-3.5 text-[#22c55e]" />
                <span className="text-xs font-semibold text-[#22c55e]">Plataforma #1 en gestión empresarial</span>
              </motion.div>
              <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-bold tracking-tight text-white leading-[1.15] font-[family-name:var(--font-space-grotesk)]">
                Gestiona tu negocio con{' '}
                <span className="gradient-text">precisión total</span>
              </h1>
              <div className="hero-title-line mt-3 mb-1" />
              <p className="mt-4">
                <TypewriterText text="Control de costos, punto de venta, inventario y reportes — todo en una plataforma." start={heroInView} className="text-base sm:text-lg text-white/60 leading-relaxed" />
              </p>
              {/* Floating AI badge */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2, duration: 0.5 }}
                className="mt-4"
              >
                <motion.span
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#22c55e]/10 border border-[#22c55e]/20 text-[10px] font-semibold text-[#22c55e] float-badge-pulse"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Nuevo: Fórmulas avanzadas con IA</span>
                </motion.span>
              </motion.div>
              {/* Trust badges row - staggered fade-in from below with shield icons */}
              <div className="hidden sm:flex flex-wrap items-center gap-2 mt-5">
                {[
                  { text: 'Setup en 2 min', icon: Clock },
                  { text: 'Sin tarjeta de crédito', icon: CreditCard },
                  { text: 'Cancela cuando quieras', icon: RefreshCw },
                ].map((badge, idx) => (
                  <motion.span
                    key={badge.text}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1 + idx * 0.15, duration: 0.5, ease: 'easeOut' }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#22c55e]/20 bg-[#22c55e]/5 text-[10px] font-semibold text-[#22c55e]/80 badge-pop"
                  >
                    <motion.div
                      animate={{ rotate: [0, -10, 10, -10, 0] }}
                      transition={{ delay: 1.4 + idx * 0.15, duration: 0.6, ease: 'easeInOut' }}
                      className="flex items-center justify-center"
                    >
                      <Shield className="w-3 h-3 text-[#22c55e]" />
                    </motion.div>
                    <span>{badge.text}</span>
                  </motion.span>
                ))}
              </div>
            </motion.div>
          </div>

          {/* ── ANIMATED STATS COUNTER SECTION ── */}
          <div ref={animatedStatsRef} id="animated-stats-trigger" className="mt-12 max-w-2xl mx-auto w-full">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={animatedStatsVisible ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5 }}
            >
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {animatedStatsData.map((stat, i) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 16 }}
                    animate={animatedStatsVisible ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.4, delay: i * 0.1 }}
                    className="group flex flex-col items-center text-center p-4 rounded-xl bg-white/[0.04] border border-white/[0.06] backdrop-blur-sm hover:bg-white/[0.08] hover:border-[#22c55e]/25 hover:shadow-[0_0_20px_rgba(34,197,94,0.08)] transition-all duration-300"
                  >
                    <div className="w-10 h-10 rounded-lg bg-[#22c55e]/10 flex items-center justify-center mb-2 group-hover:bg-[#22c55e]/20 group-hover:scale-110 transition-all duration-300">
                      <stat.icon className="w-5 h-5 text-[#22c55e]" />
                    </div>
                    <span className="text-2xl font-extrabold text-white font-[family-name:var(--font-space-grotesk)]">
                      <AnimatedStatCounter
                        value={stat.value}
                        prefix={stat.prefix}
                        decimals={stat.decimals}
                        isVisible={animatedStatsVisible}
                      />
                    </span>
                    <span className="text-[11px] text-white/40 mt-1 leading-relaxed">{stat.label}</span>
                  </motion.div>
                ))}
              </div>

              {/* ── SPARKLINE MINI DASHBOARD ── */}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                {sparklines.map((sp) => (
                  <SparklineCard
                    key={sp.label}
                    label={sp.label}
                    data={sp.data}
                    color={sp.color}
                    visible={animatedStatsVisible}
                  />
                ))}
              </div>
            </motion.div>
          </div>

          {/* ── Sections injected as children ── */}
          {children}

          {/* ── TRUSTED BY LOGO CAROUSEL ── */}
          <div className="mt-12 max-w-2xl mx-auto w-full">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.8 }}
              className="text-center mb-4"
            >
              <p className="text-[11px] uppercase tracking-[0.15em] font-semibold text-white/25">
                Más de 500 empresas confían en CostPro
              </p>
            </motion.div>
            <div className="relative overflow-hidden">
              {/* Fade edges */}
              <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-[#052e16] to-transparent z-10 pointer-events-none" />
              <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-[#052e16] to-transparent z-10 pointer-events-none" />
              <div className="flex animate-scroll-logos">
                {[...clientLogos, ...clientLogos].map((name, i) => (
                  <span
                    key={`${name}-${i}`}
                    className="flex-shrink-0 px-6 text-[11px] font-medium text-white/20 whitespace-nowrap select-none hover:text-white/40 transition-colors duration-300"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom: Newsletter + stats + tagline */}
        <motion.div variants={fadeIn(0.7)} initial="hidden" animate="visible" className="space-y-6">
          {bottomContent}
        </motion.div>
        {socialProofPopup}
      </div>
    </div>
  );
}
