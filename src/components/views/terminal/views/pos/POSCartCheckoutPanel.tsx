"use client";

import React, { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  DollarSign,
  CreditCard,
  Wallet,
  Smartphone,
  Send,
  ChevronDown,
  ChevronUp,
  Tag,
  AlertTriangle,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { useCartStore } from "@/store/cart";
import { POSCartDiscountModal } from "./POSCartDiscountModal";
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
  const [showMixedPayment, setShowMixedPayment] = useState(false);
  const [showDiscountSection, setShowDiscountSection] = useState(false);
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

  const total = getTotal();
  const subtotal = getSubtotal();
  const discountAmount = getDiscountAmount();
  const taxAmount = getTaxAmount?.() ?? 0;
  const cashReceivedNum = parseFloat(cashReceived) || 0;
  const change = cashReceivedNum > 0 ? cashReceivedNum - total : 0;
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
          <span className="text-[clamp(1.75rem,7vw,2.5rem)] font-black text-primary tracking-tighter leading-none tabular-nums">
            {formatCurrency(useCartStore.getState().getTotalCup())}
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
                Total CUP: {formatCurrency(useCartStore.getState().getTotalCup())}
              </span>
            </div>
          );
        })()}
        {/* Desglose compacto */}
        <div className="mt-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          <span>Subt. {formatCurrency(useCartStore.getState().getSubtotalCup())} CUP</span>
          {discountAmount > 0 && (
            <span className="text-destructive">−{formatCurrency(discountAmount)}</span>
          )}
          {taxAmount > 0 && <span>Imp. {formatCurrency(taxAmount)}</span>}
        </div>
      </div>

      {/* ── MÉTODOS DE PAGO (iconos en una línea, read-only de lo configurado por producto) ─── */}
      <div className="px-4 sm:px-6 py-2 border-b border-border/50">
        {(() => {
          // FIX-CONSOLIDATE (2026-07-10): mostrar solo métodos usados en productos
          const consolidated = useCartStore.getState().getConsolidatedPayments();
          const modeByProduct = useCartStore.getState().isPaymentModeByProduct();
          const usedMethods: string[] = [];
          for (const [cur, methods] of Object.entries(consolidated)) {
            if (methods.cash > 0) usedMethods.push('cash');
            if (methods.transfer > 0) usedMethods.push('transfer');
            if (methods.zelle > 0) usedMethods.push('zelle');
          }
          const uniqueMethods = [...new Set(usedMethods)];

          return (
            <div className="flex items-center gap-2">
              {/* Métodos usados (read-only si ya configurados por producto) */}
              {modeByProduct && uniqueMethods.length > 0 ? (
                <>
                  <span className="text-[9px] font-bold uppercase text-muted-foreground shrink-0">Pagos:</span>
                  {uniqueMethods.map(m => {
                    const method = PAYMENT_METHODS.find(p => p.id === m);
                    if (!method) return null;
                    const Icon = method.icon;
                    return (
                      <div key={m} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-muted/30 text-[10px] font-bold">
                        <Icon className="w-3 h-3" />
                        <span>{method.short}</span>
                      </div>
                    );
                  })}
                  {/* Consolidación por moneda */}
                  {Object.entries(consolidated).map(([cur, m]) => (
                    <div key={cur} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/5 text-[9px] font-bold">
                      <span className="text-muted-foreground">{cur}:</span>
                      {m.cash > 0 && <span className="text-success">{m.cash.toFixed(0)}</span>}
                      {m.transfer > 0 && <span className="text-primary">{m.transfer.toFixed(0)}</span>}
                      {m.zelle > 0 && <span className="text-primary">{m.zelle.toFixed(0)}</span>}
                    </div>
                  ))}
                </>
              ) : (
                /* Selectores normales (cuando no hay pagos por producto) */
                <>
                  {PAYMENT_METHODS.map((method) => {
                    const Icon = method.icon;
                    const isActive = selectedPayment === method.id;
                    return (
                      <button
                        key={method.id}
                        type="button"
                        onClick={() => onSetSelectedPayment(method.id)}
                        className={cn(
                          "flex-1 min-h-[36px] rounded-lg flex items-center justify-center gap-1 border transition-all",
                          isActive
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/40"
                        )}
                        role="radio"
                        aria-checked={isActive}
                        aria-label={method.label}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          );
        })()}
      </div>

      {/* ── EFECTIVO RECIBIDO + VUELTO (si cash) ──────────────────── */}
      {selectedPayment === "cash" && !useCartStore.getState().isPaymentModeByProduct() && (
        <div className="px-4 sm:px-6 py-2 border-b border-border/50 bg-success/5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCashBreakdown && setShowCashBreakdown(true)}
              className="flex-1 min-h-[36px] rounded-lg bg-success/90 text-white dark:text-black text-[10px] font-black uppercase hover:bg-success transition-colors flex items-center justify-center gap-1.5"
            >
              <DollarSign className="w-3.5 h-3.5" /> Efectivo Recibido
            </button>
            {cashReceivedNum > 0 && (
              <div className="flex items-center gap-2 shrink-0">
                <div className="text-right">
                  <p className="text-[8px] font-bold uppercase text-muted-foreground">Vuelto</p>
                  <p className={cn("text-sm font-black tabular-nums", change >= 0 ? "text-success" : "text-destructive")}>
                    {formatCurrency(Math.abs(change))}
                    {change < 0 && " (insuf.)"}
                  </p>
                </div>
              </div>
            )}
          </div>
          {/* Input rápido opcional */}
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
            <button type="button" onClick={() => setCashReceived(total.toFixed(2))}
              className="flex-1 min-h-[32px] rounded bg-success text-white text-[9px] font-black hover:opacity-90">
              Exacto
            </button>
          </div>
        </div>
      )}

      {/* ── CONSOLIDACIÓN DE PAGOS (read-only, siempre visible) ────── */}
      <div className="px-4 sm:px-6 py-2 border-b border-border/50">
        {(() => {
          const consolidated = useCartStore.getState().getConsolidatedPayments();
          const currencies = Object.keys(consolidated).sort();
          if (currencies.length === 0) return null;
          return (
            <div className="space-y-1">
              <p className="text-[9px] font-black uppercase text-muted-foreground">Consolidado por tipo de pago</p>
              {currencies.map(cur => {
                const c = consolidated[cur];
                return (
                  <div key={cur} className="flex items-center gap-2 text-[10px] font-bold">
                    <span className="text-muted-foreground w-8">{cur}</span>
                    {c.cash > 0 && <span className="text-success">💵 {c.cash.toFixed(2)}</span>}
                    {c.transfer > 0 && <span className="text-primary">📱 {c.transfer.toFixed(2)}</span>}
                    {c.zelle > 0 && <span className="text-primary">💳 {c.zelle.toFixed(2)}</span>}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* ── DESCUENTO / RECARGO GLOBAL (accordion) ────────────────── */}
      <div className="px-4 sm:px-6 py-2 border-b border-border/50">
        <button
          type="button"
          onClick={() => setShowDiscountSection(!showDiscountSection)}
          className="w-full flex items-center justify-between py-2 text-xs font-black uppercase text-muted-foreground tracking-widest hover:text-primary"
          aria-expanded={showDiscountSection}
          aria-controls="pos-discount-section"
        >
          <span className="flex items-center gap-2">
            <Tag className="w-3.5 h-3.5" aria-hidden="true" />
            Ajuste
            {discount && discount.value > 0 && (
              <span className={cn("px-1.5 py-0.5 rounded text-[9px]", discount.value < 0 ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-500")}>
                {discount.value < 0 ? `${discount.value}` : `+${discount.value}`}{discount.type === "percentage" ? "%" : ""}
              </span>
            )}
          </span>
          {showDiscountSection ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        <AnimatePresence>
          {showDiscountSection && (
            <motion.div
              id="pos-discount-section"
              initial={{ height: 0, opacity: 0 }}
              animate={prefersReducedMotion ? {} : { height: "auto", opacity: 1 }}
              exit={prefersReducedMotion ? {} : { height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pb-3">
                <POSCartDiscountModal discount={discount} setDiscount={setDiscount} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

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
              {formatCurrency(total)}
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
                  <span className="tabular-nums">{formatCurrency(useCartStore.getState().getTotalCup())}</span>
                </div>
                <div className="flex justify-between text-sm font-black">
                  <span>Vuelto:</span>
                  <span className={cn("tabular-nums", cashBreakdownTotal - useCartStore.getState().getTotalCup() >= 0 ? "text-success" : "text-destructive")}>
                    {formatCurrency(Math.abs(cashBreakdownTotal - useCartStore.getState().getTotalCup()))}
                    {cashBreakdownTotal < useCartStore.getState().getTotalCup() && " (insuf.)"}
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
