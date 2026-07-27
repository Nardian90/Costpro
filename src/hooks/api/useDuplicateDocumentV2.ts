'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore, useCartStore } from '@/store';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-fetch';
import { logger } from '@/lib/logger';

/**
 * useDuplicateDocumentV2 — Duplicación universal de documentos.
 *
 * V2.4.5: Refactor D1 — helper genérico duplicateViaApi + 2 adapters.
 *
 * Estructura:
 *   - duplicateViaApi: helper genérico "load original + load items + POST endpoint"
 *     para 4 tipos (transfer, devolution, production_order, adjustment)
 *   - duplicateToCart: adapter para 2 tipos (sale, reception) que cargan items
 *     en el carrito en vez de crear documento directo
 *
 * Tipos:
 * - sale/reception → duplicateToCart (carga carrito, usuario confirma después)
 * - transfer → /api/transfers (crea PENDIENTE)
 * - devolution → /api/devolutions (crea completed, afecta stock YA)
 * - production_order → /api/production-orders (crea draft)
 * - adjustment → /api/inventory/adjustments/duplicate (crea confirmed, afecta stock YA)
 */

export type DuplicableDocType =
  | 'sale'
  | 'reception'
  | 'transfer'
  | 'devolution'
  | 'production_order'
  | 'adjustment';

interface DuplicateOptions {
  type: DuplicableDocType;
  id: string;
  /** ID de la tienda activa (no usado en V2.4.5 — se respeta store del original) */
  storeId?: string;
}

interface DuplicateResult {
  success: boolean;
  newId?: string;
  newDocNumber?: string;
  message?: string;
}

// ──────────────────────────────────────────────────────────────────────
// Config por tipo — centraliza metadatos (DRY)
// ──────────────────────────────────────────────────────────────────────
interface HttpAdapterConfig {
  /** Tabla del documento original (transfers, devolutions, ...) */
  docTable: string;
  /** Tabla de items del original (transfer_items, devolution_items, ...) */
  itemsTable: string;
  /** Columna FK en itemsTable hacia el documento (transfer_id, devolution_id, ...) */
  itemsFk: string;
  /** Columnas a seleccionar de items */
  itemsSelect: string;
  /** Endpoint POST donde se crea el nuevo documento */
  endpoint: string;
  /** Función que arma el body del POST a partir del original + items */
  buildBody: (doc: Record<string, any>, items: Record<string, any>[]) => Record<string, any>;
  /** Función que extrae newId de la respuesta del endpoint */
  extractNewId: (res: any) => string | undefined;
  /** Función que extrae newDocNumber de la respuesta */
  extractDocNumber: (res: any) => string | undefined;
  /** Etiqueta para errores */
  label: string;
}

