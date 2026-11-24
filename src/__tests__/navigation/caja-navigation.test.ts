/**
 * Contrato de navegación FINANZAS — MISIÓN CP-NAV-FINANCE-REORGANIZATION-001
 * (2026-11-25). Heredero del contrato de Ingresos/Egresos (misión 2026-10-20).
 *
 * Cubre la estructura final obligatoria del mandato: la categoría «Caja» se
 * RENOMBRA a FINANZAS y centraliza Servicios Recibidos (mudado desde
 * Logística), Cuentas por Cobrar y Cuentas por Pagar (graduadas de tarjetas
 * del hub Ventas → Opciones), conservando Caja e Ingresos/Egresos. Sin
 * segunda categoría financiera, sin duplicaciones, sin cambios de permisos.
 */
import { describe, it, expect } from 'vitest';
import {
  NAVIGATION_SECTIONS,
  MOBILE_MAIN_TABS,
  VALID_VIEWS,
  flattenNavigation,
  ACTION_EXTENSIONS,
  LEGACY_VIEW_ALIASES,
  normalizeLegacyView,
} from '@/config/navigation/navigation-definition';
import {
  getNavigationRoute,
  getBreadcrumbForView,
} from '@/config/navigation/navigation-map';
import { isViewAllowedForRole, filterModulesByRole } from '@/config/navigation/sidebar.structure';
import { SYSTEM_ACTIONS } from '@/config/actions';
import { VIEW_REGISTRY } from '@/config/viewRegistry';
import { SIDEBAR_STRUCTURE } from '@/config/navigation/sidebar.structure';

