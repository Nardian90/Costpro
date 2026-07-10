"use client";

import React, { useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  DollarSign,
  CreditCard,
  Smartphone,
  Send,
  TrendingUp,
  TrendingDown,
  Check,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { useCartStore } from "@/store/cart";
import { POSPortalModal } from "./POSPortalModal";
import type { PaymentMethod } from "@/types";

/**
 * POS-3a-2 / 3a-3 / 3a-4: POSCartCheckoutPanel
 *
 * Reemplaza la combinación antigua POSCartActions + POSCartSummary con un
 * solo panel coherente que sigue el orden mental del cajero:
 *
 *   1. TOTAL (gigante, lo primero que ve)
 *   2. Método de pago (4 botones, siempre visible — no colapsado)
 *   3. Efectivo recibido + presets + vuelto (si método = cash)
 *   4. Pago mixto (accordion)
 *   5. Descuento (accordion)
 *   6. CTA gigante CONFIRMAR VENTA + Anular
 *
 * Antes: el botón CONFIRMAR estaba ARRIBA, los items en medio enterrados,
 * y el total al final. El cajero no sabía por dónde empezar.
 */

interface POSCartCheckoutPanelProps {
  items: Array<{
    product_id: string;
    variant_id: string | null;
    quantity: number;
    price: number;
    subtotal: number;
    cash_paid: number;
    transfer_paid: number;
    zelle_paid?: number;
    product?: { name: string };
  }>;
  getSubtotal: () => number;
  getDiscountAmount: () => number;
  getTotal: () => number;
  getTaxAmount?: () => number;
  discount: { type: "percentage" | "fixed"; value: number; currency?: string } | null;
  setDiscount: (d: { type: "percentage" | "fixed"; value: number; currency?: string } | null) => void;
  prorateGlobalPayment?: (cash: number, transfer: number, zelle?: number) => void;
  // FIX-PAYMENT-MODE (2026-07-06): detectar y consolidar pagos por producto
  isPaymentModeByProduct?: () => boolean;
  getConsolidatedPayments?: () => Record<string, { cash: number; transfer: number; zelle: number }>;
  selectedPayment: PaymentMethod;
  onSetSelectedPayment: (m: PaymentMethod) => void;
  isProcessing: boolean;
  itemCount: number;
  onCheckout: (payment: PaymentMethod, discount: { type: "percentage" | "fixed"; value: number } | null) => void;
  onClearCart: () => void;
  isMobile: boolean;
}

const PAYMENT_METHODS: Array<{
  id: "cash" | "transfer" | "zelle";
  label: string;
  short: string;
  icon: typeof DollarSign;
}> = [
  { id: "cash",     label: "Efectivo",      short: "Efectivo", icon: DollarSign },
  { id: "transfer", label: "Transferencia", short: "Transf.",  icon: Smartphone },
  { id: "zelle",    label: "Zelle",         short: "Zelle",    icon: CreditCard },
];

function getPaymentLabel(m: string) {
  const found = PAYMENT_METHODS.find((p) => p.id === m);
  if (found) return found.label;
  if (m === "mixed") return "Mixto";
  if (m === "other") return "Otro";
  return m;
}

export function POSCartCheckoutPanel({
  items,
  getSubtotal,
  getDiscountAmount,
  getTotal,
  getTaxAmount,
  discount,
  setDiscount,
  prorateGlobalPayment,
  isPaymentModeByProduct,
  getConsolidatedPayments,
  selectedPayment,
  onSetSelectedPayment,
  isProcessing,
  itemCount,
  onCheckout,
  onClearCart,
  isMobile,
}: POSCartCheckoutPanelProps) {
  const prefersReducedMotion = useReducedMotion();
  const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false);
  const [cashReceived, setCashReceived] = useState("");
  // FIX-CASH-BREAKDOWN (2026-07-10): modal de desglose por billetes/monedas
  const [showCashBreakdown, setShowCashBreakdown] = useState(false);
  const [cashBreakdown, setCashBreakdown] = useState<Record<string, number>>({});
  const [breakdownTab, setBreakdownTab] = useState<'count' | 'config'>('count');

  // Billetes/monedas disponibles (configurable)
  const [denominations, setDenominations] = useState([
    { value: 1000, label: '$1000', active: true },
    { value: 500, label: '$500', active: true },
    { value: 200, label: '$200', active: true },
    { value: 100, label: '$100', active: true },
    { value: 50, label: '$50', active: true },
    { value: 20, label: '$20', active: true },
    { value: 10, label: '$10', active: true },
    { value: 5, label: '$5', active: true },
    { value: 1, label: '$1', active: true },
  ]);

  const cashBreakdownTotal = Object.entries(cashBreakdown).reduce((s, [denom, count]) => {
    return s + (parseFloat(denom) * count);
  }, 0);

  const taxAmount = getTaxAmount?.() ?? 0;
  const cashReceivedNum = parseFloat(cashReceived) || 0;
  // FIX-CONSISTENCY (2026-07-10): el vuelto y todos los montos se calculan contra
  // el total esperado (con recargos/descuentos por método), no contra getTotal()
  // que puede tener un descuento global fantasma restado.
  const expectedTotal = useCartStore.getState().getExpectedTotalCup();
  const change = cashReceivedNum > 0 ? cashReceivedNum - expectedTotal : 0;
  const cashPresets = [20, 50, 100, 200];

  const handleConfirmCheckout = () => {
    setShowCheckoutConfirm(false);
    onCheckout(selectedPayment, discount && discount.value > 0 ? discount : null);
  };

  return (
    <div className="flex flex-col">
      {/* POS-3a-v3: Botón oculto que el CTA externo del POSCart puede disparar
          vía document.querySelector('#pos-checkout-cta').click().
          Esto permite que el botón COBRAR gigante esté siempre visible abajo
          sin importar el tab activo, pero el modal de confirmación viva aquí. */}
      <button
        id="pos-checkout-cta"
        type="button"
        onClick={() => setShowCheckoutConfirm(true)}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* ── TOTAL (lo primero, gigante) ────────────────────────────── */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 bg-gradient-to-br from-primary/5 to-transparent border-b border-border/50">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] sm:text-xs font-black uppercase text-muted-foreground tracking-widest">
            Total a cobrar
          </span>
          {/* FIX-CONSISTENCY (2026-07-10): usar getExpectedTotalCup() que considera
              recargos/descuentos por método. Antes usaba getTotalCup() que restaba un
              descuento global fantasma y NO aplicaba los +5% del recargo del item. */}
          <span className="text-[clamp(1.75rem,7vw,2.5rem)] font-black text-primary tracking-tighter leading-none tabular-nums">
            {formatCurrency(useCartStore.getState().getExpectedTotalCup())}
          </span>
        </div>
        {/* FIX-MULTI-MONEDA: desglose por moneda si hay items en diferentes monedas */}
        {(() => {
          const items = useCartStore.getState().items;
          const byCurrency: Record<string, number> = {};
          items.forEach(item => {
            const c = item.currency || 'CUP';
            byCurrency[c] = (byCurrency[c] || 0) + (item.subtotal || 0);
          });
          const currencies = Object.keys(byCurrency);
          if (currencies.length <= 1) return null;
          return (
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold">
              {currencies.map(c => (
                <span key={c} className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  {c}: {formatCurrency(byCurrency[c])}
                </span>
              ))}
              <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                Total CUP: {formatCurrency(useCartStore.getState().getExpectedTotalCup())}
              </span>
            </div>
          );
        })()}
        {/* Desglose compacto:
            Subt. = base sin ajustes (getSubtotalCup)
            Ajustes = diferencia entre Total y Subt (positivo=recargo, negativo=descuento)
            Imp. = impuestos (si los hay) */}
        {(() => {
          const subtotalCup = useCartStore.getState().getSubtotalCup();
          const expectedTotal = useCartStore.getState().getExpectedTotalCup();
          const adjustments = Number((expectedTotal - subtotalCup).toFixed(2));
          const tax = taxAmount;
          return (
            <div className="mt-1 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <span>Subt. {formatCurrency(subtotalCup)} CUP</span>
              {adjustments !== 0 && (
                <span className={adjustments > 0 ? "text-amber-500" : "text-destructive"}>
                  {adjustments > 0 ? '+' : '−'}{formatCurrency(Math.abs(adjustments))}
                </span>
              )}
              {tax > 0 && <span>Imp. {formatCurrency(tax)}</span>}
            </div>
          );
        })()}
      </div>

      {/* ── EFECTIVO RECIBIDO + VUELTO ────────────────────────────── */}
      {(() => {
        const items = useCartStore.getState().items;
        // FIX-PAYMENT-ROWS: detectar cash en payments[] o legacy
        const hasCash = items.some(i =>
          (i.payments && i.payments.some(p => p.method === 'cash' && p.amount > 0))
          || (!i.payments && (i.cash_paid || 0) > 0)
        );
        if (!hasCash) return null;
        return (
        <div className="px-4 sm:px-6 py-2 border-b border-border/50 bg-success/5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCashBreakdown(true)}
              className="flex-1 min-h-[36px] rounded-lg bg-success/90 text-white dark:text-black text-[10px] font-black uppercase hover:bg-success transition-colors flex items-center justify-center gap-1.5"
            >
              <DollarSign className="w-3.5 h-3.5" /> Efectivo Recibido
            </button>
            {cashReceivedNum > 0 && (
              <div className="text-right shrink-0">
                <p className="text-[8px] font-bold uppercase text-muted-foreground">Vuelto</p>
                <p className={cn("text-sm font-black tabular-nums", change >= 0 ? "text-success" : "text-destructive")}>
                  {formatCurrency(Math.abs(change))}
                  {change < 0 && " (insuf.)"}
                </p>
              </div>
            )}
          </div>
          <input
            id="pos-cash-received"
            type="number"
            inputMode="decimal"
            placeholder="0.00"
            value={cashReceived}
            onChange={(e) => setCashReceived(e.target.value)}
            className="w-full h-9 mt-2 bg-background border border-success/30 rounded-lg px-3 text-sm font-bold text-success text-center tabular-nums outline-none focus:border-success"
            aria-label="Efectivo recibido del cliente"
          />
          <div className="flex gap-1 mt-1">
            {cashPresets.map((preset) => (
              <button key={preset} type="button" onClick={() => setCashReceived(String(preset))}
                className="flex-1 min-h-[32px] rounded bg-success/80 text-white text-[9px] font-black hover:bg-success">
                ${preset}
              </button>
            ))}
            <button type="button" onClick={() => setCashReceived(expectedTotal.toFixed(2))}
              className="flex-1 min-h-[32px] rounded bg-success text-white text-[9px] font-black hover:opacity-90">
              Exacto
            </button>
          </div>
        </div>
        );
      })()}

      {/* ── CONSOLIDADO POR MONEDA + ESTADO DE CUADRE (read-only) ────
          FIX-LAYOUT (2026-07-10): añadir al lado del consolidado un badge
          que indique si los pagos cuadran con el total esperado.
          Estados: ✓ Cuadrado / Sobrepago $X / Falta $X */}
      {(() => {
        const cartStore = useCartStore.getState();
        const consolidated = cartStore.getConsolidatedPayments();
        const currencies = Object.keys(consolidated).sort();
        if (currencies.length === 0) return null;

        // Calcular total pagado en CUP y total esperado
        const totalPaidCup = cartStore.items.reduce((s, i) => s + cartStore.getItemPaidCup(i), 0);
        const expectedTotal = cartStore.getExpectedTotalCup();
        const diff = Number((totalPaidCup - expectedTotal).toFixed(2));
        const isBalanced = Math.abs(diff) <= 0.01;

        // Determinar label del ajuste activo (ej: "+5%")
        // FIX-PAYMENT-ROWS: buscar en payments[] primero, fallback a legacy
        let adjLabel = '';
        for (const item of cartStore.items) {
          if (item.payments && item.payments.length > 0) {
            for (const p of item.payments) {
              if (p.amount > 0 && p.discount_type && p.discount_value) {
                adjLabel = ` (${p.discount_value > 0 ? '+' : ''}${p.discount_value}${p.discount_type === 'percentage' ? '%' : ''})`;
                break;
              }
            }
            if (adjLabel) break;
          } else {
            if (item.cash_paid > 0 && item.cash_discount_type && item.cash_discount_value) {
              adjLabel = ` (${item.cash_discount_value > 0 ? '+' : ''}${item.cash_discount_value}${item.cash_discount_type === 'percentage' ? '%' : ''})`;
              break;
            }
            if (item.transfer_paid > 0 && item.transfer_discount_type && item.transfer_discount_value) {
              adjLabel = ` (${item.transfer_discount_value > 0 ? '+' : ''}${item.transfer_discount_value}${item.transfer_discount_type === 'percentage' ? '%' : ''})`;
              break;
            }
            if (item.zelle_paid > 0 && item.zelle_discount_type && item.zelle_discount_value) {
              adjLabel = ` (${item.zelle_discount_value > 0 ? '+' : ''}${item.zelle_discount_value}${item.zelle_discount_type === 'percentage' ? '%' : ''})`;
              break;
            }
          }
        }

        return (
          <div className="px-4 sm:px-6 py-2 border-b border-border/50 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] uppercase text-muted-foreground font-black">Consolidado por moneda:</span>
              {/* Badge de cuadre */}
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-[9px] font-bold text-muted-foreground">
                  Esperado: {formatCurrency(expectedTotal)} CUP{adjLabel}
                </span>
                {isBalanced ? (
                  <span className="text-[10px] font-black text-emerald-500 flex items-center gap-0.5">
                    <Check className="w-3 h-3" /> Cuadrado
                  </span>
                ) : diff > 0 ? (
                  <span className="text-[10px] font-black text-amber-500 flex items-center gap-0.5">
                    <TrendingUp className="w-3 h-3" /> Sobrepago: {formatCurrency(diff)} CUP
                  </span>
                ) : (
                  <span className="text-[10px] font-black text-destructive flex items-center gap-0.5">
                    <TrendingDown className="w-3 h-3" /> Falta: {formatCurrency(Math.abs(diff))} CUP
                  </span>
                )}
              </div>
            </div>
            {currencies.map(cur => {
              const c = consolidated[cur];
              return (
                <div key={cur} className="flex items-center gap-2 text-[10px] font-bold pl-2">
                  <span className="text-muted-foreground w-8">{cur}</span>
                  {c.cash > 0 && <span className="text-success">💵{c.cash.toFixed(2)}</span>}
                  {c.transfer > 0 && <span className="text-primary">📱{c.transfer.toFixed(2)}</span>}
                  {c.zelle > 0 && <span className="text-primary">💳{c.zelle.toFixed(2)}</span>}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ── DESCUENTO + RECARGO (read-only, lado a lado) ───────────
          FIX-LAYOUT (2026-07-10): unir Descuento y Recargo en una sola
          fila con 2 columnas para ahorrar espacio vertical.
          FIX-PAYMENT-ROWS (2026-07-10): ahora itera sobre payments[]
          para soportar múltiples filas del mismo método. */}
      {(() => {
        const items = useCartStore.getState().items;
        // Construir lista plana de ajustes: {itemName, methodIcon, method, value, type, isDiscount}
        type Adj = { itemKey: string; itemName: string; method: 'cash' | 'transfer' | 'zelle'; value: number; dtype: 'percentage' | 'fixed' };
        const discounts: Adj[] = [];
        const surcharges: Adj[] = [];
        for (const item of items) {
          // FIX-PAYMENT-ROWS: iterar payments[]
          if (item.payments && item.payments.length > 0) {
            for (const p of item.payments) {
              if (p.discount_type && p.discount_value) {
                const adj: Adj = {
                  itemKey: `${item.product_id}-${p.id}`,
                  itemName: item.product.name,
                  method: p.method,
                  value: p.discount_value,
                  dtype: p.discount_type,
                };
                if (p.discount_value < 0) discounts.push(adj);
                else if (p.discount_value > 0) surcharges.push(adj);
              }
            }
          } else {
            // Fallback legacy
            if (item.cash_discount_type && item.cash_discount_value < 0) {
              discounts.push({ itemKey: `${item.product_id}-cash`, itemName: item.product.name, method: 'cash', value: item.cash_discount_value, dtype: item.cash_discount_type });
            }
            if (item.transfer_discount_type && item.transfer_discount_value < 0) {
              discounts.push({ itemKey: `${item.product_id}-transfer`, itemName: item.product.name, method: 'transfer', value: item.transfer_discount_value, dtype: item.transfer_discount_type });
            }
            if (item.zelle_discount_type && item.zelle_discount_value < 0) {
              discounts.push({ itemKey: `${item.product_id}-zelle`, itemName: item.product.name, method: 'zelle', value: item.zelle_discount_value, dtype: item.zelle_discount_type });
            }
            if (item.cash_discount_type && item.cash_discount_value > 0) {
              surcharges.push({ itemKey: `${item.product_id}-cash`, itemName: item.product.name, method: 'cash', value: item.cash_discount_value, dtype: item.cash_discount_type });
            }
            if (item.transfer_discount_type && item.transfer_discount_value > 0) {
              surcharges.push({ itemKey: `${item.product_id}-transfer`, itemName: item.product.name, method: 'transfer', value: item.transfer_discount_value, dtype: item.transfer_discount_type });
            }
            if (item.zelle_discount_type && item.zelle_discount_value > 0) {
              surcharges.push({ itemKey: `${item.product_id}-zelle`, itemName: item.product.name, method: 'zelle', value: item.zelle_discount_value, dtype: item.zelle_discount_type });
            }
          }
        }
        if (discounts.length === 0 && surcharges.length === 0) return null;

        const methodIcon = (m: string) => m === 'cash' ? '💵' : m === 'transfer' ? '📱' : '💳';
        const renderAdjustments = (list: Adj[], isDiscount: boolean) => {
          if (list.length === 0) {
            return <span className="text-[9px] text-muted-foreground/50 italic">—</span>;
          }
          return list.map(adj => (
            <div key={adj.itemKey} className="text-[9px] font-bold">
              <span className="text-muted-foreground">{adj.itemName}:</span>
              <span className={cn("ml-1", isDiscount ? "text-destructive" : "text-amber-500")}>
                {methodIcon(adj.method)} {isDiscount ? '' : '+'}{adj.value}{adj.dtype === 'percentage' ? '%' : ''}
              </span>
            </div>
          ));
        };

        return (
          <div className="px-4 sm:px-6 py-2 border-b border-border/50">
            <div className="grid grid-cols-2 gap-3">
              {/* Columna Descuento */}
              <div className="space-y-0.5">
                <div className="flex items-center gap-1 text-[10px] font-black">
                  <TrendingDown className="w-3 h-3 text-destructive" />
                  <span className="uppercase text-destructive">Descuento</span>
                </div>
                {renderAdjustments(discounts, true)}
              </div>
              {/* Columna Recargo */}
              <div className="space-y-0.5 border-l border-border/30 pl-3">
                <div className="flex items-center gap-1 text-[10px] font-black">
                  <TrendingUp className="w-3 h-3 text-amber-500" />
                  <span className="uppercase text-amber-500">Recargo</span>
                </div>
                {renderAdjustments(surcharges, false)}
              </div>
            </div>
          </div>
        );
      })()}

      {/* POS-3a-v3: El CTA "Cobrar" gigante se movió al POSCart externo (siempre visible abajo).
          Aquí solo conservamos el modal de confirmación, disparado por el botón oculto
          #pos-checkout-cta desde el CTA externo. */}

      {/* POS-3b audit P0.3: Modal accesible con focus trap + role=dialog.
          Antes era un raw <div> overlay sin ARIA ni focus management. */}
      <POSPortalModal
        open={showCheckoutConfirm}
        onClose={() => setShowCheckoutConfirm(false)}
        title="Confirmar Venta"
      >
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-2xl font-black text-primary tabular-nums">
              {formatCurrency(expectedTotal)}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              {itemCount} {itemCount === 1 ? "producto" : "productos"} ·{" "}
              <strong className="text-foreground">{getPaymentLabel(selectedPayment)}</strong>
            </p>
            {selectedPayment === "cash" && cashReceivedNum > 0 && change >= 0 && (
              <p className="text-xs text-success mt-1 font-bold">
                Vuelto: {formatCurrency(change)}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowCheckoutConfirm(false)}
              className="flex-1 h-12 rounded-xl border border-border text-xs font-black uppercase tracking-widest hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmCheckout}
              disabled={isProcessing}
              className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {isProcessing ? "Procesando..." : "Confirmar"}
            </button>
          </div>
        </div>
      </POSPortalModal>

      {/* FIX-CASH-BREAKDOWN (2026-07-10): modal de desglose por billetes/monedas */}
      <POSPortalModal
        open={showCashBreakdown}
        onClose={() => setShowCashBreakdown(false)}
        title="Efectivo Recibido"
      >
        <div className="space-y-3">
          {/* Tabs */}
          <div className="flex gap-1 bg-muted/20 p-0.5 rounded-lg">
            <button onClick={() => setBreakdownTab('count')}
              className={cn("flex-1 py-1.5 rounded text-[10px] font-black uppercase", breakdownTab === 'count' ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
              Contar
            </button>
            <button onClick={() => setBreakdownTab('config')}
              className={cn("flex-1 py-1.5 rounded text-[10px] font-black uppercase", breakdownTab === 'config' ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
              Configurar
            </button>
          </div>

          {breakdownTab === 'count' ? (
            <>
              {/* Tab contar: billetes/monedas activos */}
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto no-scrollbar">
                {denominations.filter(d => d.active).map(d => (
                  <div key={d.value} className="flex items-center gap-2">
                    <span className="w-16 text-xs font-black text-right">{d.label}</span>
                    <span className="text-[9px] text-muted-foreground">×</span>
                    <input
                      type="number"
                      min="0"
                      value={cashBreakdown[String(d.value)] || ''}
                      onChange={(e) => setCashBreakdown(prev => {
                        const next = { ...prev };
                        const val = parseInt(e.target.value) || 0;
                        if (val > 0) next[String(d.value)] = val;
                        else delete next[String(d.value)];
                        return next;
                      })}
                      className="w-16 bg-background border border-border/50 rounded px-2 py-1.5 text-xs font-bold text-center"
                      placeholder="0"
                      aria-label={`Cantidad de billetes de ${d.label}`}
                    />
                    <span className="text-[9px] text-muted-foreground flex-1">
                      = {formatCurrency((cashBreakdown[String(d.value)] || 0) * d.value)}
                    </span>
                  </div>
                ))}
              </div>
              {/* Total + Vuelto */}
              <div className="border-t border-border/30 pt-2 space-y-1">
                <div className="flex justify-between text-xs font-black">
                  <span>Total recibido:</span>
                  <span className="text-success tabular-nums">{formatCurrency(cashBreakdownTotal)}</span>
                </div>
                <div className="flex justify-between text-xs font-black">
                  <span>Total venta:</span>
                  <span className="tabular-nums">{formatCurrency(useCartStore.getState().getExpectedTotalCup())}</span>
                </div>
                <div className="flex justify-between text-sm font-black">
                  <span>Vuelto:</span>
                  <span className={cn("tabular-nums", cashBreakdownTotal - useCartStore.getState().getExpectedTotalCup() >= 0 ? "text-success" : "text-destructive")}>
                    {formatCurrency(Math.abs(cashBreakdownTotal - useCartStore.getState().getExpectedTotalCup()))}
                    {cashBreakdownTotal < useCartStore.getState().getExpectedTotalCup() && " (insuf.)"}
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  setCashReceived(String(cashBreakdownTotal.toFixed(2)));
                  setShowCashBreakdown(false);
                }}
                className="w-full h-10 rounded-xl bg-success text-white text-xs font-black uppercase hover:opacity-90"
              >
                Confirmar
              </button>
            </>
          ) : (
            /* Tab configurar: activar/desactivar billetes */
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground">Activa los billetes/monedas que usas:</p>
              {denominations.map(d => (
                <div key={d.value} className="flex items-center gap-2">
                  <button
                    onClick={() => setDenominations(prev => prev.map(x => x.value === d.value ? { ...x, active: !x.active } : x))}
                    className={cn("flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all",
                      d.active ? "bg-primary/10 border-primary text-primary" : "bg-muted/20 border-border text-muted-foreground"
                    )}
                  >
                    {d.label}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </POSPortalModal>
    </div>
  );
}
