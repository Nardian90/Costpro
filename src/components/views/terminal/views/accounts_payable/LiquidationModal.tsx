"use client";

/**
 * CP-OPS-ENERVIDA §6.2/§6.3 — Panel «Liquidar seleccionadas» de Cuentas por
 * Pagar. Revisa CADA documento antes de pagar: liquidación total o parcial
 * (importe editable por documento, nunca > saldo), UN método y UNA moneda
 * por lote, fecha y referencia, confirmación expresa. El envío va al lote
 * ATÓMICO /api/payments/multi (register_supplier_payment_multi): o se
 * liquidan todos o ninguno; el reintento es replay idempotente.
 */
import React, { useMemo, useState } from "react";
import { Banknote, Landmark, CreditCard, X, Loader2, AlertTriangle } from "lucide-react";
import { BaseModal } from "@/components/ui/BaseModal";
import { formatCurrency } from "@/lib/utils";
import { useAuthStore } from "@/store";
import { toast } from "sonner";
import { useDialogs } from "@/components/ui/dialogs";

export interface LiquidationItem {
  id: string;
  ref_type: 'receipt' | 'service';
  ref_id: string;
  supplier: string | null;
  reference: string;
  balance: number;      // saldo pendiente (CUP canónico)
  currency: string;     // moneda del documento
}

interface LiquidationModalProps {
  open: boolean;
  onClose: () => void;
  items: LiquidationItem[];
  onSettled: () => void;
}

const METHODS = [
  { value: 'cash', label: 'Efectivo', icon: Banknote },
  { value: 'transfer', label: 'Transferencia', icon: Landmark },
  { value: 'external_transfer', label: 'Transf. Exterior', icon: CreditCard },
] as const;

