'use client';

import { useRef, useCallback, useState, useEffect } from 'react';

/**
 * Hook de pull-to-refresh para listas en mobile.
 *
 * Detecta el gesto de "tirar hacia abajo" cuando el scroll está en el top
 * y ejecuta la función de refresh cuando se supera el umbral.
 *
 * Solo activo en touch devices (detecta touchstart).
 *
 * Uso:
 * const { pullDistance, isRefreshing, bind } = usePullToRefresh(async () => {
 *   await refetch();
 * });
 *
 * <div {...bind} style={{ transform: `translateY(${pullDistance}px)` }}>
 */
export function usePullToRefresh(onRefresh: () => Promise<void>) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);
  const threshold = 70; // px necesarios para trigger
  const maxPull = 100; // máximo px visible

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Solo iniciar pull si el scroll está en el top
    if (typeof window !== 'undefined' && window.scrollY <= 0) {
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling.current || isRefreshing) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) {
      // Resistencia elástica: cuanto más tira, más cuesta
      const eased = Math.min(maxPull, delta * 0.5);
      setPullDistance(eased);
    }
  }, [isRefreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!pulling.current) return;
    pulling.current = false;

    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(threshold);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, isRefreshing, onRefresh]);

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      pulling.current = false;
    };
  }, []);

  return {
    pullDistance,
    isRefreshing,
    bind: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  };
}
