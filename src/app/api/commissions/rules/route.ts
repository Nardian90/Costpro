import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
// FIX C1: usar getSupabaseAuthClient para que RLS respete el usuario autenticado
import { getSupabaseForSession } from '@/lib/supabase-session';

/**
 * GET /api/commissions/rules?store_id=...&worker_id=...
 * POST /api/commissions/rules
 *   Body: { store_id, worker_id?, type, value_percent?, fixed_value?, salary_amount?, base_calculation, priority, valid_from, valid_to? }
 *
 * Las reglas son versionadas automáticamente por trigger SQL.
 */

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('store_id');
  const workerId = searchParams.get('worker_id');
  const includeHistory = searchParams.get('history') === 'true';

  if (!storeId) {
    return NextResponse.json({ error: 'store_id es requerido' }, { status: 400 });
  }

  const supabase = getSupabaseForSession(session);
  let query = supabase
    .from('commission_rules')
    .select('*')
    .eq('store_id', storeId)
    .order('priority', { ascending: false });

  if (workerId) {
    query = query.or(`worker_id.eq.${workerId},worker_id.is.null`);
  }

  const { data: rules, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Si se pide historial, cargar versiones
  let versions: Record<string, unknown[]> = {};
  if (includeHistory && rules && rules.length > 0) {
    const ruleIds = rules.map(r => r.id);
    const { data: vData } = await supabase
      .from('commission_rule_versions')
      .select('*')
      .in('rule_id', ruleIds)
      .order('version', { ascending: false });
    versions = (vData || []).reduce((acc: Record<string, unknown[]>, v: any) => {
      if (!acc[v.rule_id]) acc[v.rule_id] = [];
      acc[v.rule_id].push(v);
      return acc;
    }, {});
  }

  return NextResponse.json({
    rules: rules || [],
    versions: includeHistory ? versions : undefined,
  });
}

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  const body = await req.json();

  if (session.user.role !== 'admin' && session.user.role !== 'manager') {
    return NextResponse.json({ error: 'Forbidden — requiere rol admin o manager' }, { status: 403 });
  }

  const {
    store_id, worker_id, type, value_percent, fixed_value, salary_amount,
    base_calculation, priority, valid_from, valid_to,
  } = body;

  if (!store_id || !type || !valid_from) {
    return NextResponse.json(
      { error: 'Campos requeridos: store_id, type, valid_from' },
      { status: 400 },
    );
  }

  const supabase = getSupabaseForSession(session);
  const { data, error } = await supabase
    .from('commission_rules')
    .insert({
      store_id,
      worker_id: worker_id || null,
      type,
      value_percent: value_percent ?? null,
      fixed_value: fixed_value ?? null,
      salary_amount: salary_amount ?? null,
      base_calculation: base_calculation || 'total_sales',
      priority: priority ?? 0,
      valid_from,
      valid_to: valid_to || null,
      created_by: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.user.id || '') ? session.user.id : null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rule: data }, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
