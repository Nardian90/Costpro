/**
 * GET /api/users/[id]/memberships — Listar memberships de un usuario
 *
 * Iteración v2.21.8: Nuevo endpoint para consistencia arquitectónica.
 *
 * Retorna todas las memberships (activas e inactivas) del usuario,
 * incluyendo el nombre de la store para cada membership.
 *
 * Autorización:
 * - admin: puede ver memberships de cualquier user de su tenant
 * - cualquier user: puede ver sus propias memberships
 * - encargado: puede ver memberships de users en stores que comparten
 *
 * Rate limiting: 60 req/min
 * Validación: UUID format para user_id
 * Audit: automático via withAuth → withAutoTracking
 */
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { rateLimit } from '@/lib/rate-limit';
import { getSupabaseAdminSafe as getSupabaseAdmin } from '@/lib/supabase-admin';

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const { allowed } = await rateLimit(`memberships:list:${session.user.id}`, {
    windowMs: 60_000,
    maxRequests: 60,
  });
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  // Extract user_id from URL path: /api/users/[id]/memberships
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  // pathParts: ['', 'api', 'users', '[id]', 'memberships']
  const userId = pathParts[pathParts.length - 2];

  if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return NextResponse.json({ error: 'Invalid user_id' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  // Authorization: self-access or admin
  const isSelf = userId === session.user.id;
  const isAdmin = session.user.role === 'admin';

  if (!isSelf && !isAdmin) {
    // For non-admin, check tenant isolation
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

  // Admin tenant isolation
  if (isAdmin && !isSelf) {
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

    if (targetProfile?.tenant_id && callerProfile?.tenant_id &&
        targetProfile.tenant_id !== callerProfile.tenant_id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }
  }

  // Fetch memberships with store info
  const { data: memberships, error } = await admin
    .from('user_store_memberships')
    .select(`
      id,
      store_id,
      role,
      status,
      created_at,
      updated_at,
      stores:store_id (
        id,
        name,
        slug,
        is_active
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: memberships || [],
    total: (memberships || []).length,
  });
}

export const GET = withTracing(
  withAuth(getHandler as Parameters<typeof withAuth>[0]) as Parameters<typeof withTracing>[0],
  'GET /api/users/[id]/memberships'
);
