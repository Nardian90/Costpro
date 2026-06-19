import { useQuery, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { validateRPCArrayResponse } from '@/lib/rpc-validator';
import { receiptSchema, receiptItemSchema } from '@/validation/schemas';
import { withTableLogging, getCleanStoreId } from './base';

export function useReceptions(storeId?: string | null, isAdmin = false) {
  const cleanStoreId = getCleanStoreId(storeId);

  return useQuery({
    queryKey: ['receptions', cleanStoreId, isAdmin],
    queryFn: async () => {
      const columns = 'id, created_at, total_cost, status, reference_doc, supplier, reception_date, store_id, user_id';
      let query = supabase.from('receipts').select(columns);
      if (cleanStoreId) {
        query = query.eq('store_id', cleanStoreId);
      }
      const data = await withTableLogging('select', 'receipts', () => query.order('created_at', { ascending: false }));
      return await validateRPCArrayResponse(data, receiptSchema, 'receipts');
    },
    enabled: !!cleanStoreId,
    staleTime: 30 * 1000,
  });
}

export async function prefetchReceptions(queryClient: QueryClient, storeId: string, isAdmin = false) {
  const cleanStoreId = getCleanStoreId(storeId);
  if (!cleanStoreId) return;

  return queryClient.prefetchQuery({
    queryKey: ['receptions', cleanStoreId, isAdmin],
    queryFn: async () => {
      const columns = 'id, created_at, total_cost, status, reference_doc, supplier, reception_date, store_id, user_id';
      let query = supabase.from('receipts').select(columns);
      if (cleanStoreId) {
        query = query.eq('store_id', cleanStoreId);
      }
      // FIX-LOG-014: Use withTableLogging for consistent logging pattern
      const data = await withTableLogging('select', 'receipts', () => query.order('created_at', { ascending: false }));
      return await validateRPCArrayResponse(data, receiptSchema, 'receipts');
    },
    staleTime: 30 * 1000,
  });
}

export function useReceptionDetails(receiptId?: string) {
  return useQuery({
    queryKey: ['receipt-items', receiptId],
    queryFn: async () => {
      if (!receiptId) return [];
      const columns = 'id, receipt_id, product_id, quantity, unit_cost, created_at, products(name, sku, image_url, public_image_url)';
      const data = await withTableLogging('select', 'receipt_items', () => supabase.from('receipt_items')
        .select(columns)
        .eq('receipt_id', receiptId));
      return await validateRPCArrayResponse(data, receiptItemSchema, 'receipt_items');
    },
    enabled: !!receiptId,
  });
}

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { auditService } from '@/services/audit-service';
import { useAuthStore } from '@/store';

/**
 * Edita campos de cabecera de una recepción (proveedor, nro. factura, notas).
 * No edita los ítems — el inventario ya fue afectado al recibir.
 */
export function useUpdateReception() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      receiptId: string;
      supplier?: string;
      referenceDoc?: string;
      notes?: string;
    }) => {
      const updatePayload: Record<string, any> = {
        updated_at: new Date().toISOString()
      };
      if (params.supplier !== undefined) updatePayload.supplier = params.supplier;
      if (params.referenceDoc !== undefined) updatePayload.reference_doc = params.referenceDoc;
      if (params.notes !== undefined) updatePayload.notes = params.notes;

      const { data, error } = await supabase
        .from('receipts')
        .update(updatePayload)
        .eq('id', params.receiptId)
        .neq('status', 'voided') // No editar si ya está anulada
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['receptions'] });
      queryClient.invalidateQueries({ queryKey: ['receipt-items', variables.receiptId] });
    }
  });
}

/**
 * Q1 (Audit-Fix): Anula una recepción CON reversión de inventario.
 * Antes: solo hacía status='voided' sin revertir stock → stock inflado, costo alterado.
 * Ahora: llama a la RPC void_reception_with_reversal que:
 *   1. Descuenta el stock de cada producto (stock_current -= quantity)
 *   2. Recalcula el costo promedio (PMP) removiendo la entrada
 *   3. Registra un stock_movement de tipo 'reception_void'
 *   4. Marca la recepción como 'voided'
 * Todo en una transacción atómica.
 */
