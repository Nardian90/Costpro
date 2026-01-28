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
  },

  async updateAISettings(userId: string, provider: string, apiKey: string) {
    logger.info('DATABASE', 'UPDATE_AI_SETTINGS', { userId, provider });

    const updates: any = { ai_provider: provider };
    if (apiKey && apiKey.trim().length > 0) {
      updates.ai_api_key = apiKey;
    }

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId);

    if (error) {
      logger.error('DATABASE', 'UPDATE_AI_SETTINGS_FAILED', { userId, error });
      throw error;
    }
  }
};
