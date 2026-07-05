import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { z } from 'zod';
import { logger } from '@/lib/logger';

/**
 * POST /api/exchange-rates/manual
 *
 * Permite al usuario ingresar manualmente la tasa REAL de elToque (vista en
 * eltoque.com) cuando el scraping automático falla (Cloudflare bloquea).
 *
 * La tasa se persiste con:
 *   - source: 'elToque'
 *   - capture_method: 'real'  (no 'estimated' como el fallback BCC×1.15)
 *   - rate_date: hoy (o fecha especificada)
 *
 * Si ya existe un registro para esa fecha+source+currency, se hace upsert.
 *
 * Body:
 *   {
 *     "currency": "USD" | "EUR" | "MLC",
 *     "rate": number (>0, rango 1-10000),
 *     "rate_date"?: "YYYY-MM-DD" (default: hoy)
 *   }
 */

const manualSchema = z.object({
  currency: z.enum(['USD', 'EUR', 'MLC']),
  rate: z.number().positive().min(1).max(10000),
  rate_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

async function postHandler(req: NextRequest, _session: AuthenticatedSession) {
  try {
    const body = await req.json();
    const parsed = manualSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { currency, rate, rate_date } = parsed.data;
    const today = rate_date || new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: 'CONFIG_ERROR' }, { status: 500 });
    }
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

    // FIX: capturar si la columna capture_method no existe aún (migración pendiente).
    // En ese caso, hacer el upsert SIN capture_method (la fila se guardará con NULL
    // o con el default de la BD, y la UI la mostrará como 'estimated' por defecto).
    // Cuando el usuario aplique la migración 20260703000004, las nuevas filas
    // tendrán capture_method='real' correctamente.
    const payload: Record<string, unknown> = {
      rate_date: today,
      captured_at: now,
      currency,
      source: 'elToque',
      segment: '3',
      rate,
      capture_method: 'real',
    };

    let { data, error } = await admin
      .from('exchange_rates')
      .upsert(payload, { onConflict: 'rate_date,source,currency,segment' })
      .select()
      .single();

    // Si el error es por la columna capture_method inexistente, reintentar sin ella
    if (error && /capture_method/.test(error.message)) {
      logger.warn('DATABASE', 'EXCHANGE_RATES_CAPTURE_METHOD_MISSING', {
        error: error.message,
        hint: 'Aplica la migración 20260703000004_exchange_rates_capture_method.sql en Supabase Dashboard',
      });
      const { capture_method, ...payloadWithoutMethod } = payload;
      void capture_method;
      const retry = await admin
        .from('exchange_rates')
        .upsert(payloadWithoutMethod, { onConflict: 'rate_date,source,currency,segment' })
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      logger.error('DATABASE', 'EXCHANGE_RATES_MANUAL_UPSERT_ERROR', { error: error.message });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    logger.info('DATABASE', 'EXCHANGE_RATES_MANUAL_SAVED', {
      currency,
      rate,
      rate_date: today,
      capture_method: 'real',
      user: _session.user.id,
    });

    return NextResponse.json({
      success: true,
      data,
      message: `Tasa ${currency} = ${rate} CUP guardada como REAL para ${today}`,
    });
  } catch (error: unknown) {
    logger.error('DATABASE', 'EXCHANGE_RATES_MANUAL_FATAL', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export const POST = withAuth(postHandler);
