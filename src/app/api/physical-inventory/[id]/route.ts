import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { uuidLoose } from '@/validation/api-schemas';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseAuthClient } from '@/lib/supabaseClient';
import { resolvePhysicalInventoryStore, sessionHasStoreAccess, roleInStore } from '@/lib/physical-inventory-access';
import { isAdminLevel } from '@/lib/roles';
import { rateLimit } from '@/lib/rate-limit';
import { validateOrigin } from '@/lib/csrf';
import { withTracing } from '@/lib/observability';

function extractIdFromUrl(req: NextRequest): string | null {
  const match = req.nextUrl?.pathname?.match(/\/api\/physical-inventory\/([^/]+)/);
  return match?.[1] || null;
}

/**
 * GET /api/physical-inventory/[id]
 *   Detalle completo: cabecera + líneas (ciego-seguras vía RPC) + hojas + ajustes.
 *   En blind_mode los contadores sin privilegio reciben las líneas SIN teóricas.
 *   Autorización: sesión válida + membresía en la tienda del documento (RLS en BD).
 */
async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const id = extractIdFromUrl(req);
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });

  const storeId = await resolvePhysicalInventoryStore(id);
  if (!storeId) return NextResponse.json({ error: 'Inventario no encontrado' }, { status: 404 });
  if (!sessionHasStoreAccess(session, storeId)) {
    return NextResponse.json({ error: 'Sin acceso a la tienda de este inventario' }, { status: 403 });
  }

  const authClient = getSupabaseAuthClient(session.token);

  const { data: pi, error: piErr } = await authClient
    .from('physical_inventories')
    .select(
      `*, store:stores(name),
       creator:profiles!physical_inventories_created_by_fkey(full_name),
       voider:profiles!physical_inventories_voided_by_fkey(full_name),
       adjustments:physical_inventory_adjustments(
         id, kind, items_count, adjustment_id, generated_at,
         adjustment:inventory_adjustments(id, status, reason, notes, created_at, confirmed_at, confirmed_by)
       )`
    )
    .eq('id', id)
    .maybeSingle();
  if (piErr) {
    return NextResponse.json({ error: 'Error consultando inventario', message: piErr.message }, { status: 500 });
  }
  if (!pi) return NextResponse.json({ error: 'Inventario no encontrado' }, { status: 404 });

  // Líneas ciego-seguras (la RPC omite teóricas si el usuario no está autorizado)
  const { data: countData, error: rpcErr } = await authClient.rpc('get_physical_inventory_count_lines', { p_pi_id: id });
  if (rpcErr) {
    return NextResponse.json({ error: 'Sin acceso al conteo', message: rpcErr.message }, { status: 403 });
  }

  // Hojas de conteo registradas (versiones PDF)
  const { data: sheets } = await authClient
    .from('physical_inventory_sheets')
    .select('id, seq, mode, total_lines, generated_at, generated_by')
    .eq('pi_id', id)
    .order('seq', { ascending: false })
    .limit(50);

  return NextResponse.json({
    inventory: pi,
    lines: countData?.lines || [],
    showTheoretical: countData?.show_theoretical ?? false,
    sheets: sheets || [],
  });
}

/**
 * PATCH /api/physical-inventory/[id] — MISIÓN CICLO DE VIDA (2026-10-27)
 *   Edición de los datos de un BORRADOR (draft = completa; prepared = solo
 *   campos no congelados). La RPC update_physical_inventory revalida estado
 *   (FOR UPDATE) y permisos en BD; aquí se resuelve la tienda del documento
 *   y el rol privilegiado (patrón BOLA del módulo).
 */
const EditSchema = z.object({
  cutoffDate: z.string().datetime().optional().nullable(),
  description: z.string().trim().max(200).optional().nullable(),
  responsibleName: z.string().trim().max(120).optional().nullable(),
  scopeType: z.enum(['full', 'category', 'selection']).optional().nullable(),
  categories: z.array(z.string().trim().min(1).max(120)).max(50).optional().nullable(),
  productIds: z.array(uuidLoose).max(2000).optional().nullable(),
  blindMode: z.boolean().optional().nullable(),
  observations: z.string().trim().max(2000).optional().nullable(),
});

