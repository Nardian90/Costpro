/**
 * NAVIGATION MAP — DERIVADO de navigation-definition.ts (fuente única).
 *
 * Resuelve cada ID de navegación a su comportamiento de ruta:
 *   - type: 'direct'  → el ID ES el ViewType (ej: 'pos', 'inventory')
 *   - type: 'module'  → el ID apunta a una vista-módulo + tab interno
 *     (ej: cost-analytics → cost-sheets + tab 'cost-analytics')
 *
 * Consumidores: TerminalShell, Sidebar, CommandPalette, MobileTabBar.
 * NUNCA declarar listas de IDs de navegación fuera de la definición —
 * las rutas se derivan; solo los alias legacy y las rutas técnicas de
 * tabs internas se declaran explícitamente aquí.
 */

import {
  NAVIGATION_SECTIONS,
  ACTION_EXTENSIONS,
  LEGACY_VIEW_ALIASES,
  type NavEntry,
} from './navigation-definition';

export interface DirectRoute {
  type: 'direct';
  view: string; // The ViewType value
}

export interface ModuleRoute {
  type: 'module';
  view: string; // The parent ViewType (e.g. 'ipv', 'cost-sheets')
  tab: string;  // The internal tab/section value
}

export type NavigationRoute = DirectRoute | ModuleRoute;

// ────────────────────────────────────────────────────────────────
// Rutas derivadas de la definición (hojas con route { view, tab? })
// ────────────────────────────────────────────────────────────────

function collectLeaves(entries: NavEntry[], out: NavEntry[] = []): NavEntry[] {
  for (const e of entries) {
    if (e.type === 'item') out.push(e);
    if (e.children) collectLeaves(e.children, out);
  }
  return out;
}

const DEFINITION_LEAVES = collectLeaves(NAVIGATION_SECTIONS);

const DEFINED_ROUTES: Record<string, NavigationRoute> = {};
for (const leaf of [...DEFINITION_LEAVES, ...ACTION_EXTENSIONS]) {
  DEFINED_ROUTES[leaf.id] = leaf.route?.tab
    ? { type: 'module', view: leaf.route.view, tab: leaf.route.tab }
    : { type: 'direct', view: leaf.route?.view ?? leaf.id };
}

// ────────────────────────────────────────────────────────────────
// Rutas TÉCNICAS de tabs internas (sin entrada en el menú):
// tabs de IPV y de cost-sheets alcanzables por deep-link / estado interno.
// Los IDs antiguos se conservan para compatibilidad con bookmarks/estado.
// ────────────────────────────────────────────────────────────────
const IPV_ROUTES: Record<string, ModuleRoute> = {
  analytics:              { type: 'module', view: 'ipv', tab: 'dashboard' },
  reports_ipv:            { type: 'module', view: 'ipv', tab: 'reports' },
  receipts:               { type: 'module', view: 'ipv', tab: 'receipts' },
  transfers:              { type: 'module', view: 'ipv', tab: 'transfers' },
  qr:                     { type: 'module', view: 'ipv', tab: 'qr' },
  ingestion:              { type: 'module', view: 'ipv', tab: 'ingestion' },
  pivot:                  { type: 'module', view: 'ipv', tab: 'pivot' },
  dashboard_ipv:          { type: 'module', view: 'ipv', tab: 'transactions' },
  transactions:           { type: 'module', view: 'ipv', tab: 'transactions' },
  catalog_ipv:            { type: 'module', view: 'ipv', tab: 'catalog' },
  customers:              { type: 'module', view: 'ipv', tab: 'customers' },
  rules:                  { type: 'module', view: 'ipv', tab: 'rules' },
  sim:                    { type: 'module', view: 'ipv', tab: 'sim' },
  'intelligent-receipts': { type: 'module', view: 'ipv', tab: 'intelligent-receipts' },
  breakdown:              { type: 'module', view: 'ipv', tab: 'breakdown' },
  audit_ipv:              { type: 'module', view: 'ipv', tab: 'audit' },
  movements:              { type: 'module', view: 'ipv', tab: 'movements' },
  planning:               { type: 'module', view: 'ipv', tab: 'planning' },
  errors:                 { type: 'module', view: 'ipv', tab: 'errors' },
  'mapping-rules':        { type: 'module', view: 'ipv', tab: 'mapping-rules' },
  mvt:                    { type: 'module', view: 'ipv', tab: 'mvt' },
  mipyme:                 { type: 'module', view: 'ipv', tab: 'mipyme' },
};

