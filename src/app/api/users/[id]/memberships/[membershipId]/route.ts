/**
 * PATCH /api/users/[id]/memberships/[membershipId] — Update a single membership
 * DELETE /api/users/[id]/memberships/[membershipId] — Revoke a membership
 *
 * Iteración 12: Endpoints para gestión individual de memberships.
 * Iteración v2.21.7: Fix folder typo (embershipId] → [membershipId]).
 *
 * The frontend calls /api/users/_/memberships/${membershipId} where _ is a
 * placeholder for user_id (not needed for PATCH/DELETE — membershipId is enough).
 */
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { z } from 'zod';

const updateMembershipSchema = z.object({
  role: z.enum(['admin', 'manager', 'encargado', 'clerk', 'warehouse', 'usuario', 'costo']).optional(),
  status: z.enum(['active', 'inactive', 'revoked']).optional(),
});

async function patchHandler(
  req: NextRequest,
  session: AuthenticatedSession,
  context: { params: Promise<{ id: string; membershipId: string }> }
) {
  if (!validateOrigin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { allowed } = await rateLimit(`membership-update:${session.user.id}`, {
    windowMs: 60_000,
    maxRequests: 20,
  });
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const params = await context.params;
  const membershipId = params.membershipId;

  if (!membershipId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(membershipId)) {
    return NextResponse.json({ error: 'Invalid membershipId' }, { status: 400 });
  }

  const body = await req.json();
  const parsed = updateMembershipSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data', details: parsed.error.format() }, { status: 400 });
  }

  const admin = getSupabaseAdminSafe();
  if (!admin) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  const { data, error } = await admin.rpc('managed_update_membership', {
    p_membership_id: membershipId,
    p_role: parsed.data.role ?? null,
    p_status: parsed.data.status ?? null,
    p_caller_id: session.user.id,
  });

  if (error) {
    const msg = error.message || '';
    if (msg.includes('ERR_UNAUTHORIZED')) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    if (msg.includes('ERR_NOT_FOUND')) return NextResponse.json({ error: 'Membresía no encontrada' }, { status: 404 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ success: true, ...(data as object || {}) });
}

async function deleteHandler(
  req: NextRequest,
  session: AuthenticatedSession,
  context: { params: Promise<{ id: string; membershipId: string }> }
) {
  if (!validateOrigin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { allowed } = await rateLimit(`membership-revoke:${session.user.id}`, {
    windowMs: 60_000,
    maxRequests: 10,
  });
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const params = await context.params;
  const membershipId = params.membershipId;

  if (!membershipId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(membershipId)) {
    return NextResponse.json({ error: 'Invalid membershipId' }, { status: 400 });
  }

  const admin = getSupabaseAdminSafe();
  if (!admin) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  const { data, error } = await admin.rpc('managed_revoke_membership', {
    p_membership_id: membershipId,
    p_caller_id: session.user.id,
  });

  if (error) {
    const msg = error.message || '';
    if (msg.includes('ERR_UNAUTHORIZED')) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    if (msg.includes('ERR_NOT_FOUND')) return NextResponse.json({ error: 'Membresía no encontrada' }, { status: 404 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ success: true, ...(data as object || {}) });
}

export const PATCH = withTracing(
  withAuth(patchHandler as Parameters<typeof withAuth>[0]) as Parameters<typeof withTracing>[0],
  'PATCH /api/users/[id]/memberships/[membershipId]'
);

export const DELETE = withTracing(
  withAuth(deleteHandler as Parameters<typeof withAuth>[0]) as Parameters<typeof withTracing>[0],
  'DELETE /api/users/[id]/memberships/[membershipId]'
);
