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

// ───────────────────────────────────────────────────────────────────────
// GATE 1.4R — Remediación UX/IA · Fichas de Costo
// (Arena FC P0, modos/acciones/herramientas en palette, breadcrumb de
//  tabs técnicas, rename "Análisis de Fichas")
// ───────────────────────────────────────────────────────────────────────

describe('GATE 1.4R — Palette del dominio Costo', () => {
  it('Arena FC es una acción de palette con ruta module-route a SU tab', () => {
    const ids = getActionsForUser('admin').map(a => a.id);
    expect(ids).toContain('arena-fc');
    // No aterriza en el default del módulo (falsa pista prohibida §12)
    expect(getNavigationRoute('arena-fc')).toEqual({ type: 'module', view: 'cost-sheets', tab: 'arena-fc' });
  });

  it('modos, herramientas y acciones del editor están en palette (UX-003/UX-008)', () => {
    const ids = getActionsForUser('admin').map(a => a.id);
    for (const id of ['view-assisted', 'view-reading', 'templates', 'massive-gen', 'steel-calculator', 'tool-save', 'tool-import', 'tool-export-excel', 'tool-export-pdf']) {
      expect(ids).toContain(id);
    }
  });

  it('las acciones tool-* resuelven su tab (el puente existente ejecuta la acción)', () => {
    expect(getNavigationRoute('tool-import')).toEqual({ type: 'module', view: 'cost-sheets', tab: 'tool-import' });
    expect(getNavigationRoute('tool-save')).toEqual({ type: 'module', view: 'cost-sheets', tab: 'tool-save' });
    expect(getNavigationRoute('tool-export-excel')).toEqual({ type: 'module', view: 'cost-sheets', tab: 'tool-export-excel' });
    expect(getNavigationRoute('tool-export-pdf')).toEqual({ type: 'module', view: 'cost-sheets', tab: 'tool-export-pdf' });
  });

  it('las nuevas herramientas resuelven ruta module-route (massive-gen, steel-calculator)', () => {
    expect(getNavigationRoute('massive-gen')).toEqual({ type: 'module', view: 'cost-sheets', tab: 'massive-gen' });
    expect(getNavigationRoute('steel-calculator')).toEqual({ type: 'module', view: 'cost-sheets', tab: 'steel-calculator' });
  });

  it('"generar" NO duplica entradas: solo el módulo cubre la generación principal (§8)', () => {
    const actions = getActionsForUser('admin');
    const genHits = actions.filter(a =>
      a.label.toLowerCase().includes('generar ficha') || a.keywords.includes('generar')
    );
    expect(genHits.map(a => a.id)).toEqual(['cost-sheets']);
  });

  it('las extensiones de Costo usan roles del dominio (clerk no las ve)', () => {
    const clerkIds = getActionsForUser('clerk').map(a => a.id);
    expect(clerkIds).not.toContain('arena-fc');
    expect(clerkIds).not.toContain('tool-import');
    const encargadoIds = getActionsForUser('encargado').map(a => a.id);
    expect(encargadoIds).toContain('arena-fc');
  });

  it('las nuevas extensiones NO aparecen en el sheet móvil (mobileHide — módulo ya es alcanzable)', () => {
    const ext = ACTION_EXTENSIONS.filter(e => e.mobileHide);
    expect(ext.map(e => e.id)).toEqual(expect.arrayContaining(['arena-fc', 'view-assisted', 'templates']));
  });

  it('el test "caja" del GATE 1.3 sigue resolviendo UNA sola acción (sin contaminar keywords)', () => {
    const actions = getActionsForUser('clerk');
    const matching = actions.filter(a =>
      a.label.toLowerCase().includes('caja') || a.keywords.includes('caja')
    );
    expect(matching.map(a => a.id)).toEqual(['cash']);
  });
});

