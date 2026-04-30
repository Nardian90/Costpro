import { logger } from '@/lib/logger';
'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
import { withTableLogging } from './base';
import { useCartStore } from '@/store';

interface DocumentActionProps {
  type: 'sale' | 'reception';
  id: string;
  items?: any[];
  storeId?: string;
}

export function useInvertDocument() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: async (props: DocumentActionProps) => {
      const { type, id, items: providedItems } = props;
      let storeId = props.storeId;

      logger.info('DATABASE', `[Invert] Starting inversion for ${type} ${id} in store ${storeId}`);

      // 0. Fetch document to get storeId and status if not provided or to verify
      const docTable = type === 'sale' ? 'transactions' : 'receipts';
      const { data: docData, error: docError } = await supabase
        .from(docTable)
        .select('store_id, status')
        .eq('id', id)
        .single();

      if (docError || !docData) {
        throw new Error(`No se pudo encontrar el documento ${id}: ${docError?.message || 'No encontrado'}`);
      }

      if (docData.status === 'voided') {
        throw new Error('Este documento ya ha sido anulado.');
      }

      if (!storeId) storeId = docData.store_id;

      // 1. Fetch items if not provided
      let items = providedItems;
      if (!items || items.length === 0) {
        logger.info('DATABASE', `[Invert] No items provided, fetching for ${type} ${id}`);
        const table = type === 'sale' ? 'transaction_items' : 'receipt_items';
        const foreignKey = type === 'sale' ? 'transaction_id' : 'receipt_id';

        const data = await withTableLogging('select', table, () =>
          supabase.from(table).select('*').eq(foreignKey, id)
        );
        items = data as any[];
      }

      if (!items || items.length === 0) {
        throw new Error('No se encontraron items para invertir en este documento.');
      }

      logger.info('DATABASE', `[Invert] Inverting ${items.length} items`);

      // 2. Perform adjustments for each item
      const reason = `INVERSION - ${type === 'sale' ? 'Anulación Venta' : 'Anulación Recepción'} ${id.split('-')[0]}`;

      for (const item of items) {
        const quantityDelta = type === 'sale' ? Math.abs(item.quantity) : -Math.abs(item.quantity);

        logger.info('DATABASE', `[Invert] Adjusting product ${item.product_id} with delta ${quantityDelta}`);

        const { error: adjError } = await supabase.rpc('perform_inventory_adjustment', {
          p_product_id: item.product_id,
          p_store_id: storeId,
          p_user_id: user?.id,
          p_quantity_delta: quantityDelta,
          p_unit_cost_adjustment: item.unit_cost || item.cost_at_sale || null,
          p_reason: reason
        });

        if (adjError) throw adjError;
      }

      // 3. Update document status
      const table = type === 'sale' ? 'transactions' : 'receipts';
      const updateData = { status: 'voided', updated_at: new Date().toISOString() };

      logger.info('DATABASE', `[Invert] Updating ${table} ${id} status to voided`);

      await withTableLogging('update', table, () =>
        supabase.from(table)
          .update(updateData)
          .eq('id', id)
      );

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['receptions'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      toast.success('Documento invertido y existencias actualizadas correctamente.');
    },
    onError: (error: any) => {
      console.error('Error inverting document:', error);
      toast.error(`Error al invertir documento: ${error.message || 'Error desconocido'}`);
    }
  });
}

export function useDuplicateDocument() {
  const { addItem, clearCart } = useCartStore();

  return useMutation({
    mutationFn: async (props: DocumentActionProps) => {
      const { type, id, items: providedItems } = props;

      let items = providedItems;
      if (!items || items.length === 0 || !items[0].products) {
        const table = type === 'sale' ? 'transaction_items' : 'receipt_items';
        const foreignKey = type === 'sale' ? 'transaction_id' : 'receipt_id';

        // Fetch items with full product data
        const data = await withTableLogging('select', table, () =>
          supabase.from(table).select('*, products(*)').eq(foreignKey, id)
        );
        items = data as any[];
      }

      if (!items || items.length === 0) {
        throw new Error('No se encontraron items para duplicar.');
      }

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
          price: price,
          cost: item.unit_cost || item.cost_at_sale || item.products.cost_price || 0,
          subtotal: qty * price
        });
      }

      return { success: true };
    },
    onSuccess: () => {
      toast.success('Productos cargados en el carrito para duplicar la operación.');
    },
    onError: (error: any) => {
      toast.error(`Error al duplicar: ${error.message}`);
    }
  });
}
