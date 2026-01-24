import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';

export const userService = {
  async setActiveStore(userId: string, storeId: string) {
    logger.info('DATABASE', 'SET_ACTIVE_STORE', { userId, storeId });
    const { data, error } = await supabase
      .from('profiles')
      .update({ active_store_id: storeId })
      .eq('id', userId);

    if (error) {
      logger.error('DATABASE', 'SET_ACTIVE_STORE_FAILED', { userId, storeId, error });
      throw error;
    }

    return data;
  },

  async logout() {
    logger.info('DATABASE', 'LOGOUT');
    const { error } = await supabase.auth.signOut();
    if (error) {
      logger.error('DATABASE', 'LOGOUT_FAILED', { error });
      throw error;
    }
  }
};
