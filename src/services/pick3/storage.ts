import { SimulationResult, StrategyConfig, Pick3Result } from '@/types/pick3';
import { supabase } from '@/lib/supabaseClient';

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

    // Map to DB schema
    const rows = results.map(r => ({
      draw_date: r.date,
      draw_time: r.draw_time,
      result: r.result
    }));

    const { error } = await supabase
      .from('pick3_history')
      .upsert(rows, { onConflict: 'draw_date,draw_time' });

    if (error) console.error('[Pick3Storage] Error saving history:', error);

    // Fallback/Cache
    if (isBrowser) {
      localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(results));
    }
  }

  static async getHistory(): Promise<Pick3Result[]> {
    const { data, error } = await supabase
      .from('pick3_history')
      .select('*')
      .order('draw_date', { ascending: false });

    if (error || !data) {
      console.warn('[Pick3Storage] Error fetching from Supabase, falling back to local:', error);
      if (isBrowser) {
        const local = localStorage.getItem(STORAGE_KEYS.HISTORY);
        return local ? JSON.parse(local) : [];
      }
      return [];
    }

    return data.map(r => ({
      date: r.draw_date,
      draw_time: r.draw_time as any,
      result: r.result as [number, number, number]
    }));
  }

  static async saveSimulation(userId: string, simulation: SimulationResult) {
    const { error } = await supabase
      .from('pick3_simulations')
      .insert({
        user_id: userId,
        config: simulation.config,
        result: simulation,
        created_at: new Date().toISOString()
      });

    if (error) console.error('[Pick3Storage] Error saving simulation:', error);

    if (isBrowser) {
      const existing = this.getSimulationsLocal();
      const updated = [simulation, ...existing].slice(0, 10);
      localStorage.setItem(STORAGE_KEYS.SIMULATIONS, JSON.stringify(updated));
    }
  }

  static getSimulationsLocal(): SimulationResult[] {
    if (!isBrowser) return [];
    const data = localStorage.getItem(STORAGE_KEYS.SIMULATIONS);
    return data ? JSON.parse(data) : [];
  }

  static async getSimulations(userId: string): Promise<SimulationResult[]> {
    const { data, error } = await supabase
      .from('pick3_simulations')
      .select('result')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error || !data) return this.getSimulationsLocal();
    return data.map(d => d.result as unknown as SimulationResult);
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
