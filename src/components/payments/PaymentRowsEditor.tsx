'use client';

/**
 * PaymentRowsEditor — CP-FIN-003 · ANEXO VINCULANTE (§2 COMPONENTE UNIFICADO).
 *
 * Componente de pago UNIFICADO que reutiliza el diseño, las opciones, las
 * validaciones y la semántica del carrito de Ventas (POSCartItem):
 *
 *   · Forma de pago:  💵 Efectivo · 📱 Transf. · 💳 Transf. Exterior
 *                      (valores canónicos cash / transfer / zelle).
 *   · Moneda:         CUP · USD · EUR · MLC (Transf. Exterior: USD/EUR).
 *   · Importe en la MONEDA DEL PAGO (original, sin convertir).
 *   · Tasa de conversión cuando la moneda no es CUP (default: tasa de la
 *     tienda, editable) y equivalente contable en CUP siempre visible.
 *
 * El medio de pago determina la cuenta financiera; la moneda determina la
 * denominación — NUNCA se confunden (anexo §2, misión §4).
 *
 * Uso: Servicios Recibidos (creación + detalle), Recepciones (pagos) y
 * cualquier módulo que liquide obligaciones. No escribe en tablas
 * financieras: solo construye el payload para /api/payments (canal canónico).
 */
import React from 'react';
import { Plus, Copy, X, DollarSign, Send, CreditCard } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';

export type PaymentMethodValue = 'cash' | 'transfer' | 'zelle';
export type PaymentCurrencyValue = 'CUP' | 'USD' | 'EUR' | 'MLC';

/** Fila de pago editable (una por componente del desembolso). */
export interface PaymentEditorRow {
  id: string;
  method: PaymentMethodValue;
  amount: number;
  currency: PaymentCurrencyValue;
  exchange_rate: number;
  reference?: string | null;
}

/** Fila serializable para POST /api/payments (payments[]). */
export interface PaymentPayloadRow {
  payment_method: PaymentMethodValue;
  amount: number;
  currency: PaymentCurrencyValue;
  exchange_rate: number;
  reference?: string | null;
}

const METHOD_LABELS: Record<PaymentMethodValue, string> = {
  cash: '💵 Efectivo',
  transfer: '📱 Transf.',
  zelle: '💳 Transf. Exterior',
};

const CURRENCIES_BY_METHOD: Record<PaymentMethodValue, PaymentCurrencyValue[]> = {
  // Igual que el carrito: Transf. Exterior solo moneda extranjera.
  zelle: ['USD', 'EUR'],
  cash: ['CUP', 'USD', 'EUR', 'MLC'],
  transfer: ['CUP', 'USD', 'EUR', 'MLC'],
};

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function newPaymentRow(
  storeRates: Record<string, number>,
  overrides: Partial<PaymentEditorRow> = {},
): PaymentEditorRow {
  const currency = overrides.currency ?? 'CUP';
  return {
    id: overrides.id ?? crypto.randomUUID(),
    method: overrides.method ?? 'cash',
    amount: overrides.amount ?? 0,
    currency,
    // CUP → 1; divisa → tasa de la tienda si existe (editable en la UI).
    exchange_rate: overrides.exchange_rate
      ?? (currency === 'CUP' ? 1 : storeRates[currency] && storeRates[currency] > 1 ? storeRates[currency] : 1),
    reference: overrides.reference ?? null,
  };
}

/** Equivalente contable en CUP de una fila. */
export function rowCupEquivalent(row: PaymentEditorRow): number {
  if (row.currency === 'CUP') return round2(row.amount || 0);
  return round2((row.amount || 0) * (row.exchange_rate || 0));
}

/** Σ equivalentes CUP del lote. */
export function rowsCupTotal(rows: PaymentEditorRow[]): number {
  return round2(rows.reduce((s, r) => s + rowCupEquivalent(r), 0));
}

/** Payload para /api/payments (descarta filas sin importe). */
export function rowsToPayload(rows: PaymentEditorRow[]): PaymentPayloadRow[] {
  return rows
    .filter((r) => (r.amount || 0) > 0.005)
    .map((r) => ({
      payment_method: r.method,
      amount: round2(r.amount),
      currency: r.currency,
      exchange_rate: r.currency === 'CUP' ? 1 : r.exchange_rate || 1,
      reference: r.reference || null,
    }));
}

