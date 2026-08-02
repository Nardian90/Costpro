'use client';

/**
 * @file BulkPreviewPanel.tsx
 * @description Iteración 8 — Panel de preview para operaciones bulk.
 *
 * Muestra:
 *   - Resumen de impacto (tiendas afectadas, bloqueadas, protegidas)
 *   - Lista de tiendas bloqueadas con sus blockers detallados
 *   - Lista de tiendas protegidas (requieren override)
 *   - Indicador de si puede proceder
 *
 * No contiene lógica de ejecución — solo visualización.
 */

import React from 'react';
import { AlertTriangle, Shield, CheckCircle2, XCircle, Building } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BulkPreviewResult } from '@/hooks/api/useStores';

interface BulkPreviewPanelProps {
  preview: BulkPreviewResult;
  action: 'activate' | 'deactivate' | 'delete' | 'archive';
}

const actionLabels: Record<string, string> = {
  activate: 'ACTIVACIÓN MASIVA',
  deactivate: 'PAUSA MASIVA',
  delete: 'ELIMINACIÓN MASIVA',
  archive: 'ARCHIVADO MASIVO',
};

const actionColors: Record<string, string> = {
  activate: 'text-success',
  deactivate: 'text-warning',
  delete: 'text-destructive',
  archive: 'text-warning',
};

const blockerTypeLabels: Record<string, string> = {
  OPEN_TRANSFERS_OUT: 'Transferencias salientes pendientes',
  OPEN_TRANSFERS_IN: 'Transferencias entrantes pendientes',
  OPEN_PRODUCTION_ORDERS: 'Órdenes de producción abiertas',
  OPEN_CASH_SESSION: 'Sesiones de caja abiertas',
  PENDING_RECEIPTS: 'Recepciones pendientes',
  ACTIVE_INVENTORY_RESERVATIONS: 'Reservas de inventario activas',
  OPEN_PURCHASE_ORDERS: 'Órdenes de compra en borrador',
};

export function BulkPreviewPanel({ preview, action }: BulkPreviewPanelProps) {
  const { can_proceed, stores, blockers, protected_stores, requires_override } = preview;

  const blockedStores = stores.filter(s => s.has_blockers);
  const cleanStores = stores.filter(s => !s.has_blockers);

  return (
    <div className="space-y-4">
      {/* Header con acción y conteo */}
      <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/30">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Acción
          </div>
          <div className={cn('text-lg font-black', actionColors[action])}>
            {actionLabels[action]}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Tiendas afectadas
          </div>
          <div className="text-2xl font-black text-foreground">
            {stores.length}
          </div>
        </div>
      </div>

      {/* Estado general */}
      <div
        className={cn(
          'flex items-center gap-3 p-4 rounded-xl border-2',
          can_proceed
            ? 'border-success/30 bg-success/5'
            : 'border-destructive/30 bg-destructive/5'
        )}
      >
        {can_proceed ? (
          <CheckCircle2 className="w-6 h-6 text-success shrink-0" />
        ) : (
          <XCircle className="w-6 h-6 text-destructive shrink-0" />
        )}
        <div>
          <div className="font-bold text-foreground">
            {can_proceed ? 'Puede proceder' : 'No puede proceder'}
          </div>
          <div className="text-sm text-muted-foreground">
            {can_proceed
              ? 'Todas las tiendas pasaron las validaciones'
              : `${blockedStores.length} tienda(s) tienen dependencias pendientes que bloquean la operación`}
          </div>
        </div>
      </div>

      {/* Tiendas bloqueadas */}
      {blockedStores.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-destructive">
            <AlertTriangle className="w-4 h-4" />
            Bloqueadas ({blockedStores.length})
          </div>
          {blockers.map((blocker) => (
            <div
              key={blocker.store_id}
              className="p-3 rounded-lg border border-destructive/20 bg-destructive/5"
            >
              <div className="flex items-center gap-2 mb-2">
                <Building className="w-4 h-4 text-destructive" />
                <span className="font-bold text-foreground">{blocker.store_name}</span>
              </div>
              <ul className="space-y-1 ml-6">
                {blocker.blockers.map((b, i) => (
                  <li key={i} className="text-sm text-muted-foreground">
                    • {blockerTypeLabels[b.type] || b.type}: <strong>{b.count}</strong>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Tiendas protegidas */}
      {protected_stores.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-warning">
            <Shield className="w-4 h-4" />
            Protegidas ({protected_stores.length})
          </div>
          <div className="p-3 rounded-lg border border-warning/20 bg-warning/5">
            <div className="text-sm text-foreground mb-2">
              Estas tiendas requieren <strong>doble confirmación</strong> de otro administrador:
            </div>
            <ul className="space-y-1">
              {protected_stores.map((storeId) => {
                const store = stores.find(s => s.id === storeId);
                return (
                  <li key={storeId} className="text-sm text-muted-foreground flex items-center gap-2">
                    <Building className="w-3 h-3" />
                    {store?.name || storeId}
                  </li>
                );
              })}
            </ul>
            {requires_override && (
              <div className="mt-2 p-2 rounded bg-warning/10 text-xs text-warning-foreground">
                ⚠️ Se requerirá override_token de un administrador diferente
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tiendas limpias (sin blockers) */}
      {cleanStores.length > 0 && can_proceed && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-success">
            <CheckCircle2 className="w-4 h-4" />
            Listas para procesar ({cleanStores.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {cleanStores.map((store) => (
              <div
                key={store.id}
                className={cn(
                  'px-3 py-1.5 rounded-lg border text-sm flex items-center gap-2',
                  store.backup_restore_protected
                    ? 'border-warning/30 bg-warning/5 text-warning-foreground'
                    : 'border-success/30 bg-success/5 text-success-foreground'
                )}
              >
                <Building className="w-3 h-3" />
                {store.name}
                {store.backup_restore_protected && (
                  <Shield className="w-3 h-3 text-warning" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
