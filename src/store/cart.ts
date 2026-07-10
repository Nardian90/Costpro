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
  // FIX-BASE-PRICE (2026-07-10): precio original en CUP, inmutable.
  // Se setea al agregar el item al carrito y NUNCA cambia.
  // Todas las conversiones se hacen desde este precio base.
  base_price_cup: number;
  cost: number;
  subtotal: number;
  product: Product;
  variant?: ProductVariant | null;
  discount_type: "percentage" | "fixed" | null;
  discount_value: number;
  // FIX-DISCOUNT-CURRENCY-ITEM (2026-07-06): moneda del descuento por item
  discount_currency: string;
  cash_paid: number;
  transfer_paid: number;
  // FIX-ZELLE (2026-07-06): agregar zelle_paid para pago mixto con Zelle
  zelle_paid: number;
  // FIX-PAYMENT-METHOD-CURRENCY (2026-07-06): moneda por método de pago del item
  cash_currency: string;
  transfer_currency: string;
  zelle_currency: string;
  // FIX-DISCOUNT-PER-METHOD (2026-07-07): descuento individual por método de pago
  // FIX-SURCHARGE (2026-07-10): también recargo (% o $) por método
  // Cada método puede tener descuento O recargo: tipo (% o $), valor, y moneda
  cash_discount_type: "percentage" | "fixed" | null;
  cash_discount_value: number;
  cash_discount_currency: string;
  cash_surcharge_type: "percentage" | "fixed" | null;
  cash_surcharge_value: number;
  transfer_discount_type: "percentage" | "fixed" | null;
  transfer_discount_value: number;
  transfer_discount_currency: string;
  transfer_surcharge_type: "percentage" | "fixed" | null;
  transfer_surcharge_value: number;
  zelle_discount_type: "percentage" | "fixed" | null;
  zelle_discount_value: number;
  zelle_discount_currency: string;
  zelle_surcharge_type: "percentage" | "fixed" | null;
  zelle_surcharge_value: number;
  // FIX-MULTI-MONEDA: moneda y tasa de cambio POR ITEM (no global)
  currency: string;
  exchange_rate: number;
  // FIX-PAYMENT-MODE (2026-07-06): indica si el usuario editó manualmente los pagos de este item
  payment_manual_override: boolean;
}

// FIX-MIXED-PAYMENT (2026-07-06): eliminado MixedPayment interface (dead code)
// La consolidación de pagos se hace via getConsolidatedPayments() que lee directo
// de los items, sin necesidad de un array paralelo.

interface CartState {
  items: CartItem[];
  discount: { type: "percentage" | "fixed"; value: number; currency?: string } | null;
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
    zellePaid?: number,
    methodCurrencies?: { cash?: string; transfer?: string; zelle?: string },
  ) => void;
  prorateGlobalPayment: (totalCash: number, totalTransfer: number, totalZelle?: number) => void;
  setDiscount: (discount: { type: "percentage" | "fixed"; value: number; currency?: string } | null) => void;
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
  // FIX-PAYMENT-MODE (2026-07-06): detectar si el usuario especificó pagos por producto
  isPaymentModeByProduct: () => boolean;
  // FIX-PAYMENT-METHOD-CURRENCY: consolidar pagos por moneda (para tab Pago readonly)
  getConsolidatedPayments: () => Record<string, { cash: number; transfer: number; zelle: number }>;
  // FIX-GLOBAL-RATES: tasas de cambio manuales editables (se arrastran hasta actualizar)
  globalRates: Record<string, number>;
  setGlobalRate: (currency: string, rate: number) => void;
  // FIX-MULTI-CURRENCY-CORE: helpers de conversión a CUP
  getItemSubtotalCup: (item: CartItem) => number;
  getItemPaidCup: (item: CartItem) => number;
  // FIX-DISCOUNT-PER-METHOD: subtotal ajustado con descuento del método específico
  getItemSubtotalWithMethodDiscountCup: (item: CartItem, method: 'cash' | 'transfer' | 'zelle') => number;
}

const calculateItemSubtotal = (item: CartItem) => {
  const price = item.price ?? 0;
  const quantity = item.quantity ?? 0;
  const base = price * quantity;

  if (!item.discount_type || item.discount_value <= 0) return base;
  if (item.discount_type === "percentage") return base * (1 - item.discount_value / 100);
  return Math.max(0, (price - item.discount_value) * quantity);
};

