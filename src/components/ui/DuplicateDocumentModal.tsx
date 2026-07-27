'use client';

import React, { useState, useEffect } from 'react';
import { Copy, Loader2, AlertTriangle, X } from 'lucide-react';
import { cn, touch } from '@/lib/utils';
import { useDuplicateDocumentV2, type DuplicableDocType } from '@/hooks/api/useDuplicateDocumentV2';

/**
 * DuplicateDocumentModal — Modal UNIFICADO de confirmación para duplicar documentos.
 *
 * V2.4.3: Resuelve el gap C4 de la auditoría. Antes, devolution y adjustment se
 * duplicaban con efecto inmediato en stock sin pedir confirmación. Ahora, todos
 * los tipos piden confirmación con descripción del efecto.
 *
 * Comportamiento por tipo:
 * - sale/reception: carga items en carrito (no afecta stock, efecto diferido)
 * - transfer: crea nueva PENDIENTE (no afecta stock hasta confirmación posterior)
 * - production_order: crea nueva draft (no afecta stock)
 * - devolution: crea nueva completed (AFECTA STOCK INMEDIATAMENTE — advierte al usuario)
 * - adjustment: crea nueva confirmed (AFECTA STOCK INMEDIATAMENTE — advierte al usuario)
 */

interface DuplicateDocInfo {
  /** Texto identificador del documento (ej: "DEV-2026-1234") */
  docLabel?: string;
  /** Número de items que se copiarán */
  itemCount?: number;
}

const DOC_INFO: Record<DuplicableDocType, {
  singular: string;
  effect: 'deferred' | 'pending' | 'immediate';
  description: string;
}> = {
  sale: {
    singular: 'esta venta',
    effect: 'deferred',
    description: 'Los productos se cargarán en el carrito para que revise y confirme la nueva venta.',
  },
  reception: {
    singular: 'esta recepción',
    effect: 'deferred',
    description: 'Los productos se cargarán en el formulario de recepción para que revise y confirme.',
  },
  transfer: {
    singular: 'esta transferencia',
    effect: 'pending',
    description: 'Se creará una nueva transferencia PENDIENTE con los mismos items. No afectará el stock hasta que la confirmes.',
  },
  production_order: {
    singular: 'esta orden de producción',
    effect: 'pending',
    description: 'Se creará una nueva orden en estado BORRADOR con los mismos items. No afectará el stock.',
  },
  devolution: {
    singular: 'esta devolución',
    effect: 'immediate',
    description: 'Se creará una nueva devolución COMPLETADA con los mismos items. Esto afectará el stock inmediatamente (productos volverán al inventario).',
  },
  adjustment: {
    singular: 'este ajuste',
    effect: 'immediate',
    description: 'Se creará un nuevo ajuste CONFIRMADO con los mismos items. Esto afectará el stock inmediatamente (se aplicará la misma diferencia).',
  },
};

interface DuplicateDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: DuplicableDocType;
  docId: string;
  docInfo?: DuplicateDocInfo;
}

export function DuplicateDocumentModal({
  isOpen,
  onClose,
  type,
  docId,
  docInfo,
}: DuplicateDocumentModalProps) {
  const duplicateMutation = useDuplicateDocumentV2();

  useEffect(() => {
    if (isOpen) {
      duplicateMutation.reset();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const info = DOC_INFO[type];
  const isImmediate = info.effect === 'immediate';

  async function handleConfirm() {
    try {
      await duplicateMutation.mutateAsync({ type, id: docId });
      // Si mutateAsync no lanzó error, la duplicación fue exitosa → cerrar modal
      onClose();
    } catch {
      // El error se muestra en el modal via duplicateMutation.error
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="duplicate-modal-title"
    >
      <div
        className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center',
              isImmediate ? 'bg-blue-500/10' : 'bg-success/10',
            )}>
              <Copy className={cn(
                'w-5 h-5',
                isImmediate ? 'text-blue-500' : 'text-success',
              )} />
            </div>
            <h2 id="duplicate-modal-title" className="text-lg font-black uppercase tracking-tight">
              Duplicar {info.singular}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {docInfo?.docLabel && (
            <div className="text-sm font-mono text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
              {docInfo.docLabel}
              {typeof docInfo.itemCount === 'number' && (
                <span className="ml-2 text-xs">• {docInfo.itemCount} item(s)</span>
              )}
            </div>
          )}

          <div className={cn(
            'flex gap-3 p-3 rounded-lg border',
            isImmediate
              ? 'bg-blue-500/5 border-blue-500/20'
              : 'bg-success/5 border-success/20',
          )}>
            <AlertTriangle className={cn(
              'w-5 h-5 shrink-0 mt-0.5',
              isImmediate ? 'text-blue-500' : 'text-success',
            )} />
            <div className="text-sm text-muted-foreground space-y-1">
              <p className={cn('font-bold', isImmediate ? 'text-blue-600 dark:text-blue-400' : 'text-success')}>
                {isImmediate ? 'Efecto inmediato en stock' : 'Sin efecto inmediato en stock'}
              </p>
              <p>{info.description}</p>
            </div>
          </div>

          {duplicateMutation.isError && (
            <div className="text-xs p-3 rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
              {duplicateMutation.error instanceof Error
                ? duplicateMutation.error.message
                : 'Error al duplicar el documento'}
            </div>
          )}

          {duplicateMutation.isSuccess && duplicateMutation.data?.newId && (
            <div className="text-xs p-3 rounded-lg bg-success/10 text-success border border-success/20">
              ✓ Documento creado: <strong>{duplicateMutation.data.newDocNumber || duplicateMutation.data.newId.slice(0, 8)}</strong>
            </div>
          )}
        </div>

        <div className="flex gap-2 p-5 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            disabled={duplicateMutation.isPending}
            className={cn(
              'flex-1 px-4 py-2.5 min-h-[44px] rounded-xl border border-border',
              'font-black text-xs uppercase tracking-widest',
              'hover:bg-muted transition-colors active:scale-95',
              touch,
            )}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={duplicateMutation.isPending}
            className={cn(
              'flex-1 px-4 py-2.5 min-h-[44px] rounded-xl',
              'font-black text-xs uppercase tracking-widest',
              isImmediate
                ? 'bg-blue-500 text-white dark:text-black hover:bg-blue-600'
                : 'bg-success text-white dark:text-black hover:bg-success/90',
              'transition-colors active:scale-95',
              'disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100',
              touch,
            )}
          >
            {duplicateMutation.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Duplicando...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Copy className="w-4 h-4" />
                Duplicar
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
