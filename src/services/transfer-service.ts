import { supabase } from '@/lib/supabaseClient';
import { Transfer, Store, TransferItem } from '@/types';
import { validateRPCResponse, validateRPCArrayResponse } from '@/lib/rpc-validator';
import {
  transferWithDetailsSchema,
  storeSchema,
  getTransferableStoresParamsSchema,
  createTransferParamsSchema,
  confirmTransferParamsSchema
} from '@/validation/schemas';

export const transferService = {
  async getIncomingTransfers(storeId: string): Promise<Transfer[]> {
    const { data, error } = await supabase
      .from('transfers')
      .select('*, origin_store:stores!transfers_origin_store_id_fkey(*), creator:profiles!transfers_created_by_profiles_fkey(full_name)')
      .eq('destination_store_id', storeId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return await validateRPCArrayResponse(data, transferWithDetailsSchema, 'getIncomingTransfers');
  },

  async getOutgoingTransfers(storeId: string): Promise<Transfer[]> {
    const { data, error } = await supabase
      .from('transfers')
      .select('*, destination_store:stores!transfers_destination_store_id_fkey(*), creator:profiles!transfers_created_by_profiles_fkey(full_name)')
      .eq('origin_store_id', storeId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return await validateRPCArrayResponse(data, transferWithDetailsSchema, 'getOutgoingTransfers');
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
    return await validateRPCResponse(data, transferWithDetailsSchema, 'getTransferDetails');
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
  }) {
    const params = createTransferParamsSchema.parse({
      p_origin_store_id: rawParams.origin_store_id,
      p_destination_store_id: rawParams.destination_store_id,
      p_items: rawParams.items,
      p_notes: rawParams.notes || null
    });
    const { data, error } = await supabase.rpc('create_transfer', params);
    if (error) throw error;
    return data;
  },

  async confirmTransfer(transferId: string, userId: string) {
    const params = confirmTransferParamsSchema.parse({
      p_transfer_id: transferId,
      p_user_id: userId
    });
    const { data, error } = await supabase.rpc('confirm_transfer', params);
    if (error) throw error;
    if (data?.status === 'error') {
      throw new Error(data.message || 'Error al confirmar la transferencia');
    }
    return data;
  }
};
