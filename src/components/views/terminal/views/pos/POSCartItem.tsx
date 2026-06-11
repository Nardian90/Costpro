"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  X,
  Minus,
  Plus,
  DollarSign,
  Percent,
  Send,
  AlertTriangle,
  Image as ImageIcon,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import type { POSCartItemProps } from "./POSCart.types";

export const POSCartItem = ({
  item,
  isEasyReading,
  onUpdateQuantity,
  onRemoveItem,
  onViewImage,
  updateItemDiscount,
  updateItemPayment,
}: POSCartItemProps) => {
  const maxStock = item.product?.stock_current ?? 999;

  return (
    <motion.div
      key={`${item.product_id}-${item.variant_id}`}
      layout="position"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, x: -20 }}
      className={cn(
        "p-3 rounded-2xl border-2 transition-all group relative shadow-md",
        isEasyReading ? "p-6" : "p-3",
        item.product.stock_current <= 0
          ? "border-destructive/20 bg-destructive/5"
          : item.product.stock_current < 5
            ? "border-amber-500/20 bg-amber-500/10"
            : "border-border bg-background",
      )}
    >
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 sm:gap-4">
        {/* Left: Quantity Controls & Stock */}
        <div className="flex flex-col items-center gap-1.5 shrink-0">
          <div className="flex items-center gap-1 bg-muted/50 rounded-2xl p-1 border border-border/50" role="group" aria-label={`Controles de cantidad para ${item.product.name}`}>
            <button
              type="button"
              onClick={() =>
                onUpdateQuantity(
                  item.product_id,
                  item.variant_id,
                  item.quantity - 1,
                )
              }
              className={cn(
                "flex items-center justify-center rounded-xl bg-background shadow-sm hover:bg-primary/10 hover:text-primary transition-all active:scale-90 border border-border/50",
                isEasyReading ? "w-12 h-12" : "w-11 h-11 sm:w-8 sm:h-8",
              )}
              aria-label={`Reducir cantidad de ${item.product.name}`}
              disabled={item.quantity <= 1}
            >
              <Minus className="w-5 h-5 sm:w-4 sm:h-4" />
            </button>
            <span
              className={cn(
                "text-center font-black px-2",
                isEasyReading
                  ? "min-w-[48px] text-xl"
                  : "min-w-[32px] text-sm sm:text-base",
              )}
              role="spinbutton"
              aria-label={`Cantidad de ${item.product.name}`}
              aria-valuenow={item.quantity}
              aria-valuemin={1}
              aria-valuemax={maxStock}
            >
              {item.quantity}
            </span>
            <button
              type="button"
              onClick={() =>
                onUpdateQuantity(
                  item.product_id,
                  item.variant_id,
                  item.quantity + 1,
                )
              }
              className={cn(
                "flex items-center justify-center rounded-xl bg-background shadow-sm hover:bg-primary/10 hover:text-primary transition-all active:scale-90 border border-border/50",
                isEasyReading ? "w-12 h-12" : "w-11 h-11 sm:w-8 sm:h-8",
              )}
              aria-label={`Aumentar cantidad de ${item.product.name}`}
              disabled={item.quantity >= maxStock}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div
            className={cn(
              "px-2 py-0.5 rounded-full text-xs font-black uppercase tracking-tight border whitespace-nowrap",
              item.product.stock_current > 10
                ? "bg-primary/10 text-primary border-primary/20"
                : item.product.stock_current > 0
                  ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                  : "bg-destructive/10 text-destructive border-destructive/20",
            )}
          >
            Stock: {item.product.stock_current}
          </div>
        </div>

        {/* Center: Name and Price */}
        <div className="min-w-0 flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h4
              className={cn(
                "font-black uppercase tracking-tight truncate text-foreground",
                isEasyReading ? "text-xl" : "text-sm sm:text-base",
              )}
            >
              {item.product.name}
              {item.variant && (
                <span className="text-primary ml-1">
                  ({item.variant.name})
                </span>
              )}
            </h4>
            {(item.product.public_image_url ||
              item.product.image_url) && (
              <button
                type="button"
                onClick={() =>
                  onViewImage(
                    item.product.public_image_url ||
                      item.product.image_url!,
                    item.product.name,
                  )
                }
                className="min-w-[44px] min-h-[44px] p-2 hover:bg-muted rounded-full transition-colors"
                aria-label={`Ver imagen de ${item.product.name}`}
              >
                <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
          <span
            className={cn(
              "font-bold text-muted-foreground",
              isEasyReading ? "text-base" : "text-[12px] sm:text-xs",
            )}
          >
            {formatCurrency(item.price)}
          </span>
        </div>

        {/* Right: Subtotal */}
        <div className="flex flex-col items-end gap-3 sm:gap-2">
          <button
            type="button"
            onClick={() => onRemoveItem(item.product_id, item.variant_id)}
            className="w-11 h-11 flex items-center justify-center text-muted-foreground/30 hover:text-destructive transition-all active:scale-95"
            aria-label={`Eliminar ${item.product.name} del carrito`}
          >
            <X className="w-6 h-6 sm:w-5 sm:h-5" />
          </button>
          <div className="text-right">
            <div
              className={cn(
                "font-black text-primary leading-none",
                isEasyReading ? "text-2xl" : "text-xl sm:text-lg",
              )}
            >
              {formatCurrency(item.subtotal)}
            </div>
          </div>
        </div>
      </div>

      {/* Opciones Avanzadas (Descuento y Pago Mixto) */}
      <div className="mt-3 grid grid-cols-2 gap-2 pt-2 border-t border-border/50">
        <div className="space-y-1">
          <span className="text-xs font-black uppercase text-muted-foreground">
            Descuento
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() =>
                updateItemDiscount?.(
                  item.product_id,
                  item.variant_id,
                  item.discount_type === "percentage"
                    ? "fixed"
                    : "percentage",
                  item.discount_value,
                )
              }
              className="min-w-[44px] min-h-[44px] p-2.5 rounded-lg bg-muted hover:bg-primary/10 transition-colors"
              aria-label={`Cambiar tipo de descuento a ${item.discount_type === "percentage" ? "monto fijo" : "porcentaje"} para ${item.product.name}`}
            >
              {item.discount_type === "percentage" ? (
                <Percent className="w-3 h-3" />
              ) : (
                <DollarSign className="w-3 h-3" />
              )}
            </button>
            <input
              type="number"
              value={item.discount_value || ""}
              onChange={(e) =>
                updateItemDiscount?.(
                  item.product_id,
                  item.variant_id,
                  item.discount_type || "fixed",
                  Number(e.target.value),
                )
              }
              className="w-full bg-background border border-border/50 rounded-lg px-2 py-2.5 min-h-[44px] text-xs font-bold"
              placeholder="0"
              aria-label={`Valor de descuento para ${item.product.name}`}
            />
          </div>
        </div>
        <div className="space-y-1">
          <span className="text-xs font-black uppercase text-muted-foreground">
            Pago Mixto
          </span>
          <div className="flex gap-1">
            <div className="relative flex-1">
              <DollarSign className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-emerald-500" aria-hidden="true" />
              <input
                type="number"
                value={item.cash_paid || 0}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  updateItemPayment?.(
                    item.product_id,
                    item.variant_id,
                    val,
                    item.subtotal - val,
                  );
                }}
                className="w-full bg-background border border-border/50 rounded-lg pl-5 pr-1 py-2.5 min-h-[44px] text-xs font-bold"
                aria-label={`Monto pagado en efectivo para ${item.product.name}`}
              />
            </div>
            <div className="relative flex-1">
              <Send className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-blue-500" aria-hidden="true" />
              <input
                type="number"
                value={item.transfer_paid || 0}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  updateItemPayment?.(
                    item.product_id,
                    item.variant_id,
                    item.subtotal - val,
                    val,
                  );
                }}
                className="w-full bg-background border border-border/50 rounded-lg pl-5 pr-1 py-2.5 min-h-[44px] text-xs font-bold"
                aria-label={`Monto pagado por transferencia para ${item.product.name}`}
              />
            </div>
          </div>
        </div>
      </div>
      {Math.abs(item.cash_paid + item.transfer_paid - item.subtotal) > 0.01 && (
        <div className="mt-1 text-[10px] font-bold text-destructive flex items-center gap-1" role="alert">
          <AlertTriangle className="w-3 h-3" aria-hidden="true" /> Error: Pago no coincide (
          {formatCurrency(item.subtotal)})
        </div>
      )}
    </motion.div>
  );
};
