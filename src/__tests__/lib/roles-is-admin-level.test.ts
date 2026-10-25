/**
 * CP-ORG-001 ciclo 4 (2026-10-25) — isAdminLevel: espejo EXACTO de
 * public.is_admin() (DB). 'admin' y 'superadmin' comparten el nivel
 * administrativo de la app.
 *
 * Motivo del helper: las igualdades estrictas `role === 'admin'` dejaron al
 * SuperAdmin de plataforma sin acceso a tiendas (bug reportado por el
 * propietario: admin@demo.com veía TODO vacío porque §6 de la migración
 * 20260826120000 le retira las membresías — el rol de plataforma no lleva
 * membresías por diseño).
 */
import { describe, it, expect } from 'vitest';
import { isAdminLevel, isSuperAdmin, hasRole, canManageStore, canViewStore } from '@/lib/roles';
import type { UserRole } from '@/types';

describe('isAdminLevel — nivel administrativo de la app', () => {
  it('acepta exactamente admin y superadmin', () => {
    expect(isAdminLevel('admin')).toBe(true);
    expect(isAdminLevel('superadmin')).toBe(true);
  });

  it('rechaza el resto de roles globales', () => {
    const others: UserRole[] = ['manager', 'clerk', 'warehouse', 'encargado', 'usuario', 'costo', 'tenant_admin'];
    for (const r of others) {
      expect(isAdminLevel(r)).toBe(false);
    }
  });

  it('es null-safe (usuario sin rol / no logueado)', () => {
    expect(isAdminLevel(null)).toBe(false);
    expect(isAdminLevel(undefined)).toBe(false);
  });

  it('coincide con is_admin() de la DB: superadmin hereda TODA la capacidad admin', () => {
    // espejo del contrato de la migración 20260826120000 §2
    const superuser = { role: 'superadmin' as UserRole };
    expect(hasRole(superuser, 'admin')).toBe(true);
    expect(canManageStore(superuser, 'store-x')).toBe(true);
    expect(canViewStore(superuser, 'store-x')).toBe(true);
  });

  it('un admin ordinario NO satisface chequeos de superadmin', () => {
    const admin = { role: 'admin' as UserRole };
    expect(isSuperAdmin(admin)).toBe(false);
    expect(hasRole(admin, 'superadmin')).toBe(false);
  });
});
