/**
 * POST /api/payrolls/[id]/confirm
 *
 * Confirmación de una nómina SC-4-06 — RPC confirm_payroll.
 * SC-4-06 firma «revisa y aprueba»: draft → confirmed. Valida la consistencia totales↔líneas (ERR_INCONSISTENT_TOTALS) y fija reviewed_by/at.
 *
 * TRUST BOUNDARY: user_id del JWT (session.user.id), NUNCA del body.
 * El RPC revalida has_store_access_as contra la tienda del documento.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { withSecurity } from '@/lib/with-security';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import {
  mapPayrollRpcErrorToHttpStatus,
  mapPayrollRpcErrorToUserMessage,
} from '@/lib/payrolls/errors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function postHandler(request: NextRequest, session: AuthenticatedSession) {
  const match = request.nextUrl?.pathname?.match(/\/api\/payrolls\/([^/]+)\/confirm$/);
  const payrollId = match?.[1];
  if (!payrollId || !UUID_RE.test(payrollId)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  const admin = getSupabaseAdminSafe();
  if (!admin) {
    return NextResponse.json({ error: 'Servicio no disponible' }, { status: 503 });
  }

  const { data: result, error: rpcErr } = await admin.rpc('confirm_payroll', {
    p_payroll_id: payrollId,
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
  rateLimitKey: 'payrolls:confirm',
  maxRequests: 10,
}));
