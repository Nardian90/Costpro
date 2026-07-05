import { SimulationResult, StrategyConfig, Pick3Result } from '@/types/pick3';
import { supabase, getSupabaseAuthClient } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';

const STORAGE_KEYS = {
  HISTORY: 'pick3_draw_history',
  SIMULATIONS: 'pick3_simulations',
  CONFIG: 'pick3_current_config',
  PLAYS: 'pick3_saved_plays'
};

const isBrowser = typeof window !== 'undefined';

/**
 * Crea un cliente Supabase con service role key para bypass RLS.
 * Solo usar server-side (API routes) cuando el usuario no es admin.
 *
 * FIX-RLS (2026-07-05): el sync de Pick 3 fallaba con error 42501
 * "new row violates row-level security policy" porque la tabla
 * pick3_history solo permite INSERT/UPDATE a admins (is_admin()).
 * Los usuarios normales pueden hacer sync desde el navegador,
 * así que necesitamos el service role key para bypass RLS.
 */
function createServerClient() {
  if (isBrowser) {
    logger.warn('PICK3', 'createServerClient called from browser — using anon client (RLS will apply)');
    return supabase;
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!serviceRoleKey || !supabaseUrl) {
    logger.warn('PICK3', 'SUPABASE_SERVICE_ROLE_KEY not configured — using anon client');
    return supabase;
  }

  // Lazy import para evitar cargar @supabase/supabase-js en el browser bundle
  const { createClient } = require('@supabase/supabase-js');
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export class Pick3Storage {
  static async saveHistory(results: Pick3Result[]) {
    if (!results.length) return;

    try {
      // 1. Fetch existing records to check sync_method priority
      const dates = [...new Set(results.map(r => r.date))];
      const { data: existing } = await supabase
        .from('pick3_history')
        .select('draw_date, draw_time, sync_method')
        .in('draw_date', dates);

      const existingMap = new Map<string, string>();
      existing?.forEach(e => {
        existingMap.set(`${e.draw_date}-${e.draw_time}`, e.sync_method);
      });

      // Priority Logic:
      // - PDF: Overwrites everything (Ultimate truth).
      // - Manual: Overwrites Web or Gaps. "Permaneces hasta que se pueda actualizar del PDF".
      // - Web: Overwrites only Gaps. If Manual exists, Web waits for PDF to verify.
      const rowsToUpsert = results.filter(r => {
        const key = `${r.date}-${r.draw_time}`;
        const existingSync = existingMap.get(key);
        const incomingSync = r.sync_method || 'web';

        if (!existingSync) return true; // New record
        if (incomingSync === 'pdf') return true; // PDF always wins
        if (existingSync === 'pdf') return false; // PDF is locked

        if (incomingSync === 'manual') return true; // User manual entry can correct Web or Gap
        if (incomingSync === 'web') return (existingSync !== 'manual'); // Web fills gaps or updates web, but doesn't touch manual

        return false;
      }).map(r => ({
        draw_date: r.date,
        draw_time: r.draw_time,
        result: r.result as [number, number, number],
        source: r.source || 'official',
        fireball: (r as any).fireball,
        sync_method: r.sync_method || 'web',
        raw_text: (r as any).raw_text
      }));

      if (rowsToUpsert.length === 0) {
        logger.info('PICK3', 'No new rows to upsert (all protected by priority rules)');
        return;
      }

      const { error } = await supabase
        .from('pick3_history')
        .upsert(rowsToUpsert, { onConflict: 'draw_date,draw_time' });

      if (error) {
        logger.error('PICK3', 'Error saving history to Supabase', { error, count: rowsToUpsert.length });
        throw error;
      }

      logger.info('PICK3', 'History saved successfully', { count: rowsToUpsert.length });

      if (isBrowser) {
        // Refresh local history
        await this.getHistory();
      }
    } catch (err) {
       console.error('[Pick3Storage] Critical error saving history:', err);
       throw err;
    }
  }

  /**
   * FIX-RLS (2026-07-05): Versión server-side de saveHistory que usa
   * el service role key para bypass RLS. Solo llamar desde API routes.
   *
   * Necesario porque la tabla pick3_history tiene RLS que solo permite
   * INSERT/UPDATE a admins (is_admin()). Los usuarios normales pueden
   * hacer sync desde el navegador, pero el sync se procesa server-side
   * en /api/pick3/sync, así que usamos este método para evitar el error
   * 42501 "new row violates row-level security policy".
   */
  static async saveHistoryServer(results: Pick3Result[]) {
    if (!results.length) return;

    try {
      const serverClient = createServerClient();

      // 1. Fetch existing records to check sync_method priority
      const dates = [...new Set(results.map(r => r.date))];
      const { data: existing } = await serverClient
        .from('pick3_history')
        .select('draw_date, draw_time, sync_method')
        .in('draw_date', dates);

      const existingMap = new Map<string, string>();
      existing?.forEach((e: any) => {
        existingMap.set(`${e.draw_date}-${e.draw_time}`, e.sync_method);
      });

      // Priority Logic (igual que saveHistory):
      // - PDF: Overwrites everything (Ultimate truth).
      // - Manual: Overwrites Web or Gaps.
      // - Web: Overwrites only Gaps. If Manual exists, Web waits for PDF.
      const rowsToUpsert = results.filter(r => {
        const key = `${r.date}-${r.draw_time}`;
        const existingSync = existingMap.get(key);
        const incomingSync = r.sync_method || 'web';

        if (!existingSync) return true; // New record
        if (incomingSync === 'pdf') return true; // PDF always wins
        if (existingSync === 'pdf') return false; // PDF is locked

        if (incomingSync === 'manual') return true; // User manual entry can correct Web or Gap
        if (incomingSync === 'web') return (existingSync !== 'manual');

        return false;
      }).map(r => ({
        draw_date: r.date,
        draw_time: r.draw_time,
        result: r.result as [number, number, number],
        source: r.source || 'official',
        fireball: (r as any).fireball,
        sync_method: r.sync_method || 'web',
        raw_text: (r as any).raw_text
      }));

      if (rowsToUpsert.length === 0) {
        logger.info('PICK3', 'No new rows to upsert (all protected by priority rules)', { serverSide: true });
        return;
      }

      const { error } = await serverClient
        .from('pick3_history')
        .upsert(rowsToUpsert, { onConflict: 'draw_date,draw_time' });

      if (error) {
        logger.error('PICK3', 'Error saving history (server-side) to Supabase', { error, count: rowsToUpsert.length });
        throw error;
      }

      logger.info('PICK3', 'History saved successfully (server-side)', { count: rowsToUpsert.length });
    } catch (err) {
      console.error('[Pick3Storage] Critical error saving history (server-side):', err);
      throw err;
    }
  }

  static async deleteHistoryEntry(date: string, drawTime: string) {
    try {
      const { error } = await supabase
        .from('pick3_history')
        .delete()
        .match({ draw_date: date, draw_time: drawTime });

      if (error) throw error;

      if (isBrowser) {
        await this.getHistory();
      }
    } catch (err) {
      logger.error('PICK3', 'Error deleting history entry', { error: err, date, drawTime });
      throw err;
    }
  }

  static async getHistory(): Promise<Pick3Result[]> {
    try {
      // FIX-AUTH (2026-07-05): usar el token del usuario autenticado para que
      // RLS permita ver los registros. El cliente singleton usa la anon key,
      // pero la política pick3_history_select_authenticated requiere rol authenticated.
      // Sin token, la query retorna [] (vacío).
      let client = supabase;
      if (isBrowser) {
        // Intentar obtener el token del auth store (lazy import para evitar circular dep)
        try {
          const { useAuthStore } = await import('@/store');
          const token = useAuthStore.getState().token;
          if (token) {
            client = getSupabaseAuthClient(token);
          }
        } catch {
          // Si no podemos importar el store, usar el cliente singleton
        }
      }

      // FIX-ORDER (2026-07-05): ordenar por draw_date DESC y draw_time DESC
      // para que evening quede antes que midday en la misma fecha (más reciente primero)
      const { data, error } = await client
        .from('pick3_history')
        .select('*')
        .order('draw_date', { ascending: false })
        .order('draw_time', { ascending: false });

      if (error) {
        logger.warn('PICK3', 'Error fetching from Supabase, falling back to local', { error });
        return this.getHistoryLocal();
      }

      if (!data || data.length === 0) {
        // FIX-AUTH: si la query retorna vacío, intentar con localStorage como fallback
        // (puede ser que el usuario no esté autenticado o el token expiró)
        const local = this.getHistoryLocal();
        if (local.length > 0) {
          logger.info('PICK3', 'Query returned empty, using localStorage cache', { localCount: local.length });
          return local;
        }
        return [];
      }

      const results = data.map(r => ({
        date: r.draw_date,
        draw_time: r.draw_time as any,
        result: r.result as [number, number, number],
        source: r.source || 'official',
        fireball: r.fireball,
        sync_method: r.sync_method,
        raw_text: r.raw_text
      }));

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
