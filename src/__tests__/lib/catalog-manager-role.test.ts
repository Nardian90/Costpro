/**
 * catalog-manager-role.test.ts — MISIÓN ENCARGADO-SERVICIOS (2026-10-17).
 *
 * Orden del negocio: los usuarios con rol GLOBAL 'encargado' pueden gestionar
 * el catálogo de tipos de servicio (crear/editar/desactivar), igual que el
 * admin global. La doctrina del catálogo GLOBAL se PRESERVA: el gate es sobre
 * profiles.role (cuenta de confianza), NUNCA sobre membresías por tienda —
 * un clerk/warehouse/manager de tienda (membership store-scoped) sigue
 * bloqueado con 403.
 */
import { describe, it, expect } from 'vitest';
import { isCatalogManager } from '@/app/api/service-types/route';
import type { AuthenticatedSession } from '@/lib/auth-middleware';

function sessionWithRole(role: string | undefined): AuthenticatedSession {
  return {
    token: 'test-token',
    user: {
      id: '00000000-0000-0000-0000-000000000000',
      email: 'qa@costpro.test',
      ...(role !== undefined ? { role: role as AuthenticatedSession['user']['role'] } : {}),
    },
  } as AuthenticatedSession;
}

describe('isCatalogManager — gate del catálogo global de tipos', () => {
  it('rol GLOBAL admin → permitido (comportamiento previo intacto)', () => {
    expect(isCatalogManager(sessionWithRole('admin'))).toBe(true);
  });

  it('rol GLOBAL encargado → permitido (orden del negocio 2026-10-17)', () => {
    expect(isCatalogManager(sessionWithRole('encargado'))).toBe(true);
  });

  it('clerk, warehouse, manager, usuario, costo (globales) → denegado', () => {
    for (const role of ['clerk', 'warehouse', 'manager', 'usuario', 'costo']) {
      expect(isCatalogManager(sessionWithRole(role))).toBe(false);
    }
  });

  it('sin rol / sesión rota → denegado (fail-closed)', () => {
    expect(isCatalogManager(sessionWithRole(undefined))).toBe(false);
    expect(isCatalogManager(undefined as unknown as AuthenticatedSession)).toBe(false);
  });
});
