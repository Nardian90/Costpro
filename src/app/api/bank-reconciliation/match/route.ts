/** POST /api/bank-reconciliation/match — matching automático de items */
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { canManageStore } from '@/lib/roles';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const matchSchema = z.object({ statement_id: z.string().min(1) });

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  if (!validateOrigin(req)) return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
  const { allowed } = await rateLimit(`bank-match:${session.user.id}`, { windowMs: 60_000, maxRequests: 5 });
  if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

  const body = await req.json();
  const parsed = matchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ...createApiError('INVALID_DATA'), details: parsed.error.format() }, { status: 400 });

  const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
  const supabase = getSupabaseAdminSafe();
  if (!supabase) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });

  // Get store_id to verify access
  const { data: stmt } = await supabase.from('bank_statements').select('store_id').eq('id', parsed.data.statement_id).single();
  if (!stmt) return NextResponse.json({ error: 'Statement not found' }, { status: 404 });
  if (!canManageStore(session.user, stmt.store_id)) return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });

  const { data, error } = await supabase.rpc('auto_match_bank_items', {
    p_statement_id: parsed.data.statement_id, p_user_id: session.user.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logger.info('DATABASE', 'BANK_MATCH_DONE', { stmtId: parsed.data.statement_id, result: data });
  return NextResponse.json(data);
}

export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/bank-reconciliation/match');
