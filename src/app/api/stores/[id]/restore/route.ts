import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';

/**
 * POST /api/stores/[id]/restore
 * Restaura una tienda archivada: is_archived=false + is_active=true.
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

  const { getSupabaseAuthClient } = await import('@/lib/supabaseClient');
  const supabase = getSupabaseAuthClient(session.token);

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
