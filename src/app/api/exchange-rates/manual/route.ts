import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { validateOrigin } from '@/lib/csrf';

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

/* ────────────────────────────────────────────────────────────────────────
 * DECISION-FX-01 (FIX F3-P1-01, auditoría multitienda):
 * La tasa de cambio es un dato GLOBAL que alimenta la conversión contable de
 * todas las tiendas. Definición de autoridad aprobada para este fix:
 *   SOLO rol global 'admin' puede introducir/ajustar manualmente la tasa.
 * Cualquier otro rol (incl. manager/clerk) recibe 403. Si el dueño del
 * negocio quiere delegar en 'manager', debe ratificarlo expresamente y se
 * ampliará este check con membership + canManageStore — NO por mero rol.
 *
 * Se añade además:
 *   - validateOrigin (CSRF) — alineado con memberships/bulk y stores/bulk.
 *   - Persistencia de auditoría en exchange_rate_audit (quién cambió qué,
 *     cuándo y desde qué origen), migración 20260827000006.
 * ──────────────────────────────────────────────────────────────────────── */

async function postHandler(req: NextRequest, _session: AuthenticatedSession) {
  try {
    // FIX F3-P1-01: CSRF por validación de origen
    if (!validateOrigin(req)) {
      return NextResponse.json(
        { error: 'INVALID_ORIGIN' },
        { status: 403 }
      );
    }

    // FIX F3-P1-01 / DECISION-FX-01: solo admin global muta tasas globales
    if (_session.user.role !== 'admin') {
      logger.warn('AUTH', 'EXCHANGE_RATE_MANUAL_DENIED_BY_ROLE', {
        actorId: _session.user.id,
        actorRole: _session.user.role,
      });
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Solo un administrador puede modificar la tasa de cambio' },
        { status: 403 }
      );
    }

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

    // FIX F3-P1-01: auditoría persistente del cambio de tasa (best-effort;
    // si falla NO invalida la mutación ya aplicada pero queda registrada como
    // CRÍTICA en logs para revisión).
    try {
      await admin.from('exchange_rate_audit').insert({
        actor_id: _session.user.id,
        action: 'manual_upsert',
        currency,
        new_rate: rate,
        rate_date: today,
        source_ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      });
    } catch (auditErr: unknown) {
      logger.error('AUDIT', 'EXCHANGE_RATE_AUDIT_WRITE_FAILED', {
        error: auditErr instanceof Error ? auditErr.message : String(auditErr),
        currency, rate, rate_date: today, actor: _session.user.id,
      });
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
