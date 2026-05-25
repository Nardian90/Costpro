'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ── Cost tips that rotate during loading ── */
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

interface ViewLoadingSplashProps {
  /** Main label shown with shimmer effect */
  label?: string;
  /** If true, renders as a full-screen fixed overlay (for PDF export, etc).
   *  If false, renders inline (for Suspense fallbacks, view loading). */
  overlay?: boolean;
  /** Show rotating cost tips below the label */
  showTips?: boolean;
}

/**
 * ViewLoadingSplash — Enterprise loading indicator for CostPro views
 *
 * Combines the splash visual identity (green line + logo) with:
 * - Cyclic progress animation (indefinite spinner arc)
 * - Rotating cost tips that fade in/out transparently
 * - Shimmer phase label
 *
 * Modes:
 * - overlay=true: Fixed fullscreen (for PDF export, heavy operations)
 * - overlay=false: Inline (for Suspense fallbacks, view transitions)
 */
export const ViewLoadingSplash: React.FC<ViewLoadingSplashProps> = ({
  label = 'Cargando',
  overlay = false,
  showTips = true,
}) => {
  const [tipIndex, setTipIndex] = useState(0);
  const [tipVisible, setTipVisible] = useState(true);
  const id = React.useId().replace(/:/g, '');
  const timerRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Rotate tips every 3.5s with fade transition
  useEffect(() => {
    if (!showTips) return;
    const interval = setInterval(() => {
      setTipVisible(false);
      setTimeout(() => {
        setTipIndex(prev => (prev + 1) % COST_TIPS.length);
        setTipVisible(true);
      }, 400);
    }, 3500);
    return () => clearInterval(interval);
  }, [showTips]);

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
      `}} />

      {/* Animated line */}
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

      {/* Rotating tip */}
      {showTips && (
        <div className="h-8 flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.p
              key={tipIndex}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: tipVisible ? 0.6 : 0, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.4 }}
              className="text-[10px] text-center leading-relaxed max-w-[280px]"
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
