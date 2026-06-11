"use client";

import React from "react";
import { DollarSign, Send } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import type { POSCartSummaryProps } from "./POSCart.types";

export const POSCartSummary = ({
  items,
  getSubtotal,
  getDiscountAmount,
  getTotal,
  discount,
  prorateGlobalPayment,
  selectedPayment,
  onSetSelectedPayment,
  isMobile,
}: POSCartSummaryProps) => (
  <div
    className={cn(
      "p-4 sm:p-6 space-y-4 border-t border-border bg-card/80 backdrop-blur-xl sticky bottom-0 z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.1)]",
      isMobile && "pb-6 rounded-t-[2.5rem]",
    )}
  >
    {/* Pago Mixto Global (Prorrateo) */}
    <div className="px-4 py-3 bg-primary/5 rounded-2xl border border-primary/20 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-black uppercase text-primary tracking-widest">
          Pago Mixto Global
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              const total = getTotal();
              prorateGlobalPayment?.(total / 2, total / 2);
              onSetSelectedPayment("mixed");
            }}
            className="h-11 min-h-[44px] px-3 flex items-center justify-center text-[10px] font-bold text-primary hover:underline"
            aria-label="Dividir pago 50% efectivo, 50% transferencia"
          >
            50/50
          </button>
          <button
            type="button"
            onClick={() => {
              const total = getTotal();
              prorateGlobalPayment?.(total, 0);
              onSetSelectedPayment("mixed");
            }}
            className="h-11 min-h-[44px] px-3 flex items-center justify-center text-[10px] font-bold text-primary hover:underline"
            aria-label="Pagar todo en efectivo"
          >
            Todo Efectivo
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="pos-cash-total" className="text-xs font-bold text-muted-foreground uppercase">
            Total Efectivo
          </label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" aria-hidden="true" />
            <input
              id="pos-cash-total"
              type="number"
              placeholder="Efectivo"
              className="w-full h-11 bg-background border border-border/50 rounded-xl pl-9 pr-3 text-sm font-black"
              value={items
                .reduce((acc, i) => acc + (i.cash_paid || 0), 0)
                .toFixed(2)}
              onChange={(e) => {
                const cash = Number(e.target.value);
                const total = getTotal();
                prorateGlobalPayment?.(cash, Math.max(0, total - cash));
                onSetSelectedPayment("mixed");
              }}
              aria-label="Monto total a pagar en efectivo"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="pos-transfer-total" className="text-xs font-bold text-muted-foreground uppercase">
            Total Transf.
          </label>
          <div className="relative">
            <Send className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500" aria-hidden="true" />
            <input
              id="pos-transfer-total"
              type="number"
              placeholder="Transferencia"
              className="w-full h-11 bg-background border border-border/50 rounded-xl pl-9 pr-3 text-sm font-black"
              value={items
                .reduce((acc, i) => acc + (i.transfer_paid || 0), 0)
                .toFixed(2)}
              onChange={(e) => {
                const transf = Number(e.target.value);
                const total = getTotal();
                prorateGlobalPayment?.(Math.max(0, total - transf), transf);
                onSetSelectedPayment("mixed");
              }}
              aria-label="Monto total a pagar por transferencia"
            />
          </div>
        </div>
      </div>
    </div>

    {/* Resumen de Totales */}
    <div className="px-4 py-3 bg-muted/30 rounded-2xl border border-border/50 space-y-1">
      <div className="flex justify-between items-center text-xs font-black uppercase text-muted-foreground tracking-widest">
        <span>Subtotal</span>
        <span className="text-foreground">
          {formatCurrency(getSubtotal())}
        </span>
      </div>

      {getDiscountAmount() > 0 && (
        <div className="flex justify-between items-center text-xs font-black uppercase text-destructive tracking-widest">
          <span>
            Descuento (
            {discount?.type === "percentage"
              ? `${discount.value}%`
              : "Monto"}
            )
          </span>
          <span>-{formatCurrency(getDiscountAmount())}</span>
        </div>
      )}

      <div className="flex justify-between items-center pt-2 border-t border-primary/20">
        <span className="text-xs font-black uppercase text-foreground tracking-widest">
          Total Final
        </span>
        <span className="text-[clamp(1.25rem,5vw,1.5rem)] font-black text-primary tracking-tighter leading-none">
          {formatCurrency(getTotal())}
        </span>
      </div>
    </div>
  </div>
);
