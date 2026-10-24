'use client';

import React, { useState, useEffect } from 'react';
import { RefreshCcw, Loader2, AlertTriangle, X, HandCoins } from 'lucide-react';
import { cn, touch } from '@/lib/utils';
import { useReverseDocument, type ReversibleDocType, type RecoveryComponent } from '@/hooks/api/useReverseDocument';
import { useFocusTrap } from '@/hooks/ui/useFocusTrap';

/**
 * ReverseDocumentModal — Modal UNIFICADO para revertir cualquier documento contable.
 *
 * V2.2: Pide motivo (mínimo 3 caracteres), muestra advertencia clara del efecto,
 * llama a /api/reverse con type + id + reason.
 *
 * MISIÓN DE CIERRE (§4) — devoluciones con reembolso liquidado: cambiar el
 * estado de una devolución NO devuelve el dinero a la caja. La reversión es
 * ATÓMICA con la RECUPERACIÓN explícita del dinero: el modal consulta las
 * filas refund de la devolución (payment_transactions, RLS de tienda) y fija
 * los componentes a recuperar (moneda e importe — servidor); el operador
 * solo declara el RIEL real de cobro (efectivo/transferencia/zelle) y la
 * fecha. Sin recuperación, la reversión es rechazada por PostgreSQL
 * (ERR_DEVOLUTION_REFUND_NOT_RECOVERED → 422 accionable) y el formulario
 * se muestra para completar la operación.
 *
 * Efectos visibles para el usuario:
 * - "Se devolverá/descontará stock afectado y se crearán entradas de kardex de reversión"
 * - "El documento quedará marcado como Revertida y no podrá modificarse"
 * - (devolución con reembolso) "Se registrará la RECUPERACIÓN del dinero por el riel declarado"
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

interface RefundRow {
  currency: 'CUP' | 'USD';
  amount: number;
  payment_method: string;
}

const METHOD_LABELS: Record<RecoveryComponent['method'], string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  zelle: 'Zelle (USD)',
};

export function ReverseDocumentModal({
  isOpen,
  onClose,
  type,
  docId,
  docLabel,
}: ReverseDocumentModalProps) {
  const [reason, setReason] = useState('');
  const reverseMutation = useReverseDocument();

  // MISIÓN DE CIERRE: componentes refund de la devolución (solo type='devolution')
  const [refundRows, setRefundRows] = useState<RefundRow[] | null>(null);
  const [recoveryMethods, setRecoveryMethods] = useState<Record<string, RecoveryComponent['method']>>({});
  const [recoveryTouched, setRecoveryTouched] = useState(false);

  const isDevolution = type === 'devolution';

  // F3-B4: focus trap + Escape + restauración de foco (overlay manual, sin Radix).
  // No se cierra con Escape mientras la reversión está en curso.
  const trapRef = useFocusTrap(isOpen, () => {
    if (!reverseMutation.isPending) onClose();
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

  // Consultar las filas refund de la devolución (RLS: solo miembros de la tienda
  // las ven — payment_transactions_select_own_store). Importes FIJOS por el servidor.
  useEffect(() => {
    if (!isOpen || !isDevolution) { setRefundRows(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const { supabase } = await import('@/lib/supabaseClient');
        const { data, error } = await supabase
          .from('payment_transactions')
          .select('currency, amount, payment_method')
          .eq('ref_type', 'devolution')
          .eq('ref_id', docId)
          .eq('direction', 'refund');
        if (!cancelled && !error) {
          const rows = (data ?? []).map((r: { currency: string; amount: number; payment_method: string }) => ({
            currency: (r.currency === 'USD' ? 'USD' : 'CUP') as 'CUP' | 'USD',
            amount: Number(r.amount),
            payment_method: r.payment_method,
          }));
          setRefundRows(rows);
          // default: mismo riel del reembolso
          const defaults: Record<string, RecoveryComponent['method']> = {};
          for (const r of rows) {
            defaults[r.currency] = (r.payment_method === 'cash' || r.payment_method === 'transfer' || r.payment_method === 'zelle')
              ? (r.payment_method as RecoveryComponent['method'])
              : 'cash';
          }
          setRecoveryMethods(defaults);
        } else if (!cancelled) {
          setRefundRows([]);
        }
      } catch {
        if (!cancelled) setRefundRows([]);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, isDevolution, docId]);

  // Reset al abrir
  useEffect(() => {
    if (isOpen) {
      setReason('');
      setRecoveryTouched(false);
      reverseMutation.reset();
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const label = DOC_LABELS[type];
  const needsRecovery = isDevolution && (refundRows?.length ?? 0) > 0;
  const recoveryReady = !needsRecovery || (refundRows ?? []).every((r) => recoveryMethods[r.currency]);
  const canSubmit = reason.trim().length >= 3 && !reverseMutation.isPending && recoveryReady;

  async function handleSubmit() {
    if (!canSubmit) return;
    const recovery: RecoveryComponent[] | undefined = needsRecovery
      ? (refundRows ?? []).map((r) => ({
          currency: r.currency,
          method: recoveryMethods[r.currency] ?? 'cash',
        }))
      : undefined;
    try {
      await reverseMutation.mutateAsync({ type, id: docId, reason: reason.trim(), recovery });
      // Si mutateAsync no lanzó error, la reversión fue exitosa → cerrar modal
      onClose();
    } catch {
      // El error se muestra en el modal via reverseMutation.error
      // No cerrar el modal para que el usuario vea el error
    }
  }

  return (
    <div
      ref={trapRef}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reverse-modal-title"
    >
      <div
        className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
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
              {needsRecovery && (
                <p className="text-foreground font-medium">
                  Además se registrará la RECUPERACIÓN del dinero reembolsado (ver abajo).
                </p>
              )}
              <p className="text-xs italic">
                El documento quedará marcado como <strong>Revertida</strong> y no podrá modificarse.
              </p>
            </div>
          </div>

          {/* MISIÓN DE CIERRE (§4): recuperación explícita del dinero reembolsado.
              Moneda e importe FIJADOS por el servidor (filas refund); el operador
              solo declara el riel real de cobro. La reversión sin recuperación
              es rechazada por PostgreSQL (fail-closed). */}
          {isDevolution && refundRows !== null && refundRows.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/30 space-y-3" data-testid="recovery-panel">
              <div className="flex items-center gap-2">
                <HandCoins className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <p className="text-sm font-bold text-foreground">
                  Recuperación del dinero (obligatoria)
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Esta devolución reembolsó dinero al cliente. Revertirla exige recuperar ese dinero
                en la MISMA moneda — el importe lo fija el sistema; usted declara por qué riel volvió.
                Sin recuperación, la reversión se rechaza (no se libera el tope de reembolso con dinero
                que no ha vuelto a la caja).
              </p>
              {refundRows.map((r) => (
                <div key={r.currency} className="flex items-center justify-between gap-3 p-2 rounded-lg border border-border bg-background">
                  <div className="min-w-0">
                    <p className="text-sm font-black font-mono">
                      {r.amount.toLocaleString('es-CU', { minimumFractionDigits: 2 })} {r.currency}
                    </p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">importe reembolsado</p>
                  </div>
                  <div className="shrink-0">
                    <label htmlFor={`recovery-method-${r.currency}`} className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
                      Volvió por
                    </label>
                    <select
                      id={`recovery-method-${r.currency}`}
                      value={recoveryMethods[r.currency] ?? ''}
                      onChange={(e) => {
                        setRecoveryTouched(true);
                        setRecoveryMethods((prev) => ({ ...prev, [r.currency]: e.target.value as RecoveryComponent['method'] }));
                      }}
                      aria-label={`Riel por el que volvió el dinero reembolsado en ${r.currency}`}
                      className={cn('px-2 py-1.5 min-h-[36px] rounded-lg border border-border bg-background text-xs font-bold', touch)}
                    >
                      <option value="">Seleccionar…</option>
                      {Object.entries(METHOD_LABELS)
                        .filter(([m]) => !(m === 'zelle' && r.currency === 'CUP'))
                        .map(([m, l]) => (
                          <option key={m} value={m}>{l}</option>
                        ))}
                    </select>
                  </div>
                </div>
              ))}
              {recoveryTouched && !recoveryReady && (
                <p role="alert" className="text-xs text-destructive">
                  Declare el riel de cada moneda para completar la reversión.
                </p>
              )}
            </div>
          )}
          {isDevolution && refundRows !== null && refundRows.length === 0 && (
            <div className="text-xs text-muted-foreground p-2 rounded-lg bg-muted/30">
              Esta devolución no tiene reembolsos monetarios liquidados: la reversión es documental
              (stock + estado) y no requiere recuperación de dinero.
            </div>
          )}

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
              /* F3-B4: el foco inicial lo gestiona useFocusTrap vía [data-autofocus],
                 DESPUÉS de capturar el foco previo — un autoFocus nativo enfocaría
                 durante el commit y contaminaría la restauración al cerrar. */
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

          {reverseMutation.isError && (
            <div data-testid="reverse-error" className="text-xs p-3 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 whitespace-pre-wrap">
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
