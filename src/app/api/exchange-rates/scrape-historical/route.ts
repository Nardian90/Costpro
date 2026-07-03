import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { logger } from '@/lib/logger';
import { fetchHistoricalRates, type HistoricalRateEntry } from '@/lib/soluciones-cuba-scraper';

/**
 * POST /api/exchange-rates/scrape-historical
 *
 * Scrapea el histórico completo de tasas desde solucionescuba.com/bolsa-divisas.php
 * y hace upsert masivo a exchange_rates.
 *
 * La página contiene un JSON embebido con ~380 entradas (dic 2025 → hoy),
 * cada una con timestamp Unix + tasas de USD/EUR/MLC y otras monedas.
 *
 * Para cada entrada:
 *   - Upsert a exchange_rates con source='elToque', segment='3', currency='USD'/'EUR'/'MLC'
 *   - capture_method='real'
 *   - rate_date = fecha derivada del timestamp
 *
 * Requiere auth + rol admin (defense in depth: la UI también verifica).
 *
 * Body opcional:
 *   { "dryRun": true } — solo devuelve lo que se scrapeó sin hacer upsert
 *                        (útil para verificar antes de cargar)
 */
async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  // Verificar rol admin
  if (session.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Forbidden', message: 'Solo admin puede cargar histórico masivo' },
      { status: 403 }
    );
  }

  let dryRun = false;
  try {
    const body = await req.json().catch(() => ({}));
    dryRun = !!body?.dryRun;
  } catch {
    // body vacío es válido
  }

  logger.info('DATABASE', 'EXCHANGE_RATES_HISTORICAL_START', {
    user: session.user.id,
    dryRun,
  });

  // 1. Scrapear histórico
  const entries = await fetchHistoricalRates();
  if (entries.length === 0) {
    return NextResponse.json(
      { error: 'No se pudo scrapear el histórico', success: false },
      { status: 502 }
    );
  }

  // Si es dry run, devolver sin hacer upsert
  if (dryRun) {
    return NextResponse.json({
      success: true,
      dryRun: true,
      count: entries.length,
      firstDate: entries[0]?.date,
      lastDate: entries[entries.length - 1]?.date,
      sample: entries.slice(0, 5).concat(entries.slice(-3)),
    });
  }

  // 2. Upsert masivo
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: 'CONFIG_ERROR' }, { status: 500 });
  }
  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const now = new Date().toISOString();
  let processed = 0;
  let errors: string[] = [];
  let captureMethodMissing = false;

  // Construir todos los rows a insertar (3 por entrada: USD, EUR, MLC)
  const rows: Array<{
    rate_date: string;
    captured_at: string;
    currency: string;
    source: string;
    segment: string;
    rate: number;
    capture_method: string;
  }> = [];

  for (const entry of entries) {
    // USD siempre
    rows.push({
      rate_date: entry.date,
      captured_at: now,
      currency: 'USD',
      source: 'elToque',
      segment: '3',
      rate: entry.usd,
      capture_method: 'real',
    });
    // EUR si > 0
    if (entry.eur > 0) {
      rows.push({
        rate_date: entry.date,
        captured_at: now,
        currency: 'EUR',
        source: 'elToque',
        segment: '3',
        rate: entry.eur,
        capture_method: 'real',
      });
    }
    // MLC si > 0
    if (entry.mlc > 0) {
      rows.push({
        rate_date: entry.date,
        captured_at: now,
        currency: 'MLC',
        source: 'elToque',
        segment: '3',
        rate: entry.mlc,
        capture_method: 'real',
      });
    }
  }

  // Upsert en lotes de 100 (Supabase recomienda max 1000 por query, usamos 100 por seguridad)
  const BATCH_SIZE = 100;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    try {
      const { error } = await admin
        .from('exchange_rates')
        .upsert(batch, { onConflict: 'rate_date,source,currency,segment' });

      if (error) {
        if (/capture_method/.test(error.message)) {
          // Columna no existe — reintentar sin capture_method
          captureMethodMissing = true;
          const batchWithoutMethod = batch.map(({ capture_method, ...rest }) => {
            void capture_method;
            return rest;
          });
          const retry = await admin
            .from('exchange_rates')
            .upsert(batchWithoutMethod, { onConflict: 'rate_date,source,currency,segment' });
          if (retry.error) {
            errors.push(`Lote ${i / BATCH_SIZE + 1}: ${retry.error.message}`);
          } else {
            processed += batch.length;
          }
        } else {
          errors.push(`Lote ${i / BATCH_SIZE + 1}: ${error.message}`);
        }
      } else {
        processed += batch.length;
      }
    } catch (err: any) {
      errors.push(`Lote ${i / BATCH_SIZE + 1}: ${err.message}`);
    }
  }

  logger.info('DATABASE', 'EXCHANGE_RATES_HISTORICAL_DONE', {
    total: rows.length,
    processed,
    errors: errors.length,
    captureMethodMissing,
    user: session.user.id,
  });

  return NextResponse.json({
    success: true,
    totalEntries: entries.length,
    totalRows: rows.length,
    processed,
    errors: errors.slice(0, 20), // limitar errores en response
    captureMethodMissing,
    firstDate: entries[0]?.date,
    lastDate: entries[entries.length - 1]?.date,
    message: `${processed} filas procesadas (${entries.length} días × 3 monedas)`,
  });
}

export const POST = withAuth(postHandler);
