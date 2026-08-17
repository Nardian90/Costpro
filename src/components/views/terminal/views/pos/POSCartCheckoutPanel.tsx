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
  Plus,
  Minus,
  RotateCcw,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { useCartStore } from "@/store/cart";
import { POSPortalModal } from "./POSPortalModal";
import { PaymentMethodSelector, getPaymentLabel as getPaymentLabelUnified } from "./PaymentMethodSelector";
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

// V2.12.31: PAYMENT_METHODS local y getPaymentLabel eliminados.
// Ahora usamos PaymentMethodSelector + getPaymentLabel de PaymentMethodSelector.tsx
// (single source of truth). Esto resuelve la fragmentación de 3 flujos de checkout
// que cada uno implementaba su propio array de métodos con look&feel diferente.
//
// Antes este archivo solo tenía 3 métodos (cash, transfer, zelle) — SIN 'mixed'.
// Ahora hereda los 4 del PaymentMethodSelector (cash, transfer, zelle, mixed),
// permitiendo ventas mixtas desde este flujo (antes solo posible en POSExpressMode).

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
  // separado por moneda. Cada moneda tiene su propio desglose y total.
  const [showCashBreakdown, setShowCashBreakdown] = useState(false);
  // breakdown por moneda: { 'CUP': { '1000': 2, '500': 1 }, 'USD': { '20': 1 } }
  const [cashBreakdownByCurrency, setCashBreakdownByCurrency] = useState<Record<string, Record<string, number>>>({});
  // moneda activa en el modal (tab)
  const [breakdownCurrency, setBreakdownCurrency] = useState<string>('CUP');
  const [breakdownTab, setBreakdownTab] = useState<'count' | 'config'>('count');
  // FIX-ACCORDION: acordeón contraído por defecto para sección de efectivo
  const [cashAccordionOpen, setCashAccordionOpen] = useState(false);

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

  // FIX-CASH-BREAKDOWN (2026-07-10): totales de efectivo por moneda (solo cash, no transfer/zelle)
  const cashTotalsByCurrency = useCartStore.getState().getCashTotalsByCurrency();
  const cashCurrencies = Object.keys(cashTotalsByCurrency).sort();
  const totalCashCup = cashCurrencies.reduce((sum, cur) => {
    const amt = cashTotalsByCurrency[cur];
    if (cur === 'CUP') return sum + amt;
    const rate = useCartStore.getState().globalRates[cur] || 1;
    return sum + amt * rate;
  }, 0);

  // Suma del desglose de billetes por moneda activa
  const currentBreakdown = cashBreakdownByCurrency[breakdownCurrency] || {};
  const cashBreakdownTotal = Object.entries(currentBreakdown).reduce((s, [denom, count]) => {
    return s + (parseFloat(denom) * count);
  }, 0);
  // Total del desglose en CUP (para comparar con el total de efectivo en CUP)
  const cashBreakdownTotalCup = cashCurrencies.reduce((sum, cur) => {
    const bd = cashBreakdownByCurrency[cur] || {};
    const curTotal = Object.entries(bd).reduce((s, [denom, count]) => s + (parseFloat(denom) * count), 0);
    if (cur === 'CUP') return sum + curTotal;
    const rate = useCartStore.getState().globalRates[cur] || 1;
    return sum + curTotal * rate;
  }, 0);

  const taxAmount = getTaxAmount?.() ?? 0;
  const cashReceivedNum = parseFloat(cashReceived) || 0;
  // FIX-CONSISTENCY (2026-07-10): el vuelto y todos los montos se calculan contra
  // el total esperado (con recargos/descuentos por método), no contra getTotal()
  // que puede tener un descuento global fantasma restado.
  const expectedTotal = useCartStore.getState().getExpectedTotalCup();
  // FIX-CASH-BREAKDOWN: el vuelto se calcula contra el efectivo total (en CUP),
  // NO contra el total de la venta. Si hay transfer/zelle, no se incluyen en el vuelto.
  const change = cashReceivedNum > 0 ? cashReceivedNum - totalCashCup : 0;
  const cashPresets = [20, 50, 100, 200];

  // ── DENOMINATION BREAKDOWN helpers (component scope, not IIFE) ──
  const activeDenoms = denominations.filter(d => d.active);
  const cupBreakdown = cashBreakdownByCurrency['CUP'] || {};
  const breakdownTotal = activeDenoms.reduce((s, d) => {
    const count = cupBreakdown[String(d.value)] || 0;
    return s + d.value * count;
  }, 0);
  const breakdownVuelto = breakdownTotal - totalCashCup;
  const breakdownFaltante = totalCashCup - breakdownTotal;

  // Recalculate total from breakdown and sync to cashReceived
  const syncCashFromBreakdown = (newCupBreakdown: Record<string, number>) => {
    const newTotal = activeDenoms.reduce((s, d) => {
      const c = newCupBreakdown[String(d.value)] || 0;
      return s + d.value * c;
    }, 0);
    setCashReceived(newTotal > 0 ? String(newTotal.toFixed(2)) : "");
  };

  const updateBreakdown = (denomValue: number, delta: number) => {
    setCashBreakdownByCurrency(prev => {
      const next = { ...prev };
      const curBd = { ...(next['CUP'] || {}) };
      const key = String(denomValue);
      const current = curBd[key] || 0;
      const newVal = Math.max(0, current + delta);
      if (newVal > 0) curBd[key] = newVal;
      else delete curBd[key];
      next['CUP'] = curBd;
      syncCashFromBreakdown(curBd);
      return next;
    });
  };

  const setBreakdownQty = (denomValue: number, qty: number) => {
    setCashBreakdownByCurrency(prev => {
      const next = { ...prev };
      const curBd = { ...(next['CUP'] || {}) };
      const key = String(denomValue);
      const val = Math.max(0, Math.floor(qty));
      if (val > 0) curBd[key] = val;
      else delete curBd[key];
      next['CUP'] = curBd;
      syncCashFromBreakdown(curBd);
      return next;
    });
  };

  const clearBreakdown = () => {
    setCashBreakdownByCurrency(prev => ({ ...prev, CUP: {} }));
    setCashReceived("");
  };

  // FIX-EXACTO: algoritmo greedy para descomponer un importe en denominaciones
  // Prioriza denominaciones mayores primero: 1000 → 500 → 200 → 100 → 50 → 20 → 10 → 5 → 1
  const exactoBreakdown = () => {
    const targetAmount = Math.floor(totalCashCup);
    const newBd: Record<string, number> = {};
    let remaining = targetAmount;
    for (const d of activeDenoms) {
      if (remaining <= 0) break;
      const count = Math.floor(remaining / d.value);
      if (count > 0) {
        newBd[String(d.value)] = count;
        remaining -= count * d.value;
      }
    }
    // Si hay centavos que no se pueden representar con denominaciones disponibles,
    // el total del desglose será ligeramente menor. En ese caso, redondear hacia
    // arriba añadiendo 1 unidad de la denominación más pequeña disponible para
    // garantizar que el efectivo recibido >= total a cobrar.
    const breakdownSum = activeDenoms.reduce((s, d) => s + d.value * (newBd[String(d.value)] || 0), 0);
    if (breakdownSum < totalCashCup && activeDenoms.length > 0) {
      const smallest = activeDenoms[activeDenoms.length - 1];
      newBd[String(smallest.value)] = (newBd[String(smallest.value)] || 0) + 1;
    }
    setCashBreakdownByCurrency(prev => ({ ...prev, CUP: newBd }));
    const finalTotal = activeDenoms.reduce((s, d) => s + d.value * (newBd[String(d.value)] || 0), 0);
    setCashReceived(finalTotal > 0 ? String(finalTotal.toFixed(2)) : "");
  };

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

      {/* ── MÉTODO DE PAGO (V2.12.31) ──────────────────────────────
          Antes este panel NO tenía UI para cambiar el método de pago — el cajero
          solo podía usar el que venía por defecto. Ahora usa PaymentMethodSelector
          variante 'full' (4 botones grandes con iconos: Efectivo, Transferencia,
          Zelle, Mixto). 'mixed' antes no estaba disponible en este flujo. */}
      <div className="px-4 sm:px-6 py-3 border-b border-border/50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] sm:text-xs font-black uppercase text-muted-foreground tracking-widest">
            Método de pago
          </span>
          {selectedPayment === 'mixed' && (
            <span className="text-[10px] font-bold text-amber-500 uppercase">
              {useCartStore.getState().isPaymentModeByProduct() ? 'Por producto' : 'Global'}
            </span>
          )}
        </div>
        <PaymentMethodSelector
          value={selectedPayment}
          onChange={onSetSelectedPayment}
          variant="full"
          ariaLabel="Seleccionar método de pago para la venta"
        />
      </div>

      {/* ── EFECTIVO RECIBIDO + VUELTO (ACCORDION) ─────────────────
          FIX-ACCORDION: contraído por defecto. Muestra total recibido y a cobrar
          en el header. Al expandir, muestra desglose por denominaciones. */}
      {(() => {
        const items = useCartStore.getState().items;
        const hasCash = items.some(i =>
          (i.payments && i.payments.some(p => p.method === 'cash' && p.amount > 0))
          || (!i.payments && (i.cash_paid || 0) > 0)
        );
        if (!hasCash) return null;

        return (
        <div className="px-4 sm:px-6 border-b border-border/50 bg-success/5">
          {/* ── ACCORDION HEADER (always visible) ── */}
          <button
            type="button"
            onClick={() => setCashAccordionOpen(prev => !prev)}
            className="w-full flex items-center justify-between gap-2 py-2"
            aria-expanded={cashAccordionOpen}
            aria-controls="cash-breakdown-content"
          >
            <div className="flex items-center gap-1.5">
              {cashAccordionOpen ? (
                <ChevronDown className="w-3.5 h-3.5 text-success" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-success" />
              )}
              <DollarSign className="w-3.5 h-3.5 text-success" />
              <span className="text-[10px] font-black uppercase text-success tracking-widest">Efectivo CUP</span>
            </div>
            <div className="flex items-center gap-3">
              {/* Always show total recibido + a cobrar in header */}
              <div className="text-right">
                <span className="text-[9px] font-bold uppercase text-muted-foreground">Recibido:</span>
                <span className="ml-1 text-[11px] font-black text-success tabular-nums">{formatCurrency(breakdownTotal)}</span>
              </div>
              <div className="text-right">
                <span className="text-[9px] font-bold uppercase text-muted-foreground">A cobrar:</span>
                <span className="ml-1 text-[11px] font-black tabular-nums">{formatCurrency(totalCashCup)}</span>
              </div>
              {/* Vuelto/Faltante badge in header when total > 0 */}
              {breakdownTotal > 0 && (
                <div className="text-right">
                  {breakdownVuelto >= 0 ? (
                    <>
                      <span className="text-[9px] font-bold uppercase text-muted-foreground">Vuelto:</span>
                      <span className="ml-1 text-[11px] font-black text-success tabular-nums">{formatCurrency(breakdownVuelto)}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-[9px] font-bold uppercase text-destructive">Faltante:</span>
                      <span className="ml-1 text-[11px] font-black text-destructive tabular-nums">{formatCurrency(breakdownFaltante)}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </button>

          {/* ── ACCORDION CONTENT (collapsible) ── */}
          {cashAccordionOpen && (
            <div id="cash-breakdown-content" className="pb-2 space-y-1.5">
              {/* Denomination breakdown — inline grid */}
              <div className="space-y-1 max-h-[200px] overflow-y-auto no-scrollbar">
                {activeDenoms.map(d => {
                  const denomKey = String(d.value);
                  const count = cupBreakdown[denomKey] || 0;
                  const importe = d.value * count;
                  return (
                    <div key={d.value} className="flex items-center gap-1.5">
                      {/* Tap denomination label to increment */}
                      <button
                        type="button"
                        onClick={() => updateBreakdown(d.value, 1)}
                        className={cn(
                          "w-14 h-8 rounded-lg text-[10px] font-black flex items-center justify-center shrink-0 transition-all active:scale-95",
                          count > 0
                            ? "bg-success text-white"
                            : "bg-success/10 text-success border border-success/20 hover:bg-success/20"
                        )}
                        aria-label={`Agregar billete de ${d.label}`}
                      >
                        {d.label}
                      </button>
                      {/* Decrement button */}
                      <button
                        type="button"
                        onClick={() => updateBreakdown(d.value, -1)}
                        disabled={count === 0}
                        className="w-6 h-8 rounded bg-muted/50 flex items-center justify-center shrink-0 disabled:opacity-30"
                        aria-label={`Quitar billete de ${d.label}`}
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      {/* Quantity (editable) */}
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={count || ''}
                        onChange={(e) => setBreakdownQty(d.value, parseInt(e.target.value) || 0)}
                        className="w-10 h-8 bg-background border border-border/50 rounded text-[11px] font-bold text-center tabular-nums outline-none focus:border-success"
                        placeholder="0"
                        aria-label={`Cantidad de billetes de ${d.label}`}
                      />
                      {/* Increment button */}
                      <button
                        type="button"
                        onClick={() => updateBreakdown(d.value, 1)}
                        className="w-6 h-8 rounded bg-muted/50 flex items-center justify-center shrink-0"
                        aria-label={`Agregar billete de ${d.label}`}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      {/* Importe */}
                      <span className="flex-1 text-[10px] font-bold text-muted-foreground text-right tabular-nums">
                        {count > 0 ? `= ${formatCurrency(importe)}` : ''}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Totals */}
              <div className="pt-1.5 border-t border-border/30 space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-muted-foreground">Total recibido:</span>
                  <span className="text-sm font-black text-success tabular-nums">{formatCurrency(breakdownTotal)} CUP</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-muted-foreground">A cobrar:</span>
                  <span className="text-[10px] font-bold tabular-nums">{formatCurrency(totalCashCup)} CUP</span>
                </div>
                {breakdownTotal > 0 && (
                  <div className="flex items-center justify-between">
                    {breakdownVuelto >= 0 ? (
                      <>
                        <span className="text-[11px] font-black text-success">Vuelto:</span>
                        <span className="text-[11px] font-black text-success tabular-nums">{formatCurrency(breakdownVuelto)} CUP</span>
                      </>
                    ) : (
                      <>
                        <span className="text-[11px] font-black text-destructive">Faltante:</span>
                        <span className="text-[11px] font-black text-destructive tabular-nums">{formatCurrency(breakdownFaltante)} CUP</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-1 mt-1.5">
                <button type="button" onClick={clearBreakdown}
                  className="flex-1 min-h-[28px] rounded bg-muted/50 text-muted-foreground text-[9px] font-black uppercase hover:bg-muted flex items-center justify-center gap-1">
                  <RotateCcw className="w-3 h-3" /> Limpiar
                </button>
                <button type="button" onClick={exactoBreakdown}
                  className="flex-1 min-h-[28px] rounded bg-success text-white text-[9px] font-black uppercase hover:opacity-90">
                  Exacto
                </button>
                {cashCurrencies.length > 1 && (
                  <button type="button" onClick={() => { setBreakdownCurrency(cashCurrencies[0]); setShowCashBreakdown(true); }}
                    className="flex-1 min-h-[28px] rounded bg-success/20 text-success border border-success/30 text-[9px] font-black uppercase hover:bg-success/30">
                    Multi-moneda
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Hidden input for backward compat (cashReceived is still the source of truth) */}
          <input type="hidden" id="pos-cash-received" value={cashReceived} />
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
              <strong className="text-foreground">{getPaymentLabelUnified(selectedPayment)}</strong>
            </p>
            {selectedPayment === "cash" && cashReceivedNum > 0 && change >= 0 && (
              <p className="text-xs text-success mt-1 font-bold">
                Vuelto: {formatCurrency(change)}
              </p>
            )}
            {selectedPayment === "cash" && cashReceivedNum > 0 && change < 0 && (
              <p className="text-xs text-destructive mt-1 font-bold">
                Faltante: {formatCurrency(Math.abs(change))}
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

      {/* FIX-CASH-BREAKDOWN (2026-07-10): modal de desglose por billetes/monedas
          separado por moneda. Cada moneda tiene su propio tab, su propio desglose
          de billetes, y valida contra el total de efectivo de ESA moneda.
          NO incluye transfer ni zelle. */}
      <POSPortalModal
        open={showCashBreakdown}
        onClose={() => setShowCashBreakdown(false)}
        title="Efectivo Recibido"
      >
        <div className="space-y-3">
          {/* Tabs de moneda (si hay más de una moneda cash) */}
          {cashCurrencies.length > 1 && (
            <div className="flex gap-1 bg-muted/20 p-0.5 rounded-lg">
              {cashCurrencies.map(cur => (
                <button
                  key={cur}
                  onClick={() => setBreakdownCurrency(cur)}
                  className={cn("flex-1 py-1.5 rounded text-[10px] font-black uppercase",
                    breakdownCurrency === cur ? "bg-success text-white" : "text-muted-foreground"
                  )}
                >
                  {cur} · {formatCurrency(cashTotalsByCurrency[cur])}
                </button>
              ))}
            </div>
          )}

          {/* Sub-tabs: Contar / Configurar */}
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

          {/* Mostrar total de efectivo de la moneda activa */}
          <div className="bg-muted/20 rounded-lg px-3 py-2 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-muted-foreground">
              Efectivo a recibir ({breakdownCurrency}):
            </span>
            <span className="text-sm font-black text-success tabular-nums">
              {formatCurrency(cashTotalsByCurrency[breakdownCurrency] || 0)} {breakdownCurrency}
            </span>
          </div>

          {breakdownTab === 'count' ? (
            <>
              {/* Tab contar: billetes/monedas activos */}
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto no-scrollbar">
                {denominations.filter(d => d.active).map(d => {
                  const denomKey = String(d.value);
                  const currentCount = currentBreakdown[denomKey] || 0;
                  return (
                    <div key={d.value} className="flex items-center gap-2">
                      <span className="w-16 text-xs font-black text-right">{d.label}</span>
                      <span className="text-[9px] text-muted-foreground">×</span>
                      <input
                        type="number"
                        min="0"
                        value={currentCount || ''}
                        onChange={(e) => setCashBreakdownByCurrency(prev => {
                          const next = { ...prev };
                          const curBd = { ...(next[breakdownCurrency] || {}) };
                          const val = parseInt(e.target.value) || 0;
                          if (val > 0) curBd[denomKey] = val;
                          else delete curBd[denomKey];
                          next[breakdownCurrency] = curBd;
                          return next;
                        })}
                        className="w-16 bg-background border border-border/50 rounded px-2 py-1.5 text-xs font-bold text-center"
                        placeholder="0"
                        aria-label={`Cantidad de billetes de ${d.label} en ${breakdownCurrency}`}
                      />
                      <span className="text-[9px] text-muted-foreground flex-1">
                        = {formatCurrency(currentCount * d.value)} {breakdownCurrency}
                      </span>
                    </div>
                  );
                })}
              </div>
              {/* Total + Vuelto por moneda activa */}
              <div className="border-t border-border/30 pt-2 space-y-1">
                <div className="flex justify-between text-xs font-black">
                  <span>Total contado ({breakdownCurrency}):</span>
                  <span className="text-success tabular-nums">{formatCurrency(cashBreakdownTotal)} {breakdownCurrency}</span>
                </div>
                <div className="flex justify-between text-xs font-black">
                  <span>Efectivo a recibir ({breakdownCurrency}):</span>
                  <span className="tabular-nums">{formatCurrency(cashTotalsByCurrency[breakdownCurrency] || 0)} {breakdownCurrency}</span>
                </div>
                <div className="flex justify-between text-sm font-black">
                  <span>Diferencia ({breakdownCurrency}):</span>
                  <span className={cn("tabular-nums",
                    cashBreakdownTotal - (cashTotalsByCurrency[breakdownCurrency] || 0) >= 0 ? "text-success" : "text-destructive"
                  )}>
                    {formatCurrency(Math.abs(cashBreakdownTotal - (cashTotalsByCurrency[breakdownCurrency] || 0)))} {breakdownCurrency}
                    {cashBreakdownTotal < (cashTotalsByCurrency[breakdownCurrency] || 0) && " (insuf.)"}
                  </span>
                </div>
                {/* Si hay múltiples monedas, mostrar total consolidado en CUP */}
                {cashCurrencies.length > 1 && (
                  <div className="border-t border-border/30 pt-1 mt-1 space-y-1">
                    <div className="flex justify-between text-xs font-bold text-muted-foreground">
                      <span>Total desglose (CUP):</span>
                      <span className="tabular-nums">{formatCurrency(cashBreakdownTotalCup)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-bold text-muted-foreground">
                      <span>Total efectivo (CUP):</span>
                      <span className="tabular-nums">{formatCurrency(totalCashCup)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-black">
                      <span>Vuelto total (CUP):</span>
                      <span className={cn("tabular-nums", cashBreakdownTotalCup - totalCashCup >= 0 ? "text-success" : "text-destructive")}>
                        {formatCurrency(Math.abs(cashBreakdownTotalCup - totalCashCup))}
                        {cashBreakdownTotalCup < totalCashCup && " (insuf.)"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  // FIX-CASH-BREAKDOWN: el "cashReceived" del input principal se setea
                  // al total del desglose en CUP (para consolidar con transfer/zelle)
                  setCashReceived(String(cashBreakdownTotalCup.toFixed(2)));
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
