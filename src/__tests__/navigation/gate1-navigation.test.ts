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
  COST_SHEETS_TABS,
  HOME_VIEW,
  HOME_ITEM,
  LEGACY_VIEW_ALIASES,
  MOBILE_MAIN_TABS,
  TECHNICAL_VIEW_IDS,
  VALID_VIEWS,
  flattenNavigation,
  normalizeLegacyView,
} from '@/config/navigation/navigation-definition';
import {
  SIDEBAR_STRUCTURE,
  isViewAllowedForRole,
} from '@/config/navigation/sidebar.structure';
import NAVIGATION_MAP, {
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
    // GATE 1.4R.1 (mandato §4): el clic en el menú abre el NÚCLEO DE TRABAJO
    // (Experto), no "Generar Fácil".
    expect(getNavigationRoute('cost-sheets')).toEqual({ type: 'module', view: 'cost-sheets', tab: 'main' });
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

  it('editor (main): leaf "Experto" (GATE 1.4R.1 — ex "Tablero Principal")', () => {
    const items = getBreadcrumbForView('cost-sheets', '', 'main');
    expect(items.map(i => i.label)).toEqual([...MODULE_PATH, 'Experto']);
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

// ───────────────────────────────────────────────────────────────────────
// GATE 1.4R.1 — Reconstrucción integral · Experto / Generación Masiva /
// palette VIEW+ACTION / segunda navegación
// ───────────────────────────────────────────────────────────────────────

describe('GATE 1.4R.1 — Experto (recuperación del Tablero Principal)', () => {
  it('el tab main existe en el registro con label "Experto" y es palette-descubrible', () => {
    const main = COST_SHEETS_TABS.find(t => t.id === 'main');
    expect(main).toBeDefined();
    expect(main?.label).toBe('Experto');
    expect(main?.palette).toBe(true);
    expect(main?.keywords).toContain('experto');
    expect(main?.keywords).toContain('tablero principal');
  });

  it('"experto" en palette apunta al tab main (module-route correcto)', () => {
    const actions = getActionsForUser('admin');
    const expertHits = actions.filter(a =>
      a.id === 'main' || a.label.toLowerCase() === 'experto' || a.keywords.includes('experto')
    );
    expect(expertHits.map(a => a.id)).toContain('main');
    expect(getNavigationRoute('main')).toEqual({ type: 'module', view: 'cost-sheets', tab: 'main' });
  });

  it('el alias técnico cost-sheet-editor sigue resolviendo a main (deep-link legacy)', () => {
    expect(getNavigationRoute('cost-sheet-editor')).toEqual({ type: 'module', view: 'cost-sheets', tab: 'main' });
  });
});

describe('GATE 1.4R.1 — Generación Masiva (rename §10)', () => {
  it('no existe "Generación Experta" como label en palette/registro', () => {
    const allLabels = [
      ...flattenNavigation().map(l => l.label),
      ...ACTION_EXTENSIONS.map(e => e.label),
      ...COST_SHEETS_TABS.map(t => t.label),
    ];
    expect(allLabels.filter(l => l.toLowerCase().includes('generación experta'))).toEqual([]);
  });

  it('massive-gen sigue etiquetado "Generación Masiva" y resuelve su tab', () => {
    const mg = COST_SHEETS_TABS.find(t => t.id === 'massive-gen');
    expect(mg?.label).toBe('Generación Masiva');
    expect(getNavigationRoute('massive-gen')).toEqual({ type: 'module', view: 'cost-sheets', tab: 'massive-gen' });
  });
});

describe('GATE 1.4R.1 — Palette semántica (§17)', () => {
  it('las consultas del mandato tienen candidato correcto (sin resultados falsos)', () => {
    const actions = getActionsForUser('admin');
    const byKeyword = (kw: string) =>
      actions.filter(a => a.label.toLowerCase().includes(kw) || a.keywords.some(k => k.includes(kw)));

    // C2-C (FASE C): semántica separada — "guardar ficha" = persistencia real
    // (tool-save-cloud); la descarga JSON es "exportar json" (tool-save).
    expect(byKeyword('guardar ficha').map(a => a.id)).toContain('tool-save-cloud');
    expect(byKeyword('exportar json').map(a => a.id)).toContain('tool-save');
    expect(byKeyword('importar json').map(a => a.id)).toContain('tool-import');
    expect(byKeyword('exportar excel').map(a => a.id)).toContain('tool-export-excel');
    expect(byKeyword('exportar pdf').map(a => a.id)).toContain('tool-export-pdf');
    expect(byKeyword('asistido').map(a => a.id)).toContain('view-assisted');
    expect(byKeyword('informe').map(a => a.id)).toContain('view-reading');
    expect(byKeyword('arena').map(a => a.id)).toContain('arena-fc');
    expect(byKeyword('generación masiva').map(a => a.id)).toContain('massive-gen');
    expect(byKeyword('experto').map(a => a.id)).toContain('main');
  });
});

describe('GATE 1.4R.1 — Breadcrumbs del segundo nivel (§23)', () => {
  const MODULE_PATH = ['OPERACIÓN', 'Costo', 'Fichas de Costo'];

  it('Fichas de Costo → Experto', () => {
    expect(getBreadcrumbForView('cost-sheets', '', 'main').map(i => i.label)).toEqual([...MODULE_PATH, 'Experto']);
  });

  it('Fichas de Costo → Generación Masiva', () => {
    expect(getBreadcrumbForView('cost-sheets', '', 'massive-gen').map(i => i.label)).toEqual([...MODULE_PATH, 'Generación Masiva']);
  });

  it('Fichas de Costo → Análisis de Fichas', () => {
    expect(getBreadcrumbForView('cost-sheets', '', 'cost-analytics').map(i => i.label)).toEqual(['ANÁLISIS', 'Análisis de Fichas']);
  });

  it('Fichas de Costo → Arena FC', () => {
    expect(getBreadcrumbForView('cost-sheets', '', 'arena-fc').map(i => i.label)).toEqual([...MODULE_PATH, 'Arena FC']);
  });
});

describe('GATE 1.4R.1 — Mapeo de segundo nivel compartido (módulo ↔ móvil)', () => {
  it('moduleTabForCostSection agrupa el scope de ficha bajo Experto', async () => {
    const { moduleTabForCostSection } = await import('@/components/views/terminal/views/cost_sheet/CostSheetModuleNav');
    expect(moduleTabForCostSection('main')).toBe('main');
    expect(moduleTabForCostSection('templates')).toBe('main');
    expect(moduleTabForCostSection('header')).toBe('main');
    expect(moduleTabForCostSection('all-annexes')).toBe('main');
    expect(moduleTabForCostSection('annex-I')).toBe('main');
    expect(moduleTabForCostSection('view-assisted')).toBe('main');
    expect(moduleTabForCostSection('gen-easy')).toBe('gen-easy');
    expect(moduleTabForCostSection('massive-gen')).toBe('massive-gen');
    expect(moduleTabForCostSection('cost-analytics')).toBe('cost-analytics');
    expect(moduleTabForCostSection('arena-fc')).toBe('arena-fc');
    expect(moduleTabForCostSection('steel-calculator')).toBe('steel-calculator');
  });
});

// ───────────────────────────────────────────────────────────────────────
// FASE B — Semántica global y navegación transversal (post GATE 1.4P)
// Tablón → ANÁLISIS (global/transversal) · Ofertas/Clientes → dominio
// Ventas (patrón hub) · Conciliación fuera de navegación con breadcrumb
// honesto · palette sin pistas falsas.
// ───────────────────────────────────────────────────────────────────────

describe('FASE B — Tablón de Noticias (UX-005: GLOBAL/TRANSVERSAL)', () => {
  it('news es hoja de la sección ANÁLISIS (fuera de Gestión de Tiendas)', () => {
    const leaf = flattenNavigation().find(l => l.id === 'news');
    expect(leaf).toBeDefined();
    expect(leaf?.category).toBe('ANÁLISIS');
    expect(leaf?.label).toBe('Tablón de Noticias');
  });

  it('breadcrumb de news se deriva del árbol (sin hub antiguo ni módulo falso)', () => {
    const items = getBreadcrumbForView('news');
    expect(items.map(i => i.label)).toEqual(['ANÁLISIS', 'Tablón de Noticias']);
    expect(items.some(i => i.label === 'Módulo No Disponible')).toBe(false);
  });

  it('news ya no está en el mapa de hubs contextuales (fuente única: árbol)', () => {
    // El mapa es SOLO para vistas contextuales; news es hoja de menú.
    expect(NAVIGATION_MAP['news']).toEqual({ type: 'direct', view: 'news' });
  });

  it('news ya no es vista técnica (TECHNICAL_VIEW_IDS)', () => {
    expect(TECHNICAL_VIEW_IDS).not.toContain('news');
  });

  it('el hub management-hub ya no captura la búsqueda "tablón" (pista retirada)', () => {
    const hub = flattenNavigation().find(l => l.id === 'management-hub');
    expect(hub?.keywords).not.toContain('tablón');
    expect(hub?.description).not.toContain('Tablón');
  });

  it('deep-link universal preservado: roles del tab histórico (incl. operativos)', () => {
    for (const role of ['admin', 'manager', 'encargado', 'clerk', 'usuario', 'warehouse']) {
      expect(isViewAllowedForRole('news', role)).toBe(true);
    }
    // La hoja conserva los roles históricos del tab (GATE 1.4P §3).
    const leaf = flattenNavigation().find(l => l.id === 'news');
    expect(leaf?.roles).toEqual(['admin', 'manager', 'encargado', 'clerk', 'usuario', 'warehouse']);
  });

  it('el Tablón es buscable en palette para roles de gestión y operativos', () => {
    for (const role of ['admin', 'encargado', 'clerk']) {
      const ids = getActionsForUser(role).map(a => a.id);
      expect(ids).toContain('news');
    }
  });

  it('news es única en el menú (sin duplicación de navegación)', () => {
    const menuIds = flattenNavigation().map(l => l.id);
    expect(menuIds.filter(id => id === 'news')).toHaveLength(1);
    const extIds = ACTION_EXTENSIONS.map(e => e.id);
    expect(extIds).not.toContain('news');
  });
});

describe('FASE B — Ofertas en el dominio Ventas (patrón hub, sin duplicar)', () => {
  it('la acción de palette existe y resuelve la vista directa ofertas', () => {
    const ids = getActionsForUser('admin').map(a => a.id);
    expect(ids).toContain('ofertas');
    expect(getNavigationRoute('ofertas')).toEqual({ type: 'direct', view: 'ofertas' });
  });

  it('breadcrumb: OPERACIÓN > Ventas > Ofertas (sin Módulo No Disponible)', () => {
    const items = getBreadcrumbForView('ofertas');
    expect(items.map(i => i.label)).toEqual(['OPERACIÓN', 'Ventas', 'Ofertas']);
    expect(items.some(i => i.label === 'Módulo No Disponible')).toBe(false);
  });

  it('Ofertas NO es hoja de sidebar (patrón Ventas: hub + palette)', () => {
    const menuIds = flattenNavigation().map(l => l.id);
    expect(menuIds).not.toContain('ofertas');
  });

  it('móvil: ofertas sigue marcando el tab Vender como activo', () => {
    const vender = MOBILE_MAIN_TABS.find(t => t.id === 'pos')!;
    expect(vender.activeViews).toContain('ofertas');
  });

  it('Cotizaciones no fue absorbida (coexisten, semánticas distintas)', () => {
    const ids = getActionsForUser('admin').map(a => a.id);
    expect(ids).toContain('quotations');
    expect(ids).toContain('ofertas');
  });
});

describe('FASE B — Clientes: destino canónico único (CRM global en Ventas)', () => {
  it('la acción "clientes" existe y apunta a la vista existente customers', () => {
    const ids = getActionsForUser('admin').map(a => a.id);
    expect(ids).toContain('clientes');
    // Sin tercera implementación: la ruta es la vista CRM ya existente.
    expect(getNavigationRoute('clientes')).toEqual({ type: 'direct', view: 'customers' });
  });

  it('breadcrumb de customers: OPERACIÓN > Ventas > Clientes (sin módulo falso)', () => {
    const items = getBreadcrumbForView('customers');
    expect(items.map(i => i.label)).toEqual(['OPERACIÓN', 'Ventas', 'Clientes']);
    expect(items.some(i => i.label === 'Módulo No Disponible')).toBe(false);
  });

  it('el id customers NO pisa la ruta técnica de IPV (fragmentación preservada, sin regreso)', () => {
    // IPV_ROUTES conserva su tab interna customers (ipv + tab customers).
    // La extensión usa id 'clientes' — DEFINED_ROUTES no introduce la clave
    // 'customers', el master lookup no cambia de manos.
    expect(NAVIGATION_MAP['customers']).toEqual({ type: 'module', view: 'ipv', tab: 'customers' });
    expect(NAVIGATION_MAP['clientes']).toEqual({ type: 'direct', view: 'customers' });
  });

  it('la extensión NO es hoja de sidebar y es mobileHide (patrón hub Ventas)', () => {
    const menuIds = flattenNavigation().map(l => l.id);
    expect(menuIds).not.toContain('clientes');
    const ext = ACTION_EXTENSIONS.find(e => e.id === 'clientes');
    expect(ext?.mobileHide).toBe(true);
  });

  it('móvil: customers activa el tab Vender (cluster comercial, igual que quotations)', () => {
    const vender = MOBILE_MAIN_TABS.find(t => t.id === 'pos')!;
    expect(vender.activeViews).toContain('customers');
  });
});

describe('FASE B — Conciliación Bancaria: estatus navegacional honesto', () => {
  it('NO es comando público de palette (capacidad parcial — no aparentar completa)', () => {
    const ids = getActionsForUser('admin').map(a => a.id);
    expect(ids).not.toContain('bank-reconciliation');
    const menuIds = flattenNavigation().map(l => l.id);
    expect(menuIds).not.toContain('bank-reconciliation');
  });

  it('deep-link funcional con breadcrumb standalone honesto (sin módulo falso)', () => {
    const items = getBreadcrumbForView('bank-reconciliation');
    expect(items.map(i => i.label)).toEqual(['Conciliación Bancaria']);
    expect(items.some(i => i.label === 'Módulo No Disponible')).toBe(false);
    // La vista sigue siendo un destino válido (deep-link /case del shell).
    expect(VALID_VIEWS.has('bank-reconciliation')).toBe(true);
    expect(getNavigationRoute('bank-reconciliation')).toEqual({ type: 'direct', view: 'bank-reconciliation' });
  });
});

describe('FASE B — Palette sin pistas falsas (dispatch por route.view)', () => {
  it('acciones con id ≠ view resuelven el ViewType canónico', () => {
    // Pista falsa preexistente corregida: accounts-receivable despacha a la
    // vista real, no al id crudo.
    expect(getNavigationRoute('accounts-receivable')).toEqual({ type: 'direct', view: 'accounts_receivable' });
    expect(getNavigationRoute('accounts-payable')).toEqual({ type: 'direct', view: 'accounts_payable' });
  });

  it('las consultas naturales del mandato tienen candidato correcto', () => {
    const actions = getActionsForUser('admin');
    const byKeyword = (kw: string) =>
      actions.filter(a => a.label.toLowerCase().includes(kw) || a.keywords.some(k => k.includes(kw)));

    expect(byKeyword('tablón').map(a => a.id)).toContain('news');
    expect(byKeyword('noticias').map(a => a.id)).toContain('news');
    expect(byKeyword('noticias económicas').map(a => a.id)).toContain('news');
    expect(byKeyword('información').map(a => a.id)).toContain('news');
    expect(byKeyword('ofertas').map(a => a.id)).toContain('ofertas');
    expect(byKeyword('clientes').map(a => a.id)).toContain('clientes');
    // La conciliación no debe aparecer como resultado público de palette.
    expect(byKeyword('conciliación').map(a => a.id)).not.toContain('bank-reconciliation');
  });

  it('"caja" sigue resolviendo UNA acción (sin contaminación de keywords)', () => {
    const actions = getActionsForUser('clerk');
    const matching = actions.filter(a =>
      a.label.toLowerCase().includes('caja') || a.keywords.includes('caja')
    );
    expect(matching.map(a => a.id)).toEqual(['cash']);
  });
});

describe('FASE B — Hub Gestión de Tiendas sin el Tablón', () => {
  it('el hub sigue siendo hoja de menú alcanzable (desktop y sheet móvil)', () => {
    const menuIds = flattenNavigation().map(l => l.id);
    expect(menuIds).toContain('management-hub');
    // La Vitrina sigue siendo descubrible (extensión de palette preexistente).
    const extIds = ACTION_EXTENSIONS.map(e => e.id);
    expect(extIds).toContain('storefront-config');
  });

  it('ninguna vista conocida de las 4 capacidades cae en Módulo No Disponible', () => {
    for (const view of ['news', 'ofertas', 'customers', 'bank-reconciliation']) {
      const items = getBreadcrumbForView(view);
      expect(items.some(i => i.label === 'Módulo No Disponible')).toBe(false);
    }
  });
});