describe('GATE 1.4R — Breadcrumb de tabs técnicas (UX-002 en la fuente)', () => {
  const MODULE_PATH = ['OPERACIÓN', 'Costo', 'Fichas de Costo']; // el componente antepone Home

  it('arena-fc: path del módulo + leaf "Arena FC" (sin "Módulo No Disponible")', () => {
    const items = getBreadcrumbForView('cost-sheets', '', 'arena-fc');
    expect(items.map(i => i.label)).toEqual([...MODULE_PATH, 'Arena FC']);
    expect(items.some(i => i.label === 'Módulo No Disponible')).toBe(false);
  });

  it('editor (main): leaf "Editor de Ficha"', () => {
    const items = getBreadcrumbForView('cost-sheets', '', 'main');
    expect(items.map(i => i.label)).toEqual([...MODULE_PATH, 'Editor de Ficha']);
  });

  it('plantillas, masiva y estructural: leaf con label del registro', () => {
    expect(getBreadcrumbForView('cost-sheets', '', 'templates').map(i => i.label)).toEqual([...MODULE_PATH, 'Plantillas de Fichas']);
    expect(getBreadcrumbForView('cost-sheets', '', 'massive-gen').map(i => i.label)).toEqual([...MODULE_PATH, 'Generación Masiva']);
    expect(getBreadcrumbForView('cost-sheets', '', 'steel-calculator').map(i => i.label)).toEqual([...MODULE_PATH, 'Calculadora Estructural']);
  });

  it('modos (view-assisted / view-reading): breadcrumb del modo, no vista falsa', () => {
    expect(getBreadcrumbForView('cost-sheets', '', 'view-assisted').map(i => i.label)).toEqual([...MODULE_PATH, 'Abrir Modo Asistido']);
    expect(getBreadcrumbForView('cost-sheets', '', 'view-reading').map(i => i.label)).toEqual([...MODULE_PATH, 'Informe de la Ficha']);
  });

  it('cost-analytics sigue resolviendo como hoja de menú de ANÁLISIS', () => {
    const items = getBreadcrumbForView('cost-sheets', '', 'cost-analytics');
    expect(items.map(i => i.label)).toEqual(['ANÁLISIS', 'Análisis de Fichas']);
  });

  it('secciones internas sin registro conservan leaf "Fichas de Costo" (comportamiento previo)', () => {
    const items = getBreadcrumbForView('cost-sheets', '', 'all-annexes');
    expect(items.map(i => i.label)).toEqual([...MODULE_PATH]);
  });

  it('ninguna tab conocida produce "Módulo No Disponible"', () => {
    for (const tab of ['gen-easy', 'main', 'templates', 'arena-fc', 'view-assisted', 'view-reading', 'tool-save', 'tool-import', 'tool-export-excel', 'tool-export-pdf', 'massive-gen', 'steel-calculator']) {
      const items = getBreadcrumbForView('cost-sheets', '', tab);
      expect(items.some(i => i.label === 'Módulo No Disponible')).toBe(false);
    }
  });
});

describe('GATE 1.4R — Semántica del nombre (§7)', () => {
  it('el label de cost-analytics es "Análisis de Fichas" (no Tablero Dinámico)', () => {
    const leaf = flattenNavigation().find(l => l.id === 'cost-analytics');
    expect(leaf?.label).toBe('Análisis de Fichas');
  });

  it('"Tablero Dinámico" ya no existe como label en ninguna hoja', () => {
    const legacy = flattenNavigation().filter(l => l.label === 'Tablero Dinámico');
    expect(legacy).toEqual([]);
  });

  it('"ficha" descubre el análisis desde su dominio (keyword)', () => {
    const leaf = flattenNavigation().find(l => l.id === 'cost-analytics');
    expect(leaf?.keywords).toContain('fichas');
    expect(leaf?.keywords).toContain('análisis de fichas');
  });
});

describe('GATE 1.4R — Contrato anti-duplicación', () => {
  it('Arena FC NO es hoja de menú (único camino: módulo + palette — sin duplicar navegación)', () => {
    const menuIds = flattenNavigation().map(l => l.id);
    expect(menuIds).not.toContain('arena-fc');
  });

  it('los modos y tool-* NO son hojas de menú (siguen siendo modo/acción, §9/§10)', () => {
    const menuIds = flattenNavigation().map(l => l.id);
    for (const id of ['view-assisted', 'view-reading', 'tool-save', 'tool-import', 'tool-export-excel', 'tool-export-pdf']) {
      expect(menuIds).not.toContain(id);
    }
  });

  it('los modos usan render por viewMode (no existe vista Asistido/Informe como destino de menú)', () => {
    // Guard de roles: si alguien los convirtiera en menú, esto fallaría al
    // existir como hojas. Aquí: siguen siendo tabs técnicas del módulo.
    expect(isViewAllowedForRole('view-assisted', 'encargado')).toBe(true); // default-open técnico
    expect(flattenNavigation().find(l => l.id === 'view-assisted')).toBeUndefined();
  });
});
