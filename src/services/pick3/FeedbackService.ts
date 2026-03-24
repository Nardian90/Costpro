import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';

export interface UserFeedback {
  user_id: string;
  fecha: string;
  inversion: number;
  ganancia: number;
  estrategia_id: string;
}

export class Pick3FeedbackService {
  static async saveFeedback(feedback: UserFeedback) {
    try {
      const { error } = await supabase
        .from('user_strategy_feedback')
        .insert(feedback);

      if (error) throw error;
      logger.info('PICK3', 'Feedback saved successfully', { feedback });
      return { success: true };
    } catch (err) {
      logger.error('PICK3', 'Error saving feedback', { err, feedback });
      return { success: false, error: err };
    }
  }

  static async getUserFeedback(userId: string) {
    try {
      const { data, error } = await supabase
        .from('user_strategy_feedback')
        .select('*')
        .eq('user_id', userId)
        .order('fecha', { ascending: false });

      if (error) throw error;
      return data;
    } catch (err) {
      logger.error('PICK3', 'Error fetching feedback', { err, userId });
      return [];
    }
  }
}
