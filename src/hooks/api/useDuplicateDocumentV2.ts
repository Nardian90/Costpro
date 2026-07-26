'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore, useCartStore } from '@/store';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-fetch';
import { logger } from '@/lib/logger';
import { withTableLogging } from './base';

/**
 * useDuplicateDocumentV2 — Duplicación universal de documentos.
 *
 * V2.4: Reemplaza al useDuplicateDocument (legacy) que solo soportaba sale y reception.
 *
 * Para cada tipo:
 * - sale/reception: carga items en el carrito (flujo POS/recepción) — usuario confirma.
 * - transfer: crea nueva transferencia PENDIENTE con los mismos items.
 * - devolution: crea nueva devolución completed con los mismos items.
 * - production_order: crea nueva orden draft con los mismos items.
 * - adjustment: crea nuevo ajuste confirmed con los mismos items.
 *
 * NO modifica el documento original. El nuevo documento siempre se crea en estado
 * inicial (PENDIENTE/draft/confirmed según el tipo), listo para que el usuario
 * lo ajuste o confirme.
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
  /** ID de la tienda activa (si aplica) */
  storeId?: string;
}

interface DuplicateResult {
  success: boolean;
  newId?: string;
  newDocNumber?: string;
  message?: string;
}

export function useDuplicateDocumentV2() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { addItem, clearCart } = useCartStore();

  return useMutation<DuplicateResult, Error, DuplicateOptions>({
    mutationFn: async ({ type, id, storeId }): Promise<DuplicateResult> => {
      logger.info('DATABASE', `[Duplicate] type=${type} id=${id}`);

      switch (type) {
        case 'sale':
          return duplicateSale(id);
        case 'reception':
          return duplicateReception(id);
        case 'transfer':
          return duplicateTransfer(id, storeId!);
        case 'devolution':
          return duplicateDevolution(id, storeId!);
        case 'production_order':
          return duplicateProductionOrder(id, storeId!);
        case 'adjustment':
          return duplicateAdjustment(id, storeId!);
        default:
          throw new Error(`Tipo no soportado: ${type}`);
      }
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

      const labels: Record<DuplicableDocType, string> = {
        sale: 'venta',
        reception: 'recepción',
        transfer: 'transferencia',
        devolution: 'devolución',
        production_order: 'orden de producción',
        adjustment: 'ajuste',
      };
      const label = labels[variables.type];

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

  // ────────────────────────────────────────────────────────────────────
  // SALE: cargar items en el carrito (mantiene comportamiento legacy)
  // ────────────────────────────────────────────────────────────────────
  async function duplicateSale(id: string): Promise<DuplicateResult> {
    const { data: items, error } = await supabase
      .from('transaction_items')
      .select('*, products(*)')
      .eq('transaction_id', id);
    if (error) throw error;
    if (!items || items.length === 0) throw new Error('Sin items para duplicar');

    clearCart();
    for (const item of items) {
      if (!item.products) continue;
      const qty = Math.abs(item.quantity);
      const price = item.price_at_sale || item.products.price || 0;
      addItem({
        product_id: item.product_id,
        variant_id: item.variant_id || null,
        product: item.products,
        variant: null,
        quantity: qty,
        price,
        cost: item.unit_cost || item.cost_at_sale || item.products.cost_price || 0,
        subtotal: qty * price,
      });
    }
    return { success: true, message: 'Items cargados en carrito' };
  }

  // ────────────────────────────────────────────────────────────────────
  // RECEPTION: cargar items en el carrito de recepción (flujo express)
  // ────────────────────────────────────────────────────────────────────
  async function duplicateReception(id: string): Promise<DuplicateResult> {
    const { data: items, error } = await supabase
      .from('receipt_items')
      .select('*, products(*)')
      .eq('receipt_id', id);
    if (error) throw error;
    if (!items || items.length === 0) throw new Error('Sin items para duplicar');

    clearCart();
    for (const item of items) {
      if (!item.products) continue;
      const qty = Math.abs(item.quantity);
      addItem({
        product_id: item.product_id,
        variant_id: item.variant_id || null,
        product: item.products,
        variant: null,
        quantity: qty,
        price: item.unit_cost || item.products.cost_price || 0,
        cost: item.unit_cost || item.products.cost_price || 0,
        subtotal: qty * (item.unit_cost || 0),
      });
    }
    return { success: true, message: 'Items cargados para nueva recepción' };
  }

  // ────────────────────────────────────────────────────────────────────
  // TRANSFER: crear nueva transferencia PENDIENTE con los mismos items
  // ────────────────────────────────────────────────────────────────────
  async function duplicateTransfer(id: string, storeId: string): Promise<DuplicateResult> {
    // Cargar transfer original
    const { data: tr, error: e1 } = await supabase
      .from('transfers')
      .select('*')
      .eq('id', id)
      .single();
    if (e1 || !tr) throw new Error('Transferencia no encontrada');

    const { data: items, error: e2 } = await supabase
      .from('transfer_items')
      .select('product_id, quantity, unit_cost')
      .eq('transfer_id', id);
    if (e2 || !items || items.length === 0) throw new Error('Sin items');

    // Llamar al endpoint de transfer (usa create_transfer RPC)
    const res = await apiFetch('/api/transfers', {
      method: 'POST',
      body: JSON.stringify({
        origin_store_id: tr.origin_store_id,
        destination_store_id: tr.destination_store_id,
        notes: `Duplicada de ${id.slice(0, 8)} — ${tr.notes || ''}`.slice(0, 500),
        items: items.map(i => ({
          product_id: i.product_id,
          quantity: i.quantity,
          unit_cost: i.unit_cost,
        })),
      }),
    });

    return {
      success: true,
      newId: res.id || res.transfer_id,
      newDocNumber: res.transfer_number,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // DEVOLUTION: crear nueva devolución con los mismos items
  // ────────────────────────────────────────────────────────────────────
  async function duplicateDevolution(id: string, storeId: string): Promise<DuplicateResult> {
    const { data: dev, error: e1 } = await supabase
      .from('devolutions')
      .select('*')
      .eq('id', id)
      .single();
    if (e1 || !dev) throw new Error('Devolución no encontrada');

    const { data: items, error: e2 } = await supabase
      .from('devolution_items')
      .select('product_id, quantity, unit_price')
      .eq('devolution_id', id);
    if (e2 || !items || items.length === 0) throw new Error('Sin items');

    const res = await apiFetch('/api/devolutions', {
      method: 'POST',
      body: JSON.stringify({
        store_id: storeId,
        reason: `Duplicada de ${dev.devolution_number} — ${dev.reason}`.slice(0, 500),
        items: items.map(i => ({
          product_id: i.product_id,
          quantity: i.quantity,
          unit_price: i.unit_price,
        })),
        customer_name: dev.customer_name || undefined,
        customer_ci: dev.customer_ci || undefined,
        payment_method: dev.payment_method || 'cash',
      }),
    });

    return {
      success: true,
      newId: res.id,
      newDocNumber: res.devolution_number,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // PRODUCTION ORDER: crear nueva orden draft con los mismos items
  // ────────────────────────────────────────────────────────────────────
  async function duplicateProductionOrder(id: string, storeId: string): Promise<DuplicateResult> {
    const { data: order, error: e1 } = await supabase
      .from('production_orders')
      .select('*')
      .eq('id', id)
      .single();
    if (e1 || !order) throw new Error('Orden no encontrada');

    const { data: items, error: e2 } = await supabase
      .from('production_order_items')
      .select('product_id, variant_id, budgeted_qty, budgeted_unit_cost')
      .eq('order_id', id);
    if (e2) throw e2;

    // Llamar al endpoint de production-orders
    const res = await apiFetch('/api/production-orders', {
      method: 'POST',
      body: JSON.stringify({
        store_id: storeId,
        order_type: order.order_type,
        customer_name: order.customer_name || undefined,
        customer_ci: order.customer_ci || undefined,
        customer_phone: order.customer_phone || undefined,
        customer_address: order.customer_address || undefined,
        budget_total: order.budget_total,
        budget_currency: order.budget_currency,
        advance_amount: 0, // Sin anticipo en duplicado
        advance_currency: order.advance_currency,
        output_product_id: order.output_product_id || undefined,
        output_quantity: order.output_quantity,
        description: `Duplicada de ${order.order_number} — ${order.description || ''}`.slice(0, 500),
        notes: order.notes || undefined,
        items: (items || []).map(i => ({
          product_id: i.product_id,
          variant_id: i.variant_id || null,
          budgeted_qty: i.budgeted_qty,
          budgeted_unit_cost: i.budgeted_unit_cost,
        })),
      }),
    });

    return {
      success: true,
      newId: res.id,
      newDocNumber: res.order_number,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // ADJUSTMENT: crear nuevo ajuste con los mismos items
  // El endpoint /api/inventory/adjustments espera: { storeId, items: [{ product_id, quantity, movement_type, reason }] }
  // ────────────────────────────────────────────────────────────────────
  async function duplicateAdjustment(id: string, storeId: string): Promise<DuplicateResult> {
    const { data: adj, error: e1 } = await supabase
      .from('inventory_adjustments')
      .select('*')
      .eq('id', id)
      .single();
    if (e1 || !adj) throw new Error('Ajuste no encontrado');

    const { data: items, error: e2 } = await supabase
      .from('inventory_adjustment_items')
      .select('product_id, expected_quantity, counted_quantity, difference')
      .eq('adjustment_id', id);
    if (e2 || !items || items.length === 0) throw new Error('Sin items');

    // Convertir difference → {quantity, movement_type}
    // difference > 0 (sobra) → 'add', difference < 0 (falta) → 'subtract'
    const res = await apiFetch('/api/inventory/adjustments', {
      method: 'POST',
      body: JSON.stringify({
        storeId,
        items: items.map(i => ({
          product_id: i.product_id,
          quantity: Math.abs(i.difference || 0),
          movement_type: (i.difference || 0) >= 0 ? 'add' : 'subtract',
          reason: `Duplicada de ${id.slice(0, 8)}`,
        })),
      }),
    });

    return {
      success: true,
      newId: res.saleId || res.id,
      newDocNumber: res.adjustment_number,
    };
  }
}
