/**
 * CP-ORG-002 — Prueba de componente del SIDEBAR REAL (el menú lateral que
 * reportó el fallo): montado completo con rol superadmin vs roles
 * operativos.
 *
 * Evidencia de cierre del incidente: con el filtro corregido
 * (effectiveNavRole aplicado en filterModulesByRole), el sidebar del
 * SuperAdmin muestra las secciones OPERACIÓN, ANÁLISIS, SISTEMA, AYUDA y
 * EN DESARROLLO — antes del fix solo quedaban Inicio y Ayuda (los dos
 * elementos de acceso universal del catálogo).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

let mockUser: Record<string, unknown> | null = null;

vi.mock('@/store', async () => {
  const { create } = await import('zustand');
  const useAuthStore = create(() => ({
    get user() {
      return mockUser;
    },
  }));
  const useUIStore = create(() => ({
    currentView: 'dashboard',
    sidebarState: 'expanded',
    setSidebarState: () => {},
    isCalculatorOpen: false,
    setIsCalculatorOpen: () => {},
    activeCostSection: null,
    ipvActiveTab: null,
    setIpvActiveTab: () => {},
    setActiveCostSection: () => {},
    setCurrentView: () => {},
  }));
  return { useAuthStore, useUIStore };
});

vi.mock('@/hooks/ui/useMobile', () => ({
  // jsdom no implementa window.matchMedia — sidebar desktop para el test.
  useIsMobile: () => false,
}));

import Sidebar from '@/components/views/terminal/Sidebar';

const noop = () => {};
const mountSidebar = () =>
  render(
    <Sidebar
      onViewChange={noop}
      onLogout={noop}
      onClose={noop}
      onPrefetchView={noop}
    />,
  );

describe('CP-ORG-002 — Sidebar real: navegación completa del SuperAdmin', () => {
  beforeEach(() => {
    mockUser = null;
  });
  afterEach(() => {
    cleanup();
  });

  it('REPRODUCCIÓN/CIERRE: SuperAdmin ve TODAS las secciones (antes: Inicio y Ayuda)', () => {
    // Escenario exacto de producción: cuenta de plataforma SIN membresías
    // de tienda (CP-ORG-001 §6) con tienda activa seleccionada.
    mockUser = {
      id: 'platform-account',
      role: 'superadmin',
      roles: ['superadmin'],
      activeStoreId: 'store-enervida',
      memberships: [],
    };
    mountSidebar();

    // Ítem fijo + las 5 secciones del catálogo canónico.
    expect(screen.getByText('Inicio')).toBeTruthy();
    expect(screen.getByText('OPERACIÓN')).toBeTruthy();
    expect(screen.getByText('ANÁLISIS')).toBeTruthy();
    expect(screen.getByText('SISTEMA')).toBeTruthy();
    expect(screen.getByText('AYUDA')).toBeTruthy();
    expect(screen.getByText('EN DESARROLLO')).toBeTruthy();
  });

  it('SuperAdmin sin membresías y sin tienda activa: el menú sigue completo', () => {
    // active_store_id NULL es válido para la cuenta de plataforma (trigger
    // 20261026170000). La navegación NO puede depender de la selección de
    // tienda ni de membresías individuales.
    mockUser = {
      id: 'platform-account',
      role: 'superadmin',
      roles: ['superadmin'],
      activeStoreId: '',
      memberships: [],
    };
    mountSidebar();

    expect(screen.getByText('OPERACIÓN')).toBeTruthy();
    expect(screen.getByText('SISTEMA')).toBeTruthy();
    expect(screen.getByText('AYUDA')).toBeTruthy();
  });

  it('Regresión admin: mismo menú que SuperAdmin (nivel administrativo)', () => {
    mockUser = { id: 'u-admin', role: 'admin', roles: ['admin'], memberships: [] };
    mountSidebar();

    expect(screen.getByText('OPERACIÓN')).toBeTruthy();
    expect(screen.getByText('SISTEMA')).toBeTruthy();
    expect(screen.getByText('EN DESARROLLO')).toBeTruthy();
  });

  it('Regresión operativa: clerk NO ve SISTEMA ni EN DESARROLLO', () => {
    mockUser = {
      id: 'u-clerk',
      role: 'clerk',
      roles: ['clerk'],
      memberships: [{ store_id: 's1', role: 'clerk', status: 'active' }],
    };
    const { container } = mountSidebar();

    expect(screen.getByText('OPERACIÓN')).toBeTruthy(); // alcance operativo
    expect(container.textContent).not.toContain('SISTEMA');
    expect(container.textContent).not.toContain('EN DESARROLLO');
  });

  it('Regresión costo: solo su alcance — sin SISTEMA', () => {
    mockUser = { id: 'u-costo', role: 'costo', roles: ['costo'], memberships: [] };
    const { container } = mountSidebar();

    expect(container.textContent).not.toContain('SISTEMA');
  });

  it('cambio de tienda: el menú no cambia (wayfinding estable)', () => {
    mockUser = {
      id: 'platform-account',
      role: 'superadmin',
      roles: ['superadmin'],
      activeStoreId: 'store-enervida',
      memberships: [],
    };
    const first = mountSidebar();
    const sections = ['OPERACIÓN', 'ANÁLISIS', 'SISTEMA', 'AYUDA', 'EN DESARROLLO'];
    for (const s of sections) expect(screen.getByText(s)).toBeTruthy();
    cleanup();

    // Misma cuenta, otra tienda activa → idéntico menú.
    mockUser = {
      id: 'platform-account',
      role: 'superadmin',
      roles: ['superadmin'],
      activeStoreId: 'store-puerto-padre',
      memberships: [],
    };
    mountSidebar();
    for (const s of sections) expect(screen.getByText(s)).toBeTruthy();
  });
});