const COSTOS_ROUTES: Record<string, ModuleRoute> = {
  // 'cost-sheets' / 'cost-analytics' vienen de la definición (DERIVED);
  // aquí solo las tabs técnicas internas de la vista de fichas:
  'cost-sheet-editor': { type: 'module', view: 'cost-sheets', tab: 'main' },
  'view-assisted':    { type: 'module', view: 'cost-sheets', tab: 'view-assisted' },
  'view-reading':     { type: 'module', view: 'cost-sheets', tab: 'view-reading' },
  'gen-quick':        { type: 'module', view: 'cost-sheets', tab: 'gen-easy' },
  'gen-expert':       { type: 'module', view: 'cost-sheets', tab: 'gen-easy' },
  'templates':        { type: 'module', view: 'cost-sheets', tab: 'templates' },
  'arena-fc':         { type: 'module', view: 'cost-sheets', tab: 'arena-fc' },
  'tool-import':      { type: 'module', view: 'cost-sheets', tab: 'tool-import' },
  'tool-save':        { type: 'module', view: 'cost-sheets', tab: 'tool-save' },
  'tool-export-excel':{ type: 'module', view: 'cost-sheets', tab: 'tool-export-excel' },
  'tool-export-pdf':  { type: 'module', view: 'cost-sheets', tab: 'tool-export-pdf' },
};

// ────────────────────────────────────────────────────────────────
// Rutas directas TÉCNICAS (vistas contextuales fuera del menú):
// tarjetas de hub, CTAs contextuales y vistas de dominio.
// ────────────────────────────────────────────────────────────────
const TECHNICAL_DIRECT_ROUTES: Record<string, DirectRoute> = {
  devolutions:           { type: 'direct', view: 'devolutions' },
  quotations:            { type: 'direct', view: 'quotations' },
  sales_catalog:         { type: 'direct', view: 'sales_catalog' },
  sales:                 { type: 'direct', view: 'sales' },
  cash_report:           { type: 'direct', view: 'cash_report' },
  catalog:               { type: 'direct', view: 'catalog' },
  history:               { type: 'direct', view: 'history' },
  lots:                  { type: 'direct', view: 'lots' },
  warehouses:            { type: 'direct', view: 'warehouses' },
  customers:             { type: 'direct', view: 'customers' },
  'bank-reconciliation': { type: 'direct', view: 'bank-reconciliation' },
  news:                  { type: 'direct', view: 'news' },
  stores:                { type: 'direct', view: 'stores' },
  'accounts-payable':    { type: 'direct', view: 'accounts-payable' },
  'accounts_payable':    { type: 'direct', view: 'accounts-payable' },
  accounts_receivable:   { type: 'direct', view: 'accounts_receivable' },
  // Sub-vistas globales de bots (tabs de sus hubs — fuera de todo menú)
  'whatsapp-config':     { type: 'direct', view: 'whatsapp-config' },
  'whatsapp-conversations': { type: 'direct', view: 'whatsapp-conversations' },
  'whatsapp-invitations': { type: 'direct', view: 'whatsapp-invitations' },
  'whatsapp-dashboard':  { type: 'direct', view: 'whatsapp-dashboard' },
  'whatsapp-group':      { type: 'direct', view: 'whatsapp-group' },
  'telegram-config':     { type: 'direct', view: 'telegram-config' },
  'telegram-conversations': { type: 'direct', view: 'telegram-conversations' },
  'telegram-invitations': { type: 'direct', view: 'telegram-invitations' },
  'telegram-dashboard':  { type: 'direct', view: 'telegram-dashboard' },
  'telegram-group':      { type: 'direct', view: 'telegram-group' },
};

// ────────────────────────────────────────────────────────────────
// Master lookup (definición → técnicas → alias legacy)
// ────────────────────────────────────────────────────────────────
const LEGACY_ROUTES: Record<string, NavigationRoute> = {};
for (const [aliasId, dest] of Object.entries(LEGACY_VIEW_ALIASES)) {
  LEGACY_ROUTES[aliasId] = dest.tab
    ? { type: 'module', view: dest.view, tab: dest.tab }
    : { type: 'direct', view: dest.view };
}

