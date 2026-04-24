'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface CostProLoaderProps {
  size?: number;
  text?: string;
  subtext?: string;
  showText?: boolean;
  showSubtext?: boolean;
  className?: string;
  fullScreen?: boolean;
}

/* ── Splash timing (fullScreen only) ── */
const SPLASH_FIRST_MS = 1800;   // First visit: line + logo + hold
const SPLASH_RETURN_MS = 600;   // Returning visitor: quick flash

/**
 * CostProLoader — Netflix-Line Style Loader
 *
 * fullScreen (splash):
 *   1. Green line expands from center outward (Netflix N-style)
 *   2. "CostPro" fades in once line reaches full width
 *   3. Brief hold → fade out → dispatch dismiss event
 *
 * inline (loading states):
 *   Compact green dot pulse + optional shimmer subtext.
 *   Minimal, blends with any background.
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

  /* ── Splash state (fullScreen only) ── */
  const [phase, setPhase] = useState<'line' | 'logo' | 'hold' | 'out'>(
    fullScreen ? 'line' : 'logo'
  );
  const [dismissed, setDismissed] = useState(false);

  const dismiss = useCallback(() => {
    setPhase('out');
    setTimeout(() => {
      setDismissed(true);
      window.dispatchEvent(new CustomEvent('costpro:skip-splash'));
    }, 500);
  }, []);

  /* ── Splash timeline ── */
  useEffect(() => {
    if (!fullScreen || dismissed) return;

    let timers: ReturnType<typeof setTimeout>[] = [];

    // Check returning visitor
    const isReturning = typeof window !== 'undefined' && localStorage.getItem('costpro-visited');
    if (typeof window !== 'undefined' && !isReturning) {
      localStorage.setItem('costpro-visited', 'true');
    }

    const totalMs = isReturning ? SPLASH_RETURN_MS : SPLASH_FIRST_MS;

    if (isReturning) {
      // Returning: skip line animation, go straight to logo
      setPhase('logo');
      timers.push(setTimeout(dismiss, totalMs));
    } else {
      // First visit: line (0-800ms) → logo (800-1200ms) → hold (1200-1800ms) → out
      timers.push(setTimeout(() => setPhase('logo'), 800));
      timers.push(setTimeout(() => setPhase('hold'), 1200));
      timers.push(setTimeout(dismiss, totalMs));
    }

    return () => timers.forEach(clearTimeout);
  }, [fullScreen, dismissed, dismiss]);

  if (dismissed && !fullScreen) return null;
  if (dismissed && fullScreen) return null;

  /* ══════════════════════════════════════════════════════
     FULLSCREEN SPLASH — Netflix Line Style
     ══════════════════════════════════════════════════════ */
  if (fullScreen) {
    return (
      <div
        className={cn(
          'min-h-screen w-full flex flex-col items-center justify-center overflow-hidden relative',
          phase === 'out' ? 'opacity-0 transition-opacity duration-500' : '',
          className,
        )}
        style={{ backgroundColor: 'var(--background)' }}
      >
        <style dangerouslySetInnerHTML={{ __html: `
          /* ── Netflix Line: expand from center (scaleX — GPU accelerated) ── */
          @keyframes cp-line-expand-${id} {
            0% { transform: scaleX(0); opacity: 0; }
            6% { opacity: 1; }
            100% { transform: scaleX(1); opacity: 1; }
          }
          .cp-splash-line-${id} {
            transform-origin: center;
            animation: cp-line-expand-${id} 0.8s cubic-bezier(0.22, 1, 0.36, 1) forwards;
            box-shadow: 0 0 14px rgba(34,197,94,0.35), 0 0 40px rgba(34,197,94,0.12);
          }

          /* ── Logo reveal ── */
          @keyframes cp-logo-reveal-${id} {
            0% { opacity: 0; transform: translateY(8px) scale(0.98); filter: blur(4px); }
            100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
          }
          .cp-splash-logo-${id} {
            animation: cp-logo-reveal-${id} 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          }

          /* ── Line subtle glow (Netflix style — breathing) ── */
          @keyframes cp-line-glow-${id} {
            0%, 100% { box-shadow: 0 0 10px rgba(34,197,94,0.25), 0 0 30px rgba(34,197,94,0.08); }
            50% { box-shadow: 0 0 18px rgba(34,197,94,0.45), 0 0 50px rgba(34,197,94,0.15); }
          }
          .cp-line-glow-${id} {
            animation: cp-line-glow-${id} 2s ease-in-out infinite;
          }

          /* ── Subtle vignette (barely perceptible ambient glow) ── */
          @keyframes cp-vignette-${id} {
            0% { opacity: 0; }
            100% { opacity: 0.04; }
          }
          .cp-vignette-${id} {
            animation: cp-vignette-${id} 1s ease-out forwards;
          }
        `}} />

        {/* Very subtle center glow — barely perceptible */}
        <div className={`cp-vignette-${id} absolute inset-0 pointer-events-none`}
          style={{
            background: 'radial-gradient(ellipse at center, var(--primary) 0%, transparent 50%)',
            opacity: 0,
          }}
        />

        {/* Center content */}
        <div className="relative z-10 flex flex-col items-center gap-8">
          {/* Logo text — always in DOM so it reserves space; invisible during line phase */}
          <div
            className={cn(
              phase === 'line' ? 'opacity-0' : `opacity-100 cp-splash-logo-${id}`,
            )}
            style={{ transition: 'opacity 0.15s ease' }}
          >
            <h1
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl tracking-tighter leading-none"
              style={{
                fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif',
                fontWeight: 900,
                color: 'var(--foreground)',
              }}
            >
              Cost<span style={{ color: 'var(--primary)' }}>Pro</span>
            </h1>
          </div>

          {/* Green line — 300px wide × 5px tall, animation via scaleX */}
          <div className="flex items-center justify-center">
            <div
              className={cn(
                'h-[5px] w-[300px] rounded-full',
                phase === 'line' ? `cp-splash-line-${id}` : `cp-line-glow-${id}`,
              )}
              style={{
                backgroundColor: 'var(--primary)',
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════
     INLINE MODE — Compact Loader
     ══════════════════════════════════════════════════════ */
  return (
    <div className={cn('flex flex-col items-center justify-center gap-4', className)}>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes cp-dot-pulse-${id} {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
        .cp-dot-${id} {
          animation: cp-dot-pulse-${id} 1.2s ease-in-out infinite;
        }

        @keyframes cp-line-draw-${id} {
          0% { width: 0; }
          50% { width: 48px; }
          100% { width: 0; }
        }
        .cp-line-draw-${id} {
          animation: cp-line-draw-${id} 1.8s ease-in-out infinite;
        }

        @keyframes cp-shimmer-${id} {
          0% { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
        .cp-shimmer-${id} {
          background: linear-gradient(90deg, var(--muted-foreground) 0%, var(--primary) 50%, var(--muted-foreground) 100%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: cp-shimmer-${id} 2.5s linear infinite;
        }
      `}} />

      {/* Mini green dot + expanding line */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-2">
          <div
            className={`cp-dot-${id} w-2 h-2 rounded-full`}
            style={{ backgroundColor: 'var(--primary)' }}
          />
          <div
            className={`cp-line-draw-${id} h-[2px] rounded-full`}
            style={{ backgroundColor: 'var(--primary)' }}
          />
        </div>

        {/* Optional text */}
        {showText && text && (
          <p
            className="text-[10px] uppercase tracking-[0.3em] font-bold"
            style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif' }}
          >
            {text}
          </p>
        )}

        {/* Optional shimmer subtext */}
        {showSubtext && subtext && (
          <span className={`cp-shimmer-${id} text-[9px] uppercase tracking-[0.25em] font-semibold`}>
            {subtext}
          </span>
        )}
      </div>
    </div>
  );
};
