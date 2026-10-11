'use client';

import React, { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';

interface CostProLoaderProps {
  size?: number;
  text?: string;
  subtext?: string;
  showText?: boolean;
  showSubtext?: boolean;
  className?: string;
  fullScreen?: boolean;
  /**
   * PERF-AUDIT FASE 4 (2026-10-12): overlay posicionado sobre el contenido real
   * (que monta en paralelo detrás). Evita el <main id="main-content"> duplicado
   * y el salto de layout: el contenido ya está renderizado bajo el splash.
   */
  overlay?: boolean;
  /**
   * PERF-AUDIT FASE 4 (2026-10-12): si false, al terminar la marca el splash
   * dispara `costpro:skip-splash` pero permanece montado (fade a opacity-0);
   * el desmonte lo controla el padre cuando el contenido existe. Así nunca se
   * muestra la app como operativa antes de tiempo y no se ocultan errores.
   */
  autoDismiss?: boolean;
}

// PERF-AUDIT FASE 4 (2026-10-12) — decisión de producto: reducir la espera artificial.
// Antes: 1.800 ms (primera visita) + fade 500 ms ANTES de montar el contenido
// (montaje secuencial): el JS del landing/app no empezaba a descargar hasta que el
// splash terminaba → LCP de primera visita ~3,1 s. Ahora la preocupación está separada:
//   1) mínimo de marca: SPLASH_FIRST_MS / SPLASH_RETURN_MS (transición breve 600–800 ms
//      de extremo a extremo, incluida la salida),
//   2) inicialización real: el contenido monta en paralelo detrás del overlay y manda
//      su propio estado de carga (nunca se finge operatividad),
//   3) salida: SPLASH_FADE_MS.
// prefers-reduced-motion: sin animaciones, logo estático y salida corta.
const SPLASH_FIRST_MS = 650;      // antes 1800 (decisión de producto: 600–800 ms totales)
const SPLASH_RETURN_MS = 250;     // antes 600
const SPLASH_FADE_MS = 200;       // antes 500 (hardcoded)
const SPLASH_FADE_REDUCED_MS = 100;
const SPLASH_LINE_PHASE_MS = 350; // primera visita: línea 0→350 ms, logo 350→650 ms

type SplashPhase = 'line' | 'logo' | 'out';

export const CostProLoader: React.FC<CostProLoaderProps> = ({
  text,
  subtext,
  showText = !!text,
  showSubtext = !!subtext,
  className,
  fullScreen = false,
  overlay = false,
  autoDismiss = true,
}) => {
  // FIX-HYDRATION (2026-07-12): usar ID estable en vez de React.useId()
  // que genera hashes diferentes entre server/client en Turbopack dev mode.
  const id = 'cpl';

  const isReturning = useSyncExternalStore(
    () => () => {},
    () => typeof window !== 'undefined' ? !!localStorage.getItem('costpro-visited') : false,
    () => false
  );
  const prefersReducedMotion = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      mq.addEventListener('change', onStoreChange);
      return () => mq.removeEventListener('change', onStoreChange);
    },
    () => (typeof window !== 'undefined' && window.matchMedia)
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
    () => false
  );

  const [phase, setPhase] = useState<SplashPhase>(() => (!fullScreen || isReturning) ? 'logo' : 'line');
  const [dismissed, setDismissed] = useState(false);

  // PERF-AUDIT FASE 4: el timeline se decide UNA sola vez leyendo localStorage en el
  // primer efecto (momento client-only). No depende de useSyncExternalStore: ese valor
  // puede volcarse tras la hidratación y reprogramaría los timers (observado: splash
  // recurrente tardaba ~580ms en vez de 250ms). refs para no re-ejecutar el timeline.
  const autoDismissRef = useRef(autoDismiss);
  autoDismissRef.current = autoDismiss;
  const reducedRef = useRef(prefersReducedMotion);
  reducedRef.current = prefersReducedMotion;
  const timelineArmedRef = useRef(false);

  useEffect(() => {
    if (fullScreen && typeof window !== 'undefined' && !localStorage.getItem('costpro-visited')) {
      localStorage.setItem('costpro-visited', 'true');
    }
  }, [fullScreen]);

  const dismiss = useCallback(() => {
    setPhase('out');
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('costpro:skip-splash'));
      if (autoDismissRef.current) setDismissed(true);
    }, reducedRef.current ? SPLASH_FADE_REDUCED_MS : SPLASH_FADE_MS);
  }, []);

  useEffect(() => {
    if (!fullScreen || dismissed) return;
    timelineArmedRef.current = true;

    // Lectura única y determinista (client-only): ¿primera visita?
    let firstVisit = true;
    try { firstVisit = !localStorage.getItem('costpro-visited'); } catch {}
    const reduced = reducedRef.current;

    // FIX-SPLASH-STRICTMODE (2026-10-12): el guard `timelineArmedRef` evita
    // re-armados mientras el efecto sigue vivo, pero DEBE resetearse en el
    // cleanup: con reactStrictMode (dev) React desmonta y remonta el efecto
    // una vez por montaje — el primer cleanup borraba los timers programados y
    // el re-run salía temprano por el guard → dismiss() nunca corría y el
    // splash quedaba pegado en dev. Al resetear, cada ciclo de vida efectivo
    // (incluido el remontaje de StrictMode) programa sus timers una sola vez.
    if (firstVisit && !reduced) {
      // Secuencia de marca comprimida: línea (0→350) → logo (350→650)
      const t1 = setTimeout(() => setPhase('logo'), SPLASH_LINE_PHASE_MS);
      const t2 = setTimeout(() => dismiss(), SPLASH_FIRST_MS);
      return () => { timelineArmedRef.current = false; clearTimeout(t1); clearTimeout(t2); };
    }
    // Recurrentes o reduced-motion: logo estático inmediato, salida corta
    setPhase('logo');
    const t = setTimeout(() => dismiss(), SPLASH_RETURN_MS);
    return () => { timelineArmedRef.current = false; clearTimeout(t); };
  }, [fullScreen, dismissed, dismiss]);

  if (dismissed) return null;

  const fadeMs = prefersReducedMotion ? SPLASH_FADE_REDUCED_MS : SPLASH_FADE_MS;

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
          animation: cp-line-expand-${id} 0.35s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          box-shadow: 0 0 14px rgba(34,197,94,0.35), 0 0 40px rgba(34,197,94,0.12);
        }

        @keyframes cp-logo-reveal-${id} {
          0% { opacity: 0; transform: translateY(8px) scale(0.98); filter: blur(4px); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        .cp-splash-logo-${id} {
          animation: cp-logo-reveal-${id} 0.3s cubic-bezier(0.22, 1, 0.36, 1) forwards;
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

        /* PERF-AUDIT FASE 4: sin animaciones para usuarios con motion reducido */
        @media (prefers-reduced-motion: reduce) {
          .cp-splash-line-${id}, .cp-splash-logo-${id}, .cp-vignette-${id},
          .cp-fade-in-${id}, .cp-dot-${id}, .cp-line-draw-${id}, .cp-shimmer-${id} {
            animation: none !important;
          }
        }
      `}} />

      {fullScreen ? (
        <div
          className={cn(
            'flex flex-col items-center justify-center overflow-hidden',
            phase === 'out' ? 'opacity-0 transition-opacity pointer-events-none' : '',
            className,
          )}
          // PERF-AUDIT FASE 4: posicionamiento inline (no Tailwind) para que el overlay
          // sea inmune al orden de aplicación de CSS y no participe en el flujo —
          // evita el layout shift observado al insertar/mutar el splash.
          style={overlay
            ? { position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: '#000', transitionDuration: `${fadeMs}ms` }
            : { minHeight: '100vh', width: '100%', backgroundColor: '#000', transitionDuration: `${fadeMs}ms` }}
          data-testid="splash-loader"
          role="status"
          aria-live="polite"
          aria-label={[text, subtext].filter(Boolean).join(' — ') || 'Cargando'}
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
                phase === 'line' ? 'opacity-0' : `opacity-100 cp-splash-logo-${id}`,
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
                  phase === 'line' ? `cp-splash-line-${id}` : `cp-line-glow-${id}`,
                )}
                style={{
                  backgroundColor: 'var(--primary)',
                }}
              />

              <div className={cn(
                "flex flex-col items-center gap-2 transition-opacity duration-500",
                phase === 'line' ? 'opacity-0' : `opacity-100 cp-fade-in-${id}`
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

  // PERF-AUDIT FASE 4: en modo overlay el splash NO envuelve en <main> (el contenido
  // real detrás ya aporta la semántica); evita <main> duplicado y saltos de layout.
  if (fullScreen && !overlay) {
    return <main id="main-content">{content}</main>;
  }

  return content;
};
