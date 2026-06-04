/**
 * Centralized navigation mapping — Single Source of Truth
 *
 * Maps every sidebar ID to its routing behavior:
 *   - type: 'direct' → sidebar ID IS the ViewType (e.g. 'pos', 'inventory')
 *   - type: 'module' → sidebar ID maps to a parent ViewType + internal tab/section
 *
 * Consumers: TerminalShell, Sidebar, CommandPalette
 * NEVER hardcode sidebar ID lists elsewhere — always import from here.
 */

export interface DirectRoute {
  type: 'direct';
  view: string; // The ViewType value
}

export interface ModuleRoute {
  type: 'module';
  view: string; // The parent ViewType (e.g. 'ipv', 'cost-sheets')
  tab: string;  // The internal tab/section value (e.g. 'dashboard', 'transactions', 'templates')
}

export type NavigationRoute = DirectRoute | ModuleRoute;

// ────────────────────────────────────────────────────────────────
// IPV Module: sidebar IDs → IPV view + internal tab
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

// ────────────────────────────────────────────────────────────────
// Costos Module: sidebar IDs → cost-sheets view + internal section
// ────────────────────────────────────────────────────────────────
const COSTOS_ROUTES: Record<string, ModuleRoute> = {
  'cost-sheets':      { type: 'module', view: 'cost-sheets', tab: 'main' },
  'view-assisted':    { type: 'module', view: 'cost-sheets', tab: 'view-assisted' },
  'view-reading':     { type: 'module', view: 'cost-sheets', tab: 'view-reading' },
  'gen-quick':        { type: 'module', view: 'cost-sheets', tab: 'gen-quick' },
  'gen-expert':       { type: 'module', view: 'cost-sheets', tab: 'gen-expert' },
  'templates':        { type: 'module', view: 'cost-sheets', tab: 'templates' },
  'arena-fc':         { type: 'module', view: 'cost-sheets', tab: 'arena-fc' },
  'tool-import':      { type: 'module', view: 'cost-sheets', tab: 'tool-import' },
  'tool-save':        { type: 'module', view: 'cost-sheets', tab: 'tool-save' },
  'tool-export-excel':{ type: 'module', view: 'cost-sheets', tab: 'tool-export-excel' },
  'tool-export-pdf':  { type: 'module', view: 'cost-sheets', tab: 'tool-export-pdf' },
};

// ────────────────────────────────────────────────────────────────
// Direct routes: sidebar ID = ViewType (no internal tab mapping)
// ────────────────────────────────────────────────────────────────
const DIRECT_ROUTES: Record<string, DirectRoute> = {
  occ:                   { type: 'direct', view: 'dashboard' },
  dashboard:             { type: 'direct', view: 'dashboard' },
  pos:                   { type: 'direct', view: 'pos' },
  sales_catalog:         { type: 'direct', view: 'sales_catalog' },
  sales:                 { type: 'direct', view: 'sales' },
  cash:                  { type: 'direct', view: 'cash' },
  catalog:               { type: 'direct', view: 'catalog' },
  inventory:             { type: 'direct', view: 'inventory' },
  history:               { type: 'direct', view: 'history' },
  'inventory_adjustments': { type: 'direct', view: 'inventory_adjustments' },
  recepcion:             { type: 'direct', view: 'recepcion' },
  reception_list:        { type: 'direct', view: 'reception_list' },
  transferencias:        { type: 'direct', view: 'transferencias' },
  inventory_count:       { type: 'direct', view: 'inventory_count' },
  labels:                { type: 'direct', view: 'labels' },
  stores:                { type: 'direct', view: 'stores' },
  users:                 { type: 'direct', view: 'users' },
  roles:                 { type: 'direct', view: 'roles' },
  health:                { type: 'direct', view: 'health' },
  audit:                 { type: 'direct', view: 'audit' },
  settings:              { type: 'direct', view: 'settings' },
  reports:               { type: 'direct', view: 'reports' },
  news:                  { type: 'direct', view: 'news' },
  rss_management:        { type: 'direct', view: 'rss_management' },
  legal:                 { type: 'direct', view: 'legal' },
  help:                  { type: 'direct', view: 'help' },
  wiki:                  { type: 'direct', view: 'wiki' },
  academy:               { type: 'direct', view: 'academy' },
  wallet:                { type: 'direct', view: 'wallet' },
  'pick3-intelligence':  { type: 'direct', view: 'pick3-intelligence' },
};

// ────────────────────────────────────────────────────────────────
// Master lookup table (module routes take precedence)
// ────────────────────────────────────────────────────────────────
const NAVIGATION_MAP: Record<string, NavigationRoute> = {
  ...IPV_ROUTES,
  ...COSTOS_ROUTES,
  ...DIRECT_ROUTES,
};

/**
 * Resolve a sidebar ID to its navigation route.
 * Returns null if the sidebar ID is unknown.
 */
export function getNavigationRoute(sidebarId: string): NavigationRoute | null {
  return NAVIGATION_MAP[sidebarId] ?? null;
}

/**
 * Check if a sidebar ID belongs to the IPV module.
 */
export function isIPVRoute(sidebarId: string): boolean {
  return sidebarId in IPV_ROUTES;
}

/**
 * Check if a sidebar ID belongs to the Costos module.
 */
