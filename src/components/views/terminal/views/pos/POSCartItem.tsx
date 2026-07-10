"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
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
  TrendingUp,
  TrendingDown,
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
  // FIX-TASAS-MODAL (2026-07-10): modal custom para tasas (no window.prompt)
  const [showRatesModal, setShowRatesModal] = useState(false);
  const [ratesModalData, setRatesModalData] = useState<Record<string, string>>({});
  const ratesModalRef = useRef<HTMLDivElement>(null);

  // FIX-FOCUS-TRAP (2026-07-10): Esc cierra modal + focus trap
  useEffect(() => {
    if (!showRatesModal) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowRatesModal(false);
    };
    document.addEventListener('keydown', handleEsc);
    // Focus al primer input
    setTimeout(() => {
      const firstInput = ratesModalRef.current?.querySelector('input');
      firstInput?.focus();
    }, 50);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [showRatesModal]);

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
                  // FIX-PAYMENT-ROWS: resetear payments[] a 1 fila cash
                  mergedItem.payments = [{
                    id: `pay_merge_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                    method: 'cash',
                    amount: mergedItem.subtotal,
                    currency: mergedItem.cash_currency || mergedItem.currency || 'CUP',
                    discount_type: null,
                    discount_value: 0,
                    discount_currency: mergedItem.cash_currency || mergedItem.currency || 'CUP',
                  }];
                  mergedItem.cash_paid = mergedItem.subtotal;
                  mergedItem.transfer_paid = 0;
                  mergedItem.zelle_paid = 0;

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
                  // FIX-PAYMENT-ROWS: resetear payments[] a 1 fila cash
                  updatedItem.payments = [{
                    id: `pay_var_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                    method: 'cash',
                    amount: updatedItem.subtotal,
                    currency: updatedItem.cash_currency || updatedItem.currency || 'CUP',
                    discount_type: null,
                    discount_value: 0,
                    discount_currency: updatedItem.cash_currency || updatedItem.currency || 'CUP',
                  }];
                  updatedItem.cash_paid = updatedItem.subtotal;
                  updatedItem.transfer_paid = 0;
                  updatedItem.zelle_paid = 0;
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
        {/* FIX-LAYOUT (2026-07-10): Moneda + Tasa + Botón Tasas en una sola fila compacta */}
        <div className="flex gap-1 items-center">
          <select
            value={item.currency || 'CUP'}
            onChange={(e) => {
              const currency = e.target.value;
              const gr = useCartStore.getState().globalRates[currency];
              const rate = (gr && gr > 0) ? gr : 1;
              let newPrice: number;
              if (currency === 'CUP') {
                newPrice = item.base_price_cup || item.price;
              } else if (rate > 1) {
                newPrice = (item.base_price_cup || item.price) / rate;
              } else {
                newPrice = item.price;
                if (currency !== 'CUP') toast.info('Edita la TASA o usa el botón Tasas.');
              }
              useCartStore.setState((state) => ({
                items: state.items.map((it) => {
                  if (it.product_id === item.product_id && it.variant_id === item.variant_id) {
                    const updatedItem = { ...it, price: newPrice, currency, exchange_rate: rate, cash_currency: currency, transfer_currency: currency };
                    updatedItem.subtotal = recalcSubtotal(updatedItem);
                    // FIX-PAYMENT-ROWS: al cambiar moneda del item, resetear payments[] a 1 fila cash con el nuevo subtotal
                    // (a menos que el usuario ya haya hecho override manual)
                    if (!updatedItem.payment_manual_override) {
                      updatedItem.payments = [{
                        id: `pay_cur_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                        method: 'cash',
                        amount: updatedItem.subtotal,
                        currency,
                        discount_type: null,
                        discount_value: 0,
                        discount_currency: currency,
                      }];
                    }
                    // Sincronizar legacy manualmente (syncLegacyFields es internal del store)
                    updatedItem.cash_paid = updatedItem.payments?.filter(p => p.method === 'cash').reduce((s, p) => s + p.amount, 0) || 0;
                    updatedItem.transfer_paid = updatedItem.payments?.filter(p => p.method === 'transfer').reduce((s, p) => s + p.amount, 0) || 0;
                    updatedItem.zelle_paid = updatedItem.payments?.filter(p => p.method === 'zelle').reduce((s, p) => s + p.amount, 0) || 0;
                    return updatedItem;
                  }
                  return it;
                }),
                lastUpdated: Date.now(),
              }));
              if (currency !== 'CUP' && rate <= 1) {
                fetch(`/api/exchange-rates?currency=${currency}&source=elToque&days=1`)
                  .then(res => res.ok ? res.json() : null)
                  .then(data => {
                    if (!data) return;
                    const rates = Array.isArray(data) ? data : (data?.rates || data?.data || []);
                    if (Array.isArray(rates) && rates.length > 0) {
                      const sorted = rates.sort((a: any, b: any) => new Date(b.rate_date || 0).getTime() - new Date(a.rate_date || 0).getTime());
                      if (sorted[0]?.rate > 0) {
                        const fetchedRate = sorted[0].rate;
                        useCartStore.getState().setGlobalRate(currency, fetchedRate);
                        useCartStore.setState((state) => ({
                          items: state.items.map((it) => {
                            if (it.product_id === item.product_id && it.variant_id === item.variant_id && it.currency === currency) {
                              const np = (item.base_price_cup || item.price) / fetchedRate;
                              const ui = { ...it, exchange_rate: fetchedRate, price: np };
                              ui.subtotal = recalcSubtotal(ui);
                              // FIX-PAYMENT-ROWS: resetear payments[] si no hay override manual
                              if (!ui.payment_manual_override) {
                                ui.payments = [{
                                  id: `pay_rate_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                                  method: 'cash',
                                  amount: ui.subtotal,
                                  currency: ui.cash_currency || ui.currency || 'CUP',
                                  discount_type: null,
                                  discount_value: 0,
                                  discount_currency: ui.cash_currency || ui.currency || 'CUP',
                                }];
                              }
                              ui.cash_paid = ui.payments?.filter(p => p.method === 'cash').reduce((s, p) => s + p.amount, 0) || 0;
                              ui.transfer_paid = ui.payments?.filter(p => p.method === 'transfer').reduce((s, p) => s + p.amount, 0) || 0;
                              ui.zelle_paid = ui.payments?.filter(p => p.method === 'zelle').reduce((s, p) => s + p.amount, 0) || 0;
                              return ui;
                            }
                            return it;
                          }),
                          lastUpdated: Date.now(),
                        }));
                        toast.success(`Tasa: 1 ${currency} = ${fetchedRate} CUP`);
                      }
                    }
                  })
                  .catch(() => {});
              }
            }}
            className="bg-background border border-border/50 rounded-lg px-1 py-2 min-h-[36px] text-[10px] font-bold shrink-0"
            aria-label={`Moneda para ${item.product.name}`}
          >
            <option value="CUP">CUP</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="MLC">MLC</option>
          </select>
          {item.currency !== 'CUP' && (
            <input
              type="number"
              step="0.01"
              value={item.exchange_rate || 1.0}
              onChange={(e) => {
                const rate = parseFloat(e.target.value) || 1.0;
                useCartStore.getState().setGlobalRate(item.currency || 'USD', rate);
                useCartStore.setState((state) => ({
                  items: state.items.map((it) => {
                    if (it.product_id === item.product_id && it.variant_id === item.variant_id) {
                      const np = it.currency === 'CUP' || rate <= 0 ? (it.base_price_cup || it.price) : (it.base_price_cup || it.price) / rate;
                      const ui = { ...it, exchange_rate: rate, price: np };
                      ui.subtotal = recalcSubtotal(ui);
                      // FIX-PAYMENT-ROWS: resetear payments[] si no hay override manual
                      if (!ui.payment_manual_override) {
                        ui.payments = [{
                          id: `pay_rate_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                          method: 'cash',
                          amount: ui.subtotal,
                          currency: ui.cash_currency || ui.currency || 'CUP',
                          discount_type: null,
                          discount_value: 0,
                          discount_currency: ui.cash_currency || ui.currency || 'CUP',
                        }];
                      }
                      ui.cash_paid = ui.payments?.filter(p => p.method === 'cash').reduce((s, p) => s + p.amount, 0) || 0;
                      ui.transfer_paid = ui.payments?.filter(p => p.method === 'transfer').reduce((s, p) => s + p.amount, 0) || 0;
                      ui.zelle_paid = ui.payments?.filter(p => p.method === 'zelle').reduce((s, p) => s + p.amount, 0) || 0;
                      return ui;
                    }
                    return it;
                  }),
                  lastUpdated: Date.now(),
                }));
              }}
              className="w-16 bg-background border border-border/50 rounded-lg px-1 py-2 min-h-[36px] text-[10px] font-bold shrink-0"
              aria-label={`Tasa para ${item.product.name}`}
            />
          )}
          <button
            type="button"
            onClick={async () => {
              const { useAuthStore } = await import('@/store');
              const token = useAuthStore.getState().token;
              const user = useAuthStore.getState().user as any;
              const storeId = user?.activeStoreId;
              if (!storeId) return;
              const res = await fetch(`/api/store-rates?storeId=${storeId}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
              });
              let currentRates: Record<string, number> = {};
              if (res.ok) { const data = await res.json(); currentRates = data.rates || {}; }
              setRatesModalData({
                USD: String(currentRates.USD || ''),
                EUR: String(currentRates.EUR || ''),
                MLC: String(currentRates.MLC || ''),
              });
              setShowRatesModal(true);
            }}
            className="text-[9px] font-black uppercase text-primary border border-primary/30 rounded-lg px-1.5 py-2 min-h-[36px] hover:bg-primary/5 shrink-0"
            title="Actualizar tasas de cambio de la tienda"
            aria-label="Actualizar tasas"
          >
            Tasas
          </button>
        </div>
      </div>
      {/* FIX-PAYMENT-ROWS (2026-07-10): Pago Mixto dinámico — N filas.
          Por defecto muestra solo 1 fila (Efectivo). El usuario puede:
          - + Agregar: añade una nueva fila (efectivo por defecto)
          - ⧉ Duplicar: clona la fila actual
          - ✕: elimina la fila (mínimo 1 siempre) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase text-muted-foreground">
            Pago Mixto
          </span>
          <span className="text-[9px] font-bold text-muted-foreground">
            {item.payments?.length || 0} fila(s)
          </span>
        </div>

        {item.payments?.map((p, idx) => {
          const MethodIcon = p.method === 'cash' ? DollarSign : p.method === 'transfer' ? Send : CreditCard;
          const methodColor = p.method === 'cash' ? 'text-success' : 'text-primary';
          // Equivalente en CUP si la moneda no es CUP
          const rateToCup = useCartStore.getState().globalRates[p.currency || 'CUP'] || item.exchange_rate || 1;
          const equivCup = p.currency === 'CUP' ? p.amount : p.amount * rateToCup;
          return (
            <div key={p.id} className="border border-border/30 rounded-lg p-2 space-y-1">
              <div className="flex flex-wrap gap-1 items-center">
                {/* Selector de método */}
                <select
                  value={p.method}
                  onChange={(e) => useCartStore.getState().updateItemPaymentRow(
                    item.product_id, item.variant_id, p.id,
                    { method: e.target.value as 'cash' | 'transfer' | 'zelle' }
                  )}
                  className="bg-background border border-border/50 rounded px-1 py-2 min-h-[36px] text-[9px] font-bold shrink-0"
                  aria-label={`Método de pago fila ${idx + 1}`}
                >
                  <option value="cash">💵 Efect.</option>
                  <option value="transfer">📱 Transf.</option>
                  <option value="zelle">💳 Zelle</option>
                </select>

                {/* Monto */}
                <div className="relative min-w-[90px] flex-1">
                  <MethodIcon className={cn("absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3", methodColor)} aria-hidden="true" />
                  <input
                    type="number"
                    value={Number((p.amount || 0).toFixed(2))}
                    onChange={(e) => useCartStore.getState().updateItemPaymentRow(
                      item.product_id, item.variant_id, p.id,
                      { amount: Math.max(0, Number(e.target.value)) }
                    )}
                    className="w-full bg-background border border-border/50 rounded-lg pl-5 pr-1 py-2 min-h-[36px] text-xs font-bold"
                    aria-label={`Monto fila ${idx + 1} para ${item.product.name}`}
                  />
                </div>

                {/* Moneda */}
                <select
                  value={p.currency || 'CUP'}
                  onChange={(e) => useCartStore.getState().updateItemPaymentRow(
                    item.product_id, item.variant_id, p.id,
                    { currency: e.target.value }
                  )}
                  className="bg-background border border-border/50 rounded-lg px-1 py-2 min-h-[36px] text-[10px] font-bold shrink-0"
                >
                  <option value="CUP">CUP</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="MLC">MLC</option>
                </select>

                {/* Tipo de ajuste (—, %, $) */}
                <select
                  value={p.discount_type || 'none'}
                  onChange={(e) => {
                    const type = e.target.value === 'none' ? null : e.target.value as 'percentage' | 'fixed';
                    useCartStore.getState().updateItemPaymentRow(
                      item.product_id, item.variant_id, p.id,
                      { discount_type: type, discount_value: type ? (p.discount_value || 0) : 0 }
                    );
                  }}
                  className="bg-background border border-border/50 rounded px-1 py-2 min-h-[36px] text-[9px] font-bold shrink-0"
                  aria-label={`Tipo de ajuste fila ${idx + 1}`}
                >
                  <option value="none">—</option>
                  <option value="percentage">%</option>
                  <option value="fixed">$</option>
                </select>

                {/* Valor del ajuste */}
                {p.discount_type && (
                  <input
                    type="number"
                    value={Number((p.discount_value || 0).toFixed(2))}
                    onChange={(e) => useCartStore.getState().updateItemPaymentRow(
                      item.product_id, item.variant_id, p.id,
                      { discount_value: parseFloat(e.target.value) || 0 }
                    )}
                    className={cn("w-14 bg-background border rounded px-1 py-2 min-h-[36px] text-[9px] font-bold shrink-0",
                      (p.discount_value || 0) < 0 ? "border-emerald-500/50 text-emerald-500"
                      : (p.discount_value || 0) > 0 ? "border-amber-500/50 text-amber-500"
                      : "border-border/50"
                    )}
                    placeholder="+/-"
                    title="Negativo = descuento, Positivo = recargo"
                  />
                )}

                {/* Botón duplicar */}
                <button
                  type="button"
                  onClick={() => useCartStore.getState().duplicateItemPayment(item.product_id, item.variant_id, p.id)}
                  className="bg-muted/30 hover:bg-muted border border-border/50 rounded px-1.5 py-2 min-h-[36px] text-[9px] font-bold shrink-0"
                  title="Duplicar esta fila"
                  aria-label={`Duplicar fila ${idx + 1}`}
                >
                  ⧉
                </button>

                {/* Botón eliminar (solo si hay más de 1 fila) */}
                {item.payments.length > 1 && (
                  <button
                    type="button"
                    onClick={() => useCartStore.getState().removeItemPayment(item.product_id, item.variant_id, p.id)}
                    className="bg-destructive/10 hover:bg-destructive/20 border border-destructive/30 text-destructive rounded px-1.5 py-2 min-h-[36px] text-[9px] font-bold shrink-0"
                    title="Eliminar esta fila"
                    aria-label={`Eliminar fila ${idx + 1}`}
                  >
                    ✕
                  </button>
                )}
              </div>
              {/* Equivalente en CUP si la moneda no es CUP */}
              {p.amount > 0 && p.currency !== 'CUP' && (
                <p className="text-[8px] text-muted-foreground ml-1">
                  ≈ {formatCurrency(equivCup)} CUP
                </p>
              )}
            </div>
          );
        })}

        {/* Botón + Agregar Pago */}
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => useCartStore.getState().addItemPayment(item.product_id, item.variant_id, 'cash')}
            className="flex-1 min-h-[36px] rounded-lg border-2 border-dashed border-primary/30 text-primary text-[10px] font-black uppercase hover:bg-primary/5 transition-colors flex items-center justify-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Agregar Pago
          </button>
        </div>
      </div>
      </div>
      )}
      {/* FIX-VALIDATION (2026-07-10): validación con descuento/recargo + monto esperado visible */}
      {/* FIX-PAYMENT-ROWS: ahora busca el ajuste activo en payments[] */}
      {(() => {
        const cartStore = useCartStore.getState();
        const subtotalCup = cartStore.getItemSubtotalCup(item);
        const paidCup = cartStore.getItemPaidCup(item);

        // Buscar la primera fila con monto > 0 Y ajuste configurado
        let expectedCup = subtotalCup;
        let adjLabel = '';
        if (item.payments && item.payments.length > 0) {
          for (const p of item.payments) {
            if (p.amount > 0 && p.discount_type && p.discount_value) {
              if (p.discount_type === 'percentage') {
                expectedCup = subtotalCup * (1 + p.discount_value / 100);
              } else {
                const rate = cartStore.globalRates[p.discount_currency || 'CUP'] || item.exchange_rate || 1;
                expectedCup = Math.max(0, subtotalCup + p.discount_value * rate);
              }
              adjLabel = ` (${p.discount_value > 0 ? '+' : ''}${p.discount_value}${p.discount_type === 'percentage' ? '%' : ''})`;
              break;
            }
          }
        } else {
          // Fallback legacy
          const hasCashAdj = item.cash_discount_type && item.cash_discount_value;
          const hasTransferAdj = item.transfer_discount_type && item.transfer_discount_value;
          const hasZelleAdj = item.zelle_discount_type && item.zelle_discount_value;
          if (item.cash_paid > 0 && hasCashAdj) {
            expectedCup = cartStore.getItemSubtotalWithMethodDiscountCup(item, 'cash');
            adjLabel = ` (${item.cash_discount_value > 0 ? '+' : ''}${item.cash_discount_value}${item.cash_discount_type === 'percentage' ? '%' : ''})`;
          } else if (item.transfer_paid > 0 && hasTransferAdj) {
            expectedCup = cartStore.getItemSubtotalWithMethodDiscountCup(item, 'transfer');
            adjLabel = ` (${item.transfer_discount_value > 0 ? '+' : ''}${item.transfer_discount_value}${item.transfer_discount_type === 'percentage' ? '%' : ''})`;
          } else if (item.zelle_paid > 0 && hasZelleAdj) {
            expectedCup = cartStore.getItemSubtotalWithMethodDiscountCup(item, 'zelle');
            adjLabel = ` (${item.zelle_discount_value > 0 ? '+' : ''}${item.zelle_discount_value}${item.zelle_discount_type === 'percentage' ? '%' : ''})`;
          }
        }

        const diff = paidCup - expectedCup;
        return (
          <div className="mt-1 space-y-0.5">
            {/* Monto esperado siempre visible */}
            <div className="text-[9px] font-bold text-muted-foreground">
              Esperado: {formatCurrency(expectedCup)} CUP{adjLabel}
            </div>
            {/* Estado de validación */}
            {Math.abs(diff) <= 0.01 ? (
              <div className="text-[10px] font-bold text-emerald-500 flex items-center gap-1">
                ✓ Pago completo
              </div>
            ) : diff > 0 ? (
              <div className="text-[10px] font-bold text-amber-500 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> Sobrepago: {formatCurrency(diff)} CUP
              </div>
            ) : (
              <div className="text-[10px] font-bold text-destructive flex items-center gap-1" role="alert">
                <TrendingDown className="w-3 h-3" /> Falta: {formatCurrency(Math.abs(diff))} CUP
              </div>
            )}
          </div>
        );
      })()}

      {/* FIX-TASAS-MODAL (2026-07-10): modal custom para actualizar tasas */}
      {showRatesModal && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/90 backdrop-blur-sm"
          onClick={() => setShowRatesModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="rates-modal-title"
        >
          <div
            ref={ratesModalRef}
            className="w-full max-w-sm bg-card border border-border/50 rounded-2xl shadow-2xl p-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <h2 id="rates-modal-title" className="text-sm font-black uppercase">Tasas de Cambio</h2>
              <button onClick={() => setShowRatesModal(false)} className="text-muted-foreground hover:text-foreground" aria-label="Cerrar">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mb-3">
              Se guardan en la tienda y persisten hasta el próximo cambio. Presiona Enter para guardar, Esc para cancelar.
            </p>
            <div className="space-y-2 mb-4">
              {['USD', 'EUR', 'MLC'].map(cur => (
                <div key={cur} className="flex items-center gap-2">
                  <span className="text-xs font-black w-12">{cur}</span>
                  <input
                    type="number"
                    step="0.01"
                    value={ratesModalData[cur] || ''}
                    onChange={(e) => setRatesModalData(prev => ({ ...prev, [cur]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') (ratesModalRef.current?.querySelector('button:last-of-type') as HTMLButtonElement)?.click(); }}
                    className="flex-1 bg-background border border-border/50 rounded-lg px-2 py-2 text-xs font-bold"
                    placeholder="0"
                    aria-label={`Tasa ${cur}`}
                  />
                  <span className="text-[10px] text-muted-foreground w-8">CUP</span>
                </div>
              ))}
            </div>
            <button
              onClick={async () => {
                const newRates: Record<string, number> = {};
                for (const cur of ['USD', 'EUR', 'MLC']) {
                  const val = parseFloat(ratesModalData[cur] || '0');
                  if (val > 0) newRates[cur] = val;
                }
                if (Object.keys(newRates).length === 0) {
                  toast.error('Ingresa al menos una tasa válida');
                  return;
                }
                const { useAuthStore } = await import('@/store');
                const token = useAuthStore.getState().token;
                const user = useAuthStore.getState().user as any;
                const storeId = user?.activeStoreId;
                if (!storeId) return;

                const saveRes = await fetch('/api/store-rates', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                  body: JSON.stringify({ storeId, rates: newRates }),
                });
                if (!saveRes.ok) { toast.error('Error al guardar tasas'); return; }

                for (const [cur, rate] of Object.entries(newRates)) {
                  useCartStore.getState().setGlobalRate(cur, rate);
                }
                useCartStore.setState((state) => ({
                  items: state.items.map((it) => {
                    if (it.currency !== 'CUP' && newRates[it.currency]) {
                      const newPrice = (it.base_price_cup || it.price) / newRates[it.currency];
                      const updatedItem = { ...it, exchange_rate: newRates[it.currency], price: newPrice };
                      updatedItem.subtotal = recalcSubtotal(updatedItem);
                      // FIX-PAYMENT-ROWS: resetear payments[] si no hay override manual
                      if (!updatedItem.payment_manual_override) {
                        updatedItem.payments = [{
                          id: `pay_rates_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                          method: 'cash',
                          amount: updatedItem.subtotal,
                          currency: updatedItem.cash_currency || updatedItem.currency || 'CUP',
                          discount_type: null,
                          discount_value: 0,
                          discount_currency: updatedItem.cash_currency || updatedItem.currency || 'CUP',
                        }];
                      }
                      updatedItem.cash_paid = updatedItem.payments?.filter(p => p.method === 'cash').reduce((s, p) => s + p.amount, 0) || 0;
                      updatedItem.transfer_paid = updatedItem.payments?.filter(p => p.method === 'transfer').reduce((s, p) => s + p.amount, 0) || 0;
                      updatedItem.zelle_paid = updatedItem.payments?.filter(p => p.method === 'zelle').reduce((s, p) => s + p.amount, 0) || 0;
                      return updatedItem;
                    }
                    return it;
                  }),
                  lastUpdated: Date.now(),
                }));

                setShowRatesModal(false);
                toast.success('Tasas actualizadas y guardadas');
              }}
              className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase hover:bg-primary/90"
            >
              Guardar Tasas
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
};
