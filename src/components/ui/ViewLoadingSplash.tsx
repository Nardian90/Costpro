'use client';
import { safeRandom } from '@/lib/safe-random';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ── Premium cost tips that rotate during loading ──
 * F6: Gamificación sutil — tips financieros + métricas + datos curiosos
 * que refuerzan el posicionamiento de CostPro como herramienta profesional.
 */
const COST_TIPS = [
  'El costo total es la base para fijar precios competitivos',
  'Los gastos asociados representan costos indirectos del producto',
  'La ficha de costo refleja la estructura económica real de su empresa',
  'Un buen análisis de costo permite identificar ineficiencias',
  'La Resolución 148/2023 establece el formato oficial para fichas de costo',
  'El salario directo incluye la carga social del trabajador',
  'Los gastos generales se distribuyen según el nivel de producción',
  'El índice de capacidad instalada afecta el costo unitario',
  'La utilidad planificada se calcula como porcentaje del costo total',
  'Las depreciaciones forman parte de los gastos directos e indirectos',
  'El valor histórico permite comparar con períodos anteriores',
  'Los anexos detallan la composición de cada partida de costo',
];

/* ── Premium metrics that animate during long loading ── */
const ANIMATED_METRICS = [
  { label: 'Procesando', value: 'fichas', icon: '📊' },
  { label: 'Calculando', value: 'costos', icon: '💰' },
  { label: 'Optimizando', value: 'precios', icon: '⚡' },
  { label: 'Analizando', value: 'márgenes', icon: '📈' },
];

interface ViewLoadingSplashProps {
  /** Main label shown with shimmer effect */
  label?: string;
  /** If true, renders as a full-screen fixed overlay (for PDF export, etc).
   *  If false, renders inline (for Suspense fallbacks, view loading). */
  overlay?: boolean;
  /** Show rotating cost tips below the label */
  showTips?: boolean;
  /** F6: Estimated duration — controls which loading level to show.
   *  'micro' (<1s): minimal animation, no tips.
   *  'medium' (1-3s): animated logo + tips.
   *  'long' (>3s): animated metrics + tips + progress bar.
   *  Default: 'medium'.
   */
  level?: 'micro' | 'medium' | 'long';
}

/**
 * F6: ViewLoadingSplash — Premium loading experience for CostPro.
 *
 * 3 niveles de carga basados en psicología UX cognitiva:
 *
 * Nivel 1 — Micro (<1s): Logo pulsante + línea animada. Sin tips.
 *   Objetivo: evitar parpadeos, dar feedback instantáneo.
 *   Psicología: reduces ansiedad by acknowledging the action.
 *
 * Nivel 2 — Medium (1-3s): Logo animado + shimmer label + tips rotando.
 *   Objetivo: distracción cognitiva positiva con tips financieros.
 *   Psicología: active distraction reduces perceived wait time by ~35%.
 *
 * Nivel 3 — Long (>3s): Todo lo anterior + barra de progreso + métricas animadas.
 *   Objetivo: sensación de avance progresivo, mantener atención.
 *   Psicología: progress bars make waits feel shorter even when inaccurate.
 *
 * Branding: logo "CP" con gradiente primary→success, línea de progreso
 * con gradiente, todo en paleta corporativa (verde primary + accent success).
 */
