/**
 * @file Contrato de datos estricto para Tiendas (Store).
 * @description Define la estructura de datos que el frontend DEBE esperar
 * para una tienda completa, junto con fábricas para crear
 * instancias con valores por defecto y un mapper que convierte
 * el tipo raw `Store` (con campos opcionales) a `StoreContract`
 * (con valores garantizados).
 *
 * Este archivo sigue el mismo patrón que `src/contracts/oferta.ts`.
 */

import type { Store, StoreTemplate } from '@/types';

// ============================================
// StoreContract — contrato estricto sin opcionales
// ============================================

export interface StoreContract {
  id: string;
  name: string;
  address: string;           // NOT optional — factory provides ''
  phone: string;             // NOT optional — factory provides ''
  email: string;
  logo_url: string;
  reeup: string;
  nit: string;
  bank_account: string;
  signature_url: string;
  stamp_url: string;
  latitude: number | null;   // null for "not set"
  longitude: number | null;
  is_active: boolean;
  slug: string;
  plantilla: StoreTemplate | null;
  created_at: string;
}

// ============================================
// StoreFactory — fábrica con valores por defecto
// ============================================

export const StoreFactory = {
  /**
   * Crea una tienda completa con valores por defecto seguros.
   */
  create: (initialValues?: Partial<StoreContract>): StoreContract => ({
    id: '',
    name: '',
    address: '',
    phone: '',
    email: '',
    logo_url: '',
    reeup: '',
    nit: '',
    bank_account: '',
    signature_url: '',
    stamp_url: '',
    latitude: null,
    longitude: null,
    is_active: true,
    slug: '',
    plantilla: 'construccion',
    created_at: new Date().toISOString(),
    ...initialValues,
  }),
};

// ============================================
// mapStoreToContract — convierte Store → StoreContract
// ============================================

/**
 * Convierte el tipo raw `Store` (con campos opcionales) a `StoreContract`
 * (con valores garantizados). Los campos opcionales reciben un valor
 * por defecto sensible (cadena vacía, null, o true).
 */
export function mapStoreToContract(store: Store): StoreContract {
  return StoreFactory.create({
    id: store.id,
    name: store.name,
    address: store.address ?? '',
    phone: store.phone ?? '',
    email: store.email ?? '',
    logo_url: store.logo_url ?? '',
    reeup: store.reeup ?? '',
    nit: store.nit ?? '',
    bank_account: store.bank_account ?? '',
    signature_url: store.signature_url ?? '',
    stamp_url: store.stamp_url ?? '',
    latitude: store.latitude ?? null,
    longitude: store.longitude ?? null,
    is_active: store.is_active ?? true,
    slug: store.slug ?? '',
    plantilla: store.plantilla ?? null,
    created_at: store.created_at ?? new Date().toISOString(),
  });
}

// ============================================
// UserStoreMembershipContract — contrato de membresía
// ============================================

export interface UserStoreMembershipContract {
  user_id: string;
  store_id: string;
  role: string;
  status: 'active' | 'revoked';
  store?: StoreContract;
}

export const UserStoreMembershipFactory = {
  /**
   * Crea una membresía de usuario-tienda con valores por defecto.
   */
  create: (initialValues?: Partial<UserStoreMembershipContract>): UserStoreMembershipContract => ({
    user_id: '',
    store_id: '',
    role: '',
    status: 'active',
    ...initialValues,
  }),
};