const NAVIGATION_MAP: Record<string, NavigationRoute> = {
  ...TECHNICAL_DIRECT_ROUTES,
  ...IPV_ROUTES,
  ...COSTOS_ROUTES,
  ...DEFINED_ROUTES,
  ...LEGACY_ROUTES,
};

/**
 * Resolve a navigation ID to its routing route.
 * Returns null if the ID is unknown.
 */
export function getNavigationRoute(id: string): NavigationRoute | null {
  return NAVIGATION_MAP[id] ?? null;
}

/** Check if an ID belongs to the IPV module (technical tabs). */
export function isIPVRoute(id: string): boolean {
  return id in IPV_ROUTES;
}

/** Check if an ID belongs to the cost-sheets module (technical tabs). */
export function isCostosRoute(id: string): boolean {
  return id in COSTOS_ROUTES;
}

/** Check if an ID is a direct route. */
export function isDirectRoute(id: string): boolean {
  const r = NAVIGATION_MAP[id];
  return !!r && r.type === 'direct';
}

/** All IPV technical sidebar IDs (compat). */
export function getIPVSidebarIds(): string[] {
  return Object.keys(IPV_ROUTES);
}

/** All cost-sheets technical tab IDs. */
export function getCostosSidebarIds(): string[] {
  return Object.keys(COSTOS_ROUTES);
}

/**
 * Check if a given nav ID should be active for the current view state.
 * Used by Sidebar/MobileTabBar to highlight the correct item.
 */
export function isSidebarItemActive(
  sidebarId: string,
  currentView: string,
  ipvActiveTab: string,
  activeCostSection: string
): boolean {
  const route = NAVIGATION_MAP[sidebarId];
  if (!route) return false;

  if (route.type === 'direct') {
    return currentView === sidebarId;
  }

  // Module route
  if (route.view === 'ipv') {
    return currentView === 'ipv' && ipvActiveTab === route.tab;
  }
  if (route.view === 'cost-sheets') {
    return currentView === 'cost-sheets' && activeCostSection === route.tab;
  }

  return false;
}

// ────────────────────────────────────────────────────────────────
// Breadcrumb generation (derivado de la definición — sin require)
// ────────────────────────────────────────────────────────────────

export interface BreadcrumbItem {
  label: string;
  view?: string; // ViewType to navigate to (undefined = current page)
  isCurrent?: boolean;
}

interface DefPathNode {
  id: string;
  label: string;
  type: NavEntry['type'];
}