export function useVoidReception() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore.getState();
  return useMutation({
    mutationFn: async (params: {
      receiptId: string;
      storeId: string;
      reason?: string;
    }) => {
      const { error } = await supabase.rpc('void_reception_with_reversal', {
        p_receipt_id: params.receiptId,
        p_user_id: user?.id || '',
        p_reason: params.reason || 'Anulacion con reversion de inventario',
      });

      if (error) throw error;
    },
    onSuccess: async (_, variables) => {
      if (user?.id) {
        await auditService.logReceptionVoided({
          userId: user.id,
          receiptId: variables.receiptId,
          storeId: variables.storeId,
          reason: variables.reason
        });
      }
      queryClient.invalidateQueries({ queryKey: ['receptions'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
    }
  });
}

// ════════════════════════════════════════════════════════════════════════
// Reception-Flow-Fix: Recepciones pendientes vs confirmadas.
//
// Problema detectado por el usuario:
//   "al terminar la recepción debe poderse confirmar o dejarse pendiente
//    y pasar a otra, mientras esté pendiente por X motivos no se refleja
//    en ningún historial, solo al confirmar es que se vuelve este proceso
//    no editable, confirmándose y reflejándose en el historial de productos"
//
// Solución:
//   1. useSavePendingReception — inserta en receipts + receipt_items con
//      status='pending'. NO actualiza stock ni crea movimientos de inventario.
//      El usuario puede guardar y volver después.
//   2. useConfirmPendingReception — cuando el usuario confirma una recepción
//      pendiente, actualiza el status a 'active' y aplica los cambios de stock
//      por cada item (stock_current += quantity). También marca la recepción
//      como no editable (status='active').
//   3. Las recepciones pendientes aparecen en el historial con badge amarillo
//      "Pendiente" y botones "Confirmar" / "Editar" / "Anular".
//   4. Las recepciones confirmadas (status='active') NO son editables — solo
//      se pueden anular o invertir (disminución).
// ════════════════════════════════════════════════════════════════════════

export interface PendingReceptionItem {
  product_id: string;
  sku?: string | null;
  quantity: number;
  unit_cost: number;
  unit_of_measure?: string | null;
  sale_price?: number | null;
  variant_id?: string | null;
  is_new?: boolean;
  update_price?: boolean;
}

/**
 * Guarda una recepción como PENDIENTE.
 *
 * Inserta en `receipts` (status='pending') + `receipt_items` sin afectar
 * el inventario. El usuario puede volver después y confirmarla, editarla o
 * anularla. Las recepciones pendientes NO aparecen en el historial de
 * productos ni en movimientos de inventario — solo en el historial de
 * recepciones con badge amarillo "Pendiente".
 */
export function useSavePendingReception() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      storeId: string;
      userId: string;
      supplier: string;
      invoiceNumber: string;
      receptionDate: string; // ISO
      items: PendingReceptionItem[];
      notes?: string;
    }) => {
      const totalCost = params.items.reduce((s, i) => s + i.quantity * i.unit_cost, 0);

      // 1. Insertar la recepción con status='pending'
      const { data: receipt, error: receiptErr } = await supabase
        .from('receipts')
        .insert({
          store_id: params.storeId,
          user_id: params.userId,
          supplier: params.supplier || null,
          reference_doc: params.invoiceNumber || null,
          reception_date: params.receptionDate,
          total_cost: totalCost,
          status: 'pending',
          notes: params.notes || null,
        })
        .select('id')
        .single();

      if (receiptErr) throw new Error(`Error al guardar recepción pendiente: ${receiptErr.message}`);
      if (!receipt) throw new Error('No se pudo crear la recepción pendiente');

      // 2. Insertar los items
      const itemsToInsert = params.items.map(item => ({
        receipt_id: receipt.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        // Nota: no guardamos sale_price/update_price en receipt_items porque
        // esos campos se aplican al confirmar (actualizar el producto).
      }));

      if (itemsToInsert.length > 0) {
        const { error: itemsErr } = await supabase
          .from('receipt_items')
          .insert(itemsToInsert);

        if (itemsErr) {
          // Rollback: eliminar la recepción si fallan los items
          await supabase.from('receipts').delete().eq('id', receipt.id);
          throw new Error(`Error al guardar items: ${itemsErr.message}`);
        }
      }

      return receipt.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receptions'] });
    },
  });
}

/**
 * M1 (Audit-Fix): Confirma una recepción pendiente usando RPC transaccional.
 *
 * Antes: hacía SELECT-then-UPDATE por cada item desde el cliente (race condition).
 * Ahora: llama a la RPC `confirm_pending_reception(receipt_id, user_id)` que:
 *   1. Bloquea la recepción con FOR UPDATE
 *   2. Por cada item, bloquea el producto con FOR UPDATE
 *   3. Calcula PMP atómicamente
 *   4. Registra stock_movement tipo 'reception_confirm'
 *   5. Marca la recepción como 'active'
 * Todo en una transacción atómica — no hay race condition posible.
 */
export function useConfirmPendingReception() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      receiptId: string;
      storeId: string;
      userId: string;
    }) => {
      const { error } = await supabase.rpc('confirm_pending_reception', {
        p_receipt_id: params.receiptId,
        p_user_id: params.userId,
      });

      if (error) throw new Error(`Error al confirmar recepción: ${error.message}`);
      return params.receiptId;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['receptions'] });
      queryClient.invalidateQueries({ queryKey: ['receipt-items', variables.receiptId] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
    },
  });
}
