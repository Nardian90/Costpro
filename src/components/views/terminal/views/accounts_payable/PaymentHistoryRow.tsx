'use client';

import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, History, Trash2, Banknote, Smartphone, DollarSign } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { apiFetch } from '@/lib/api-fetch';
import { usePaymentHistory, type PaymentRecord } from '@/hooks/api/usePaymentHistory';

interface PaymentHistoryRowProps {
  refType: 'receipt' | 'service' | 'commission';
  refId: string;
  paidAmount: number;
}

const METHOD_ICONS = {
  cash: Banknote,
  transfer: Smartphone,
  zelle: DollarSign,
};

const METHOD_LABELS = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  zelle: 'Zelle',
};

export default function PaymentHistoryRow({ refType, refId, paidAmount }: PaymentHistoryRowProps) {
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

  // FIX-AUD3-3 (2026-07-13): handleVoid estaba indefinido → ReferenceError
  const handleVoid = async (paymentId: string) => {
    if (!confirm('¿Anular este pago? El saldo se recalculará automáticamente.')) return;

    try {
      await apiFetch(`/api/payments/${paymentId}`, { method: 'DELETE' });
      refetch();
    } catch (e: any) {
      alert(`Error al anular: ${e.message}`);
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
              ) : displayPayments.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">
                  No hay pagos registrados para este documento
                </p>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-black uppercase text-muted-foreground mb-2">
                    Historial de Pagos ({displayPayments.length})
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
                          <th className="p-1.5 text-left">Referencia</th>
                          <th className="p-1.5 text-center">Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayPayments.map((p) => {
                          const Icon = METHOD_ICONS[p.payment_method] || Banknote;
                          return (
                            <tr key={p.id} className="border-b border-border/10">
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
                              <td className="p-1.5 text-right font-mono font-bold tabular-nums text-success">
                                {formatCurrency(Number(p.amount_cup), 'CUP')}
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
                            Total pagado:
                          </td>
                          <td className="p-1.5 text-right font-mono font-black tabular-nums text-success">
                            {formatCurrency(
                              displayPayments.reduce((s, p) => s + Number(p.amount_cup), 0),
                              'CUP'
                            )}
                          </td>
                          <td colSpan={2}></td>
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
