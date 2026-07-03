/**
 * exchange-capture.ts — Lógica compartida de captura de tasas BCC + elToque.
 *
 * Antes había 2 implementaciones paralelas:
 *   1. /api/cron/exchange-rates/route.ts (cron job)
 *   2. /api/exchange-rates/route.ts POST (manual admin)
 *
 * Ahora ambas importan esta lib. Single source of truth.
 *
 * Mejoras vs versión anterior:
 *   - Promise.allSettled para paralelizar USD + EUR en backfill (C4 fix)
 *   - Constantes extraídas (no más magic numbers)
 *   - Validación de shape BCC explícita
 *   - Sin duplicación de fetch /activas (era llamada 2 veces)
 *
 * RED FLAG F-01b (2026-07-03):
 *   - Antes: las tasas source='elToque' SIEMPRE se calculaban como
 *     `BCC_seg3 × 1.15` (estimación), sin distinguirlas en BD.
 *   - Ahora: se intenta primero scraping real de eltoque.com vía
 *     `fetchElToqueRatesReal()` (ver `./eltoque-scraper.ts`). Si funciona,
 *     se persisten con `capture_method='real'`. Si falla (Cloudflare,
 *     timeout, parse error), se cae al cálculo `BCC × 1.15` con
 *     `capture_method='estimated'`.
 *   - Las filas source='BCC' siempre se marcan `capture_method='real'`
 *     (la API del BCC es pública y se captura directamente).
 *   - Migración: `20260703000004_exchange_rates_capture_method.sql`.
 */

import { fetchElToqueRatesReal } from './eltoque-scraper';

// Constantes (antes magic numbers esparcidos)
export const BCC_API_BASE = 'https://api.bc.gob.cu/v1/tasas-de-cambio';
export const CURRENCIES = ['USD', 'EUR'] as const;
export const DEFAULT_USD_ESPECIAL = 574;
export const DEFAULT_EUR_ESPECIAL = 653;
export const EL_TOQUE_SPREAD = 1.15; // El informal suele estar ~15% por encima del segmento 3

/**
 * Método de captura — RED FLAG F-01b.
 * - 'real': scraping de eltoque.com exitoso, o API directa del BCC.
 * - 'estimated': fallback BCC_seg3 × 1.15 (cuando el scraping falla).
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
  source: 'BCC' | 'elToque';
  segment: string;
  rate: number;
  /**
   * Método de captura (F-01b): 'real' (scraping eltoque.com / API BCC)
   * o 'estimated' (BCC×1.15 fallback).
   */
  capture_method: CaptureMethod;
}

export interface CaptureForDateResult {
  captured: CaptureResult[];
  errors: string[];
}

/**
 * Hace upsert a Supabase vía REST (no necesita client JS).
 * Usa Prefer: resolution=ignore-duplicates para idempotencia.
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
    /** F-01b: siempre se envía. Default 'estimated' si se omite. */
    capture_method?: CaptureMethod;
  },
): Promise<boolean> {
  const res = await fetch(`${supabaseUrl}/rest/v1/exchange_rates`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates',
    },
    body: JSON.stringify({
      capture_method: 'estimated',
      ...payload,
    }),
  });
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
 * Captura tasas para una fecha específica usando BCC API.
 * - Para "hoy": usa /activas
 * - Para fechas pasadas: usa /historico con rango de 1 día (paralelo USD+EUR)
 *
 * FIX C4: usa Promise.allSettled para paralelizar USD+EUR en backfill,
 * reduciendo tiempo por fecha de ~2.2s a ~1.2s.
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
      return { captured, errors };
    }

    // 1. BCC: 3 segmentos por moneda
    // F-01b: BCC siempre es captura 'real' (API pública, fetch directo).
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

    // 2. elToque: PRIMERO intentar scraping real (F-01b).
    //    Si `fetchElToqueRatesReal()` devuelve tasas, se persisten con
    //    capture_method='real'. Si retorna null (Cloudflare, timeout,
    //    parse error), se cae al cálculo BCC×1.15 con capture_method='estimated'.
    let elToqueRates: Array<{ currency: string; rate: number; capture_method: CaptureMethod }>;
    let elToqueCaptureMethod: CaptureMethod;

    const realRates = await fetchElToqueRatesReal();

    if (realRates) {
      // Scraping exitoso — usar tasas reales de eltoque.com
      elToqueCaptureMethod = 'real';
      elToqueRates = [
        { currency: 'USD', rate: Math.round(realRates.usd * 100) / 100, capture_method: 'real' },
        { currency: 'EUR', rate: Math.round(realRates.eur * 100) / 100, capture_method: 'real' },
        { currency: 'MLC', rate: Math.round(realRates.mlc * 100) / 100, capture_method: 'real' },
      ];
      console.info(
        `[exchange-capture] elToque REAL capturado (${realRates.strategy}) ` +
          `para ${targetDate}: USD=${realRates.usd} EUR=${realRates.eur} MLC=${realRates.mlc}`,
      );
    } else {
      // Fallback: estimar desde BCC segmento 3 + spread (BCC × 1.15)
      elToqueCaptureMethod = 'estimated';
      const usdEspecial =
        bccRates.find(t => t.codigoMoneda === 'USD')?.tasaEspecial ?? DEFAULT_USD_ESPECIAL;
      const eurEspecial =
        bccRates.find(t => t.codigoMoneda === 'EUR')?.tasaEspecial ?? DEFAULT_EUR_ESPECIAL;

      elToqueRates = [
        {
          currency: 'USD',
          rate: Math.round(usdEspecial * EL_TOQUE_SPREAD * 100) / 100,
          capture_method: 'estimated',
        },
        {
          currency: 'EUR',
          rate: Math.round(eurEspecial * EL_TOQUE_SPREAD * 100) / 100,
          capture_method: 'estimated',
        },
        {
          currency: 'MLC',
          rate: Math.round(usdEspecial * EL_TOQUE_SPREAD * 100) / 100,
          capture_method: 'estimated',
        },
      ];
      console.warn(
        `[exchange-capture] elToque scraping falló para ${targetDate} — ` +
          `usando estimación BCC×1.15 (capture_method=estimated)`,
      );
    }

    for (const r of elToqueRates) {
      const ok = await upsertToSupabase(supabaseUrl, serviceKey, {
        rate_date: targetDate,
        captured_at: now,
        currency: r.currency,
        source: 'elToque',
        segment: '3',
        rate: r.rate,
        capture_method: elToqueCaptureMethod,
      });
      if (ok) {
        captured.push({
          date: targetDate,
          currency: r.currency,
          source: 'elToque',
          segment: '3',
          rate: r.rate,
          capture_method: elToqueCaptureMethod,
        });
      } else {
        errors.push(`elToque upsert failed: ${r.currency} ${targetDate}`);
      }
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
