import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';

export const storeService = {
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
  }
};
