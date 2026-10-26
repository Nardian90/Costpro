/**
 * exchange-capture.ts — Lógica compartida de captura de tasas BCC + informal (Diviza).
 *
 * Single source of truth: el cron (GitHub Actions → scripts/cron), el proxy
 * manual (/api/exchange-rates/refresh) y la captura informal puntual
 * (/api/exchange-rates/scrape-diviza) usan TODOS esta lib.
 *
 * HISTORIA DE LA CAPTURA INFORMAL:
 *   - RED FLAG F-01b (2026-07-03): source='elToque' se estimaba como
 *     `BCC_seg3 × 1.15` sin distinguirla en BD → se añadió capture_method.
 *   - IC-SOLUCIONES-CUBA-SCRAPER (2026-07-03): el scraping de eltoque.com no
 *     funciona (Cloudflare + tasas como imágenes) → se añadió
 *     solucionescuba.com como fuente informal real.
 *   - IC-DIVIZA (2026-10-26): solucionescuba.com CAÍDO. Reemplazo:
 *     cubadivisas.com (Diviza) — HTML público estático con JSON "conv-data".
 *   - IC-DIVIZA-002 (2026-10-26): (1) la FECHA OPERATIVA pasa a ser la civil
 *     de Cuba (America/Havana) vía src/lib/operative-date.ts — antes se usaba
 *     la fecha UTC y las capturas de la tarde/noche cubana se fechaban «al
 *     día siguiente»; (2) BCC /historico devuelve un ARRAY PURO (sin envoltura
 *     {tasas}) y sin codigoMoneda → el backfill histórico oficial fallaba en
 *     silencio con «No BCC data» para cada fecha pasada; (3) el resultado
 *     expone el estado POR FUENTE (bcc/diviza) para que el botón «Actualizar
 *     BD» distinga éxito completo de éxito parcial; (4) se persiste
 *     source_updated_at (hora en que DIVIZA actualizó su cotización),
 *     distinta de captured_at (hora en que CostPro capturó).
 *
 * REGLAS ACTUALES (misión 2026-10-26):
 *   - Tasas BCC: siempre `capture_method='real'` (API pública directa).
 *   - Tasas informales HOY: se capturan de Diviza con `source='Diviza'`,
 *     `capture_method='real'`. EUR/MLC solo se guardan si Diviza los publica
 *     (JAMÁS se fabrican desde BCC×1.15 ni EUR=USD).
 *   - NO se persisten estimaciones: si Diviza falla, no se guarda nada para
 *     esa fecha — la capa de consulta hace carry-forward del último valor real
 *     y la UI muestra la antigüedad.
 *   - Fechas PASADAS: Diviza solo publica la cotización vigente (sin serie
 *     histórica) → el backfill informal NO inventa datos; el histórico se
 *     importa por Excel (bulk-upload, serie informal histórica elToque).
 *   - Fechas históricas YA almacenadas: no se recalculan ni re-fechan.
 */

import { getOperativeDate, buildOperativeDateRange } from './operative-date';

// Constantes (antes magic numbers esparcidos)
export const BCC_API_BASE = 'https://api.bc.gob.cu/v1/tasas-de-cambio';
export const CURRENCIES = ['USD', 'EUR'] as const;
export const DEFAULT_USD_ESPECIAL = 574;
export const DEFAULT_EUR_ESPECIAL = 653;

/** Fuentes informales válidas en exchange_rates.source (orden de prioridad). */
export const INFORMAL_SOURCES = ['Diviza', 'elToque'] as const;

/**
 * Método de captura.
 * - 'real': cotización válida y verificable obtenida del proveedor que se
 *   registra (Diviza o API directa BCC).
 * - 'estimated': valor calculado (identificado como estimado; NUNCA se
 *   persiste desde 2026-10-26 — se mantiene en el enum por el histórico).
 */
export type CaptureMethod = 'real' | 'estimated';

