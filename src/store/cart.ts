import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { produce } from "immer";
import type { Product, ProductVariant, TaxConfiguration, PaymentMethod } from "@/types";

// ── Notification callback (injected by UI layer) ────────────────
let _onCartNotification: ((type: "warning" | "error", message: string) => void) | null = null;

/** Inject a notification handler to decouple toasts from the store */
export function setCartNotificationHandler(
  handler: (type: "warning" | "error", message: string) => void,
) {
  _onCartNotification = handler;
}

function notify(type: "warning" | "error", message: string) {
  _onCartNotification?.(type, message);
}

export interface CartItem {
  product_id: string;
  variant_id: string | null;
  quantity: number;
  price: number;
  cost: number;
  subtotal: number;
  product: Product;
  variant?: ProductVariant | null;
  discount_type: "percentage" | "fixed" | null;
  discount_value: number;
  cash_paid: number;
  transfer_paid: number;
  // FIX-MULTI-MONEDA: moneda y tasa de cambio POR ITEM (no global)
  currency: string;
  exchange_rate: number;
}

interface CartState {
  items: CartItem[];
  discount: { type: "percentage" | "fixed"; value: number } | null;
  appliedTaxes: TaxConfiguration[];
  sessionUserId: string | null;
  storeId: string | null;
  // FIX-MULTI-MONEDA: moneda de la venta y tasa de cambio
  saleCurrency: string;
  saleExchangeRate: number;
  lastUpdated: number;
  // POS-2 MM-10: Moved from POSCart.tsx local state to global store to fix race condition
  // where the "Confirmar" button could fire with a stale selectedPayment value.
  selectedPayment: PaymentMethod;
  // POS-2 MM-7: Customer attached to the sale (null = walk-in)
  customerId: string | null;
  customerName: string | null;

  addItem: (productInput: Product | Partial<CartItem>, variant?: ProductVariant) => void;
  removeItem: (productId: string, variantId: string | null) => void;
  updateQuantity: (productId: string, variantId: string | null, quantity: number) => void;
  updateItemDiscount: (
    productId: string,
    variantId: string | null,
    type: "percentage" | "fixed" | null,
    value: number,
  ) => void;
  updateItemPayment: (
    productId: string,
    variantId: string | null,
    cashPaid: number,
    transferPaid: number,
  ) => void;
  prorateGlobalPayment: (totalCash: number, totalTransfer: number) => void;
  setDiscount: (discount: { type: "percentage" | "fixed"; value: number } | null) => void;
  toggleTax: (tax: TaxConfiguration) => void;
  getSubtotal: () => number;
  getSubtotalCup: () => number;
  getDiscountAmount: () => number;
  getTaxAmount: () => number;
  getTotal: () => number;
  clearCart: () => void;
  getItemCount: () => number;
  setCart: (saleId: string, items: CartItem[]) => void;
  setSessionUserId: (userId: string | null) => void;
  setStoreId: (storeId: string | null) => void;
  clearCartOnStoreSwitch: (newStoreId: string | null) => void;
  setSelectedPayment: (method: PaymentMethod) => void;
  setCustomer: (customerId: string | null, customerName: string | null) => void;
  // FIX-MULTI-MONEDA
  setSaleCurrency: (currency: string, exchangeRate: number) => void;
  getTotalCup: () => number;
}