// FIX-MULTI-CURRENCY-CORE (2026-07-07): función auxiliar para obtener la tasa
// de conversión de cualquier moneda a CUP.
// Prioridad: globalRates (manuales) > exchange_rate del item > 1 (CUP)
function getRateToCup(currency: string, itemRate: number, globalRates: Record<string, number>): number {
  if (currency === 'CUP') return 1;
  // Usar tasa manual global si existe (el usuario la editó en el modal)
  if (globalRates[currency] && globalRates[currency] > 0) return globalRates[currency];
  // Fallback: tasa del item
  return itemRate || 1;
}

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
      // FIX-GLOBAL-RATES: tasas manuales (default vacío, se llenan al editar)
      globalRates: {},

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

      // FIX-GLOBAL-RATES: actualizar tasa manual (se arrastra hasta volver a editar)
      setGlobalRate: (currency, rate) =>
        set((state) => ({ globalRates: { ...state.globalRates, [currency]: rate }, lastUpdated: Date.now() })),

      // FIX-MULTI-MONEDA: total convertido a CUP sumando cada item con su propia tasa
      getTotalCup: () => {
        const subtotalCup = get().getSubtotalCup();
        const discountAmount = get().getDiscountAmount();
        const taxAmount = get().getTaxAmount();
        return Number(Math.max(0, subtotalCup - discountAmount + taxAmount).toFixed(2));
      },

      // FIX-PAYMENT-MODE: detectar si al menos un item tiene payment_manual_override=true
      isPaymentModeByProduct: () => {
        return get().items.some(i => i.payment_manual_override === true);
      },

      // FIX-PAYMENT-METHOD-CURRENCY: consolidar pagos por moneda
      // Retorna: { 'CUP': {cash: X, transfer: Y, zelle: Z}, 'USD': {cash:..., transfer:..., zelle:...} }
      getConsolidatedPayments: () => {
        const result: Record<string, { cash: number; transfer: number; zelle: number }> = {};
        for (const item of get().items) {
          if (item.cash_paid > 0) {
            const c = item.cash_currency || 'CUP';
            if (!result[c]) result[c] = { cash: 0, transfer: 0, zelle: 0 };
            result[c].cash += item.cash_paid;
          }
          if (item.transfer_paid > 0) {
            const c = item.transfer_currency || 'CUP';
            if (!result[c]) result[c] = { cash: 0, transfer: 0, zelle: 0 };
            result[c].transfer += item.transfer_paid;
          }
          if (item.zelle_paid > 0) {
            const c = item.zelle_currency || 'USD';
            if (!result[c]) result[c] = { cash: 0, transfer: 0, zelle: 0 };
            result[c].zelle += item.zelle_paid;
          }
        }
        return result;
      },

      // FIX-MULTI-CURRENCY-CORE (2026-07-07): helpers para conversión a CUP
      // FIX-BASE-PRICE (2026-07-10): usar base_price_cup como referencia inmutable
      getItemSubtotalCup: (item: CartItem) => {
        // FIX-BASE-PRICE: el subtotal en CUP SIEMPRE se calcula desde base_price_cup
        // Esto evita que conversiones múltiples corrompan el valor
        const baseSubtotalCup = (item.base_price_cup || item.price || 0) * (item.quantity || 1);
        // Aplicar descuento del item si existe
        if (item.discount_type && item.discount_value > 0) {
          if (item.discount_type === 'percentage') {
            return baseSubtotalCup * (1 - item.discount_value / 100);
          }
          return Math.max(0, baseSubtotalCup - item.discount_value);
        }
        return baseSubtotalCup;
      },

      getItemPaidCup: (item: CartItem) => {
        const rates = get().globalRates;
        const cashCup = (item.cash_paid || 0) * getRateToCup(item.cash_currency || 'CUP', item.exchange_rate || 1, rates);
        const transferCup = (item.transfer_paid || 0) * getRateToCup(item.transfer_currency || 'CUP', item.exchange_rate || 1, rates);
        const zelleCup = (item.zelle_paid || 0) * getRateToCup(item.zelle_currency || 'USD', item.exchange_rate || 1, rates);
        return cashCup + transferCup + zelleCup;
      },

      // FIX-B3 (2026-07-10): descuento/recargo unificado — positivo=recargo, negativo=descuento
      getItemSubtotalWithMethodDiscountCup: (item: CartItem, method: 'cash' | 'transfer' | 'zelle') => {
        const baseSubtotalCup = get().getItemSubtotalCup(item);
        const dtype = method === 'cash' ? item.cash_discount_type
          : method === 'transfer' ? item.transfer_discount_type
          : item.zelle_discount_type;
        const dvalue = method === 'cash' ? item.cash_discount_value
          : method === 'transfer' ? item.transfer_discount_value
          : item.zelle_discount_value;

        if (!dtype || !dvalue || dvalue === 0) return baseSubtotalCup;

        let result = baseSubtotalCup;
        if (dtype === 'percentage') {
          // Positivo = recargo (×(1+val/100)), Negativo = descuento (×(1+val/100))
          // Ej: +5% → 1600×1.05=1680, -5% → 1600×0.95=1520
          result = result * (1 + dvalue / 100);
        } else {
          // fixed: positivo = recargo (+val), negativo = descuento (-val)
          // Ej: +50 → 1650, -50 → 1550
          const dcurrency = method === 'cash' ? item.cash_discount_currency
            : method === 'transfer' ? item.transfer_discount_currency
            : item.zelle_discount_currency;
          const rate = getRateToCup(dcurrency || 'CUP', item.exchange_rate || 1, get().globalRates);
          result = Math.max(0, result + dvalue * rate);
        }
        return result;
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
              // FIX-P2-8: guardar contra conversion_factor=0
              const safeFactor = conversionFactor > 0 ? conversionFactor : 1;
              const maxVariantQty = Math.floor((product?.stock_current ?? 999999) / safeFactor);
              // FIX-P1-4: validar stock AGREGADO de todos los items del mismo producto
              const totalBaseUnits = state.items
                .filter(i => i.product_id === productId)
                .reduce((sum, i) => sum + (i.quantity * (i.variant?.conversion_factor || 1)), 0);
              const newBaseUnits = totalBaseUnits + (incomingQuantity * safeFactor);
              if (newBaseUnits > (product?.stock_current ?? 999999)) {
                notify("warning", `Stock insuficiente para ${product?.name || "producto"}. Disponible: ${product?.stock_current ?? 0} uds base`);
                return;
              }
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
                // FIX-BASE-PRICE: guardar precio original en CUP (inmutable)
                base_price_cup: (product as any)?.price_currency && (product as any).price_currency !== 'CUP'
                  ? price * ((product as any).exchange_rate || 1) // si el producto ya viene en USD, convertir a CUP
                  : price, // si viene en CUP, usar directo
                cost,
                subtotal: 0,
                discount_type: (productInput as any).discount_type || null,
                discount_value: (productInput as any).discount_value || 0,
                discount_currency: (productInput as any).discount_currency || 'CUP',
                cash_paid: 0,
                transfer_paid: 0,
                zelle_paid: 0,
                // FIX-DISCOUNT-PER-METHOD: defaults sin descuento
                cash_discount_type: null,
                cash_discount_value: 0,
                cash_discount_currency: 'CUP',
                cash_surcharge_type: null,
                cash_surcharge_value: 0,
                transfer_discount_type: null,
                transfer_discount_value: 0,
                transfer_discount_currency: 'CUP',
                transfer_surcharge_type: null,
                transfer_surcharge_value: 0,
                zelle_discount_type: null,
                zelle_discount_value: 0,
                zelle_discount_currency: 'USD',
                zelle_surcharge_type: null,
                zelle_surcharge_value: 0,
                // FIX-PAYMENT-METHOD-CURRENCY: defaults heredan la moneda del item
                cash_currency: (productInput as any).currency || (product as any)?.price_currency || 'CUP',
                transfer_currency: (productInput as any).currency || (product as any)?.price_currency || 'CUP',
                zelle_currency: 'USD', // Zelle default USD
                payment_manual_override: false,
                // FIX-MULTI-MONEDA: heredar moneda y tasa del producto (POR ITEM, no global)
                currency: (productInput as any).currency || (product as any)?.price_currency || 'CUP',
                exchange_rate: (productInput as any).exchange_rate || 1.0,
              };
              newItem.subtotal = calculateItemSubtotal(newItem);
              newItem.cash_paid = newItem.subtotal;
              newItem.zelle_paid = 0;
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
              item.zelle_paid = 0;
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
              item.zelle_paid = 0;
              state.lastUpdated = Date.now();
            }
          }),
        ),

      updateItemPayment: (productId, variantId, cashPaid, transferPaid, zellePaid = 0, methodCurrencies) =>
        set(
          produce((state: CartState) => {
            const item = state.items.find(
              (i) => i.product_id === productId && (i.variant_id === (variantId || null) || (!i.variant_id && !variantId)),
            );
            if (item) {
              // FIX-B2 (2026-07-10): NO clampear contra subtotal en moneda mixta.
              // El clampeo anterior mezclaba monedas (min(5000 CUP, 50 USD) = 50).
              // Solo asegurar valores no negativos. La validación de descuadre
              // se hace en CUP en la UI (getItemPaidCup vs getItemSubtotalCup).
              cashPaid = Math.max(0, cashPaid);
              zellePaid = Math.max(0, zellePaid);
              transferPaid = Math.max(0, transferPaid);
              item.cash_paid = cashPaid;
              item.transfer_paid = transferPaid;
              item.zelle_paid = zellePaid;
              // FIX-PAYMENT-METHOD-CURRENCY: actualizar monedas si se pasan
              if (methodCurrencies?.cash) item.cash_currency = methodCurrencies.cash;
              if (methodCurrencies?.transfer) item.transfer_currency = methodCurrencies.transfer;
              if (methodCurrencies?.zelle) item.zelle_currency = methodCurrencies.zelle;
              // Sincronizar discount_currency con la moneda del pago
              item.cash_discount_currency = item.cash_currency;
              item.transfer_discount_currency = item.transfer_currency;
              item.zelle_discount_currency = item.zelle_currency;
              // FIX-PAYMENT-MODE: marcar override manual
              item.payment_manual_override = true;
              state.lastUpdated = Date.now();
            }
          }),
        ),

      prorateGlobalPayment: (totalCash, totalTransfer, totalZelle = 0) =>
        set(
          produce((state: CartState) => {
            const grossSubtotal = state.items.reduce((acc, item) => acc + item.subtotal, 0);
            if (grossSubtotal <= 0) return;

            const globalDiscountAmount = state.discount && state.discount.value > 0
              ? (state.discount.type === "percentage"
                ? (grossSubtotal * state.discount.value) / 100
                : Math.min(state.discount.value, grossSubtotal))
              : 0;

            const adjustedSubtotal = Math.max(0, grossSubtotal - globalDiscountAmount);
            if (adjustedSubtotal <= 0) return;

            // FIX-ZELLE: clamp de los 3 métodos de pago
            const clampedCash = Math.min(totalCash, adjustedSubtotal);
            const clampedZelle = Math.min(totalZelle, adjustedSubtotal - clampedCash);
            const clampedTransfer = Math.min(totalTransfer, adjustedSubtotal - clampedCash - clampedZelle);

            let remainingCash = clampedCash;
            let remainingTransfer = clampedTransfer;
            let remainingZelle = clampedZelle;
            const itemCount = state.items.length;

            state.items.forEach((item, index) => {
              const weight = item.subtotal / grossSubtotal;
              const itemAdjustedSubtotal = Math.max(
                0,
                item.subtotal - globalDiscountAmount * weight,
              );
              // FIX-BUG-2 (2026-07-06): resetear payment_manual_override al prorratear global
              item.payment_manual_override = false;

              if (index === itemCount - 1) {
                item.cash_paid = Number(remainingCash.toFixed(2));
                item.transfer_paid = Number(remainingTransfer.toFixed(2));
                item.zelle_paid = Number(remainingZelle.toFixed(2));
              } else {
                const itemCash = Number((clampedCash * weight).toFixed(2));
                const itemZelle = Number((clampedZelle * weight).toFixed(2));
                const itemTransfer = Number((clampedTransfer * weight).toFixed(2));

                item.cash_paid = Math.min(itemCash, itemAdjustedSubtotal);
                item.zelle_paid = Math.min(itemZelle, Math.max(0, itemAdjustedSubtotal - item.cash_paid));
                item.transfer_paid = Math.min(
                  itemTransfer,
                  Math.max(0, itemAdjustedSubtotal - item.cash_paid - item.zelle_paid),
                );

                remainingCash -= item.cash_paid;
                remainingTransfer -= item.transfer_paid;
                remainingZelle -= item.zelle_paid;
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

      // FIX-G4: getDiscountAmount usa getSubtotalCup() para que el descuento
      // se calcule sobre el total en CUP, no sobre la suma mixta de monedas.
      getDiscountAmount: () => {
        const subtotalCup = get().getSubtotalCup();
        const { discount } = get();
        if (!discount || discount.value <= 0) return 0;

        if (discount.type === "percentage") {
          return Number(((subtotalCup * discount.value) / 100).toFixed(2));
        }
        // FIX-B1 (2026-07-10): usar getRateToCup con globalRates (no saleExchangeRate que siempre es 1.0)
        const discountCurrency = discount.currency || 'CUP';
        if (discountCurrency === 'CUP') return discount.value;
        const rate = getRateToCup(discountCurrency, 1, get().globalRates);
        return Number((discount.value * rate).toFixed(2));
      },

      // FIX-G4: getTaxAmount usa getSubtotalCup() y getDiscountAmount() (que ya
      // retorna en CUP) para que el impuesto se calcule sobre la base en CUP.
      getTaxAmount: () => {
        const subtotalCup = get().getSubtotalCup();
        const discountAmount = get().getDiscountAmount();
        const baseAmount = Math.max(0, subtotalCup - discountAmount);
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

      // FIX-P1-C: getTotal usa getSubtotalCup() para consistencia con descuentos/impuestos
      getTotal: () => {
        const subtotalCup = get().getSubtotalCup();
        const discountAmount = get().getDiscountAmount();
        const taxAmount = get().getTaxAmount();
        return Number(Math.max(0, subtotalCup - discountAmount + taxAmount).toFixed(2));
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
        // FIX-GLOBAL-RATES: resetear tasas manuales
        globalRates: {},
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
