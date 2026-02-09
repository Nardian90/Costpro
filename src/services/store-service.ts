import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';

export const storeService = {
  async createStore(data: { name: string, address?: string }) {
    logger.info('DATABASE', 'CREATE_STORE', data);
    const { data: store, error } = await supabase
      .from('stores')
      .insert(data)
      .select()
      .single();

    if (error) {
      logger.error('DATABASE', 'CREATE_STORE_FAILED', { error });
      throw error;
    }

    return store;
  },

  async updateStore(storeId: string, name: string, address: string) {
    logger.info('DATABASE', 'UPDATE_STORE', { storeId, name, address });
    const { data, error } = await supabase
      .from('stores')
      .update({ name, address })
      .eq('id', storeId);

    if (error) {
      logger.error('DATABASE', 'UPDATE_STORE_FAILED', { storeId, error });
      throw error;
    }

    return data;
  },

  async deleteStore(storeId: string) {
    logger.info('DATABASE', 'DELETE_STORE', { storeId });
    const { error } = await supabase
      .from('stores')
      .delete()
      .eq('id', storeId);

    if (error) {
      logger.error('DATABASE', 'DELETE_STORE_FAILED', { storeId, error });
      throw error;
    }

    return true;
  }
};
