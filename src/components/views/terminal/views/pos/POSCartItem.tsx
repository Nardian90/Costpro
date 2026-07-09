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
  CreditCard,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { useCartStore, type CartItem } from "@/store/cart";
import type { POSCartItemProps } from "./POSCart.types";

// FIX-G5: helper local para recalcular subtotal al cambiar variante
function recalcSubtotal(item: CartItem): number {
  const price = item.price ?? 0;
  const quantity = item.quantity ?? 0;
  const base = price * quantity;
  if (!item.discount_type || item.discount_value <= 0) return base;
  if (item.discount_type === "percentage") return base * (1 - item.discount_value / 100);
  return Math.max(0, (price - item.discount_value) * quantity);
}

export const POSCartItem = ({
  item,
  isEasyReading,
  onUpdateQuantity,
  onRemoveItem,
  onViewImage,
  updateItemDiscount,
  updateItemPayment,
}: POSCartItemProps) => {
  // FIX-P2-7: maxStock convertido a la unidad de la variante seleccionada
  const conversionFactor = item.variant?.conversion_factor || 1;
  // FIX-P2-8: guardar contra conversion_factor=0 (división por cero)
  const safeFactor = conversionFactor > 0 ? conversionFactor : 1;
  const maxStock = Math.floor((item.product?.stock_current ?? 999) / safeFactor);
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
                {item.variant && <span className="text-[9px] opacity-60 ml-0.5">{item.variant.name.substring(0, 3)}</span>}
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
            {formatCurrency(item.price)} {item.currency !== 'CUP' && item.currency}
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

      {/* Opciones Avanzadas (Descuento, Pago Mixto y Moneda) */}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="w-full mt-3 pt-2 border-t border-border/50 flex items-center justify-between text-xs font-black uppercase text-muted-foreground tracking-widest"
      >
        <span>Descuento / Pago Mixto / Moneda</span>
        <span className="text-primary">{showAdvanced ? '-' : '+'}</span>
      </button>
      {showAdvanced && (
      <div className="mt-3 space-y-2 pt-2 border-t border-border/50">
      {/* FIX-MULTI-MONEDA: selector de moneda y tasa por item + unidad de medida */}
      <div className="grid grid-cols-2 gap-2 pb-2 border-b border-border/30">
        {/* Selector de unidad de medida / variante si el producto las tiene */}
        {item.product.product_variants && item.product.product_variants.length > 0 && (
          <div className="space-y-1 col-span-2">
            <span className="text-xs font-black uppercase text-muted-foreground">Unidad de Venta</span>
            <select
              value={item.variant_id || ''}
              onChange={(e) => {
                const variantId = e.target.value;
                const selectedVariant = item.product.product_variants?.find(v => v.id === variantId) || null;

                // FIX-P1-3: fusionar con item existente si ya hay uno con la misma variante
                const state = useCartStore.getState();
                const currentIdx = state.items.findIndex(
                  it => it.product_id === item.product_id && (it.variant_id || null) === (item.variant_id || null)
                );
                if (currentIdx === -1) return;

                const currentItem = state.items[currentIdx];
                let newPrice: number;
                let newCost: number;
                let newVariantId: string | null;
                let newVariant: any;

                if (selectedVariant) {
                  const cf = selectedVariant.conversion_factor || 1;
                  newPrice = selectedVariant.price || 0;
                  newCost = (item.product.cost_price || 0) * cf;
                  newVariantId = selectedVariant.id;
                  newVariant = selectedVariant;
                } else {
                  newPrice = item.product.price;
                  newCost = item.product.cost_price || 0;
                  newVariantId = null;
                  newVariant = null;
                }

                // Verificar si ya existe un item con la variante destino
                const existingDestIdx = state.items.findIndex(
                  it => it.product_id === item.product_id && (it.variant_id || null) === newVariantId
                );

                if (existingDestIdx !== -1 && existingDestIdx !== currentIdx) {
                  // FIX-P1-3: fusionar — sumar cantidad al item existente, remover el actual
                  const destItem = state.items[existingDestIdx];
                  const mergedItem = {
                    ...destItem,
                    quantity: destItem.quantity + currentItem.quantity,
                  };
                  mergedItem.subtotal = recalcSubtotal(mergedItem);
                  mergedItem.cash_paid = mergedItem.subtotal;
                  mergedItem.transfer_paid = 0;

                  // Remover item actual y actualizar destino
                  const newItems = state.items.filter((_, i) => i !== currentIdx);
                  const adjustIdx = existingDestIdx > currentIdx ? existingDestIdx - 1 : existingDestIdx;
                  newItems[adjustIdx] = mergedItem;
                  useCartStore.setState({ items: newItems, lastUpdated: Date.now() });
                } else {
                  // No hay duplicado — simplemente actualizar el item actual
                  const updatedItem = {
                    ...currentItem,
                    variant_id: newVariantId,
                    variant: newVariant,
                    price: newPrice,
                    cost: newCost,
                    currency: currentItem.currency,
                    exchange_rate: currentItem.exchange_rate,
                  };
                  updatedItem.subtotal = recalcSubtotal(updatedItem);
                  updatedItem.cash_paid = updatedItem.subtotal;
                  updatedItem.transfer_paid = 0;
                  useCartStore.setState((s) => ({
                    items: s.items.map((it2, i2) => i2 === currentIdx ? updatedItem : it2),
                    lastUpdated: Date.now(),
                  }));
                }
              }}
              className="w-full bg-background border border-border/50 rounded-lg px-2 py-2.5 min-h-[44px] text-xs font-bold"
              aria-label={`Unidad de venta para ${item.product.name}`}
            >
              <option value="">Unidad base ({item.product.unit_of_measure || 'unidad'})</option>
              {item.product.product_variants.map(v => (
                <option key={v.id} value={v.id}>
                  {v.name} — {formatCurrency(v.price)} (x{v.conversion_factor})
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-1">
          <span className="text-xs font-black uppercase text-muted-foreground">Moneda Venta</span>
          <select
            value={item.currency || 'CUP'}
            onChange={async (e) => {
              const currency = e.target.value;
              // FIX-CONVERSION (2026-07-07): NO auto-convertir el precio.
              // El problema: el fetch usa tasa BCC (~120) pero el usuario opera con
              // tasa informal (~580). La conversión automática daba precios incorrectos.
              // Ahora: solo cambiar moneda + tasa, el usuario ajusta el precio manualmente.
              // El CUP equivalente se muestra siempre como price * tasa.
              let rate = 1.0;
              if (currency !== 'CUP') {
                // Usar globalRate si existe (el usuario ya la seteó antes)
                const gr = useCartStore.getState().globalRates[currency];
                if (gr && gr > 0) {
                  rate = gr;
                } else {
                  // Fetch de API como sugerencia inicial
                  try {
                    const res = await fetch(`/api/exchange-rates?currency=${currency}&source=elToque&days=1`);
                    if (res.ok) {
                      const data = await res.json();
                      const rates = Array.isArray(data) ? data : (data?.rates || data?.data || []);
                      if (Array.isArray(rates) && rates.length > 0) {
                        const sorted = rates.sort((a: any, b: any) =>
                          new Date(b.rate_date || 0).getTime() - new Date(a.rate_date || 0).getTime()
                        );
                        if (sorted[0]?.rate > 0) rate = sorted[0].rate;
                      }
                    }
                  } catch {}
                  // Fallback BCC si elToque no funciona
                  if (rate <= 1) {
                    try {
                      const res = await fetch(`/api/exchange-rates?currency=${currency}&source=BCC&segment=3&days=1`);
                      if (res.ok) {
                        const data = await res.json();
                        const rates = Array.isArray(data) ? data : (data?.rates || data?.data || []);
                        if (Array.isArray(rates) && rates.length > 0 && rates[0]?.rate > 0) {
                          rate = rates[0].rate;
                        }
                      }
                    } catch {}
                  }
                }
              }
              // FIX-CONVERSION (2026-07-10): SÍ convertir el precio.
              // FIX-CRITICAL (2026-07-10): si no se obtiene tasa válida (>1),
              // cambiar la moneda de todas formas pero NO convertir el precio.
              // El usuario edita la TASA manualmente y el precio se ajusta después.
              // Antes: si el fetch fallaba, se bloqueaba el cambio de moneda y el
              // usuario no podía hacer nada (campo TASA estaba disabled en CUP).
              if (currency !== 'CUP' && rate <= 1) {
                toast.info('No se pudo obtener la tasa automáticamente. Cambia la moneda y edita la TASA manualmente.');
                rate = 0; // señalar que no se obtuvo — el usuario debe editarla
              }
              const oldRate = item.exchange_rate || 1.0;
              const isOldCup = (item.currency || 'CUP') === 'CUP';
              const isNewCup = currency === 'CUP';
              let newPrice = item.price;
              // Solo convertir si tenemos una tasa válida
              if (rate > 1) {
                if (isOldCup && !isNewCup) {
                  newPrice = item.price / rate; // CUP → USD: 1600 / 680 = 2.35
                } else if (!isOldCup && isNewCup) {
                  newPrice = item.price * oldRate; // USD → CUP: 2.35 * 680 = 1598
                } else if (!isOldCup && !isNewCup) {
                  newPrice = (item.price * oldRate) / rate; // USD → EUR
                }
              }
              // Si rate=0 (no se obtuvo), el precio se mantiene igual y el usuario
              // edita la TASA. Al editarla, se actualiza globalRates y el CUP
              // equivalente se recalcula automáticamente.
              const finalRate = rate > 1 ? rate : 1; // default 1 si no se obtuvo
              // FIX-B12 (2026-07-10): setState atómico
              useCartStore.setState((state) => ({
                items: state.items.map((it) => {
                  if (it.product_id === item.product_id && it.variant_id === item.variant_id) {
                    const updatedItem = {
                      ...it,
                      price: newPrice,
                      currency,
                      exchange_rate: finalRate,
                      // FIX-CURRENCY-INHERIT: pagos heredan la moneda de venta
                      cash_currency: currency,
                      transfer_currency: currency,
                      // zelle_currency se mantiene en USD (Zelle es siempre USD)
                    };
                    updatedItem.subtotal = recalcSubtotal(updatedItem);
                    updatedItem.cash_paid = updatedItem.subtotal;
                    updatedItem.transfer_paid = 0;
                    updatedItem.zelle_paid = 0;
                    return updatedItem;
                  }
                  return it;
                }),
                lastUpdated: Date.now(),
              }));
            }}
            className="w-full bg-background border border-border/50 rounded-lg px-2 py-2.5 min-h-[44px] text-xs font-bold"
            aria-label={`Moneda de venta para ${item.product.name}`}
          >
            <option value="CUP">CUP</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="MLC">MLC</option>
          </select>
        </div>
        <div className="space-y-1">
          <span className="text-xs font-black uppercase text-muted-foreground">
            Tasa {item.currency !== 'CUP' && `(1 ${item.currency} = ${item.exchange_rate || 1} CUP · precio unit. ≈ ${formatCurrency((item.price || 0) * (item.exchange_rate || 1))} CUP)`}
          </span>
          <input
            type="number"
            step="0.01"
            value={item.exchange_rate || 1.0}
            disabled={item.currency === 'CUP'}
            onChange={(e) => {
              const rate = parseFloat(e.target.value) || 1.0;
              // FIX-BUG-4 (2026-07-07): al editar la TASA, también actualizar globalRates
              useCartStore.getState().setGlobalRate(item.currency || 'USD', rate);
              // FIX-B12: setState atómico
              useCartStore.setState((state) => ({
                items: state.items.map((it) => {
                  if (it.product_id === item.product_id && it.variant_id === item.variant_id) {
                    // FIX-TASA-RECALC (2026-07-10): si la tasa anterior era 1 (no se obtuvo),
                    // recalcular el precio dividiendo el precio CUP original por la nueva tasa.
                    // Esto permite al usuario: cambiar moneda → editar tasa → precio se ajusta.
                    let newPrice = it.price;
                    if (it.currency !== 'CUP' && (it.exchange_rate || 1) <= 1 && rate > 1) {
                      // El precio original estaba en CUP, convertirlo ahora
                      newPrice = it.price / rate;
                    }
                    const updatedItem = { ...it, exchange_rate: rate, price: newPrice };
                    updatedItem.subtotal = recalcSubtotal(updatedItem);
                    updatedItem.cash_paid = updatedItem.subtotal;
                    updatedItem.transfer_paid = 0;
                    updatedItem.zelle_paid = 0;
                    return updatedItem;
                  }
                  return it;
                }),
                lastUpdated: Date.now(),
              }));
            }}
            className="w-full bg-background border border-border/50 rounded-lg px-2 py-2.5 min-h-[44px] text-xs font-bold disabled:opacity-50"
            aria-label={`Tasa de cambio para ${item.product.name}`}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <span className="text-xs font-black uppercase text-muted-foreground">
            Pago Mixto (Efectivo / Transf. / Zelle)
          </span>
          {/* FIX-UI (2026-07-10): descuento en la misma línea, input de pago SIEMPRE visible */}
          {/* Efectivo */}
          <div className="border border-border/30 rounded-lg p-2 space-y-1.5">
            <div className="flex flex-wrap gap-1 items-center">
              <div className="relative min-w-[100px] flex-1">
                <DollarSign className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-success" aria-hidden="true" />
                <input
                  type="number"
                  value={item.cash_paid || 0}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    const remaining = Math.max(0, item.subtotal - val - (item.zelle_paid || 0));
                    updateItemPayment?.(
                      item.product_id, item.variant_id,
                      val, remaining, item.zelle_paid || 0,
                      { cash: item.cash_currency, transfer: item.transfer_currency, zelle: item.zelle_currency },
                    );
                  }}
                  className="w-full bg-background border border-border/50 rounded-lg pl-5 pr-1 py-2 min-h-[36px] text-xs font-bold"
                  aria-label={`Efectivo para ${item.product.name}`}
                />
                {item.cash_paid > 0 && item.cash_currency !== 'CUP' && (
                  <p className="text-[8px] text-muted-foreground mt-0.5 ml-1">≈ {formatCurrency(item.cash_paid * (useCartStore.getState().globalRates[item.cash_currency || 'CUP'] || item.exchange_rate || 1))} CUP</p>
                )}
              </div>
              <select
                value={item.cash_currency || 'CUP'}
                onChange={(e) => updateItemPayment?.(item.product_id, item.variant_id, item.cash_paid, item.transfer_paid, item.zelle_paid, { cash: e.target.value, transfer: item.transfer_currency, zelle: item.zelle_currency })}
                className="bg-background border border-border/50 rounded-lg px-1 py-2 min-h-[36px] text-[10px] font-bold shrink-0"
              >
                <option value="CUP">CUP</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="MLC">MLC</option>
              </select>
              <select
                value={item.cash_discount_type || 'none'}
                onChange={(e) => {
                  const type = e.target.value === 'none' ? null : e.target.value as 'percentage' | 'fixed';
                  useCartStore.setState((state) => ({ items: state.items.map((it) => it.product_id === item.product_id && it.variant_id === item.variant_id ? { ...it, cash_discount_type: type } : it), lastUpdated: Date.now() }));
                }}
                className="bg-background border border-border/50 rounded px-1 py-2 min-h-[36px] text-[9px] font-bold shrink-0"
                aria-label={`Tipo de descuento en efectivo para ${item.product.name}`}
              >
                <option value="none">Sin desc</option><option value="percentage">%</option><option value="fixed">$</option>
              </select>
              {item.cash_discount_type && (
                <input
                  type="number"
                  value={item.cash_discount_value || 0}
                  onChange={(e) => useCartStore.setState((state) => ({ items: state.items.map((it) => it.product_id === item.product_id && it.variant_id === item.variant_id ? { ...it, cash_discount_value: parseFloat(e.target.value) || 0, cash_discount_currency: item.cash_currency } : it), lastUpdated: Date.now() }))}
                  className="w-14 bg-background border border-border/50 rounded px-1 py-2 min-h-[36px] text-[9px] font-bold shrink-0"
                  placeholder="0"
                />
              )}
            </div>
          </div>

          {/* Transferencia */}
          <div className="border border-border/30 rounded-lg p-2 space-y-1.5">
            <div className="flex flex-wrap gap-1 items-center">
              <div className="relative min-w-[100px] flex-1">
                <Send className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-primary" aria-hidden="true" />
                <input
                  type="number"
                  value={item.transfer_paid || 0}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    const remaining = Math.max(0, item.subtotal - (item.cash_paid || 0) - val - (item.zelle_paid || 0));
                    updateItemPayment?.(item.product_id, item.variant_id, item.cash_paid, val, item.zelle_paid || 0, { cash: item.cash_currency, transfer: item.transfer_currency, zelle: item.zelle_currency });
                  }}
                  className="w-full bg-background border border-border/50 rounded-lg pl-5 pr-1 py-2 min-h-[36px] text-xs font-bold"
                  aria-label={`Transferencia para ${item.product.name}`}
                />
                {item.transfer_paid > 0 && item.transfer_currency !== 'CUP' && (
                  <p className="text-[8px] text-muted-foreground mt-0.5 ml-1">≈ {formatCurrency(item.transfer_paid * (useCartStore.getState().globalRates[item.transfer_currency || 'CUP'] || item.exchange_rate || 1))} CUP</p>
                )}
              </div>
              <select
                value={item.transfer_currency || 'CUP'}
                onChange={(e) => updateItemPayment?.(item.product_id, item.variant_id, item.cash_paid, item.transfer_paid, item.zelle_paid, { cash: item.cash_currency, transfer: e.target.value, zelle: item.zelle_currency })}
                className="bg-background border border-border/50 rounded-lg px-1 py-2 min-h-[36px] text-[10px] font-bold shrink-0"
              >
                <option value="CUP">CUP</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="MLC">MLC</option>
              </select>
              <select
                value={item.transfer_discount_type || 'none'}
                onChange={(e) => {
                  const type = e.target.value === 'none' ? null : e.target.value as 'percentage' | 'fixed';
                  useCartStore.setState((state) => ({ items: state.items.map((it) => it.product_id === item.product_id && it.variant_id === item.variant_id ? { ...it, transfer_discount_type: type } : it), lastUpdated: Date.now() }));
                }}
                className="bg-background border border-border/50 rounded px-1 py-2 min-h-[36px] text-[9px] font-bold shrink-0"
                aria-label={`Tipo de descuento en transferencia para ${item.product.name}`}
              >
                <option value="none">Sin desc</option><option value="percentage">%</option><option value="fixed">$</option>
              </select>
              {item.transfer_discount_type && (
                <input
                  type="number"
                  value={item.transfer_discount_value || 0}
                  onChange={(e) => useCartStore.setState((state) => ({ items: state.items.map((it) => it.product_id === item.product_id && it.variant_id === item.variant_id ? { ...it, transfer_discount_value: parseFloat(e.target.value) || 0, transfer_discount_currency: item.transfer_currency } : it), lastUpdated: Date.now() }))}
                  className="w-14 bg-background border border-border/50 rounded px-1 py-2 min-h-[36px] text-[9px] font-bold shrink-0"
                  placeholder="0"
                />
              )}
            </div>
          </div>

          {/* Zelle */}
          <div className="border border-border/30 rounded-lg p-2 space-y-1.5">
            <div className="flex flex-wrap gap-1 items-center">
              <div className="relative min-w-[100px] flex-1">
                <CreditCard className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-primary" aria-hidden="true" />
                <input
                  type="number"
                  value={item.zelle_paid || 0}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    const remaining = Math.max(0, item.subtotal - (item.cash_paid || 0) - val);
                    updateItemPayment?.(item.product_id, item.variant_id, item.cash_paid, remaining, val, { cash: item.cash_currency, transfer: item.transfer_currency, zelle: item.zelle_currency });
                  }}
                  className="w-full bg-background border border-border/50 rounded-lg pl-5 pr-1 py-2 min-h-[36px] text-xs font-bold"
                  aria-label={`Zelle para ${item.product.name}`}
                />
                {item.zelle_paid > 0 && item.zelle_currency !== 'CUP' && (
                  <p className="text-[8px] text-muted-foreground mt-0.5 ml-1">≈ {formatCurrency(item.zelle_paid * (useCartStore.getState().globalRates[item.zelle_currency || 'USD'] || item.exchange_rate || 1))} CUP</p>
                )}
              </div>
              <select
                value={item.zelle_currency || 'USD'}
                onChange={(e) => updateItemPayment?.(item.product_id, item.variant_id, item.cash_paid, item.transfer_paid, item.zelle_paid, { cash: item.cash_currency, transfer: item.transfer_currency, zelle: e.target.value })}
                className="bg-background border border-border/50 rounded-lg px-1 py-2 min-h-[36px] text-[10px] font-bold shrink-0"
              >
                <option value="CUP">CUP</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="MLC">MLC</option>
              </select>
              <select
                value={item.zelle_discount_type || 'none'}
                onChange={(e) => {
                  const type = e.target.value === 'none' ? null : e.target.value as 'percentage' | 'fixed';
                  useCartStore.setState((state) => ({ items: state.items.map((it) => it.product_id === item.product_id && it.variant_id === item.variant_id ? { ...it, zelle_discount_type: type } : it), lastUpdated: Date.now() }));
                }}
                className="bg-background border border-border/50 rounded px-1 py-2 min-h-[36px] text-[9px] font-bold shrink-0"
                aria-label={`Tipo de descuento en Zelle para ${item.product.name}`}
              >
                <option value="none">Sin desc</option><option value="percentage">%</option><option value="fixed">$</option>
              </select>
              {item.zelle_discount_type && (
                <input
                  type="number"
                  value={item.zelle_discount_value || 0}
                  onChange={(e) => useCartStore.setState((state) => ({ items: state.items.map((it) => it.product_id === item.product_id && it.variant_id === item.variant_id ? { ...it, zelle_discount_value: parseFloat(e.target.value) || 0, zelle_discount_currency: item.zelle_currency } : it), lastUpdated: Date.now() }))}
                  className="w-14 bg-background border border-border/50 rounded px-1 py-2 min-h-[36px] text-[9px] font-bold shrink-0"
                  placeholder="0"
                />
              )}
            </div>
          </div>
        </div>
      </div>
      </div>
      )}
      {/* FIX-BUG-1 (2026-07-07): validación en CUP con descuento por método */}
      {(() => {
        const cartStore = useCartStore.getState();
        // FIX-B6: usar getItemPaidCup del store (single source of truth)
        const subtotalCup = cartStore.getItemSubtotalCup(item);
        const paidCup = cartStore.getItemPaidCup(item);
        const diff = paidCup - subtotalCup;
        if (Math.abs(diff) <= 0.01) {
          return (
            <div className="mt-1 text-[10px] font-bold text-emerald-500 flex items-center gap-1">
              ✓ Pago completo ({formatCurrency(subtotalCup)} CUP)
            </div>
          );
        }
        if (diff > 0) {
          return (
            <div className="mt-1 text-[10px] font-bold text-amber-500 flex items-center gap-1">
              ⚠ Sobrepago: {formatCurrency(diff)} CUP
            </div>
          );
        }
        return (
          <div className="mt-1 text-[10px] font-bold text-destructive flex items-center gap-1" role="alert">
            <AlertTriangle className="w-3 h-3" aria-hidden="true" /> Falta: {formatCurrency(Math.abs(diff))} CUP
          </div>
        );
      })()}
    </motion.div>
  );
};