// Mapeo BCC segmento → campo en la API
export const BCC_SEGMENTS = [
  { segment: '1', field: 'tasaOficial' },
  { segment: '2', field: 'tasaPublica' },
  { segment: '3', field: 'tasaEspecial' },
] as const;

export interface BCCRate {
  codigoMoneda: string;
  fecha?: string;
  tasaOficial?: number;
  tasaPublica?: number;
  tasaEspecial?: number;
}

export interface CaptureResult {
  date: string;
  currency: string;
  source: 'BCC' | 'elToque' | 'Diviza';
  segment: string;
  rate: number;
  /**
   * Método de captura: 'real' (cotización verificable del proveedor
   * registrado) o 'estimated' (histórico: BCC×1.15).
   */
  capture_method: CaptureMethod;
}

/**
 * Estado de una fuente dentro de una captura (misión §4: BCC y Diviza se
 * reportan de forma INDEPENDIENTE — un éxito BCC nunca oculta un fallo
 * Diviza bajo un «Captura completada» genérico).
 */
export interface SourceCaptureStatus {
  /** true si la fuente aportó filas y no tuvo errores de extracción/persistencia. */
  ok: boolean;
  /** Filas realmente insertadas/actualizadas por esta fuente. */
  rows: number;
  /** Errores de extracción/persistencia propios de esta fuente. */
  errors: string[];
  /** ¿Se intentó capturar esta fuente? (Diviza no se intenta en fechas pasadas). */
  attempted: boolean;
}

export interface CaptureForDateResult {
  captured: CaptureResult[];
  errors: string[];
  /** Estado de la captura BCC de esta fecha (independiente de Diviza). */
  bcc: SourceCaptureStatus;
  /** Estado de la captura informal Diviza (solo se intenta en la fecha operativa). */
  diviza: SourceCaptureStatus;
  /** Sello de la hora en que DIVIZA actualizó su cotización (si se capturó). */
  divizaSourceUpdatedAt: string | null;
}

export interface CaptureDateRangeResult {
  captured: CaptureResult[];
  /** Errores agregados (compatibilidad con el formato plano anterior). */
  errors: string[];
  datesProcessed: string[];
  /** Fecha operativa (civil de Cuba) que gobernó esta captura. */
  operativeDate: string;
  /** Estado agregado de BCC en el rango procesado. */
  bcc: SourceCaptureStatus;
  /** Estado de la captura informal Diviza para la FECHA OPERATIVA. */
  diviza: SourceCaptureStatus;
  /**
   * Hora en que DIVIZA actualizó la cotización vigente (ISO con offset),
   * tal como la declara la fuente. null si Diviza falló o no la declaró.
   */
  divizaSourceUpdatedAt: string | null;
}

/**
 * Fábrica de estado por fuente. OJO: los spreads de una constante compartida
 * copiarían POR REFERENCIA el array `errors` (todas las fuentes compartirían
 * la misma lista y los errores de Diviza aparecerían en BCC). Cada estado
 * necesita SU PROPIO array.
 */
const newSourceStatus = (attempted = false): SourceCaptureStatus => ({
  ok: false,
  rows: 0,
  errors: [],
  attempted,
});

/**
 * Hace upsert a Supabase vía REST (no necesita client JS).
 *
 * FIX IC-DIVIZA (2026-10-26): el upsert anterior usaba
 * `Prefer: resolution=ignore-duplicates` SIN `on_conflict`, por lo que
 * PostgREST resolvía el conflicto contra la PK sintética (id) — no contra la
 * clave natural (rate_date,currency,source,segment). Resultado: recapturar
 * el mismo día devolvía 409 «duplicate key» en vez de actualizar.
 *
 * Ahora: `on_conflict=rate_date,currency,source,segment` +
 * `Prefer: resolution=merge-duplicates` → ON CONFLICT DO UPDATE (refresh de
 * rate/captured_at/capture_method/source_updated_at). Diviza actualiza cada
 * 30 min: una recaptura del mismo día DEBE refrescar la tasa, no fallar.
 * Misma semántica que la RPC upsert_manual_exchange_rate_with_audit
 * (DO UPDATE SET rate, captured_at) — idempotente y actualizable.
 */
