import { NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { fetchSolucionesCubaRates } from '@/lib/soluciones-cuba-scraper';
import { logger } from '@/lib/logger';

/**
 * POST /api/exchange-rates/scrape-soluciones
 *
 * Dispara el scraping de solucionescuba.com para obtener la tasa informal
 * REAL de Cuba (USD, EUR, MLC). El sitio publica las tasas como texto en
 * HTML estático — no bloquea con Cloudflare como hace eltoque.com.
 *
 * La tasas capturadas se persisten con:
 *   - source: 'elToque'  (para mostrarlas en la tarjeta "Informal estimada")
 *   - capture_method: 'real'  (no 'estimated' como el fallback BCC×1.15)
 *   - rate_date: hoy (YYYY-MM-DD)
 *   - segment: '3'  (MIPYMES, mismo segmento que usa el cron)
 *
 * Si la columna `capture_method` no existe aún (migración
 * 20260703000004 pendiente), reintenta el upsert sin esa columna (mismo
 * patrón que /api/exchange-rates/manual).
 *
 * Auth: cualquier usuario autenticado puede invocarlo (withAuth).
 *
 * Respuesta:
 *   200: { success, captured, rates, message }
 *   502: { error: 'No se pudo capturar...' } (scraping falló)
 *   500: { error: 'CONFIG_ERROR' | message } (Supabase mal configurado)
 */

export const maxDuration = 30; // suficiente para 1 fetch + 3 upserts

async function postHandler(_req: Request, session: AuthenticatedSession) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    logger.error('DATABASE', 'EXCHANGE_RATES_SCRAPE_CONFIG_MISSING', {});
    return NextResponse.json({ error: 'CONFIG_ERROR' }, { status: 500 });
  }

  // 1. Disparar el scraping
  const rates = await fetchSolucionesCubaRates();

  if (!rates) {
    logger.warn('DATABASE', 'EXCHANGE_RATES_SCRAPE_FAILED', {
      source: 'solucionescuba.com',
      triggered_by: session.user.id,
    });
    return NextResponse.json(
      {
        error: 'No se pudo capturar la tasa desde solucionescuba.com',
        hint: 'Verifica la conectividad de red o intenta cargar la tasa por Excel.',
      },
      { status: 502 },
    );
  }

  // 2. Upsert a exchange_rates: 3 filas (USD, EUR, MLC) con source='elToque'
  const today = new Date().toISOString().split('T')[0];
  const now = rates.capturedAt;

  const rows = [
    { currency: 'USD', rate: rates.usd },
    { currency: 'EUR', rate: rates.eur },
    { currency: 'MLC', rate: rates.mlc },
  ].filter(r => r.rate > 0); // Omitir EUR/MLC si el scraper no los encontró

  if (rows.length === 0) {
    logger.error('DATABASE', 'EXCHANGE_RATES_SCRAPE_NO_RATES', {
      rates,
      triggered_by: session.user.id,
    });
    return NextResponse.json(
      { error: 'Scraping exitoso pero sin tasas válidas para guardar' },
      { status: 500 },
    );
  }

  // Construir payload con capture_method='real'
  const buildPayload = (currency: string, rate: number) => ({
    rate_date: today,
    captured_at: now,
    currency,
    source: 'elToque',
    segment: '3',
    rate,
    capture_method: 'real' as const,
  });

  let { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const saved: Array<{ currency: string; rate: number }> = [];
  const errors: string[] = [];

  for (const row of rows) {
    const payload = buildPayload(row.currency, row.rate);

    let { data, error } = await admin
      .from('exchange_rates')
      .upsert(payload, { onConflict: 'rate_date,source,currency,segment' })
      .select()
      .single();

    // Si el error es por columna capture_method inexistente, reintentar sin ella
    if (error && /capture_method/.test(error.message)) {
      logger.warn('DATABASE', 'EXCHANGE_RATES_CAPTURE_METHOD_MISSING', {
        error: error.message,
        hint: 'Aplica la migración 20260703000004_exchange_rates_capture_method.sql en Supabase Dashboard',
      });
      const { capture_method, ...payloadWithoutMethod } = payload;
      void capture_method;
      const retry = await admin
        .from('exchange_rates')
        .upsert(payloadWithoutMethod, {
          onConflict: 'rate_date,source,currency,segment',
        })
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      errors.push(`${row.currency}: ${error.message}`);
    } else {
      saved.push({ currency: row.currency, rate: row.rate });
    }
  }

  if (saved.length === 0) {
    logger.error('DATABASE', 'EXCHANGE_RATES_SCRAPE_UPSERT_ALL_FAILED', {
      errors,
      triggered_by: session.user.id,
    });
    return NextResponse.json(
      { error: 'Todos los upserts fallaron', details: errors },
      { status: 500 },
    );
  }

  logger.info('DATABASE', 'EXCHANGE_RATES_SCRAPE_SAVED', {
    saved: saved.length,
    errors: errors.length,
    rates,
    triggered_by: session.user.id,
  });

  return NextResponse.json({
    success: true,
    captured: saved.length,
    rates: {
      usd: rates.usd,
      eur: rates.eur,
      mlc: rates.mlc,
      capturedAt: rates.capturedAt,
      sourceUrl: rates.sourceUrl,
    },
    errors: errors.length > 0 ? errors : undefined,
    message: `Tasa USD=${rates.usd} CUP capturada como REAL desde solucionescuba.com (${saved.length} monedas guardadas)`,
  });
}

export const POST = withAuth(postHandler);
