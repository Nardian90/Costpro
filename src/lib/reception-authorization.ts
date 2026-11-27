/**
 * CP-BRA-R06 — CP-BRA-R06-FINAL-CERTIFICATION-001
 * ============================================================================
 * AUTORIZACIÓN DE RECEPCIONES — decisión expresa del propietario (vinculante):
 *
 *   CREAR:            membresía ACTIVA + rol exacto `encargado` en la tienda,
 *                     o superadministrador de plataforma. Ningún otro rol
 *                     (warehouse/almacenero, clerk/facturadora, usuario,
 *                     manager, admin de tienda o de plataforma) obtiene
 *                     creación por tener acceso a la tienda.
 *
 *   CONFIRMAR/ANULAR
 *   (y editar/eliminar borrador): el CREADOR ORIGINAL con membresía activa
 *                     en la tienda propietaria, o superadministrador.
 *
 *   SUPERADMIN:       acceso global de AUTORIZACIÓN (cualquier tienda),
 *                     sujeto a máquina de estados y guards financieros.
 *
 *   HISTÓRICOS sin creador verificable (user_id NULL o centinela
 *   00000000-0000-0000-0000-000000000000): solo superadministrador.
 *
 * La barrera autoritativa es la BD (RPC + RLS con can_create_reception /
 * can_manage_reception, migración 20261128120000). Estas helpers de servidor
 * replican la MISMA política para dar 403 accionables en la capa de rutas —
 * nunca para ampliar permisos.
 */
import type { AuthenticatedSession } from '@/lib/auth-middleware';

export type ReceptionMembership = {
  store_id: string;
  role: string;
  status: string;
};

/** Creador histórico no verificable (centinela de register_reception legacy). */
export const NULL_CREATOR_SENTINEL = '00000000-0000-0000-0000-000000000000';

export function isPlatformSuperadmin(role: string | null | undefined): boolean {
  return role === 'superadmin';
}

/**
 * CREACIÓN — encargado con membresía activa en la tienda, o superadmin.
 * NOTA: NO usa hasStoreAccess genérico: tener acceso a la tienda con otro rol
 * NO concede permiso para crear recepciones (decisión §0.1 del propietario).
 */
export function sessionCanCreateReception(
  session: Pick<AuthenticatedSession, 'user'>,
  storeId: string,
): boolean {
  if (isPlatformSuperadmin(session.user.role)) return true;
  const memberships = (session.user.memberships ?? []) as ReceptionMembership[];
  return memberships.some(
    (m) => m.store_id === storeId && m.role === 'encargado' && m.status === 'active',
  );
}

/**
 * CONFIRMACIÓN/ANULACIÓN/EDICIÓN — creador original con membresía activa, o
 * superadmin global. Sin nueva exigencia de rol encargado sobre recepción
 * propia (§0.2: la autorización de confirmar/anular es independiente del
 * permiso de creación).
 */
export function sessionCanManageReception(
  session: Pick<AuthenticatedSession, 'user'>,
  receipt: { user_id?: string | null; store_id: string },
): boolean {
  if (isPlatformSuperadmin(session.user.role)) return true;
  const creator = receipt.user_id ?? null;
  if (!creator || creator === NULL_CREATOR_SENTINEL) return false;
  if (creator !== session.user.id) return false;
  const memberships = (session.user.memberships ?? []) as ReceptionMembership[];
  return memberships.some((m) => m.store_id === receipt.store_id && m.status === 'active');
}