async function upsertToSupabase(
  supabaseUrl: string,
  serviceKey: string,
  payload: {
    rate_date: string;
    captured_at: string;
    currency: string;
    source: string;
    segment: string;
    rate: number;
    capture_method?: CaptureMethod;
    /** Hora en que el PROVEEDOR actualizó la cotización (Diviza). Opcional. */
    source_updated_at?: string | null;
  },
): Promise<boolean> {
  const body: Record<string, unknown> = {
    capture_method: 'estimated',
    ...payload,
  };
  // source_updated_at solo viaja cuando existe (columna nullable; filas sin
  // sello del proveedor quedan NULL — nunca se fabrica la hora).
  if (body.source_updated_at == null) delete body.source_updated_at;

  const res = await fetch(
    `${supabaseUrl}/rest/v1/exchange_rates?on_conflict=rate_date,currency,source,segment`,
    {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(body),
    },
  );
  return res.ok;
}

/**
 * Fetch BCC /activas (tasas del día actual).
 */
async function fetchBCCActivas(): Promise<BCCRate[] | null> {
  const res = await fetch(`${BCC_API_BASE}/activas`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.tasas || null;
}

/**
 * Fetch BCC /historico para una moneda en un rango de fechas.
 *
 * FIX IC-DIVIZA-002 (2026-10-26): el endpoint /historico devuelve un ARRAY
 * PURO de entradas {fecha, tasaOficial, tasaPublica, tasaEspecial} — SIN la
 * envoltura {tasas:[...]} de /activas y SIN codigoMoneda (la moneda va en el
 * query param). El parser anterior hacía `data.tasas || null` → SIEMPRE
 * null → «No BCC data for <fecha>» para cada fecha pasada: el backfill
 * histórico oficial fallaba en silencio (la BD solo tenía filas «de hoy»).
 * Ahora se aceptan AMBAS formas y se inyecta codigoMoneda desde el
 * parámetro consultado para que el consumidor no tenga que distinguir.
 *
 * Semántica de rango verificada en vivo: fechaInicio y fechaFin son ambos
 * INCLUSIVOS — para capturar UN día se pasa fechaFin = mismo día (antes se
 * pasaba día+1 y se arrastraba la fila del día siguiente en cada consulta).
 */
async function fetchBCCHistorico(
  startDate: string,
  endDate: string,
  currency: string,
): Promise<BCCRate[] | null> {
  const res = await fetch(
    `${BCC_API_BASE}/historico?fechaInicio=${startDate}&fechaFin=${endDate}&codigoMoneda=${currency}`,
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!res.ok) return null;
  const data = await res.json();
  const rows: unknown = Array.isArray(data) ? data : data?.tasas;
  if (!Array.isArray(rows)) return null;
  // codigoMoneda no viene en las filas históricas — se inyecta desde el
  // parámetro de la consulta (la moneda pedida es la de cada fila).
  return rows.map((r: Record<string, unknown>) => ({
    ...r,
    codigoMoneda: currency,
  })) as BCCRate[];
}

/**
 * CAPTURA INFORMAL DE HOY — lógica única compartida por cron, refresh y
 * scrape-diviza (misión 2026-10-26: "el cron y la captura manual utilizan el
 * mismo adaptador y reglas").
 *
 * - Fuente: Diviza (cubadivisas.com) — JSON conv-data del HTML público.
 * - Persiste `source='Diviza'`, `capture_method='real'`, `segment='3'`.
 * - rate_date = FECHA OPERATIVA (civil de Cuba, America/Havana) — no la
 *   fecha UTC (misión §3: una captura de las 20:30 de Cuba del 25 NO se
 *   fecha el 26).
 * - Solo monedas publicadas y validadas por Diviza (EUR/MLC null → no se
 *   guardan; JAMÁS se fabrican).
 * - source_updated_at: sello del proveedor («Actualizado el …»), persistido
 *   para que la tarjeta pueda mostrar la hora de Diviza convertida a Cuba.
 * - Si Diviza falla (red, HTTP, parseo, mantenimiento): NO persiste nada y
 *   devuelve errors descriptivos — el carry-forward lo resuelve la capa de
 *   consulta con el último valor real.
 * - Solo aplica a la fecha operativa de HOY: Diviza no publica serie histórica.
 */
export async function captureInformalToday(
  supabaseUrl: string,
  serviceKey: string,
): Promise<{
  captured: CaptureResult[];
  errors: string[];
  provider: 'Diviza' | null;
  sourceUpdatedAt: string | null;
}> {
  const captured: CaptureResult[] = [];
  const errors: string[] = [];
  const today = getOperativeDate();
  const now = new Date().toISOString();

  const { fetchDivizaRates } = await import('./diviza-scraper');
  // Defensa en profundidad: el adaptador no debe lanzar, pero si lo hace
  // (bug inesperado), la captura falla limpio — el cron y la ruta manual
  // reciben el estado de error, nunca una excepción sin manejar.
  let rates: Awaited<ReturnType<typeof fetchDivizaRates>> = null;
  try {
    rates = await fetchDivizaRates();
  } catch (e: any) {
    console.warn(`[exchange-capture] Diviza lanzó excepción inesperada: ${e?.message ?? e}`);
  }

  if (!rates) {
    errors.push('Diviza: no se pudo obtener una cotización válida (red, HTTP o parseo)');
    console.warn(
      `[exchange-capture] Diviza falló para ${today} — NO se guarda nada. ` +
        'Carry-forward desde el último valor real.',
    );
    return { captured, errors, provider: null, sourceUpdatedAt: null };
  }

  const rows: Array<{ currency: string; rate: number }> = [
    { currency: 'USD', rate: rates.usd },
  ];
  if (rates.eur !== null) rows.push({ currency: 'EUR', rate: rates.eur });
  if (rates.mlc !== null) rows.push({ currency: 'MLC', rate: rates.mlc });

  for (const row of rows) {
    const ok = await upsertToSupabase(supabaseUrl, serviceKey, {
      rate_date: today,
      captured_at: now,
      currency: row.currency,
      source: 'Diviza',
      segment: '3',
      rate: row.rate,
      capture_method: 'real',
      // Sello del proveedor (hora de Diviza), NO la hora de CostPro.
      source_updated_at: rates.sourceUpdatedAt ?? null,
    });
    if (ok) {
      captured.push({
        date: today,
        currency: row.currency,
        source: 'Diviza',
        segment: '3',
        rate: row.rate,
        capture_method: 'real',
      });
    } else {
      errors.push(`Diviza upsert failed: ${row.currency} ${today}`);
    }
  }

  console.info(
    `[exchange-capture] Diviza REAL capturado para ${today}: ` +
      `USD=${rates.usd} EUR=${rates.eur ?? '—'} MLC=${rates.mlc ?? '—'} ` +
      `(fuente actualizada: ${rates.sourceUpdatedAt ?? '—'})`,
  );

  return { captured, errors, provider: 'Diviza', sourceUpdatedAt: rates.sourceUpdatedAt };
}

/**
 * Captura tasas para una fecha específica usando BCC API + Diviza (informal).
 * - Para la fecha operativa vigente (civil de Cuba): BCC /activas + captura
 *   informal de Diviza.
 * - Para fechas pasadas: BCC /historico del MISMO día (fechaFin = fecha,
 *   ambos extremos inclusivos) en paralelo USD+EUR. El informal de fechas
 *   pasadas NO se persiste (Diviza solo publica la tasa vigente; el
 *   histórico informal se importa por Excel).
 *
 * El estado de cada fuente se reporta INDEPENDIENTE (misión §4): un BCC
 * correcto no puede ocultar un fallo de Diviza y viceversa.
 */
export async function captureForDate(
  targetDate: string,
  supabaseUrl: string,
  serviceKey: string,
): Promise<CaptureForDateResult> {
  const captured: CaptureResult[] = [];
  const errors: string[] = [];
  const now = new Date().toISOString();

  const operativeToday = getOperativeDate();
  let bccRates: BCCRate[] | null = null;

  const bcc: SourceCaptureStatus = newSourceStatus(true);
  const diviza: SourceCaptureStatus = newSourceStatus();
  let divizaSourceUpdatedAt: string | null = null;

  try {
    if (targetDate === operativeToday) {
      bccRates = await fetchBCCActivas();
    } else {
      // Backfill: rango de UN solo día (fechaFin inclusivo = mismo día),
      // paralelo USD + EUR. NO se consulta día+1 (antes arrastraba la fila
      // del día siguiente en cada fecha del rango).
      const [usdRes, eurRes] = await Promise.allSettled([
        fetchBCCHistorico(targetDate, targetDate, 'USD'),
        fetchBCCHistorico(targetDate, targetDate, 'EUR'),
      ]);

      const usdRates = usdRes.status === 'fulfilled' ? usdRes.value : null;
      const eurRates = eurRes.status === 'fulfilled' ? eurRes.value : null;

      if (usdRates && eurRates) {
        bccRates = [...usdRates, ...eurRates];
      } else if (usdRates) {
        bccRates = usdRates;
      } else if (eurRates) {
        bccRates = eurRates;
      }

      if (usdRes.status === 'rejected') {
        bcc.errors.push(`BCC histórico USD ${targetDate}: ${usdRes.reason?.message || 'rejected'}`);
      }
      if (eurRes.status === 'rejected') {
        bcc.errors.push(`BCC histórico EUR ${targetDate}: ${eurRes.reason?.message || 'rejected'}`);
      }
    }

    if (!bccRates || bccRates.length === 0) {
      bcc.errors.push(`No BCC data for ${targetDate}`);
    } else {
      // 1. BCC: 3 segmentos por moneda (siempre captura 'real' — API pública).
      for (const tasa of bccRates) {
        if (!CURRENCIES.includes(tasa.codigoMoneda as typeof CURRENCIES[number])) continue;

        for (const seg of BCC_SEGMENTS) {
          const rate = tasa[seg.field] as number | undefined;
          if (rate && rate > 0) {
            const ok = await upsertToSupabase(supabaseUrl, serviceKey, {
              rate_date: targetDate,
              captured_at: now,
              currency: tasa.codigoMoneda,
              source: 'BCC',
              segment: seg.segment,
              rate: Math.round(rate * 100) / 100,
              capture_method: 'real',
            });
            if (ok) {
              bcc.rows++;
              captured.push({
                date: targetDate,
                currency: tasa.codigoMoneda,
                source: 'BCC',
                segment: seg.segment,
                rate,
                capture_method: 'real',
              });
            } else {
              bcc.errors.push(`BCC upsert failed: ${tasa.codigoMoneda} seg${seg.segment} ${targetDate}`);
            }
          }
        }
      }
      if (bcc.rows === 0) {
        bcc.errors.push(`BCC ${targetDate}: 0 filas válidas (monedas/segmentos sin tasa)`);
      }
    }

    // 2. Informal de HOY desde Diviza (única fuente informal activa).
    //    Para fechas pasadas NO se persiste informal (Diviza no tiene serie
    //    histórica) — el Excel bulk-upload cubre el histórico.
    if (targetDate === operativeToday) {
      diviza.attempted = true;
      const informal = await captureInformalToday(supabaseUrl, serviceKey);
      captured.push(...informal.captured);
      diviza.rows = informal.captured.length;
      diviza.errors.push(...informal.errors);
      divizaSourceUpdatedAt = informal.sourceUpdatedAt;
    }
  } catch (e: any) {
    errors.push(`captureForDate ${targetDate} error: ${e.message}`);
  }

  // Estado por fuente: ok = intentado, filas capturadas y sin errores.
  bcc.ok = bcc.attempted && bcc.rows > 0 && bcc.errors.length === 0;
  diviza.ok = diviza.attempted && diviza.rows > 0 && diviza.errors.length === 0;

  // Errores agregados planos (compatibilidad con el contrato anterior).
  errors.push(...bcc.errors, ...diviza.errors);

  return { captured, errors, bcc, diviza, divizaSourceUpdatedAt };
}

/**
 * Captura múltiples fechas (backfill).
 * Procesa fechas en paralelo con concurrencia limitada para respetar timeout.
 *
 * IC-DIVIZA-002: el intervalo se genera desde la FECHA OPERATIVA (civil de
 * Cuba) — no desde la fecha UTC. La última fecha del rango SIEMPRE es la
 * operativa, y es la única donde se intenta Diviza (captura informal de la
 * tasa vigente, misión §4: el botón «Actualizar BD (7 días)» asegura una
 * captura de Diviza para la fecha operativa actual — sin doble captura).
 *
 * El resultado agrega el estado POR FUENTE: bcc (todo el rango) y diviza
 * (la captura de la fecha operativa), para que el endpoint y la UI distingan
 * éxito completo de éxito parcial sin inferencias sobre textos de error.
 */
export async function captureDateRange(
  days: number,
  supabaseUrl: string,
  serviceKey: string,
  concurrency: number = 3,
): Promise<CaptureDateRangeResult> {
  const allCaptured: CaptureResult[] = [];
  const allErrors: string[] = [];
  const datesProcessed: string[] = [];

  // Intervalo operativo: de la más vieja a la más nueva, terminando en la
  // fecha operativa vigente (civil de Cuba).
  const operativeDate = getOperativeDate();
  const dates: string[] = buildOperativeDateRange(days);

  // Estado agregado por fuente.
  const bcc: SourceCaptureStatus = newSourceStatus(true);
  const diviza: SourceCaptureStatus = newSourceStatus();
  let divizaSourceUpdatedAt: string | null = null;

  // Procesar en lotes de `concurrency` fechas paralelas
  for (let i = 0; i < dates.length; i += concurrency) {
    const batch = dates.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map(date => captureForDate(date, supabaseUrl, serviceKey)),
    );
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      const date = batch[j];
      datesProcessed.push(date);
      if (r.status === 'fulfilled') {
        allCaptured.push(...r.value.captured);
        allErrors.push(...r.value.errors);
        // Agregación BCC (todo el rango)
        bcc.rows += r.value.bcc.rows;
        bcc.errors.push(...r.value.bcc.errors);
        // Estado Diviza del RANGO = el de la FECHA OPERATIVA (última del
        // intervalo); las fechas pasadas no lo intentan (attempted=false).
        if (date === operativeDate) {
          diviza.attempted = r.value.diviza.attempted;
          diviza.rows = r.value.diviza.rows;
          diviza.errors.push(...r.value.diviza.errors);
          divizaSourceUpdatedAt = r.value.divizaSourceUpdatedAt;
        }
      } else {
        const reason = r.reason?.message || 'unknown';
        allErrors.push(`captureForDate ${date} rejected: ${reason}`);
        bcc.errors.push(`captureForDate ${date} rejected: ${reason}`);
        if (date === operativeDate) {
          diviza.attempted = true;
          diviza.errors.push(`captureForDate ${date} rejected: ${reason}`);
        }
      }
    }
  }

  bcc.ok = bcc.rows > 0 && bcc.errors.length === 0;
  diviza.ok = diviza.attempted && diviza.rows > 0 && diviza.errors.length === 0;

  return {
    captured: allCaptured,
    errors: allErrors,
    datesProcessed,
    operativeDate,
    bcc,
    diviza,
    divizaSourceUpdatedAt,
  };
}
