'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { BaseModal } from "@/components/ui/BaseModal";
import { AlertTriangle, RefreshCw, Server, Laptop, RotateCcw, Trash2, Wrench } from 'lucide-react';
import { PrimaryButton } from '@/components/ui/atomic';
import { offlineStorage } from '@/lib/sync/offline-storage';
import { useSyncContext } from '@/components/providers/SyncProvider';
// CP-POS-002 (D4/D5): ventas por resolver + aviso de snapshot desactualizado.
import { useUnresolvedSales } from '@/hooks/useUnresolvedSales';
import { toast } from 'sonner';

/**
 * CP-POS-002 (D4) — Vista de resolución de sincronización.
 * ============================================================================
 * Dos secciones:
 *
 * 1. "Ventas por resolver" (D4): operaciones en conflicto (negocio/
 *    integridad) o con reintentos agotados. Conservan llave y payload
 *    íntegros. Acciones:
 *      · Reintentar — misma llave, mismo payload (acción 1).
 *      · Resolver con ajuste — enlaza al flujo EXISTENTE de ajuste de
 *        inventario (acción 2): la venta sigue pendiente; al volver, se
 *        reintenta con la misma llave.
 *      · Descartar — solo supervisor/admin, motivo obligatorio; el
 *        servidor verifica el rol y registra la auditoría ANTES de
 *        confirmar (acción 3).
 *
 * 2. Conflictos legados (formato anterior): SOLO reintento. El botón
 *    "Mantener Servidor" que marcaba 'synced' SIN confirmación del
 *    servidor fue ELIMINADO — ninguna venta desaparece silenciosamente
 *    (principio rector de la misión).
 */
