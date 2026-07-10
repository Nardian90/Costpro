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

// FIX-PAYMENT-ROWS (2026-07-10): cada item puede tener N filas de pago,
// permitiendo múltiples filas del mismo método (ej: 2 efectivos, uno CUP y otro USD).
// Antes: 3 campos fijos (cash_paid/transfer_paid/zelle_paid) que no permitían
// tener 2 efectivos en distintas monedas.
export interface PaymentRow {
  id: string;  // único dentro del item
  method: 'cash' | 'transfer' | 'zelle';
  amount: number;
  currency: string;
  // FIX-B3 (2026-07-10): unificado — positivo=recargo, negativo=descuento
  discount_type: 'percentage' | 'fixed' | null;
  discount_value: number;
  discount_currency: string;
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
  // FIX-PAYMENT-ROWS (2026-07-10): array de filas de pago (reemplaza los campos fijos)
  payments: PaymentRow[];
  // ── LEGACY (mantenidos por compatibilidad con backend RPC y código no migrado) ──
  // Se sincronizan desde payments[] en cada update. NO editar directamente.
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
  // FIX-CONSISTENCY (2026-07-10): total esperado considerando ajustes por método.
  // Suma getItemSubtotalWithMethodDiscountCup por cada item eligiendo el método
  // activo (con pago + ajuste). Esto reemplaza el cálculo antiguo que solo
  // usaba getSubtotalCup() - getDiscountAmount() e ignoraba recargos/descuentos
  // por método, causando descuadre entre tab Items y tab Pago.
  getExpectedTotalCup: () => number;
  // FIX-PAYMENT-ROWS (2026-07-10): acciones para gestionar filas de pago dinámicas
  addItemPayment: (productId: string, variantId: string | null, method?: 'cash' | 'transfer' | 'zelle') => void;
  removeItemPayment: (productId: string, variantId: string | null, paymentId: string) => void;
  duplicateItemPayment: (productId: string, variantId: string | null, paymentId: string) => void;
  updateItemPaymentRow: (productId: string, variantId: string | null, paymentId: string, updates: Partial<PaymentRow>) => void;
}

const calculateItemSubtotal = (item: CartItem) => {
  const price = item.price ?? 0;
  const quantity = item.quantity ?? 0;
  const base = price * quantity;

  if (!item.discount_type || item.discount_value <= 0) return base;
  if (item.discount_type === "percentage") return base * (1 - item.discount_value / 100);
  return Math.max(0, (price - item.discount_value) * quantity);
};

