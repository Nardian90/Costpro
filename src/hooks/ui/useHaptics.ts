'use client';

import { useCallback } from 'react';

/**
 * Hook para feedback háptico en acciones críticas.
 *
 * Usa navigator.vibrate (API estándar web) que funciona en Android.
 * En iOS no hay soporte nativo, pero la función es no-op (no rompe).
 *
 * Patrones:
 * - light(10ms): tap normal, selección
 * - medium(30ms): confirmación de acción
 * - heavy(50ms): acción destructiva o checkout
 * - success([10,30,10]): patrón de éxito
 * - error([50,30,50]): patrón de error
 */
export function useHaptics() {
  const vibrate = useCallback((pattern: number | number[]) => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Silent fail — haptics are best-effort, never block
      }
    }
  }, []);

  return {
    /** Tap ligero — selección, hover tap */
    light: useCallback(() => vibrate(10), [vibrate]),
    /** Confirmación media — botón presionado, cambio de tab */
    medium: useCallback(() => vibrate(30), [vibrate]),
    /** Acción crítica — checkout, anulación, eliminación */
    heavy: useCallback(() => vibrate(50), [vibrate]),
    /** Patrón de éxito — venta completada, recepción confirmada */
    success: useCallback(() => vibrate([10, 30, 10]), [vibrate]),
    /** Patrón de error — validación fallida, stock insuficiente */
    error: useCallback(() => vibrate([50, 30, 50]), [vibrate]),
  };
}