const HTTP_ADAPTERS: Partial<Record<DuplicableDocType, HttpAdapterConfig>> = {
  transfer: {
    docTable: 'transfers',
    itemsTable: 'transfer_items',
    itemsFk: 'transfer_id',
    itemsSelect: 'product_id, quantity, unit_cost',
    endpoint: '/api/transfers',
    buildBody: (doc, items) => ({
      origin_store_id: doc.origin_store_id,
      destination_store_id: doc.destination_store_id,
      notes: `Duplicada de ${doc.id?.slice(0, 8) || ''} — ${doc.notes || ''}`.slice(0, 500),
      items: items.map(i => ({
        product_id: i.product_id,
        quantity: i.quantity,
        unit_cost: i.unit_cost,
      })),
    }),
    extractNewId: (res) => res.id || res.transfer_id,
    extractDocNumber: (res) => res.transfer_number,
    label: 'Transferencia',
  },

  devolution: {
    docTable: 'devolutions',
    itemsTable: 'devolution_items',
    itemsFk: 'devolution_id',
    itemsSelect: 'product_id, quantity, unit_price',
    endpoint: '/api/devolutions',
    buildBody: (doc, items) => ({
      store_id: doc.store_id, // respeta multi-tienda
      reason: `Duplicada de ${doc.devolution_number} — ${doc.reason}`.slice(0, 500),
      items: items.map(i => ({
        product_id: i.product_id,
        quantity: i.quantity,
        unit_price: i.unit_price,
      })),
      customer_name: doc.customer_name || undefined,
      customer_ci: doc.customer_ci || undefined,
      payment_method: doc.payment_method || 'cash',
    }),
    extractNewId: (res) => res.devolution_id || res.id, // create_devolution RPC shape
    extractDocNumber: (res) => res.devolution_number,
    label: 'Devolución',
  },

  production_order: {
    docTable: 'production_orders',
    itemsTable: 'production_order_items',
    itemsFk: 'order_id',
    itemsSelect: 'product_id, variant_id, budgeted_qty, budgeted_unit_cost',
    endpoint: '/api/production-orders',
    buildBody: (doc, items) => ({
      store_id: doc.store_id,
      order_type: doc.order_type,
      customer_name: doc.customer_name || undefined,
      customer_ci: doc.customer_ci || undefined,
      customer_phone: doc.customer_phone || undefined,
      customer_address: doc.customer_address || undefined,
      budget_total: doc.budget_total,
      budget_currency: doc.budget_currency,
      advance_amount: 0,
      advance_currency: doc.advance_currency,
      output_product_id: doc.output_product_id || undefined,
      output_quantity: doc.output_quantity,
      description: `Duplicada de ${doc.order_number} — ${doc.description || ''}`.slice(0, 500),
      notes: doc.notes || undefined,
      items: (items || []).map(i => ({
        product_id: i.product_id,
        variant_id: i.variant_id || null,
        budgeted_qty: i.budgeted_qty,
        budgeted_unit_cost: i.budgeted_unit_cost,
      })),
    }),
    extractNewId: (res) => res.id,
    extractDocNumber: (res) => res.order_number,
    label: 'Orden de producción',
  },

  adjustment: {
    docTable: 'inventory_adjustments',
    itemsTable: 'inventory_adjustment_items',
    itemsFk: 'adjustment_id',
    itemsSelect: 'product_id, expected_quantity, counted_quantity',
    // V2.4.2: el endpoint /api/inventory/adjustments/duplicate solo necesita original_id
    // (la RPC atómica hace todo el trabajo: copia items + aplica stock + kardex)
    endpoint: '/api/inventory/adjustments/duplicate',
    buildBody: (doc) => ({ original_id: doc.id }),
    extractNewId: (res) => res.id,
    extractDocNumber: (res) => res.adjustment_number,
    label: 'Ajuste',
  },
};

// ──────────────────────────────────────────────────────────────────────
// Adapter para sale/reception: carga items en carrito (no crea documento)
// ──────────────────────────────────────────────────────────────────────
interface CartAdapterConfig {
  itemsTable: string;
  itemsFk: string;
  /** Función que mapea item DB → CartItem */
  toCartItem: (item: any) => {
    product_id: string;
    variant_id: string | null;
    product: any;
    variant: null;
    quantity: number;
    price: number;
    cost: number;
    subtotal: number;
  } | null;
  label: string;
}

const CART_ADAPTERS: Partial<Record<DuplicableDocType, CartAdapterConfig>> = {
  sale: {
    itemsTable: 'transaction_items',
    itemsFk: 'transaction_id',
    toCartItem: (item) => {
      if (!item.products) return null;
      const qty = Math.abs(item.quantity);
      const price = item.price_at_sale || item.products.price || 0;
      return {
        product_id: item.product_id,
        variant_id: item.variant_id || null,
        product: item.products,
        variant: null,
        quantity: qty,
        price,
        cost: item.unit_cost || item.cost_at_sale || item.products.cost_price || 0,
        subtotal: qty * price,
      };
    },
    label: 'venta',
  },
  reception: {
    itemsTable: 'receipt_items',
    itemsFk: 'receipt_id',
    toCartItem: (item) => {
      if (!item.products) return null;
      const qty = Math.abs(item.quantity);
      const cost = item.unit_cost || item.products.cost_price || 0;
      return {
        product_id: item.product_id,
        variant_id: item.variant_id || null,
        product: item.products,
        variant: null,
        quantity: qty,
        price: cost,
        cost,
        subtotal: qty * cost,
      };
    },
    label: 'recepción',
  },
};

