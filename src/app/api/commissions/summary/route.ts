import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
// FIX C1: usar getSupabaseAuthClient para que RLS respete el usuario autenticado
import { getSupabaseForSession } from '@/lib/supabase-session';

/**
 * GET /api/commissions/summary?store_id=...&date_from=...&date_to=...
 *
 * Devuelve el resumen del RPC get_worker_commission_summary:
 *   - worker info (worker_id, first_name, last_name, ci, status)
 *   - ventas cash/transfer/total en el rango
 *   - último pago (date, amount)
 *   - regla activa (id, type, value)
 *
 * Usado por la tabla principal de WorkersView.
 *
 * FIX (2026-07-15): El RPC fue reescrito en la migración 20260715000002
 * para devolver columnas sin prefijo o_ (worker_id en vez de o_worker_id).
 * Ya no se requiere normalización post-hoc.
 */
async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('store_id');
  const dateFrom = searchParams.get('date_from');
  const dateTo = searchParams.get('date_to');

  if (!storeId) {
    return NextResponse.json({ error: 'store_id es requerido' }, { status: 400 });
  }

  // Llamar al RPC
  const supabase = getSupabaseForSession(session);
  const { data, error } = await supabase.rpc('get_worker_commission_summary', {
    p_store_id: storeId,
    p_date_from: dateFrom || null,
    p_date_to: dateTo || null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    store_id: storeId,
    period: { from: dateFrom, to: dateTo },
    workers: data || [],
    count: data?.length || 0,
  });
}

export const GET = withAuth(getHandler);
