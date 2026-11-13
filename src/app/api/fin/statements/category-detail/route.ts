/**
 * API CP-FIN — Detalle de una categoría (drilldown de informes).
 * GET /api/fin/statements/category-detail?store_id=...&category=...&from=...&to=...&limit&offset
 * Devuelve los movimientos con su documento de origen para navegar del
 * indicador general al movimiento concreto (permisos por RPC).
 */
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('store_id');
  const category = searchParams.get('category');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const limit = Math.min(Number(searchParams.get('limit') ?? 50) || 50, 200);
  const offset = Math.max(Number(searchParams.get('offset') ?? 0) || 0, 0);

  if (!storeId || !category) {
    return NextResponse.json({ error: 'store_id y category son requeridos' }, { status: 400 });
  }
  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) {
    return NextResponse.json({ error: 'from y to (YYYY-MM-DD) son requeridos' }, { status: 400 });
  }

  const admin = getSupabaseAdminSafe();
  if (!admin) {
    return NextResponse.json({ error: 'Servicio no disponible' }, { status: 503 });
  }

  const { data, error } = await admin.rpc('fin_get_category_detail', {
    p_store_id: storeId,
    p_category: category,
    p_from: from,
    p_to: to,
    p_limit: limit,
    p_offset: offset,
    p_user_id: session.user.id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.message.includes('ERR_UNAUTHORIZED') ? 403 : 500 });
  }
  return NextResponse.json(data);
}

export const GET = withAuth(getHandler);
