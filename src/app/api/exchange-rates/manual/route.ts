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
 * DECISION-FX-01 (FIX F3-P1-01) + DECISION-AUD-02 (enmienda H1/E3 del gate):
 * La tasa de cambio es un dato GLOBAL que alimenta la conversión contable de
 * todas las tiendas. Autoridad: SOLO rol global 'admin'. Cualquier otro rol
 * (incl. manager/clerk) recibe 403.
 *
 * Diseño definitivo (ratificado por el dueño — NO best-effort):
 *   La mutación NO se hace aquí con upsert directo + insert separado de
 *   auditoría. TODO pasa por la RPC SECURITY DEFINER
 *   upsert_manual_exchange_rate_with_audit(), que dentro de UNA transacción:
 *       revalida que p_actor_id sea admin (profiles.role en BD)
 *       → bloquea la fila anterior (FOR UPDATE)
 *       → upserea la nueva tasa
 *       → inserta la pista old_rate/new_rate/old_rate_date/source_ip/actor
 *   Cualquier fallo ⇒ ROLLBACK conjunto: es imposible (por construcción)
 *   cambiar la tasa sin pista o dejar pista sin cambio real.
 *
 * La tabla exchange_rate_audit tiene RLS FORCE y CERO políticas para clientes;
 * EXECUTE de la RPC existe solo para service_role ⇒ la pista no es legible ni
 * falsificable por usuarios autenticados vía REST.
 * ──────────────────────────────────────────────────────────────────────── */

async function postHandler(req: NextRequest, _session: AuthenticatedSession) {
  try {
    // F3-P1-01: CSRF por validación de origen
    if (!validateOrigin(req)) {
      return NextResponse.json(
        { error: 'INVALID_ORIGIN' },
        { status: 403 }
      );
    }

    // DECISION-FX-01: solo admin global muta tasas globales (gate rápido por JWT;
    // la RPC revalida contra BD como defensa en profundidad).
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

    // Identidad server-side tipada como uuid (la RPC exige uuid real; un id no
    // uuid nunca debería ocurrir tras withAuth, pero el fallo debe ser 403 y no
    // un error postgres crudo).
    if (!_session.user.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(_session.user.id)) {
      return NextResponse.json({ error: 'INVALID_IDENTITY' }, { status: 403 });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: 'CONFIG_ERROR' }, { status: 500 });
    }
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

    // FIX H1/E3: única escritura = RPC atómica (tasa + auditoría old/new juntos).
    const { data, error } = await admin.rpc('upsert_manual_exchange_rate_with_audit', {
      p_actor_id: _session.user.id,
      p_currency: currency,
      p_rate: rate,
      p_rate_date: today,
      p_source_ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    });

    if (error) {
      const msg = error.message || '';
      // Defensa en profundidad: la sesión afirmó admin pero la BD lo desmiente.
      if (msg.includes('ERR_FORBIDDEN_ACTOR_NOT_ADMIN')) {
        logger.warn('AUTH', 'EXCHANGE_RATE_MANUAL_DENIED_BY_DB_ACTOR_CHECK', {
          actorId: _session.user.id,
          error: msg,
        });
        return NextResponse.json(
          { error: 'FORBIDDEN', message: 'Solo un administrador puede modificar la tasa de cambio' },
          { status: 403 }
        );
      }
      logger.error('DATABASE', 'EXCHANGE_RATES_MANUAL_UPSERT_ERROR', { error: msg });
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const result = (data ?? {}) as Record<string, unknown>;

    logger.info('AUDIT', 'EXCHANGE_RATE_MANUAL_MUTATION_AUDITED', {
      currency,
      new_rate: rate,
      old_rate: result.old_rate ?? null,
      old_rate_date: result.old_rate_date ?? null,
      rate_date: today,
      actor: _session.user.id,
      audit_id: result.audit_id ?? null,
      source_ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    });

    return NextResponse.json({
      success: true,
      saved: {
        currency,
        rate,
        rate_date: today,
        capture_method: 'real',
        source: 'elToque',
      },
      audit: {
        audit_id: result.audit_id ?? null,
        old_rate: result.old_rate ?? null,
        old_rate_date: result.old_rate_date ?? null,
        new_rate: rate,
        actor_id: _session.user.id,
      },
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
