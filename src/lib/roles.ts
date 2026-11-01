
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
  // Misión organizaciones (2026-10-26): 'superadmin' es el rol de PLATAFORMA
  // global (cuenta designada admin@demo.com). Hereda TODA la capacidad
  // administrativa y además ve todos los tenants (is_superadmin() en DB).
  superadmin: ['superadmin', 'admin', 'manager', 'encargado', 'clerk', 'warehouse', 'usuario', 'costo', 'tenant_admin'],
  admin: ['admin', 'manager', 'encargado', 'clerk', 'warehouse', 'usuario', 'costo'],
  manager: ['manager', 'encargado', 'clerk', 'warehouse', 'usuario', 'costo'],
  encargado: ['encargado', 'clerk', 'warehouse', 'usuario', 'costo'],
  clerk: ['clerk'],
  warehouse: ['warehouse'],
  usuario: ['usuario'],
  costo: ['costo'],
  // tenant_admin: admin auto-provisionado de SU tenant (landing). Alcance
  // operativo equivalente a encargado; el acceso transversal NO le
  // corresponde (misión FASE 3: administración solo de su empresa).
  tenant_admin: ['tenant_admin', 'manager', 'encargado', 'clerk', 'warehouse', 'usuario', 'costo'],
};

/**
 * Misión organizaciones (2026-10-26): ¿es la cuenta de plataforma global?
 * Espejo EXACTO de public.is_superadmin() en la DB — la única fuente
 * canónica del rol es profiles.role validada server-side; NUNCA una cadena
 * enviada por el cliente (FASE 3: enviar { company: "SuperAdmin" } no
 * concede nada).
 */
export const isSuperAdmin = (user: { role?: UserRole | null } | null | undefined): boolean => {
  return user?.role === 'superadmin';
};

/**
 * CP-ORG-001 ciclo 4 (2026-10-25): espejo EXACTO de public.is_admin() en la DB.
 * 'admin' y 'superadmin' comparten el NIVEL administrativo de la app.
 *
 * Motivo: las comparaciones estrictas `role === 'admin'` dejaban al SuperAdmin
 * de plataforma FUERA de la vistas/rutas administrativas (bug real reportado por
 * el propietario: el selector de tiendas y GET /api/stores devolvían vacío para
 * superadmin, que por diseño no lleva membresías de tienda — §6 de la migración
 * 20260826120000). Toda comparación de nivel administrativo DEBE usar esta
 * función o el par explícito `=== 'admin' || === 'superadmin'`, nunca la
 * igualdad estricta sola.
 */
export const isAdminLevel = (role: UserRole | null | undefined): boolean => {
  return role === 'admin' || role === 'superadmin';
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

  // 4. Hierarchy check. Misión organizaciones (2026-10-26): se consulta la
  //    JERARQUÍA real en lugar de un `return true` incondicional — 'superadmin'
  //    está POR ENCIMA de 'admin', por lo que un admin NO satisface chequeos
  //    de superadmin (antes cualquier targetRole pasaba para admin).
  if (user.role === 'admin' || user.role === 'superadmin') {
    return (ROLES_HIERARCHY[user.role] || []).includes(targetRole);
  }

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
  if (user.role === 'admin' || user.role === 'superadmin') return true;

  return user.memberships?.some(m =>
    m.store_id === storeId &&
    ['encargado', 'manager', 'admin'].includes(m.role) &&
    m.status === 'active'
  ) || false;
};

// ─────────────────────────────────────────────────────────────────────
// W9.5 B-8 — MODELO C: autorización diferenciada de anulaciones/reversiones
// ─────────────────────────────────────────────────────────────────────
// Fuente normativa DB (espejo EXACTO — no divergir):
//   - can_pos_undo_transaction(tx_id, actor)   → Nivel 1 (POS Undo)
//   - can_admin_reverse_transaction(actor, store) → Nivel 2 (Reversión admin)
// STORE ACCESS (membresía) responde "¿puede operar en la tienda?";
// OPERATION AUTHORIZATION (estas funciones + los RPC) responde
// "¿puede realizar ESTA operación?". La UI es conveniencia: la última
// barrera SIEMPRE es la DB.
// ─────────────────────────────────────────────────────────────────────

const POS_UNDO_ROLES = ['admin', 'manager', 'encargado', 'clerk'];
const ADMIN_REVERSE_ROLES = ['admin', 'manager', 'encargado'];

/**
 * MODELO C Nivel 1 — el usuario puede deshacer (POS undo) una venta en la
 * tienda indicada si es operador POS: admin global transversal, o membership
 * activa con rol admin/manager/encargado/clerk EN ESA TIENDA.
 *
 * La ventana (30s) y la propiedad (venta propia) las aplica el toast del POS
 * por construcción (solo ofrece la última venta de la sesión) y las re-valida
 * server-side void_transaction + can_pos_undo_transaction.
 */
export const canUndoSaleInStore = (user: StoreAccessUser | null, storeId: string): boolean => {
  if (!user || !storeId) return false;
  if (user.role === 'admin' || user.role === 'superadmin') return true;
  return user.memberships?.some(m =>
    m.store_id === storeId &&
    POS_UNDO_ROLES.includes(m.role) &&
    m.status === 'active'
  ) || false;
};

