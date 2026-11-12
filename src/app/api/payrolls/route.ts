/**
 * API Nóminas de Salario SC-4-06 (Res. 13/2007 MFP) — lista y confección.
 *
 * GET  /api/payrolls?store_id=...&status=...&tipo=...&from=...&to=...
 *      Lista encabezados de la tienda activa (RLS del usuario autenticado:
 *      payrolls_store_isolation filtra por current_user_store_ids()).
 *
 * POST /api/payrolls
 *      Confecciona una nómina (estado borrador) vía RPC create_payroll.
 *
 * TRUST BOUNDARY (misma arquitectura que /api/vale-salida):
 *   - store_id  → derivado de profiles.active_store_id (DB lookup con JWT)
 *   - user_id    → derivado de session.user.id (JWT), NUNCA del body
 *   - totales    → calculados SIEMPRE por el servidor (única fuente de
 *                  verdad); el cliente solo envía identificadores y
 *                  cantidades por línea (worker_id, horas/días, importes de
 *                  extras/vacaciones y conceptos con sigla).
 *   - identidad/tarifa/entidad → SNAPSHOT resuelto servidor por línea.
 *
 * El body SOLO puede enviar:
 *   - tipo_nomina, period_start, period_end (obligatorios)
 *   - payment_method, cheque_number, cheque_date,
 *     reintegro_number, reintegro_date, notes (opcionales)
 *   - items[] (worker_id + cantidades + concepts[])
 *   - idempotency_key (obligatoria, ≥8 chars)
 *
 * Cualquier intento de enviar store_id, user_id o totales es ignorado.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { withSecurity } from '@/lib/with-security';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { getSupabaseForSession } from '@/lib/supabase-session';
import { z } from 'zod';
import { uuidLoose } from '@/validation/api-schemas';
import {
  mapPayrollRpcErrorToHttpStatus,
  mapPayrollRpcErrorToUserMessage,
} from '@/lib/payrolls/errors';

// =====================================================================
// Schemas de validación — SOLO campos del body que el cliente puede enviar
// =====================================================================
const conceptSchema = z.object({
  kind: z.enum(['complemento', 'otro_haber', 'obligacion_social', 'deduccion']),
  sigla: z.string().trim().min(1, { message: 'sigla requerida' }).max(12),
  description: z.string().trim().max(200).optional(),
  amount: z.number().min(0, { message: 'amount no negativo' }),
});

const itemSchema = z.object({
  worker_id: uuidLoose,
  regular_hours: z.number().min(0).optional(),
  accrued_days: z.number().min(0).optional(),
  overtime_hours: z.number().min(0).optional(),
  overtime_amount: z.number().min(0).optional(),
  vacation_days: z.number().min(0).optional(),
  vacation_amount: z.number().min(0).optional(),
  concepts: z.array(conceptSchema).optional(),
});

const createPayrollSchema = z.object({
  tipo_nomina: z.enum(['sueldos', 'jornales', 'vacaciones', 'licencias', 'subsidios', 'movilizados', 'otros']),
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'period_start YYYY-MM-DD' }),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'period_end YYYY-MM-DD' }),
  payment_method: z.enum(['efectivo', 'tarjeta']).optional(),
  cheque_number: z.string().trim().max(50).nullable().optional(),
  cheque_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  reintegro_number: z.string().trim().max(50).nullable().optional(),
  reintegro_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  items: z.array(itemSchema).min(1, { message: 'items no puede estar vacío' }),
  idempotency_key: z.string().min(8, { message: 'idempotency_key requerida (mín 8 chars)' }).max(200),
});

// =====================================================================
// GET — lista de nóminas (RLS del usuario autenticado)
// =====================================================================
async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('store_id');
  const status = searchParams.get('status');
  const tipo = searchParams.get('tipo');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  if (!storeId) {
    return NextResponse.json({ error: 'store_id es requerido' }, { status: 400 });
  }

  // RLS: cliente de sesión — payrolls_store_isolation filtra por tienda.
  const supabase = getSupabaseForSession(session);
  let query = supabase
    .from('payrolls')
    .select(
      'id, store_id, payroll_number, status, tipo_nomina, period_start, period_end, currency, '
      + 'entidad_nombre, payment_method, total_workers, total_gross, total_deductions, total_net, '
      + 'total_vacation_days, total_vacation_amount, reviewed_at, accounted_at, paid_at, voided_at, '
      + 'void_reason, notes, created_at, updated_at',
    )
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (status) query = query.eq('status', status);
  if (tipo) query = query.eq('tipo_nomina', tipo);
  if (from) query = query.gte('period_end', from);
  if (to) query = query.lte('period_start', to);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ payrolls: data || [], count: data?.length || 0 });
}

// =====================================================================
// POST — confección (RPC create_payroll, service_role + p_user_id JWT)
// =====================================================================
async function postHandler(request: NextRequest, session: AuthenticatedSession) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = createPayrollSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validación fallida', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const b = parsed.data;

  // Validación temprana del período (paridad con el servidor — el RPC
  // revalida dentro de la transacción).
  if (b.period_start > b.period_end) {
    return NextResponse.json(
      { error: 'Período inválido: la fecha inicial no puede ser posterior a la final', rpc_error: 'ERR_INVALID_PERIOD' },
      { status: 422 },
    );
  }

  // store_id derivado del perfil del usuario (NUNCA del body)
  const admin = getSupabaseAdminSafe();
  if (!admin) {
    return NextResponse.json({ error: 'Servicio no disponible' }, { status: 503 });
  }
  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('active_store_id')
    .eq('id', session.user.id)
    .single();
  if (profileErr || !profile?.active_store_id) {
    return NextResponse.json({ error: 'Usuario sin tienda activa configurada' }, { status: 400 });
  }
  const store_id = profile.active_store_id;

  // items: solo identificadores y cantidades (sin importes calculados).
  const items = b.items.map((it) => ({
    worker_id: it.worker_id,
    regular_hours: it.regular_hours ?? 0,
    accrued_days: it.accrued_days ?? 0,
    overtime_hours: it.overtime_hours ?? 0,
    overtime_amount: it.overtime_amount ?? 0,
    vacation_days: it.vacation_days ?? 0,
    vacation_amount: it.vacation_amount ?? 0,
    concepts: (it.concepts ?? []).map((c) => ({
      kind: c.kind,
      sigla: c.sigla,
      description: c.description ?? '',
      amount: c.amount,
    })),
  }));

  const { data: result, error: rpcErr } = await admin.rpc('create_payroll', {
    p_store_id: store_id,
    p_tipo_nomina: b.tipo_nomina,
    p_period_start: b.period_start,
    p_period_end: b.period_end,
    p_payment_method: b.payment_method ?? 'efectivo',
    p_cheque_number: b.cheque_number ?? null,
    p_cheque_date: b.cheque_date ?? null,
    p_reintegro_number: b.reintegro_number ?? null,
    p_reintegro_date: b.reintegro_date ?? null,
    p_notes: b.notes ?? null,
    p_items: items,
    p_idempotency_key: b.idempotency_key,
    p_user_id: session.user.id, // ← TRUST BOUNDARY: del JWT, no del body
  });

  if (rpcErr) {
    const msg = rpcErr.message || '';
    return NextResponse.json(
      {
        error: mapPayrollRpcErrorToUserMessage(msg),
        rpc_error: msg,
      },
      { status: mapPayrollRpcErrorToHttpStatus(msg) },
    );
  }

  return NextResponse.json(result, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(withSecurity(postHandler, {
  rateLimitKey: 'payrolls:post',
  maxRequests: 10, // 10/min por usuario
}));
