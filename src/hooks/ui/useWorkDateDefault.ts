/**
 * useWorkDateDefault — MISIÓN FECHAS DE TRABAJO (2026-10-18).
 *
 * Resuelve la preferencia de fecha de trabajo de un tipo de movimiento como
 * DEFAULT del próximo documento, VALIDADA contra los límites reales de la
 * política temporal del PR #1422:
 *   - mínimo = fecha operativa MAX de la tienda (RPC get_global_max_operation_date,
 *     comparación inclusiva por día de negocio — forward-only per-store);
 *   - máximo = HOY (día de negocio America/Havana).
 *
 * Contrato del hook (para los formularios):
 *   - `undefined` → aún resolviendo (min cargando / scope sin cargar). El
 *     formulario conserva su default actual (HOY) mientras tanto.
 *   - `null`      → sin preferencia guardada O preferencia caducada (la
 *     tienda avanzó su mínimo y la fecha guardada quedó en el pasado). El
 *     formulario conserva HOY. Nunca se bloquea una operación por una
 *     preferencia stale.
 *   - `'YYYY-MM-DD'` → preferencia válida: el formulario la usa como valor
 *     inicial de su selector. El selector sigue siendo editable y visible.
 *
 * Aislamiento (misión §3.4): la preferencia vive en localStorage con scope
 * usuario+tienda+tipo → cambiar la fecha de trabajo de VENTAS no toca la de
 * RECEPCIONES, ni la de otros usuarios, ni la de otras tiendas.
 *
 * El servidor SIEMPRE revalida la fecha final al confirmar el documento
 * (rutas con checkNotFutureOperationDate + gate canónico validate_operation_date
 * del PR #1422): esta preferencia es un default de UX, no una vía de evasión.
 */

'use client';

import { useEffect, useMemo } from 'react';
import { useAuthStore } from '@/store';
import { useWorkDatePrefsStore } from '@/store/work-date-prefs';
import { useGlobalOperationDate, validateOperationDate } from '@/hooks/api/useGlobalOperationDate';
import { todayBusinessDay } from '@/lib/cash-report/period-attribution';
import { getMovementType } from '@/config/work-dates/movement-types';

export type WorkDateDefault = string | null | undefined;

/**
 * @param type ID del tipo de movimiento (registro canónico).
 * @param storeId Tienda activa (default: user.activeStoreId del auth store).
 * @returns undefined (resolviendo) · null (sin preferencia válida) · 'YYYY-MM-DD'.
 */
export function useWorkDateDefault(
  type: string,
  storeIdOverride?: string | null,
): WorkDateDefault {
  const { user } = useAuthStore();
  const storeId = storeIdOverride ?? user?.activeStoreId ?? null;
  const userId = user?.id ?? null;

  const prefsScope = useWorkDatePrefsStore((s) => s.scope);
  const prefs = useWorkDatePrefsStore((s) => s.prefs);
  const loadScope = useWorkDatePrefsStore((s) => s.loadScope);

  // Cargar scope usuario+tienda (idempotente).
  useEffect(() => {
    loadScope(userId, storeId);
  }, [userId, storeId, loadScope]);

  const scopeReady = !!userId && !!storeId && prefsScope === `${userId}:${storeId}`;
  const rawPref = prefs[type] ?? null;

  const { data: globalDateInfo, isLoading: minLoading } = useGlobalOperationDate(storeId);
  const todayBd = useMemo(() => todayBusinessDay(), []);

  return useMemo(() => {
    // Reglas duras del registro: tipos fijos/informativos nunca devuelven pref.
    if (!getMovementType(type)?.preferenceEnabled) return null;
    if (!scopeReady || minLoading) return undefined; // resolviendo
    if (!rawPref) return null; // sin preferencia → HOY implícito
    // Preferencia presente: validar contra los límites vivos de la política.
    const v = validateOperationDate(rawPref, globalDateInfo?.minAllowedDate ?? null, todayBd);
    return v.valid ? rawPref : null; // stale → null (el form conserva HOY)
  }, [type, scopeReady, minLoading, rawPref, globalDateInfo?.minAllowedDate, todayBd]);
}

/**
 * Aplica (una sola vez por montaje) la preferencia resuelta al estado de
 * fecha de un formulario. Patrón no invasivo para los 7 formularios:
 *
 *   const [date, setDate] = useState(todayStr);
 *   useApplyWorkDateDefault('reception', date === todayStr, setDate);
 *
 * El guard `isUntouched` evita pisar una fecha restaurada de un borrador o
 * elegida por el usuario antes de que la preferencia resolviera.
 */
export function useApplyWorkDateDefault(
  type: string,
  isUntouched: boolean,
  apply: (date: string) => void,
  storeIdOverride?: string | null,
) {
  const resolved = useWorkDateDefault(type, storeIdOverride);
  useEffect(() => {
    if (resolved === undefined) return; // resolviendo
    if (resolved === null) return; // sin preferencia válida
    if (!isUntouched) return; // el usuario/borrador ya fijó fecha
    apply(resolved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved]); // solo al resolver la preferencia (una vez)
}
