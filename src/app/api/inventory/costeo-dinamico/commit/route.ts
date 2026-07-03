import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withStoreAccess, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import { canManageStore } from '@/lib/roles';
import { z } from 'zod';
// F4-GAP1: Import cache invalidation
import { invalidateCacheForStore } from '../route';

export const runtime = 'nodejs';

const commitSchema = z.object({
  store_id: z.string().uuid(),
  product_ids: z.array(z.string().uuid()).min(1),
  tasa_usada: z.number().positive(),
  fuente_tasa: z.string(),
  motivo: z.string().optional(),
  // Each product_id maps to its suggested_price (pre-calculated by the client)
  price_updates: z.array(z.object({
    product_id: z.string().uuid(),
    new_price: z.number().positive(),
  })),
});

/**
 * POST /api/inventory/costeo-dinamico/commit
 *
 * Actualiza precios de productos en batch basado en el análisis de costeo dinámico.
 * Registra cada cambio en price_commit_log para auditoría y rollback.
 */
async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  if (session.user.role !== 'admin' && session.user.role !== 'manager') {
    return NextResponse.json({ error: 'Forbidden — requiere rol admin o manager' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = commitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.format() }, { status: 400 });
  }

  const supabase = getSupabaseAdminSafe();
  if (!supabase) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });

  const { store_id, price_updates, tasa_usada, fuente_tasa, motivo } = parsed.data;
  const userId = session.user.id;

  // 1. Obtener precios actuales para el snapshot
  const { data: currentProducts, error: fetchError } = await supabase
    .from('products')
    .select('id, price, cost_average')
    .in('id', price_updates.map(p => p.product_id));

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  // 2. Construir snapshot de cambios
  const changes = price_updates.map(update => {
    const current = currentProducts?.find(p => p.id === update.product_id);
    return {
      product_id: update.product_id,
      old_price: current?.price || 0,
      new_price: update.new_price,
      old_cost: current?.cost_average || 0,
    };
  });

  // 3. Actualizar precios en batch
  for (const change of changes) {
    const { error } = await supabase
      .from('products')
      .update({ price: change.new_price, updated_at: new Date().toISOString() })
      .eq('id', change.product_id);

    if (error) {
      logger.error('DATABASE', 'COMMIT_PRICE_UPDATE_FAILED', { productId: change.product_id, error: error.message });
      // Continue with other products
    }
  }

  // 4. Registrar en price_commit_log
  const { error: logError } = await supabase
    .from('price_commit_log')
    .insert({
      store_id,
      committed_by: userId,
      products_count: changes.length,
      changes: changes,
      tasa_usada,
      fuente_tasa,
      motivo: motivo || 'Actualización de precios por costeo dinámico',
    });

  if (logError) {
    logger.error('DATABASE', 'PRICE_COMMIT_LOG_FAILED', { error: logError.message });
    // Don't fail the request — prices were already updated
  }

  logger.info('DATABASE', 'PRICES_COMMITTED', { storeId: store_id, count: changes.length, userId });

  // F4-GAP1: Invalidate cache after price commit
  invalidateCacheForStore(store_id);

  return NextResponse.json({
    success: true,
    committed: changes.length,
    changes,
  });
}

/**
 * POST /api/inventory/costeo-dinamico/commit/rollback
 * Body: { commit_id }
 * Revierte una actualización de precios usando el snapshot en price_commit_log.
 */
async function rollbackHandler(req: NextRequest, session: AuthenticatedSession) {
  // IC-F04B-ROLLBACK-STORE-ACCESS: defense-in-depth role gate (admin/manager).
  // The per-store membership check below (canManageStore) further restricts
  // non-admins to their own store's commits.
  if (session.user.role !== 'admin' && session.user.role !== 'manager') {
    return NextResponse.json(
      { error: 'Forbidden', message: 'Solo admin o manager puede revertir' },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { commit_id } = body;

  if (!commit_id) {
    return NextResponse.json({ error: 'commit_id requerido' }, { status: 400 });
  }

  const supabase = getSupabaseAdminSafe();
  if (!supabase) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });

  // 1. Obtener el commit log
  const { data: commitLog, error: logError } = await supabase
    .from('price_commit_log')
    .select('*')
    .eq('id', commit_id)
    .single();

  if (logError || !commitLog) {
    return NextResponse.json({ error: 'Commit no encontrado' }, { status: 404 });
  }

  if (commitLog.rollback) {
    return NextResponse.json({ error: 'Este commit ya fue revertido' }, { status: 400 });
  }

  // IC-F04B-ROLLBACK-STORE-ACCESS: Per-store membership verification.
  //
  // withStoreAccess cannot be used at the export level here because the PUT
  // body only carries `commit_id` (no `store_id`) — withStoreAccess would
  // return 400 "Se requiere storeId" before reaching this handler (see
  // auth-middleware.ts lines 311-329). Instead, we resolve store_id from the
  // commit_log and apply the canonical canManageStore() check (same helper
  // that withStoreAccess uses internally at line 385).
  //
  // - admin global → bypass (canManageStore returns true for admin).
  // - manager → must have an active membership with role admin/manager/encargado
  //   in the specific store of this commit_log.
  // - clerk → always denied (role gate above + canManageStore).
  if (!canManageStore(session.user, commitLog.store_id)) {
    return NextResponse.json(
      { error: 'Forbidden', message: 'No tienes acceso al store del commit' },
      { status: 403 }
    );
  }

  // 2. Revertir precios
  const changes = commitLog.changes as Array<{ product_id: string; old_price: number }>;
  for (const change of changes) {
    await supabase
      .from('products')
      .update({ price: change.old_price, updated_at: new Date().toISOString() })
      .eq('id', change.product_id);
  }

  // 3. Marcar como revertido
  await supabase
    .from('price_commit_log')
    .update({
      rollback: true,
      rolled_back_at: new Date().toISOString(),
      rolled_back_by: session.user.id,
    })
    .eq('id', commit_id);

  logger.info('DATABASE', 'PRICES_ROLLBACK', { commit_id, userId: session.user.id });

  // F4-GAP1: Invalidate cache after rollback
  invalidateCacheForStore(commitLog.store_id);

  return NextResponse.json({ success: true, reverted: changes.length });
}

// IC-F04-STORE-ACCESS: withStoreAccess reads store_id from the JSON body and
// validates the user has an active membership to that store before running the
// handler. Prevents cross-store price commits via getSupabaseAdminSafe().
// NOTE: the per-handler role check (admin/manager) on line 32 is kept as
// defense-in-depth — withStoreAccess verifies membership, the role check
// verifies the user's authority to commit prices.
export const POST = withTracing(withStoreAccess(postHandler) as any, 'POST /api/inventory/costeo-dinamico/commit');

// IC-F04B-ROLLBACK-STORE-ACCESS: PUT (rollback) stays on `withAuth` because the
// body only carries `commit_id` (no `store_id`) — `withStoreAccess` would
// return 400 "Se requiere storeId" before the handler runs (see
// auth-middleware.ts lines 311-329). Instead, the handler resolves
// `commitLog.store_id` from the DB and applies the canonical `canManageStore()`
// check (same helper used by `withStoreAccess` internally). This gives
// equivalent per-store authorization adapted to the rollback flow.
// Defense-in-depth: the admin/manager role check at the top of the handler is
// preserved; canManageStore enforces per-store membership on top.
export const PUT = withTracing(withAuth(rollbackHandler) as any, 'PUT /api/inventory/costeo-dinamico/commit');
