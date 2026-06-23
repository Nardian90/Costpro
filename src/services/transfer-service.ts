import { z } from 'zod';
import { uuidRegex } from '@/validation/schemas';
import { supabase } from '@/lib/supabaseClient';
import { Transfer, Store, TransferItem, TransferStatus } from '@/types';
import { validateRPCResponse, validateRPCArrayResponse } from '@/lib/rpc-validator';
import {
  transferWithDetailsSchema,
  storeSchema,
  getTransferableStoresParamsSchema,
  createTransferParamsSchema,
  confirmTransferParamsSchema
} from '@/validation/schemas';

export interface TransfersPage {
  transfers: Transfer[];
  total: number;
}

export const transferService = {
  async getIncomingTransfers(
    storeId: string,
    options?: { page?: number; pageSize?: number; status?: TransferStatus }
  ): Promise<TransfersPage> {
    let query = supabase
      .from('transfers')
      .select(
        '*, origin_store:stores!transfers_origin_store_id_fkey(*), creator:profiles!transfers_created_by_profiles_fkey(full_name)',
        { count: 'exact' }
      )
      .eq('destination_store_id', storeId);

    if (options?.status) {
      query = query.eq('status', options.status);
    }

    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 20;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;
    const validated = await validateRPCArrayResponse(data, transferWithDetailsSchema, 'getIncomingTransfers');
    return { transfers: validated as unknown as Transfer[], total: count ?? 0 };
  },

  async getOutgoingTransfers(
    storeId: string,
    options?: { page?: number; pageSize?: number; status?: TransferStatus }
  ): Promise<TransfersPage> {
    let query = supabase
      .from('transfers')
      .select(
        '*, destination_store:stores!transfers_destination_store_id_fkey(*), creator:profiles!transfers_created_by_profiles_fkey(full_name)',
        { count: 'exact' }
      )
      .eq('origin_store_id', storeId);

    if (options?.status) {
      query = query.eq('status', options.status);
    }

    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 20;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;
    const validated = await validateRPCArrayResponse(data, transferWithDetailsSchema, 'getOutgoingTransfers');
    return { transfers: validated as unknown as Transfer[], total: count ?? 0 };
  },

  async getTransferDetails(transferId: string): Promise<Transfer> {
    const { data, error } = await supabase
      .from('transfers')
      .select(`
        *,
        origin_store:stores!transfers_origin_store_id_fkey(*),
        destination_store:stores!transfers_destination_store_id_fkey(*),
        creator:profiles!transfers_created_by_profiles_fkey(full_name),
        items:transfer_items(
          *,
          product:products(*)
        )
      `)
      .eq('id', transferId)
      .single();
    if (error) throw error;
    return await validateRPCResponse(data, transferWithDetailsSchema, 'getTransferDetails') as unknown as Transfer;
  },

  async getTransferableStores(userId: string, currentStoreId: string): Promise<Store[]> {
    const params = getTransferableStoresParamsSchema.parse({
      p_user_id: userId,
      p_current_store_id: currentStoreId
    });
    const { data, error } = await supabase.rpc('get_transferable_stores', params);
    if (error) throw error;
    return await validateRPCArrayResponse(data, storeSchema, 'getTransferableStores');
  },

  async createTransfer(rawParams: {
    origin_store_id: string;
    destination_store_id: string;
    items: Partial<TransferItem>[];
    notes?: string;
    operationDate?: string;
  }) {
    const params = createTransferParamsSchema.parse({
      p_origin_store_id: rawParams.origin_store_id,
      p_destination_store_id: rawParams.destination_store_id,
      p_items: rawParams.items,
      p_notes: rawParams.notes || null,
      p_operation_date: rawParams.operationDate,
    });
    const { data, error } = await supabase.rpc('create_transfer', params);
    if (error) throw error;
    return data;
  },

  async confirmTransfer(transferId: string, userId: string, operationDate?: string) {
    const params = confirmTransferParamsSchema.parse({
      p_transfer_id: transferId,
      p_user_id: userId,
      p_operation_date: operationDate,
    });
    const { data, error } = await supabase.rpc('confirm_transfer', params);
    if (error) throw error;
    if (data?.status === 'error') {
      throw new Error(data.message || 'Error al confirmar la transferencia');
    }
    return data;
  },

  // --- Stubs: funcionalidades pendientes de cablear con Supabase ---
  // Descomentar e implementar cuando la RPC correspondiente exista en Supabase.

  async cancelTransfer(transferId: string, userId: string) {
    const params = z.object({
      p_transfer_id: z.string().regex(uuidRegex),
      p_user_id: z.string().regex(uuidRegex),
    }).parse({ p_transfer_id: transferId, p_user_id: userId });
    const { data, error } = await supabase.rpc('cancel_transfer', params);
    if (error) throw error;
    if (data?.status === 'error') throw new Error(data.message || 'Error al cancelar');
    return data;
  },
};