export function isCostosRoute(sidebarId: string): boolean {
  return sidebarId in COSTOS_ROUTES;
}

/**
 * Check if a sidebar ID is a direct route.
 */
export function isDirectRoute(sidebarId: string): boolean {
  return sidebarId in DIRECT_ROUTES;
}

/**
 * Get all IPV sidebar IDs (for command palette, active state, etc.)
 */
export function getIPVSidebarIds(): string[] {
  return Object.keys(IPV_ROUTES);
}

/**
 * Get all Costos sidebar IDs.
 */
export function getCostosSidebarIds(): string[] {
  return Object.keys(COSTOS_ROUTES);
}

/**
 * Check if a given sidebar ID should be active for the current view state.
 * Used by Sidebar to highlight the correct item.
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
    // For direct routes, also handle special cases like 'dashboard'/'occ'
    if (route.view === 'dashboard' && (sidebarId === 'occ' || sidebarId === 'dashboard')) {
      return currentView === 'dashboard';
    }
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
// Breadcrumb generation
// ────────────────────────────────────────────────────────────────

export interface BreadcrumbItem {
  label: string;
  view?: string; // ViewType to navigate to (undefined = current page)
  isCurrent?: boolean;
}

/**
 * Find the sidebar path (group > submenu > item) for a given sidebar ID.
 * Returns an array of {label} objects representing the hierarchy.
 */
function findSidebarPath(sidebarId: string): { label: string }[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { SIDEBAR_STRUCTURE } = require('@/config/navigation/sidebar.structure');
  
  for (const group of SIDEBAR_STRUCTURE) {
    if (group.id === sidebarId) return [{ label: group.label }];
    for (const child of group.children || []) {
      if (child.id === sidebarId) return [{ label: group.label }, { label: child.label }];
      for (const grandchild of child.children || []) {
        if (grandchild.id === sidebarId) return [{ label: group.label }, { label: child.label }, { label: grandchild.label }];
      }
    }
  }
  return [];
}

/**
 * Auto-generate breadcrumb items for the current view state.
 */
export function getBreadcrumbForView(
  currentView: string,
  ipvActiveTab?: string,
  activeCostSection?: string
): BreadcrumbItem[] {
  const items: BreadcrumbItem[] = [];
  
  // Skip breadcrumb for dashboard (root)
  if (currentView === 'dashboard' || currentView === 'occ') {
    items.push({ label: 'Centro de Control', isCurrent: true });
    return items;
  }

  // Find which sidebar ID maps to this view (for module routes)
  let activeSidebarId = currentView;
  
  if (currentView === 'ipv' && ipvActiveTab) {
    // Find the sidebar ID that has tab === ipvActiveTab
    const IPV_ROUTES = { 
      analytics: { tab: 'dashboard' },
      reports_ipv: { tab: 'reports' },
      receipts: { tab: 'receipts' },
      transfers: { tab: 'transfers' },
      qr: { tab: 'qr' },
      ingestion: { tab: 'ingestion' },
      pivot: { tab: 'pivot' },
      dashboard_ipv: { tab: 'transactions' },
      transactions: { tab: 'transactions' },
      catalog_ipv: { tab: 'catalog' },
      customers: { tab: 'customers' },
      rules: { tab: 'rules' },
      sim: { tab: 'sim' },
      'intelligent-receipts': { tab: 'intelligent-receipts' },
      breakdown: { tab: 'breakdown' },
      audit_ipv: { tab: 'audit' },
      movements: { tab: 'movements' },
      planning: { tab: 'planning' },
      errors: { tab: 'errors' },
      'mapping-rules': { tab: 'mapping-rules' },
      mvt: { tab: 'mvt' },
      mipyme: { tab: 'mipyme' },
    };
    // Prefer exact match, then dashboard_ipv for transactions
    for (const [id, route] of Object.entries(IPV_ROUTES)) {
      if (route.tab === ipvActiveTab && id !== 'analytics') {
        activeSidebarId = id;
        break;
      }
    }
  } else if (currentView === 'cost-sheets' && activeCostSection) {
    const COSTOS_ROUTES = {
      'cost-sheets': { tab: 'main' },
      'view-assisted': { tab: 'view-assisted' },
      'view-reading': { tab: 'view-reading' },
      'gen-quick': { tab: 'gen-quick' },
      'gen-expert': { tab: 'gen-expert' },
      templates: { tab: 'templates' },
      'arena-fc': { tab: 'arena-fc' },
      'tool-import': { tab: 'tool-import' },
      'tool-save': { tab: 'tool-save' },
      'tool-export-excel': { tab: 'tool-export-excel' },
      'tool-export-pdf': { tab: 'tool-export-pdf' },
    };
    for (const [id, route] of Object.entries(COSTOS_ROUTES)) {
      if (route.tab === activeCostSection) {
        activeSidebarId = id;
        break;
      }
    }
  }

  const path = findSidebarPath(activeSidebarId);
  
  for (let i = 0; i < path.length; i++) {
    const isLast = i === path.length - 1;
    items.push({
      label: path[i].label,
      view: isLast ? undefined : 'occ', // Only "Inicio" is clickable for simplicity
      isCurrent: isLast,
    });
  }

  return items.length > 0 ? items : [{ label: currentView.replace(/-/g, ' '), isCurrent: true }];
}

export default NAVIGATION_MAP;