// FIX-PAYMENT-ROWS (2026-07-10): generar IDs únicos para PaymentRow
function generatePaymentId(): string {
  return `pay_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// FIX-PAYMENT-ROWS (2026-07-10): sincronizar campos legacy desde payments[].
// Esto mantiene compatibilidad con el backend RPC (create_sale) y código no migrado
// que todavía lee cash_paid/transfer_paid/zelle_paid directamente.
// Se llama después de cada mutación a payments[].
function syncLegacyFields(item: CartItem): void {
  // Reset legacy fields
  item.cash_paid = 0;
  item.transfer_paid = 0;
  item.zelle_paid = 0;
  // Para monedas legacy: tomar la del primer pago de cada método
  let cashCur = item.cash_currency || 'CUP';
  let transferCur = item.transfer_currency || 'CUP';
  let zelleCur = item.zelle_currency || 'USD';
  // Reset discount legacy fields
  item.cash_discount_type = null;
  item.cash_discount_value = 0;
  item.cash_discount_currency = 'CUP';
  item.transfer_discount_type = null;
  item.transfer_discount_value = 0;
  item.transfer_discount_currency = 'CUP';
  item.zelle_discount_type = null;
  item.zelle_discount_value = 0;
  item.zelle_discount_currency = 'USD';

  for (const p of item.payments) {
    if (p.method === 'cash') {
      item.cash_paid += p.amount;
      cashCur = p.currency;
      // Si la fila tiene ajuste, reflejarlo en legacy (última fila con ajuste gana)
      if (p.discount_type && p.discount_value) {
        item.cash_discount_type = p.discount_type;
        item.cash_discount_value = p.discount_value;
        item.cash_discount_currency = p.discount_currency;
      }
    } else if (p.method === 'transfer') {
      item.transfer_paid += p.amount;
      transferCur = p.currency;
      if (p.discount_type && p.discount_value) {
        item.transfer_discount_type = p.discount_type;
        item.transfer_discount_value = p.discount_value;
        item.transfer_discount_currency = p.discount_currency;
      }
    } else if (p.method === 'zelle') {
      item.zelle_paid += p.amount;
      zelleCur = p.currency;
      if (p.discount_type && p.discount_value) {
        item.zelle_discount_type = p.discount_type;
        item.zelle_discount_value = p.discount_value;
        item.zelle_discount_currency = p.discount_currency;
      }
    }
  }
  item.cash_currency = cashCur;
  item.transfer_currency = transferCur;
  item.zelle_currency = zelleCur;
}

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

      // FIX-CONSISTENCY (2026-07-10): total esperado considerando ajustes por método.
      // FIX-PAYMENT-ROWS (2026-07-10): ahora itera sobre payments[] para encontrar
      // la primera fila con ajuste activo y aplica ese ajuste al subtotal del item.
      // Si ninguna fila tiene ajuste, usa el subtotal base.
      getExpectedTotalCup: () => {
        const sum = get().items.reduce((acc, item) => {
          let expected = get().getItemSubtotalCup(item);
          // FIX-PAYMENT-ROWS: buscar la primera fila con monto > 0 Y ajuste configurado
          if (item.payments && item.payments.length > 0) {
            for (const p of item.payments) {
              if (p.amount > 0 && p.discount_type && p.discount_value) {
                // Aplicar el ajuste de esta fila al subtotal del item
                const baseSubtotalCup = get().getItemSubtotalCup(item);
                if (p.discount_type === 'percentage') {
                  expected = baseSubtotalCup * (1 + p.discount_value / 100);
                } else {
                  const rate = getRateToCup(p.discount_currency || 'CUP', item.exchange_rate || 1, get().globalRates);
                  expected = Math.max(0, baseSubtotalCup + p.discount_value * rate);
                }
                break;  // solo el primer ajuste activo cuenta
              }
            }
          } else {
            // Fallback legacy
            const hasCashAdj = item.cash_discount_type && item.cash_discount_value;
            const hasTransferAdj = item.transfer_discount_type && item.transfer_discount_value;
            const hasZelleAdj = item.zelle_discount_type && item.zelle_discount_value;
            if (item.cash_paid > 0 && hasCashAdj) {
              expected = get().getItemSubtotalWithMethodDiscountCup(item, 'cash');
            } else if (item.transfer_paid > 0 && hasTransferAdj) {
              expected = get().getItemSubtotalWithMethodDiscountCup(item, 'transfer');
            } else if (item.zelle_paid > 0 && hasZelleAdj) {
              expected = get().getItemSubtotalWithMethodDiscountCup(item, 'zelle');
            }
          }
          return acc + expected;
        }, 0);
        return Number(sum.toFixed(2));
      },

      // FIX-MULTI-MONEDA: total convertido a CUP sumando cada item con su propia tasa
      // FIX-CONSISTENCY (2026-07-10): ahora usa getExpectedTotalCup() para considerar
      // recargos/descuentos por método. Antes usaba getSubtotalCup() - getDiscountAmount()
      // que ignoraba los ajustes por método y causaba descuadre entre Items y Pago.
      // El descuento global (state.discount) ya NO se resta aquí — los ajustes por
      // método son la fuente de verdad y se consolidan en getExpectedTotalCup().
      getTotalCup: () => {
        const expectedTotal = get().getExpectedTotalCup();
        const taxAmount = get().getTaxAmount();
        return Number(Math.max(0, expectedTotal + taxAmount).toFixed(2));
      },

      // FIX-PAYMENT-MODE: detectar si al menos un item tiene payment_manual_override=true
      isPaymentModeByProduct: () => {
        return get().items.some(i => i.payment_manual_override === true);
      },

      // FIX-PAYMENT-METHOD-CURRENCY: consolidar pagos por moneda
      // FIX-PAYMENT-ROWS (2026-07-10): ahora itera sobre payments[] en vez de campos fijos.
      // Retorna: { 'CUP': {cash: X, transfer: Y, zille: Z}, 'USD': {cash:..., transfer:..., zelle:...} }
      getConsolidatedPayments: () => {
        const result: Record<string, { cash: number; transfer: number; zelle: number }> = {};
        for (const item of get().items) {
          // FIX-PAYMENT-ROWS: usar payments[] si existe, sino fallback a legacy
          if (item.payments && item.payments.length > 0) {
            for (const p of item.payments) {
              if (p.amount > 0) {
                const c = p.currency || 'CUP';
                if (!result[c]) result[c] = { cash: 0, transfer: 0, zelle: 0 };
                result[c][p.method] += p.amount;
              }
            }
          } else {
            // Fallback legacy
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
        // FIX-PAYMENT-ROWS (2026-07-10): sumar sobre payments[] en vez de campos fijos
        if (item.payments && item.payments.length > 0) {
          return item.payments.reduce((sum, p) => {
            return sum + (p.amount || 0) * getRateToCup(p.currency || 'CUP', item.exchange_rate || 1, rates);
          }, 0);
        }
        // Fallback legacy
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
              // FIX-PAYMENT-ROWS: actualizar el monto de la primera fila de pago cash
              if (existing.payments && existing.payments.length > 0) {
                const firstCash = existing.payments.find(p => p.method === 'cash');
                if (firstCash) {
                  firstCash.amount = existing.subtotal;
                } else {
                  // Si no hay fila cash, asegurar que la primera fila tenga el subtotal
                  existing.payments[0].amount = existing.subtotal;
                }
                syncLegacyFields(existing);
              } else {
                existing.cash_paid = existing.subtotal;
                existing.transfer_paid = 0;
              }
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
              const itemCurrency = (productInput as any).currency || (product as any)?.price_currency || 'CUP';
              // FIX-PAYMENT-ROWS: inicializar con 1 fila de pago default (efectivo)
              const initialSubtotal = price * incomingQuantity;
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
                // FIX-PAYMENT-ROWS: 1 fila default en efectivo con el subtotal
                payments: [{
                  id: generatePaymentId(),
                  method: 'cash',
                  amount: initialSubtotal,
                  currency: itemCurrency,
                  discount_type: null,
                  discount_value: 0,
                  discount_currency: itemCurrency,
                }],
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
                cash_currency: itemCurrency,
                transfer_currency: itemCurrency,
                zelle_currency: 'USD', // Zelle default USD
                payment_manual_override: false,
                // FIX-MULTI-MONEDA: heredar moneda y tasa del producto (POR ITEM, no global)
                currency: itemCurrency,
                exchange_rate: (productInput as any).exchange_rate || 1.0,
              };
              newItem.subtotal = calculateItemSubtotal(newItem);
              // Asegurar que la primera fila tenga el subtotal correcto
              newItem.payments[0].amount = newItem.subtotal;
              syncLegacyFields(newItem);
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
              // FIX-PAYMENT-ROWS: si el item NO tiene override manual, resetear a 1 fila cash con el nuevo subtotal
              if (!item.payment_manual_override) {
                item.payments = [{
                  id: generatePaymentId(),
                  method: 'cash',
                  amount: item.subtotal,
                  currency: item.cash_currency || item.currency || 'CUP',
                  discount_type: null,
                  discount_value: 0,
                  discount_currency: item.cash_currency || item.currency || 'CUP',
                }];
              }
              syncLegacyFields(item);
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
              // FIX-PAYMENT-ROWS: si el item NO tiene override manual, resetear a 1 fila cash
              if (!item.payment_manual_override) {
                item.payments = [{
                  id: generatePaymentId(),
                  method: 'cash',
                  amount: item.subtotal,
                  currency: item.cash_currency || item.currency || 'CUP',
                  discount_type: null,
                  discount_value: 0,
                  discount_currency: item.cash_currency || item.currency || 'CUP',
                }];
              }
              syncLegacyFields(item);
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
              // FIX-PAYMENT-ROWS: este es el callback legacy. Lo usamos para actualizar
              // la primera fila de cada método. Si no existe, se crea.
              // Esto mantiene compatibilidad con código UI no migrado.
              const cur = {
                cash: methodCurrencies?.cash || item.cash_currency || 'CUP',
                transfer: methodCurrencies?.transfer || item.transfer_currency || 'CUP',
                zelle: methodCurrencies?.zelle || item.zelle_currency || 'USD',
              };
              // Asegurar que payments[] exista
              if (!item.payments) item.payments = [];
              // Función helper para upsert la primera fila de un método
              const upsertMethodRow = (method: 'cash' | 'transfer' | 'zelle', amount: number, currency: string) => {
                if (amount <= 0) {
                  // Remover filas de este método
                  item.payments = item.payments.filter(p => p.method !== method);
                  return;
                }
                let row = item.payments.find(p => p.method === method);
                if (row) {
                  row.amount = amount;
                  row.currency = currency;
                } else {
                  item.payments.push({
                    id: generatePaymentId(),
                    method,
                    amount,
                    currency,
                    discount_type: null,
                    discount_value: 0,
                    discount_currency: currency,
                  });
                }
              };
              upsertMethodRow('cash', cashPaid, cur.cash);
              upsertMethodRow('transfer', transferPaid, cur.transfer);
              upsertMethodRow('zelle', zellePaid, cur.zelle);
              // Si payments quedó vacío (todos en 0), agregar 1 fila cash default
              if (item.payments.length === 0) {
                item.payments.push({
                  id: generatePaymentId(),
                  method: 'cash',
                  amount: 0,
                  currency: cur.cash,
                  discount_type: null,
                  discount_value: 0,
                  discount_currency: cur.cash,
                });
              }
              // FIX-PAYMENT-MODE: marcar override manual
              item.payment_manual_override = true;
              syncLegacyFields(item);
              state.lastUpdated = Date.now();
            }
          }),
        ),

      // FIX-PAYMENT-ROWS (2026-07-10): añadir una nueva fila de pago al item.
      // Por default crea una fila cash con monto 0 en la moneda del item.
      addItemPayment: (productId, variantId, method = 'cash') =>
        set(
          produce((state: CartState) => {
            const item = state.items.find(
              (i) => i.product_id === productId && (i.variant_id === (variantId || null) || (!i.variant_id && !variantId)),
            );
            if (item) {
              if (!item.payments) item.payments = [];
              const currency = method === 'zelle' ? 'USD' : (item.currency || 'CUP');
              item.payments.push({
                id: generatePaymentId(),
                method,
                amount: 0,
                currency,
                discount_type: null,
                discount_value: 0,
                discount_currency: currency,
              });
              item.payment_manual_override = true;
              syncLegacyFields(item);
              state.lastUpdated = Date.now();
            }
          }),
        ),

      // FIX-PAYMENT-ROWS (2026-07-10): remover una fila de pago específica.
      // Si es la última fila, NO remover (mínimo 1 fila requerida).
      removeItemPayment: (productId, variantId, paymentId) =>
        set(
          produce((state: CartState) => {
            const item = state.items.find(
              (i) => i.product_id === productId && (i.variant_id === (variantId || null) || (!i.variant_id && !variantId)),
            );
            if (item && item.payments && item.payments.length > 1) {
              item.payments = item.payments.filter(p => p.id !== paymentId);
              syncLegacyFields(item);
              state.lastUpdated = Date.now();
            }
          }),
        ),

      // FIX-PAYMENT-ROWS (2026-07-10): duplicar una fila de pago existente.
      duplicateItemPayment: (productId, variantId, paymentId) =>
        set(
          produce((state: CartState) => {
            const item = state.items.find(
              (i) => i.product_id === productId && (i.variant_id === (variantId || null) || (!i.variant_id && !variantId)),
            );
            if (item && item.payments) {
              const src = item.payments.find(p => p.id === paymentId);
              if (src) {
                const idx = item.payments.findIndex(p => p.id === paymentId);
                const clone: PaymentRow = {
                  id: generatePaymentId(),
                  method: src.method,
                  amount: src.amount,
                  currency: src.currency,
                  discount_type: src.discount_type,
                  discount_value: src.discount_value,
                  discount_currency: src.discount_currency,
                };
                item.payments.splice(idx + 1, 0, clone);
                item.payment_manual_override = true;
                syncLegacyFields(item);
                state.lastUpdated = Date.now();
              }
            }
          }),
        ),

      // FIX-PAYMENT-ROWS (2026-07-10): actualizar una fila de pago específica.
      // Solo se pasan los campos a actualizar (Partial<PaymentRow>).
      updateItemPaymentRow: (productId, variantId, paymentId, updates) =>
        set(
          produce((state: CartState) => {
            const item = state.items.find(
              (i) => i.product_id === productId && (i.variant_id === (variantId || null) || (!i.variant_id && !variantId)),
            );
            if (item && item.payments) {
              const row = item.payments.find(p => p.id === paymentId);
              if (row) {
                Object.assign(row, updates);
                // Si cambió la moneda, sincronizar discount_currency
                if (updates.currency && !updates.discount_currency) {
                  row.discount_currency = updates.currency;
                }
                item.payment_manual_override = true;
                syncLegacyFields(item);
                state.lastUpdated = Date.now();
              }
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

              let itemCash: number, itemTransfer: number, itemZelle: number;
              if (index === itemCount - 1) {
                itemCash = Number(remainingCash.toFixed(2));
                itemTransfer = Number(remainingTransfer.toFixed(2));
                itemZelle = Number(remainingZelle.toFixed(2));
              } else {
                const rawCash = Number((clampedCash * weight).toFixed(2));
                const rawZelle = Number((clampedZelle * weight).toFixed(2));
                const rawTransfer = Number((clampedTransfer * weight).toFixed(2));

                itemCash = Math.min(rawCash, itemAdjustedSubtotal);
                itemZelle = Math.min(rawZelle, Math.max(0, itemAdjustedSubtotal - itemCash));
                itemTransfer = Math.min(
                  rawTransfer,
                  Math.max(0, itemAdjustedSubtotal - itemCash - itemZelle),
                );

                remainingCash -= itemCash;
                remainingTransfer -= itemTransfer;
                remainingZelle -= itemZelle;
              }
              // FIX-PAYMENT-ROWS: reconstruir payments[] desde los montos prorrateados
              // Esto resetea cualquier configuración previa y deja 1 fila por método activo
              item.payments = [];
              if (itemCash > 0) {
                item.payments.push({
                  id: generatePaymentId(),
                  method: 'cash',
                  amount: itemCash,
                  currency: item.cash_currency || item.currency || 'CUP',
                  discount_type: null,
                  discount_value: 0,
                  discount_currency: item.cash_currency || item.currency || 'CUP',
                });
              }
              if (itemTransfer > 0) {
                item.payments.push({
                  id: generatePaymentId(),
                  method: 'transfer',
                  amount: itemTransfer,
                  currency: item.transfer_currency || item.currency || 'CUP',
                  discount_type: null,
                  discount_value: 0,
                  discount_currency: item.transfer_currency || item.currency || 'CUP',
                });
              }
              if (itemZelle > 0) {
                item.payments.push({
                  id: generatePaymentId(),
                  method: 'zelle',
                  amount: itemZelle,
                  currency: item.zelle_currency || 'USD',
                  discount_type: null,
                  discount_value: 0,
                  discount_currency: item.zelle_currency || 'USD',
                });
              }
              // Si todos son 0, asegurar 1 fila cash default
              if (item.payments.length === 0) {
                item.payments.push({
                  id: generatePaymentId(),
                  method: 'cash',
                  amount: 0,
                  currency: item.cash_currency || item.currency || 'CUP',
                  discount_type: null,
                  discount_value: 0,
                  discount_currency: item.cash_currency || item.currency || 'CUP',
                });
              }
              syncLegacyFields(item);
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
        // FIX-PAYMENT-ROWS (2026-07-10): migrar items antiguos que no tienen payments[]
        // Construye payments[] desde los campos legacy cash_paid/transfer_paid/zelle_paid
        if (state && state.items) {
          for (const item of state.items) {
            if (!item.payments || item.payments.length === 0) {
              item.payments = [];
              if (item.cash_paid > 0) {
                item.payments.push({
                  id: `pay_legacy_cash_${item.product_id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                  method: 'cash',
                  amount: item.cash_paid,
                  currency: item.cash_currency || 'CUP',
                  discount_type: item.cash_discount_type || null,
                  discount_value: item.cash_discount_value || 0,
                  discount_currency: item.cash_discount_currency || item.cash_currency || 'CUP',
                });
              }
              if (item.transfer_paid > 0) {
                item.payments.push({
                  id: `pay_legacy_transfer_${item.product_id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                  method: 'transfer',
                  amount: item.transfer_paid,
                  currency: item.transfer_currency || 'CUP',
                  discount_type: item.transfer_discount_type || null,
                  discount_value: item.transfer_discount_value || 0,
                  discount_currency: item.transfer_discount_currency || item.transfer_currency || 'CUP',
                });
              }
              if (item.zelle_paid > 0) {
                item.payments.push({
                  id: `pay_legacy_zelle_${item.product_id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                  method: 'zelle',
                  amount: item.zelle_paid,
                  currency: item.zelle_currency || 'USD',
                  discount_type: item.zelle_discount_type || null,
                  discount_value: item.zelle_discount_value || 0,
                  discount_currency: item.zelle_discount_currency || item.zelle_currency || 'USD',
                });
              }
              // Si todavía está vacío, crear 1 fila cash default
              if (item.payments.length === 0) {
                item.payments.push({
                  id: `pay_default_${item.product_id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                  method: 'cash',
                  amount: item.subtotal || 0,
                  currency: item.cash_currency || item.currency || 'CUP',
                  discount_type: null,
                  discount_value: 0,
                  discount_currency: item.cash_currency || item.currency || 'CUP',
                });
              }
            }
          }
        }
      }
    },
  ),
);
