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
      let tokenSource = 'anon';

      if (isBrowser) {
        // Método 1: intentar obtener el token del auth store
        try {
          const { useAuthStore } = await import('@/store');
          const token = useAuthStore.getState().token;
          if (token && token.length > 20) {
            client = getSupabaseAuthClient(token);
            tokenSource = 'authStore';
          }
        } catch {
          // Si no podemos importar el store, continuar con cliente singleton
        }

        // Método 2 (fallback): si el authStore no tenía token, intentar getSession()
        if (tokenSource === 'anon') {
          try {
            const { data: sessionData } = await supabase.auth.getSession();
            if (sessionData?.session?.access_token) {
              client = getSupabaseAuthClient(sessionData.session.access_token);
              tokenSource = 'supabaseSession';
            }
          } catch {
            // Ignorar
          }
        }
      }

      logger.info('PICK3', `getHistory: tokenSource=${tokenSource}`);

      // FIX-LIMIT-CANONICO (2026-07-05): traer los 100 registros más recientes.
      // 100 registros = ~50 días, suficiente para:
      //   - Mostrar histórico reciente en la UI (50 días × 2 sorteos)
      //   - Backtest con ventana de 30 días (necesita 60+ registros)
      //   - Análisis estadístico básico
      // FIX-PERF (2026-07-05): reducido de 200 a 100 para evitar congelamiento.
      // detectRegimeChange hace chi-cuadrado por cada posición (n-30 posiciones).
      // Con 200 registros = 170 chi-cuadrados. Con 100 = 70. Mucho más rápido.
      //
      // ORDEN CANÓNICO:
      // - draw_date DESC (más reciente primero)
      // - draw_time ASC para que evening quede ANTES que midday en la misma fecha
      const { data, error } = await client
        .from('pick3_history')
        .select('*')
        .order('draw_date', { ascending: false })
        .order('draw_time', { ascending: true })
        .limit(100);

      if (error) {
        logger.error('PICK3', 'Error fetching from Supabase', { error, tokenSource });
        // FIX-CANONICO: ya NO caer al localStorage — eso escondía el problema
        // y mostraba datos viejos. Retornar vacío para que el componente muestre
        // el estado de error y el usuario sepa que algo falló.
        return [];
      }

      // FIX-CANONICO (2026-07-05): NO caer al localStorage si la query retorna vacío.
      // Si la query retorna vacío, es porque el token no es válido o no hay datos.
      // Caer al localStorage escondía el problema y mostraba datos viejos sin 04/07.
      // Ahora retornamos vacío y dejamos que el componente muestre el estado correcto.
      if (!data || data.length === 0) {
        logger.warn('PICK3', 'Query returned empty (no data or token invalid)', { tokenSource });
        return [];
      }

      logger.info('PICK3', `getHistory: fetched ${data.length} records from Supabase`, {
        tokenSource,
        latestDate: data[0]?.draw_date,
        latestTime: data[0]?.draw_time,
        latestSyncMethod: data[0]?.sync_method,
        has_04_07: data.some((r: any) => r.draw_date === '2026-07-04')
      });

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
      // FIX-CANONICO: ya NO caer al localStorage en caso de error
      return [];
    }
  }

  /**
   * FIX-FORCE-REFRESH (2026-07-05): Fuerza una recarga limpia desde Supabase.
   * Limpia el cache de localStorage y hace una query fresca con el token.
   * Usar cuando el usuario sospeche que los datos están desactualizados.
   */
  static async forceRefreshHistory(): Promise<{ records: Pick3Result[]; source: string; latestDate: string | null }> {
    // 1. Limpiar TODO el cache de localStorage de Pick 3
    if (isBrowser) {
      localStorage.removeItem(STORAGE_KEYS.HISTORY);
      // FIX-DISPLAY-LIMIT (2026-07-05): también limpiar el displayLimit
      // para que el default se aplique fresco
      localStorage.removeItem('pick3-display-limit');
      logger.info('PICK3', 'forceRefreshHistory: localStorage cache cleared (history + displayLimit)');
    }

    // 2. Hacer query fresca
    const records = await this.getHistory();

    return {
      records,
      source: 'force-refresh',
      latestDate: records[0]?.date || null,
    };
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
