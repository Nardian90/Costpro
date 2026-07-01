import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { canManageStore } from '@/lib/roles';

/**
 * POST /api/stores/[id]/restore
 * Restaura una tienda archivada: is_archived=false + is_active=true.
 *
 * AUTORIZACIÓN (FIX-AUDIT-R5):
 *   Mismo fix que archive/route.ts — usar canManageStore(session.user, storeId)
 *   en vez de chequear solo el rol global. Ver archive/route.ts para detalles.
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

  // FIX-AUDIT-NEW-2: Use service-role client (same fix as archive route).
  // See archive/route.ts for full rationale.
  // FIX-DRY: Use the shared getSupabaseAdminSafe() factory instead of inline createClient.
  const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
  const supabase = getSupabaseAdminSafe();
  if (!supabase) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const { error } = await supabase
    .from('stores')
    .update({
      is_active: true,
      is_archived: false,
      archived_at: null,
      archived_by: null,
    })
    .eq('id', storeId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: 'Tienda restaurada. Ya está activa y visible en el dashboard.',
    storeId,
  });
}

export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/stores/[id]/restore');
