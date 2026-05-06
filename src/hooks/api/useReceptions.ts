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
      if (!isAdmin && cleanStoreId) {
        query = query.eq('store_id', cleanStoreId);
      }
      const data = await withTableLogging('select', 'receipts', () => query.order('created_at', { ascending: false }));
      return await validateRPCArrayResponse(data, receiptSchema, 'receipts');
    },
    enabled: isAdmin || !!cleanStoreId,
    staleTime: 30 * 1000,
  });
}

export async function prefetchReceptions(queryClient: QueryClient, storeId: string, isAdmin = false) {
  const cleanStoreId = getCleanStoreId(storeId);
  if (!isAdmin && !cleanStoreId) return;

  return queryClient.prefetchQuery({
    queryKey: ['receptions', cleanStoreId, isAdmin],
    queryFn: async () => {
      const columns = 'id, created_at, total_cost, status, reference_doc, supplier, reception_date, store_id, user_id';
      let query = supabase.from('receipts').select(columns);
      if (!isAdmin && cleanStoreId) {
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
 * Anula una recepción (soft-delete: status = 'voided').
 * No revierte el inventario — eso requiere una inversión de documento separada.
 */
export function useVoidReception() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      receiptId: string;
      storeId: string;
      reason?: string;
    }) => {
      const { data, error } = await supabase
        .from('receipts')
        .update({
          status: 'voided',
          updated_at: new Date().toISOString(),
          // Se agrega updated_at para que coincida con la lógica de auditoría si se desea
        })
        .eq('id', params.receiptId)
        .neq('status', 'voided')
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async (_, variables) => {
      const { user } = useAuthStore.getState();
      if (user?.id) {
        await auditService.logReceptionVoided({
          userId: user.id,
          receiptId: variables.receiptId,
          storeId: variables.storeId,
          reason: variables.reason
        });
      }
      queryClient.invalidateQueries({ queryKey: ['receptions'] });
    }
  });
}
