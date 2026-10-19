/**
 * Contrato de navegación del módulo Ingresos/Egresos de caja — MISIÓN
 * 2026-10-20. Espeja el patrón de ipv-ventas-navigation.test.ts.
 *
 * Cubre la ubicación preferida del brief: Inicio → OPERACIÓN → Caja →
 * Ingresos/Egresos, sin duplicar apartados (la vista 'cash' se GRADÚA de
 * extensión del palette a hoja del submenú «Caja», misma vista).
 */
import { describe, it, expect } from 'vitest';
import {
  NAVIGATION_SECTIONS,
  MOBILE_MAIN_TABS,
  VALID_VIEWS,
  flattenNavigation,
  ACTION_EXTENSIONS,
} from '@/config/navigation/navigation-definition';
import {
  getNavigationRoute,
  getBreadcrumbForView,
} from '@/config/navigation/navigation-map';
import { isViewAllowedForRole } from '@/config/navigation/sidebar.structure';
import { SYSTEM_ACTIONS } from '@/config/actions';
import { VIEW_REGISTRY } from '@/config/viewRegistry';

describe('MISIÓN INGRESOS/EGRESOS — submenú «Caja» en OPERACIÓN', () => {
  it('el submenú caja existe en OPERACIÓN, tras Ventas, con hijos [cash, ingresos_egresos]', () => {
    const operacion = NAVIGATION_SECTIONS.find(s => s.id === 'operacion');
    expect(operacion).toBeDefined();
    const ids = operacion?.children?.map(c => c.id) ?? [];
    // Ubicación preferida del brief: OPERACIÓN → Caja → Ingresos/Egresos.
    expect(ids).toContain('caja');
    expect(ids.indexOf('caja')).toBeGreaterThan(ids.indexOf('ventas'));
    const caja = operacion?.children?.find(c => c.id === 'caja');
    expect(caja?.type).toBe('submenu');
    expect(caja?.label).toBe('Caja');
    expect(caja?.children?.map(c => c.id)).toEqual(['cash', 'ingresos_egresos']);
    expect(caja?.children?.map(c => c.label)).toEqual(['Caja', 'Ingresos/Egresos']);
  });

  it('la hoja ingresos_egresos: nombre inequívoco, icono coherente, roles espejo del backend', () => {
    const hoja = flattenNavigation().find(l => l.id === 'ingresos_egresos');
    expect(hoja).toBeDefined();
    expect(hoja?.label).toBe('Ingresos/Egresos');
    expect(hoja?.icon).toBeDefined();
    // Permisos: admin/manager/encargado/clerk (registrar en el RPC exige
    // esos roles con membresía) — 'usuario' y 'warehouse' NO la ven.
    for (const role of ['admin', 'manager', 'encargado', 'clerk']) {
      expect(isViewAllowedForRole('ingresos_egresos', role)).toBe(true);
    }
    for (const role of ['usuario', 'warehouse']) {
      expect(isViewAllowedForRole('ingresos_egresos', role)).toBe(false);
    }
  });

  it('la vista cash sigue siendo ÚNICA (graduada al árbol, sin duplicar palette)', () => {
    // Ninguna extensión paralela con id 'cash' (SYSTEM_ACTIONS = árbol + ext).
    expect(ACTION_EXTENSIONS.filter(e => e.id === 'cash')).toHaveLength(0);
    expect(SYSTEM_ACTIONS.filter(a => a.id === 'cash')).toHaveLength(1);
    // La acción derivada conserva label/roles de la extensión histórica.
    const cashAction = SYSTEM_ACTIONS.find(a => a.id === 'cash');
    expect(cashAction?.label).toBe('Caja');
    expect(cashAction?.roles).toContain('usuario');
  });

  it('ruta directa, breadcrumb del árbol y registro de vistas', () => {
    expect(getNavigationRoute('ingresos_egresos')).toEqual({ type: 'direct', view: 'ingresos_egresos' });
    // El breadcrumb del nuevo ítem sale del árbol (fuente única).
    const crumbs = getBreadcrumbForView('ingresos_egresos');
    expect(crumbs.map(c => c.label)).toEqual(['OPERACIÓN', 'Caja', 'Ingresos/Egresos']);
    // La vista 'cash' cuelga ahora del submenú Caja (retiro del VIEW_TO_HUB_MAP).
    const cashCrumbs = getBreadcrumbForView('cash');
    expect(cashCrumbs.map(c => c.label)).toEqual(['OPERACIÓN', 'Caja', 'Caja']);
    // ViewTypes válidos + registry (vías de descubrimiento).
    expect(VALID_VIEWS.has('ingresos_egresos')).toBe(true);
    expect(VALID_VIEWS.has('caja')).toBe(true);
    expect(VIEW_REGISTRY.some(v => v.id === 'ingresos_egresos')).toBe(true);
  });

  it('el tab móvil Caja resalta también Ingresos/Egresos (mismo dominio)', () => {
    const tab = MOBILE_MAIN_TABS.find(t => t.id === 'cash');
    expect(tab).toBeDefined();
    expect(tab?.activeViews).toContain('ingresos_egresos');
    expect(tab?.activeViews).toContain('cash');
  });

  it('buscar «caja» sigue resolviendo UNA acción (Gate 1 — sin contaminación)', () => {
    const actions = SYSTEM_ACTIONS.filter(a =>
      (a.label ?? '').toLowerCase().includes('caja')
      || (a.keywords ?? []).includes('caja'),
    );
    expect(actions.map(a => a.id)).toEqual(['cash']);
  });

  it('la palabra clave «fondo» descubre la nueva vista en el palette', () => {
    const hoja = flattenNavigation().find(l => l.id === 'ingresos_egresos');
    expect(hoja?.keywords).toContain('fondo de cambio');
    expect(hoja?.keywords).toContain('devolución del fondo');
    // La acción derivada del árbol existe para los roles autorizados.
    expect(SYSTEM_ACTIONS.some(a => a.id === 'ingresos_egresos')).toBe(true);
  });
});