// ──────────────────────────────────────────────────────────────────────
// Helper genérico: load doc + load items + POST endpoint
// ──────────────────────────────────────────────────────────────────────
async function duplicateViaApi(
  type: DuplicableDocType,
  id: string,
  config: HttpAdapterConfig,
): Promise<DuplicateResult> {
  // 1. Cargar documento original
  const { data: doc, error: e1 } = await supabase
    .from(config.docTable)
    .select('*')
    .eq('id', id)
    .single();
  if (e1 || !doc) {
    throw new Error(`${config.label} no encontrada`);
  }

  // 2. Cargar items originales
  const { data: items, error: e2 } = await supabase
    .from(config.itemsTable)
    .select(config.itemsSelect)
    .eq(config.itemsFk, id);
  if (e2) throw e2;
  if (!items || items.length === 0) {
    throw new Error(`Sin items en la ${config.label.toLowerCase()}`);
  }

  // 3. POST al endpoint para crear el nuevo documento
  const body = config.buildBody(doc, items);
  const res = await apiFetch(config.endpoint, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return {
    success: true,
    newId: config.extractNewId(res),
    newDocNumber: config.extractDocNumber(res),
  };
}

// ──────────────────────────────────────────────────────────────────────
// Adapter para carrito: load items + clear cart + add items
// ──────────────────────────────────────────────────────────────────────
async function duplicateToCart(
  type: DuplicableDocType,
  id: string,
  config: CartAdapterConfig,
  cartActions: { addItem: (item: any) => void; clearCart: () => void },
): Promise<DuplicateResult> {
  const { data: items, error } = await supabase
    .from(config.itemsTable)
    .select('*, products(*)')
    .eq(config.itemsFk, id);
  if (error) throw error;
  if (!items || items.length === 0) {
    throw new Error(`Sin items para duplicar la ${config.label}`);
  }

  cartActions.clearCart();
  for (const item of items) {
    const cartItem = config.toCartItem(item);
    if (!cartItem) continue;
    cartActions.addItem(cartItem);
  }
  return { success: true, message: `Items cargados en carrito para ${config.label}` };
}

// ──────────────────────────────────────────────────────────────────────
// Hook principal
// ──────────────────────────────────────────────────────────────────────
const LABELS: Record<DuplicableDocType, string> = {
  sale: 'venta',
  reception: 'recepción',
  transfer: 'transferencia',
  devolution: 'devolución',
  production_order: 'orden de producción',
  adjustment: 'ajuste',
};

export function useDuplicateDocumentV2() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { addItem, clearCart } = useCartStore();
  // user se mantiene por compatibilidad, pero el hook respeta store_id del original

  return useMutation<DuplicateResult, Error, DuplicateOptions>({
    mutationFn: async ({ type, id }): Promise<DuplicateResult> => {
      logger.info('DATABASE', `[Duplicate] type=${type} id=${id}`);

      // Cart adapter (sale, reception)
      const cartConfig = CART_ADAPTERS[type];
      if (cartConfig) {
        return duplicateToCart(type, id, cartConfig, { addItem, clearCart });
      }

      // HTTP adapter (transfer, devolution, production_order, adjustment)
      const httpConfig = HTTP_ADAPTERS[type];
      if (httpConfig) {
        return duplicateViaApi(type, id, httpConfig);
      }

      throw new Error(`Tipo no soportado: ${type}`);
    },
    onSuccess: async (data, variables) => {
      // Invalidar queries relevantes
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['receptions'] }),
        queryClient.invalidateQueries({ queryKey: ['transfers'] }),
        queryClient.invalidateQueries({ queryKey: ['devolutions'] }),
        queryClient.invalidateQueries({ queryKey: ['adjustments'] }),
        queryClient.invalidateQueries({ queryKey: ['production-orders'] }),
      ]);

      const label = LABELS[variables.type];

      if (data.newId) {
        toast.success(
          `${label.charAt(0).toUpperCase() + label.slice(1)} duplicada: ${data.newDocNumber || data.newId.slice(0, 8)}`,
        );
      } else {
        toast.success(`Productos cargados en el carrito para duplicar la ${label}.`);
      }
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(`Error al duplicar: ${msg}`);
    },
  });
}
