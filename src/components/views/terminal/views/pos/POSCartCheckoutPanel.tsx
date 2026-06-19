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
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
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
    product?: { name: string };
  }>;
  getSubtotal: () => number;
  getDiscountAmount: () => number;
  getTotal: () => number;
  getTaxAmount?: () => number;
  discount: { type: "percentage" | "fixed"; value: number } | null;
  setDiscount: (d: { type: "percentage" | "fixed"; value: number } | null) => void;
  prorateGlobalPayment?: (cash: number, transfer: number) => void;
  selectedPayment: PaymentMethod;
  onSetSelectedPayment: (m: PaymentMethod) => void;
  isProcessing: boolean;
  itemCount: number;
  onCheckout: (payment: PaymentMethod, discount: { type: "percentage" | "fixed"; value: number } | null) => void;
  onClearCart: () => void;
  isMobile: boolean;
}

const PAYMENT_METHODS: Array<{
  id: "cash" | "card" | "transfer" | "wallet";
  label: string;
  short: string;
  icon: typeof DollarSign;
}> = [
  { id: "cash",     label: "Efectivo",      short: "Efectivo", icon: DollarSign },
  { id: "card",     label: "Tarjeta",       short: "Tarjeta",  icon: CreditCard },
  { id: "transfer", label: "Transferencia", short: "Transf.",  icon: Smartphone },
  { id: "wallet",   label: "Billetera",     short: "Billetera", icon: Wallet },
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
            {formatCurrency(total)}
          </span>
        </div>
        {/* Desglose compacto */}
        <div className="mt-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          <span>Subt. {formatCurrency(subtotal)}</span>
          {discountAmount > 0 && (
            <span className="text-destructive">−{formatCurrency(discountAmount)}</span>
          )}
          {taxAmount > 0 && <span>Imp. {formatCurrency(taxAmount)}</span>}
        </div>
      </div>

      {/* ── MÉTODO DE PAGO (siempre visible, 4 botones 2x2) ───────── */}
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border/50">
        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-2">
          Método de pago
        </p>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Seleccionar método de pago">
          {PAYMENT_METHODS.map((method) => {
            const Icon = method.icon;
            const isActive = selectedPayment === method.id;
            return (
              <button
                key={method.id}
                type="button"
                onClick={() => onSetSelectedPayment(method.id)}
                className={cn(
                  "p-2.5 sm:p-3 min-h-[44px] rounded-xl flex items-center justify-center gap-2 border-2 transition-all bg-background focus:outline-none focus:ring-2 focus:ring-primary/30",
                  isActive
                    ? "border-primary shadow-md shadow-primary/10 text-primary bg-primary/5"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
                role="radio"
                aria-checked={isActive}
                aria-label={`Pagar en ${method.label.toLowerCase()}`}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
                <span className="text-xs font-black uppercase tracking-widest">
                  {method.short}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── EFECTIVO RECIBIDO + VUELTO (si cash) ──────────────────── */}
      {selectedPayment === "cash" && (
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border/50 bg-success/5">
          <label
            htmlFor="pos-cash-received"
            className="text-[10px] font-black uppercase text-success tracking-widest block mb-2"
          >
            Efectivo recibido
          </label>
          <input
            id="pos-cash-received"
            type="number"
            inputMode="decimal"
            placeholder="0.00"
            value={cashReceived}
            onChange={(e) => setCashReceived(e.target.value)}
            className="w-full h-12 bg-background border-2 border-success/30 rounded-xl px-4 text-lg font-black text-success text-center tabular-nums outline-none focus:border-success"
            aria-label="Efectivo recibido del cliente"
          />
          {/* Presets */}
          <div className="flex gap-2 mt-2">
            {cashPresets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setCashReceived(String(preset))}
                className="flex-1 min-h-[44px] rounded-lg bg-success/10 text-success text-xs font-black border border-success/20 hover:bg-success/20 transition-colors focus:outline-none focus:ring-2 focus:ring-success/30"
              >
                ${preset}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCashReceived(total.toFixed(2))}
              className="flex-1 min-h-[44px] rounded-lg bg-success text-white text-xs font-black hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-success/30"
            >
              Exacto
            </button>
          </div>
          {/* Vuelto */}
          {cashReceivedNum > 0 && (
            <div className="mt-3 pt-2 border-t border-success/20 flex justify-between items-center">
              <span className="text-[10px] font-black uppercase text-success tracking-widest">
                Vuelto
              </span>
              <span
                className={cn(
                  "text-xl font-black tabular-nums",
                  change >= 0 ? "text-success" : "text-destructive",
                )}
              >
                {formatCurrency(Math.abs(change))}
                {change < 0 && " (insuf.)"}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── PAGO MIXTO (accordion) ────────────────────────────────── */}
      <div className="px-4 sm:px-6 py-2 border-b border-border/50">
        <button
          type="button"
          onClick={() => setShowMixedPayment(!showMixedPayment)}
          className="w-full flex items-center justify-between py-2 text-xs font-black uppercase text-primary tracking-widest hover:underline"
          aria-expanded={showMixedPayment}
          aria-controls="pos-mixed-payment"
        >
          <span className="flex items-center gap-2">
            <Send className="w-3.5 h-3.5" aria-hidden="true" />
            Pago mixto
          </span>
          {showMixedPayment ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        <AnimatePresence>
          {showMixedPayment && (
            <motion.div
              id="pos-mixed-payment"
              initial={{ height: 0, opacity: 0 }}
              animate={prefersReducedMotion ? {} : { height: "auto", opacity: 1 }}
              exit={prefersReducedMotion ? {} : { height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pb-3 space-y-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      prorateGlobalPayment?.(total / 2, total / 2);
                      onSetSelectedPayment("mixed");
                    }}
                    className="min-h-[44px] flex-1 px-2 text-[10px] font-bold text-primary border border-primary/30 rounded-lg hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    50/50
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      prorateGlobalPayment?.(total, 0);
                      onSetSelectedPayment("mixed");
                    }}
                    className="min-h-[44px] flex-1 px-2 text-[10px] font-bold text-primary border border-primary/30 rounded-lg hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    Todo efectivo
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="pos-cash-total" className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                      Total efectivo
                    </label>
                    <div className="relative">
                      <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-success" aria-hidden="true" />
                      <input
                        id="pos-cash-total"
                        type="number"
                        className="w-full min-h-[44px] bg-background border border-border/50 rounded-lg pl-8 pr-2 text-sm font-black tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30"
                        value={items.reduce((acc, i) => acc + (i.cash_paid || 0), 0).toFixed(2)}
                        onChange={(e) => {
                          const cash = Number(e.target.value);
                          prorateGlobalPayment?.(cash, Math.max(0, total - cash));
                          onSetSelectedPayment("mixed");
                        }}
                        aria-label="Monto total a pagar en efectivo"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="pos-transfer-total" className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                      Total transf.
                    </label>
                    <div className="relative">
                      <Send className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary" aria-hidden="true" />
                      <input
                        id="pos-transfer-total"
                        type="number"
                        className="w-full min-h-[44px] bg-background border border-border/50 rounded-lg pl-8 pr-2 text-sm font-black tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30"
                        value={items.reduce((acc, i) => acc + (i.transfer_paid || 0), 0).toFixed(2)}
                        onChange={(e) => {
                          const transf = Number(e.target.value);
                          prorateGlobalPayment?.(Math.max(0, total - transf), transf);
                          onSetSelectedPayment("mixed");
                        }}
                        aria-label="Monto total a pagar por transferencia"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── DESCUENTO (accordion) ─────────────────────────────────── */}
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
            Descuento
            {discount && discount.value > 0 && (
              <span className="bg-destructive/10 text-destructive px-1.5 py-0.5 rounded text-[9px]">
                {discount.type === "percentage" ? `-${discount.value}%` : `-${formatCurrency(discount.value)}`}
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
    </div>
  );
}
