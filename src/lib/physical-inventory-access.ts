/**
 * Acceso a documentos de Inventario Físico por ID.
 *
 * Las rutas direccionadas por documento ([id]) no reciben storeId en el body,
 * así que no pueden usar withStoreAccess directamente (que lo extrae de
 * query/body). Este helper resuelve la tienda del PROPIO documento y verifica
 * la membresía activa del usuario contra ella — trust boundary idéntica al
 * patrón de /api/vale-salida ([id]) en este proyecto.
 */

import type { AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';

/**
 * Devuelve el store_id del inventario físico (o null si no existe).
 */
export async function resolvePhysicalInventoryStore(piId: string): Promise<string | null> {
  const admin = getSupabaseAdminSafe();
  if (!admin) return null;
  const { data } = await admin
    .from('physical_inventories')
    .select('store_id')
    .eq('id', piId)
    .maybeSingle();
  return data?.store_id ?? null;
}

/**
 * Comprueba que la sesión tenga acceso a la tienda: admin global o membresía
 * activa. (La barrera final sigue siendo RLS + roles dentro de cada RPC.)
 */
export function sessionHasStoreAccess(session: AuthenticatedSession, storeId: string): boolean {
  if (session.user.role === 'admin') return true;
  return (session.user.memberships || []).some(
    (m) => m.store_id === storeId && m.status === 'active'
  );
}

/**
 * Rol del usuario en una tienda concreta (o 'admin' global).
 */
export function roleInStore(session: AuthenticatedSession, storeId: string): string | null {
  if (session.user.role === 'admin') return 'admin';
  const m = (session.user.memberships || []).find(
    (mm) => mm.store_id === storeId && mm.status === 'active'
  );
  return m?.role ?? null;
}
