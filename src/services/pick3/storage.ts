import { SimulationResult, StrategyConfig, Pick3Result } from '@/types/pick3';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';

const STORAGE_KEYS = {
  HISTORY: 'pick3_draw_history',
  SIMULATIONS: 'pick3_simulations',
  CONFIG: 'pick3_current_config',
  PLAYS: 'pick3_saved_plays'
};

const isBrowser = typeof window !== 'undefined';

export class Pick3Storage {
  static async saveHistory(results: Pick3Result[]) {
    if (!results.length) return;

    try {
      // Map to DB schema
      const rows = results.map(r => ({
        draw_date: r.date,
        draw_time: r.draw_time,
        result: r.result as [number, number, number],
        source: r.source || 'official'
      }));

      const { error } = await supabase
        .from('pick3_history')
        .upsert(rows, { onConflict: 'draw_date,draw_time' });

      if (error) {
        logger.error('PICK3', 'Error saving history to Supabase', { error, rows });
        throw error;
      }

      logger.info('PICK3', 'History saved successfully', { count: results.length });

      // Fallback/Cache
      if (isBrowser) {
        localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(results));
      }
    } catch (err) {
       console.error('[Pick3Storage] Critical error saving history:', err);
       // We still cache locally if possible even if Supabase fails
       if (isBrowser) {
         localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(results));
       }
       throw err;
    }
  }

  static async getHistory(): Promise<Pick3Result[]> {
    try {
      const { data, error } = await supabase
        .from('pick3_history')
        .select('*')
        .order('draw_date', { ascending: false });

      if (error) {
        logger.warn('PICK3', 'Error fetching from Supabase, falling back to local', { error });
        return this.getHistoryLocal();
      }

      if (!data) return this.getHistoryLocal();

      const results = data.map(r => ({
        date: r.draw_date,
        draw_time: r.draw_time as any,
        result: r.result as [number, number, number],
        source: r.source || 'official'
      }));

      // Update cache
      if (isBrowser) {
        localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(results));
      }

      return results;
    } catch (err) {
      logger.error('PICK3', 'Critical error fetching history', { error: err });
      return this.getHistoryLocal();
    }
  }

  private static getHistoryLocal(): Pick3Result[] {
    if (isBrowser) {
      const local = localStorage.getItem(STORAGE_KEYS.HISTORY);
      return local ? JSON.parse(local) : [];
    }
    return [];
  }

  static async saveSimulation(userId: string, simulation: SimulationResult) {
    try {
      const { error } = await supabase
        .from('pick3_simulations')
        .insert({
          user_id: userId,
          config: simulation.config,
          result: simulation,
          created_at: new Date().toISOString()
        });

      if (error) {
        logger.error('PICK3', 'Error saving simulation to Supabase', { error, userId });
        throw error;
      }

      if (isBrowser) {
        const existing = this.getSimulationsLocal();
        const updated = [simulation, ...existing].slice(0, 10);
        localStorage.setItem(STORAGE_KEYS.SIMULATIONS, JSON.stringify(updated));
      }
    } catch (err) {
      console.error('[Pick3Storage] Error saving simulation:', err);
      throw err;
    }
  }

  static getSimulationsLocal(): SimulationResult[] {
    if (!isBrowser) return [];
    const data = localStorage.getItem(STORAGE_KEYS.SIMULATIONS);
    return data ? JSON.parse(data) : [];
  }

  static async getSimulations(userId: string): Promise<SimulationResult[]> {
    try {
      const { data, error } = await supabase
        .from('pick3_simulations')
        .select('result')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error || !data) return this.getSimulationsLocal();
      return data.map(d => d.result as unknown as SimulationResult);
    } catch (err) {
      return this.getSimulationsLocal();
    }
  }

  static saveConfig(config: StrategyConfig) {
    if (!isBrowser) return;
    localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(config));
  }

  static getConfig(): StrategyConfig | null {
    if (!isBrowser) return null;
    const data = localStorage.getItem(STORAGE_KEYS.CONFIG);
    return data ? JSON.parse(data) : null;
  }

  static clear() {
    if (!isBrowser) return;
    Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
  }
}

export class UserPlayStorage {
  static async savePlay(userId: string | undefined, play: any, isAdmin: boolean) {
    if (isAdmin && userId) {
      const { error } = await supabase
        .from('pick3_user_plays')
        .insert({
          user_id: userId,
          combination: play.combination,
          amount: play.amount,
          status: 'pending'
        });
      if (error) throw error;
    }

    // Always save to local for immediate UI feedback
    const localPlays = this.getLocalPlays();
    const updated = [play, ...localPlays].slice(0, 50);
    localStorage.setItem('pick3_saved_plays', JSON.stringify(updated));
  }

  static getLocalPlays(): any[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem('pick3_saved_plays');
    return data ? JSON.parse(data) : [];
  }

  static async syncPlays(userId: string) {
    const { data, error } = await supabase
      .from('pick3_user_plays')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) return;
    if (data) {
       localStorage.setItem('pick3_saved_plays', JSON.stringify(data));
    }
  }
}
