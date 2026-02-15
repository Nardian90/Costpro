
import { UserRole, UserStoreMembership } from '@/types';

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
 * Checks if a user can manage a specific store.
 */
export const canManageStore = (user: { role: UserRole; memberships?: UserStoreMembership[] } | null, storeId: string): boolean => {
  if (!user) return false;
  if (user.role === 'admin') return true;

  return user.memberships?.some(m =>
    m.store_id === storeId &&
    ['encargado', 'manager', 'admin'].includes(m.role) &&
    m.status === 'active'
  ) || false;
};
