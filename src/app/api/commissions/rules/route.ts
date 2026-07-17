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

  // v2 (2026-07-15): hidratar reglas product_specific con sus product_ids asociados
  // v3 (2026-07-17): incluir commission_amount y commission_mode por producto individual
  let rulesHydrated = rules || [];
  const productSpecificRules = (rules || []).filter((r: any) => r.type === 'product_specific');
  if (productSpecificRules.length > 0) {
    const { data: rpData } = await supabase
      .from('commission_rule_products')
      .select('rule_id, product_id, commission_amount, commission_mode, products:product_id (id, name, sku, price, price_currency)')
      .in('rule_id', productSpecificRules.map((r: any) => r.id));
    const rpMap: Record<string, any[]> = {};
    const rpProductsMap: Record<string, any[]> = {};
    const rpConfigsMap: Record<string, Record<string, { amount: number | null; mode: 'per_sale' | 'per_unit' }>> = {};
    for (const rp of (rpData || [])) {
      if (!rpMap[rp.rule_id]) rpMap[rp.rule_id] = [];
      rpMap[rp.rule_id].push(rp.product_id);
      if (!rpProductsMap[rp.rule_id]) rpProductsMap[rp.rule_id] = [];
      rpProductsMap[rp.rule_id].push(rp.products);
      // v3: construir map de configs por producto
      if (!rpConfigsMap[rp.rule_id]) rpConfigsMap[rp.rule_id] = {};
      if (rp.commission_amount != null || rp.commission_mode != null) {
        rpConfigsMap[rp.rule_id][rp.product_id] = {
          amount: rp.commission_amount != null ? Number(rp.commission_amount) : null,
          mode: (rp.commission_mode as 'per_sale' | 'per_unit') || 'per_sale',
        };
      }
    }
    rulesHydrated = (rules || []).map((r: any) => ({
      ...r,
      product_ids: rpMap[r.id] || [],
      products: rpProductsMap[r.id] || [],
      product_configs: rpConfigsMap[r.id] || {},
      product_commission_mode: r.product_commission_mode || 'per_sale',
    }));
  }

  // Si se pide historial, cargar versiones
  let versions: Record<string, unknown[]> = {};
  if (includeHistory && rulesHydrated && rulesHydrated.length > 0) {
    const ruleIds = rulesHydrated.map((r: any) => r.id);
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
    rules: rulesHydrated,
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
    // v2 (2026-07-15): nuevos campos para scale_percentage y product_specific
    min_price, max_price, product_commission_amount, product_ids,
    // v3 (2026-07-17): modo default + configs por producto individual
    product_commission_mode, product_configs,
  } = body;

  if (!store_id || !type || !valid_from) {
    return NextResponse.json(
      { error: 'Campos requeridos: store_id, type, valid_from' },
      { status: 400 },
    );
  }

  // Validación: product_specific requiere product_ids[]
  if (type === 'product_specific' && (!product_ids || product_ids.length === 0)) {
    return NextResponse.json(
      { error: 'Las reglas product_specific requieren al menos un product_id' },
      { status: 400 },
    );
  }

  const supabase = getSupabaseForSession(session);

  // 1. Insertar la regla
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
      // v2
      min_price: min_price ?? null,
      max_price: max_price ?? null,
      product_commission_amount: product_commission_amount ?? null,
      // v3 (2026-07-17): modo default de la regla product_specific
      // (NOTA: commission_rules no tiene columna product_commission_mode en DB;
      //  se guarda solo en commission_rule_products.commission_mode por producto.
      //  Este valor se usa como default cuando un producto no tiene override.)
      created_by: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.user.id || '') ? session.user.id : null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 2. Si es product_specific, insertar asociaciones en commission_rule_products
  // v3 (2026-07-17): incluir commission_amount y commission_mode por producto individual
  if (type === 'product_specific' && product_ids && product_ids.length > 0) {
    const defaultMode = product_commission_mode || 'per_sale';
    const inserts = product_ids.map((pid: string) => {
      const cfg = product_configs?.[pid];
      return {
        rule_id: data.id,
        product_id: pid,
        commission_amount: cfg?.amount != null ? cfg.amount : null,
        commission_mode: cfg?.mode || defaultMode,
      };
    });
    const { error: rpErr } = await supabase
      .from('commission_rule_products')
      .insert(inserts);
    if (rpErr) {
      // Rollback: borrar la regla recién creada
      await supabase.from('commission_rules').delete().eq('id', data.id);
      return NextResponse.json(
        { error: `Error asociando productos: ${rpErr.message}` },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ rule: data }, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
