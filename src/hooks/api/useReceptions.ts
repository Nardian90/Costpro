import { safeRandomShortId } from "@/lib/safe-random";
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { validateRPCArrayResponse } from '@/lib/rpc-validator';
import { receiptSchema, receiptItemSchema } from '@/validation/schemas';
import { withTableLogging, getCleanStoreId } from './base';
// F-21: validar tasa_cambio_recepcion antes de insertar receipt_items
import { validateReceiptItemsTasa } from '@/lib/receipt-items-validation';

export function useReceptions(storeId?: string | null, isAdmin = false) {
  const cleanStoreId = getCleanStoreId(storeId);

  return useQuery({
    queryKey: ['receptions', cleanStoreId, isAdmin],
    queryFn: async () => {
      const columns = 'id, created_at, total_cost, status, reference_doc, supplier, reception_date, store_id, user_id, payment_status, paid_amount, due_date, payment_method, paid_at';
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
      const columns = 'id, created_at, total_cost, status, reference_doc, supplier, reception_date, store_id, user_id, payment_status, paid_amount, due_date, payment_method, paid_at';
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
      const columns = 'id, receipt_id, product_id, quantity, unit_cost, moneda_recepcion, tasa_cambio_recepcion, created_at, products(name, sku, image_url, public_image_url)';
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
 *
 * Para recepciones 'active' (confirmadas): llama a void_reception_with_reversal
 * que revierte stock + recalcula PMP + registra stock_movement.
 *
 * Para recepciones 'pending' (no confirmadas): simplemente marca como 'voided'
 * y elimina los items. No hay stock que revertir porque nunca se aplicó.
 */
export function useVoidReception() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore.getState();
  return useMutation({
    mutationFn: async (params: {
      receiptId: string;
      storeId: string;
      reason?: string;
      /** Política forward-only locking: fecha efectiva (ISO). Default = NOW(). */
      operationDate?: string;
    }) => {
      // Verificar el estado actual de la recepción
      const { data: receipt, error: fetchErr } = await supabase
        .from('receipts')
        .select('status')
        .eq('id', params.receiptId)
        .single();

      if (fetchErr) throw new Error(`Error al obtener recepción: ${fetchErr.message}`);
      if (!receipt) throw new Error('Recepción no encontrada');

      const effectiveDate = params.operationDate || new Date().toISOString();

      if (receipt.status === 'pending') {
        // Recepción pendiente: no hay stock que revertir.
        // Solo marcar como voided y eliminar items.
        const { error: itemsErr } = await supabase
          .from('receipt_items')
          .delete()
          .eq('receipt_id', params.receiptId);

        if (itemsErr) throw new Error(`Error al eliminar items: ${itemsErr.message}`);

        const { error: statusErr } = await supabase
          .from('receipts')
          .update({ status: 'voided', updated_at: effectiveDate })
          .eq('id', params.receiptId)
          .eq('status', 'pending');

        if (statusErr) throw new Error(`Error al anular: ${statusErr.message}`);
      } else if (receipt.status === 'active') {
        // Recepción confirmada: revertir stock via RPC con p_operation_date
        const { error } = await supabase.rpc('void_reception_with_reversal', {
          p_receipt_id: params.receiptId,
          p_user_id: user?.id || '',
          p_reason: params.reason || 'Anulacion con reversion de inventario',
          // Política forward-only: el RPC valida contra MAX global
          p_operation_date: params.operationDate,
        });

        if (error) throw error;
      } else {
        throw new Error(`No se puede anular una recepción con status '${receipt.status}'`);
      }
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
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('ERR_BACKDATED_DOCUMENT')) {
        // Toast claro para política forward-only
        // (sonner se maneja en el caller; aquí solo propagamos)
      }
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
  // FIX-P1-B: campos multi-moneda que se perdían
  moneda_recepcion?: string;
  tasa_cambio_recepcion?: number;
  price_currency?: string;
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
      // 0. Crear productos nuevos (is_new=true sin product_id) antes de insertar items
      const newItems = params.items.filter(i => i.is_new && !i.product_id);
      const existingItems = params.items.filter(i => i.product_id);

      const createdProductIds: Record<string, string> = {}; // sku -> new product_id

      if (newItems.length > 0) {
        const productsData = newItems.map(item => ({
          store_id: params.storeId,
          sku: item.sku || `SKU-${Date.now()}-${safeRandomShortId()}`,
          name: item.sku || `Producto ${Date.now()}`, // Se usará temporalmente — el nombre real se setea al confirmar
          cost_price: item.unit_cost,
          price: item.sale_price || 0,
          unit_of_measure: item.unit_of_measure || 'unidad',
          is_active: true,
          is_complete: false,
          stock_current: 0,
        }));

        const { data: createdProducts, error: createErr } = await supabase
          .from('products')
          .insert(productsData)
          .select('id, sku');

        if (createErr) throw new Error(`Error al crear productos nuevos: ${createErr.message}`);

        for (const p of createdProducts || []) {
          if (p.sku) createdProductIds[p.sku] = p.id;
        }
      }

      // Combinar items existentes + nuevos con product_id asignado
      const allItems = [
        ...existingItems,
        ...newItems.map(item => ({
          ...item,
          product_id: createdProductIds[item.sku || ''] || '',
        })),
      ].filter(i => i.product_id); // Solo items con product_id válido

      if (allItems.length === 0) {
        throw new Error('No hay items válidos para guardar');
      }

      // F-21: validar tasa_cambio_recepcion antes de insertar receipt_items.
      // Si algún item tiene moneda != CUP y tasa <= 1.5, lanzar error claro
      // para que el usuario corrija antes de tocar la BD.
      const tasaValidation = validateReceiptItemsTasa(allItems);
      if (!tasaValidation.valid) {
        throw new Error(`F-21: ${tasaValidation.error} — ${tasaValidation.details}`);
      }

      const totalCost = allItems.reduce((s, i) => s + i.quantity * i.unit_cost, 0);

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
      const itemsToInsert = allItems.map(item => ({
        receipt_id: receipt.id,
        product_id: item.product_id,
        variant_id: item.variant_id || null,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        // FIX-P1-B: persistir campos multi-moneda
        moneda_recepcion: item.moneda_recepcion || 'CUP',
        tasa_cambio_recepcion: item.tasa_cambio_recepcion || 1.0,
      }));

      if (itemsToInsert.length > 0) {
        const { error: itemsErr } = await supabase
          .from('receipt_items')
          .insert(itemsToInsert);

        if (itemsErr) {
          await supabase.from('receipts').delete().eq('id', receipt.id);
          throw new Error(`Error al guardar items: ${itemsErr.message}`);
        }
      }

      return receipt.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receptions'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
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