describe('MISIÓN CP-NAV-FINANCE-REORGANIZATION-001 — submenú «FINANZAS» en OPERACIÓN', () => {
  it('el submenú finanzas existe en OPERACIÓN, tras Ventas, con la estructura final obligatoria', () => {
    const operacion = NAVIGATION_SECTIONS.find(s => s.id === 'operacion');
    expect(operacion).toBeDefined();
    const ids = operacion?.children?.map(c => c.id) ?? [];
    expect(ids).toContain('finanzas');
    expect(ids.indexOf('finanzas')).toBeGreaterThan(ids.indexOf('ventas'));
    const finanzas = operacion?.children?.find(c => c.id === 'finanzas');
    expect(finanzas?.type).toBe('submenu');
    expect(finanzas?.label).toBe('FINANZAS');
    // Estructura final obligatoria (mandato §5) + accesos conservados:
    // Servicios Recibidos · Cuentas por Cobrar · Cuentas por Pagar · Caja · Ingresos/Egresos
    expect(finanzas?.children?.map(c => c.id)).toEqual([
      'received-services',
      'accounts_receivable',
      'accounts_payable',
      'cash',
      'ingresos_egresos',
    ]);
    expect(finanzas?.children?.map(c => c.label)).toEqual([
      'Servicios Recibidos',
      'Cuentas por Cobrar',
      'Cuentas por Pagar',
      'Caja',
      'Ingresos/Egresos',
    ]);
    // Ya NO existe la categoría antigua «Caja» como submenú.
    expect(ids).not.toContain('caja');
  });

  it('Logística ya NO muestra Servicios Recibidos (mudanza real, sin duplicación)', () => {
    const logistica = NAVIGATION_SECTIONS.find(s => s.id === 'operacion')
      ?.children?.find(c => c.id === 'almacen_operaciones');
    expect(logistica).toBeDefined();
    const ids = logistica?.children?.map(c => c.id) ?? [];
    expect(ids).not.toContain('received-services');
    // Conserva el resto de sus opciones actuales.
    expect(ids).toEqual(['reception_list', 'purchase-orders', 'transferencias']);
    // La vista vive UNA sola vez en todo el árbol (colgando de FINANZAS).
    expect(flattenNavigation().filter(l => l.id === 'received-services')).toHaveLength(1);
    const leaf = flattenNavigation().find(l => l.id === 'received-services');
    expect(leaf?.category).toBe('OPERACIÓN');
  });

  it('las cuentas se graduaron del hub Ventas → Opciones a FINANZAS (sin extensiones paralelas)', () => {
    // Ninguna extensión paralela (SYSTEM_ACTIONS = árbol + extensiones, sin dedup).
    for (const id of ['accounts_payable', 'accounts_receivable', 'accounts-payable', 'accounts-receivable']) {
      expect(ACTION_EXTENSIONS.filter(e => e.id === id)).toHaveLength(0);
    }
    expect(SYSTEM_ACTIONS.filter(a => a.id === 'accounts_payable')).toHaveLength(1);
    expect(SYSTEM_ACTIONS.filter(a => a.id === 'accounts_receivable')).toHaveLength(1);
    // Ventas conserva sus opciones actuales EXACTAS (sin cuentas dentro).
    const ventas = NAVIGATION_SECTIONS.find(s => s.id === 'operacion')
      ?.children?.find(c => c.id === 'ventas');
    expect(ventas?.children?.map(c => c.id)).toEqual([
      'pos', 'listado-precios', 'cash_report', 'ipv_ventas', 'sales-hub',
    ]);
  });

  it('rutas y ViewTypes intactos: mismas vistas, mismas APIs (sin segunda pantalla)', () => {
    for (const view of ['received-services', 'accounts_payable', 'accounts_receivable']) {
      expect(getNavigationRoute(view)).toEqual({ type: 'direct', view });
    }
    // Los ViewTypes siguen válidos y registrados (vías de descubrimiento).
    for (const view of ['accounts_payable', 'accounts_receivable', 'received-services']) {
      expect(VALID_VIEWS.has(view)).toBe(true);
    }
    expect(VIEW_REGISTRY.some(v => v.id === 'ingresos_egresos')).toBe(true);
    expect(VALID_VIEWS.has('finanzas')).toBe(true);
  });

  it('permisos EXACTOS preservados: cada hoja gatea como lo hacía su fuente', () => {
    // received-services: roles de la hoja mudada (admin/manager/encargado/warehouse).
    for (const role of ['admin', 'manager', 'encargado', 'warehouse']) {
      expect(isViewAllowedForRole('received-services', role)).toBe(true);
    }
    for (const role of ['clerk', 'usuario']) {
      expect(isViewAllowedForRole('received-services', role)).toBe(false);
    }
    // Cuentas: roles de la extensión histórica (admin/manager/encargado/clerk/usuario).
    for (const view of ['accounts_payable', 'accounts_receivable']) {
      for (const role of ['admin', 'manager', 'encargado', 'clerk', 'usuario']) {
        expect(isViewAllowedForRole(view, role)).toBe(true);
      }
      expect(isViewAllowedForRole(view, 'warehouse')).toBe(false);
    }
    // Accesos conservados sin cambios: cash e ingresos_egresos.
    for (const role of ['admin', 'manager', 'encargado', 'clerk']) {
      expect(isViewAllowedForRole('ingresos_egresos', role)).toBe(true);
    }
    for (const role of ['usuario', 'warehouse']) {
      expect(isViewAllowedForRole('ingresos_egresos', role)).toBe(false);
    }
    // El hub FINANZAS no declara roles propios (igual que hoy CAJA): hereda
    // el alcance de OPERACIÓN — sin ampliación ni restricción.
    const finanzas = NAVIGATION_SECTIONS.find(s => s.id === 'operacion')
      ?.children?.find(c => c.id === 'finanzas');
    expect(finanzas?.roles).toBeUndefined();
  });

  it('breadcrumb del árbol: Inicio > OPERACIÓN > FINANZAS > <vista>', () => {
    expect(getBreadcrumbForView('ingresos_egresos').map(c => c.label))
      .toEqual(['OPERACIÓN', 'FINANZAS', 'Ingresos/Egresos']);
    expect(getBreadcrumbForView('cash').map(c => c.label))
      .toEqual(['OPERACIÓN', 'FINANZAS', 'Caja']);
    expect(getBreadcrumbForView('received-services').map(c => c.label))
      .toEqual(['OPERACIÓN', 'FINANZAS', 'Servicios Recibidos']);
    expect(getBreadcrumbForView('accounts_payable').map(c => c.label))
      .toEqual(['OPERACIÓN', 'FINANZAS', 'Cuentas por Pagar']);
    expect(getBreadcrumbForView('accounts_receivable').map(c => c.label))
      .toEqual(['OPERACIÓN', 'FINANZAS', 'Cuentas por Cobrar']);
    // Ningún crumb cae en Módulo No Disponible ni cuelga del hub Ventas.
    for (const view of ['received-services', 'accounts_payable', 'accounts_receivable']) {
      const crumbs = getBreadcrumbForView(view);
      expect(crumbs.some(c => c.label === 'Módulo No Disponible')).toBe(false);
      expect(crumbs.some(c => c.label === 'Opciones')).toBe(false);
    }
  });

  it('compatibilidad de deep-links y estado persistido (alias legacy)', () => {
    // El hub renombrado: /?view=caja normaliza a FINANZAS.
    expect(LEGACY_VIEW_ALIASES['caja']).toEqual({ view: 'finanzas' });
    expect(getNavigationRoute('caja')).toEqual({ type: 'direct', view: 'finanzas' });
    // Alias kebab históricos de las cuentas → MISMA vista (snake canónico).
    expect(LEGACY_VIEW_ALIASES['accounts-payable']).toEqual({ view: 'accounts_payable' });
    expect(LEGACY_VIEW_ALIASES['accounts-receivable']).toEqual({ view: 'accounts_receivable' });
    expect(getNavigationRoute('accounts-payable')).toEqual({ type: 'direct', view: 'accounts_payable' });
    expect(getNavigationRoute('accounts-receivable')).toEqual({ type: 'direct', view: 'accounts_receivable' });
    // La normalización del store/URL (punto único) garantiza breadcrumb canónico:
    // setCurrentView('accounts-payable') aterriza en el snake antes de render.
    expect(normalizeLegacyView('accounts-payable').view).toBe('accounts_payable');
    expect(normalizeLegacyView('accounts-receivable').view).toBe('accounts_receivable');
    expect(normalizeLegacyView('caja').view).toBe('finanzas');
  });

  it('el tab móvil Caja resalta también Ingresos/Egresos (comportamiento móvil conservado)', () => {
    const tab = MOBILE_MAIN_TABS.find(t => t.id === 'cash');
    expect(tab).toBeDefined();
    expect(tab?.activeViews).toContain('ingresos_egresos');
    expect(tab?.activeViews).toContain('cash');
    // Las cuentas siguen ligadas al proceso Vender (resaltado por PROCESO,
    // sin cambio de MOBILE_MAIN_TABS — cero regresión móvil).
    const pos = MOBILE_MAIN_TABS.find(t => t.id === 'pos');
    expect(pos?.activeViews).toContain('accounts_payable');
    expect(pos?.activeViews).toContain('accounts_receivable');
  });

  it('buscar «caja» sigue resolviendo UNA acción (Gate 1 — sin contaminación)', () => {
    const actions = SYSTEM_ACTIONS.filter(a =>
      (a.label ?? '').toLowerCase().includes('caja')
      || (a.keywords ?? []).includes('caja'),
    );
    expect(actions.map(a => a.id)).toEqual(['cash']);
    // El label FINANZAS no añade ruido a la búsqueda del dominio caja.
    expect(actions.every(a => a.id !== 'finanzas')).toBe(true);
  });

  it('la palabra clave «fondo» descubre Ingresos/Egresos en el palette (contrato conservado)', () => {
    const hoja = flattenNavigation().find(l => l.id === 'ingresos_egresos');
    expect(hoja?.keywords).toContain('fondo de cambio');
    expect(hoja?.keywords).toContain('devolución del fondo');
    expect(SYSTEM_ACTIONS.some(a => a.id === 'ingresos_egresos')).toBe(true);
  });

  it('labels únicos en hojas + extensiones (sin colisión «Cuentas por Cobrar»)', () => {
    const labels = [
      ...flattenNavigation().map(l => l.label),
      ...ACTION_EXTENSIONS.map(e => e.label),
    ];
    expect(new Set(labels).size).toBe(labels.length);
    // El label canónico del mandato existe UNA vez; «Cobros por Antigüedad» desaparece.
    expect(labels.filter(l => l === 'Cuentas por Cobrar')).toHaveLength(1);
    expect(labels).not.toContain('Cobros por Antigüedad');
  });

  it('el sheet móvil expone FINANZAS con sus hojas (paridad móvil del punto central)', () => {
    const tree = filterModulesByRole(SIDEBAR_STRUCTURE, 'admin');
    const operacion = tree.find(g => g.id === 'operacion');
    const finanzas = operacion?.children?.find(c => c.id === 'finanzas');
    const sheetIds = finanzas?.children?.map(g => g.id) ?? [];
    // Las tres vistas del mandato aparecen en el sheet móvil (sin mobileHide);
    // 'cash' conserva su mobileHide (móvil = tab inferior dedicado).
    expect(sheetIds).toContain('received-services');
    expect(sheetIds).toContain('accounts_payable');
    expect(sheetIds).toContain('accounts_receivable');
    const financeNode = NAVIGATION_SECTIONS.find(s => s.id === 'operacion')
      ?.children?.find(c => c.id === 'finanzas');
    expect(financeNode?.children?.find(c => c.id === 'cash')?.mobileHide).toBe(true);
  });
});
