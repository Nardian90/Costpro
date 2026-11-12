/**
 * API Tarifa salarial del trabajador (Nóminas SC-4-06).
 *
 * GET  /api/workers/[id]/salary-rate?store_id=...
 *      Historial de tarifas (vigencias) del trabajador (RLS del usuario
 *      autenticado: worker_salary_rates_store_isolation).
 *
 * POST /api/workers/[id]/salary-rate
 *      Fija una nueva tarifa vía RPC set_worker_salary_rate — cierra la
 *      vigencia anterior (historial íntegro SIN solapes, ERR_RATE_OVERLAP)
 *      y NO altera nóminas históricas (la nómina SNAPSHOT la tarifa vigente
 *      al período).
 *
 * TRUST BOUNDARY: user_id del JWT (session.user.id), NUNCA del body.
 * La tarifa NO es una comisión: vive aparte del motor de commission_rules.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { withSecurity } from '@/lib/with-security';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { getSupabaseForSession } from '@/lib/supabase-session';
import { z } from 'zod';
import {
  mapPayrollRpcErrorToHttpStatus,
  mapPayrollRpcErrorToUserMessage,
} from '@/lib/payrolls/errors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const setRateSchema = z.object({
  rate_type: z.enum(['hourly', 'daily']),
  rate_amount: z.number().positive({ message: 'rate_amount debe ser > 0' }),
  currency: z.enum(['CUP', 'USD', 'EUR', 'MLC']).optional(),
  /** NULL → CURRENT_DATE (vigencia desde hoy). */
  valid_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

function extractWorkerId(req: NextRequest): string | null {
  const match = req.nextUrl?.pathname?.match(/\/api\/workers\/([^/]+)\/salary-rate$/);
  const id = match?.[1];
  return id && UUID_RE.test(id) ? id : null;
}

// =====================================================================
// GET — historial de tarifas (RLS del usuario autenticado)
// =====================================================================
async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const workerId = extractWorkerId(req);
  if (!workerId) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  const supabase = getSupabaseForSession(session);
  const { data, error } = await supabase
    .from('worker_salary_rates')
    .select('*')
    .eq('worker_id', workerId)
    .order('valid_from', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rates: data || [] });
}

// =====================================================================
// POST — nueva tarifa (RPC set_worker_salary_rate, service_role + JWT)
// =====================================================================
async function postHandler(request: NextRequest, session: AuthenticatedSession) {
  const workerId = extractWorkerId(request);
  if (!workerId) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = setRateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validación fallida', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const b = parsed.data;

  const admin = getSupabaseAdminSafe();
  if (!admin) {
    return NextResponse.json({ error: 'Servicio no disponible' }, { status: 503 });
  }

  const { data: result, error: rpcErr } = await admin.rpc('set_worker_salary_rate', {
    p_worker_id: workerId,
    p_rate_type: b.rate_type,
    p_rate_amount: b.rate_amount,
    p_currency: b.currency ?? 'CUP',
    p_valid_from: b.valid_from ?? null,
    p_user_id: session.user.id, // ← TRUST BOUNDARY: del JWT, no del body
  });

  if (rpcErr) {
    const msg = rpcErr.message || '';
    return NextResponse.json(
      { error: mapPayrollRpcErrorToUserMessage(msg), rpc_error: msg },
      { status: mapPayrollRpcErrorToHttpStatus(msg) },
    );
  }

  return NextResponse.json(result, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(withSecurity(postHandler, {
  rateLimitKey: 'workers:salary-rate',
  maxRequests: 10,
}));
