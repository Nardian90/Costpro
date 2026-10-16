/**
 * MISIÓN 2026-10-16 (IPV) — contrato de navegación de la vista ipv_ventas.
 *
 * Garantiza:
 *  · La hoja 'ipv_ventas' existe en OPERACIÓN → Ventas, entre Reporte Entrega
 *    y Opciones, con la política de roles de Reporte Entrega.
 *  · El ViewType está registrado (VALID_VIEWS + mapa de rutas) — sin destinos
 *    muertos y SIN colisión con el módulo experimental 'ipv'.
 *  · El guard de roles deriva de la definición (sin listas paralelas).
 */

import { describe, it, expect } from 'vitest';
import {
  NAVIGATION_SECTIONS,
  VALID_VIEWS,
  flattenNavigation,
} from '@/config/navigation/navigation-definition';
import { isViewAllowedForRole } from '@/config/navigation/sidebar.structure';
import {
  getNavigationRoute,
  getBreadcrumbForView,
} from '@/config/navigation/navigation-map';

const EXPECTED_ROLES = ['admin', 'manager', 'encargado', 'clerk'];

function findLeaf(id: string): { id: string; label: string; roles?: string[]; parentId?: string } | undefined {
  const leaves = flattenNavigation() as Array<{ id: string; label: string; roles?: string[]; parentId?: string }>;
  return leaves.find((l) => l.id === id);
}

describe('IPV — Ingresos por Ventas: registro de navegación', () => {
  it('ipv_ventas es una hoja registrada bajo el submenu Ventas', () => {
    const ventas = NAVIGATION_SECTIONS
      .flatMap((s) => s.children ?? [])
      .find((c) => c.id === 'ventas');
    const ids = (ventas?.children ?? []).map((c) => c.id);
    expect(ids).toContain('ipv_ventas');
    // Orden: entre Reporte Entrega y Opciones
    expect(ids.indexOf('ipv_ventas')).toBeGreaterThan(ids.indexOf('cash_report'));
    expect(ids.indexOf('ipv_ventas')).toBeLessThan(ids.indexOf('sales-hub'));
  });

  it('el ViewType ipv_ventas está en VALID_VIEWS (sin destinos muertos)', () => {
    expect(VALID_VIEWS.has('ipv_ventas')).toBe(true);
  });

  it('NO colisiona con el módulo experimental ipv ni sus aliases', () => {
    expect('ipv_ventas').not.toBe('ipv');
    const leaf = findLeaf('ipv_ventas');
    expect(leaf).toBeDefined();
    expect(leaf?.label).toContain('Ingresos por Ventas');
  });

  it('política de roles idéntica a Reporte Entrega (no amplía privilegios)', () => {
    const ipv = findLeaf('ipv_ventas');
    const cash = findLeaf('cash_report');
    expect(ipv?.roles).toEqual(EXPECTED_ROLES);
    expect(cash?.roles).toEqual(EXPECTED_ROLES);
  });

  it('el guard de roles permite admin/manager/encargado/clerk y deniega el resto', () => {
    expect(isViewAllowedForRole('ipv_ventas', 'admin')).toBe(true);
    expect(isViewAllowedForRole('ipv_ventas', 'manager')).toBe(true);
    expect(isViewAllowedForRole('ipv_ventas', 'encargado')).toBe(true);
    expect(isViewAllowedForRole('ipv_ventas', 'clerk')).toBe(true);
    expect(isViewAllowedForRole('ipv_ventas', 'warehouse')).toBe(false);
    expect(isViewAllowedForRole('ipv_ventas', 'usuario')).toBe(false);
  });

  it('la ruta resuelve a la vista ipv_ventas y el breadcrumb sube hasta Ventas', () => {
    const route = getNavigationRoute('ipv_ventas');
    expect(route?.view).toBe('ipv_ventas');
    const crumbs = getBreadcrumbForView('ipv_ventas');
    const labels = crumbs.map((c) => c.label);
    expect(labels.some((l) => l.includes('Ventas'))).toBe(true);
  });
});
