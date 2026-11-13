/**
 * API CP-FIN — Operaciones de contabilización (solo admin de tienda).
 *
 * POST /api/fin/posting
 *   { action: 'reprocess', store_id }                    → reintenta errores registrados
 *   { action: 'backfill', store_id, from, to, dry_run }  → reconstrucción controlada
 *     de históricos (dry_run=true por defecto: solo cuenta, no contabiliza)
 */
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { withSecurity } from '@/lib/with-security';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { z } from 'zod';

const reprocessSchema = z.object({
  action: z.literal('reprocess'),
  store_id: z.string().uuid(),
});

const backfillSchema = z.object({
  action: z.literal('backfill'),
  store_id: z.string().uuid(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dry_run: z.boolean().default(true),
});

const bodySchema = z.union([reprocessSchema, backfillSchema]);

async function postHandler(request: NextRequest, session: AuthenticatedSession) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validación fallida', details: parsed.error.flatten() }, { status: 400 });
  }

  const admin = getSupabaseAdminSafe();
  if (!admin) {
    return NextResponse.json({ error: 'Servicio no disponible' }, { status: 503 });
  }

  if (parsed.data.action === 'reprocess') {
    const { data, error } = await admin.rpc('fin_reprocess_posting_errors', {
      p_store_id: parsed.data.store_id,
      p_user_id: session.user.id,
    });
    if (error) {
      const msg = error.message || '';
      return NextResponse.json({ error: msg, rpc_error: msg }, { status: msg.includes('ERR_UNAUTHORIZED') ? 403 : 500 });
    }
    return NextResponse.json(data);
  }

  // backfill
  if (parsed.data.from > parsed.data.to) {
    return NextResponse.json({ error: 'Período inválido: from > to' }, { status: 400 });
  }
  const { data, error } = await admin.rpc('fin_backfill', {
    p_store_id: parsed.data.store_id,
    p_from: parsed.data.from,
    p_to: parsed.data.to,
    p_dry_run: parsed.data.dry_run,
    p_user_id: session.user.id,
  });
  if (error) {
    const msg = error.message || '';
    return NextResponse.json({ error: msg, rpc_error: msg }, { status: msg.includes('ERR_UNAUTHORIZED') ? 403 : 500 });
  }
  return NextResponse.json(data);
}

export const POST = withAuth(withSecurity(postHandler, {
  rateLimitKey: 'fin-posting:post',
  maxRequests: 6,
}));
