'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronRight, History, Trash2, Banknote, Smartphone, DollarSign } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { apiFetch } from '@/lib/api-fetch';
import { usePaymentHistory, type PaymentRecord } from '@/hooks/api/usePaymentHistory';
import { useDialogs } from '@/components/ui/dialogs';

interface PaymentHistoryRowProps {
  refType: 'receipt' | 'service' | 'commission';
  refId: string;
  paidAmount: number;
  /** Total original CUP del documento — permite mostrar el saldo restante
   * tras cada aplicación (misión FASE 6: cada importe verificable). */
  totalCup?: number;
}

// CP-FIN-004: canónico external_transfer + heredado zelle (ambos = Transf. Exterior).
const METHOD_ICONS: Record<'cash' | 'transfer' | 'zelle' | 'external_transfer', typeof Banknote> = {
  cash: Banknote,
  transfer: Smartphone,
  zelle: DollarSign,
  external_transfer: DollarSign,
};

const METHOD_LABELS: Record<'cash' | 'transfer' | 'zelle' | 'external_transfer', string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  zelle: 'Transf. Exterior',
  external_transfer: 'Transf. Exterior',
};

export default function PaymentHistoryRow({ refType, refId, paidAmount, totalCup }: PaymentHistoryRowProps) {
  // CP-UX-FINAL-POLISH-003 §3.1: sistema unificado de diálogos (sin confirm/prompt/alert nativos).
  const dialogs = useDialogs();
  const [expanded, setExpanded] = useState(false);
  const { payments, loading, error, refetch } = usePaymentHistory(
    refType,
    refId,
    expanded
  );

  // FIX-AUD2-2: para comisiones, consultar commission_payments (no payment_transactions)
  const [commissionPayment, setCommissionPayment] = useState<PaymentRecord | null>(null);
  const [commissionLoading, setCommissionLoading] = useState(false);

  useEffect(() => {
    if (!expanded || refType !== 'commission') {
      setCommissionPayment(null);
      return;
    }

    let cancelled = false;
    const fetchCommissionPayment = async () => {
      setCommissionLoading(true);
      try {
        const data = await apiFetch(`/api/commissions/payments/${refId}`).catch(() => null);
        if (!cancelled && data) {
          // Mapear commission_payment a PaymentRecord
          if (data.status === 'paid' && data.paid_at) {
            setCommissionPayment({
              id: data.id,
              amount: Number(data.final_amount) || 0,
              amount_cup: Number(data.final_amount) || 0,
              payment_method: data.payment_method || 'cash',
              currency: 'CUP',
              exchange_rate: 1.0,
              payment_date: data.paid_at,
              reference: data.payment_reference || null,
              notes: null,
              paid_by: data.paid_by || null,
            });
          } else {
            setCommissionPayment(null);
          }
        }
      } catch {
        if (!cancelled) setCommissionPayment(null);
      } finally {
        if (!cancelled) setCommissionLoading(false);
      }
    };

    fetchCommissionPayment();
    return () => { cancelled = true; };
  }, [expanded, refType, refId]);

  // Para comisiones, usar commissionPayment; para otros, usar payments del hook
  const displayPayments = refType === 'commission'
    ? (commissionPayment ? [commissionPayment] : [])
    : payments;
  const displayLoading = refType === 'commission' ? commissionLoading : loading;

  // CP-AP-FORENSIC-RECONCILIATION-001 (misión FASE 6): estado del pago + saldo
  // restante tras cada aplicación. El endpoint devuelve `direction`
  // (select *): las contra-filas 'reversal' se marcan y RESTAN del acumulado
  // — así el historial concilia con el «Pagado» del documento.
  const historyRows = useMemo(() => {
    const asc = [...displayPayments].sort(
      (a, b) => new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime(),
    );
    let running = 0;
    const withRemaining = asc.map(p => {
      const dir = (p as { direction?: string | null }).direction ?? 'in';
      const signed = dir === 'reversal' ? -(Number(p.amount_cup) || 0) : Number(p.amount_cup) || 0;
      running += signed;
      return {
        ...p,
        isReversal: dir === 'reversal',
        runningPaid: running,
        remaining: totalCup !== undefined ? Math.max(0, totalCup - running) : null,
      };
    });
    // Mostrar más reciente primero (orden visual), con el acumulado ya calculado
    return withRemaining.reverse();
  }, [displayPayments, totalCup]);

  // CP-OPS-ENERVIDA §5: REVERSIÓN contable (antes DELETE físico → PT007 500).
  // Fila contraria + asiento compensatorio; el documento sigue confirmado y
  // la obligación se restablece por neteo.
  const handleVoid = async (paymentId: string) => {
    // CP-UX-FINAL-POLISH-003 §3.1: confirmación + motivo con diálogos propios
    // (antes confirm()/prompt() nativos).
    const ok = await dialogs.confirm({
      title: 'Anular pago',
      message: '¿Anular este pago? Se registrará un movimiento compensatorio: el documento permanece, la obligación se restablece y caja/banco recibe su contra-fila.',
      variant: 'destructive',
      confirmLabel: 'Anular pago',
    });
    if (!ok) return;
    // El prompt original era opcional: cancelar (null) o confirmar vacío
    // seguían AMBOS el flujo con motivo vacío. Se replica con `optional` + `?? ''`.
    const reason = (await dialogs.prompt({
      title: 'Motivo de la anulación',
      message: 'Motivo de la anulación (opcional).',
      label: 'Motivo',
      placeholder: 'Motivo de la anulación (opcional)',
      optional: true,
      type: 'textarea',
      confirmLabel: 'Anular pago',
    })) ?? '';

    try {
      const data = await apiFetch<{ message?: string }>(`/api/payments/${paymentId}`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() || null }),
      });
      if (data?.message) {
        // El mensaje estructurado de la ruta (reversión registrada / idempotente).
        // Sin await: refetch() sigue de inmediato (el aviso no bloquea el flujo).
        dialogs.alert({ title: 'Pago anulado', message: data.message, variant: 'success' });
      }
      refetch();
    } catch (e: any) {
      dialogs.alert({ title: 'Error al anular', message: e.message, variant: 'error' });
    }
  };

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-border/40 text-[10px] font-bold uppercase hover:bg-muted"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <History className="w-3 h-3" />
        {paidAmount > 0 ? `${payments.length || ''} pago(s)` : 'Ver pagos'}
      </button>

      {/* Expanded content */}
      {expanded && (
        <tr>
          <td colSpan={8} className="p-0">
            <div className="bg-muted/10 border-t border-border/20 p-3">
              {displayLoading ? (
                <p className="text-xs text-muted-foreground text-center py-2">Cargando historial...</p>
              ) : error && refType !== 'commission' ? (
                <p className="text-xs text-destructive text-center py-2">Error: {error}</p>
              ) : historyRows.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">
                  No hay pagos registrados para este documento
                </p>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-black uppercase text-muted-foreground mb-2">
                    Historial de Pagos ({historyRows.length}) — aplicado neto: {formatCurrency(historyRows[0]?.runningPaid ?? 0, 'CUP')}
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[9px] font-black uppercase text-muted-foreground border-b border-border/20">
                          <th className="p-1.5 text-left">Fecha</th>
                          <th className="p-1.5 text-center">Método</th>
                          <th className="p-1.5 text-right">Monto</th>
                          <th className="p-1.5 text-center">Moneda</th>
                          <th className="p-1.5 text-right">Tasa</th>
                          <th className="p-1.5 text-right">Equiv. CUP</th>
                          <th className="p-1.5 text-center">Estado</th>
                          <th className="p-1.5 text-right">Saldo restante</th>
                          <th className="p-1.5 text-left">Referencia</th>
                          <th className="p-1.5 text-center">Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyRows.map((p) => {
                          const Icon = METHOD_ICONS[p.payment_method] || Banknote;
                          return (
                            <tr key={p.id} className={cn("border-b border-border/10", p.isReversal && "opacity-70")}>
                              <td className="p-1.5 text-muted-foreground">
                                {new Date(p.payment_date).toLocaleString('es-CU', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </td>
                              <td className="p-1.5 text-center">
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold">
                                  <Icon className="w-3 h-3" />
                                  {METHOD_LABELS[p.payment_method]}
                                </span>
                              </td>
                              <td className="p-1.5 text-right font-mono font-bold tabular-nums">
                                {Number(p.amount).toFixed(2)}
                              </td>
                              <td className="p-1.5 text-center text-[10px] font-bold">
                                {p.currency}
                              </td>
                              <td className="p-1.5 text-right font-mono text-muted-foreground text-[10px]">
                                {Number(p.exchange_rate).toFixed(2)}
                              </td>
                              <td className={cn(
                                "p-1.5 text-right font-mono font-bold tabular-nums",
                                p.isReversal ? "text-destructive" : "text-success"
                              )}>
                                {p.isReversal ? '−' : ''}{formatCurrency(Number(p.amount_cup), 'CUP')}
                              </td>
                              <td className="p-1.5 text-center">
                                <span className={cn(
                                  "px-1.5 py-0.5 rounded text-[9px] font-black uppercase",
                                  p.isReversal ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"
                                )}>
                                  {p.isReversal ? 'Anulado' : 'Aplicado'}
                                </span>
                              </td>
                              <td className="p-1.5 text-right font-mono tabular-nums text-muted-foreground">
                                {p.remaining !== null ? formatCurrency(p.remaining, 'CUP') : '—'}
                              </td>
                              <td className="p-1.5 text-[10px] text-muted-foreground truncate max-w-[120px]">
                                {p.reference || '—'}
                              </td>
                              <td className="p-1.5 text-center">
                                {/* FIX-AUD2-2: no mostrar botón anular para comisiones */}
                                {refType !== 'commission' && (
                                  <button
                                    onClick={() => handleVoid(p.id)}
                                    className="text-destructive hover:bg-destructive/10 p-1 rounded"
                                    title="Anular pago"
                                    aria-label="Anular pago"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-border/30">
                          <td colSpan={5} className="p-1.5 text-right text-[10px] font-black uppercase">
                            Total aplicado neto:
                          </td>
                          <td className="p-1.5 text-right font-mono font-black tabular-nums text-success">
                            {formatCurrency(historyRows[0]?.runningPaid ?? 0, 'CUP')}
                          </td>
                          <td colSpan={3}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
