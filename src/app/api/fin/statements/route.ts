/**
 * API CP-FIN — Estados Financieros (misma fuente: motor de movimientos).
 *
 * GET /api/fin/statements?type=balance&store_id=...&as_of=YYYY-MM-DD
 * GET /api/fin/statements?type=income&store_id=...&from=...&to=...
 * GET /api/fin/statements?type=dashboard&store_id=...&from=...&to=...
 *
 * RPCs: fin_get_balance_sheet / fin_get_income_statement / fin_get_dashboard.
 * El gate de acceso a la tienda lo hace cada RPC (p_user_id del JWT).
 */
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') ?? 'balance';
  const storeId = searchParams.get('store_id');
  const asOf = searchParams.get('as_of');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  if (!storeId) {
    return NextResponse.json({ error: 'store_id es requerido' }, { status: 400 });
  }

  const admin = getSupabaseAdminSafe();
  if (!admin) {
    return NextResponse.json({ error: 'Servicio no disponible' }, { status: 503 });
  }

  if (type === 'balance') {
    const fecha = asOf && DATE_RE.test(asOf) ? asOf : new Date().toISOString().slice(0, 10);
    const { data, error } = await admin.rpc('fin_get_balance_sheet', {
      p_store_id: storeId,
      p_as_of: fecha,
      p_user_id: session.user.id,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: error.message.includes('ERR_UNAUTHORIZED') ? 403 : 500 });
    return NextResponse.json(data);
  }

  if (type === 'income' || type === 'dashboard') {
    if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) {
      return NextResponse.json({ error: 'from y to (YYYY-MM-DD) son requeridos' }, { status: 400 });
    }
    if (from > to) {
      return NextResponse.json({ error: 'El período es inválido: from > to' }, { status: 400 });
    }
    const rpcName = type === 'income' ? 'fin_get_income_statement' : 'fin_get_dashboard';
    const { data, error } = await admin.rpc(rpcName, {
      p_store_id: storeId,
      p_from: from,
      p_to: to,
      p_user_id: session.user.id,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: error.message.includes('ERR_UNAUTHORIZED') ? 403 : 500 });
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: 'type inválido (balance | income | dashboard)' }, { status: 400 });
}

export const GET = withAuth(getHandler);
