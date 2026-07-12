'use client';

import React, { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
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

const SPLASH_FIRST_MS = 1800;
const SPLASH_RETURN_MS = 600;

export const CostProLoader: React.FC<CostProLoaderProps> = ({
  text,
  subtext,
  showText = !!text,
  showSubtext = !!subtext,
  className,
  fullScreen = false,
}) => {
  // FIX-HYDRATION (2026-07-12): usar ID estable en vez de React.useId()
  // que genera hashes diferentes entre server/client en Turbopack dev mode.
  const id = 'cpl';

  const isReturning = useSyncExternalStore(
    () => () => {},
    () => typeof window !== 'undefined' ? !!localStorage.getItem('costpro-visited') : false,
    () => false
  );
  const [phase, setPhase] = useState<'line' | 'logo' | 'hold' | 'out'>(
    () => {
      if (!fullScreen) return 'logo';
      return 'line';
    }
  );
  const [dismissed, setDismissed] = useState(false);

  const effectivePhase = (phase === 'line' && isReturning) ? 'logo' : phase;

  useEffect(() => {
    if (fullScreen && typeof window !== 'undefined' && !localStorage.getItem('costpro-visited')) {
      localStorage.setItem('costpro-visited', 'true');
    }
  }, [fullScreen]);

  const dismiss = useCallback(() => {
    setPhase('out');
    setTimeout(() => {
      setDismissed(true);
      window.dispatchEvent(new CustomEvent('costpro:skip-splash'));
    }, 500);
  }, []);

  useEffect(() => {
    if (!fullScreen || dismissed) return;

    console.log('[DIAG] CostProLoader effect: isReturning=', isReturning, 'phase=', phase);
    let timers: ReturnType<typeof setTimeout>[] = [];
    const totalMs = isReturning ? SPLASH_RETURN_MS : SPLASH_FIRST_MS;

    if (isReturning) {
      timers.push(setTimeout(() => {
        console.log('[DIAG] CostProLoader dismiss timer fired (returning)');
        dismiss();
      }, totalMs));
    } else {
      timers.push(setTimeout(() => {
        console.log('[DIAG] CostProLoader phase -> logo');
        setPhase('logo');
      }, 800));
      timers.push(setTimeout(() => {
        console.log('[DIAG] CostProLoader phase -> hold');
        setPhase('hold');
      }, 1200));
      timers.push(setTimeout(() => {
        console.log('[DIAG] CostProLoader dismiss timer fired (first)');
        dismiss();
      }, totalMs));
    }

    return () => {
      console.log('[DIAG] CostProLoader effect cleanup');
      timers.forEach(clearTimeout);
    };
  }, [fullScreen, dismissed, dismiss, isReturning]);

  if (dismissed) return null;

  const content = (
    <>
      <style suppressHydrationWarning dangerouslySetInnerHTML={{ __html: `
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

        @keyframes cp-logo-reveal-${id} {
          0% { opacity: 0; transform: translateY(8px) scale(0.98); filter: blur(4px); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        .cp-splash-logo-${id} {
          animation: cp-logo-reveal-${id} 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }

        @keyframes cp-line-glow-${id} {
          0%, 100% { box-shadow: 0 0 10px rgba(34,197,94,0.25), 0 0 30px rgba(34,197,94,0.08); }
          50% { box-shadow: 0 0 18px rgba(34,197,94,0.45), 0 0 50px rgba(34,197,94,0.15); }
        }
        .cp-line-glow-${id} {
          animation: cp-line-glow-${id} 2s ease-in-out infinite;
        }

        @keyframes cp-vignette-${id} {
          0% { opacity: 0; }
          100% { opacity: 0.04; }
        }
        .cp-vignette-${id} {
          animation: cp-vignette-${id} 1s ease-out forwards;
        }

        @keyframes cp-fade-in-${id} {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        .cp-fade-in-${id} {
          animation: cp-fade-in-${id} 0.8s ease-out forwards;
        }

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

      {fullScreen ? (
        <div
          className={cn(
            'min-h-screen w-full flex flex-col items-center justify-center overflow-hidden relative',
            phase === 'out' ? 'opacity-0 transition-opacity duration-500' : '',
            className,
          )}
          style={{ backgroundColor: '#000' }}
          data-testid="splash-loader"
        >
          <div className={`cp-vignette-${id} absolute inset-0 pointer-events-none`}
            style={{
              background: 'radial-gradient(ellipse at center, var(--primary) 0%, transparent 50%)',
              opacity: 0,
            }}
          />

          <div className="relative z-10 flex flex-col items-center gap-8">
            <div
              className={cn(
                effectivePhase === 'line' ? 'opacity-0' : `opacity-100 cp-splash-logo-${id}`,
              )}
              style={{ transition: 'opacity 0.15s ease' }}
            >
              <h1
                className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl tracking-tighter leading-none"
                style={{
                  fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif',
                  fontWeight: 900,
                  color: '#fff',
                }}
              >
                Cost<span style={{ color: 'var(--primary)' }}>Pro</span>
              </h1>
            </div>

            <div className="flex flex-col items-center gap-6">
              <div
                className={cn(
                  'h-[5px] w-[300px] rounded-full',
                  effectivePhase === 'line' ? `cp-splash-line-${id}` : `cp-line-glow-${id}`,
                )}
                style={{
                  backgroundColor: 'var(--primary)',
                }}
              />

              <div className={cn(
                "flex flex-col items-center gap-2 transition-opacity duration-500",
                effectivePhase === 'line' ? 'opacity-0' : 'opacity-100 cp-fade-in-${id}'
              )}>
                {showText && text && (
                  <p className="text-white/60 text-xs uppercase tracking-[0.4em] font-medium">
                    {text}
                  </p>
                )}
                {showSubtext && subtext && (
                  <p className="text-white/20 text-[10px] uppercase tracking-[0.2em]">
                    {subtext}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className={cn('flex flex-col items-center justify-center gap-4', className)}>
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

            {showText && text && (
              <p
                className="text-[10px] uppercase tracking-[0.3em] font-bold"
                style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif' }}
              >
                {text}
              </p>
            )}

            {showSubtext && subtext && (
              <span className={`cp-shimmer-${id} text-[9px] uppercase tracking-[0.25em] font-semibold`}>
                {subtext}
              </span>
            )}
          </div>
        </div>
      )}
    </>
  );

  // Always wrap in <main id="main-content"> if it's the primary content (splash or main app content)
  if (fullScreen) {
    return <main id="main-content">{content}</main>;
  }

  return content;
};