/** Busca el path (sección > hub > hoja) de un ID en la definición. */
function findDefinitionPath(targetId: string): DefPathNode[] {
  const walk = (entries: NavEntry[], path: DefPathNode[]): DefPathNode[] | null => {
    for (const e of entries) {
      const next = [...path, { id: e.id, label: e.label, type: e.type }];
      if (e.id === targetId) return next;
      if (e.children) {
        const found = walk(e.children, next);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(NAVIGATION_SECTIONS, []) ?? [];
}

/**
 * Map de sub-vistas (alcanzadas desde un hub) a su hub contenedor para el
 * breadcrumb. Las hojas del menú NO están aquí (su path sale de la
 * definición); solo vistas contextuales.
 */
const VIEW_TO_HUB_MAP: Record<string, { hubId: string; leafLabel: string }> = {
  // Tarjetas del hub de Venta
  pos: { hubId: 'sales-hub', leafLabel: 'Terminal de Venta' },
  sales_catalog: { hubId: 'sales-hub', leafLabel: 'Tabla de Venta' },
  sales: { hubId: 'sales-hub', leafLabel: 'Historial de Ventas' },
  cash: { hubId: 'sales-hub', leafLabel: 'Caja' },
  inventory_count: { hubId: 'sales-hub', leafLabel: 'Venta por Conteo' },
  devolutions: { hubId: 'sales-hub', leafLabel: 'Devoluciones' },
  quotations: { hubId: 'sales-hub', leafLabel: 'Cotizaciones' },
  cash_report: { hubId: 'sales-hub', leafLabel: 'Reporte de Entrega' },
  'accounts-payable': { hubId: 'sales-hub', leafLabel: 'Cuentas por Pagar' },
  accounts_payable: { hubId: 'sales-hub', leafLabel: 'Cuentas por Pagar' },
  accounts_receivable: { hubId: 'sales-hub', leafLabel: 'Cobros por Antigüedad' },
  // Tabs contextuales de Inventario (Almacén)
  catalog: { hubId: 'inventory', leafLabel: 'Catálogo' },
  history: { hubId: 'inventory', leafLabel: 'Trazabilidad (Movimientos de Stock)' },
  lots: { hubId: 'inventory', leafLabel: 'Lotes' },
  // Contextuales de Gestión de Tiendas
  stores: { hubId: 'management-hub', leafLabel: 'Tiendas' },
  news: { hubId: 'management-hub', leafLabel: 'Tablón de Noticias' },
  warehouses: { hubId: 'management-hub', leafLabel: 'Almacenes y Depósitos' },
  // Creación contextual
  recepcion: { hubId: 'reception_list', leafLabel: 'Nueva Recepción' },
  // Vitrina (tab del hub Gestión) — vista directa con su propio nombre
};

/**
 * Auto-generate breadcrumb items for the current view state.
 * Home única: 'dashboard' (y su alias 'occ') muestran "Inicio" sin ancestros.
 */
export function getBreadcrumbForView(
  currentView: string,
  ipvActiveTab?: string,
  activeCostSection?: string
): BreadcrumbItem[] {
  // HOME ÚNICA (GATE 1 §1): Inicio → dashboard. Sin ancestros.
  if (currentView === 'dashboard' || currentView === 'occ') {
    return [{ label: 'Inicio', isCurrent: true }];
  }

  // Vistas de acceso directo fuera del árbol (widget/vista embebida)
  if (currentView === 'calculator') {
    return [{ label: 'Calculadora', isCurrent: true }];
  }
  if (currentView === 'chat') {
    return [{ label: 'Chat con Darian', isCurrent: true }];
  }

  // Sub-vistas de hub → path del hub + hoja actual
  const hubMapping = VIEW_TO_HUB_MAP[currentView];
  if (hubMapping) {
    const hubPath = findDefinitionPath(hubMapping.hubId);
    const items: BreadcrumbItem[] = hubPath.map((p, i) => ({
      label: p.label,
      view: i < hubPath.length - 1 ? p.id : undefined,
      isCurrent: false,
    }));
    items.push({ label: hubMapping.leafLabel, isCurrent: true });
    return items;
  }

  // Vista-módulo con tab: resolver el ID de hoja cuyo tab coincide
  let activeId = currentView;

  if (currentView === 'ipv' && ipvActiveTab) {
    for (const [id, route] of Object.entries(IPV_ROUTES)) {
      if (route.tab === ipvActiveTab && id !== 'analytics') {
        activeId = id;
        break;
      }
    }
  } else if (currentView === 'cost-sheets' && activeCostSection) {
    const costosTabRoutes: Record<string, string> = {
      'cost-analytics': 'cost-analytics',
      main: 'cost-sheet-editor',
      'view-assisted': 'view-assisted',
      'view-reading': 'view-reading',
      'gen-easy': 'cost-sheets',
      templates: 'templates',
      'arena-fc': 'arena-fc',
      'tool-import': 'tool-import',
      'tool-save': 'tool-save',
      'tool-export-excel': 'tool-export-excel',
      'tool-export-pdf': 'tool-export-pdf',
    };
    const matchId = costosTabRoutes[activeCostSection];
    if (matchId) activeId = matchId;
  }

  const path = findDefinitionPath(activeId);
  const items: BreadcrumbItem[] = path.map((p, i) => ({
    label: p.label,
    // Los grupos/submenús intermedios son navegables a su hub overview;
    // la hoja final es la página actual.
    view: i < path.length - 1 ? p.id : undefined,
    isCurrent: i === path.length - 1,
  }));

  if (items.length === 0) {
    return [
      { label: String(currentView).replace(/-/g, ' '), isCurrent: false },
      { label: 'Módulo No Disponible', isCurrent: true },
    ];
  }
  return items;
}

export default NAVIGATION_MAP;
