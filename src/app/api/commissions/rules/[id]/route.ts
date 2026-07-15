import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseForSession } from '@/lib/supabase-session';

/**
 * PATCH /api/commissions/rules/[id]
 *   Body: campos a actualizar (parcial). Para type='product_specific', acepta
 *   product_ids[] que reemplaza la lista completa de productos asociados.
 *
 * DELETE /api/commissions/rules/[id]
 *   Elimina la regla (cascade elimina commission_rule_products automáticamente).
 *
 * v2 (2026-07-15) — audit doc C1: este endpoint NO existía, era una feature rota.
 *
 * NOTA: conAuth no pasa el context object con params, por eso usamos extractIdFromUrl.
 */

function extractIdFromUrl(req: NextRequest): string | null {
  const match = req.nextUrl?.pathname?.match(/\/api\/commissions\/rules\/([^/]+)/);
  return match?.[1] || null;
}

async function patchHandler(req: NextRequest, session: AuthenticatedSession) {
  const id = extractIdFromUrl(req);
  if (!id) {
    return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
  }

  if (session.user.role !== 'admin' && session.user.role !== 'manager') {
    return NextResponse.json({ error: 'Forbidden — requiere rol admin o manager' }, { status: 403 });
  }

  const body = await req.json();
  const supabase = getSupabaseForSession(session);

  // Verificar ownership: la regla debe pertenecer a una tienda donde el usuario tenga membership
  const { data: existing, error: fErr } = await supabase
    .from('commission_rules')
    .select('store_id, type')
    .eq('id', id)
    .single();
  if (fErr || !existing) {
    return NextResponse.json({ error: 'Regla no encontrada' }, { status: 404 });
  }

  // Extraer campos a actualizar
  const {
    worker_id, type, value_percent, fixed_value, salary_amount,
    base_calculation, priority, valid_from, valid_to,
    min_price, max_price, product_commission_amount, product_ids,
  } = body;

  const update: Record<string, any> = {};
  if (worker_id !== undefined) update.worker_id = worker_id || null;
  if (type !== undefined) update.type = type;
  if (value_percent !== undefined) update.value_percent = value_percent ?? null;
  if (fixed_value !== undefined) update.fixed_value = fixed_value ?? null;
  if (salary_amount !== undefined) update.salary_amount = salary_amount ?? null;
  if (base_calculation !== undefined) update.base_calculation = base_calculation;
  if (priority !== undefined) update.priority = priority;
  if (valid_from !== undefined) update.valid_from = valid_from;
  if (valid_to !== undefined) update.valid_to = valid_to || null;
  if (min_price !== undefined) update.min_price = min_price ?? null;
  if (max_price !== undefined) update.max_price = max_price ?? null;
  if (product_commission_amount !== undefined) update.product_commission_amount = product_commission_amount ?? null;

  const { data, error } = await supabase
    .from('commission_rules')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Si se enviaron product_ids Y la regla es product_specific, reemplazar asociaciones
  if (product_ids !== undefined && (data.type === 'product_specific' || type === 'product_specific')) {
    // Borrar las existentes
    await supabase.from('commission_rule_products').delete().eq('rule_id', id);
    // Insertar las nuevas
    if (Array.isArray(product_ids) && product_ids.length > 0) {
      const inserts = product_ids.map((pid: string) => ({ rule_id: id, product_id: pid }));
      const { error: rpErr } = await supabase
        .from('commission_rule_products')
        .insert(inserts);
      if (rpErr) {
        return NextResponse.json(
          { error: `Regla actualizada pero error asociando productos: ${rpErr.message}` },
          { status: 500 },
        );
      }
    }
  }

  return NextResponse.json({ rule: data });
}

async function deleteHandler(req: NextRequest, session: AuthenticatedSession) {
  const id = extractIdFromUrl(req);
  if (!id) {
    return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
  }

  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — requiere rol admin' }, { status: 403 });
  }

  const supabase = getSupabaseForSession(session);

  // Verificar ownership primero
  const { data: existing, error: fErr } = await supabase
    .from('commission_rules')
    .select('store_id')
    .eq('id', id)
    .single();
  if (fErr || !existing) {
    return NextResponse.json({ error: 'Regla no encontrada' }, { status: 404 });
  }

  // cascade elimina commission_rule_products automáticamente
  const { error } = await supabase
    .from('commission_rules')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, id });
}

export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);
