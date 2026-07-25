/**
 * GET /api/customers?store_id=X&search=term&limit=20&page=1
 * POST /api/customers — crear cliente
 * PATCH /api/customers — actualizar cliente
 */
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
  name: z.string().min(1),
  ci: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  notes: z.string().optional(),
});

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const url = new URL(req.url);
  const storeId = url.searchParams.get('store_id');
  if (!storeId) return NextResponse.json(createApiError('BAD_REQUEST'), { status: 400 });
  if (!canManageStore(session.user, storeId)) return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });

  const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
  const supabase = getSupabaseAdminSafe();
  if (!supabase) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });

  const page = Number(url.searchParams.get('page') || 1);
  const limit = Math.min(Number(url.searchParams.get('limit') || 20), 100);
  const search = url.searchParams.get('search');
  const from = (page - 1) * limit;

  let query = supabase.from('customers').select('*', { count: 'exact' })
    .eq('store_id', storeId).eq('is_active', true)
    .order('name', { ascending: true }).range(from, from + limit - 1);

  if (search) {
    query = query.or(`name.ilike.%${search}%,ci.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, pagination: { page, limit, total: count ?? 0 } });
}

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  if (!validateOrigin(req)) return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
  const { allowed } = await rateLimit(`customers:${session.user.id}`, { windowMs: 60_000, maxRequests: 20 });
  if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ...createApiError('INVALID_DATA'), details: parsed.error.format() }, { status: 400 });
  if (!canManageStore(session.user, parsed.data.store_id)) return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });

  const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
  const supabase = getSupabaseAdminSafe();
  if (!supabase) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });

  const { data, error } = await supabase.from('customers').insert({
    ...parsed.data,
    created_by: session.user.id,
  }).select('*').single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  logger.info('DATABASE', 'CUSTOMER_CREATED', { storeId: parsed.data.store_id, userId: session.user.id });
  return NextResponse.json(data);
}

export const GET = withTracing(withAuth(getHandler) as any, 'GET /api/customers');
export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/customers');
