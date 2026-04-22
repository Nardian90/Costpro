'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Shield } from 'lucide-react';
import { APP_DISPLAY_VERSION } from '@/config/app';

interface CostProLoaderProps {
  size?: number;
  text?: string;
  subtext?: string;
  showText?: boolean;
  showSubtext?: boolean;
  className?: string;
  fullScreen?: boolean;
}

const SPLASH_MIN_MS = 2000;
const STATUS_PHRASES = [
  'Inicializando sistema',
  'Conectando módulos',
  'Preparando entorno',
  'Cargando configuración',
  'Verificando integridad',
  'Optimizando recursos',
];
const PROGRESS_EASE_DURATION = 8000;
const PROGRESS_CAP = 95;

/**
 * CostProLoader — Theme-Aware Premium Loader
 * Adapts automatically to light/dark theme using CSS custom properties.
 * fullScreen mode shows institutional branding splash.
 * Inline mode shows compact spinner that blends with surrounding content.
 */
export const CostProLoader: React.FC<CostProLoaderProps> = ({
  text,
  subtext,
  showText = !!text,
  showSubtext = !!subtext,
  className,
  fullScreen = false,
}) => {
  const id = React.useId().replace(/:/g, '');

  /* ── Progress animation (0 → PROGRESS_CAP, ease-out) ── */
  const [progress, setProgress] = useState(0);
  const progressRaf = useRef<number>(0);
  const progressStart = useRef<number>(0);

  /* ── Cyclic status phrases ── */
  const [statusIndex, setStatusIndex] = useState(0);

  /* ── Skip button + returning visitor ── */
  const [showSkip, setShowSkip] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  /* ── Fade-out transition ── */
  const [fadeOut, setFadeOut] = useState(false);

  const dismiss = useCallback(() => {
    setFadeOut(true);
    setTimeout(() => {
      setDismissed(true);
      window.dispatchEvent(new CustomEvent('costpro:skip-splash'));
    }, 400);
  }, []);

  /* ── Returning visitor detection ── */
  const isReturningRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const visited = localStorage.getItem('costpro-visited');
    isReturningRef.current = !!visited;
    if (visited) {
      // Returning visitors: shorter splash (500ms), then auto-dismiss
      const timer = setTimeout(dismiss, 500);
      return () => clearTimeout(timer);
    }
    localStorage.setItem('costpro-visited', 'true');

    // First-time visitors: show skip after 800ms, auto-dismiss after SPLASH_MIN_MS
    const skipTimer = setTimeout(() => setShowSkip(true), 800);
    const autoTimer = setTimeout(dismiss, SPLASH_MIN_MS + 1500);

    return () => {
      clearTimeout(skipTimer);
      clearTimeout(autoTimer);
    };
  }, [dismiss]);

  /* ── Progress bar animation ── */
  useEffect(() => {
    if (dismissed) return;
    progressStart.current = performance.now();

    const animate = (now: number) => {
      const elapsed = now - progressStart.current;
      const raw = (elapsed / PROGRESS_EASE_DURATION) * 100;
      const eased = raw - (raw * raw) / 200;
      setProgress(Math.min(eased, PROGRESS_CAP));
      if (eased < PROGRESS_CAP && !dismissed) {
        progressRaf.current = requestAnimationFrame(animate);
      }
    };
    progressRaf.current = requestAnimationFrame(animate);

    return () => {
      if (progressRaf.current) cancelAnimationFrame(progressRaf.current);
    };
  }, [dismissed]);

  /* ── Status phrase rotation (every 2.5s) ── */
  useEffect(() => {
    if (dismissed) return;
    const interval = setInterval(() => {
      setStatusIndex((prev) => (prev + 1) % STATUS_PHRASES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [dismissed]);

  if (dismissed && !fullScreen) return null;

  const currentStatus = STATUS_PHRASES[statusIndex];
  const displaySubtext = subtext || (fullScreen ? currentStatus : undefined);

  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center overflow-hidden transition-opacity duration-400',
        fullScreen ? 'min-h-screen w-full' : '',
        fadeOut && 'opacity-0',
        className,
      )}
    >
      {/* Theme-aware background: fullScreen uses bg-background, inline is transparent */}
      {fullScreen && <div className="absolute inset-0 bg-background" />}

      <style dangerouslySetInnerHTML={{ __html: `
        /* ── Mesh dot pattern ── */
        .cp-mesh-${id} {
          background-image: radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--foreground) 4%, transparent) 1px, transparent 0);
          background-size: 40px 40px;
        }

        /* ── Radial luminous glow ── */
        .cp-radial-${id} {
          background: radial-gradient(circle at center, color-mix(in srgb, var(--primary) 10%, transparent) 0%, transparent 65%);
        }

        /* ── Glass-morphism ring ── */
        .cp-glass-ring-${id} {
          background: color-mix(in srgb, var(--primary) 5%, transparent);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid color-mix(in srgb, var(--primary) 10%, transparent);
        }

        /* ── Logo square ── */
        .cp-logo-box-${id} {
          background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 25%, var(--background)) 0%, color-mix(in srgb, var(--primary) 40%, var(--background)) 100%);
          box-shadow: 0 25px 60px -12px color-mix(in srgb, var(--foreground) 10%, transparent), 0 0 40px color-mix(in srgb, var(--primary) 6%, transparent);
        }

        /* ── Loading pulse ── */
        @keyframes cp-loading-pulse-${id} {
          0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--primary) 40%, transparent); }
          70% { box-shadow: 0 0 0 20px color-mix(in srgb, var(--primary) 0%, transparent); }
          100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--primary) 0%, transparent); }
        }
        .cp-pulse-ring-${id} {
          animation: cp-loading-pulse-${id} 2s ease-out infinite;
        }

        /* ── Spinning outer ring ── */
        .cp-spin-ring-${id} {
          animation: cp-spin-${id} 1.5s linear infinite;
        }
        @keyframes cp-spin-${id} {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* ── Shimmer text ── */
        @keyframes cp-text-shimmer-${id} {
          0% { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
        .cp-shimmer-text-${id} {
          background: linear-gradient(90deg, var(--primary) 0%, var(--primary-light, var(--primary)) 25%, color-mix(in srgb, var(--primary) 50%, white) 50%, var(--primary-light, var(--primary)) 75%, var(--primary) 100%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: cp-text-shimmer-${id} 3s linear infinite;
        }

        /* ── Fade in ── */
        @keyframes cp-fade-in-${id} {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .cp-fade-${id} {
          animation: cp-fade-in-${id} 0.6s ease-out both;
        }
        .cp-fade-delay-1-${id} { animation-delay: 0.15s; }
        .cp-fade-delay-2-${id} { animation-delay: 0.3s; }
        .cp-fade-delay-3-${id} { animation-delay: 0.5s; }
        .cp-fade-delay-4-${id} { animation-delay: 0.7s; }
        .cp-fade-delay-5-${id} { animation-delay: 0.9s; }
        .cp-fade-delay-6-${id} { animation-delay: 1.1s; }

        /* ── Data lines subtle glow ── */
        @keyframes cp-line-glow-${id} {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.35; }
        }
        .cp-data-line-${id} {
          animation: cp-line-glow-${id} 4s ease-in-out infinite;
        }

        /* ── Progress bar fill ── */
        .cp-progress-bar-${id} {
          transition: width 0.3s ease-out;
        }

        /* ── Status phrase transition ── */
        @keyframes cp-status-in-${id} {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .cp-status-anim-${id} {
          animation: cp-status-in-${id} 0.3s ease-out both;
        }
      `}} />

      {/* ── Background layers ── */}
      <div className={`absolute inset-0 cp-mesh-${id} pointer-events-none`} />
      <div className={`absolute inset-0 cp-radial-${id} pointer-events-none opacity-60`} />

      {/* ── Floating geometric accents ── */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 rounded-full pointer-events-none"
        style={{ background: 'color-mix(in srgb, var(--primary) 3%, transparent)', filter: 'blur(100px)' }} />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 rounded-full pointer-events-none"
        style={{ background: 'color-mix(in srgb, var(--primary) 3%, transparent)', filter: 'blur(100px)' }} />

      {/* ── Abstract data lines ── */}
      <div className="absolute inset-0 pointer-events-none">
        <div className={`cp-data-line-${id} absolute top-[20%] right-[10%] w-px`}
          style={{ height: '40%', background: 'linear-gradient(to bottom, transparent, color-mix(in srgb, var(--primary) 15%, transparent), transparent)' }} />
        <div className={`cp-data-line-${id} absolute bottom-[20%] left-[10%] w-px`}
          style={{ height: '40%', background: 'linear-gradient(to bottom, transparent, color-mix(in srgb, var(--primary) 15%, transparent), transparent)', animationDelay: '2s' }} />
        <div className={`cp-data-line-${id} absolute top-[15%] left-[15%]`}
          style={{ width: '128px', height: '1px', background: 'linear-gradient(to right, transparent, color-mix(in srgb, var(--foreground) 6%, transparent), transparent)', animationDelay: '1s' }} />
        <div className={`cp-data-line-${id} absolute bottom-[15%] right-[15%]`}
          style={{ width: '128px', height: '1px', background: 'linear-gradient(to right, transparent, color-mix(in srgb, var(--foreground) 6%, transparent), transparent)', animationDelay: '3s' }} />
      </div>

      {/* ═══ CENTRAL CONTENT ═══ */}
      <div className="relative z-10 flex flex-col items-center">

        {/* ── Logo with glass ring ── */}
        <div className={`cp-fade-${id} cp-fade-delay-1-${id} mb-10 md:mb-14 relative group`}>
          {/* Outer glass ring */}
          <div className={`cp-glass-ring-${id} absolute -inset-6 md:-inset-8 rounded-full opacity-20 group-hover:opacity-30 transition-opacity duration-700`} />

          {/* Main logo mark */}
          <div className={`cp-logo-box-${id} relative flex items-center justify-center w-28 h-28 md:w-36 md:h-36 rounded-2xl md:rounded-3xl overflow-hidden`}>
            {/* Metallic gradient overlay */}
            <div className="absolute inset-0 opacity-20"
              style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-light, var(--primary)), var(--primary-dark, var(--primary)))' }} />

            {/* Shield icon */}
            <Shield
              className="relative z-10 w-14 h-14 md:w-18 md:h-18 text-primary"
              strokeWidth={1.5}
            />

            {/* Inner light flare */}
            <div className="absolute inset-0"
              style={{ background: 'linear-gradient(to top right, transparent, color-mix(in srgb, var(--foreground) 3%, transparent), transparent)' }} />
          </div>
        </div>

        {/* ── Typography ── */}
        <div className="text-center space-y-3 md:space-y-4">
          <h1 className={`cp-fade-${id} cp-fade-delay-2-${id} text-5xl md:text-7xl lg:text-8xl tracking-tighter leading-none text-foreground`}
            style={{ fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif', fontWeight: 900 }}>
            Cost<span className="text-primary">Pro</span>
          </h1>

          <div className={`cp-fade-${id} cp-fade-delay-3-${id} flex items-center justify-center gap-3`}>
            <div className="h-px w-6 md:w-8 bg-border" />
            <p className="text-[10px] md:text-xs uppercase tracking-[0.35em] font-semibold text-muted-foreground">
              {text || 'Gestión Empresarial'}
            </p>
            <div className="h-px w-6 md:w-8 bg-border" />
          </div>
        </div>

        {/* ── Loading element ── */}
        <div className={`cp-fade-${id} cp-fade-delay-4-${id} mt-16 md:mt-20 flex flex-col items-center gap-5`}>
          <div className="relative flex items-center justify-center">
            {/* Pulse ring */}
            <div className={`cp-pulse-ring-${id} w-11 h-11 rounded-full flex items-center justify-center`}
              style={{ border: '2px solid color-mix(in srgb, var(--primary) 20%, transparent)' }}>
              <div className="w-2 h-2 rounded-full bg-primary" />
            </div>

            {/* Spinning outer ring (SVG) */}
            <svg
              className={`cp-spin-ring-${id} absolute`}
              style={{ width: '72px', height: '72px' }}
              viewBox="0 0 100 100"
              fill="none"
            >
              <circle cx="50" cy="50" r="45" fill="none"
                stroke="color-mix(in srgb, var(--primary) 8%, transparent)" strokeWidth="1.5" />
              <circle cx="50" cy="50" r="45" fill="none"
                stroke="var(--primary)" strokeWidth="2"
                strokeDasharray="60 300"
                strokeLinecap="round" />
            </svg>
          </div>

          {/* ── Progress bar (fullScreen only) ── */}
          {fullScreen && (
            <div className="w-64 md:w-80 flex flex-col items-center gap-3">
              {/* Bar */}
              <div className="w-full h-1.5 rounded-full overflow-hidden bg-muted">
                <div
                  className={`cp-progress-bar-${id} h-full rounded-full bg-primary`}
                  style={{
                    width: `${progress}%`,
                    background: 'linear-gradient(90deg, var(--primary), var(--primary-light, var(--primary)))',
                    boxShadow: '0 0 12px color-mix(in srgb, var(--primary) 40%, transparent)',
                  }}
                />
              </div>
              {/* Percentage + Status */}
              <div className="flex items-center justify-between w-full">
                <span
                  key={statusIndex}
                  className={`cp-status-anim-${id} text-[10px] uppercase tracking-[0.2em] font-semibold text-muted-foreground`}
                >
                  {currentStatus}
                </span>
                <span
                  className="text-[11px] font-bold tabular-nums text-muted-foreground"
                  style={{ fontFamily: 'var(--font-space-grotesk), system-ui, monospace' }}
                >
                  {Math.floor(progress)}%
                </span>
              </div>
            </div>
          )}

          {showSubtext && !fullScreen && (
            <span className={`cp-shimmer-text-${id} text-[10px] uppercase tracking-[0.25em] font-bold`}>
              {displaySubtext}
            </span>
          )}
        </div>
      </div>

      {/* Skip button (fullScreen only) */}
      {fullScreen && showSkip && !fadeOut && (
        <button
          onClick={dismiss}
          className={`cp-fade-${id} absolute top-6 right-6 z-20 px-4 py-2 rounded-lg bg-foreground/10 hover:bg-foreground/20 text-muted-foreground hover:text-foreground text-xs font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary/50`}
          aria-label="Saltar pantalla de carga"
        >
          Saltar →
        </button>
      )}

      {/* ── Footer info (fullScreen only) ── */}
      {fullScreen && (
        <div className={`cp-fade-${id} cp-fade-delay-5-${id} absolute bottom-10 left-0 w-full px-8 md:px-12 flex justify-between items-end z-20`}>
          <div className="flex flex-col gap-1.5">
            <p className="text-[9px] md:text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/60">
              Infraestructura Segura
            </p>
            <div className="flex gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
              <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
            </div>
          </div>

          <div className="flex items-center gap-4 md:gap-6">
            <div className="text-right hidden sm:block">
              <p className="text-[9px] md:text-[10px] uppercase tracking-widest text-muted-foreground/60">Versión</p>
              <p className="text-xs md:text-sm font-bold text-foreground/80"
                style={{ fontFamily: 'var(--font-space-grotesk), system-ui' }}>{APP_DISPLAY_VERSION}</p>
            </div>
            <div className="h-6 md:h-8 w-px hidden sm:block bg-border" />
            <div className="text-right">
              <p className="text-[9px] md:text-[10px] uppercase tracking-widest text-muted-foreground/60">Estado</p>
              <p className="text-xs md:text-sm font-bold text-primary flex items-center gap-1"
                style={{ fontFamily: 'var(--font-space-grotesk), system-ui' }}>
                <span className="inline-block">✓</span>
                Operativo
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
