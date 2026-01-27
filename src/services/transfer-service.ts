import { supabase } from '@/lib/supabaseClient';
import { Transfer } from '@/types';

export const transferService = {
  async getIncomingTransfers(storeId: string) {
    const { data, error } = await supabase
      .from('transfers')
      .select('*, origin_store:stores!transfers_origin_store_id_fkey(*), creator:profiles!transfers_created_by_profiles_fkey(full_name)')
      .eq('destination_store_id', storeId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as any[];
  },

  async getOutgoingTransfers(storeId: string) {
    const { data, error } = await supabase
      .from('transfers')
      .select('*, destination_store:stores!transfers_destination_store_id_fkey(*), creator:profiles!transfers_created_by_profiles_fkey(full_name)')
      .eq('origin_store_id', storeId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as any[];
  },

  async getTransferDetails(transferId: string) {
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
    return data as any;
  },

  async getTransferableStores(userId: string, currentStoreId: string) {
    const { data, error } = await supabase.rpc('get_transferable_stores', {
      p_user_id: userId,
      p_current_store_id: currentStoreId
    });
    if (error) throw error;
    return data;
  },

  async createTransfer(params: {
    origin_store_id: string;
    destination_store_id: string;
    items: any[];
    notes?: string;
  }) {
    const { data, error } = await supabase.rpc('create_transfer', {
      p_origin_store_id: params.origin_store_id,
      p_destination_store_id: params.destination_store_id,
      p_items: params.items,
      p_notes: params.notes || null
    });
    if (error) throw error;
    return data;
  },

  async confirmTransfer(transferId: string, userId: string) {
    const { data, error } = await supabase.rpc('confirm_transfer', {
      p_transfer_id: transferId,
      p_user_id: userId
    });
    if (error) throw error;
    return data;
  }
};
