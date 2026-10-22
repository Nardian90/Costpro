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
 * GET /api/physical-inventory/[id]/reconciliation
 *   Resumen de conciliación (SOLO roles privilegiados): líneas con teóricas,
 *   diferencias, valorización y movimientos posteriores al corte.
 *   Es la vista de la regla temporal: contar vs teórico al corte.
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
  const { data, error } = await authClient.rpc('get_physical_inventory_reconciliation', { p_pi_id: id });
  if (error) {
    const unauthorized = String(error.message || '').includes('ERR_UNAUTHORIZED');
    return NextResponse.json(
      { error: unauthorized ? 'Sin autorización para la conciliación' : 'Error de conciliación', message: error.message },
      { status: unauthorized ? 403 : 400 }
    );
  }
  return NextResponse.json(data);
}

export const GET = withTracing(withAuth(getHandler) as any, 'GET /api/physical-inventory/[id]/reconciliation');
