'use client';

/**
 * CP-POS-002 (D4/D5) — Ventas por resolver + antigüedad del snapshot.
 * ============================================================================
 * D4: expone las ventas en conflicto o con reintentos agotados (conservan
 * llave y payload íntegros) con las tres acciones de resolución:
 *   1. Reintentar (misma llave, mismo payload — syncEngine.retryOperation).
 *   2. Resolver con ajuste (enlaza al flujo de ajuste de inventario
 *      existente: la op sigue pendiente; al volver, se reintenta).
 *   3. Descartar (SOLO supervisor/admin — servidor verifica rol, registra
 *      auditoría en audit_logs ANTES de confirmar; si la auditoría falla,
 *      la venta se conserva).
 *
 * D5: antigüedad del snapshot de productos de la tienda activa a partir del
 * timestamp REAL que guardó saveSnapshot (inválido/inexistente → null, que
 * la UI trata como "sin datos"; NUNCA como fresco). Aviso a partir de 24 h
 * SIN bloquear la venta.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { offlineStorage, saleOutbox } from '@/lib/sync/offline-storage';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import type { z } from 'zod';
import type { syncOperationSchema } from '@/validation/schemas';

type SyncOperationType = z.infer<typeof syncOperationSchema>;

export const OFFLINE_SNAPSHOT_WARN_HOURS = 24;

export interface SnapshotAge {
  /** 'ok' fresco · 'warn' > 24 h · 'unknown' sin timestamp válido. */
  state: 'ok' | 'warn' | 'unknown';
  /** Horas desde el snapshot (solo cuando hay timestamp válido). */
  hours: number | null;
}

/** Calcula la antigüedad de un timestamp de snapshot (D5, puro, testeable). */
export function computeSnapshotAge(
  timestamp: number | null,
  now: number,
  warnHours = OFFLINE_SNAPSHOT_WARN_HOURS,
): SnapshotAge {
  if (timestamp === null || !Number.isFinite(timestamp) || timestamp > now) {
    return { state: 'unknown', hours: null };
  }
  const hours = (now - timestamp) / 3_600_000;
  if (hours >= warnHours) return { state: 'warn', hours: Math.floor(hours) };
  return { state: 'ok', hours: Math.floor(hours) };
}

export function useUnresolvedSales(pollMs = 15_000) {
  const { user } = useAuthStore();
  const [unresolved, setUnresolved] = useState<SyncOperationType[]>([]);
  const [snapshotAge, setSnapshotAge] = useState<SnapshotAge>({ state: 'unknown', hours: null });
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const busyRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const ops = await offlineStorage.getUnresolvedSales();
      setUnresolved(ops);
      if (user?.activeStoreId) {
        const ts = await offlineStorage.getSnapshotTimestamp(
          `products_${user.activeStoreId}`,
        );
        setSnapshotAge(computeSnapshotAge(ts, Date.now()));
      }
    } catch (err) {
      logger.warn('SYNC', 'UNRESOLVED_SALES_REFRESH_FAILED', { error: String(err) });
    }
  }, [user?.activeStoreId]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  /** Acción 1 — Reintentar: misma llave, mismo payload, attempts a 0. */
  const retryOperation = useCallback(
    async (operationKey: string) => {
      if (busyRef.current) return;
      busyRef.current = operationKey;
      setBusyKey(operationKey);
      try {
        await offlineStorage.updateOperation(operationKey, {
          status: 'pending',
          attempts: 0,
          lastError: null,
          nextRetryAt: undefined,
        });
        // Reintentar no modifica la intención del outbox (sigue abierta
        // hasta respuesta definitiva).
        toast.info('Venta reencolada con la misma llave de idempotencia — se enviará en el próximo ciclo.');
        await refresh();
      } finally {
        busyRef.current = null;
        setBusyKey(null);
      }
    },
    [refresh],
  );

  /**
   * Acción 3 — Descartar: SOLO supervisor/admin. El rol lo verifica el
   * SERVIDOR con la sesión real; la auditoría (audit_logs) se registra
   * ANTES de confirmar. Si algo falla, la venta se conserva.
   */
  const discardOperation = useCallback(
    async (operation: SyncOperationType, reason: string): Promise<boolean> => {
      if (busyRef.current) return false;
      if (!reason || reason.trim().length < 10) {
        toast.error('El motivo del descarte es obligatorio (mínimo 10 caracteres).');
        return false;
      }
      busyRef.current = operation.idempotencyKey;
      setBusyKey(operation.idempotencyKey);
      try {
        const { supabase } = await import('@/lib/supabaseClient');
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          toast.error('La sesión expiró. Inicia sesión de nuevo para descartar.');
          return false;
        }
        const storeId =
          (operation.payload as { p_store_id?: string } | null)?.p_store_id ?? null;
        const response = await fetch('/api/sync/discard', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            operationKey: operation.idempotencyKey,
            storeId,
            entity: operation.entity === 'sale' ? 'sale' : 'reception',
            errorCode: operation.errorCode ?? undefined,
            reason: reason.trim(),
          }),
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          // 403 = rol insuficiente (verificado server-side); 500 = falló la
          // auditoría → conservar. Nunca se descarta localmente sin 200.
          toast.error(
            (err as { message?: string }).message ||
              'El servidor rechazó el descarte. La venta se conserva en "Ventas por resolver".',
            { duration: 7000 },
          );
          return false;
        }
        // Auditoría confirmada por el servidor → descarte local + cierre
        // de la intención del outbox.
        await offlineStorage.updateOperationStatus(operation.idempotencyKey, 'discarded');
        const saleKey = (operation.payload as { p_idempotency_key?: string } | null)
          ?.p_idempotency_key;
        if (saleKey) await saleOutbox.resolve(saleKey);
        toast.info('Venta descartada. El motivo quedó registrado en Auditoría.');
        await refresh();
        return true;
      } catch (err) {
        logger.error('SYNC', 'SYNC_DISCARD_CLIENT_FAILED', { error: String(err) });
        toast.error('No se pudo confirmar el descarte. La venta se conserva.');
        return false;
      } finally {
        busyRef.current = null;
        setBusyKey(null);
      }
    },
    [refresh],
  );

  return {
    unresolved,
    unresolvedCount: unresolved.length,
    snapshotAge,
    busyKey,
    retryOperation,
    discardOperation,
    refresh,
  };
}
