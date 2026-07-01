import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { canManageStore } from '@/lib/roles';
import { supabase } from '@/lib/supabaseClient';
import { z } from 'zod';
import { getRiskState } from '@/lib/whatsapp/anti-ban';
import { registerStore } from '@/lib/whatsapp/invitation-queue';

const addSchema = z.object({
  store_id: z.string().uuid(),
  phone_number: z.string().min(5),
  name: z.string().optional(),
  contact_id: z.string().uuid().optional(),
});

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const { allowed } = await rateLimit(`wa:inv:${session.user.id}`, { windowMs: 60_000, maxRequests: 30 });
  if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

  const url = new URL(req.url);
  const storeId = url.searchParams.get('store_id');
  const status = url.searchParams.get('status');

  if (!storeId) return NextResponse.json(createApiError('INVALID_DATA'), { status: 400 });
  if (!canManageStore(session.user, storeId)) {
    return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
  }

  let query = supabase
    .from('whatsapp_invitations')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return NextResponse.json(createApiError('UNKNOWN_ERROR'), { status: 500 });

  // Incluir risk state
  const risk = await getRiskState(storeId);

  return NextResponse.json({ data: data || [], risk });
}

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  const { allowed } = await rateLimit(`wa:inv:add:${session.user.id}`, { windowMs: 60_000, maxRequests: 10 });
  if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

  const body = await req.json();

  // Soportar array o单个
  const items = Array.isArray(body) ? body : [body];
  const validated = z.array(addSchema).safeParse(items);
  if (!validated.success) {
    return NextResponse.json({ ...createApiError('INVALID_DATA'), details: validated.error.format() }, { status: 400 });
  }

  const storeId = validated.data[0].store_id;
  if (!canManageStore(session.user, storeId)) {
    return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
  }

  const { data, error } = await supabase
    .from('whatsapp_invitations')
    .insert(validated.data.map(d => ({ ...d, status: 'pending' })))
    .select();

  if (error) return NextResponse.json(createApiError('UNKNOWN_ERROR'), { status: 500 });

  // Activar worker para esta tienda
  registerStore(storeId);

  return NextResponse.json({ data });
}

async function deleteHandler(req: NextRequest, session: AuthenticatedSession) {
  const url = new URL(req.url);
  const invitationId = url.searchParams.get('id');
  const storeId = url.searchParams.get('store_id');

  if (!invitationId || !storeId) return NextResponse.json(createApiError('INVALID_DATA'), { status: 400 });
  if (!canManageStore(session.user, storeId)) {
    return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
  }

  const { error } = await supabase
    .from('whatsapp_invitations')
    .delete()
    .eq('id', invitationId)
    .eq('store_id', storeId);

  if (error) return NextResponse.json(createApiError('UNKNOWN_ERROR'), { status: 500 });

  return NextResponse.json({ success: true });
}

export const GET = withTracing(withAuth(getHandler) as any, 'GET /api/whatsapp/invitations');
export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/whatsapp/invitations');
export const DELETE = withTracing(withAuth(deleteHandler) as any, 'DELETE /api/whatsapp/invitations');
