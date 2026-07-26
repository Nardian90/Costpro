'use client';

import React, { useState, useEffect } from 'react';
import { RefreshCcw, Loader2, AlertTriangle, X } from 'lucide-react';
import { cn, touch } from '@/lib/utils';
import { useReverseDocument, type ReversibleDocType } from '@/hooks/api/useReverseDocument';

/**
 * ReverseDocumentModal — Modal UNIFICADO para revertir cualquier documento contable.
 *
 * V2.2: Pide motivo (mínimo 3 caracteres), muestra advertencia clara del efecto,
 * llama a /api/reverse con type + id + reason.
 *
 * Efectos visibles para el usuario:
 * - "Se devolverá/descontará stock afectado y se crearán entradas de kardex de reversión"
 * - "El documento quedará marcado como Revertida y no podrá modificarse"
 */

const DOC_LABELS: Record<ReversibleDocType, { singular: string; description: string }> = {
  transaction: {
    singular: 'esta venta',
    description: 'Se devolverá el stock vendido a productos y lotes, y se creará una entrada de kardex de devolución.',
  },
  receipt: {
    singular: 'esta recepción',
    description: 'Se descontará el stock recibido y se registrará la salida en el kardex.',
  },
  transfer: {
    singular: 'esta transferencia',
    description: 'Se devolverá el stock al almacén de origen y se descontará del almacén de destino.',
  },
  adjustment: {
    singular: 'este ajuste',
    description: 'Se invertirá el cambio de stock aplicado (si sumó, ahora restará; y viceversa).',
  },
  devolution: {
    singular: 'esta devolución',
    description: 'Se descontará el stock que se había restaurado al recibir la devolución.',
  },
  production_order: {
    singular: 'esta orden de producción',
    description: 'Se reabastecerán los insumos consumidos y se descontará el producto terminado (si ya se había añadido al stock).',
  },
};

interface ReverseDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: ReversibleDocType;
  docId: string;
  /** Texto identificador del documento (ej: "Venta #1234", "REC-001") */
  docLabel?: string;
}

export function ReverseDocumentModal({
  isOpen,
  onClose,
  type,
  docId,
  docLabel,
}: ReverseDocumentModalProps) {
  const [reason, setReason] = useState('');
  const reverseMutation = useReverseDocument();

  // Reset al abrir
  useEffect(() => {
    if (isOpen) {
      setReason('');
      reverseMutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const label = DOC_LABELS[type];
  const canSubmit = reason.trim().length >= 3 && !reverseMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit) return;
    await reverseMutation.mutateAsync({ type, id: docId, reason: reason.trim() });
    if (reverseMutation.isSuccess) {
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reverse-modal-title"
    >
      <div
        className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <RefreshCcw className="w-5 h-5 text-purple-500 dark:text-purple-400" />
            </div>
            <h2 id="reverse-modal-title" className="text-lg font-black uppercase tracking-tight">
              Revertir {label.singular}
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
          {docLabel && (
            <div className="text-sm font-mono text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
              {docLabel}
            </div>
          )}

          <div className="flex gap-3 p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
            <AlertTriangle className="w-5 h-5 text-purple-500 dark:text-purple-400 shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground space-y-1">
              <p className="font-bold text-foreground">Efecto de la reversión</p>
              <p>{label.description}</p>
              <p className="text-xs italic">
                El documento quedará marcado como <strong>Revertida</strong> y no podrá modificarse.
              </p>
            </div>
          </div>

          <div>
            <label
              htmlFor="reverse-reason"
              className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
            >
              Motivo de la reversión <span className="text-destructive">*</span>
            </label>
            <textarea
              id="reverse-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: Error en el registro de la venta, cliente devolvió mercancía..."
              rows={3}
              className={cn(
                'w-full mt-1 px-3 py-2 rounded-xl border border-border bg-background text-sm resize-none',
                'focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500/50',
                touch,
              )}
              maxLength={500}
              autoFocus
            />
            <p className="text-[10px] text-muted-foreground mt-1 text-right">
              {reason.length}/500 caracteres (mínimo 3)
            </p>
          </div>

          {reverseMutation.isError && (
            <div className="text-xs p-3 rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
              {reverseMutation.error instanceof Error
                ? reverseMutation.error.message
                : 'Error al revertir el documento'}
            </div>
          )}
        </div>

        <div className="flex gap-2 p-5 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            disabled={reverseMutation.isPending}
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
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={cn(
              'flex-1 px-4 py-2.5 min-h-[44px] rounded-xl',
              'font-black text-xs uppercase tracking-widest',
              'bg-purple-500 text-white dark:text-black',
              'hover:bg-purple-600 transition-colors active:scale-95',
              'disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100',
              touch,
            )}
          >
            {reverseMutation.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Revirtiendo...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <RefreshCcw className="w-4 h-4" />
                Revertir
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
