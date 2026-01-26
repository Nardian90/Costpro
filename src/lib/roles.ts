
import { UserRole } from '@/types';

const ROLES_HIERARCHY: Record<UserRole, UserRole[]> = {
  admin: ['admin', 'manager', 'encargado', 'clerk', 'warehouse', 'usuario'],
  manager: ['manager', 'encargado', 'clerk', 'warehouse', 'usuario'],
  encargado: ['encargado', 'clerk', 'warehouse', 'usuario'],
  clerk: ['clerk'],
  warehouse: ['warehouse'],
  usuario: ['usuario'],
};

export const getAllowedRoles = (role: UserRole | undefined): UserRole[] => {
  if (!role) return [];
  return ROLES_HIERARCHY[role] || [];
};
