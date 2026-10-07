'use client';

/**
 * ValeSalidaReverseModal — Devolución de un Vale de Salida completado.
 *
 * NO es una segunda implementación de reversión: invoca EXACTAMENTE el
 * endpoint existente POST /api/vale-salida/[id]/reverse, que despacha a la
 * RPC reverse_vale_salida (movimientos compensatorios issue_slip_reverse /
 * production_reverse + restauración de actual_qty en OT + audit_logs).
 *
 * Patrón visual: espejo de ReverseDocumentModal (focus trap F3-B4, Escape,
 * scroll lock, motivo obligatorio) para que la devolución de un Vale se sienta
 * idéntica a la reversión de cualquier otro documento de CostPro.
 */

import React, { useState, useEffect } from 'react';
import { RefreshCcw, Loader2, AlertTriangle, X } from 'lucide-react';
import { cn, touch } from '@/lib/utils';
import { apiFetch } from '@/lib/api-fetch';
import { useFocusTrap } from '@/hooks/ui/useFocusTrap';

interface ValeSalidaReverseModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** UUID del issue_slip a devolver */
  slipId: string;
  /** Texto identificador (ej: "Vale VS-000001-2026") */
  docLabel?: string;
  /** Callback tras devolver con éxito (invalida queries, cierra modal) */
  onReversed?: () => void;
}

interface ReverseResult {
  status: string;
  slip_id: string;
  slip_number: string;
  new_status: string;
}

export function ValeSalidaReverseModal({
  isOpen,
  onClose,
  slipId,
  docLabel,
  onReversed,
}: ValeSalidaReverseModalProps) {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // F3-B4: focus trap + Escape + restauración de foco (overlay manual, sin Radix).
  // No se cierra con Escape mientras la devolución está en curso.
  const trapRef = useFocusTrap(isOpen, () => {
    if (!isSubmitting) onClose();
  });

  // F3-B4: scroll lock del body mientras el overlay está abierto
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  // Reset al abrir
  useEffect(() => {
    if (isOpen) {
      setReason('');
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const canSubmit = reason.trim().length >= 3 && !isSubmitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(null);
    try {
      // Mismo contrato del endpoint existente: { reason } — user_id viene del JWT.
      await apiFetch<ReverseResult>(`/api/vale-salida/${slipId}/reverse`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      });
      onReversed?.();
      onClose();
    } catch (e) {
      // El error se muestra en el modal (no cerrar para que el usuario lo vea)
      setError(e instanceof Error ? e.message : 'Error al devolver el vale');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      ref={trapRef}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
      onClick={() => { if (!isSubmitting) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="vale-reverse-modal-title"
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
            <h2 id="vale-reverse-modal-title" className="text-lg font-black uppercase tracking-tight">
              Devolver Vale de Salida
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
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
              <p className="font-bold text-foreground">Efecto de la devolución</p>
              <p>
                Se devolverá al inventario el stock descontado por este vale (entrada
                compensatoria en el kardex) y se restaurará el consumo de las líneas de
                Orden de Producción asociadas, si aplica.
              </p>
              <p className="text-xs italic">
                El vale quedará marcado como <strong>Devuelto</strong> y no podrá modificarse.
              </p>
            </div>
          </div>

          <div>
            <label
              htmlFor="vale-reverse-reason"
              className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
            >
              Motivo de la devolución <span className="text-destructive">*</span>
            </label>
            <textarea
              id="vale-reverse-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: El vale se emitió por error, los productos regresaron al almacén..."
              rows={3}
              data-autofocus
              className={cn(
                'w-full mt-1 px-3 py-2 rounded-xl border border-border bg-background text-sm resize-none',
                'focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500/50',
                touch,
              )}
              maxLength={500}
            />
            <p className="text-[10px] text-muted-foreground mt-1 text-right">
              {reason.length}/500 caracteres (mínimo 3)
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="text-xs p-3 rounded-lg bg-destructive/10 text-destructive border border-destructive/20"
            >
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-2 p-5 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className={cn(
              'flex-1 px-4 py-2.5 min-h-[44px] rounded-xl border border-border',
              'font-black text-xs uppercase tracking-widest',
              'hover:bg-muted transition-colors active:scale-95 disabled:opacity-50',
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
              'flex-1 px-4 py-2.5 min-h-[44px] rounded-xl bg-purple-600 text-white',
              'font-black text-xs uppercase tracking-widest',
              'hover:bg-purple-700 transition-colors active:scale-95 disabled:opacity-50',
              'flex items-center justify-center gap-2',
              touch,
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Devolviendo...
              </>
            ) : (
              'Devolver Vale'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
