import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withRole, type AuthenticatedSession } from '@/lib/auth-middleware';
import { rateLimit } from '@/lib/rate-limit';
import { validateOrigin } from '@/lib/csrf';
import { withTracing } from '@/lib/observability';
import { getSupabaseAdminSafe as getSupabaseAdmin } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const updateUserSchema = z.object({
  full_name: z.string().min(1).max(200).optional(),
  role: z.enum(['admin', 'superadmin', 'manager', 'clerk', 'warehouse', 'encargado', 'usuario', 'costo']).optional(),
  role_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().optional(),
  max_stores_limit: z.number().int().min(0).max(1000).optional(),
  max_users_limit: z.number().int().min(0).max(10000).optional(),
  plan: z.enum(['free', 'pro', 'enterprise']).optional(),
  // FIX RLS-B4 (v2.21.0): añadir activeStoreId para que el switch de tienda
  // funcione vía API REST (antes solo funcionaba vía useStoreSwitcher hook).
  activeStoreId: z.string().uuid().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/users/[id] — Obtener perfil completo de un usuario
// Iteración v2.21.8: Nuevo endpoint GET para consistencia arquitectónica.
//
// Autorización:
// - admin: puede ver cualquier user de su tenant
// - encargado: puede ver users de stores donde tiene membership
// - cualquier user: puede ver su propio perfil
// ─────────────────────────────────────────────────────────────────────────────
async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const { allowed } = await rateLimit(`users:get:${session.user.id}`, {
    windowMs: 60_000,
    maxRequests: 60,
  });
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  const userId = pathParts[pathParts.length - 1];

  if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return NextResponse.json({ error: 'Invalid user_id' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  // Self-access allowed
  const isSelf = userId === session.user.id;
  const isAdmin = session.user.role === 'admin';

  if (!isSelf && !isAdmin) {
    // Check if encargado with membership in same store as target user
    const { data: targetProfile } = await admin
      .from('profiles')
      .select('tenant_id')
      .eq('id', userId)
      .single();

    const { data: callerProfile } = await admin
      .from('profiles')
      .select('tenant_id')
      .eq('id', session.user.id)
      .single();

    if (!targetProfile || !callerProfile) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    if (targetProfile.tenant_id !== callerProfile.tenant_id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }
  }

  // Fetch profile
  const { data: profile, error } = await admin
    .from('profiles')
    .select('id, full_name, email, role, role_id, active_store_id, logo_url, is_active, store_id, created_at, plan, tenant_id')
    .eq('id', userId)
    .is('deleted_at', null)
    .single();

  if (error || !profile) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
  }

  // Tenant isolation: admin can only see users in their tenant
  if (isAdmin) {
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('tenant_id')
      .eq('id', session.user.id)
      .single();

    if (callerProfile?.tenant_id && profile.tenant_id !== callerProfile.tenant_id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }
  }

  // Fetch memberships
  const { data: memberships } = await admin
    .from('user_store_memberships')
    .select('id, store_id, role, status, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  return NextResponse.json({
    ...profile,
    memberships: memberships || [],
  });
}

async function patchHandler(req: NextRequest, session: { user: { id: string } }) {
  if (!validateOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { allowed } = await rateLimit(session.user.id);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  const userId = pathParts[pathParts.length - 1];

  if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return NextResponse.json({ error: 'Invalid user_id' }, { status: 400 });
  }

  const body = await req.json();
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data', details: parsed.error.format() }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.rpc('managed_update_user', {
    p_user_id: userId,
    p_full_name: parsed.data.full_name ?? null,
    p_role: parsed.data.role ?? null,
    p_role_id: parsed.data.role_id ?? null,
    p_is_active: parsed.data.is_active ?? null,
    p_max_stores_limit: parsed.data.max_stores_limit ?? null,
    p_max_users_limit: parsed.data.max_users_limit ?? null,
    p_plan: parsed.data.plan ?? null,
    p_caller_id: session.user.id,
  });

  if (error) {
    const msg = error.message || '';
    if (msg.includes('ERR_SELF_DEACTIVATE_BLOCKED')) return NextResponse.json({ error: 'No puedes desactivar tu propia cuenta' }, { status: 400 });
    if (msg.includes('ERR_UNAUTHORIZED')) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    if (msg.includes('ERR_USER_NOT_FOUND')) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // FIX RLS-B4 (v2.21.0): Manejar activeStoreId separadamente (no va por managed_update_user).
  // Validar membresía antes de actualizar active_store_id.
  if (parsed.data.activeStoreId) {
    const { data: membership } = await supabaseAdmin
      .from('user_store_memberships')
      .select('id, status')
      .eq('user_id', userId)
      .eq('store_id', parsed.data.activeStoreId)
      .eq('status', 'active')
      .limit(1);

    if (!membership || membership.length === 0) {
      return NextResponse.json({ error: 'El usuario no tiene membresía activa en esa tienda' }, { status: 403 });
    }

    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ active_store_id: parsed.data.activeStoreId })
      .eq('id', userId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true, ...(data as object || {}) });
}

export const PATCH = withTracing(
  withRole('admin', patchHandler) as Parameters<typeof withTracing>[0],
  'PATCH /api/users/[id]'
);

// Iteración v2.21.8: GET handler for single user profile
export const GET = withTracing(
  withAuth(getHandler as Parameters<typeof withAuth>[0]) as Parameters<typeof withTracing>[0],
  'GET /api/users/[id]'
);
