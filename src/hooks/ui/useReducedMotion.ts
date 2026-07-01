import { useEffect, useState } from 'react';

/**
 * Detecta si el usuario tiene activada la preferencia de reducción de movimiento
 * del sistema operativo (prefers-reduced-motion: reduce).
 *
 * WCAG 2.2 — Criterio 2.3.3 (nivel AAA) y buena práctica AA.
 * Aplícalo en todos los motion.div del módulo multi-tienda.
 */
export function useReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');

    const handler = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return prefersReduced;
}

/**
 * Helper para construir props de motion.div condicionalmente.
 * Uso: <motion.div {...motionSafe(prefersReduced, { initial: {...}, animate: {...} })} >
 */
export function motionSafe<T extends Record<string, unknown>>(
  prefersReduced: boolean,
  motionProps: T
): T | Record<string, never> {
  return prefersReduced ? {} : motionProps;
}
