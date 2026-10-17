'use client';

/**
 * MISIÓN-TASAS (2026-10-17) — useDailyRatesConfirmation
 *
 * Controla el recordatorio preventivo de confirmación de tasas de cambio:
 * la PRIMERA vez que el usuario abre el carrito POS en cada DÍA OPERATIVO
 * (día de negocio America/Havana) por tienda, se pide confirmar que las
 * tasas vigentes siguen correctas — evita vender con tasas desactualizadas
 * por olvido.
 *
 * Persistencia: tabla `user_preferences` del SERVIDOR (hook canónico
 * useUserPreferences, cross-device, RLS por usuario) con clave
 * `rates-confirmation:<storeId>:<YYYY-MM-DD>`. La caducidad diaria es
 * estructural (la clave cambia cada día) y la confirmación es idempotente
 * (PK user_id + preference_key). NO depende de localStorage.
 *
 * Reglas:
 *   - Confirmación válida del día → no se vuelve a molestar al abrir/cerrar
 *     el carrito repetidamente.
 *   - Tasas modificadas DESPUÉS de confirmar → se vuelve a pedir
 *     ('rates_changed'): una confirmación anterior jamás oculta un cambio.
 *   - Cada confirmación queda auditada (rates_confirmed en audit_logs).
 *   - La confirmación NO modifica las tasas: solo deja constancia.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useAuthStore } from '@/store';
import { useCartStore } from '@/store/cart';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { todayBusinessDay } from '@/lib/cash-report/period-attribution';
import {
  ratesConfirmationKey,
  evaluateRatesConfirmation,
  buildRatesConfirmationRecord,
  type RatesConfirmationRecord,
  type RatesConfirmationNeededReason,
} from '@/lib/pos/rates-confirmation';
import { auditService } from '@/services/audit-service';
import { canManageStore } from '@/lib/roles';

export function useDailyRatesConfirmation(storeId: string | undefined) {
  // Día de negocio actual (America/Havana) — el mismo criterio canónico que
  // cash-report/period-attribution usa para atribuir ventas al día.
  const businessDay = todayBusinessDay();
  const prefKey = useMemo(
    () => (storeId ? ratesConfirmationKey(storeId, businessDay) : ''),
    [storeId, businessDay],
  );

  const { value: record, update, loading } = useUserPreferences<
    RatesConfirmationRecord | null
  >(prefKey, null);

  // globalRates = copia hidratada de store_exchange_rates (fuente real del POS)
  const globalRates = useCartStore((s) => s.globalRates);
  const user = useAuthStore((s) => s.user);

  // "Continuar sin confirmar" solo silencia por SESIÓN: no persiste ninguna
  // confirmación, así que al reabrir el carrito vuelve a preguntar.
  const [sessionDismissed, setSessionDismissed] = useState(false);
  const confirmingRef = useRef(false);
  const [confirming, setConfirming] = useState(false);

  const evaluation = useMemo(() => {
    if (!storeId) return { needed: false as const, reason: null };
    return evaluateRatesConfirmation(record, globalRates, { businessDay, storeId });
  }, [record, globalRates, businessDay, storeId]);

  const canManageRates = canManageStore(user as never, storeId || '');

  const showDialog =
    !!storeId &&
    !loading &&
    evaluation.needed &&
    (evaluation.reason === 'rates_changed' ? true : !sessionDismissed);

  /** Acción A: confirmar tasas vigentes (persistente + auditable, idempotente). */
  const confirm = useCallback(async (): Promise<boolean> => {
    if (!storeId || confirmingRef.current) return false;
    confirmingRef.current = true;
    setConfirming(true);
    try {
      await update(buildRatesConfirmationRecord(storeId, businessDay, globalRates));
      // Doble-write defensivo: si el upsert de preferencia falla, el estado
      // local ya lo refleja; la auditoría se intenta siempre (nunca lanza).
      void auditService.logRatesConfirmed({
        userId: user?.id || '',
        storeId,
        businessDay,
        rates: { ...globalRates },
        reason: null,
      });
      setSessionDismissed(false);
      return true;
    } finally {
      confirmingRef.current = false;
      setConfirming(false);
    }
  }, [storeId, businessDay, globalRates, update, user?.id]);

  /** Cerrar sin confirmar (no persiste confirmación; reaparece al reabrir). */
  const dismiss = useCallback(() => setSessionDismissed(true), []);

  return {
    showDialog,
    reason: evaluation.reason as RatesConfirmationNeededReason | null,
    businessDay,
    rates: globalRates,
    confirming,
    confirm,
    dismiss,
    canManageRates,
  };
}
