/**
 * API CP-FIN — Simulador de configuración (NO escribe datos contables).
 * POST /api/fin/config/simulate
 *   { doctype, document_id? , metrics_manual?, movements_override? }
 * Ejecuta fin_simulate con las plantillas de borrador (override) o la regla
 * activa, contra un documento real o métricas manuales controladas.
 */
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { withSecurity } from '@/lib/with-security';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { z } from 'zod';

const simulateSchema = z.object({
  doctype: z.string().min(2).max(30),
  document_id: z.string().uuid().nullable().optional(),
  metrics_manual: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).nullable().optional(),
  movements_override: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
});

async function postHandler(request: NextRequest, session: AuthenticatedSession) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const parsed = simulateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validación fallida', details: parsed.error.flatten() }, { status: 400 });
  }
  const b = parsed.data;
  if (!b.document_id && !b.metrics_manual) {
    return NextResponse.json(
      { error: 'Indique un documento real o métricas manuales para simular' },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdminSafe();
  if (!admin) {
    return NextResponse.json({ error: 'Servicio no disponible' }, { status: 503 });
  }

  const { data, error } = await admin.rpc('fin_simulate', {
    p_doctype: b.doctype,
    p_document_id: b.document_id ?? null,
    p_metrics_manual: b.metrics_manual ?? null,
    p_movements_override: b.movements_override ?? null,
    p_user_id: session.user.id,
  });

  if (error) {
    const msg = error.message || '';
    return NextResponse.json(
      { error: msg.includes('ERR_UNAUTHORIZED') ? 'Sin permisos sobre esa tienda' : msg, rpc_error: msg },
      { status: msg.includes('ERR_UNAUTHORIZED') ? 403 : 500 },
    );
  }
  return NextResponse.json(data);
}

export const POST = withAuth(withSecurity(postHandler, {
  rateLimitKey: 'fin-simulate:post',
  maxRequests: 60,
}));
