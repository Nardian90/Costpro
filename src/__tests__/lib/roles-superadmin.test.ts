/**
 * MISIÓN ORGANIZACIONES (2026-10-26) — FASE 3/9: semántica del rol de
 * plataforma 'superadmin' en la capa de aplicación.
 *
 * Invariantes verificadas:
 *   · superadmin satisface TODOS los chequeos de rol (jerarquía real).
 *   · admin NO satisface chequeos de superadmin (asimetría correcta).
 *   · can* por tienda heredan la capacidad del superadmin.
 *   · isViewAllowedForRole: superadmin accede a vistas admin (SISTEMA).
 *   · userRoleSchema ya no degrada 'superadmin'/'tenant_admin' a clerk.
 */
import { describe, it, expect } from 'vitest';
import {
  hasRole,
  isSuperAdmin,
  canManageStore,
  canViewStore,
  canUndoSaleInStore,
  getAllowedRoles,
} from '@/lib/roles';
import { isViewAllowedForRole } from '@/config/navigation/sidebar.structure';
import { userRoleSchema } from '@/validation/schemas';
import type { UserRole } from '@/types';

describe('MISIÓN ORGANIZACIONES — rol de plataforma superadmin (FASE 3)', () => {
  const superadmin = { role: 'superadmin' as UserRole };
  const admin = { role: 'admin' as UserRole };
  const encargado = { role: 'encargado' as UserRole };

  it('isSuperAdmin identifica exactamente el rol de plataforma', () => {
    expect(isSuperAdmin(superadmin)).toBe(true);
    expect(isSuperAdmin(admin)).toBe(false);
    expect(isSuperAdmin(null)).toBe(false);
    expect(isSuperAdmin(undefined)).toBe(false);
    expect(isSuperAdmin({ role: undefined })).toBe(false);
  });

  it('superadmin satisface TODOS los chequeos de rol (incluido admin)', () => {
    for (const target of ['admin', 'manager', 'encargado', 'clerk', 'warehouse', 'usuario', 'costo'] as UserRole[]) {
      expect(hasRole(superadmin as any, target)).toBe(true);
    }
  });

  it('admin NO satisface chequeos de superadmin (asimetría correcta)', () => {
    expect(hasRole(admin as any, 'superadmin')).toBe(false);
    expect(hasRole(encargado as any, 'superadmin')).toBe(false);
    expect(hasRole(superadmin as any, 'superadmin')).toBe(true);
  });

  it('jerarquía can* por tienda: superadmin hereda la capacidad administrativa', () => {
    const storeId = '11111111-2222-4333-8444-555555555555';
    expect(canManageStore(superadmin as any, storeId)).toBe(true);
    expect(canViewStore(superadmin as any, storeId)).toBe(true);
    expect(canUndoSaleInStore(superadmin as any, storeId)).toBe(true);
    // sin membresía: un encargado NO gestiona tiendas ajenas
    expect(canManageStore({ role: 'encargado' } as any, storeId)).toBe(false);
  });

  it('getAllowedRoles(superadmin) incluye admin y todos los roles operativos', () => {
    const allowed = getAllowedRoles('superadmin');
    expect(allowed).toContain('admin');
    expect(allowed).toContain('manager');
    expect(allowed).toContain('clerk');
    expect(getAllowedRoles('admin')).not.toContain('superadmin');
  });

  it('isViewAllowedForRole: superadmin accede a las vistas admin de SISTEMA', () => {
    expect(isViewAllowedForRole('users', 'superadmin')).toBe(true);
    expect(isViewAllowedForRole('organizations', 'superadmin')).toBe(true);
    expect(isViewAllowedForRole('roles', 'superadmin')).toBe(true);
    expect(isViewAllowedForRole('users', 'clerk')).toBe(false);
    expect(isViewAllowedForRole('users', 'admin')).toBe(true);
  });

  it('userRoleSchema ya no degrada superadmin/tenant_admin (antes .catch(clerk))', () => {
    expect(userRoleSchema.parse('superadmin')).toBe('superadmin');
    expect(userRoleSchema.parse('tenant_admin')).toBe('tenant_admin');
    expect(userRoleSchema.parse('admin')).toBe('admin');
  });

  it('profileSchema conserva tenant_id/tenant_name tras validación (columna Empresa)', async () => {
    const { profileSchema } = await import('@/validation/schemas');
    const parsed = profileSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      full_name: 'Prueba',
      email: 'p@x.dev',
      role: 'clerk',
      is_active: true,
      created_at: new Date().toISOString(),
      tenant_id: '22222222-2222-4222-8222-222222222222',
      tenant_name: 'Empresa Prueba',
    });
    expect(parsed.tenant_id).toBe('22222222-2222-4222-8222-222222222222');
    expect(parsed.tenant_name).toBe('Empresa Prueba');
  });
});
