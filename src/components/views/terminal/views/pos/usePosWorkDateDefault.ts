'use client';

/**
 * usePosWorkDateDefault — MISIÓN FECHAS DE TRABAJO (2026-10-18).
 *
 * Inicializa la FECHA DE VENTA del carrito (useCartStore.saleDate) con la
 * preferencia de trabajo del usuario para el tipo 'sale', cuando es válida
 * contra los límites vivos de la política temporal del PR #1422.
 *
 * Reglas de aplicación (no invasivas):
 *   - Solo UNA VEZ por montaje de Vender (guard por ref).
 *   - Solo si el carrito está en «hoy implícito» (saleDate === null): nunca
 *     pisa una fecha elegida por el usuario o persistida de una sesión previa.
 *   - Solo si la preferencia pasa validateOperationDate contra el mínimo
 *     per-store (forward-only) y el máximo HOY (Habana) — una preferencia
 *     caducada NO bloquea la venta: el carrito conserva «hoy implícito».
 *
 * El selector visible (POSOperationDateSection en Pago / Vale / Express)
 * sigue siendo el control autoritativo: el usuario ve la fecha aplicada y
 * puede cambiarla antes de confirmar. El checkout envía el valor con la
 * convención canónica (hoy → no se envía, servidor estampa NOW(); ≠ hoy →
 * mediodía local) y el servidor revalida SIEMPRE (ruta 422 + gate RPC).
 */

import { useEffect, useRef } from 'react';
import { useCartStore } from '@/store/cart';
import { useAuthStore } from '@/store';
import { useWorkDateDefault } from '@/hooks/ui/useWorkDateDefault';
import { todayBusinessDay } from '@/lib/cash-report/period-attribution';

export function usePosWorkDateDefault() {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId ?? null;
  const saleDate = useCartStore((s) => s.saleDate);
  const setSaleDate = useCartStore((s) => s.setSaleDate);
  const appliedRef = useRef(false);

  const workDate = useWorkDateDefault('sale', storeId);

  useEffect(() => {
    if (appliedRef.current) return; // una sola vez por montaje
    if (workDate === undefined) return; // resolviendo (min cargando)
    appliedRef.current = true;
    if (workDate === null) return; // sin preferencia válida → hoy implícito
    // Solo si el carrito no tiene fecha elegida (null = hoy implícito) y la
    // preferencia sigue siendo != hoy (si el usuario guardó HOY, la vista
    // central ya lo guarda como «sin preferencia»).
    const todayBd = todayBusinessDay();
    const current = useCartStore.getState().saleDate;
    if (current === null && workDate !== todayBd) {
      setSaleDate(workDate);
    }
  }, [workDate, setSaleDate]);
}
