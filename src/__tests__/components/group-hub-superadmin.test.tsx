/**
 * CP-ORG-002 — Pruebas de componente: tarjetas de GroupHubView por rol.
 *
 * El hub raíz (p.ej. SISTEMA) filtra sus tarjetas con el MISMO rol efectivo
 * canónico que el sidebar (effectiveNavRole). Antes del fix, el SuperAdmin
 * veía el hub VACÍO (ninguna lista roles: del catálogo incluye
 * 'superadmin') — misión Caja: mismo defecto en CashClosureView, corregido
 * con espejo del bypass server-side has_store_role_as.
 *
 * Se monta el componente real (GroupHubView) con el store simulado.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

let mockUser: Record<string, unknown> | null = null;

vi.mock('@/store', async () => {
  const { create } = await import('zustand');
  const useUIStore = create(() => ({
    setCurrentView: () => {},
    currentView: 'sistema',
  }));
  const useAuthStore = create(() => ({
    get user() {
      return mockUser;
    },
  }));
  return { useUIStore, useAuthStore };
});

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import GroupHubView from '@/components/views/terminal/views/section_hub/GroupHubView';
import {
  SIDEBAR_STRUCTURE,
  filterModulesByRole,
  isViewAllowedForRole,
} from '@/config/navigation/sidebar.structure';

const rootIdsFor = (role: string): string[] =>
  filterModulesByRole(SIDEBAR_STRUCTURE, role).map(m => m.id);

describe('CP-ORG-002 — GroupHubView: tarjetas del hub por rol efectivo', () => {
  beforeEach(() => {
    mockUser = null;
  });
  afterEach(() => {
    cleanup();
  });

  it('SuperAdmin ve TODAS las tarjetas de SISTEMA (antes: hub vacío)', () => {
    mockUser = { id: 'platform', role: 'superadmin', memberships: [] };
    render(<GroupHubView groupId={'sistema' as never} />);

    // Las 8 entradas de SISTEMA (settings, organizations, users, roles,
    // health, usage-monitoring, rss_management, fiscal-close) son admin-only
    // → con la regla canónica, el SuperAdmin las ve todas.
    for (const label of [
      'Ajustes', 'Organizaciones', 'Usuarios', 'Roles',
      'Salud', 'Monitoreo', 'Gestión RSS', 'Cierre Fiscal',
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('SuperAdmin ve exactamente las mismas tarjetas que admin', () => {
    const renderLabels = (role: string) => {
      cleanup();
      mockUser = { id: 'u', role, memberships: [] };
      const { container } = render(<GroupHubView groupId={'sistema' as never} />);
      return container.textContent;
    };

    const sa = renderLabels('superadmin');
    const ad = renderLabels('admin');
    expect(sa).toEqual(ad);
    expect(sa).toContain('Usuarios');
    expect(sa).toContain('Cierre Fiscal');
  });

  it('la protección de SISTEMA para operativos vive en el GUARD (arquitectura real)', () => {
    // Diseño pre-existente documentado: las tarjetas del hub heredan roles
    // SOLO a nivel de sección — el sidebar no muestra SISTEMA a clerk y el
    // guard isViewAllowedForRole niega la ruta directa (TerminalShell
    // redirige ANTES de renderizar el hub). El hub no re-filtra por sección:
    // el menú NO es el mecanismo de seguridad (backend/RLS manda).
    expect(isViewAllowedForRole('sistema', 'clerk')).toBe(false);
    expect(rootIdsFor('clerk')).not.toContain('sistema');
    // Y el SuperAdmin accede (regresión del incidente):
    expect(isViewAllowedForRole('sistema', 'superadmin')).toBe(true);
  });

  it('sin sesión el guard niega la vista del hub (redirección de TerminalShell)', () => {
    // TerminalShell línea ~454: isViewAllowedForRole(view, user?.role) →
    // redirect. Sin rol no hay entrada al hub por URL directa.
    expect(isViewAllowedForRole('sistema', undefined)).toBe(false);
    expect(isViewAllowedForRole('sistema', null)).toBe(false);
  });

  it('el alcance de SISTEMA no se amplía para ningún rol operativo', () => {
    for (const role of ['encargado', 'manager', 'tenant_admin', 'costo', 'warehouse', 'clerk', 'usuario']) {
      expect(isViewAllowedForRole('sistema', role)).toBe(false);
    }
    // Exactamente el nivel administrativo la ve:
    expect(isViewAllowedForRole('sistema', 'admin')).toBe(true);
    expect(isViewAllowedForRole('sistema', 'superadmin')).toBe(true);
  });
});