const calculateItemSubtotal = (item: CartItem) => {
  const price = item.price ?? 0;
  const quantity = item.quantity ?? 0;
  const base = price * quantity;

  if (!item.discount_type || item.discount_value <= 0) return base;
  if (item.discount_type === "percentage") return base * (1 - item.discount_value / 100);
  return Math.max(0, (price - item.discount_value) * quantity);
};

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      discount: null,
      appliedTaxes: [],
      sessionUserId: null,
      storeId: null,
      // FIX-MULTI-MONEDA: defaults CUP/1.0
      saleCurrency: 'CUP',
      saleExchangeRate: 1.0,
      lastUpdated: Date.now(),
      selectedPayment: "cash" as PaymentMethod,
      customerId: null,
      customerName: null,

      setSessionUserId: (sessionUserId) => set({ sessionUserId, lastUpdated: Date.now() }),

      setStoreId: (storeId) => set({ storeId, lastUpdated: Date.now() }),

      // POS-2 MM-10: setSelectedPayment mutates the global store so that POSCartActions
      // (selector buttons), POSCartSummary (mixed-payment accordion) and POSCart
      // (confirm button) all share a single source of truth.
      setSelectedPayment: (method) => set({ selectedPayment: method, lastUpdated: Date.now() }),

      // POS-2 MM-7: Attach / detach a customer from the current cart.
      setCustomer: (customerId, customerName) =>
        set({ customerId, customerName, lastUpdated: Date.now() }),

      // FIX-MULTI-MONEDA: cambiar moneda de venta + tasa
      setSaleCurrency: (currency, exchangeRate) =>
        set({ saleCurrency: currency, saleExchangeRate: exchangeRate, lastUpdated: Date.now() }),

      // FIX-MULTI-MONEDA: total convertido a CUP sumando cada item con su propia tasa
      getTotalCup: () => {
        const subtotalCup = get().getSubtotalCup();
        const discountAmount = get().getDiscountAmount();
        const taxAmount = get().getTaxAmount();
        return Number(Math.max(0, subtotalCup - discountAmount + taxAmount).toFixed(2));
      },

      /**
       * Clears the cart when switching stores if the new store differs from the cart's store.
       * This prevents selling Store A products under Store B context.
       */
      clearCartOnStoreSwitch: (newStoreId) => {
        const currentStoreId = get().storeId;
        if (currentStoreId && newStoreId && currentStoreId !== newStoreId && get().items.length > 0) {
          set({ items: [], discount: null, appliedTaxes: [], storeId: newStoreId, lastUpdated: Date.now() });
          notify("warning", "Carrito limpiado automáticamente al cambiar de tienda");
        } else if (!currentStoreId && newStoreId) {
          set({ storeId: newStoreId, lastUpdated: Date.now() });
        }
      },

      addItem: (productInput, variant) =>
        set(
          produce((state: CartState) => {
            const product = (productInput as any).product || ((productInput as any).id ? productInput : null) as Product | null;
            const productId = product?.id || (productInput as any).product_id;
            const incomingQuantity = (productInput as any).quantity || 1;

            if (!productId) return;

            // Prevent adding products from a different store
            const productStoreId = product?.store_id || (productInput as any).store_id;
            const cartStoreId = state.storeId;
            if (cartStoreId && productStoreId && productStoreId !== cartStoreId) {
              notify("error", "No puedes agregar productos de otra tienda al carrito actual");
              return;
            }

            const existing = state.items.find(
              (i) => i.product_id === productId && (i.variant_id === (variant?.id || null) || (!i.variant_id && !variant?.id)),
            );

            if (existing) {
              const conversionFactor = variant?.conversion_factor || 1;
              const maxVariantQty = Math.floor((product?.stock_current ?? 999999) / conversionFactor);
              if (existing.quantity + incomingQuantity > maxVariantQty) {
                notify("warning", `Stock insuficiente para ${product?.name || "producto"}. Máx: ${maxVariantQty} ${variant?.name || "uds"}`);
                return;
              }
              existing.quantity += incomingQuantity;
              existing.subtotal = calculateItemSubtotal(existing);
              existing.cash_paid = existing.subtotal;
              existing.transfer_paid = 0;
            } else {
              const conversionFactor = variant?.conversion_factor || 1;
              const stock = product?.stock_current ?? 999999;
              const maxVariantQty = Math.floor(stock / conversionFactor);
              if (maxVariantQty <= 0) {
                notify("error", `Producto ${product?.name || "producto"} sin existencias.`);
                return;
              }

              let price = product?.price ?? (productInput as any).price ?? (productInput as any).price_base;

              if (!price && (productInput as any).subtotal && (productInput as any).quantity) {
                price = (productInput as any).subtotal / (productInput as any).quantity;
              }
              price = price ?? 0;

              const cost = product?.cost_price ?? product?.cost_average ?? (productInput as any).cost ?? 0;
              const newItem: CartItem = {
                product_id: productId,
                variant_id: variant?.id || null,
                quantity: incomingQuantity,
                product: product as Product,
                variant: variant || null,
                price,
                cost,
                subtotal: 0,
                discount_type: (productInput as any).discount_type || null,
                discount_value: (productInput as any).discount_value || 0,
                cash_paid: 0,
                transfer_paid: 0,
                // FIX-MULTI-MONEDA: heredar moneda y tasa del producto (POR ITEM, no global)
                currency: (productInput as any).currency || (product as any)?.price_currency || 'CUP',
                exchange_rate: (productInput as any).exchange_rate || 1.0,
              };
              newItem.subtotal = calculateItemSubtotal(newItem);
              newItem.cash_paid = newItem.subtotal;
              state.items.push(newItem);
            }
            state.lastUpdated = Date.now();
          }),
        ),

      removeItem: (productId, variantId) =>
        set(
          produce((state: CartState) => {
            state.items = state.items.filter(
              (i) =>
                !(i.product_id === productId && (i.variant_id === (variantId || null) || (!i.variant_id && !variantId))),
            );
            state.lastUpdated = Date.now();
          }),
        ),

      updateQuantity: (productId, variantId, quantity) =>
        set(
          produce((state: CartState) => {
            const item = state.items.find(
              (i) => i.product_id === productId && (i.variant_id === (variantId || null) || (!i.variant_id && !variantId)),
            );
            if (item) {
              const conversionFactor = item.variant?.conversion_factor || 1;
              const stockInBaseUnits = item.product?.stock_current ?? 999999;
              const maxVariantQty = Math.floor(stockInBaseUnits / conversionFactor);
              if (quantity > maxVariantQty) {
                notify("warning", `Stock máximo para ${item.product?.name || "producto"} es ${maxVariantQty} ${item.variant?.name || "uds"}.`);
                item.quantity = maxVariantQty;
              } else if (quantity > 0) {
                item.quantity = quantity;
              } else {
                state.items = state.items.filter(
                  (i) =>
                    !(i.product_id === productId && (i.variant_id === (variantId || null) || (!i.variant_id && !variantId))),
                );
                return;
              }
              item.subtotal = calculateItemSubtotal(item);
              item.cash_paid = item.subtotal;
              item.transfer_paid = 0;
              state.lastUpdated = Date.now();
            }
          }),
        ),

      updateItemDiscount: (productId, variantId, type, value) =>
        set(
          produce((state: CartState) => {
            const item = state.items.find(
              (i) => i.product_id === productId && (i.variant_id === (variantId || null) || (!i.variant_id && !variantId)),
            );
            if (item) {
              item.discount_type = type;
              item.discount_value = value;
              item.subtotal = calculateItemSubtotal(item);
              item.cash_paid = item.subtotal;
              item.transfer_paid = 0;
              state.lastUpdated = Date.now();
            }
          }),
        ),

      updateItemPayment: (productId, variantId, cashPaid, transferPaid) =>
        set(
          produce((state: CartState) => {
            const item = state.items.find(
              (i) => i.product_id === productId && (i.variant_id === (variantId || null) || (!i.variant_id && !variantId)),
            );
            if (item) {
              const subtotal = item.subtotal || 0;
              // Clamp: never negative, never exceed subtotal
              cashPaid = Math.max(0, Math.min(cashPaid, subtotal));
              transferPaid = Math.max(0, Math.min(transferPaid, subtotal));
              // If combined exceeds subtotal, redistribute proportionally
              if (cashPaid + transferPaid > subtotal) {
                const total = cashPaid + transferPaid;
                cashPaid = Number((cashPaid / total * subtotal).toFixed(2));
                transferPaid = Number((subtotal - cashPaid).toFixed(2));
              }
              item.cash_paid = cashPaid;
              item.transfer_paid = transferPaid;
              state.lastUpdated = Date.now();
            }
          }),
        ),

      prorateGlobalPayment: (totalCash, totalTransfer) =>
        set(
          produce((state: CartState) => {
            // POS-3b audit P0.2: Fix bug con descuento global + pago mixto.
            // ANTES: proration usaba suma de subtotales de items como base.
            //   Si había descuento global activo, getTotal() < suma de subtotales,
            //   y la validación en usePOSCheckout fallaba porque
            //   item.cash_paid + item.transfer_paid > item.subtotal.
            // AHORA: usamos el subtotal ajustado por el descuento global prorrateado
            //   por peso de cada item. Así item.cash+transfer = item.subtotal_adjusted.
            const grossSubtotal = state.items.reduce((acc, item) => acc + item.subtotal, 0);
            if (grossSubtotal <= 0) return;

            // Calcular descuento global proporcional por item
            const globalDiscountAmount = state.discount && state.discount.value > 0
              ? (state.discount.type === "percentage"
                ? (grossSubtotal * state.discount.value) / 100
                : Math.min(state.discount.value, grossSubtotal))
              : 0;

            // Subtotal ajustado total (post-descuento)
            const adjustedSubtotal = Math.max(0, grossSubtotal - globalDiscountAmount);
            if (adjustedSubtotal <= 0) return;

            // Clamp de los totales recibidos al adjustedSubtotal (no pagar más del total real)
            const clampedCash = Math.min(totalCash, adjustedSubtotal);
            const clampedTransfer = Math.min(totalTransfer, adjustedSubtotal - clampedCash);

            let remainingCash = clampedCash;
            let remainingTransfer = clampedTransfer;
            const itemCount = state.items.length;

            state.items.forEach((item, index) => {
              // Peso del item sobre el subtotal bruto (proporcionalidad)
              const weight = item.subtotal / grossSubtotal;
              // Subtotal ajustado de este item = bruto - porción del descuento global
              const itemAdjustedSubtotal = Math.max(
                0,
                item.subtotal - globalDiscountAmount * weight,
              );

              if (index === itemCount - 1) {
                // Último item absorbe el remainder para evitar drift por redondeo
                item.cash_paid = Number(remainingCash.toFixed(2));
                item.transfer_paid = Number(remainingTransfer.toFixed(2));
              } else {
                const itemCash = Number((clampedCash * weight).toFixed(2));
                const itemTransfer = Number((clampedTransfer * weight).toFixed(2));

                // Clamp: no pagar más del subtotal ajustado del item
                item.cash_paid = Math.min(itemCash, itemAdjustedSubtotal);
                item.transfer_paid = Math.min(
                  itemTransfer,
                  Math.max(0, itemAdjustedSubtotal - item.cash_paid),
                );

                remainingCash -= item.cash_paid;
                remainingTransfer -= item.transfer_paid;
              }
            });
            state.lastUpdated = Date.now();
          }),
        ),

      setDiscount: (discount) => set({ discount, lastUpdated: Date.now() }),

      toggleTax: (tax) =>
        set(
          produce((state: CartState) => {
            const index = state.appliedTaxes.findIndex((t) => t.id === tax.id);
            if (index > -1) {
              state.appliedTaxes.splice(index, 1);
            } else {
              state.appliedTaxes.push(tax);
            }
            state.lastUpdated = Date.now();
          }),
        ),

      getSubtotal: () => {
        // FIX-MULTI-MONEDA: el subtotal es la suma directa (en monedas mixtas)
        // Para comparar, usar getSubtotalCup()
        const subtotal = get().items.reduce((acc, item) => acc + (item.subtotal || 0), 0);
        return Number(subtotal.toFixed(2));
      },

      // FIX-MULTI-MONEDA: subtotal convertido a CUP sumando cada item con su tasa
      getSubtotalCup: () => {
        const subtotal = get().items.reduce((acc, item) => {
          const itemCup = (item.subtotal || 0) * (item.exchange_rate || 1.0);
          return acc + itemCup;
        }, 0);
        return Number(subtotal.toFixed(2));
      },

      getDiscountAmount: () => {
        const subtotal = get().getSubtotal();
        const { discount } = get();
        if (!discount || discount.value <= 0) return 0;

        if (discount.type === "percentage") {
          return Number(((subtotal * discount.value) / 100).toFixed(2));
        }
        return discount.value;
      },

      getTaxAmount: () => {
        const subtotal = get().getSubtotal();
        const discountAmount = get().getDiscountAmount();
        const baseAmount = Math.max(0, subtotal - discountAmount);
        const { appliedTaxes } = get();

        const tax = appliedTaxes.reduce((totalTax, tax) => {
          let taxValue = 0;
          if (tax.type === "percentage") {
            const taxableAmount = Math.max(0, baseAmount - (tax.min_exempt || 0));
            taxValue = (taxableAmount * tax.value) / 100;
          } else {
            taxValue = tax.value;
          }
          return totalTax + taxValue;
        }, 0);
        return Number(tax.toFixed(2));
      },

      getTotal: () => {
        const subtotal = get().getSubtotal();
        const discountAmount = get().getDiscountAmount();
        const taxAmount = get().getTaxAmount();
        return Number(Math.max(0, subtotal - discountAmount + taxAmount).toFixed(2));
      },

      clearCart: () => set({
        items: [],
        discount: null,
        appliedTaxes: [],
        // POS-2 MM-10/MM-7: preserve selectedPayment on clearCart (default UX: most cashiers
        // repeatedly sell with the same method) but drop the customer.
        customerId: null,
        customerName: null,
        // FIX-MULTI-MONEDA: resetear moneda de venta a CUP al limpiar
        saleCurrency: 'CUP',
        saleExchangeRate: 1.0,
        lastUpdated: Date.now(),
      }),

      getItemCount: () => {
        return get().items.reduce((acc, item) => acc + (item.quantity || 0), 0);
      },

      setCart: (_saleId, items) => set({ items, lastUpdated: Date.now() }),
    }),
    {
      name: "pos-cart-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        items: state.items,
        discount: state.discount,
        appliedTaxes: state.appliedTaxes,
        sessionUserId: state.sessionUserId,
        storeId: state.storeId,
        lastUpdated: state.lastUpdated,
        // POS-2 MM-10: persist selectedPayment so reloads during a sale keep the method.
        selectedPayment: state.selectedPayment,
        // POS-2 MM-7: deliberately NOT persisting customerId — a stale customer on a
        // fresh session is worse than re-selecting.
      }),
      onRehydrateStorage: () => (state) => {
        if (state && state.lastUpdated && Date.now() - state.lastUpdated > 8 * 60 * 60 * 1000) {
          state.items = [];
          state.discount = null;
          state.appliedTaxes = [];
          state.selectedPayment = "cash";
          state.customerId = null;
          state.customerName = null;
          state.lastUpdated = Date.now();
        }
      }
    },
  ),
);
