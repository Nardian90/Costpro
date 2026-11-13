/**
 * API CP-FIN — Acciones sobre versiones de reglas.
 * POST /api/fin/config/rule-action  { rule_version_id, action: 'activate' | 'deactivate' }
 * La validación estructural y el cambio de estado los hace el motor
 * (fin_activate_rule_version / fin_deactivate_rule_version) con gate de rol.
 */
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { withSecurity } from '@/lib/with-security';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { z } from 'zod';

const actionSchema = z.object({
  rule_version_id: z.string().uuid(),
  action: z.enum(['activate', 'deactivate']),
});

async function postHandler(request: NextRequest, session: AuthenticatedSession) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validación fallida', details: parsed.error.flatten() }, { status: 400 });
  }
  const admin = getSupabaseAdminSafe();
  if (!admin) {
    return NextResponse.json({ error: 'Servicio no disponible' }, { status: 503 });
  }

  const rpcName = parsed.data.action === 'activate' ? 'fin_activate_rule_version' : 'fin_deactivate_rule_version';
  const { data, error } = await admin.rpc(rpcName, {
    p_rule_version_id: parsed.data.rule_version_id,
    p_user_id: session.user.id,
  });

  if (error) {
    const msg = error.message || '';
    const status = msg.includes('ERR_UNAUTHORIZED') ? 403 : msg.includes('ERR_RULE_INVALID') ? 422 : 500;
    return NextResponse.json({ error: msg, rpc_error: msg }, { status });
  }
  return NextResponse.json(data);
}

export const POST = withAuth(withSecurity(postHandler, {
  rateLimitKey: 'fin-rule-action:post',
  maxRequests: 20,
}));
