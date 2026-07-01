"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  // POS-2 MM-4: Input directo de cantidad.
  // El span del número es clicable. Al click entra en modo edición (input),
  // con foco y select-all. Enter o blur confirma, Esc cancela.
  // qty=10 en 2 clics vs 9 clics anteriores en +.
  //
  // Patrones:
  // -_qtyDraft se inicializa en `String(item.quantity)` al montar el componente.
  // -Cuando item.quantity cambia externamente (+/-), forzamos un reset del draft
  //  via `key` prop en el componente, lo cual remonta limpio. Esta es la solución
  //  idiomática de React 19 para evitar useEffect con setState.
  const [isEditingQty, setIsEditingQty] = useState(false);
  const [qtyDraft, setQtyDraft] = useState(String(item.quantity));
  const qtyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingQty && qtyInputRef.current) {
      qtyInputRef.current.focus();
      qtyInputRef.current.select();
    }
  }, [isEditingQty]);

  // Reset del draft cuando la quantity externa cambia y NO estamos editando.
  // Usamos el patrón "derived state" con comparación + setState condicional
  // — solo se ejecuta cuando hay un cambio real, no en cada render.
  if (!isEditingQty && qtyDraft !== String(item.quantity)) {
    setQtyDraft(String(item.quantity));
  }

  const commitQty = () => {
    const n = parseInt(qtyDraft, 10);
    if (!isNaN(n) && n >= 1 && n <= maxStock) {
      if (n !== item.quantity) {
        onUpdateQuantity(item.product_id, item.variant_id, n);
      }
    } else if (!isNaN(n) && n <= 0) {
      // 0 o negativo → eliminar item
      onRemoveItem(item.product_id, item.variant_id);
    } else {
      // Inválido → revertir
      setQtyDraft(String(item.quantity));
    }
    setIsEditingQty(false);
  };

  const cancelQtyEdit = () => {
    setQtyDraft(String(item.quantity));
    setIsEditingQty(false);
  };

  const handleQtyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitQty();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelQtyEdit();
    }
  };

  return (
    <motion.div
      key={`${item.product_id}-${item.variant_id}`}
      layout="position"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={prefersReducedMotion ? {} : { opacity: 1, scale: 1 }}
      exit={prefersReducedMotion ? {} : { opacity: 0, x: -20 }}
      className={cn(
        "p-3 rounded-2xl border-2 transition-all group relative shadow-sm hover:shadow-md hover:border-primary/40",
        isEasyReading ? "p-6" : "p-3",
        // POS-3a-6: bordes claros entre items del carrito.
        // Antes solo sombra apenas visible → items se confundían entre sí.
        // Ahora border-2 explícito + color según estado de stock.
        item.product.stock_current <= 0
          ? "border-destructive/40 bg-destructive/5"
          : item.product.stock_current < 5
            ? "border-warning/40 bg-warning/10"
            : "border-border bg-background hover:border-primary/40",
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
                isEasyReading ? "w-12 h-12" : "w-11 h-11 sm:w-11 sm:h-11",
              )}
              aria-label={`Reducir cantidad de ${item.product.name}`}
              disabled={item.quantity <= 1}
            >
              <Minus className="w-5 h-5 sm:w-4 sm:h-4" />
            </button>
            {isEditingQty ? (
              <input
                ref={qtyInputRef}
                type="number"
                inputMode="numeric"
                min={0}
                max={maxStock}
                value={qtyDraft}
                onChange={(e) => setQtyDraft(e.target.value)}
                onBlur={commitQty}
                onKeyDown={handleQtyKeyDown}
                className={cn(
                  "text-center font-black px-1 bg-background border-2 border-primary rounded-md outline-none tabular-nums",
                  isEasyReading
                    ? "min-w-[48px] w-12 text-xl h-10"
                    : "min-w-[40px] w-10 text-sm sm:text-base h-9",
                )}
                aria-label={`Editar cantidad de ${item.product.name}`}
              />
            ) : (
              <button
                type="button"
                onClick={() => setIsEditingQty(true)}
                className={cn(
                  "text-center font-black px-2 tabular-nums cursor-text rounded-md hover:bg-primary/5 transition-colors",
                  isEasyReading
                    ? "min-w-[48px] text-xl py-1"
                    : "min-w-[32px] text-sm sm:text-base py-0.5",
                )}
                role="spinbutton"
                aria-label={`Cantidad de ${item.product.name}. Clic para editar.`}
                aria-valuenow={item.quantity}
                aria-valuemin={1}
                aria-valuemax={maxStock}
                title="Clic para editar la cantidad"
              >
                {item.quantity}
              </button>
            )}
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
                isEasyReading ? "w-12 h-12" : "w-11 h-11 sm:w-11 sm:h-11",
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
                  ? "bg-warning/10 text-warning border-warning/20"
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
              "font-bold text-muted-foreground tabular-nums",
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
                "font-black text-primary leading-none tabular-nums",
                isEasyReading ? "text-2xl" : "text-xl sm:text-lg",
              )}
            >
              {formatCurrency(item.subtotal)}
            </div>
          </div>
        </div>
      </div>

      {/* Opciones Avanzadas (Descuento y Pago Mixto) */}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="w-full mt-3 pt-2 border-t border-border/50 flex items-center justify-between text-xs font-black uppercase text-muted-foreground tracking-widest"
      >
        <span>Descuento / Pago Mixto</span>
        <span className="text-primary">{showAdvanced ? '-' : '+'}</span>
      </button>
      {showAdvanced && (
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
              <DollarSign className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-success" aria-hidden="true" />
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
              <Send className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-primary" aria-hidden="true" />
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
      )}
      {Math.abs(item.cash_paid + item.transfer_paid - item.subtotal) > 0.01 && (
        <div className="mt-1 text-[10px] font-bold text-destructive flex items-center gap-1" role="alert">
          <AlertTriangle className="w-3 h-3" aria-hidden="true" /> Error: Pago no coincide (
          {formatCurrency(item.subtotal)})
        </div>
      )}
    </motion.div>
  );
};