export const ViewLoadingSplash: React.FC<ViewLoadingSplashProps> = ({
  label = 'Cargando',
  overlay = false,
  showTips = true,
  level = 'medium',
}) => {
  const [tipIndex, setTipIndex] = useState(0);
  const [tipVisible, setTipVisible] = useState(true);
  const [metricIndex, setMetricIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const id = React.useId().replace(/:/g, '');
  const timerRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Rotate tips every 3.5s with fade transition
  useEffect(() => {
    if (!showTips || level === 'micro') return;
    const interval = setInterval(() => {
      setTipVisible(false);
      setTimeout(() => {
        setTipIndex(prev => (prev + 1) % COST_TIPS.length);
        setTipVisible(true);
      }, 400);
    }, 3500);
    return () => clearInterval(interval);
  }, [showTips, level]);

  // F6: Rotate metrics every 1.5s for long loading
  useEffect(() => {
    if (level !== 'long') return;
    const interval = setInterval(() => {
      setMetricIndex(prev => (prev + 1) % ANIMATED_METRICS.length);
    }, 1500);
    return () => clearInterval(interval);
  }, [level]);

  // F6: Animate progress bar for long loading — goes 0→90% over ~8s
  // (never reaches 100% to avoid false completion promise)
  useEffect(() => {
    if (level !== 'long') return;
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return 90;
        return prev + safeRandom(2, 10);
      });
    }, 600);
    return () => clearInterval(interval);
  }, [level]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => { timerRef.current.forEach(clearTimeout); timerRef.current = []; };
  }, []);

  const content = (
    <div className="relative flex flex-col items-center gap-5 max-w-sm px-4">
      {/* CSS animations — unique per instance via useId */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes vls-line-${id} {
          0% { width: 0; }
          50% { width: 80px; }
          100% { width: 0; }
        }
        .vls-line-${id} { animation: vls-line-${id} 2s ease-in-out infinite; }

        @keyframes vls-shimmer-${id} {
          0% { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
        .vls-shimmer-${id} {
          background: linear-gradient(90deg, hsl(var(--muted-foreground)) 0%, hsl(var(--primary)) 50%, hsl(var(--muted-foreground)) 100%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: vls-shimmer-${id} 2.5s linear infinite;
        }

        @keyframes vls-logo-pulse-${id} {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.05); opacity: 1; }
        }
        .vls-logo-${id} { animation: vls-logo-pulse-${id} 1.8s ease-in-out infinite; }

        @keyframes vls-ring-${id} {
          0% { stroke-dashoffset: 150; transform: rotate(0deg); }
          100% { stroke-dashoffset: 150; transform: rotate(360deg); }
        }
        .vls-ring-${id} {
          stroke-dasharray: 40 110;
          animation: vls-ring-${id} 1.5s linear infinite;
          transform-origin: center;
        }
      `}} />

      {/* F6: Animated logo — "CP" monogram with pulsing ring */}
      {level !== 'micro' && (
        <div className={`vls-logo-${id} relative w-14 h-14 flex items-center justify-center`}>
          {/* Rotating ring */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 56 56">
            <circle
              cx="28" cy="28" r="24"
              fill="none"
              stroke="var(--primary)"
              strokeWidth="2"
              strokeLinecap="round"
              className={`vls-ring-${id}`}
              opacity="0.6"
            />
          </svg>
          {/* Monogram */}
          <div
            className="relative w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm tracking-tighter"
            style={{
              background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--success)) 100%)',
              fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif',
            }}
          >
            CP
          </div>
        </div>
      )}

      {/* Animated line — shown in all levels */}
      <div className="flex items-center justify-center">
        <div
          className={`vls-line-${id} h-[2px] rounded-full`}
          style={{ backgroundColor: 'var(--primary)' }}
        />
      </div>

      {/* Shimmer label */}
      <p
        className={`vls-shimmer-${id} text-xs uppercase tracking-[0.25em] font-bold`}
        style={{ fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif' }}
      >
        {label}
      </p>

      {/* F6: Long loading — animated metrics */}
      {level === 'long' && (
        <div className="h-6 flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={metricIndex}
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -15 }}
              transition={{ duration: 0.4 }}
              className="flex items-center gap-2 text-xs font-bold text-primary/80"
              style={{ fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif' }}
            >
              <span className="text-sm">{ANIMATED_METRICS[metricIndex].icon}</span>
              <span>{ANIMATED_METRICS[metricIndex].label}</span>
              <span className="text-muted-foreground">{ANIMATED_METRICS[metricIndex].value}</span>
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      {/* F6: Long loading — progress bar */}
      {level === 'long' && (
        <div className="w-full max-w-[200px] h-1 rounded-full bg-muted/50 overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{
              background: 'linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--success)) 100%)',
            }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
      )}

      {/* Rotating tip — only for medium and long */}
      {showTips && level !== 'micro' && (
        <div className="h-8 flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.p
              key={tipIndex}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: tipVisible ? 0.6 : 0, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.4 }}
              className="text-xs text-center leading-relaxed max-w-[280px]"
              style={{
                color: 'var(--muted-foreground)',
                fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif',
              }}
            >
              {COST_TIPS[tipIndex]}
            </motion.p>
          </AnimatePresence>
        </div>
      )}
    </div>
  );

  // Overlay mode: fixed fullscreen with backdrop
  if (overlay) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-background/90 backdrop-blur-md"
        >
          {content}
        </motion.div>
      </AnimatePresence>
    );
  }

  // Inline mode: for Suspense fallbacks and view loading
  return (
    <div className="flex flex-col items-center justify-center py-24 min-h-[50vh]">
      {content}
    </div>
  );
};
