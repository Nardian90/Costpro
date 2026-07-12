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
  // FIX-TABLERO-PRINCIPAL (2026-07-04): "Tablero Principal" (cost-sheets) ahora
  // abre directamente el Centro de Análisis Dinámico (tab: 'cost-analytics'),
  // NO la ficha de costo. La ficha de costo sigue accesible desde el item
  // "Ficha de Costo" (cost-sheet-editor) que usa tab: 'main'.
  'cost-sheets':      { type: 'module', view: 'cost-sheets', tab: 'cost-analytics' },
  'cost-sheet-editor': { type: 'module', view: 'cost-sheets', tab: 'main' },
  'view-assisted':    { type: 'module', view: 'cost-sheets', tab: 'view-assisted' },
  'view-reading':     { type: 'module', view: 'cost-sheets', tab: 'view-reading' },
  // B2-B3: 'gen-easy' reemplaza a 'gen-quick' + 'gen-expert' — abre una vista
  // con 2 tabs internos (Rápida / Experta). Los IDs antiguos se conservan
  // para compatibilidad con bookmarks antiguos.
  'gen-easy':         { type: 'module', view: 'cost-sheets', tab: 'gen-easy' },
  'gen-quick':        { type: 'module', view: 'cost-sheets', tab: 'gen-easy' },
  'gen-expert':       { type: 'module', view: 'cost-sheets', tab: 'gen-easy' },
  'templates':        { type: 'module', view: 'cost-sheets', tab: 'templates' },
  'arena-fc':         { type: 'module', view: 'cost-sheets', tab: 'arena-fc' },
  'cost-analytics':   { type: 'module', view: 'cost-sheets', tab: 'cost-analytics' },
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
  chat:                  { type: 'direct', view: 'chat' },
  // FIX-CALC-VIEW (2026-07-10): vista integrada de calculadora
  calculator:            { type: 'direct', view: 'calculator' },
  // FIX-PAYMENT-TRACKING (2026-07-12): dashboard de cuentas por pagar
  'accounts-payable':    { type: 'direct', view: 'accounts-payable' },
  'costeo-dinamico':     { type: 'direct', view: 'costeo-dinamico' },
  'estructura-costo':    { type: 'direct', view: 'estructura-costo' },
  'whatsapp-config':     { type: 'direct', view: 'whatsapp-config' },
  'whatsapp-conversations': { type: 'direct', view: 'whatsapp-conversations' },
  'whatsapp-invitations': { type: 'direct', view: 'whatsapp-invitations' },
  'whatsapp-dashboard':  { type: 'direct', view: 'whatsapp-dashboard' },
  'whatsapp-group':      { type: 'direct', view: 'whatsapp-group' },
  // Fase T1: Telegram Bot — serverless-native, Vercel-compatible
  'telegram-config':     { type: 'direct', view: 'telegram-config' },
  'telegram-conversations': { type: 'direct', view: 'telegram-conversations' },
  'telegram-invitations': { type: 'direct', view: 'telegram-invitations' },
  'telegram-dashboard':  { type: 'direct', view: 'telegram-dashboard' },
  'telegram-group':      { type: 'direct', view: 'telegram-group' },
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
  'purchase-orders':     { type: 'direct', view: 'purchase-orders' },
  'sales-hub':           { type: 'direct', view: 'sales-hub' },
  transferencias:        { type: 'direct', view: 'transferencias' },
  inventory_count:       { type: 'direct', view: 'inventory_count' },
  labels:                { type: 'direct', view: 'labels' },
  stores:                { type: 'direct', view: 'stores' },
  users:                 { type: 'direct', view: 'users' },
  roles:                 { type: 'direct', view: 'roles' },
  health:                { type: 'direct', view: 'health' },
  'usage-monitoring':    { type: 'direct', view: 'usage-monitoring' },
  workers:               { type: 'direct', view: 'workers' },
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
  ofertas:               { type: 'direct', view: 'ofertas' },
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
 * Returns an array of {label, view} objects representing the hierarchy.
 *
 * M-2 (IA Audit): ahora cada ancestro incluye `view` para ser navegable.
 * Antes todos los ancestros tenían view=undefined (solo "Inicio" era clicleable).
 * Ahora cada item apunta a su sidebar ID, permitiendo al usuario saltar a
 * cualquier nivel del árbol de navegación desde el breadcrumb.
 */
function findSidebarPath(sidebarId: string): { label: string; view?: string }[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { SIDEBAR_STRUCTURE } = require('@/config/navigation/sidebar.structure');

  for (const group of SIDEBAR_STRUCTURE) {
    if (group.id === sidebarId) return [{ label: group.label, view: group.id }];
    for (const child of group.children || []) {
      if (child.id === sidebarId) {
        return [
          { label: group.label, view: group.id },
          { label: child.label, view: child.id },
        ];
      }
      for (const grandchild of child.children || []) {
        if (grandchild.id === sidebarId) {
          return [
            { label: group.label, view: group.id },
            { label: child.label, view: child.id },
            { label: grandchild.label, view: grandchild.id },
          ];
        }
      }
    }
  }
  return [];
}

/**
 * M-2 (IA Audit): map de vistas "destino" (sub-vistas alcanzadas desde un hub)
 * a su ancestro hub en el sidebar. Permite que el breadcrumb muestre el path
 * lógico correcto cuando el usuario está en una sub-vista que no está
 * directamente como item en el sidebar.
 *
 * Ej: cuando currentView === 'pos', el breadcrumb muestra
 * "Inicio > MULTI-TIENDA > Punto de Venta > Venta > Terminal de Venta"
 * en lugar de solo "Inicio > Terminal de Venta".
 */
