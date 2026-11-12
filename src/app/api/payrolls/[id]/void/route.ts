/**
 * POST /api/payrolls/[id]/void
 *
 * Anulación de una nómina SC-4-06 — RPC void_payroll.
 * Solo draft|confirmed; motivo OBLIGATORIO (3-500 chars). El documento
 * anulado se CONSERVA (numeración + motivo + trazabilidad — jamás borrado
 * físico). Las nóminas PAGADAS no son anulables (ERR_NOT_VOIDABLE).
 *
 * TRUST BOUNDARY: user_id del JWT (session.user.id), NUNCA del body.
 * El RPC revalida has_store_access_as contra la tienda del documento.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { withSecurity } from '@/lib/with-security';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { z } from 'zod';
import {
  mapPayrollRpcErrorToHttpStatus,
  mapPayrollRpcErrorToUserMessage,
} from '@/lib/payrolls/errors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const voidSchema = z.object({
  reason: z.string().trim().min(3, { message: 'reason requerido (mín 3 chars)' }).max(500),
});

async function postHandler(request: NextRequest, session: AuthenticatedSession) {
  const match = request.nextUrl?.pathname?.match(/\/api\/payrolls\/([^/]+)\/void$/);
  const payrollId = match?.[1];
  if (!payrollId || !UUID_RE.test(payrollId)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = voidSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validación fallida', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { reason } = parsed.data;

  const admin = getSupabaseAdminSafe();
  if (!admin) {
    return NextResponse.json({ error: 'Servicio no disponible' }, { status: 503 });
  }

  const { data: result, error: rpcErr } = await admin.rpc('void_payroll', {
    p_payroll_id: payrollId,
    p_reason: reason,
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

export const POST = withAuth(withSecurity(postHandler, {
  rateLimitKey: 'payrolls:void',
  maxRequests: 10,
}));