/**
 * MODELO C Nivel 2 — el usuario puede ejecutar la REVERSIÓN ADMINISTRATIVA de
 * una venta de la tienda indicada: admin global transversal, o membership
 * activa con rol admin/manager/encargado EN ESA TIENDA.
 *
 * clerk/warehouse/usuario/costo NO pueden (aunque sean miembros de la tienda).
 * Espejo de canManageStore acotado a la operación de reversión de ventas;
 * idéntico a la DB can_admin_reverse_transaction.
 */
// ─────────────────────────────────────────────────────────────────────
// W9.5 B-10 — Política de reversión de los 5 tipos restantes de /api/reverse
// ─────────────────────────────────────────────────────────────────────
// Fuente normativa DB (espejo EXACTO): can_reverse_document(actor, store, op).
// Rol de MEMBERSHIP en la tienda del documento; admin global transversal (*).
// Congelada en audit-evidence/20260905-w9-b10/02-policy-matrix.md.
const DOCUMENT_REVERSE_ROLES: Record<string, UserRole[]> = {
  receipt: ['admin', 'manager', 'encargado', 'warehouse'],
  transfer: ['admin', 'manager', 'encargado', 'warehouse'],
  adjustment: ['admin', 'manager', 'encargado'],
  devolution: ['admin', 'manager', 'encargado', 'clerk', 'warehouse', 'usuario', 'costo'], // membresía activa basta (simétrica a su creación)
  production_order: ['admin', 'manager', 'costo'],
};

/**
 * MODELO B-10 — el usuario puede ejecutar la reversión de un documento
 * (receipt/transfer/adjustment/devolution/production_order) de la tienda
 * indicada si es admin global transversal, o tiene membership ACTIVA con el
 * rol operativo del módulo del documento EN ESA TIENDA.
 *
 * Para transfer el rol se resuelve en la tienda ORIGEN (el botón solo existe
 * en la pestaña saliente); el acceso al destino lo re-valida el RPC.
 */
export const canReverseDocumentInStore = (
  user: StoreAccessUser | null,
  storeId: string,
  docType: keyof typeof DOCUMENT_REVERSE_ROLES | string,
): boolean => {
  if (!user || !storeId) return false;
  if (user.role === 'admin' || user.role === 'superadmin') return true;
  const roles = DOCUMENT_REVERSE_ROLES[docType];
  if (!roles) return false;
  return user.memberships?.some(m =>
    m.store_id === storeId &&
    roles.includes(m.role) &&
    m.status === 'active'
  ) || false;
};

export const canAdminReverseSaleInStore = (user: StoreAccessUser | null, storeId: string): boolean => {
  if (!user || !storeId) return false;
  if (user.role === 'admin' || user.role === 'superadmin') return true;
  return user.memberships?.some(m =>
    m.store_id === storeId &&
    ADMIN_REVERSE_ROLES.includes(m.role) &&
    m.status === 'active'
  ) || false;
};


/**
 * FIX F3-P0-02 — Autorización de LECTURA scoped por tienda.
 *
 * Semántica: el usuario puede LEER recursos de una tienda si es admin global
 * o tiene CUALQUIER membership activa en esa tienda (clerk incluido). Las
 * rutas service-role legacy (p.ej. /api/received-services) deben usar esta
 * función ANTES de ejecutar operaciones privilegiadas; el store_id enviado
 * por el cliente NUNCA se convierte en autorización por sí mismo.
 */
export const canViewStore = (user: StoreAccessUser | null, storeId: string): boolean => {
  if (!user || !storeId) return false;
  if (user.role === 'admin' || user.role === 'superadmin') return true;
  return user.memberships?.some(m =>
    m.store_id === storeId &&
    m.status === 'active'
  ) || false;
};

// ─────────────────────────────────────────────────────────────────────
// MISIÓN RESOLUCIÓN 11 (2026-10-31) — Solicitud de Materiales (SC-2-07)
// ─────────────────────────────────────────────────────────────────────
// El dato 7 del modelo («Nombre y firma del funcionario que autoriza la
// Solicitud») exige nivel de autorización: la CONFIRMACIÓN de una solicitud
// queda reservada a admin/manager/encargado (espejo del gate de reversión de
// ajustes). Crear/editar/enviar a revisión y anular permanecen abiertos a
// cualquier miembro activo de la tienda (canViewStore) — la DB revalida con
// has_store_access_as en el RPC confirm_material_request (última barrera).
const MATERIAL_REQUEST_CONFIRM_ROLES: UserRole[] = ['admin', 'manager', 'encargado'];

export const canConfirmMaterialRequestInStore = (
  user: StoreAccessUser | null,
  storeId: string,
): boolean => {
  if (!user || !storeId) return false;
  if (user.role === 'admin' || user.role === 'superadmin') return true;
  return user.memberships?.some(m =>
    m.store_id === storeId &&
    MATERIAL_REQUEST_CONFIRM_ROLES.includes(m.role) &&
    m.status === 'active'
  ) || false;
};
