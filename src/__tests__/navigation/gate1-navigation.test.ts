/**
 * GATE 1 — Tests de integridad de navegación (Fase 5).
 *
 * Valida la fuente única (navigation-definition.ts) y todas sus derivaciones:
 *   1. Sin destinos muertos (cada hoja → ViewType existente).
 *   2. Home única: dashboard; occ normaliza a dashboard.
 *   3. Guard de roles coherente con la definición (y sin cambios de permisos).
 *   4. Sidebar / Palette / Móvil derivan de la MISMA definición (sin listas paralelas).
 *   5. Breadcrumb: Inicio → dashboard, hubs navegables.
 *   6. Derivaciones consistentes entre superficies.
 *
 * Estos tests hacen imposible reintroducir los 13 destinos muertos del GATE 0
 * o una segunda home sin que la suite falle.
 */

import { describe, it, expect } from 'vitest';
import {
  NAVIGATION_SECTIONS,
  ACTION_EXTENSIONS,
  HOME_VIEW,
  HOME_ITEM,
  LEGACY_VIEW_ALIASES,
  MOBILE_MAIN_TABS,
  VALID_VIEWS,
  flattenNavigation,
  normalizeLegacyView,
} from '@/config/navigation/navigation-definition';
import {
  SIDEBAR_STRUCTURE,
  isViewAllowedForRole,
} from '@/config/navigation/sidebar.structure';
import {
  getNavigationRoute,
  isSidebarItemActive,
  getBreadcrumbForView,
} from '@/config/navigation/navigation-map';
import { SYSTEM_ACTIONS, getActionsForUser } from '@/config/actions';

// ─── 1. Integridad: cero destinos muertos ─────────────────────────────

