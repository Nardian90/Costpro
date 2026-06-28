import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';

/**
 * POST /api/stores/[id]/archive
 * Archiva una tienda: is_archived=true + is_active=false.
 * Preserva todos los datos (ventas, inventario, configuración).
 */
async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  const pathParts = new URL(req.url).pathname.split('/');
  const storeId = pathParts[pathParts.indexOf('stores') + 1];

  if (!storeId) {
    return NextResponse.json({ error: 'Store ID requerido' }, { status: 400 });
  }

  if (session.user.role !== 'admin' && session.user.role !== 'manager') {
    return NextResponse.json({ error: 'Forbidden — requiere rol admin o manager' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { reason } = body;

  const { getSupabaseAuthClient } = await import('@/lib/supabaseClient');
  const supabase = getSupabaseAuthClient(session.token);

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
