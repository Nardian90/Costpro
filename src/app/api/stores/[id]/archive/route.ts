import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { canManageStore } from '@/lib/roles';

/**
 * POST /api/stores/[id]/archive
 * Archiva una tienda: is_archived=true + is_active=false.
 * Preserva todos los datos (ventas, inventario, configuración).
 *
 * AUTORIZACIÓN (FIX-AUDIT-R5):
 *   Antes se chequeaba solo `session.user.role` global (admin | manager), lo que
 *   permitía a un manager archivar CUALQUIER tienda de cualquier tenant conociendo
 *   el UUID. Ahora se usa `canManageStore(session.user, storeId)` que valida
 *   membership activa en la tienda específica (o admin global). Consistente con
 *   PATCH/DELETE de /api/stores/route.ts y con el contrato documentado en
 *   store-rls-isolation.test.ts ('manager can manage stores where they have
 *   active manager membership').
 */
async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  const pathParts = new URL(req.url).pathname.split('/');
  const storeId = pathParts[pathParts.indexOf('stores') + 1];

  if (!storeId) {
    return NextResponse.json({ error: 'Store ID requerido' }, { status: 400 });
  }

  if (!canManageStore(session.user, storeId)) {
    return NextResponse.json({ error: 'Forbidden — sin acceso a esta tienda' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { reason } = body;

  // FIX-AUDIT-NEW-2: Use service-role client instead of getSupabaseAuthClient(session.token).
  // The columns is_archived, archived_at, archived_by are NEW (from migration 20260628000001)
  // and existing RLS policies on stores likely don't cover UPDATE on these columns for
  // manager role. With the user's JWT, the UPDATE could silently fail with 500.
  // The other write routes (/api/stores/route.ts POST/PATCH/DELETE) already use the
  // service-role client — this route should do the same for consistency and reliability.
  // FIX-DRY: Use the shared getSupabaseAdminSafe() factory instead of inline createClient.
  const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
  const supabase = getSupabaseAdminSafe();
  if (!supabase) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const userId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.user.id || '')
    ? session.user.id : null;

  const { error } = await supabase
    .from('stores')
    .update({
      is_active: false,
      is_archived: true,
      archived_at: new Date().toISOString(),
      archived_by: userId,
    })
    .eq('id', storeId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: 'Tienda archivada. Todos los datos se conservan.',
    storeId,
    reason: reason || null,
  });
}

export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/stores/[id]/archive');
