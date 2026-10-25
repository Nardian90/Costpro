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
 *   - IC-DIVIZA (2026-10-26): solucionescuba.com CAÍDO (el dominio sirve un
 *     panel de hosting; TLS mismatch; la última tasa informal guardada es del
 *     2026-07-28). Reemplazo: cubadivisas.com (Diviza) — HTML público estático
 *     con JSON "conv-data" (informal: USD/EUR/MLC + otras), metodología
 *     declarada (mediana del mercado, actualización cada 30 min con hora
 *     visible). El scraper de eltoque.com y el de solucionescuba.com se
 *     RETIRAN: nunca capturaron nada real (Cloudflare bloquea todo) y la
 *     fuente está muerta respectivamente. Sus filas históricas source='elToque'
 *     se conservan intactas en BD con su procedencia original.
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
 */

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

export interface CaptureForDateResult {
  captured: CaptureResult[];
  errors: string[];
}

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
 * rate/captured_at/capture_method). Diviza actualiza cada 30 min: una
 * recaptura del mismo día DEBE refrescar la tasa, no fallar. Misma semántica
 * que la RPC upsert_manual_exchange_rate_with_audit (DO UPDATE SET rate,
 * captured_at) — idempotente y actualizable.
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
  },
): Promise<boolean> {
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
      body: JSON.stringify({
        capture_method: 'estimated',
        ...payload,
      }),
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
  return data.tasas || null;
}

/**
 * CAPTURA INFORMAL DE HOY — lógica única compartida por cron, refresh y
 * scrape-diviza (misión 2026-10-26: "el cron y la captura manual utilizan el
 * mismo adaptador y reglas").
 *
 * - Fuente: Diviza (cubadivisas.com) — JSON conv-data del HTML público.
 * - Persiste `source='Diviza'`, `capture_method='real'`, `segment='3'`.
 * - Solo monedas publicadas y validadas por Diviza (EUR/MLC null → no se
 *   guardan; JAMÁS se fabrican).
 * - Si Diviza falla (red, HTTP, parseo, mantenimiento): NO persiste nada y
 *   devuelve errors descriptivos — el carry-forward lo resuelve la capa de
 *   consulta con el último valor real.
 * - Solo aplica a la fecha de HOY: Diviza no publica serie histórica.
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
  const today = new Date().toISOString().split('T')[0];
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
 * - Para "hoy": BCC /activas + captura informal de Diviza
 * - Para fechas pasadas: BCC /historico con rango de 1 día (paralelo USD+EUR).
 *   El informal de fechas pasadas NO se persite (Diviza solo publica la tasa
 *   vigente; el histórico informal se importa por Excel).
 *
 * FIX C4: Promise.allSettled para paralelizar USD+EUR en backfill.
 */
export async function captureForDate(
  targetDate: string,
  supabaseUrl: string,
  serviceKey: string,
): Promise<CaptureForDateResult> {
  const captured: CaptureResult[] = [];
  const errors: string[] = [];
  const now = new Date().toISOString();

  const today = new Date().toISOString().split('T')[0];
  let bccRates: BCCRate[] | null = null;

  try {
    if (targetDate === today) {
      bccRates = await fetchBCCActivas();
    } else {
      // Backfill: rango de 1 día, paralelo USD + EUR (C4 fix)
      const next = new Date(targetDate);
      next.setDate(next.getDate() + 1);
      const nextStr = next.toISOString().split('T')[0];

      const [usdRes, eurRes] = await Promise.allSettled([
        fetchBCCHistorico(targetDate, nextStr, 'USD'),
        fetchBCCHistorico(targetDate, nextStr, 'EUR'),
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
        errors.push(`BCC histórico USD ${targetDate}: ${usdRes.reason?.message || 'rejected'}`);
      }
      if (eurRes.status === 'rejected') {
        errors.push(`BCC histórico EUR ${targetDate}: ${eurRes.reason?.message || 'rejected'}`);
      }
    }

    if (!bccRates || bccRates.length === 0) {
      errors.push(`No BCC data for ${targetDate}`);
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
              captured.push({
                date: targetDate,
                currency: tasa.codigoMoneda,
                source: 'BCC',
                segment: seg.segment,
                rate,
                capture_method: 'real',
              });
            } else {
              errors.push(`BCC upsert failed: ${tasa.codigoMoneda} seg${seg.segment} ${targetDate}`);
            }
          }
        }
      }
    }

    // 2. Informal de HOY desde Diviza (única fuente informal activa).
    //    Para fechas pasadas NO se persiste informal (Diviza no tiene serie
    //    histórica) — el Excel bulk-upload cubre el histórico.
    if (targetDate === today) {
      const informal = await captureInformalToday(supabaseUrl, serviceKey);
      captured.push(...informal.captured);
      errors.push(...informal.errors);
    }
  } catch (e: any) {
    errors.push(`captureForDate ${targetDate} error: ${e.message}`);
  }

  return { captured, errors };
}

/**
 * Captura múltiples fechas (backfill).
 * Procesa fechas en paralelo con concurrencia limitada para respetar timeout.
 *
 * FIX C4: con concurrencia 3, days=7 toma ~5s en lugar de ~15s secuencial.
 */
export async function captureDateRange(
  days: number,
  supabaseUrl: string,
  serviceKey: string,
  concurrency: number = 3,
): Promise<{
  captured: CaptureResult[];
  errors: string[];
  datesProcessed: string[];
}> {
  const allCaptured: CaptureResult[] = [];
  const allErrors: string[] = [];
  const datesProcessed: string[] = [];

  // Generar lista de fechas (de la más vieja a la más nueva)
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }

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
      } else {
        allErrors.push(`captureForDate ${date} rejected: ${r.reason?.message || 'unknown'}`);
      }
    }
  }

  return { captured: allCaptured, errors: allErrors, datesProcessed };
}