const VIEW_TO_HUB_MAP: Record<string, { hubId: string; leafLabel: string }> = {
  // Sub-vistas del hub de Venta (sales-hub)
  pos: { hubId: 'sales-hub', leafLabel: 'Terminal de Venta' },
  sales_catalog: { hubId: 'sales-hub', leafLabel: 'Tabla IPV' },
  catalog: { hubId: 'sales-hub', leafLabel: 'Catálogo' },
  history: { hubId: 'sales-hub', leafLabel: 'Historial' },
  cash: { hubId: 'sales-hub', leafLabel: 'Arqueo de Caja' },
  sales: { hubId: 'sales-hub', leafLabel: 'Ventas' },
  inventory_count: { hubId: 'sales-hub', leafLabel: 'Venta por Conteo' },
  // 'recepcion' es una vista de creación alcanzada desde reception_list
  recepcion: { hubId: 'reception_list', leafLabel: 'Nueva Recepción' },
};

/**
 * Auto-generate breadcrumb items for the current view state.
 *
 * M-2 (IA Audit): ahora los ancestros son navegables (view definido) y las
 * sub-vistas de hub muestran el path completo del hub.
 */
export function getBreadcrumbForView(
  currentView: string,
  ipvActiveTab?: string,
  activeCostSection?: string
): BreadcrumbItem[] {
  const items: BreadcrumbItem[] = [];

  // E-Fix (IA Audit): 'dashboard' ya no se trata como raíz — ahora muestra
  // breadcrumb completo "Inicio > MULTI-TIENDA > Dashboard KPI" para wayfinding
  // consistente con las demás vistas. Solo 'occ' (Centro de Control) sigue
  // siendo la home raíz sin ancestros.
  if (currentView === 'occ') {
    items.push({ label: 'Centro de Control', isCurrent: true });
    return items;
  }

  // FIX-CALC-VIEW (2026-07-10): 'calculator' y 'chat' son vistas de acceso directo
  // que NO están en SIDEBAR_STRUCTURE como módulo. Mostrar breadcrumb simple sin
  // "Módulo No Disponible".
  if (currentView === 'calculator') {
    return [{ label: 'Calculadora', isCurrent: true }];
  }
  if (currentView === 'chat') {
    return [{ label: 'Chat con Darian', isCurrent: true }];
  }
  // FIX-B9 (2026-07-12): breadcrumb para accounts-payable
  if (currentView === 'accounts-payable') {
    return [{ label: 'Cuentas por Pagar', isCurrent: true }];
  }

  // M-2: si la vista es una sub-vista de hub, construir path completo
  const hubMapping = VIEW_TO_HUB_MAP[currentView];
  if (hubMapping) {
    const hubPath = findSidebarPath(hubMapping.hubId);
    for (let i = 0; i < hubPath.length; i++) {
      items.push({
        label: hubPath[i].label,
        view: hubPath[i].view,
        isCurrent: false,
      });
    }
    // Añadir la sub-vista actual como hoja
    items.push({
      label: hubMapping.leafLabel,
      isCurrent: true,
    });
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
    // FIX-TABLERO-PRINCIPAL (2026-07-06): sincronizar este mapa con el mapa real
    // de COSTOS_ROUTES declarado al inicio del archivo. Antes faltaban las entradas
    // 'cost-analytics' y 'cost-sheet-editor', y 'cost-sheets' apuntaba a 'main'
    // en lugar de 'cost-analytics', lo que hacía que el breadcrumb mostrara
    // "Módulo No Disponible" en vez de "MULTI-TIENDA > Analítica > Tablero Principal".
    const COSTOS_ROUTES = {
      'cost-sheets': { tab: 'cost-analytics' },
      'cost-sheet-editor': { tab: 'main' },
      'cost-analytics': { tab: 'cost-analytics' },
      'view-assisted': { tab: 'view-assisted' },
      'view-reading': { tab: 'view-reading' },
      'gen-quick': { tab: 'gen-easy' },
      'gen-expert': { tab: 'gen-easy' },
      'gen-easy': { tab: 'gen-easy' },
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

  // M-2: ahora cada ancestro es navegable (view = su sidebar ID).
  // Antes: view='occ' para todos los ancestros (solo "Inicio" era clicleable,
  // los ancestros intermedios no hacían nada al clic).
  for (let i = 0; i < path.length; i++) {
    const isLast = i === path.length - 1;
    items.push({
      label: path[i].label,
      view: isLast ? undefined : path[i].view,
      isCurrent: isLast,
    });
  }

  // E-Fix (IA Audit): si la vista no está en SIDEBAR_STRUCTURE (ej: vista
  // eliminada, URL legacy, o submenu wrapper ID), mostramos un breadcrumb
  // con label "Módulo No Disponible" para que el usuario entienda qué pasó.
  // Antes mostraba el raw view ID (ej: "punto_venta") lo cual confundía.
  if (items.length === 0) {
    return [
      { label: String(currentView).replace(/-/g, ' '), isCurrent: false },
      { label: 'Módulo No Disponible', isCurrent: true },
    ];
  }
  return items;
}

export default NAVIGATION_MAP;
