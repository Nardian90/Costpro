import { UserRole, Profile, UserStoreMembership } from '../types';

/**
 * @file Contrato de datos estricto para la entidad User.
 * @description Define la estructura de datos que el frontend DEBE esperar.
 * Elimina la ambigüedad de `null` o `undefined` para garantizar
 * un estado predecible y consistente en toda la aplicación.
 */
export interface UserContract {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  roles: UserRole[];
  /** @deprecated Use activeStoreId instead. This field is legacy from single-store era. */
  storeId: string;
  activeStoreId: string;
  maxStoresLimit: number;
  maxUsersLimit: number;
  createdBy: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  memberships: UserStoreMembership[];
  aiProvider: string;
  aiApiKey: string;
  plan: string;
}

/**
 * Fábrica para crear objetos UserContract con valores predeterminados seguros.
 */
export const UserFactory = {
  create: (initialValues?: Partial<UserContract>): UserContract => ({
    id: '',
    email: '',
    fullName: '',
    role: 'clerk',
    roles: [],
    storeId: '',
    activeStoreId: '',
    maxStoresLimit: 1,
    maxUsersLimit: 0,
    createdBy: '',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    memberships: [],
    aiProvider: 'gemini',
    aiApiKey: '',
    plan: "free",
    ...initialValues,
  }),
};

/**
 * Alias de UserFactory para cumplir con requerimientos específicos de nomenclatura.
 */
export const UserContractFactory = {
  ...UserFactory,
  createEmpty: () => UserFactory.create(),
};

/**
 * Mapeador de Profile (Supabase/SnakeCase) a UserContract (Frontend/CamelCase).
 */
export const mapProfileToContract = (p: Profile): UserContract => ({
  id: p.id,
  email: p.email,
  fullName: p.full_name,
  role: p.role,
  roles: (p.roles && p.roles.length > 0 ? p.roles : [p.role]),
  // Legacy field — kept for backward compatibility with single-store era
  storeId: p.store_id || '',
  activeStoreId: p.active_store_id || '',
  maxStoresLimit: p.max_stores_limit ?? 1,
  maxUsersLimit: p.max_users_limit ?? 1,
  createdBy: p.created_by || '',
  isActive: p.is_active,
  createdAt: p.created_at,
  updatedAt: p.updated_at || p.created_at,
  memberships: p.memberships || [],
  aiProvider: p.ai_provider || 'gemini',
  aiApiKey: p.ai_api_key || '',
  plan: p.plan || "free",
});
