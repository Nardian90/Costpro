/**
 * API Nóminas SC-4-06 — detalle y edición de borrador.
 *
 * GET  /api/payrolls/[id]
 *      Encabezado + líneas + conceptos (RLS del usuario autenticado).
 *
 * PUT  /api/payrolls/[id]
 *      Edita una nómina en BORRADOR vía RPC update_payroll (re-calcula
 *      totales servidor y re-snapshot identidad/tarifa por línea).
 *
 * TRUST BOUNDARY: user_id del JWT (nunca del body); totales siempre del
 * servidor; los items solo llevan identificadores y cantidades.
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const conceptSchema = z.object({
  kind: z.enum(['complemento', 'otro_haber', 'obligacion_social', 'deduccion']),
  sigla: z.string().trim().min(1).max(12),
  description: z.string().trim().max(200).optional(),
  amount: z.number().min(0),
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

const updatePayrollSchema = z.object({
  tipo_nomina: z.enum(['sueldos', 'jornales', 'vacaciones', 'licencias', 'subsidios', 'movilizados', 'otros']),
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payment_method: z.enum(['efectivo', 'tarjeta']).optional(),
  cheque_number: z.string().trim().max(50).nullable().optional(),
  cheque_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  reintegro_number: z.string().trim().max(50).nullable().optional(),
  reintegro_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  items: z.array(itemSchema).min(1),
});

function extractPayrollId(req: NextRequest): string | null {
  const match = req.nextUrl?.pathname?.match(/\/api\/payrolls\/([^/]+)$/);
  const id = match?.[1];
  return id && UUID_RE.test(id) ? id : null;
}

// =====================================================================
// GET — detalle con líneas y conceptos (RLS del usuario autenticado)
// =====================================================================
async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const payrollId = extractPayrollId(req);
  if (!payrollId) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  const supabase = getSupabaseForSession(session);

  const { data: payroll, error } = await supabase
    .from('payrolls')
    .select('*')
    .eq('id', payrollId)
    .single();

  if (error || !payroll) {
    return NextResponse.json({ error: 'Nómina no encontrada' }, { status: 404 });
  }

  const { data: items, error: itemsErr } = await supabase
    .from('payroll_items')
    .select('*')
    .eq('payroll_id', payrollId)
    .order('worker_names', { ascending: true });

  if (itemsErr) {
    return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  }

  // Conceptos por línea (un solo barrido — RLS filtra por tienda).
  const itemIds = (items ?? []).map((i: { id: string }) => i.id);
  const { data: concepts } = itemIds.length
    ? await supabase
      .from('payroll_item_concepts')
      .select('*')
      .in('item_id', itemIds)
      .order('sigla', { ascending: true })
    : { data: [] };

  const conceptsByItem = new Map<string, unknown[]>();
  for (const c of concepts ?? []) {
    const arr = conceptsByItem.get(c.item_id) ?? [];
    arr.push(c);
    conceptsByItem.set(c.item_id, arr);
  }

  return NextResponse.json({
    payroll: {
      ...payroll,
      items: (items ?? []).map((i: { id: string }) => ({
        ...i,
        concepts: conceptsByItem.get(i.id) ?? [],
      })),
    },
  });
}

// =====================================================================
// PUT — edición de borrador (RPC update_payroll, service_role + JWT)
// =====================================================================
async function putHandler(request: NextRequest, session: AuthenticatedSession) {
  const payrollId = extractPayrollId(request);
  if (!payrollId) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = updatePayrollSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validación fallida', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const b = parsed.data;

  if (b.period_start > b.period_end) {
    return NextResponse.json(
      { error: 'Período inválido: la fecha inicial no puede ser posterior a la final', rpc_error: 'ERR_INVALID_PERIOD' },
      { status: 422 },
    );
  }

  const admin = getSupabaseAdminSafe();
  if (!admin) {
    return NextResponse.json({ error: 'Servicio no disponible' }, { status: 503 });
  }

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

  const { data: result, error: rpcErr } = await admin.rpc('update_payroll', {
    p_payroll_id: payrollId,
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
    p_user_id: session.user.id, // ← TRUST BOUNDARY: del JWT, no del body
  });

  if (rpcErr) {
    const msg = rpcErr.message || '';
    return NextResponse.json(
      { error: mapPayrollRpcErrorToUserMessage(msg), rpc_error: msg },
      { status: mapPayrollRpcErrorToHttpStatus(msg) },
    );
  }

  return NextResponse.json(result);
}

export const GET = withAuth(getHandler);
export const PUT = withAuth(withSecurity(putHandler, {
  rateLimitKey: 'payrolls:put',
  maxRequests: 10,
}));
