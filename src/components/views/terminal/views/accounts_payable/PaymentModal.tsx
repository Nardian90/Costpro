'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, Plus, Trash2, Banknote, Smartphone, DollarSign, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useRegisterPayment, type PaymentRowInput } from '@/hooks/api/useRegisterPayment';
import { supabase } from '@/lib/supabaseClient';

export interface PayableDocument {
  ref_type: 'receipt' | 'service' | 'commission';
  ref_id: string;
  supplier: string | null;
  total: number;
  total_cup: number;
  paid_cup: number;
  balance_cup: number;
  currency: string;
  exchange_rate: number;
  payment_status: string;
}

interface PaymentModalProps {
  document: PayableDocument | null;
  onClose: () => void;
  onPaymentRegistered: () => void;
}

const PAYMENT_METHODS = [
  { id: 'cash', label: 'Efectivo', icon: Banknote },
  { id: 'transfer', label: 'Transferencia', icon: Smartphone },
  { id: 'zelle', label: 'Zelle', icon: DollarSign },
] as const;

const CURRENCIES = ['CUP', 'USD', 'MLC'] as const;

interface PaymentRow extends PaymentRowInput {
  id: string;
}

export default function PaymentModal({ document: doc, onClose, onPaymentRegistered }: PaymentModalProps) {
  const { registerPayment, loading } = useRegisterPayment();
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [liveRate, setLiveRate] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Reset cuando cambia el documento
  useEffect(() => {
    if (doc) {
      setRows([createEmptyRow(doc.currency)]);
      setError(null);
      setSuccess(false);
    }
  }, [doc]);

  // Obtener tasa de cambio viva (sugerencia)
  useEffect(() => {
    if (!doc) return;
    const fetchLiveRate = async () => {
      try {
        const { data } = await supabase
          .from('exchange_rates')
          .select('rate')
          .eq('currency', 'USD')
          .order('date', { ascending: false })
          .limit(1);
        if (data && data.length > 0) {
          setLiveRate(Number(data[0].rate) || 1);
        }
      } catch {
        // fallback a 1
      }
    };
    fetchLiveRate();
  }, [doc]);

  const addRow = useCallback(() => {
    setRows(prev => [...prev, createEmptyRow('CUP')]);
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows(prev => prev.length > 1 ? prev.filter(r => r.id !== id) : prev);
  }, []);

  const updateRow = useCallback((id: string, updates: Partial<PaymentRow>) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  }, []);

  // Calcular totales
  const totalThisPaymentCup = rows.reduce((sum, r) => {
    const amount = Number(r.amount) || 0;
    const rate = Number(r.exchange_rate) || 1;
    return sum + (r.currency === 'CUP' ? amount : amount * rate);
  }, 0);

  const remainingAfterPayment = doc ? doc.balance_cup - totalThisPaymentCup : 0;
  const isOverpay = remainingAfterPayment < -0.01; // tolerance
  const isExact = Math.abs(remainingAfterPayment) < 0.01;
  const isPartial = remainingAfterPayment > 0.01 && totalThisPaymentCup > 0;

  const handleSubmit = async () => {
    if (!doc) return;
    if (isOverpay) {
      setError('El pago excede el saldo pendiente. Overpay no permitido.');
      return;
    }
    if (totalThisPaymentCup <= 0) {
      setError('Debe ingresar al menos un monto válido.');
      return;
    }

    // FASE 3: Comisiones — R2: pago completo en CUP, efectivo/transferencia/mixto
    // Las comisiones NO usan /api/payments — usan PATCH /api/commissions/payments/[id]
    if (doc.ref_type === 'commission') {
      // Validar que sea pago completo (R2)
      if (!isExact) {
        setError('Las comisiones deben pagarse completas (no se permiten pagos parciales).');
        return;
      }
      // Validar que todo sea en CUP (R2)
      const allCup = rows.every(r => r.currency === 'CUP');
      if (!allCup) {
        setError('Las comisiones solo se pueden pagar en CUP.');
        return;
      }
      // Determinar método: si hay 1 fila, ese método. Si hay 2+, 'mixed'.
      const validRows = rows.filter(r => Number(r.amount) > 0);
      const method = validRows.length === 1
        ? validRows[0].payment_method
        : 'mixed';

      setError(null);
      try {
        const response = await fetch(`/api/commissions/payments/${doc.ref_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'pay',
            payment_method: method,
          }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${response.status}`);
        }

        setSuccess(true);
        setTimeout(() => {
          onPaymentRegistered();
          onClose();
        }, 1500);
      } catch (e: any) {
        setError(e.message || 'Error al pagar comisión');
      }
      return;
    }

    // Recepciones y Servicios: usar /api/payments (pago mixto multi-moneda)
    setError(null);
    const payments: PaymentRowInput[] = rows
      .filter(r => Number(r.amount) > 0)
      .map(r => ({
        payment_method: r.payment_method,
        amount: Number(r.amount),
        currency: r.currency,
        exchange_rate: Number(r.exchange_rate),
        reference: r.reference || null,
        notes: r.notes || null,
      }));

    const result = await registerPayment(doc.ref_type, doc.ref_id, payments);

    if (result.success) {
      setSuccess(true);
      setTimeout(() => {
        onPaymentRegistered();
        onClose();
      }, 1500);
    } else {
      setError(result.error || 'Error al registrar pago');
    }
  };

  if (!doc) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-background rounded-2xl border border-border/40 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/30 sticky top-0 bg-background z-10">
          <div>
            <h3 className="text-lg font-black uppercase tracking-tight">Registrar Pago</h3>
            <p className="text-[10px] text-muted-foreground uppercase">{doc.supplier || 'Sin proveedor'}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Document info */}
        <div className="p-4 bg-muted/20 border-b border-border/30">
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <p className="text-[10px] uppercase font-black text-muted-foreground">Total Documento</p>
              <p className="font-mono font-bold">{formatCurrency(doc.total, doc.currency)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-black text-muted-foreground">Ya Pagado</p>
              <p className="font-mono font-bold text-success">{formatCurrency(doc.paid_cup, 'CUP')}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-black text-muted-foreground">Saldo Pendiente</p>
              <p className="font-mono font-black text-primary">{formatCurrency(doc.balance_cup, 'CUP')}</p>
            </div>
          </div>
          {doc.currency !== 'CUP' && (
            <p className="text-[10px] text-muted-foreground mt-2">
              Moneda original: {doc.currency} · Tasa documento: {doc.exchange_rate}
            </p>
          )}
        </div>

        {/* Success state */}
        {success ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="w-16 h-16 mx-auto text-success mb-3" />
            <p className="text-lg font-black uppercase">¡Pago Registrado!</p>
            <p className="text-xs text-muted-foreground mt-1">Cerrando...</p>
          </div>
        ) : (
          <>
            {/* Payment rows */}
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase text-muted-foreground">
                  Pagos ({rows.length})
                </p>
                <button
                  onClick={addRow}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg border border-border/40 text-[10px] font-black uppercase hover:bg-muted"
                >
                  <Plus className="w-3 h-3" /> Añadir
                </button>
              </div>

              {rows.map((row, idx) => (
                <div key={row.id} className="rounded-xl border border-border/30 p-3 space-y-2 bg-background">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-muted-foreground">Pago #{idx + 1}</span>
                    {rows.length > 1 && (
                      <button
                        onClick={() => removeRow(row.id)}
                        className="text-destructive hover:bg-destructive/10 p-1 rounded"
                        aria-label="Eliminar pago"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Method selector */}
                  <div className="grid grid-cols-3 gap-1.5">
                    {PAYMENT_METHODS.map(m => {
                      const Icon = m.icon;
                      return (
                        <button
                          key={m.id}
                          onClick={() => updateRow(row.id, { payment_method: m.id })}
                          className={cn(
                            "flex flex-col items-center gap-1 py-2 rounded-lg border text-[10px] font-bold uppercase",
                            row.payment_method === m.id
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border/40 text-muted-foreground hover:bg-muted"
                          )}
                        >
                          <Icon className="w-4 h-4" />
                          {m.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Amount, currency, rate */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[9px] uppercase font-black text-muted-foreground">Monto</label>
                      <input
                        type="number"
                        step="0.01"
                        value={row.amount || ''}
                        onChange={(e) => updateRow(row.id, { amount: Number(e.target.value) })}
                        className="w-full px-2 py-1.5 rounded border border-border/40 bg-background text-xs font-mono"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] uppercase font-black text-muted-foreground">Moneda</label>
                      <select
                        value={row.currency}
                        onChange={(e) => updateRow(row.id, { currency: e.target.value })}
                        className="w-full px-2 py-1.5 rounded border border-border/40 bg-background text-xs"
                      >
                        {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] uppercase font-black text-muted-foreground">
                        Tasa {liveRate > 1 && row.currency !== 'CUP' && `(viva: ${liveRate})`}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={row.exchange_rate}
                        onChange={(e) => updateRow(row.id, { exchange_rate: Number(e.target.value) })}
                        disabled={row.currency === 'CUP'}
                        className={cn(
                          "w-full px-2 py-1.5 rounded border border-border/40 bg-background text-xs font-mono",
                          row.currency === 'CUP' && "opacity-50 cursor-not-allowed"
                        )}
                      />
                    </div>
                  </div>

                  {/* Reference */}
                  <div>
                    <label className="text-[9px] uppercase font-black text-muted-foreground">Referencia (opcional)</label>
                    <input
                      type="text"
                      value={row.reference || ''}
                      onChange={(e) => updateRow(row.id, { reference: e.target.value })}
                      className="w-full px-2 py-1.5 rounded border border-border/40 bg-background text-xs"
                      placeholder="# transferencia, etc."
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="p-4 bg-muted/20 border-t border-border/30 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Total de este pago:</span>
                <span className="font-mono font-bold">{formatCurrency(totalThisPaymentCup, 'CUP')}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Saldo resultante:</span>
                <span className={cn(
                  "font-mono font-black",
                  isOverpay ? "text-destructive" : isExact ? "text-success" : "text-primary"
                )}>
                  {formatCurrency(Math.max(0, remainingAfterPayment), 'CUP')}
                </span>
              </div>

              {/* Status indicator */}
              {totalThisPaymentCup > 0 && (
                <div className={cn(
                  "flex items-center gap-2 p-2 rounded-lg text-[10px] font-black uppercase",
                  isOverpay ? "bg-destructive/10 text-destructive"
                  : isExact ? "bg-success/10 text-success"
                  : "bg-amber-500/10 text-amber-500"
                )}>
                  {isOverpay ? <AlertCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  {isOverpay ? 'Excede el saldo — bloqueado'
                  : isExact ? 'Pago completo — documento quedará Pagado'
                  : 'Pago parcial — documento quedará Parcial'}
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 p-2 rounded-lg text-[10px] font-bold text-destructive bg-destructive/10">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {error}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="p-4 flex gap-2 border-t border-border/30">
              <button
                onClick={onClose}
                disabled={loading}
                className="flex-1 py-2.5 rounded-lg border border-border/40 text-xs font-black uppercase hover:bg-muted disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading || isOverpay || totalThisPaymentCup <= 0}
                className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-black uppercase hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Registrando...' : 'Registrar Pago'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function createEmptyRow(currency: string = 'CUP'): PaymentRow {
  return {
    id: Math.random().toString(36).slice(2),
    payment_method: 'cash',
    amount: 0,
    currency,
    exchange_rate: 1.0,
    reference: null,
    notes: null,
  };
}