/** ¿Es válido el lote? (importes > 0 y tasas > 1 para divisa). */
export function rowsAreValid(rows: PaymentEditorRow[]): boolean {
  return rows.every(
    (r) => (r.amount || 0) > 0 && (r.currency === 'CUP' || (r.exchange_rate || 0) > 1),
  );
}

interface PaymentRowsEditorProps {
  rows: PaymentEditorRow[];
  onChange: (rows: PaymentEditorRow[]) => void;
  /** Tasas de la tienda (USD/EUR/MLC → CUP), p. ej. de /api/store-rates. */
  storeRates: Record<string, number>;
  disabled?: boolean;
  /** Etiqueta de la sección (por defecto «Información del pago»). */
  label?: string;
  /** Mostrar campo de referencia por fila. */
  showReference?: boolean;
  /** Tope admisible del lote en CUP (saldo pendiente). Opcional. */
  maxCupTotal?: number;
  onValidityChange?: (valid: boolean, cupTotal: number) => void;
}

export default function PaymentRowsEditor({
  rows,
  onChange,
  storeRates,
  disabled = false,
  label = 'Información del pago',
  showReference = true,
  maxCupTotal,
  onValidityChange,
}: PaymentRowsEditorProps) {
  const cupTotal = rowsCupTotal(rows);
  const allPositive = rows.length > 0 && rows.every((r) => (r.amount || 0) > 0);
  const valid = rowsAreValid(rows) && (!maxCupTotal || cupTotal <= maxCupTotal + 0.005);
  const overMax = !!maxCupTotal && cupTotal > maxCupTotal + 0.005;

  React.useEffect(() => {
    onValidityChange?.(valid && allPositive, cupTotal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid, allPositive, cupTotal]);

  const update = (id: string, patch: Partial<PaymentEditorRow>) => {
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const setMethod = (row: PaymentEditorRow, method: PaymentMethodValue) => {
    // Igual que el carrito: pasar a Transf. Exterior desde CUP/MLC convierte
    // la fila a USD (a la tasa de la tienda) para no falsear el equivalente.
    if (method === 'zelle' && row.currency !== 'USD' && row.currency !== 'EUR') {
      const rate = storeRates['USD'] && storeRates['USD'] > 1 ? storeRates['USD'] : 0;
      const converted = rate > 0 && row.amount > 0 ? round2(row.amount / rate) : row.amount;
      update(row.id, { method, currency: 'USD', amount: converted, exchange_rate: rate > 0 ? rate : 1 });
      return;
    }
    update(row.id, { method });
  };

  const setCurrency = (row: PaymentEditorRow, currency: PaymentCurrencyValue) => {
    if (currency === row.currency) return;
    update(row.id, {
      currency,
      exchange_rate:
        currency === 'CUP'
          ? 1
          : storeRates[currency] && storeRates[currency] > 1
            ? storeRates[currency]
            : row.exchange_rate || 1,
    });
  };

  return (
    <div className="space-y-2" data-testid="payment-rows-editor">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        <span className="text-[9px] font-bold text-muted-foreground">
          {rows.length} componente{rows.length === 1 ? '' : 's'}
        </span>
      </div>

      {rows.map((row, idx) => {
        const MethodIcon = row.method === 'cash' ? DollarSign : row.method === 'transfer' ? Send : CreditCard;
        const methodColor = row.method === 'cash' ? 'text-success' : 'text-primary';
        const currencies = CURRENCIES_BY_METHOD[row.method];
        const needsRate = row.currency !== 'CUP';
        const rateInvalid = needsRate && (row.exchange_rate || 0) <= 1;
        return (
          <div
            key={row.id}
            className={cn(
              'border rounded-lg p-2 space-y-1.5',
              rateInvalid ? 'border-destructive/50 bg-destructive/5' : 'border-border/40 bg-muted/10',
            )}
            data-testid={`payment-row-${idx}`}
          >
            <div className="flex flex-wrap gap-1.5 items-center">
              {/* Forma de pago */}
              <div className="relative">
                <MethodIcon
                  className={cn('absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3', methodColor)}
                  aria-hidden="true"
                />
                <select
                  value={row.method}
                  disabled={disabled}
                  onChange={(e) => setMethod(row, e.target.value as PaymentMethodValue)}
                  className="bg-background border border-border/50 rounded-lg pl-5 pr-1 py-2 min-h-[36px] text-[10px] font-bold shrink-0"
                  aria-label={`Forma de pago componente ${idx + 1}`}
                >
                  {(Object.keys(METHOD_LABELS) as PaymentMethodValue[]).map((m) => (
                    <option key={m} value={m}>{METHOD_LABELS[m]}</option>
                  ))}
                </select>
              </div>

              {/* Importe en la moneda del pago */}
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={row.amount > 0 ? row.amount : ''}
                disabled={disabled}
                onChange={(e) => update(row.id, { amount: Math.max(0, Number(e.target.value)) })}
                placeholder="0.00"
                className="bg-background border border-border/50 rounded-lg px-2 py-2 min-h-[36px] min-w-[92px] flex-1 text-xs font-bold tabular-nums"
                aria-label={`Importe componente ${idx + 1}`}
              />

              {/* Moneda del pago */}
              <select
                value={row.currency}
                disabled={disabled}
                onChange={(e) => setCurrency(row, e.target.value as PaymentCurrencyValue)}
                className="bg-background border border-border/50 rounded-lg px-1 py-2 min-h-[36px] text-[10px] font-bold shrink-0"
                aria-label={`Moneda componente ${idx + 1}`}
              >
                {currencies.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              {/* Tasa (solo divisa) */}
              {needsRate && (
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={row.exchange_rate > 0 ? row.exchange_rate : ''}
                  disabled={disabled}
                  onChange={(e) => update(row.id, { exchange_rate: Math.max(0, Number(e.target.value)) })}
                  placeholder="tasa"
                  className={cn(
                    'bg-background border rounded-lg px-1.5 py-2 min-h-[36px] w-[76px] text-[10px] font-bold tabular-nums',
                    rateInvalid ? 'border-destructive/60' : 'border-border/50',
                  )}
                  aria-label={`Tasa componente ${idx + 1}`}
                />
              )}

              {/* Acciones de fila */}
              <div className="flex gap-0.5 ml-auto">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange([...rows, { ...row, id: crypto.randomUUID() }])}
                  className="p-1.5 rounded-lg hover:bg-primary/10 text-primary disabled:opacity-40 min-h-[32px] min-w-[32px]"
                  aria-label="Duplicar componente"
                  title="Duplicar"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={disabled || rows.length <= 1}
                  onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
                  className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive disabled:opacity-40 min-h-[32px] min-w-[32px]"
                  aria-label="Eliminar componente"
                  title="Eliminar"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {showReference && (
              <input
                type="text"
                value={row.reference ?? ''}
                disabled={disabled}
                onChange={(e) => update(row.id, { reference: e.target.value || null })}
                placeholder="Referencia (N.º de transferencia, etc.)"
                className="w-full bg-background border border-border/50 rounded-lg px-2 py-1.5 text-[11px]"
                aria-label={`Referencia componente ${idx + 1}`}
              />
            )}

            {/* Equivalente contable */}
            <div className="flex items-center justify-between text-[10px] text-muted-foreground px-0.5">
              <span>
                {needsRate
                  ? `Equivalente: ${row.amount || 0} ${row.currency} × ${row.exchange_rate || 0}`
                  : 'Importe contable'}
              </span>
              <span className="font-bold tabular-nums text-foreground">
                {formatCurrency(rowCupEquivalent(row))} CUP
              </span>
            </div>
            {rateInvalid && (
              <p className="text-[10px] font-bold text-destructive px-0.5">
                La tasa debe ser mayor que 1 para pagos en {row.currency}.
              </p>
            )}
          </div>
        );
      })}

      {/* Pie: total del lote + agregar */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange([...rows, newPaymentRow(storeRates)])}
          className="h-9 px-3 rounded-lg border border-dashed border-border text-[10px] font-black uppercase tracking-wide text-muted-foreground hover:bg-muted disabled:opacity-40 flex items-center gap-1 min-h-[36px]"
          data-testid="payment-add-row"
        >
          <Plus className="w-3.5 h-3.5" /> Agregar componente
        </button>
        <div className="text-right">
          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Total del pago</p>
          <p
            className={cn(
              'text-sm font-mono font-black tabular-nums',
              overMax ? 'text-destructive' : 'text-foreground',
            )}
            data-testid="payment-rows-total"
          >
            {formatCurrency(cupTotal)} CUP
          </p>
          {overMax && (
            <p className="text-[10px] font-bold text-destructive">
              Excede el saldo pendiente ({formatCurrency(maxCupTotal!)} CUP)
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
