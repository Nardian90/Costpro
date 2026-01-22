import { UserRole } from '../types';

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
  storeId: string;
  activeStoreId: string;
  maxStoresLimit: number;
  maxUsersLimit: number;
  createdBy: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Fábrica para crear objetos UserContract con valores predeterminados seguros.
 */
export const UserFactory = {
  create: (initialValues?: Partial<UserContract>): UserContract => ({
    id: '',
    email: '',
    fullName: 'Usuario Anónimo',
    role: 'usuario',
    roles: [],
    storeId: '',
    activeStoreId: '',
    maxStoresLimit: 1,
    maxUsersLimit: 1,
    createdBy: '',
    isActive: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...initialValues,
  }),
};
