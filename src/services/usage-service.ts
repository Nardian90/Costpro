import { supabase } from '@/lib/supabaseClient';

export type UsageAction = 'fc_create' | 'fc_export' | 'fc_import';

export const usageService = {
  /**
   * Checks if a user has enough quota to perform an action.
   * Returns { allowed: boolean, count: number, limit: number }
   */
  async checkQuota(userId: string, action: UsageAction, plan: string = 'free') {
    if (plan === 'pro' || plan === 'enterprise') {
      return { allowed: true, count: 0, limit: -1 };
    }

    const limit = 3; // Hardcoded for now as per requirements

    const { data, error } = await supabase
      .from('user_usage')
      .select('count')
      .eq('user_id', userId)
      .eq('action_type', action)
      .eq('usage_date', new Date().toISOString().split('T')[0])
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
      console.error('[UsageService] Error checking quota:', error);
      return { allowed: true, count: 0, limit }; // Fail open to not block users on DB error
    }

    const currentCount = data?.count || 0;
    return {
      allowed: currentCount < limit,
      count: currentCount,
      limit
    };
  },

  /**
   * Increments usage for a specific action.
   * Returns true if successful and within limit.
   */
  async trackUsage(userId: string, action: UsageAction, plan: string = 'free') {
    if (plan === 'pro' || plan === 'enterprise') {
      return true;
    }

    const limit = 3;
    const { data, error } = await supabase.rpc('increment_user_usage', {
      p_user_id: userId,
      p_action_type: action,
      p_limit: limit
    });

    if (error) {
      console.error('[UsageService] Error tracking usage:', error);
      return true; // Fail open
    }

    return data as boolean;
  }
};
