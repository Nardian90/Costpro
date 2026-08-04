import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { rateLimit } from '@/lib/rate-limit';
import { validateOrigin } from '@/lib/csrf';
import { withTracing } from '@/lib/observability';
import { getSupabaseAdminSafe as getSupabaseAdmin } from '@/lib/supabase-admin';
import { z } from 'zod';

const updateMembershipSchema = z.object({
  role: z.enum(['admin', 'superadmin', 'manager', 'clerk', 'warehouse', 'encargado', 'usuario', 'costo']).optional(),
  status: z.enum(['active', 'revoked']).optional(),
});

async function patchHandler(
  req: NextRequest,
  session: AuthenticatedSession,
  context: { params: Promise<{ id: string; membershipId: string }> }
) {
  if (!validateOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { allowed } = await rateLimit(session.user.id, { windowMs: 60_000, maxRequests: 30 });
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  const { membershipId } = await context.params;

  if (!membershipId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(membershipId)) {
    return NextResponse.json({ error: 'Invalid membership_id' }, { status: 400 });
  }

  const body = await req.json();
  const parsed = updateMembershipSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data', details: parsed.error.format() }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.rpc('managed_update_membership', {
    p_membership_id: membershipId,
    p_role: parsed.data.role ?? null,
    p_status: parsed.data.status ?? null,
    p_caller_id: session.user.id,
  });

  if (error) {
    const msg = error.message || '';
    if (msg.includes('ERR_MEMBERSHIP_NOT_FOUND')) return NextResponse.json({ error: 'Membresía no encontrada' }, { status: 404 });
    if (msg.includes('ERR_UNAUTHORIZED')) return NextResponse.json({ error: 'No autorizado para esta tienda' }, { status: 403 });
    if (msg.includes('ERR_INVALID_STATUS')) return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ success: true, ...(data as object || {}) });
}

export const PATCH = withTracing(
  withAuth(patchHandler as Parameters<typeof withAuth>[0]) as Parameters<typeof withTracing>[0],
  'PATCH /api/users/[id]/memberships/[membershipId]'
);

async function deleteHandler(
  req: NextRequest,
  session: AuthenticatedSession,
  context: { params: Promise<{ id: string; membershipId: string }> }
) {
  if (!validateOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { allowed } = await rateLimit(session.user.id, { windowMs: 60_000, maxRequests: 30 });
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  const { membershipId } = await context.params;

  if (!membershipId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(membershipId)) {
    return NextResponse.json({ error: 'Invalid membership_id' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.rpc('managed_revoke_membership', {
    p_membership_id: membershipId,
    p_caller_id: session.user.id,
  });

  if (error) {
    const msg = error.message || '';
    if (msg.includes('ERR_MEMBERSHIP_NOT_FOUND')) return NextResponse.json({ error: 'Membresía no encontrada' }, { status: 404 });
    if (msg.includes('ERR_UNAUTHORIZED')) return NextResponse.json({ error: 'Solo administradores de la tienda pueden revocar membresías' }, { status: 403 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ success: true, ...(data as object || {}) });
}

export const DELETE = withTracing(
  withAuth(deleteHandler as Parameters<typeof withAuth>[0]) as Parameters<typeof withTracing>[0],
  'DELETE /api/users/[id]/memberships/[membershipId]'
);
