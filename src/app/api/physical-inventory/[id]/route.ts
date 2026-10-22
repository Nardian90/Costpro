import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseAuthClient } from '@/lib/supabaseClient';
import { resolvePhysicalInventoryStore, sessionHasStoreAccess } from '@/lib/physical-inventory-access';
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

export const GET = withTracing(withAuth(getHandler) as any, 'GET /api/physical-inventory/[id]');
