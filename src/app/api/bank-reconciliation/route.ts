/** GET /api/bank-reconciliation?store_id=X
 *  POST /api/bank-reconciliation — crear statement + items
 *  POST /api/bank-reconciliation/match — conciliar item con transacción */
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { canManageStore } from '@/lib/roles';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const createSchema = z.object({
  store_id: z.string().min(1),
  statement_date: z.string(),
  bank_account: z.string().optional(),
  opening_balance: z.number().default(0),
  closing_balance: z.number(),
  total_credits: z.number().default(0),
  total_debits: z.number().default(0),
  items: z.array(z.object({
    transaction_date: z.string(),
    description: z.string().optional(),
    reference: z.string().optional(),
    amount: z.number(),
    type: z.enum(['credit', 'debit']),
  })).default([]),
});

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const url = new URL(req.url);
  const storeId = url.searchParams.get('store_id');
  if (!storeId) return NextResponse.json(createApiError('BAD_REQUEST'), { status: 400 });
  if (!canManageStore(session.user, storeId)) return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });

  const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
  const supabase = getSupabaseAdminSafe();
  if (!supabase) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });

  const { data, error } = await supabase
    .from('bank_statements').select('*, items:bank_statement_items(*)').eq('store_id', storeId)
    .order('statement_date', { ascending: false }).limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  if (!validateOrigin(req)) return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
  const { allowed } = await rateLimit(`bank-recon:${session.user.id}`, { windowMs: 60_000, maxRequests: 5 });
  if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ...createApiError('INVALID_DATA'), details: parsed.error.format() }, { status: 400 });
  if (!canManageStore(session.user, parsed.data.store_id)) return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });

  const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
  const supabase = getSupabaseAdminSafe();
  if (!supabase) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });

  // Create statement
  const { items, ...stmtData } = parsed.data;
  const { data: stmt, error: stmtErr } = await supabase.from('bank_statements').insert({
    ...stmtData, status: 'pending',
  }).select('id').single();
  if (stmtErr) return NextResponse.json({ error: stmtErr.message }, { status: 500 });

  // Create items
  if (items.length > 0) {
    const itemsData = items.map(i => ({ ...i, bank_statement_id: stmt.id }));
    const { error: itemsErr } = await supabase.from('bank_statement_items').insert(itemsData);
    if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  }

  logger.info('DATABASE', 'BANK_STMT_CREATED', { storeId: parsed.data.store_id, stmtId: stmt.id, itemsCount: items.length });
  return NextResponse.json({ id: stmt.id, message: `Statement created with ${items.length} items` });
}

export const GET = withTracing(withAuth(getHandler) as any, 'GET /api/bank-reconciliation');
export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/bank-reconciliation');