async function patchHandler(req: NextRequest, session: AuthenticatedSession) {
  if (!validateOrigin(req)) {
    return NextResponse.json({ error: 'Origen no permitido' }, { status: 403 });
  }
  const { allowed } = await rateLimit(session.user.id, { windowMs: 60_000, maxRequests: 20 });
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const id = extractIdFromUrl(req);
  if (!id || !uuidLoose.safeParse(id).success) {
    return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
  }

  const parsed = EditSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  const storeId = await resolvePhysicalInventoryStore(id);
  if (!storeId) return NextResponse.json({ error: 'Inventario no encontrado' }, { status: 404 });
  if (!sessionHasStoreAccess(session, storeId)) {
    return NextResponse.json({ error: 'Sin acceso a la tienda de este inventario' }, { status: 403 });
  }
  // Rol privilegiado en la tienda (misma clase que crear/anular)
  const isGlobalAdmin = isAdminLevel(session.user.role);
  const privileged = isGlobalAdmin || ['admin', 'manager', 'encargado'].includes(roleInStore(session, storeId) || '');
  if (!privileged) {
    return NextResponse.json(
      { error: 'Prohibido', message: 'Se requiere rol admin, manager o encargado para editar inventarios físicos' },
      { status: 403 }
    );
  }

  // El estado decide qué campos viajan: draft = completos; prepared = solo
  // los no congelados (la RPC rechaza cualquier intento de tocar lo congelado).
  const authClient = getSupabaseAuthClient(session.token);
  const { data: current } = await authClient
    .from('physical_inventories')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();
  if (!current) return NextResponse.json({ error: 'Inventario no encontrado' }, { status: 404 });
  if (current.status !== 'draft' && current.status !== 'prepared') {
    return NextResponse.json(
      { error: 'No editable', message: 'Solo un inventario en Borrador puede editarse' },
      { status: 409 }
    );
  }

  const isDraft = current.status === 'draft';
  const rpcArgs: Record<string, unknown> = {
    p_pi_id: id,
    p_description: body.description ?? null,
    p_responsible_name: body.responsibleName ?? null,
    p_blind_mode: body.blindMode ?? null,
    p_observations: body.observations ?? null,
  };
  if (isDraft) {
    rpcArgs.p_cutoff_date = body.cutoffDate ?? null;
    rpcArgs.p_scope_type = body.scopeType ?? null;
    rpcArgs.p_categories = body.scopeType === 'category' ? body.categories || [] : null;
    rpcArgs.p_product_ids = body.scopeType === 'selection' ? body.productIds || [] : null;
  }

  const { error } = await authClient.rpc('update_physical_inventory', rpcArgs);
  if (error) {
    const msg = error.message || 'No se pudo actualizar';
    const isConflict = msg.includes('ERR_NOT_EDITABLE_STATE') || msg.includes('ERR_FIELD_FROZEN');
    return NextResponse.json({ error: 'No se pudo actualizar', message: msg }, { status: isConflict ? 409 : 400 });
  }
  return NextResponse.json({ status: 'success', id });
}

/**
 * DELETE /api/physical-inventory/[id] — MISIÓN CICLO DE VIDA (2026-10-27)
 *   Borrado DEFINITIVO de un BORRADOR (draft/prepared) sin historial de
 *   anulación. La RPC verifica el estado más reciente con FOR UPDATE y se
 *   niega para cualquier inventario ya iniciado/terminado/anulado.
 */
async function deleteHandler(req: NextRequest, session: AuthenticatedSession) {
  if (!validateOrigin(req)) {
    return NextResponse.json({ error: 'Origen no permitido' }, { status: 403 });
  }
  const { allowed } = await rateLimit(session.user.id, { windowMs: 60_000, maxRequests: 10 });
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const id = extractIdFromUrl(req);
  if (!id || !uuidLoose.safeParse(id).success) {
    return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
  }

  const storeId = await resolvePhysicalInventoryStore(id);
  if (!storeId) return NextResponse.json({ error: 'Inventario no encontrado' }, { status: 404 });
  if (!sessionHasStoreAccess(session, storeId)) {
    return NextResponse.json({ error: 'Sin acceso a la tienda de este inventario' }, { status: 403 });
  }
  const isGlobalAdmin = isAdminLevel(session.user.role);
  const privileged = isGlobalAdmin || ['admin', 'manager', 'encargado'].includes(roleInStore(session, storeId) || '');
  if (!privileged) {
    return NextResponse.json(
      { error: 'Prohibido', message: 'Se requiere rol admin, manager o encargado para eliminar inventarios físicos' },
      { status: 403 }
    );
  }

  const authClient = getSupabaseAuthClient(session.token);
  const { data, error } = await authClient.rpc('delete_physical_inventory', { p_pi_id: id });
  if (error) {
    const msg = error.message || 'No se pudo eliminar';
    const isConflict = msg.includes('ERR_CANNOT_DELETE_STATE') || msg.includes('ERR_ADJUSTMENTS_LINKED');
    return NextResponse.json({ error: 'No se pudo eliminar', message: msg }, { status: isConflict ? 409 : 400 });
  }
  return NextResponse.json(data || { status: 'success', id });
}

export const GET = withTracing(withAuth(getHandler) as any, 'GET /api/physical-inventory/[id]');
export const PATCH = withTracing(withAuth(patchHandler) as any, 'PATCH /api/physical-inventory/[id]');
export const DELETE = withTracing(withAuth(deleteHandler) as any, 'DELETE /api/physical-inventory/[id]');
