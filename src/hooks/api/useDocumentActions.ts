'use client';
import { logger } from '@/lib/logger';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
import { withTableLogging } from './base';
import { useCartStore } from '@/store';
// R2-M7: import para auditoría de anulación de ventas
import { auditService } from '@/services/audit-service';

interface DocumentActionProps {
  type: 'sale' | 'reception';
  id: string;
  items?: any[];
  storeId?: string;
  /** Política forward-only locking: fecha de operación efectiva (ISO). Si se omite, usa NOW(). */
  operationDate?: string;
}

export function useInvertDocument() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: async (props: DocumentActionProps) => {
      const { type, id, items: providedItems, operationDate } = props;
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

      // FIX F2-06: Para ventas, usar void_transaction RPC que restaura stock + audita server-side
      if (type === 'sale') {
        const reason = `Anulación de venta ${id.split('-')[0]}`;
        logger.info('DATABASE', `[Invert] Calling void_transaction RPC for sale ${id}`);

        const { data: voidResult, error: voidError } = await supabase.rpc('void_transaction', {
          p_transaction_id: id,
          p_reason: reason,
          p_operation_date: operationDate,
        });

        if (voidError) throw voidError;
        logger.info('DATABASE', `[Invert] void_transaction result: ${JSON.stringify(voidResult)}`);
        return { success: true, result: voidResult };
      }

      // Para recepciones, usar el flujo existente (perform_inventory_adjustment)
      const reason = `INVERSION - Anulación Recepción ${id.split('-')[0]}`;

      for (const item of items) {
        const quantityDelta = -Math.abs(item.quantity);

        logger.info('DATABASE', `[Invert] Adjusting product ${item.product_id} with delta ${quantityDelta}`);

        const { error: adjError } = await supabase.rpc('perform_inventory_adjustment', {
          p_product_id: item.product_id,
          p_store_id: storeId,
          p_user_id: user?.id,
          p_quantity_delta: quantityDelta,
          p_unit_cost_adjustment: item.unit_cost || item.cost_at_sale || null,
          p_reason: reason,
          p_operation_date: operationDate,
        });

        if (adjError) throw adjError;
      }

      // 3. Update document status
      const table = 'receipts';
      const effectiveDate = operationDate || new Date().toISOString();
      const updateData = {
        status: 'voided',
        updated_at: effectiveDate,
      };

      logger.info('DATABASE', `[Invert] Updating ${table} ${id} status to voided`);

      await withTableLogging('update', table, () =>
        supabase.from(table)
          .update(updateData)
          .eq('id', id)
      );

      return { success: true };
    },
    onSuccess: async (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['receptions'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      toast.success('Documento invertido y existencias actualizadas correctamente.');

      // R2-M7: auditar anulación de venta
      if (variables.type === 'sale' && user?.id) {
        try {
          await auditService.logSaleVoided({
            userId: user.id,
            transactionId: variables.id,
            storeId: variables.storeId || user.activeStoreId || '',
            reason: 'Inversion de documento (venta anulada)',
            oldStatus: 'completed',
          });
        } catch { /* non-blocking */ }
      }
    },
    onError: (error: unknown) => {
      console.error('Error inverting document:', error);
      const message = error instanceof Error ? error.message : 'Error desconocido';
      if (message.includes('ERR_BACKDATED_DOCUMENT')) {
        toast.error('No se puede retroceder en el tiempo operativo. Revisa la "Fecha de Operación" en el dashboard MULTI-TIENDA.', { duration: 8000 });
      } else {
        toast.error(`Error al invertir documento: ${message}`);
      }
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
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Error al duplicar: ${message}`);
    }
  });
}
