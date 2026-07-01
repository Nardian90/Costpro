
import { UserRole, UserStoreMembership } from '@/types';

// ─────────────────────────────────────────────────────────────────────
// MODELO DE ROLES — Costpro
// ─────────────────────────────────────────────────────────────────────
// Costpro distingue entre ROL GLOBAL (en profiles.role) y MEMBERSHIP por
// tienda (en user_store_memberships.role). La diferencia es crítica para
// no mezclar autorización:
//
//   ROL GLOBAL 'admin'
//     - Asignado SOLO a cuentas internas de operación/soporte de Costpro.
//     - Ve y gestiona TODAS las tiendas de TODOS los tenants (by design).
//     - Validado por store-rls-isolation.test.ts:
//         it('admin can see all stores regardless of membership')
//     - NUNCA se asigna a clientes finales (Reinaldo, Yunia, etc.).
//
//   ROL GLOBAL 'manager'
//     - NO existe como rol global operacional en el modelo actual.
//     - 'manager' es un rol de MEMBERSHIP (por tienda), no global.
//     - Si aparece como rol global en profiles, debe tratarse con cautela:
//       NO implica acceso a todas las tiendas. El acceso a una tienda
//       concreta SIEMPRE se valida con canManageStore(user, storeId),
//       que chequea membership activa en esa tienda.
//
//   ROLES DE MEMBERSHIP (por tienda): admin, manager, encargado, clerk,
//   warehouse, usuario, costo
//     - Definen qué puede hacer el usuario EN ESA TIENDA.
//     - canManageStore() valida que el usuario tenga membership activa con
//       rol admin/manager/encargado en la tienda específica.
//
// REGLA DE ORO para cualquier ruta que escriba en stores o recursos
// scoped por tienda: usar canManageStore(session.user, storeId), NO
// chequear solo session.user.role global. Ver fix FIX-AUDIT-R5 en
// archive/route.ts, restore/route.ts y bulk/route.ts.
// ─────────────────────────────────────────────────────────────────────

const ROLES_HIERARCHY: Record<UserRole, UserRole[]> = {
  admin: ['admin', 'manager', 'encargado', 'clerk', 'warehouse', 'usuario', 'costo'],
  manager: ['manager', 'encargado', 'clerk', 'warehouse', 'usuario', 'costo'],
  encargado: ['encargado', 'clerk', 'warehouse', 'usuario', 'costo'],
  clerk: ['clerk'],
  warehouse: ['warehouse'],
  usuario: ['usuario'],
  costo: ['costo'],
};

export const getAllowedRoles = (role: UserRole | undefined): UserRole[] => {
  if (!role) return [];
  return ROLES_HIERARCHY[role] || [];
};

/**
 * Checks if a user has a specific role, either globally or in any of their store memberships.
 */
export const hasRole = (user: { role: UserRole; roles?: UserRole[]; memberships?: UserStoreMembership[] } | null, targetRole: UserRole): boolean => {
  if (!user) return false;

  // 1. Direct role check
  if (user.role === targetRole) return true;

  // 2. Roles array check
  if (user.roles?.includes(targetRole)) return true;

  // 3. Memberships check
  if (user.memberships?.some(m => m.role === targetRole && m.status === 'active')) return true;

  // 4. Hierarchy check (if Admin, they have all roles)
  if (user.role === 'admin') return true;

  // 5. Encargado/Manager mapping (similar to backend)
  if (targetRole === 'manager' && (user.role === 'encargado' || user.memberships?.some(m => m.role === 'encargado' && m.status === 'active'))) return true;

  return false;
};

/**
 * Tipo canónico para el parámetro `user` de canManageStore.
 * Compatible estructuralmente con AuthenticatedSession['user'].
 */
export type StoreAccessUser = { role: UserRole; memberships?: UserStoreMembership[] };

/**
 * Checks if a user can manage a specific store.
 *
 * Esta es la función canónica para autorizar operaciones sobre una tienda
 * concreta. Debe usarse en TODAS las rutas que escriban en stores o en
 * recursos scoped por tienda (archive, restore, bulk, PATCH, DELETE, etc.).
 *
 * - admin global → true (por diseño, ve todas las tiendas)
 * - resto de roles → true solo si tiene membership activa con rol
 *   admin/manager/encargado en la tienda específica
 *
 * No confundir con hasRole() (que chequea roles globales). canManageStore
 * siempre acota por storeId, que es lo correcto para autorización por tienda.
 */
export const canManageStore = (user: StoreAccessUser | null, storeId: string): boolean => {
  if (!user) return false;
  if (user.role === 'admin') return true;

  return user.memberships?.some(m =>
    m.store_id === storeId &&
    ['encargado', 'manager', 'admin'].includes(m.role) &&
    m.status === 'active'
  ) || false;
};