export function SyncConflictModal() {
  const { status, processQueue } = useSyncContext();
  const [isOpen, setIsOpen] = useState(false);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [discardTarget, setDiscardTarget] = useState<any | null>(null);
  const [discardReason, setDiscardReason] = useState('');
  const { unresolved, unresolvedCount, snapshotAge, busyKey, retryOperation, discardOperation } = useUnresolvedSales();

  const loadConflicts = useCallback(async () => {
    const queue = await offlineStorage.getQueue();
    // Legado: conflicto detectado por el motor viejo (status failed +
    // prefijo 'Conflict'). Las nuevas ya viven en 'conflict'.
    const conflictOps = queue.filter(
      (op) =>
        op.status === 'conflict' ||
        (op.status === 'failed' && op.lastError?.includes('Conflict')),
    );
    requestAnimationFrame(() => {
      setConflicts(conflictOps.filter((op) => op.status !== 'conflict'));
      if (conflictOps.length > 0) setIsOpen(true);
    });
  }, []);

  useEffect(() => {
    if (status === 'conflict') {
      loadConflicts();
    }
  }, [status, loadConflicts]);

  // CP-POS-002 (D4/D7): la insignia del POS ("N por resolver") abre esta
  // vista — el operador llega a la resolución en un clic.
  useEffect(() => {
    const open = () => {
      void loadConflicts();
      setIsOpen(true);
    };
    window.addEventListener('cp-pos-002:open-conflicts', open);
    return () => window.removeEventListener('cp-pos-002:open-conflicts', open);
  }, [loadConflicts]);

  // D4: abrir también cuando hay ventas por resolver (contador visible).
  useEffect(() => {
    if (unresolvedCount > 0) {
      // El operador ve la insignia en el POS; el modal se abre al pulsarla
      // (ver SyncStatusBadge). Aquí solo garantizamos datos frescos.
      setIsOpen((prev) => prev);
    }
  }, [unresolvedCount]);

  const resolveLegacyRetry = async (idempotencyKey: string) => {
    await offlineStorage.updateOperation(idempotencyKey, {
      status: 'pending',
      attempts: 0,
      lastError: null,
      nextRetryAt: undefined,
    });
    const remaining = conflicts.filter((c) => c.idempotencyKey !== idempotencyKey);
    setConflicts(remaining);
    if (remaining.length === 0) {
      setIsOpen(false);
      processQueue();
    }
  };

  const openDiscard = (op: any) => {
    setDiscardTarget(op);
    setDiscardReason('');
  };

  const confirmDiscard = async () => {
    if (!discardTarget) return;
    const ok = await discardOperation(discardTarget, discardReason);
    if (ok) setDiscardTarget(null);
  };

  // Acción 2 — Resolver con ajuste: el flujo de ajuste de inventario vive en
  // Inventario → Ajustes. La operación NO se toca: sigue pendiente con su
  // llave; al volver, "Reintentar" la envía igual (misma llave/payload).
  const goAdjustInventory = () => {
    setIsOpen(false);
    toast.info(
      'Ve a Inventario → Ajustes para corregir el stock. La venta sigue pendiente aquí con su llave — reinténtala al volver.',
      { duration: 8000 },
    );
    // Navegación: el POS ya expone el cambio de vista por su header; no se
    // fuerza un router.push para no duplicar lógica de navegación existente.
  };

  return (
    <BaseModal
      open={isOpen}
      onOpenChange={setIsOpen}
      title={
        <div className="flex items-center gap-2 text-danger">
          <AlertTriangle className="w-6 h-6" />
          Sincronización — Ventas por resolver
        </div>
      }
      maxWidth="sm:max-w-2xl"
      footer={
        <div className="flex flex-row justify-between w-full gap-4">
          <button
            onClick={() => setIsOpen(false)}
            className="neu-btn px-6 py-2 text-xs font-black uppercase"
          >
            Cerrar
          </button>
          <PrimaryButton
            label="Procesar Restantes"
            icon={RefreshCw}
            onClick={() => {
              setIsOpen(false);
              processQueue();
            }}
            className="flex-1"
          />
        </div>
      }
    >
      <div className="space-y-6">
        {snapshotAge.state === 'warn' && (
          <div
            role="status"
            className="rounded-xl border-2 border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs font-bold text-amber-600"
          >
            {`Inventario local desactualizado (hace ${snapshotAge.hours ?? '?'} h). Las ventas siguen permitidas; verifica el stock al reconectar.`}
          </div>
        )}

        {unresolvedCount === 0 && conflicts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay operaciones pendientes de resolución.
          </p>
        ) : null}

        {unresolvedCount > 0 && (
          <section aria-label="Ventas por resolver" className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-widest text-danger">
              {`Ventas por resolver (${unresolvedCount})`}
            </h4>
            <div className="max-h-[38vh] overflow-y-auto space-y-4 pr-2">
              {unresolved.map((op) => (
                <div key={op.idempotencyKey} className="neu-card !p-4 border-danger/20">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="text-xs font-black uppercase tracking-widest text-danger bg-danger/10 px-2 py-0.5 rounded">
                        {op.status === 'retry_exhausted' ? 'Reintentos agotados' : 'Conflicto'}
                      </span>
                      {op.errorCode ? (
                        <span className="ml-2 text-[10px] font-mono text-muted-foreground">
                          {op.errorCode}
                        </span>
                      ) : null}
                      <h5 className="font-bold mt-1 text-sm">
                        {`Venta ${String(op.idempotencyKey).slice(0, 8)}`}
                      </h5>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">
                      {new Date(op.createdAt).toLocaleString()}
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground mb-2">
                    {op.lastError || 'Error de sincronización.'}
                  </p>

                  <details className="mb-3">
                    <summary className="text-[11px] font-black uppercase text-muted-foreground cursor-pointer">
                      Ver detalle (llave y contenido íntegros)
                    </summary>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-[10px] font-black uppercase text-muted-foreground">
                          <Laptop className="w-3 h-3" /> Tu venta (local)
                        </div>
                        <pre className="text-[10px] bg-black/20 p-2 rounded overflow-x-auto max-h-28">
                          {JSON.stringify(op.payload, null, 1)}
                        </pre>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-[10px] font-black uppercase text-muted-foreground">
                          <Server className="w-3 h-3" /> Respuesta servidor
                        </div>
                        <pre className="text-[10px] bg-black/10 p-2 rounded overflow-x-auto max-h-28">
                          {JSON.stringify(op.serverData ?? { message: 'Sin datos del servidor' }, null, 1)}
                        </pre>
                      </div>
                    </div>
                  </details>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => retryOperation(op.idempotencyKey)}
                      disabled={busyKey === op.idempotencyKey}
                      className="flex-1 min-w-32 neu-btn-primary text-xs font-black uppercase py-2 disabled:opacity-50"
                    >
                      <RotateCcw className="inline w-3 h-3 mr-1" />
                      Reintentar
                    </button>
                    <button
                      onClick={goAdjustInventory}
                      className="flex-1 min-w-32 neu-btn text-xs font-black uppercase py-2"
                    >
                      <Wrench className="inline w-3 h-3 mr-1" />
                      Resolver con ajuste
                    </button>
                    <button
                      onClick={() => openDiscard(op)}
                      className="flex-none neu-btn text-xs font-black uppercase py-2 text-danger border-danger/30"
                    >
                      <Trash2 className="inline w-3 h-3 mr-1" />
                      Descartar
                    </button>
                  </div>

                  {discardTarget?.idempotencyKey === op.idempotencyKey && (
                    <div className="mt-3 rounded-xl border-2 border-danger/30 bg-danger/5 p-3 space-y-2">
                      <p className="text-[11px] font-bold text-danger">
                        Descartar una venta requiere supervisor o administrador y queda
                        registrado en Auditoría con tu motivo. La venta NO se registrará.
                      </p>
                      <textarea
                        value={discardReason}
                        onChange={(e) => setDiscardReason(e.target.value)}
                        placeholder="Motivo del descarte (obligatorio, mínimo 10 caracteres)"
                        maxLength={500}
                        rows={2}
                        className="w-full text-xs p-2 rounded bg-background border border-danger/30"
                        aria-label="Motivo del descarte"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={confirmDiscard}
                          disabled={busyKey === op.idempotencyKey || discardReason.trim().length < 10}
                          className="flex-1 neu-btn-primary text-xs font-black uppercase py-2 bg-danger text-white disabled:opacity-50"
                        >
                          Confirmar descarte auditado
                        </button>
                        <button
                          onClick={() => setDiscardTarget(null)}
                          className="flex-1 neu-btn text-xs font-black uppercase py-2"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {conflicts.length > 0 && (
          <section aria-label="Conflictos con datos del servidor" className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-widest text-primary">
              {`Otras operaciones (${conflicts.length})`}
            </h4>
            <p className="text-sm text-muted-foreground">
              Reintenta la operación con el mismo contenido. Ninguna operación se
              marca como sincronizada sin confirmación del servidor.
            </p>
            <div className="max-h-[30vh] overflow-y-auto space-y-4 pr-2">
              {conflicts.map((conflict) => (
                <div key={conflict.idempotencyKey} className="neu-card !p-4 border-primary/20">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <span className="text-xs font-black uppercase tracking-widest text-primary bg-primary/10 px-2 py-0.5 rounded">
                        {conflict.entity}
                      </span>
                      <h4 className="font-bold mt-1 text-sm">{`Op: ${String(conflict.idempotencyKey).substring(0, 8)}`}</h4>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">
                      {new Date(conflict.createdAt).toLocaleString()}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-black uppercase text-muted-foreground">
                        <Laptop className="w-3 h-3" /> Tu Cambio (Local)
                      </div>
                      <pre className="text-xs bg-black/20 p-2 rounded overflow-x-auto max-h-32">
                        {JSON.stringify(conflict.payload, null, 2)}
                      </pre>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-black uppercase text-muted-foreground">
                        <Server className="w-3 h-3" /> Versión Servidor
                      </div>
                      <pre className="text-xs bg-black/10 p-2 rounded overflow-x-auto max-h-32">
                        {JSON.stringify(conflict.serverData || { message: 'Sin datos del servidor' }, null, 2)}
                      </pre>
                    </div>
                  </div>

                  <button
                    onClick={() => resolveLegacyRetry(conflict.idempotencyKey)}
                    className="w-full neu-btn-primary text-xs font-black uppercase py-2"
                  >
                    <RotateCcw className="inline w-3 h-3 mr-1" />
                    Reintentar (misma llave)
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </BaseModal>
  );
}