describe('Fuente única — integridad', () => {
  const leaves = flattenNavigation();

  it('cada hoja de la definición apunta a un ViewType válido', () => {
    const dead = leaves.filter(l => !VALID_VIEWS.has(l.route?.view ?? l.id));
    expect(dead.map(l => l.id)).toEqual([]);
  });

  it('ACTION_EXTENSIONS apunta a ViewTypes válidos', () => {
    const dead = ACTION_EXTENSIONS.filter(e => !VALID_VIEWS.has(e.route.view));
    expect(dead.map(e => e.id)).toEqual([]);
  });

  it('no hay IDs duplicados entre hojas ni entre hojas y extensiones', () => {
    const ids = [...leaves.map(l => l.id), ...ACTION_EXTENSIONS.map(e => e.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('la estructura del sidebar refleja exactamente las secciones de la definición', () => {
    expect(SIDEBAR_STRUCTURE.map(g => g.id)).toEqual(NAVIGATION_SECTIONS.map(s => s.id));
    expect(SIDEBAR_STRUCTURE.map(g => g.label)).toEqual(NAVIGATION_SECTIONS.map(s => s.label));
  });

  it('las secciones son exactamente las aprobadas en el baseline', () => {
    expect(NAVIGATION_SECTIONS.map(s => s.id)).toEqual([
      'operacion', 'analisis', 'sistema', 'ayuda', 'desarrollo',
    ]);
  });
});

// ─── 2. Home única ────────────────────────────────────────────────────

describe('Home única (GATE 1 §1)', () => {
  it('HOME_VIEW es dashboard', () => {
    expect(HOME_VIEW).toBe('dashboard');
  });

  it('occ normaliza a dashboard (alias de migración obligatorio)', () => {
    expect(normalizeLegacyView('occ').view).toBe('dashboard');
    expect(LEGACY_VIEW_ALIASES['occ']).toEqual({ view: 'dashboard' });
  });

  it('ninguna hoja del menú apunta a occ', () => {
    const occRefs = flattenNavigation().filter(l => (l.route?.view ?? l.id) === 'occ');
    expect(occRefs).toEqual([]);
  });

  it('el ítem fijo Inicio apunta al dashboard', () => {
    expect(HOME_ITEM.id).toBe('dashboard');
  });

  it('los wrappers legacy no quedan como destinos de menú', () => {
    for (const wrapper of ['punto_venta', 'costos', 'tienda', 'analitica', 'administracion', 'recursos', 'otros', 'ipv_module']) {
      expect(LEGACY_VIEW_ALIASES[wrapper]).toBeDefined();
    }
  });
});

// ─── 3. Guard de roles (sin cambios de permisos) ──────────────────────

describe('Guard isViewAllowedForRole', () => {
  it('dashboard y occ siempre permitidos (home role-aware)', () => {
    expect(isViewAllowedForRole('dashboard', 'clerk')).toBe(true);
    expect(isViewAllowedForRole('occ', 'clerk')).toBe(true);
  });

  it('SISTEMA bloquea roles no admin', () => {
    for (const view of ['settings', 'users', 'roles', 'health', 'audit', 'rss_management', 'fiscal-close']) {
      expect(isViewAllowedForRole(view, 'clerk')).toBe(false);
      expect(isViewAllowedForRole(view, 'admin')).toBe(true);
    }
  });

  it('EN DESARROLLO es admin-only', () => {
    for (const view of ['ipv', 'pick3-intelligence', 'wallet']) {
      expect(isViewAllowedForRole(view, 'manager')).toBe(false);
      expect(isViewAllowedForRole(view, 'admin')).toBe(true);
    }
  });

  it('OPERACIÓN: clerk ve pos y sales-hub; warehouse no', () => {
    expect(isViewAllowedForRole('pos', 'clerk')).toBe(true);
    expect(isViewAllowedForRole('sales-hub', 'clerk')).toBe(true);
    expect(isViewAllowedForRole('pos', 'warehouse')).toBe(false);
    expect(isViewAllowedForRole('sales-hub', 'warehouse')).toBe(false);
  });

  it('Costo: encargado conserva acceso (condición §5 — sin cambio de permisos)', () => {
    for (const view of ['cost-sheets', 'estructura-costo', 'costeo-dinamico', 'production-orders']) {
      expect(isViewAllowedForRole(view, 'encargado')).toBe(true);
      expect(isViewAllowedForRole(view, 'costo')).toBe(true);
    }
  });

  it('warehouse accede a Almacén y Logística', () => {
    expect(isViewAllowedForRole('inventory', 'warehouse')).toBe(true);
    expect(isViewAllowedForRole('reception_list', 'warehouse')).toBe(true);
  });

  it('AYUDA es universal (incl. rol costo)', () => {
    for (const view of ['help', 'wiki', 'academy', 'legal']) {
      expect(isViewAllowedForRole(view, 'costo')).toBe(true);
    }
  });

  it('vistas contextuales fuera del menú siguen accesibles (default-open, igual que antes)', () => {
    for (const view of ['recepcion', 'sales_catalog', 'devolutions', 'quotations', 'cash_report']) {
      expect(isViewAllowedForRole(view, 'clerk')).toBe(true);
    }
  });
});

// ─── 4. Derivaciones consistentes (sin listas paralelas) ──────────────

describe('Derivaciones — Sidebar · Palette · Móvil · Rutas', () => {
  it('cada hoja de menú tiene una acción de palette derivada con el MISMO id', () => {
    const menuIds = flattenNavigation().map(l => l.id);
    const paletteIds = SYSTEM_ACTIONS.map(a => a.id);
    for (const id of menuIds) {
      expect(paletteIds).toContain(id);
    }
    // La home (Inicio → dashboard) también es buscable en el palette
    expect(paletteIds).toContain('dashboard');
  });

  it('no existen acciones res-* (destinos muertos del palette histórico)', () => {
    const dead = SYSTEM_ACTIONS.filter(a => a.id.startsWith('res-'));
    expect(dead).toEqual([]);
  });

  it('las acciones de palette resuelven una ruta real', () => {
    for (const action of SYSTEM_ACTIONS) {
      expect(getNavigationRoute(action.route)).not.toBeNull();
    }
  });

  it('los 4 tabs móviles fijos son los aprobados y tienen mapa de estado activo', () => {
    expect(MOBILE_MAIN_TABS.map(t => t.id)).toEqual([
      'pos', 'reception_list', 'inventory', 'cash',
    ]);
    for (const tab of MOBILE_MAIN_TABS) {
      expect(tab.activeViews.length).toBeGreaterThan(0);
      expect(tab.activeViews).toContain(tab.id);
    }
  });

  it('P2-5 corregido: Trazabilidad (history) activa Inventario, NO Vender', () => {
    const vender = MOBILE_MAIN_TABS.find(t => t.id === 'pos')!;
    const inventario = MOBILE_MAIN_TABS.find(t => t.id === 'inventory')!;
    expect(vender.activeViews).not.toContain('history');
    expect(inventario.activeViews).toContain('history');
  });

  it('Gestión de Tiendas es alcanzable desde el menú (sheet Más móvil incluido)', () => {
    const menuIds = flattenNavigation().map(l => l.id);
    expect(menuIds).toContain('management-hub');
  });

  it('el estado activo del sidebar funciona para rutas directas y módulos', () => {
    expect(isSidebarItemActive('dashboard', 'dashboard', '', '')).toBe(true);
    expect(isSidebarItemActive('pos', 'pos', '', '')).toBe(true);
    expect(isSidebarItemActive('cost-analytics', 'cost-sheets', '', 'cost-analytics')).toBe(true);
    expect(isSidebarItemActive('cost-sheets', 'cost-sheets', '', 'gen-easy')).toBe(true);
    expect(isSidebarItemActive('cost-sheets', 'cost-sheets', '', 'cost-analytics')).toBe(false);
  });

  it('rutas module-route resuelven tab correcto (Tablero Dinámico, Fichas)', () => {
    expect(getNavigationRoute('cost-analytics')).toEqual({ type: 'module', view: 'cost-sheets', tab: 'cost-analytics' });
    expect(getNavigationRoute('cost-sheets')).toEqual({ type: 'module', view: 'cost-sheets', tab: 'gen-easy' });
    expect(getNavigationRoute('pos')).toEqual({ type: 'direct', view: 'pos' });
  });

  it('hub Venta: tarjetas clave resuelven ruta (devolutions/quotations publicadas)', () => {
    expect(getNavigationRoute('devolutions')).toEqual({ type: 'direct', view: 'devolutions' });
    expect(getNavigationRoute('quotations')).toEqual({ type: 'direct', view: 'quotations' });
  });
});

// ─── 5. Breadcrumb ────────────────────────────────────────────────────

describe('Breadcrumb', () => {
  it('home única: dashboard muestra solo "Inicio"', () => {
    const items = getBreadcrumbForView('dashboard');
    expect(items).toEqual([{ label: 'Inicio', isCurrent: true }]);
  });

  it('occ (por si algo aún lo llama) muestra "Inicio"', () => {
    const items = getBreadcrumbForView('occ');
    expect(items).toEqual([{ label: 'Inicio', isCurrent: true }]);
  });

  it('pos es hoja directa de OPERACIÓN con label de acción "Vender" (GATE 1.3)', () => {
    const items = getBreadcrumbForView('pos');
    expect(items.map(i => i.label)).toEqual(['OPERACIÓN', 'Vender']);
  });

  it('sales cuelga del hub Ventas con label desambiguado', () => {
    const items = getBreadcrumbForView('sales');
    expect(items.map(i => i.label)).toEqual(['OPERACIÓN', 'Ventas', 'Historial de Ventas']);
  });

  it('history (Trazabilidad) cuelga de Almacén, no de Venta', () => {
    const items = getBreadcrumbForView('history');
    expect(items.map(i => i.label)).toEqual(['OPERACIÓN', 'Almacén', 'Inventario', 'Trazabilidad (Movimientos de Stock)']);
  });

  it('cash muestra "Caja" (un solo concepto)', () => {
    const items = getBreadcrumbForView('cash');
    expect(items[items.length - 1].label).toBe('Caja');
  });

  it('sales-hub se llama "Ventas" (sin colisión con "Vender", GATE 1.3)', () => {
    const items = getBreadcrumbForView('sales-hub');
    expect(items.map(i => i.label)).toEqual(['OPERACIÓN', 'Ventas']);
  });
});

// ─── 5b. GATE 1.3 — dominio Venta: Vender (acción) + Ventas (hub) ────

describe('GATE 1.3 — Vender/Ventas', () => {
  it('la definición usa "Vender" para pos y "Ventas" para sales-hub', () => {
    const labels = Object.fromEntries(flattenNavigation().map(l => [l.id, l.label]));
    expect(labels['pos']).toBe('Vender');
    expect(labels['sales-hub']).toBe('Ventas');
    // "Terminal de Venta" ya no es label visible (queda como keyword)
    expect(Object.values(labels)).not.toContain('Terminal de Venta');
    // Ningún label de menú es exactamente "Venta" (colisión eliminada)
    expect(Object.values(labels)).not.toContain('Venta');
  });

  it('"Terminal de Venta" sigue siendo descubrible como keyword de pos', () => {
    const pos = flattenNavigation().find(l => l.id === 'pos');
    expect(pos?.keywords).toContain('terminal de venta');
    expect(pos?.keywords).toContain('pos');
  });

  it('las vistas del hub Ventas son acciones de palette (⌘K directo)', () => {
    const ids = SYSTEM_ACTIONS.map(a => a.id);
    for (const id of ['sales', 'cash', 'inventory_count', 'devolutions', 'quotations', 'accounts-payable', 'accounts-receivable']) {
      expect(ids).toContain(id);
    }
  });

  it('buscar "caja" resuelve UNA acción Caja (no POS ni hub)', () => {
    const actions = getActionsForUser('clerk');
    const matching = actions.filter(a =>
      a.label.toLowerCase().includes('caja') || a.keywords.includes('caja')
    );
    expect(matching.map(a => a.id)).toEqual(['cash']);
  });

  it('las extensiones del hub Ventas NO aparecen en el sheet móvil (mobileHide)', () => {
    const ext = ACTION_EXTENSIONS.filter(e => e.mobileHide);
    expect(ext.map(e => e.id)).toEqual(expect.arrayContaining(['sales', 'cash', 'devolutions']));
  });

  it('los roles del dominio venta siguen intactos (clerk sí, warehouse no)', () => {
    expect(isViewAllowedForRole('pos', 'clerk')).toBe(true);
    expect(isViewAllowedForRole('sales-hub', 'clerk')).toBe(true);
    expect(isViewAllowedForRole('cash', 'clerk')).toBe(true);
    expect(isViewAllowedForRole('pos', 'warehouse')).toBe(false);
  });
});

// ─── 6. Roles de palette ──────────────────────────────────────────────

describe('Command Palette por rol', () => {
  it('clerk no ve acciones admin (users, roles, audit, ipv)', () => {
    const ids = getActionsForUser('clerk').map(a => a.id);
    for (const admin of ['users', 'roles', 'audit', 'health', 'rss_management', 'ipv', 'pick3-intelligence', 'wallet']) {
      expect(ids).not.toContain(admin);
    }
  });

  it('admin ve todo el palette', () => {
    const ids = getActionsForUser('admin').map(a => a.id);
    expect(ids).toContain('users');
    expect(ids).toContain('ipv');
    expect(ids).toContain('pos');
  });

  it('las extensiones contextuales están en el palette (calculadora, chat, nueva recepción)', () => {
    const ids = getActionsForUser('admin').map(a => a.id);
    expect(ids).toContain('calculator');
    expect(ids).toContain('chat');
    expect(ids).toContain('recepcion');
  });
});
