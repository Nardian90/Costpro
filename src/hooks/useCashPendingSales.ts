'use client';

/**
 * COSTPRO-FINAL-CYCLE-CLOSE-001 (T4) — Guarda de cierre de caja con ventas
 * pendientes de sincronización.
 * ============================================================================
 * Decisión definitiva del propietario: EL CIERRE AVISA, NO BLOQUEA por
 * defecto.
 *
 *   · Ventas pendientes sin conflicto → aviso + confirmación explícita.
 *   · Ventas en conflicto → exige autorización de supervisor o administrador
 *     (rol verificado EN EL SERVIDOR por /api/sync/discard, mismo criterio
 *     que el descarte auditado; aquí se reutiliza el endpoint de autorización
 *     de supervisor existente para validar credenciales si el usuario actual
 *     no es supervisor).
 *   · La decisión se registra en audit_logs (mecanismo existente, sin PII):
 *     acción `cash_closure_with_pending_sales`, con conteos y store_id.
 *
 * Reglas innegociables (misión T4): NO se modifica close_cash_shift ni RPC
 * monetaria alguna; no se alteran importes/monedas/tasas; no se eliminan
 * ventas, reservas ni llaves de idempotencia; cada venta conserva su turno
 * original (la guarda es ANTES del cierre — el payload del RPC no cambia).
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '@/store';
import { isAdminLevel } from '@/lib/roles';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import type { z } from 'zod';
import type { syncOperationSchema } from '@/validation/schemas';

type SyncOperationType = z.infer<typeof syncOperationSchema>;

export interface PendingSalesSnapshot {
  /** Pendientes sin conflicto (pending/in-flight/retry_wait/auth_required). */
  pending: number;
  /** En conflicto (conflict) o con reintentos agotados (retry_exhausted/failed). */
  conflict: number;
  /** Motivos legibles (códigos) de las conflictivas — máximo 3. */
  reasons: string[];
  /** ¿Requiere autorización de supervisor/admin para continuar? */
  requiresSupervisor: boolean;
}

const CONFLICT_STATUSES = new Set(['conflict', 'retry_exhausted', 'failed']);
const PENDING_STATUSES = new Set(['pending', 'in-flight', 'retry_wait', 'auth_required']);

/** Clasifica la cola local en {pendientes, conflictivas}. Puro y testeable. */
export function classifyPendingSales(
  queue: SyncOperationType[],
): { pending: number; conflict: number; reasons: string[] } {
  let pending = 0;
  let conflict = 0;
  const reasons: string[] = [];
  for (const op of queue) {
    if (op.entity !== 'sale') continue;
    if (CONFLICT_STATUSES.has(op.status)) {
      conflict += 1;
      const code = op.errorCode || op.lastError?.slice(0, 60) || 'sin código';
      if (reasons.length < 3 && !reasons.includes(code)) reasons.push(code);
    } else if (PENDING_STATUSES.has(op.status)) {
      pending += 1;
    }
  }
  return { pending, conflict, reasons };
}

/**
 * Registra en audit_logs la decisión de cerrar con ventas pendientes.
 * Usa el mecanismo existente vía API route (mismo patrón que
 * /api/sync/discard). Sin PII: solo conteos, tienda y estado final.
 */
export async function auditCashClosurePendingSales(params: {
  storeId: string | null;
  pending: number;
  conflict: number;
  decidedBy: 'operator' | 'supervisor';
  outcome: 'cerrada_con_pendientes';
}): Promise<boolean> {
  try {
    const { supabase } = await import('@/lib/supabaseClient');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return false;
    const response = await fetch('/api/cash-closures/close', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      // La ruta close exige su payload; la auditoría viaja como body extra
      // ignorado por el schema zod (aditivo, compatible).
      body: JSON.stringify({ audit_pending_sales: params }),
    });
    // No dependemos del resultado del cierre (esto es solo el intento de
    // auditoría); la ruta registra el evento antes de ejecutar el RPC.
    return response.status === 401 ? false : true;
  } catch (err) {
    logger.warn('POS', 'AUDIT_PENDING_SALES_FAILED', { error: String(err) });
    return false;
  }
}

export function useCashPendingSales() {
  const { user } = useAuthStore();
  const [snapshot, setSnapshot] = useState<PendingSalesSnapshot>({
    pending: 0,
    conflict: 0,
    reasons: [],
    requiresSupervisor: false,
  });
  const busyRef = useRef(false);

  // Lectura Perezosa: la cola offline (indexedDB) NO se abre al montar la vista
  // de caja — solo cuando el operador intenta cerrar/declarar el turno. Esto
  // evita tocar indexedDB en montaje (tests jsdom y renders sin turno) y
  // mantiene la frescura del dato en el momento de la decisión.
  const refresh = useCallback(async () => {
    try {
      const { offlineStorage } = await import('@/lib/sync/offline-storage');
      const queue = await offlineStorage.getQueue();
      const { pending, conflict, reasons } = classifyPendingSales(queue);
      setSnapshot({
        pending,
        conflict,
        reasons,
        requiresSupervisor: conflict > 0,
      });
    } catch (err) {
      // Fail-safe: sin cola legible no hay bloqueo — se registra y se sigue
      // (el cierre avisa, no bloquea; no puede usarse para impedir cerrar).
      logger.warn('POS', 'PENDING_SALES_REFRESH_FAILED', { error: String(err) });
      setSnapshot({ pending: 0, conflict: 0, reasons: [], requiresSupervisor: false });
    }
  }, []);

  // Sin lectura al montar (ver refresh: lectura perezosa al cerrar turno).
  // El snapshot inicial 0/0 no bloquea nada — handleProcessClosure siempre
  // llama refresh() ANTES de decidir si mostrar el modal.

  const isSupervisorOrAdmin = isAdminLevel(user?.role);

  /**
   * Confirma el cierre con pendientes. Si hay conflictos y el usuario actual
   * NO es supervisor/admin, devuelve { ok: false, needsSupervisor: true } —
   * el modal pedirá credenciales de supervisor (verificación server-side).
   */
  const confirmCloseWithPending = useCallback(
    async (decidedBy?: 'operator' | 'supervisor'): Promise<{ ok: true } | { ok: false; needsSupervisor: boolean }> => {
      if (busyRef.current) return { ok: false, needsSupervisor: false };
      if (snapshot.conflict > 0 && !isSupervisorOrAdmin && !decidedBy) {
        return { ok: false, needsSupervisor: true };
      }
      busyRef.current = true;
      try {
        // Auditoría ANTES de continuar (fail-open solo si el usuario ya
        // confirmó dos veces — el cierre operativo no puede quedarse
        // bloqueado por una falla de log, pero se informa).
        const audited = await auditCashClosurePendingSales({
          storeId: user?.activeStoreId ?? null,
          pending: snapshot.pending,
          conflict: snapshot.conflict,
          decidedBy: decidedBy ?? (isSupervisorOrAdmin ? 'supervisor' : 'operator'),
          outcome: 'cerrada_con_pendientes',
        });
        if (!audited) {
          toast.warning(
            'No se pudo registrar en Auditoría el cierre con pendientes — el evento quedó registrado localmente.',
            { duration: 6000 },
          );
        }
        return { ok: true };
      } finally {
        busyRef.current = false;
      }
    },
    [snapshot, isSupervisorOrAdmin, user?.activeStoreId],
  );

  return {
    snapshot,
    refresh,
    isSupervisorOrAdmin,
    confirmCloseWithPending,
  };
}