export function LiquidationModal({ open, onClose, items, onSettled }: LiquidationModalProps) {
  // CP-UX-FINAL-POLISH-003 §3.1: sistema unificado de diálogos (sin confirm() nativo).
  const dialogs = useDialogs();
  const token = useAuthStore((s) => s.token);
  const [method, setMethod] = useState<'cash' | 'transfer' | 'external_transfer'>('cash');
  const [reference, setReference] = useState('');
  const [amounts, setAmounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(items.map((it) => [it.id, it.balance]))
  );
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (open) setAmounts(Object.fromEntries(items.map((it) => [it.id, it.balance])));
  }, [open, items]);

  const rows = useMemo(
    () => items.map((it) => {
      const amount = amounts[it.id] ?? it.balance;
      const over = amount - it.balance > 0.005;
      return { ...it, amount, over, remaining: Math.max(0, it.balance - amount) };
    }),
    [items, amounts]
  );
  const anyOver = rows.some((r) => r.over);
  const anyZero = rows.some((r) => r.amount <= 0);
  const total = rows.reduce((s, r) => s + (r.amount || 0), 0);
  // §6.3-4: sin mezcla de monedas de DOCUMENTO incompatibles con el riel:
  // Transf. Exterior solo admite pago en divisa — se exige lote coherente.
  const incompatibleCurrency = method === 'external_transfer' && rows.some((r) => r.currency === 'CUP');
  const canSubmit = !busy && rows.length > 0 && !anyOver && !anyZero && total > 0 && !incompatibleCurrency;

  const submit = async () => {
    if (!canSubmit) return;
    // CP-UX-FINAL-POLISH-003 §3.1: confirmación propia (antes window.confirm() nativo).
    // Operación financiera: se conserva el mensaje completo con montos y método.
    const ok = await dialogs.confirm({
      title: 'Confirmar liquidación',
      message: `¿Confirmar la liquidación de ${rows.length} documento(s) por ${formatCurrency(total)} CUP (${METHODS.find((m) => m.value === method)?.label})? Se registrarán los pagos y movimientos correspondientes.`,
      variant: 'default',
      confirmLabel: 'Liquidar',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch('/api/payments/multi', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          items: rows.map((r) => ({ ref_type: r.ref_type, ref_id: r.ref_id, amount: r.amount })),
          payment_method: method,
          currency: 'CUP',
          exchange_rate: 1.0,
          reference: reference.trim() || null,
          // Clave de bloque: el MISMO lote reintentado no duplica pagos.
          idempotency_key: `liq:${rows.map((r) => `${r.ref_type}:${r.ref_id}:${r.amount}`).join('|')}`,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || body.message || `HTTP ${res.status}`);
      toast.success(`Liquidación registrada: ${body.count ?? rows.length} documento(s)${body.replayed ? ' (reintento idempotente)' : ''}.`);
      onSettled();
      onClose();
    } catch (e: any) {
      toast.error(`No se liquidó ningún documento: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BaseModal open={open} onOpenChange={(o) => !o && onClose()} title={<span className="flex items-center gap-2"><Landmark className="w-5 h-5" /> Liquidar seleccionadas ({items.length})</span>} maxWidth="sm:max-w-3xl">
      <div className="space-y-4">
        {/* §6.2: revisión por documento — importe a liquidar editable */}
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-xs" data-testid="liquidation-table">
            <thead>
              <tr className="text-[9px] font-black uppercase text-muted-foreground border-b border-border/30">
                <th className="p-2 text-left">Documento</th>
                <th className="p-2 text-left">Proveedor</th>
                <th className="p-2 text-right">Saldo pendiente</th>
                <th className="p-2 text-right">Importe a liquidar</th>
                <th className="p-2 text-right">Saldo restante</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/10">
                  <td className="p-2 font-bold">
                    {r.reference || r.ref_type}
                    <span className="block text-[9px] text-muted-foreground uppercase">{r.ref_type === 'receipt' ? 'Recepción' : 'Servicio'} · {r.currency}</span>
                  </td>
                  <td className="p-2">{r.supplier ?? '—'}</td>
                  <td className="p-2 text-right font-mono tabular-nums">{formatCurrency(r.balance)}</td>
                  <td className="p-2 text-right">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={r.amount}
                      onChange={(e) => setAmounts((a) => ({ ...a, [r.id]: parseFloat(e.target.value) || 0 }))}
                      className={`neu-input w-28 text-right font-mono tabular-nums ${r.over ? 'border-destructive' : ''}`}
                      aria-label={`Importe a liquidar de ${r.reference || r.supplier || '—'}`}
                    />
                  </td>
                  <td className={`p-2 text-right font-mono tabular-nums ${r.remaining === 0 ? 'text-success' : 'text-muted-foreground'}`}>{formatCurrency(r.remaining)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border/30">
                <td colSpan={3} className="p-2 text-right font-black uppercase text-[10px]">Total de la operación</td>
                <td className="p-2 text-right font-mono font-black tabular-nums">{formatCurrency(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        {(anyOver || anyZero) && (
          <p className="text-xs text-destructive flex items-center gap-1.5" data-testid="liquidation-validation">
            <AlertTriangle className="w-3.5 h-3.5" />
            {anyOver ? 'Ningún documento puede recibir un pago superior a su saldo pendiente.' : 'Cada documento necesita un importe mayor que 0 (desmarca el documento o corrige el importe).'}
          </p>
        )}

        {/* §6.2: método + referencia del pago del lote */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="sm:col-span-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Método de pago (único para el lote)</label>
            <div className="flex gap-1.5 mt-1">
              {METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMethod(m.value)}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2 h-10 rounded-lg border-2 text-[10px] font-black uppercase tracking-wider ${method === m.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
                >
                  <m.icon className="w-3.5 h-3.5" /> {m.label}
                </button>
              ))}
            </div>
            {incompatibleCurrency && (
              <p className="text-[10px] text-destructive mt-1">Transf. Exterior es un riel de divisa: separe los documentos CUP en otro lote (efectivo/transferencia).</p>
            )}
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Referencia</label>
            <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Nº de transference / recibo" className="neu-input w-full mt-1 text-xs" />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="h-10 px-4 rounded-lg border border-border text-xs font-black uppercase hover:bg-muted">Cancelar</button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="h-10 px-5 rounded-lg bg-primary text-primary-foreground text-xs font-black uppercase inline-flex items-center gap-2 hover:opacity-90 disabled:opacity-50"
            data-testid="liquidation-confirm"
          >
            {busy ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Liquidando…</> : <>Confirmar liquidación</>}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Operación atómica: si un documento no puede liquidarse, NO se liquida ninguno. El reintento del mismo lote no duplica pagos (idempotente). El flujo de pago individual permanece disponible.
        </p>
      </div>
    </BaseModal>
  );
}
