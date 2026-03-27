import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { Store } from '@/types';

export const storeService = {
  async getStores() {
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) {
      logger.error('DATABASE', 'GET_STORES_FAILED', { error });
      throw error;
    }

    return data as Store[];
  },

  async createStore(name: string, address: string, createdBy?: string) {
    logger.info('DATABASE', 'CREATE_STORE', { name, address, createdBy });
    const { data, error } = await supabase
      .from('stores')
      .insert({
        name,
        address,
        created_by: createdBy,
        is_active: true
      })
      .select()
      .single();

    if (error) {
      logger.error('DATABASE', 'CREATE_STORE_FAILED', { error });
      throw error;
    }

    return data as Store;
  },

  async updateStore(storeId: string, name: string, address: string, additionalData?: Partial<Store>) {
    logger.info('DATABASE', 'UPDATE_STORE', { storeId, name, address });
    const { data, error } = await supabase
      .from('stores')
      .update({ name, address, ...additionalData })
      .eq('id', storeId)
      .select()
      .single();

    if (error) {
      logger.error('DATABASE', 'UPDATE_STORE_FAILED', { storeId, error });
      throw error;
    }

    return data as Store;
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
  },

  async resetStore(storeId: string) {
    logger.info('DATABASE', 'RESET_STORE', { storeId });
    const { error } = await supabase.rpc('reset_store_data', {
      target_store_id: storeId
    });

    if (error) {
      logger.error('DATABASE', 'RESET_STORE_FAILED', { storeId, error });
      throw error;
    }
  }
};
