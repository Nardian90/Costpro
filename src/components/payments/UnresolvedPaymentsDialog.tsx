'use client';

/**
 * CP-AP-ACCOUNTING-INTEGRITY-AND-SUPPLIER-RECONCILIATION-001 — FASE 4.
 *
 * Diálogo informativo del guard de pagos vivos. Se muestra cuando el usuario
 * intenta anular/revertir/devolver un documento (recepción o servicio) que
 * todavía tiene pagos confirmados o aplicados sin resolver.
 *
 * Misión §6 («incorporar la validación en el recorrido normal»): el mensaje
 * debe explicar — sin error genérico — que el documento tiene pagos, cuántos,
 * por cuánto, en qué estado, y QUÉ operación hacer antes de poder devolver:
 * anular cada pago desde el historial (procedimiento oficial de reversión:
 * contra-fila + asiento compensatorio + auditoría) y luego volver al
 * documento para completar la anulación/devolución.
 */

import React from 'react';
import { AlertTriangle, Banknote, History, ShieldCheck } from 'lucide-react';
import { BaseModal } from '@/components/ui/BaseModal';
import { formatCurrency } from '@/lib/utils';
import {
  PAYMENT_METHOD_LABELS,
  type DocumentPaymentRow,
  type LivePaymentsSummary,
} from '@/lib/payments/live-payments';

export interface UnresolvedPaymentsDialogProps {
  open: boolean;
  onClose: () => void;
  /** «recepción» | «servicio» — para el texto. */
  docKind: 'receipt' | 'service';
  /** Identificador legible (número de documento / referencia). */
  docLabel: string;
  supplier?: string | null;
  /** Total original del documento (CUP). */
  totalCup: number;
  /** Resumen de pagos (live/net) — de computeLivePayments o del error parseado. */
  summary: Pick<LivePaymentsSummary, 'liveCount' | 'liveTotalCup' | 'netPaidCup'>;
  /** Detalle por pago vivo (cuando está disponible). */
  liveRows?: DocumentPaymentRow[];
  /** Acceso al historial/operación de resolución (misión §6: «ofrecer acceso»). */
  onViewPayments?: () => void;
}

const KIND_LABELS: Record<'receipt' | 'service', { uno: string; articulo: string }> = {
  receipt: { uno: 'recepción', articulo: 'la recepción' },
  service: { uno: 'servicio', articulo: 'el servicio' },
};

export function UnresolvedPaymentsDialog({
  open,
  onClose,
  docKind,
  docLabel,
  supplier,
  totalCup,
  summary,
  liveRows,
  onViewPayments,
}: UnresolvedPaymentsDialogProps) {
  const kind = KIND_LABELS[docKind] ?? KIND_LABELS.receipt;
  const balance = Math.max(0, totalCup - summary.netPaidCup);
  return (
    <BaseModal open={open} onOpenChange={o => { if (!o) onClose(); }} title="Pagos sin resolver" maxWidth="sm:max-w-xl">
      <div className="p-5 space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4">
          <AlertTriangle className="w-5 h-5 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
          <div className="space-y-1">
            <p className="text-sm font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">
              Este documento tiene pagos registrados
            </p>
            <p className="text-sm text-foreground">
              No se puede {docKind === 'receipt' ? 'revertir/anular' : 'anular'} {kind.articulo}{' '}
              <strong>{docLabel}</strong>
              {supplier ? <> de <strong>{supplier}</strong></> : null} mientras sus pagos sigan aplicados.
              Primero resuelve el estado financiero de cada pago con la reversión oficial y después vuelve aquí para completar la operación.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Total documento</p>
            <p className="text-sm font-black">{formatCurrency(totalCup)}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Pagado (neto)</p>
            <p className="text-sm font-black">{formatCurrency(summary.netPaidCup)}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Saldo pendiente</p>
            <p className="text-sm font-black">{formatCurrency(balance)}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Pagos vivos</p>
            <p className="text-sm font-black">{summary.liveCount}</p>
          </div>
        </div>

        {liveRows && liveRows.length > 0 ? (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/60">
                <tr>
                  <th className="text-left font-bold uppercase tracking-wider px-3 py-2">Fecha</th>
                  <th className="text-left font-bold uppercase tracking-wider px-3 py-2">Método</th>
                  <th className="text-right font-bold uppercase tracking-wider px-3 py-2">Importe</th>
                  <th className="text-left font-bold uppercase tracking-wider px-3 py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {liveRows.map(p => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-3 py-2">{new Date(p.payment_date).toLocaleDateString('es-CU')}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1">
                        <Banknote className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                        {PAYMENT_METHOD_LABELS[p.payment_method ?? ''] ?? p.payment_method ?? '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-bold">
                      {formatCurrency(Number(p.amount_cup ?? p.amount ?? 0))}
                      {p.currency && p.currency !== 'CUP' ? <span className="text-muted-foreground font-normal"> {p.currency}</span> : null}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
                        <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" /> Aplicado
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Cómo proceder</p>
          <ol className="list-decimal list-inside text-sm space-y-1">
            <li>
              Abre el <strong>historial de pagos</strong> del documento y anula cada pago con la
              <strong> reversión oficial</strong> (se registra la contra-fila y el asiento compensatorio; el
              dinero vuelve al medio original y la trazabilidad queda intacta).
            </li>
            <li>
              Verifica que el documento quede <strong>sin pagos aplicados</strong>.
            </li>
            <li>
              Vuelve a este documento y completa la {docKind === 'receipt' ? 'reversión/anulación' : 'anulación'} —
              ya no quedará ningún pago vinculado a un documento cancelado.
            </li>
          </ol>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-border hover:bg-muted text-sm font-bold"
          >
            Entendido
          </button>
          {onViewPayments ? (
            <button
              type="button"
              onClick={() => { onViewPayments(); onClose(); }}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-bold inline-flex items-center gap-2"
            >
              <History className="w-4 h-4" aria-hidden="true" />
              Ver historial de pagos
            </button>
          ) : null}
        </div>
      </div>
    </BaseModal>
  );
}

export default UnresolvedPaymentsDialog;
