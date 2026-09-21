# GATE 1.4 — 01 CAPABILITY INVENTORY (inventario completo de capacidades)

Fecha: 2026-09-21 · Fuentes: `navigation-definition.ts` (1000 líneas), `navigation-map.ts` (377), `sidebar.structure.ts`, `view-tips.ts`, `actions.ts`, `TerminalShell.tsx` (registro ~70 cases), `MobileTabBar.tsx`, browser real (admin@demo.com).

## Derivación (fuente única)

Del `navigation-definition.ts` se derivan: Sidebar (SIDEBAR_STRUCTURE), Mobile (MOBILE_MAIN_TABS + sheet "Más"), Breadcrumb (getBreadcrumbForView), Command Palette (SYSTEM_ACTIONS = flattenNavigation + ACTION_EXTENSIONS), guard de roles (isViewAllowedForRole). `VALID_VIEWS` = ~95 ViewTypes. `TECHNICAL_VIEW_IDS` = 41 vistas sin entrada de navegación.

## MATRIZ DE CAPACIDADES (evidencia por fila)

| View ID | Ruta | Componente | Label actual | Dominio actual | ¿En menú? | Palette | Deep-link | Rol | Estado |
|---|---|---|---|---|---|---|---|---|---|
| dashboard | /?view=dashboard | DashboardView (router: MultiStore p/ admin·manager, impl p/ clerk) | Inicio | HOME | Sí (Inicio) | Sí | OK | todos | ACCESSIBLE |
| pos | /?view=pos | POSView | Vender | OPERACIÓN | Sí (primary) | Sí | OK | admin,manager,encargado,clerk,usuario | ACCESSIBLE |
| sales-hub | /?view=sales-hub | SalesHubView | Ventas | OPERACIÓN (hub) | Sí | Sí | OK | idem | ACCESSIBLE |
| sales_catalog | tarjeta hub | SalesCatalogView | Tabla de Venta | Ventas (contextual) | No (tarjeta) | Sí (SALES_HUB_PALETTE) | OK | idem | ACCESSIBLE (contextual) |
| sales | tarjeta hub | SalesHistoryView | Historial de Ventas | Ventas | No (tarjeta) | Sí | OK | idem | ACCESSIBLE (contextual) |
| cash | tarjeta hub | CashClosureView | Caja | Ventas | No (tarjeta) | Sí | OK | idem | ACCESSIBLE (contextual) |
| inventory_count | tarjeta hub | InventoryCountView | Venta por Conteo | Ventas | No (tarjeta) | Sí | OK | idem | ACCESSIBLE (contextual) |
| devolutions | tarjeta hub | DevolutionsView | Devoluciones | Ventas | No (tarjeta) | Sí | OK | idem | ACCESSIBLE (contextual) |
| quotations | tarjeta hub | QuotationsView | Cotizaciones | Ventas | No (tarjeta) | Sí | OK | idem | ACCESSIBLE (contextual) |
| accounts_payable (+alias -) | tarjeta hub | AccountsPayableView | Cuentas por Pagar | Ventas | No (tarjeta) | Sí | OK | idem | ACCESSIBLE (contextual) |
| accounts_receivable | tarjeta hub | AccountsReceivableView | Cobros por Antigüedad | Ventas | No (tarjeta) | Sí | OK | idem | ACCESSIBLE (contextual) |
| cash_report | tarjeta Caja | CashReportWrapper | Reporte de Entrega | Ventas (modal→vista) | No | No | OK (browser ✓) | idem | ACCESSIBLE (contextual) |
| inventory | submenu Almacén | InventoryView | Inventario | OPERACIÓN>Almacén | Sí | Sí | OK | admin,manager,encargado,warehouse | ACCESSIBLE |
| catalog | tab Inventario | CatalogView | Catálogo | Almacén (tab) | No (tab) | No | OK (browser ✓) | idem | ACCESSIBLE (contextual) |
| history | tab Inventario | StockHistoryView | Trazabilidad | Almacén (tab) | No (tab) | No | OK (browser ✓) | idem | ACCESSIBLE (contextual) |
| lots | tab Inventario | LotsView | Lotes | Almacén (tab) | No (tab) | No | OK (browser ✓) | idem | ACCESSIBLE (contextual) |
| warehouses | hub Gestión | WarehousesView | Almacenes y Depósitos | Gestión de Tiendas (contextual) | No | No | OK (browser ✓) | idem | MISPLACED-dudoso (ver 03) |
| received-services | Almacén | ReceivedServicesView | Servicios Recibidos | Almacén | Sí | Sí | OK | idem | ACCESSIBLE |
| inventory_adjustments | Almacén | InventoryAdjustmentsView | Ajustes Documentales | Almacén | Sí | Sí | OK | admin,manager,encargado | ACCESSIBLE |
| labels | Almacén | ProductLabelGenerator | Etiquetas y Códigos | Almacén | Sí | Sí | OK | idem | ACCESSIBLE |
| recepcion | ACTION_EXT | ProductReceptionView | Nueva Recepción | Logística (contextual) | No | Sí | OK | admin,manager,encargado,warehouse | ACCESSIBLE (acción) |
| reception_list | Logística | ReceptionsHistoryView | Recepciones | Logística | Sí | Sí | OK | idem | ACCESSIBLE |
| purchase-orders | Logística | PurchaseOrdersView | Órdenes de Compra | Logística | Sí | Sí | OK | idem | ACCESSIBLE |
| transferencias | Logística | TransferenciasView | Transferencia Stock | Logística | Sí | Sí | OK | idem | ACCESSIBLE |
| **cost-sheets** | OPERACIÓN>Costo | CostSheetView | Fichas de Costo (tab gen-easy) | Costo | Sí | Sí | OK | admin,manager,encargado,costo | ACCESSIBLE |
| cost-analytics | ANÁLISIS | CostAnalyticsView (tab de cost-sheets) | Tablero Dinámico (ex Tablero Principal) | ANÁLISIS (tab de Costo) | Sí (en ANÁLISIS) | Sí | OK | sin roles → universal | ACCESSIBLE (dual-dominio) |
| 'main' (editor) | tab cost-sheets | CostSheetBody/Nav/ActionsPanel | Ficha (editor) | Costo (contextual) | No | No | OK (tab=main) | idem | ACCESSIBLE (contextual) |
| 'view-assisted' | tab cost-sheets | CostSheetWizard (viewMode assisted) | Modo Asistido | Costo (modo del editor) | No | **NO — 0 resultados** | OK (browser ✓) | idem | **HIDDEN** (deep-link/contextual) |
| 'view-reading' | tab cost-sheets | viewMode reading | Informe | Costo (modo del editor) | No | **NO** | OK (browser ✓) | idem | **HIDDEN** |
| 'arena-fc' | tab cost-sheets | ArenaFC | Arena FC (beta) | Costo (experimentación) | No | **NO** ("arena" solo cae en Fichas de Costo→gen-easy) | OK (browser ✓) | idem | **ORPHAN** (sin trigger UI en todo src/) |
| templates | tab cost-sheets | CostSheetTemplateExplorer | Explorador de Plantillas | Costo (herramienta) | No | NO | OK (browser ✓) | idem | **HIDDEN** (contextual ActionsPanel) |
| tool-save / tool-import / tool-export-excel / tool-export-pdf | tabs técnicas | useCostSheetActions / CostSheetNav | Guardar/Importar JSON/Exportar Excel/Exportar PDF | Costo (herramientas del editor) | No | NO | OK (mapa) | idem | CONTEXTUAL (correcto en editor; invisibles palette) |
| massive-gen / steel-calculator / ai-chat | tabs cost-sheets | MassiveGenerator / SteelStructureCalculator / DarianEditor | Generación Masiva / Calculadora Estructural / Darian en ficha | Costo | No | NO | OK | idem | HIDDEN (contextual ActionsPanel) |
| estructura-costo | Costo | EstructuraCostoView | Estructura de Costo | Costo | Sí | Sí | OK | idem | ACCESSIBLE |
| costeo-dinamico | Costo | CosteoDinamicoView | Costeo Dinámico | Costo | Sí | Sí | OK | idem | ACCESSIBLE |
| production-orders | Costo | ProductionOrdersView | Órdenes de Producción y Trabajo | Costo | Sí | Sí | OK | idem | ACCESSIBLE |
| workers | OPERACIÓN | WorkersView | Trabajadores y Comisiones | OPERACIÓN | Sí | Sí | OK | admin,manager,encargado | ACCESSIBLE |
| management-hub | OPERACIÓN | ManagementHubView | Gestión de Tiendas (3 tabs) | OPERACIÓN (hub) | Sí | Sí | OK | idem | ACCESSIBLE |
| news | tab default hub + vista | NewsView | Tablón Noticias | Gestión (comunicación) | No (tab) | No (solo RSS/hub) | OK (browser ✓) | idem | ACCESSIBLE (contextual) |
| 'storefront' tab / **storefront-config** | tab hub / vista | StorefrontConfigView | Vitrina / Vitrina Pública | Gestión / ACTION_EXT | tab Sí, vista No | Sí ("Vitrina Pública") | OK URL pero **breadcrumb/header mintiendo** (UX-002) | admin,manager,encargado | DUPLICATED-entrada + UX-002 |
| stores | tab hub + vista | StoresManagementView | Gestión Tiendas / Tiendas | Gestión | No (tab) | No | OK (browser ✓) | idem | ACCESSIBLE (contextual) |
| chat | ACTION_EXT | ChatBotView | Chat con Darian (IA) | GLOBAL (extensión) | No | Sí ("darian" ✓) + FAB + sidebar rail | OK | todos | ACCESSIBLE (global contextual) |
| calculator | ACTION_EXT | CalculatorView | Calculadora | GLOBAL (extensión) | No | Sí | OK | todos | ACCESSIBLE |
| dashboard('analisis' entrada) | — | — | Dashboard de Tiendas | ANÁLISIS | Sí | Sí | OK | universal | ACCESSIBLE (ver colisión nombres UX-004) |
| exchange-intelligence | ANÁLISIS | ExchangeIntelligenceView | Inteligencia Cambiaria | ANÁLISIS | Sí | Sí | OK | universal | ACCESSIBLE |
| reports | ANÁLISIS | ReportsView | Reportes | ANÁLISIS | Sí | Sí | OK | admin,manager | ACCESSIBLE |
| abc-analysis | ANÁLISIS | ABCView | Análisis ABC | ANÁLISIS | Sí | Sí | OK | universal | ACCESSIBLE (rescatada GATE 0 P1-6) |
| settings/users/roles/health/usage-monitoring/audit/rss_management/fiscal-close | SISTEMA | vistas propias | labels propios | SISTEMA (admin) | Sí | Sí | OK | admin | ACCESSIBLE |
| help/wiki/academy/legal | AYUDA | vistas propias | labels propios | AYUDA | Sí | Sí | OK | universal | ACCESSIBLE |
| ipv | EN DESARROLLO | IPVView (rail interno 23 tabs) | IPV | DESARROLLO (admin) | Sí | Sí | OK | admin | ACCESSIBLE (experimental) |
| pick3-intelligence / wallet | EN DESARROLLO | vistas propias | Pick3 / Billetera | DESARROLLO | Sí | Sí | OK | admin | ACCESSIBLE (experimental) |
| **ofertas** | /?view=ofertas | OfertasView | Ofertas | — (sin dominio) | **No** | **No** | URL válida, contenido sin H1 (browser) | — | **ORPHAN** (UX-010) |
| customers | /?view=customers | CustomersView | Clientes (CRM) | — | No | No | OK render, header miente (UX-002) | — | **ORPHAN** + UX-002 |
| bank-reconciliation | /?view=bank-reconciliation | BankReconciliationView | Conciliación Bancaria | — | No | No | OK render, header miente (UX-002) | — | **ORPHAN** + UX-002 |
| whatsapp-*/telegram-* (10 sub-vistas) | tabs de hubs | vistas propias | tabs | Redes | No (tabs de hub) | No | OK (mapa técnico) | varios | ACCESSIBLE (contextual, coherente) |
| section/group hubs (operacion, analisis, sistema, ayuda, desarrollo, punto_venta, almacen_*, costo, redes…) | render Group/SectionHubView | overview cards | labels sección | navegación | Sí (anclas) | No | OK | según roles | ACCESSIBLE (wayfinding) |
| occ, core, core_tools, tienda, costos, cost_views, cost_gen, cost_templates, cost_tools, analitica, punto_venta, administracion, recursos, otros, ipv_module, ipv_*, gen-quick, gen-expert | LEGACY_VIEW_ALIASES | — | — | migración | No | No | normalizan a canónico | — | LEGACY (alias intencional) |
| /fc/FC.html | /fc/ | MVP PWA standalone (repo fichascosto v12.10.0) | "Ficha de Costos y Gastos" | SUPERFICIE EXTERNA al shell | No (landing "Continuar con Ficha de Costo") | No | OK | sesión COSTPRO o guest | HIDDEN-intencional (fuera de alcance, ver 11) |

## Recuento de estados

- ACCESSIBLE (menú o contextual con camino claro): 44
- HIDDEN (deep-link-only o palette-invisible con UI contextual parcial): 7 (view-assisted, view-reading, templates, massive-gen, steel-calculator, ai-chat, tool-*)
- ORPHAN (sin ningún camino de navegación razonable): 3 (arena-fc*, ofertas, customers, bank-reconciliation) → *arena-fc es el caso más grave del dominio Costo
- DUPLICATED-entrada: 1 (Vitrina: tab hub + vista palette)
- LEGACY: 20 alias (intencionales)
- DEAD: 0 (assertNavigationIntegrity + registry 1:1)

Cada estado tiene evidencia en los archivos 02–11 de esta carpeta.
