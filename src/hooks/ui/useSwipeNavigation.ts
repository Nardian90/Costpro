'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useIsMobile } from '@/hooks/ui/useMobile';

/**
 * F5-T03: Hook para detectar swipe horizontal en mobile y cambiar de tienda.
 *
 * Usa touch events nativos (no librerías) para detectar swipe izquierda/derecha.
 * Solo activo en mobile (<768px) y en rutas operativas (no en /config, /team, etc.).
 *
 * Umbral: 80px horizontal, menos de 100px vertical (para no confundir con scroll).
 *
 * Uso:
 * useSwipeNavigation({
 *   onSwipeLeft: () => switchToNext(),
 *   onSwipeRight: () => switchToPrev(),
 *   enabled: isMobile && !isConfigRoute,
 * });
 */

interface SwipeNavigationOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  enabled?: boolean;
}

const SWIPE_THRESHOLD_X = 80; // mínimos 80px horizontales
const SWIPE_THRESHOLD_Y = 100; // máximos 100px verticales (más = scroll, no swipe)

export function useSwipeNavigation({
  onSwipeLeft,
  onSwipeRight,
  enabled = true,
}: SwipeNavigationOptions) {
  const isMobile = useIsMobile();
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!e.touches[0]) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
  }, []);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!e.changedTouches[0]) return;

    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    const elapsed = Date.now() - touchStartTime.current;

    // Debe ser un swipe rápido (<500ms) y principalmente horizontal
    if (elapsed > 500) return;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD_X) return;
    if (Math.abs(deltaY) > SWIPE_THRESHOLD_Y) return;

    // FIX-BUG: Ignorar swipes que se originan dentro de elementos scrollables horizontalmente
    // (tablas con overflow-x-auto, etc.). Si el touchstart ocurrió dentro de un elemento
    // que tiene overflow horizontal, el gesto es scroll de tabla, no swipe de tienda.
    const target = e.target as HTMLElement;
    if (target) {
      const scrollableParent = target.closest('[class*="overflow-x-auto"], table, .table-to-cards');
      if (scrollableParent) return; // No disparar cambio de tienda
    }

    // Swipe izquierda → siguiente tienda
    if (deltaX < 0 && onSwipeLeft) {
      onSwipeLeft();
    }
    // Swipe derecha → tienda anterior
    else if (deltaX > 0 && onSwipeRight) {
      onSwipeRight();
    }
  }, [onSwipeLeft, onSwipeRight]);

  useEffect(() => {
    if (!enabled || !isMobile) return;

    const content = document.querySelector('.terminal-content');
    if (!content) return;

    // Audit-Fix #2d: addEventListener espera EventListener pero nuestros handlers
    // son (e: TouchEvent). Cast a EventListener para compatibilidad de tipos.
    content.addEventListener('touchstart', handleTouchStart as EventListener, { passive: true });
    content.addEventListener('touchend', handleTouchEnd as EventListener, { passive: true });

    return () => {
      content.removeEventListener('touchstart', handleTouchStart as EventListener);
      content.removeEventListener('touchend', handleTouchEnd as EventListener);
    };
  }, [enabled, isMobile, handleTouchStart, handleTouchEnd]);
}
