/**
 * ════════════════════════════════════════════════════════════════════
 * NAVIGATION DEFINITION — FUENTE ÚNICA DE VERDAD (GATE 1)
 * ════════════════════════════════════════════════════════════════════
 *
 * Arquitectura aprobada (GATE 0.1 + autorización GATE 1):
 *
 *   INICIO (destino fijo: dashboard — NO es sección)
 *   ESTADOS FINANCIEROS → Situación · Rendimiento · Configuración
 *   OPERACIÓN   → Ventas (Vender · Opciones) · FINANZAS (central financiera:
 *                 Servicios Recibidos · Cuentas por Cobrar · Cuentas por
 *                 Pagar · Caja · Ingresos/Egresos — misión
 *                 CP-NAV-FINANCE-REORGANIZATION-001 2026-11-25: la categoría
 *                 «Caja» se RENOMBRA a «FINANZAS» y absorbe las tres vistas
 *                 financieras) ·
 *                 Almacén · Logística · Costo · Gestión de Tiendas · Redes
 *                 (la antigua hoja "Dashboard" se MUDÓ a ANÁLISIS —
 *                 misión Centro de Inteligencia 2026-11-23)
 *   RECURSOS HUMANOS → Trabajadores y Comisiones (trabajadores · reglas de
 *                 comisión · pagos · nóminas de salario SC-4-06)
 *   ANÁLISIS    → Dashboard (Centro de Inteligencia Empresarial — hoja
 *                 primera, ubicación oficial de los dashboards) ·
 *                 Comparar Productos (inteligencia comercial con informe
 *                 ejecutivo — misión 2026-11-23) · Análisis de datos ·
 *                 Inteligencia Cambiaria · Tablón de Noticias · Reportes ·
 *                 Análisis ABC
 *   SISTEMA     → Ajustes · Usuarios · Roles · Salud · Monitoreo · Auditoría ·
 *                 Gestión RSS · Cierre Fiscal   (admin)
 *   AYUDA       → Centro de Ayuda
 *   EN DESARROLLO → IPV · Wiki · Marco Legal
 *                 (existentes pero no integradas / experimentales)
 *
 * CP-INFRA-002 (2026-10-23): Pick3, Billetera y Conciliación Bancaria retiradas
 * del producto activo. CP-INFRA-002b (2026-10-23): Academia retirada igualmente
 * (enlaces, vistas, rutas /api/academy/* y servicios exclusivos).
 *
 * REORGANIZACIÓN (fix/navigation-orphaned-development): Ayuda contiene
 * EXCLUSIVAMENTE el Centro de Ayuda. Wiki/Academia/Marco Legal (antes en
 * Ayuda) y Conciliación Bancaria (huérfana: solo deep-link, decisión FASE B
 * condicionada a Producto — resuelta aquí) viven en EN DESARROLLO. Los
 * roles de cada entrada preservan la visibilidad efectiva EXACTA previa:
 * la sección deja de ser admin-only y son las entradas IPV/Pick3/Billetera
 * las que declaran roles: ['admin'] (mismo acceso efectivo que la
 * herencia de sección anterior; sin cambios de permisos).
 *
 * De ESTE archivo se derivan (no existe ninguna otra lista de navegación):
 *   ├── Sidebar            (sidebar.structure.ts → SIDEBAR_STRUCTURE)
 *   ├── Mobile             (MobileTabBar — tabs + sheet "Más" agrupado)
 *   ├── Breadcrumb         (navigation-map.ts → getBreadcrumbForView)
 *   ├── Command Palette    (actions.ts → SYSTEM_ACTIONS = vistas + ACTION_EXTENSIONS)
 *   ├── Header (título)    (useTerminalNavigation → items derivados)
 *   └── Guard de roles     (sidebar.structure.ts → isViewAllowedForRole)
 *
 * REGLAS:
 *   1. Una acción que representa una VISTA debe declararse aquí.
 *      Las acciones que NO son vistas viven en ACTION_EXTENSIONS (abajo).
 *   2. `route` es opcional: si falta, el `id` ES el ViewType (ruta directa).
 *      Si existe, { view, tab } apunta a una vista-módulo con tab interno
 *      (ej: cost-analytics → cost-sheets + tab cost-analytics).
 *   3. `roles` se hereda del ancestro más cercano que lo defina. Si nadie
 *      lo define, el acceso es universal. La seguridad REAL vive en
 *      backend/RLS — la navegación es cosmética (menú ≠ seguridad).
 *   4. Prohibido crear entradas ficticias: cada entrada apunta a una vista
 *      real verificada (GATE 0 / GATE 0.1).
 */

import {
  Home, Zap, ShoppingCart, Package, Warehouse, ArrowLeftRight, FileText, Calculator,
  Factory, UserCog, LayoutGrid, MessageCircle, Send, TrendingUp, Table2, DollarSign, Truck,
  BarChart4, BarChart3, Settings, Users, ShieldCheck, HeartPulse, Gauge, Shield, Rss,
  Scale, HelpCircle, Book, FlaskConical, Layers, Wallet, Landmark, Building2,
  Receipt, RotateCcw, CreditCard, ClipboardList, Newspaper, Megaphone, Printer,
  ClipboardCheck,
  ReceiptText, Coins, Tags,
  Swords, Wand2, FolderOpen, Upload, Save, Download, PenTool, FileJson, CalendarClock, SlidersHorizontal,
  UsersRound, Settings2,
  GitCompareArrows,
  type LucideIcon,
} from 'lucide-react';

// ────────────────────────────────────────────────────────────────────
// Tipos
// ────────────────────────────────────────────────────────────────────

export interface NavRoute {
  view: string;
  tab?: string;
}

export type NavClass =
  | 'primary'      // acceso inmediato, 1 clic (ej: Terminal de Venta)
  | 'hub'          // agrupador con función real (wayfinding)
  | 'secondary'    // herramienta de dominio
  | 'contextual'   // no navegable desde menú (tarjeta/CTA contextual)
  | 'admin'        // control administrativo
  | 'experimental';// en desarrollo, no compite con producción

export interface NavEntry {
  id: string;
  label: string;
  description?: string;
  icon?: LucideIcon;
  type: 'group' | 'submenu' | 'item';
  route?: NavRoute;
  roles?: string[];
  keywords?: string[];
  isBeta?: boolean;
  isNew?: boolean;
  navClass?: NavClass;
  /** Excluir del sheet móvil "Más" (ej: accesibles por widget/acción). */
  mobileHide?: boolean;
  children?: NavEntry[];
}

// ────────────────────────────────────────────────────────────────────
// HOME ÚNICA (aprobado §1: occ deja de existir como superficie UX)
// ────────────────────────────────────────────────────────────────────

export const HOME_VIEW = 'dashboard';

/** Ítem fijo "Inicio" — primer elemento del sidebar, fuera de secciones. */
export const HOME_ITEM: NavEntry = {
  id: HOME_VIEW,
  label: 'Inicio',
  description: 'AI Command Center: pídele a Darian lo que necesitas — costos, ventas, productos y acciones.',
  icon: Home,
  type: 'item',
  keywords: ['inicio', 'home', 'darian', 'ai', 'asistente', 'dashboard', 'kpi', 'indicadores', 'tablero', 'resumen'],
};

// ────────────────────────────────────────────────────────────────────
// SECCIONES (Nivel 1) → HUBS (Nivel 2) → VISTAS (Nivel 3)
// ────────────────────────────────────────────────────────────────────

export const NAVIGATION_SECTIONS: NavEntry[] = [
  // ═════════════ ESTADOS FINANCIEROS (módulo de primer nivel) ═════════════
  // MISIÓN CP-NAV-FINANCIAL-STATEMENTS-TOP-LEVEL-NAVIGATION-001 (2026-11-22):
  // Estados Financieros deja de ser hoja del grupo OPERACIÓN y pasa a ser
  // SECCIÓN PRINCIPAL independiente, primera del menú, al mismo nivel
  // jerárquico que OPERACIÓN / RECURSOS HUMANOS. Es un NavEntry type 'item'
  // de primer nivel (mismo patrón de acceso directo que «Inicio»): el
  // Sidebar la renderiza con su icono, resaltado activo en todas sus
  // subrutas (isSidebarItemActive: igualdad exacta del ViewType) y acceso
  // directo con un clic — sin desplegar OPERACIÓN ni entrar en focus mode.
  // NO es duplicación: la entrada se RETIRA del grupo operacion (ver
  // comentario allí) y sigue siendo LA MISMA vista ViewType
  // 'financial-statements' — misma ruta (/?view=financial-statements),
  // mismos roles, mismas keywords, mismo icono. Los derivados (paleta,
  // sheet móvil, breadcrumbs, guard) se adaptan a ítems de primer nivel
  // en sus propios walk — sin listas paralelas.
  {
    // MISIÓN CP-FIN (2026-11-13): Vista B — Estados Financieros, generados
    // automáticamente por el motor de partida doble.
    // Roles: superficie financiera de consulta (admin/manager/encargado);
    // el gate REAL de acceso a la tienda lo hace cada RPC server-side.
    // CP-FIN-001 (2026-11-19): el badge «En desarrollo» añadido el 18-11
    // fue RETIRADO por orden del propietario — Estados Financieros se
    // presenta como funcionalidad disponible.
    id: 'financial-statements',
    label: 'Estados Financieros',
    description: 'Situación, rendimiento y dashboard por tienda.',
    icon: BarChart3,
    type: 'item',
    roles: ['admin', 'manager', 'encargado'],
    keywords: ['estados financieros', 'balance', 'situación financiera', 'estado de situación', 'estado de rendimiento', 'resultado', 'utilidad', 'patrimonio', 'activos', 'pasivos', 'partida doble', 'cp-fin', 'ecuación contable', 'dashboard financiero'],
  },
  // ═══════════════════════ OPERACIÓN ═══════════════════════
  {
    id: 'operacion',
    label: 'OPERACIÓN',
    type: 'group',
    icon: Zap,
    description: 'El trabajo diario: vender, mover stock, recibir mercancía y gestionar el ciclo comercial.',
    roles: ['admin', 'manager', 'encargado', 'clerk', 'usuario', 'warehouse'],
    children: [
      // MISIÓN CENTRO DE INTELIGENCIA (2026-11-23): la entrada "Dashboard"
      // (ViewType 'store-dashboard') se RETIRA de OPERACIÓN como ubicación
      // independiente y se MUEVE (sin duplicar: misma vista, misma ruta,
      // mismos roles efectivos) a la sección ANÁLISIS como primera hoja —
      // ubicación oficial y centralizada: Inicio → Análisis → Dashboard.
      // Ver comentario en la sección 'analisis' para el detalle completo.
      // MISIÓN CP-NAV-FINANCIAL-STATEMENTS-TOP-LEVEL-NAVIGATION-001
      // (2026-11-22): la hoja «Estados Financieros» (CP-FIN, Vista B) fue
      // trasladada a SECCIÓN PROPIA de primer nivel — primera del menú. NO
      // se duplica aquí: la única definición vive ahora como NavEntry
      // type 'item' al inicio de NAVIGATION_SECTIONS (misma vista, mismos
      // roles, mismo icono, misma ruta).
      // CAMBIO 4 (HOME/SALES/PERFORMANCE DEFAULTS): grupo explícito "Ventas"
      // con la acción de vender + las opciones administrativas. La antigua
      // entrada plana "Ventas" (sales-hub) pasa a llamarse "Opciones" para
      // eliminar la relación semántica confusa Ventas → Vender → Ventas.
      // Estructura: Ventas ├── Vender └── Opciones.
      {
        id: 'ventas',
        label: 'Ventas',
        description: 'Vender y las opciones administrativas del ciclo comercial.',
        icon: ShoppingCart,
        type: 'submenu',
        navClass: 'hub',
        roles: ['admin', 'manager', 'encargado', 'clerk', 'usuario'],
        children: [
          {
            id: 'pos',
            label: 'Vender',
            description: 'Venta rápida con carrito, atajos de teclado, escáner de código de barras y pago mixto. Incluye el modo Vale de Salida.',
            icon: Zap,
            type: 'item',
            navClass: 'primary',
            roles: ['admin', 'manager', 'encargado', 'clerk', 'usuario'],
            keywords: ['vender', 'venta', 'pos', 'terminal', 'terminal de venta', 'cobrar', 'facturar', 'ticket', 'factura', 'vale de salida'],
          },
          {
            // MISIÓN 2026-11-09 (CP-SALES-PRICE-LIST-001): consulta y PDF de
            // precios de los productos con stock > 0 de la tienda activa,
            // con filtro por rango de SKU. Solo lectura (no modifica
            // productos, inventarios ni precios). Ubicación: inmediatamente
            // después de Vender dentro del grupo Ventas. Permisos: los
            // MISMOS del grupo Ventas / de Vender (herramienta de consulta
            // para el trabajo diario de la tienda).
            id: 'listado-precios',
            label: 'Listado de precios',
            description: 'Consulta los productos con existencias y genera listados de precios PDF por rango de SKU, con vista previa fiel.',
            icon: Tags,
            type: 'item',
            roles: ['admin', 'manager', 'encargado', 'clerk', 'usuario'],
            keywords: ['listado de precios', 'precios', 'lista de precios', 'tarifa', 'sku', 'rango', 'catalogo de precios', 'pdf precios'],
          },
          {
            // CAMBIO 2026-10: acceso directo a Reporte Entrega como hijo del
            // grupo Ventas (entre Vender y Opciones). NAVEGA a la MISMA vista
            // existente `cash_report` (CashReportModal ya elevado a vista en
            // TerminalShell) — sin segunda implementación del reporte.
            // El acceso original DENTRO de Caja (botón "Reporte Entrega" de
            // CashClosureView) queda intacto.
            // Permisos: misma política EFECTIVA que el acceso original — hoy
            // el reporte solo es alcanzable desde la vista Caja, cuyo guard
            // permite admin/manager/encargado/clerk (CashClosureView.tsx:
            // allowedRoles). NO hereda 'usuario' del grupo Ventas para no
            // ampliar privilegios; warehouse tampoco (hoy tampoco accede).
            id: 'cash_report',
            label: 'Reporte Entrega',
            description: 'Reporte de caja con desglose de billetes para la entrega de dinero del día.',
            icon: Printer,
            type: 'item',
            roles: ['admin', 'manager', 'encargado', 'clerk'],
            keywords: ['reporte de entrega', 'entrega', 'reporte', 'desglose de billetes', 'cuadre de efectivo', 'entrega de dinero'],
          },
          {
            // MISIÓN 2026-10-16 (IPV): informe profesional IPV — Ingresos por
            // Ventas con conciliación de inventario. Vista canónica ÚNICA
            // (ipv_ventas → IpvVentasView); el nombre evita la colisión con el
            // módulo experimental 'ipv' (Dexie). Ubicación: Ventas, porque el
            // informe es primariamente de INGRESOS por producto y la audiencia
            // es la misma del Reporte Entrega. Permisos: misma política
            // EFECTIVA que cash_report — NO hereda 'usuario' del grupo para no
            // ampliar privilegios; el backend valida además canViewStore.
            id: 'ipv_ventas',
            label: 'IPV — Ingresos por Ventas',
            description: 'Ingresos por ventas con conciliación de inventario: existencia inicial, movimientos, existencia final e importe vendido por producto.',
            icon: ReceiptText,
            type: 'item',
            roles: ['admin', 'manager', 'encargado', 'clerk'],
            keywords: ['ipv', 'ingresos por ventas', 'ingresos', 'conciliación de inventario', 'existencias', 'kardex', 'saldo inicial', 'reporte de ventas', 'registro de movimientos'],
          },
          {
            id: 'sales-hub',
            label: 'Opciones',
            description: 'Opciones administrativas de ventas: Tabla de Venta, Historial de Ventas, Caja, Venta por Conteo, Devoluciones, Cotizaciones, Clientes y cuentas.',
            icon: ShoppingCart,
            type: 'item',
            navClass: 'hub',
            roles: ['admin', 'manager', 'encargado', 'clerk', 'usuario'],
            keywords: ['opciones', 'ventas', 'venta', 'gestión de ventas', 'tabla de venta', 'historial', 'arqueo', 'conteo', 'devoluciones', 'cotizaciones', 'cuentas'],
          },
        ],
      },
      {
        // MISIÓN CP-NAV-FINANCE-REORGANIZATION-001 (2026-11-25): la categoría
        // «Caja» se RENOMBRA a «FINANZAS» (icono wallet) y se convierte en el
        // punto central del dominio financiero: recibe Servicios Recibidos
        // (mudado desde Logística), Cuentas por Cobrar y Cuentas por Pagar
        // (graduadas de tarjetas del hub Ventas → Opciones a hojas de menú con
        // el patrón de graduación de `cash` 2026-10-20) y conserva sus dos
        // accesos originales (Caja e Ingresos/Egresos). Sin segunda categoría
        // financiera y sin duplicaciones: cada vista mantiene SU única entrada
        // (mismo ViewType, misma ruta, mismos roles). El id técnico cambia
        // caja→finanzas; el deep-link histórico /?view=caja sigue resolviendo
        // vía alias legacy (LEGACY_VIEW_ALIASES) y el ViewType 'caja' se
        // conserva para estados persistidos.
        //
        // MISIÓN INGRESOS/EGRESOS DE CAJA (2026-10-20, historial): la vista
        // 'cash' (arqueo + cierre + reporte) se GRADUÓ de extensión del palette
        // a hoja de menú (misma vista, mismo ViewType) junto a la vista
        // canónica 'ingresos_egresos' (documento Ingreso/Egreso). Permisos
        // 'cash' idénticos desde entonces (admin/manager/encargado/clerk/
        // usuario — móvil la sigue alcanzando por su tab inferior dedicado,
        // por eso mobileHide).
        id: 'finanzas',
        label: 'FINANZAS',
        description: 'Central financiera de la tienda: servicios recibidos, cuentas por cobrar y por pagar, efectivo (turnos, arqueo e ingresos/egresos).',
        icon: Wallet,
        type: 'submenu',
        navClass: 'hub',
        children: [
          {
            // MOVIDO desde Logística (2026-11-25) — MISIÓN
            // CP-NAV-FINANCE-REORGANIZATION-001: el módulo se centraliza en
            // FINANZAS (registro de servicios de terceros con pago a
            // proveedores — dominio financiero). MISIÓN ARQUITECTURA UX
            // (2026-10-23): «Servicios Recibidos» ya se movió de Almacén a
            // Logística — NO se renombra ni se duplica. Mismo ViewType
            // 'received-services', mismas rutas/APIs/BD, mismos roles
            // (admin/manager/encargado/warehouse — visibilidad efectiva
            // EXACTA previa). Keywords ampliadas: buscar «gasto»/«flete» en
            // ⌘K lo encuentra.
            id: 'received-services',
            label: 'Servicios Recibidos',
            description: 'Registro, distribución al costo y pago de servicios de terceros: transporte, aduana, seguro, manipulación y otros gastos de servicios.',
            icon: Truck,
            type: 'item',
            roles: ['admin', 'manager', 'encargado', 'warehouse'],
            keywords: ['servicios', 'servicios recibidos', 'gastos', 'gasto', 'gastos de servicios', 'flete', 'transporte', 'aduana', 'seguro', 'manipulación', 'proveedores', 'pago a proveedores', 'distribución de costos', 'costos distribución'],
          },
          {
            // GRADUADA (2026-11-25) — MISIÓN CP-NAV-FINANCE-REORGANIZATION-001:
            // la vista de cobros a clientes (antes «Cobros por Antigüedad»,
            // tarjeta del hub Ventas → Opciones) pasa a hoja de FINANZAS con
            // el nombre canónico del dominio: «Cuentas por Cobrar». Mismo
            // ViewType 'accounts_receivable', mismas rutas/APIs/BD, mismos
            // roles EXACTOS de la extensión histórica. Las keywords conservan
            // «cobros por antigüedad» para no romper búsquedas existentes.
            // ORDEN (mandato §5): Cuentas por Cobrar ANTES de Cuentas por Pagar.
            id: 'accounts_receivable',
            label: 'Cuentas por Cobrar',
            description: 'Antigüedad de saldos de clientes: órdenes de producción/servicio con saldo pendiente. Filtra por vencimiento y exporta a CSV.',
            icon: CreditCard,
            type: 'item',
            roles: ['admin', 'manager', 'encargado', 'clerk', 'usuario'],
            keywords: ['cobros', 'cuentas por cobrar', 'cxc', 'clientes', 'antigüedad', 'por cobrar', 'cobros por antigüedad'],
          },
          {
            // GRADUADA (2026-11-25) — MISIÓN CP-NAV-FINANCE-REORGANIZATION-001:
            // «Cuentas por Pagar» deja de ser tarjeta del hub Ventas → Opciones
            // (retirada de SALES_HUB_PALETTE_ENTRIES y de SECONDARY_CARDS) y
            // pasa a hoja de FINANZAS. Mismo ViewType 'accounts_payable',
            // mismas rutas/APIs/BD, mismos roles EXACTOS de la extensión
            // histórica (admin/manager/encargado/clerk/usuario). Sin
            // mobileHide: el sheet móvil la expone bajo FINANZAS (punto
            // central del dominio). El id ES el ViewType (sin route).
            id: 'accounts_payable',
            label: 'Cuentas por Pagar',
            description: 'Antigüedad de saldos: recepciones, servicios recibidos y comisiones. Filtra por vencimiento, paga a proveedores y exporta a Excel.',
            icon: CreditCard,
            type: 'item',
            roles: ['admin', 'manager', 'encargado', 'clerk', 'usuario'],
            keywords: ['cuentas por pagar', 'cxp', 'pagar', 'proveedores', 'vencimientos', 'deudas'],
          },
          {
            id: 'cash',
            label: 'Caja',
            description: 'Abre y cierra turnos, declara fondos, reconcilia efectivo y genera el reporte de entrega del día.',
            icon: DollarSign,
            type: 'item',
            roles: ['admin', 'manager', 'encargado', 'clerk', 'usuario'],
            mobileHide: true,
            keywords: ['caja', 'arqueo', 'turno', 'cierre de caja', 'efectivo', 'fondo', 'reporte de entrega'],
          },
          {
            // MISIÓN 2026-10-20: documento «Ingresos/Egresos» — registro de
            // entradas/salidas físicas de efectivo (fondo de cambio y otros
            // autorizados). Permisos: espejo del backend (registrar exige
            // admin/manager/encargado/clerk con membresía) — 'usuario' y
            // 'warehouse' NO ven la hoja para no ampliar la superficie de
            // operaciones financieras. Keywords SIN «caja» (Gate 1: la
            // búsqueda «caja» debe resolver UNA acción — la vista Caja).
            id: 'ingresos_egresos',
            label: 'Ingresos/Egresos',
            description: 'Documentos de entrada y salida de efectivo: constitución, reposición y devolución del fondo de cambio, y otros movimientos autorizados.',
            icon: Coins,
            type: 'item',
            roles: ['admin', 'manager', 'encargado', 'clerk'],
            isNew: true,
            keywords: ['ingresos', 'egresos', 'ingresos y egresos', 'fondo de cambio', 'fondo', 'constitución del fondo', 'reposición del fondo', 'devolución del fondo', 'movimientos de efectivo', 'entrada de dinero', 'salida de dinero', 'comprobante'],
          },
        ],
      },
      {
        id: 'almacen_gestion',
        label: 'Almacén',
        description: 'Existencias, catálogo, ajustes documentales y etiquetas.',
        icon: Package,
        type: 'submenu',
        navClass: 'hub',
        children: [
          {
            id: 'inventory',
            label: 'Inventario',
            description: 'Stock actual por producto, catálogo maestro y trazabilidad de movimientos. Tabs: Stock | Catálogo | Trazabilidad.',
            icon: Package,
            type: 'item',
            navClass: 'primary',
            roles: ['admin', 'manager', 'encargado', 'warehouse'],
            keywords: ['stock', 'inventario', 'existencias', 'productos', 'catálogo', 'trazabilidad'],
          },
          {
            // MÓDULO DE INVENTARIO FÍSICO (misión 2026-10-23): conteos por tienda
            // y fecha de corte, hojas PDF (con teóricas o CIEGAS), importación
            // Excel validada, conciliación de diferencias y ajustes documentales
            // generados desde el propio proceso (vinculados por
            // inventory_adjustments.source_physical_inventory_id).
            id: 'physical_inventory',
            label: 'Inventario Físico',
            description: 'Conteos físicos por tienda y fecha de corte: hojas de conteo PDF (incluye modo ciego), importación Excel validada, conciliación de diferencias y ajustes documentales autorizados.',
            icon: ClipboardCheck,
            type: 'item',
            roles: ['admin', 'manager', 'encargado', 'warehouse'],
            keywords: ['inventario físico', 'conteo', 'almacén', 'conciliación', 'faltante', 'sobrante', 'stocktake', 'hoja de conteo', 'conteo ciego'],
          },
          {
            id: 'inventory_adjustments',
            label: 'Ajustes Documentales',
            description: 'Ajustes de inventario con justificación documental (mermas, sobrantes, correcciones).',
            icon: ArrowLeftRight,
            type: 'item',
            roles: ['admin', 'manager', 'encargado'],
            keywords: ['ajuste', 'merma', 'corrección', 'inventario', 'documental'],
          },
          {
            // MISIÓN RESOLUCIÓN 11 (2026-10-31): vista documental de la
            // Solicitud de Materiales — Modelo SC-2-07 «Solicitud de Entrega»
            // (Res. 11/2007 MFP, Gaceta Oficial 015/2007, Anexo Único). Flujo
            // documental con el estándar de Ajustes Documentales (borrador →
            // revisión → confirmación/anulación), listado dual tarjetas/tabla
            // (mismo comportamiento que Vales de Salida) y numeración
            // consecutiva SM-NNNNNN-YYYY por tienda.
            id: 'solicitud_materiales',
            label: 'Solicitud de Materiales',
            description: 'Solicitudes de entrega de productos para consumo de la unidad solicitante (Modelo SC-2-07, Res. 11/2007 MFP): borrador, revisión, confirmación y anulación con trazabilidad.',
            icon: ClipboardList,
            type: 'item',
            roles: ['admin', 'manager', 'encargado', 'warehouse', 'clerk', 'usuario'],
            keywords: ['solicitud', 'materiales', 'solicitud de materiales', 'solicitud de entrega', 'sc-2-07', 'resolución 11', 'pedido', 'requisición', 'consumo interno'],
          },
          {
            // Vista documental de Vales de Salida (issue_slips). Módulo PROPIO:
            // listado dual (tarjetas/tabla), detalle documental real (VALE DE SALIDA
            // + movimientos vía reference_id), devolución vía reversión contable
            // existente y flujo DEDICADO de creación (misma RPC create_vale_salida,
            // misma numeración VS-NNNNNN-YYYY — cero duplicación de lógica).
            // El acceso desde Vender continúa como mecanismo operativo independiente.
            id: 'vales_salida',
            label: 'Vales de Salida',
            description: 'Centro documental de Vales de Salida: consulta, detalle, trazabilidad y devolución de vales emitidos.',
            icon: FileText,
            type: 'item',
            roles: ['admin', 'manager', 'encargado', 'warehouse', 'clerk', 'usuario'],
            keywords: ['vale', 'vales', 'salida', 'issue slip', 'consumo interno', 'merma', 'descarga', 'documento'],
          },
          {
            id: 'labels',
            label: 'Etiquetas y Códigos',
            description: 'Genera etiquetas con código de barras y QR para imprimir en productos y estantes.',
            icon: Table2,
            type: 'item',
            roles: ['admin', 'manager', 'encargado'],
            keywords: ['etiquetas', 'códigos', 'barras', 'qr', 'imprimir'],
          },
        ],
      },
      {
        id: 'almacen_operaciones',
        label: 'Logística',
        // CP-NAV-FINANCE-REORGANIZATION-001 (2026-11-25): «Servicios Recibidos»
        // abandona el hub (description y keywords actualizadas en consecuencia).
        description: 'Abastecimiento: recepciones, órdenes de compra y transferencias entre tiendas.',
        icon: Truck,
        type: 'submenu',
        navClass: 'hub',
        children: [
          {
            id: 'reception_list',
            label: 'Recepciones',
            description: 'Historial de recepciones de mercancía. Crea nuevas con OCR, escaneo y validación contra OC.',
            icon: Warehouse,
            type: 'item',
            navClass: 'primary',
            roles: ['admin', 'manager', 'encargado', 'warehouse'],
            keywords: ['recibir', 'recepciones', 'mercancía', 'entradas', 'proveedor'],
          },
          // MISIÓN CP-NAV-FINANCE-REORGANIZATION-001 (2026-11-25): la hoja
          // «Servicios Recibidos» (received-services) SE MUDÓ a FINANZAS
          // (misma vista ViewType, mismas rutas/APIs/BD, mismos roles —
          // ver el bloque FINANZAS). NO se duplica aquí: la única definición
          // vive como hijo del submenú 'finanzas'. Historial previo: llegó a
          // Logística desde Almacén (MISIÓN ARQUITECTURA UX 2026-10-23).
          {
            id: 'purchase-orders',
            label: 'Órdenes de Compra',
            description: 'Crea pedidos a proveedores, haz seguimiento de OCs y recibe mercancía contra OC.',
            icon: FileText,
            type: 'item',
            roles: ['admin', 'manager', 'encargado', 'warehouse'],
            keywords: ['órdenes', 'compra', 'pedidos', 'proveedores', 'oc'],
          },
          {
            id: 'transferencias',
            label: 'Transferencia Stock',
            description: 'Transfiere productos entre tiendas con tracking de envío, tránsito y recepción.',
            icon: ArrowLeftRight,
            type: 'item',
            roles: ['admin', 'manager', 'encargado', 'warehouse'],
            keywords: ['transferencia', 'mover', 'traslado', 'sucursales', 'almacenes'],
          },
        ],
      },
      {
        // MISIÓN FECHAS DE TRABAJO (2026-10-18): grupo «Control operativo» —
        // centro transversal de control del estado temporal de la operación.
        // Vista canónica ÚNICA (work_dates → WorkDatesView). Permisos: mismos
        // roles que el resto de OPERACIÓN (consulta de límites es lectura;
        // la preferencia es personal usuario+tienda; el backend revalida
        // toda fecha de documento — el menú no es el mecanismo de seguridad).
        id: 'control_operativo',
        label: 'Control operativo',
        description: 'Control transversal de la operación: fechas de trabajo por tipo de movimiento y límites de la política temporal.',
        icon: SlidersHorizontal,
        type: 'submenu',
        navClass: 'hub',
        children: [
          {
            id: 'work_dates',
            label: 'Fechas de trabajo',
            description: 'Consulta y gestiona la fecha efectiva del próximo documento de cada tipo de movimiento: venta, recepción, vale, servicio, transferencia y más, con sus límites mínimo y máximo.',
            icon: CalendarClock,
            type: 'item',
            keywords: ['fechas de trabajo', 'fecha', 'fecha operativa', 'fecha efectiva', 'política temporal', 'backdating', 'retro-fechar', 'mínimo', 'máximo', 'zona horaria', 'control operativo'],
          },
        ],
      },
      {
        // Único concepto "Costo" (grupo raíz COSTOS disuelto — GATE 0.1 §12).
        // Roles unificados: encargado conserva su acceso actual al dominio
        // (veía COSTOS raíz; decisión documentada GATE 0.1 D-Costos).
        id: 'costo',
        label: 'Costo',
        description: 'Fichas de costo, estructura, costeo dinámico y órdenes de producción.',
        icon: Calculator,
        type: 'submenu',
        navClass: 'hub',
        roles: ['admin', 'manager', 'encargado', 'costo'],
        children: [
          {
            id: 'cost-sheets',
            label: 'Fichas de Costo',
            description: 'Herramienta de fichas de costo: Experto (trabajo completo), Generar, Generación Masiva, Análisis de Fichas y Arena FC (beta).',
            icon: FileText,
            type: 'item',
            // GATE 1.4R.1 (mandato §1/§4/§6): el clic abre el NÚCLEO DE TRABAJO
            // (Experto — ex "Tablero Principal"). Antes route.tab era 'gen-easy'
            // y el módulo aterrizaba en "Generar Fácil"; con la navegación de
            // segundo nivel (CostSheetModuleNav) el resto del módulo queda a un
            // clic y el núcleo deja de estar relegado.
            route: { view: 'cost-sheets', tab: 'main' },
            roles: ['admin', 'manager', 'encargado', 'costo'],
            keywords: ['ficha', 'costo', 'generar', 'generar ficha', 'costeo', 'plantillas', 'arena', 'experto'],
          },
          {
            id: 'estructura-costo',
            label: 'Estructura de Costo',
            description: 'Composición del costo de cada producto: base, transportación, manipulación, comisiones, servicios, variación cambiaria.',
            icon: Calculator,
            type: 'item',
            roles: ['admin', 'manager', 'encargado', 'costo'],
            keywords: ['estructura', 'costo', 'composición', 'producto'],
          },
          {
            id: 'costeo-dinamico',
            label: 'Costeo Dinámico',
            description: 'Costo real de reposición absorbiendo servicios, comisiones e impacto cambiario.',
            icon: DollarSign,
            type: 'item',
            roles: ['admin', 'manager', 'encargado', 'costo'],
            keywords: ['costeo', 'dinámico', 'reposición', 'absorción'],
          },
          {
            id: 'production-orders',
            label: 'Órdenes de Producción y Trabajo',
            description: 'Órdenes de producción y servicio con presupuesto, salidas de inventario, anticipos y cierre con producto terminado.',
            icon: Factory,
            type: 'item',
            roles: ['admin', 'manager', 'encargado', 'costo'],
            keywords: ['órdenes', 'producción', 'trabajo', 'servicio', 'presupuesto'],
          },
        ],
      },
      {
        // Hub real (GATE 0.1 §3-D: nombre correcto, alcance = ciclo de vida completo).
        // FASE B (UX-005): el Tablón salió del hub (sección ANÁLISIS) — la
        // keyword 'tablón' se retira para no desviar la búsqueda hacia el hub.
        // CP-UX-ORG-STORES-001: el LISTADO de tiendas de cada organización vive
        // en SISTEMA → Organizaciones → tab Tiendas; el hub queda con la
        // configuración de la TIENDA ACTIVA + resumen consolidado + vitrina +
        // catálogo.
        // MISIÓN 2026-11-13: «Trabajadores y Comisiones» vivía aquí (hoja plana
        // entre Costo y este hub) — se MUDÓ a la nueva sección RECURSOS
        // HUMANOS (ver abajo).
        id: 'management-hub',
        label: 'Gestión de Tiendas',
        description: 'Configura la tienda activa (datos, identidad visual, facturación) y consulta el resumen consolidado, la vitrina y el catálogo.',
        icon: LayoutGrid,
        type: 'item',
        navClass: 'hub',
        roles: ['admin', 'manager', 'encargado'],
        keywords: ['tiendas', 'gestión', 'sucursales', 'configuración tienda', 'vitrina', 'backup', 'kpi tiendas'],
      },
      {
        // MISIÓN CLASIFICADOR MAESTRO (FASE 3): registro maestro de terceros de
        // la organización (clientes y proveedores), compartido con las tiendas
        // conectadas. Entrada ÚNICA en OPERACIÓN — no duplica 'clientes' (CRM
        // por tienda, colgante del hub Ventas) ni crea hub propio.
        id: 'clientes-proveedores',
        label: 'Clientes y Proveedores',
        description: 'Clasificador Maestro de terceros de la organización: alta única de clientes y proveedores compartida entre tiendas, con trazabilidad y estado.',
        icon: Users,
        type: 'item',
        navClass: 'primary',
        roles: ['admin', 'manager', 'encargado'],
        keywords: ['clientes', 'proveedores', 'terceros', 'clasificador', 'maestro', 'nit', 'alta cliente', 'alta proveedor'],
      },
      {
        // DASHBOARD V3 (feat/dashboard-v3-audit-ux): Auditoría se MUEVE desde
        // SISTEMA a OPERACIÓN, inmediatamente después de "Gestión de Tiendas"
        // (solicitud explícita del usuario). Mismo ViewType 'audit', misma
        // vista, mismo deep-link — NO se duplica la entrada. El roles explícito
        // ['admin'] PRESERVA la visibilidad efectiva previa (SISTEMA es
        // admin-only; isViewAllowedForRole usa el allowedRoles más cercano,
        // así que clerk/encargado siguen sin verla — gate1-navigation.test).
        id: 'audit',
        label: 'Auditoría',
        description: 'Historial de actividad de la operación en lenguaje claro: qué ocurrió, cuándo y quién. Con detalle técnico y documentos asociados.',
        icon: Shield,
        type: 'item',
        navClass: 'admin',
        roles: ['admin'],
        keywords: ['auditoría', 'logs', 'trazabilidad', 'quién hizo', 'eventos', 'csv', 'historial', 'actividad'],
      },
      {
        id: 'redes',
        label: 'Redes',
        description: 'Bots de WhatsApp y Telegram por tienda.',
        icon: MessageCircle,
        type: 'submenu',
        navClass: 'hub',
        roles: ['admin', 'manager', 'encargado'],
        children: [
          {
            id: 'whatsapp-hub',
            label: 'WhatsApp',
            description: 'Conecta WhatsApp por tienda, responde consultas con IA y gestiona el grupo de ventas. Tabs: Dashboard, Config, Conversaciones, Grupo, Invitaciones.',
            icon: MessageCircle,
            type: 'item',
            keywords: ['whatsapp', 'bot', 'mensajes', 'conversaciones', 'grupo'],
          },
          {
            id: 'telegram-hub',
            label: 'Telegram',
            description: 'Bot de Telegram por tienda, serverless-native, responde consultas con IA y gestiona el grupo de ventas. Tabs: Dashboard, Config, Conversaciones, Grupo, Invitaciones.',
            icon: Send,
            type: 'item',
            keywords: ['telegram', 'bot', 'mensajes', 'conversaciones', 'grupo'],
          },
        ],
      },
    ],
  },

  // ═══════════════════════ RECURSOS HUMANOS ═══════════════════════
  // MISIÓN 2026-11-13 (encargo del propietario, tras la misión NÓMINAS
  // SC-4-06 / PR #1607): el módulo «Trabajadores y Comisiones» deja de ser
  // hoja plana de OPERACIÓN y se MUEVE (no se duplica: mismo ViewType
  // 'workers', mismos deep-links, mismos roles) a su propia sección de
  // dominio. Razón: tras PR #1607 el módulo es RRHH completo (trabajadores +
  // reglas de comisión + pagos + nóminas de salario Res. 13/2007 MFP) y ya
  // no encaja en el alcance declarado de OPERACIÓN («vender, mover stock,
  // recibir mercancía y gestionar el ciclo comercial»). Precedente de
  // sección con un único ítem: AYUDA → Centro de Ayuda. El legacy 'recursos'
  // (MÁS RECURSOS, disuelto en GATE 0.1 → AYUDA) NO es recursos humanos:
  // ids distintos ('recursos-humanos' ≠ alias 'recursos'), sin colisión.
  {
    id: 'recursos-humanos',
    label: 'RECURSOS HUMANOS',
    type: 'group',
    icon: UsersRound,
    description: 'Gestión del personal de la tienda: trabajadores, reglas de comisión, pagos y nóminas de salario.',
    roles: ['admin', 'manager', 'encargado'],
    children: [
      {
        // MOVIDA desde OPERACIÓN (2026-11-13) — misión RRHH tras Nóminas
        // SC-4-06. El roles explícito PRESERVA la visibilidad efectiva
        // EXACTA previa (mismo patrón que el traslado de Auditoría).
        id: 'workers',
        label: 'Trabajadores y Comisiones',
        description: 'CRUD de trabajadores por tienda, reglas de comisión versionables, cálculo por periodo, pagos con auditoría y nóminas de salario (Modelo SC-4-06, Res. 13/2007 MFP).',
        icon: UserCog,
        type: 'item',
        roles: ['admin', 'manager', 'encargado'],
        keywords: ['trabajadores', 'empleados', 'comisiones', 'pagos', 'nómina', 'nóminas', 'salario', 'salarios', 'payroll', 'recursos humanos', 'rrhh', 'personal', 'sc-4-06'],
      },
    ],
  },

  // ═══════════════════════ ANÁLISIS ═══════════════════════
  {
    id: 'analisis',
    label: 'ANÁLISIS',
    type: 'group',
    icon: TrendingUp,
    description: 'Centro de Inteligencia Empresarial: dashboards de la tienda, KPIs de datos, cambiaria, Tablón de Noticias y reportes.',
    roles: ['admin', 'manager', 'encargado'],
    children: [
      {
        // MISIÓN CENTRO DE INTELIGENCIA (2026-11-23): ubicación OFICIAL y
        // centralizada de los dashboards de COSTPRO: Inicio → Análisis →
        // Dashboard. La entrada se MUEVE desde OPERACIÓN (donde era la hoja
        // "Dashboard" independiente) — MISMA vista ViewType 'store-dashboard',
        // misma ruta (/?view=store-dashboard), MISMO icono; sin duplicación
        // (no duplicar hubs). La vista es el Centro de Inteligencia
        // Empresarial: navegación interna por módulos (Resumen ejecutivo,
        // Análisis de ventas) con arquitectura de registro para incorporar
        // dashboards futuros sin modificar la navegación principal.
        //
        // Roles: la entrada declara EXPLÍCITAMENTE los roles que HEREDABA del
        // grupo OPERACIÓN para PRESERVAR la visibilidad efectiva exacta
        // (antes alcanzable por admin/manager/encargado/clerk/usuario/
        // warehouse vía herencia de OPERACIÓN). Sin cambio de permisos.
        id: 'store-dashboard',
        label: 'Dashboard',
        description: 'Centro de Inteligencia Empresarial: resumen ejecutivo de la tienda activa y análisis de ventas, con arquitectura abierta a nuevos dashboards.',
        icon: TrendingUp,
        type: 'item',
        navClass: 'primary',
        roles: ['admin', 'manager', 'encargado', 'clerk', 'usuario', 'warehouse'],
        keywords: ['dashboard', 'centro de inteligencia', 'business intelligence', 'resumen ejecutivo', 'tienda', 'kpi', 'indicadores', 'consolidado', 'resumen', 'análisis de ventas', 'ventas', 'productos', 'comportamiento', 'insights', 'desviaciones', 'alertas'],
      },
      {
        // MISIÓN COMPARAR PRODUCTOS (2026-11-23): ubicación OFICIAL de la
        // herramienta de inteligencia comercial «Comparar Productos». Antes la
        // vista solo era alcanzable desde el botón del Ranking Comercial del
        // Inicio — sin registro en el árbol el breadcrumb caía en el fallback
        // ("product comparison" + "Módulo No Disponible"). Ahora es hoja de
        // ANÁLISIS (misma vista ViewType 'product-comparison', misma ruta
        // /?view=product-comparison; el botón del Inicio se conserva).
        //
        // Roles: declara EXPLÍCITAMENTE TODOS los roles operativos para
        // PRESERVAR el acceso universal efectivo (antes cualquier rol llegaba
        // por el botón del Inicio; heredar de ANÁLISIS [admin, manager,
        // encargado] lo habría restringido). Sin cambio de permisos.
        id: 'product-comparison',
        label: 'Comparar Productos',
        description: 'Inteligencia comercial: compara el ranking de productos entre el mes en curso y el mismo tramo del mes anterior, con informe ejecutivo descargable.',
        icon: GitCompareArrows,
        type: 'item',
        navClass: 'primary',
        roles: ['admin', 'manager', 'encargado', 'clerk', 'usuario', 'warehouse'],
        keywords: ['comparar', 'comparación', 'productos', 'ranking', 'evolución', 'ventas', 'crecimiento', 'descenso', 'informe ejecutivo', 'inteligencia comercial', 'variación', 'top'],
      },
      {
        // GATE 1.4R (UX-004/§7) + CAMBIO 8 (HOME/SALES/PERFORMANCE DEFAULTS):
        // "Análisis de Fichas" no comunicaba QUÉ analiza. Label = "Análisis de
        // datos" (análisis de datos de costos/márgenes de las fichas). El
        // viewId técnico `cost-analytics` se conserva (sin migraciones
        // internas). ÚNICO acceso canónico al análisis: la entrada del menú
        // ANÁLISIS (el tab "Análisis" del rail interno del módulo Fichas de
        // Costo se retira — CAMBIO 7, sin eliminar funcionalidad).
        id: 'cost-analytics',
        label: 'Análisis de datos',
        description: 'Analiza costos, márgenes y rentabilidad de tus fichas de costo: tabla dinámica con drag & drop, plantillas y gráficos.',
        icon: Table2,
        type: 'item',
        route: { view: 'cost-sheets', tab: 'cost-analytics' },
        keywords: ['análisis de datos', 'análisis de fichas', 'fichas', 'tablero', 'dinámico', 'análisis', 'pivot', 'márgenes', 'rentabilidad', 'costos', 'productos'],
      },
      {
        id: 'exchange-intelligence',
        label: 'Inteligencia Cambiaria',
        description: 'Tasas oficiales vs informales, impacto en precios, alertas estratégicas y simulador de escenarios.',
        icon: DollarSign,
        type: 'item',
        keywords: ['cambiaria', 'divisas', 'tasas', 'devaluación', 'mlc', 'usd', 'simulador'],
      },
      {
        // FASE B (UX-005 · GATE 1.4P): el Tablón es inteligencia de mercado
        // GLOBAL/TRANSVERSAL (lector RSS económico-fiscal sin store_id; no
        // cambia con activeStoreId). Deja el hub Gestión de Tiendas, donde
        // llegó como efecto mecánico de una reducción de menú (commit
        // b8c15082), y se ubica junto a Inteligencia Cambiaria (mismo dominio:
        // tasas BCC, normativa, comercio exterior). Roles = los del tab
        // histórico (todos) para PRESERVAR el deep-link universal y la
        // palette de roles operativos; la visibilidad del menú sigue el guard
        // de la sección. La contradicción de roles queda documentada en
        // GATE 1.4P/FASE B como hallazgo B-adjunto (sin cambio de permisos).
        id: 'news',
        label: 'Tablón de Noticias',
        description: 'Lector de noticias económicas y fiscales (BCC, FMI, ONAT, Gaceta Oficial…) con detección de tasas de cambio. Transversal: no depende de la tienda activa.',
        icon: Newspaper,
        type: 'item',
        roles: ['admin', 'manager', 'encargado', 'clerk', 'usuario', 'warehouse'],
        keywords: ['tablón', 'noticias', 'noticias económicas', 'información', 'rss', 'tasas de cambio', 'mercado', 'fiscal', 'gaceta'],
      },
      {
        id: 'reports',
        label: 'Reportes',
        description: 'Diseña y genera reportes profesionales en PDF/Excel con filtros y agrupaciones personalizadas.',
        icon: BarChart4,
        type: 'item',
        roles: ['admin', 'manager'],
        keywords: ['reportes', 'informes', 'pdf', 'excel', 'estadísticas', 'ventas'],
      },
      {
        // Huérfana madura con API propia (GATE 0 P1-6) — rescatada a ANÁLISIS
        id: 'abc-analysis',
        label: 'Análisis ABC',
        description: 'Clasificación ABC de productos por impacto en ventas: identifica los artículos que generan la mayor parte del ingreso.',
        icon: BarChart3,
        type: 'item',
        keywords: ['abc', 'análisis', 'productos', 'clasificación', 'pareto'],
      },
      // MISIÓN INTEGRAL 2026-11-22 (§9): «Configuración de Documentos» se
      // trasladó a SISTEMA (su naturaleza es administrativa, no analítica).
      // La entrada se eliminó de ANÁLISIS sin duplicarla; el acceso
      // contextual desde Estados Financieros (pestaña «Configuración»)
      // conduce a ESTA ruta canónica.
    ],
  },

  // ═══════════════════════ SISTEMA (admin + acceso manager a document-config) ═══════════════════════
  {
    id: 'sistema',
    label: 'SISTEMA',
    type: 'group',
    icon: Settings,
    description: 'Configuración y control administrativo del tenant: configuración de documentos, usuarios, roles, salud y monitoreo.',
    // Misión integral 2026-11-22 (§9): la sección abre a manager para que
    // «Configuración de Documentos» conserve su acceso histórico
    // (admin/manager). Cada hijo fija SU rol explícito — los administrativos
    // quedan en ['admin'] (idéntico al alcance efectivo anterior, que
    // heredaba admin de la sección), y document-config mantiene su par
    // admin/manager. El filtrado por sección elimina grupos vacíos.
    roles: ['admin', 'manager'],
    children: [
      {
        // MISIÓN CP-FIN (2026-11-13) · MISIÓN INTEGRAL 2026-11-22 (§9.2):
        // Vista A — Configuración de Documentos. Ubicación OFICIAL: SISTEMA.
        // Administra las reglas de partida doble del motor financiero por
        // tipo documental (plantillas de movimientos, simulador, versiones).
        // Roles: mínimo privilegio financiero (admin/manager); el gate REAL
        // de activación lo hace el motor (admin de tienda) server-side.
        id: 'document-config',
        label: 'Configuración de Documentos',
        description: 'Reglas de partida doble y efectos económicos por tipo de documento: constructor de movimientos, simulador y versiones de reglas.',
        icon: Settings2,
        type: 'item',
        route: { view: 'document-config' },
        roles: ['admin', 'manager'],
        keywords: ['configuración de documentos', 'partida doble', 'reglas', 'motor financiero', 'débito', 'crédito', 'asientos', 'contabilización', 'categorías económicas', 'saldos iniciales', 'apertura financiera', 'cp-fin', 'simulador'],
      },
      {
        // Única entrada a settings (las 4 duplicadas mueren)
        id: 'settings',
        label: 'Ajustes',
        description: 'Preferencias personales (tema, conectividad), claves de IA e impuestos por tienda, y plan y límites.',
        icon: Settings,
        type: 'item',
        navClass: 'admin',
        roles: ['admin'],
        keywords: ['ajustes', 'configuración', 'preferencias', 'tema', 'impuestos', 'plan', 'perfil'],
      },
      {
        // MISIÓN ORGANIZACIONES (2026-10-26): administración de las empresas
        // que agrupan tiendas. Se ubica ANTES de Usuarios: primero se
        // administra la estructura de empresas, después las personas que
        // pertenecen a ellas.
        // CP-UX-ORG-STORES-001: desde aquí se administra TAMBIÉN el listado de
        // tiendas de cada organización (detalle de la empresa → tab Tiendas).
        id: 'organizations',
        label: 'Organizaciones',
        description: 'Gestiona las empresas (organizaciones) que agrupan tiendas y usuarios: creación, estado y administración de las tiendas de cada empresa.',
        icon: Building2,
        type: 'item',
        navClass: 'admin',
        roles: ['admin'],
        keywords: ['organizaciones', 'empresas', 'tenants', 'grupos', 'compañías', 'tiendas de la organización'],
      },
      {
        id: 'users',
        label: 'Usuarios',
        description: 'Crea, edita y desactiva usuarios del tenant. Asigna memberships por tienda con roles granulares.',
        icon: Users,
        type: 'item',
        navClass: 'admin',
        roles: ['admin'],
        keywords: ['usuarios', 'equipo', 'personal', 'memberships', 'acceso'],
      },
      {
        id: 'roles',
        label: 'Roles',
        description: 'Configura roles y permisos de acceso al sistema. Define qué puede hacer cada rol en cada módulo.',
        icon: ShieldCheck,
        type: 'item',
        navClass: 'admin',
        roles: ['admin'],
        keywords: ['roles', 'permisos', 'seguridad', 'privilegios'],
      },
      {
        id: 'health',
        label: 'Salud',
        description: 'Estado comprobado de COSTPRO bajo demanda: comprobaciones de API, base de datos y sesión, fuentes de conocimiento y documentación.',
        icon: HeartPulse,
        type: 'item',
        navClass: 'admin',
        roles: ['admin'],
        keywords: ['salud', 'status', 'salud plataforma', 'diagnóstico', 'comprobaciones', 'latencia'],
      },
      {
        id: 'usage-monitoring',
        label: 'Monitoreo',
        description: 'Consumo estimado de Vercel + Supabase, alertas antes de límites (60/80/90%) y forecast mensual.',
        icon: Gauge,
        type: 'item',
        navClass: 'admin',
        roles: ['admin'],
        keywords: ['monitoreo', 'uso', 'consumo', 'vercel', 'supabase', 'límites', 'forecast'],
      },
      {
        // DASHBOARD V3: la entrada 'audit' se MOVIO a OPERACIÓN (después de
        // "Gestión de Tiendas"). SISTEMA conserva el resto de entradas admin.
        id: 'rss_management',
        label: 'Gestión RSS',
        description: 'Configura feeds RSS externos (noticias fiscales, contables, regulatorias) para el Tablón de Noticias.',
        icon: Rss,
        type: 'item',
        navClass: 'admin',
        roles: ['admin'],
        keywords: ['rss', 'feeds', 'tablón', 'noticias', 'fuentes'],
      },
      {
        // Huérfana admin real (inmutabilidad v2_19_5) — rescatada a SISTEMA
        id: 'fiscal-close',
        label: 'Cierre Fiscal',
        description: 'Cierre de periodo fiscal con inmutabilidad de registros: consolida y bloquea el periodo cerrado.',
        icon: Shield,
        type: 'item',
        navClass: 'admin',
        roles: ['admin'],
        keywords: ['cierre', 'fiscal', 'periodo', 'inmutabilidad', 'consolidar'],
      },
    ],
  },

  // ═══════════════════════ AYUDA ═══════════════════════
  // REORGANIZACIÓN (fix/navigation-orphaned-development): Ayuda contiene
  // EXCLUSIVAMENTE el Centro de Ayuda (mandato de producto). Wiki/Academia/
  // Marco Legal se trasladan a EN DESARROLLO — mismas vistas, mismos
  // deep-links, mismos roles efectivos (universales).
  {
    id: 'ayuda',
    label: 'AYUDA',
    type: 'group',
    icon: HelpCircle,
    description: 'Documentación de la app. El "?" del header es ayuda contextual de la vista actual.',
    children: [
      {
        id: 'help',
        label: 'Centro de Ayuda',
        description: 'Documentación de la app para operadores: guías por módulo, búsqueda, glosario y modo lectura.',
        icon: HelpCircle,
        type: 'item',
        keywords: ['ayuda', 'soporte', 'guía', 'tutorial', 'documentación', 'faq'],
      },
    ],
  },

  // ═════════════════ EN DESARROLLO (existentes no integradas) ═════════════════
  // REORGANIZACIÓN (fix/navigation-orphaned-development): semántica exacta
  // del mandato — funcionalidades EXISTENTES pero todavía no integradas
  // como parte del flujo principal del producto.
  //
  // COSTPRO 4 (fix/usuarios-en-desarrollo-admin — mandato del propietario):
  // la sección COMPLETA queda reservada al rol `admin`. La regla se declara
  // UNA vez aquí y se propaga por herencia a TODAS las superficies derivadas:
  // sidebar (filterModulesByRole), palette (getActionsForUser vía
  // flattenNavigation), móvil (mismo filtro), deep-links (isViewAllowedForRole
  // → «Acceso Denegado» en TerminalShell) y widgets (RecommendedActions).
  // ipv/pick3/wallet ya declaraban roles:['admin'] por entrada (se conservan);
  // wiki/legal heredan ['admin'] de la sección
  // (antes universales — el mandato revoca ese acceso universal).
  // El nivel de datos se refuerza aparte con withRole('admin') en las APIs
  // exclusivas de estas vistas (/api/wallet/*, /api/pick3/*,
  // /api/bank-reconciliation/*). /api/academy/* fue retirada en CP-INFRA-002b.
  {
    id: 'desarrollo',
    label: 'EN DESARROLLO',
    type: 'group',
    icon: FlaskConical,
    roles: ['admin'],
    description: 'Funcionalidades existentes pero todavía no integradas como parte del flujo principal del producto.',
    children: [
      {
        // 21 hojas falsas del sidebar colapsan a UNA entrada (el rail interno
        // de IPVView es la navegación real de sus 23 tabs — GATE 0.1 §3)
        id: 'ipv',
        label: 'IPV',
        description: 'Banco de trabajo experimental de conciliación: reportes, extractos, catálogos, procesamiento IA y auditoría IPV (navegación interna por rail).',
        icon: Layers,
        type: 'item',
        navClass: 'experimental',
        // Roles explícitos (antes heredados de la sección admin-only):
        // visibilidad efectiva idéntica, solo cambia el mecanismo.
        roles: ['admin'],
        keywords: ['ipv', 'conciliación', 'extracto', 'bancario', 'matching'],
      },
      {
        // Trasladada desde AYUDA (fix/navigation-orphaned-development):
        // funcionalidad de conocimiento contable, no ayuda de la app.
        // Universal (sin roles) — igual que en Ayuda. Deep-link intacto.
        id: 'wiki',
        label: 'Wiki',
        description: 'Conocimiento contable cubano: asientos con Debe/Haber, plan de cuentas, normativas NC-29 y ONAT.',
        icon: Book,
        type: 'item',
        keywords: ['wiki', 'contable', 'asientos', 'cuentas', 'onat', 'nc-29', 'glosario'],
      },
      {
        // Trasladada desde AYUDA (fix/navigation-orphaned-development).
        // Descripción REAL (la anterior decía "RGPD" — falso, eso vive en /privacy).
        // Universal (sin roles) — igual que en Ayuda. Deep-link intacto.
        id: 'legal',
        label: 'Marco Legal',
        description: 'Consultor de normativa cubana (fiscal, laboral, mercantil) y generador de formularios oficiales en PDF.',
        icon: Scale,
        type: 'item',
        keywords: ['legal', 'normativa', 'cubana', 'formularios', 'fiscal', 'leyes'],
      },
    ],
  },
];

// CP-INFRA-002 (2026-10-23): retirada del producto activo de Pick3, Billetera y
// Conciliación Bancaria por decisión operativa (límite de funciones serverless
// del plan Hobby). Las entradas de navegación se eliminan; el historial de la
// implementación queda en git (revertir este commit reactiva menús y vistas).
// CP-INFRA-002b (2026-10-23): Academia también retirada del producto activo
// (mismo mecanismo: git revert reactiva menú, vistas y rutas).
// IPV, Wiki y Marco Legal permanecen en EN DESARROLLO.

// ────────────────────────────────────────────────────────────────────
// ACTION_EXTENSIONS — acciones que NO son navegación a una vista del menú
// ────────────────────────────────────────────────────────────────────
/**
 * Vistas contextuales o utilidades que no viven en el sidebar pero deben ser
 * descubribles (Command Palette / móvil). Una vista de MENÚ nunca va aquí.
 */
/**
 * GATE 1.3 — vistas del hub Ventas alcanzables por contexto (tarjetas) que
 * deben ser DIRECTAMENTE descubribles en la palette (⌘K). `mobileHide: true`
 * = palette-only: en móvil ya son alcanzables (tab Caja / sheet Más → Ventas)
 * y no deben duplicarse en el sheet. Roles = roles del hub Ventas.
 */
const SALES_HUB_PALETTE_ENTRIES: (NavEntry & { route: NavRoute })[] = [
  {
    id: 'sales',
    label: 'Historial de Ventas',
    description: 'Consulta, anula, duplica y exporta ventas. Filtra por fecha, estado y método de pago.',
    icon: Receipt,
    type: 'item',
    route: { view: 'sales' },
    roles: ['admin', 'manager', 'encargado', 'clerk', 'usuario'],
    mobileHide: true,
    keywords: ['historial', 'ventas', 'ventas anteriores', 'registro de ventas', 'anulaciones', 'duplicar venta', 'facturas'],
  },
  {
    // MISIÓN INGRESOS/EGRESOS 2026-10-20: 'cash' se GRADUÓ de aquí al árbol
    // de navegación (hoja del submenú «Caja» de OPERACIÓN, idénticos
    // label/desc/icon/roles/keywords/mobileHide) — el palette la DERIVA ahora
    // de flattenNavigation (fuente única). Mantenerla aquí duplicaría la
    // acción «Caja» en ⌘K (SYSTEM_ACTIONS = árbol + extensiones, sin dedup).
    id: 'inventory_count',
    label: 'Venta por Conteo',
    description: 'Cuenta existencias físicas al final del día y el sistema calcula ventas por diferencia.',
    icon: ClipboardList,
    type: 'item',
    route: { view: 'inventory_count' },
    roles: ['admin', 'manager', 'encargado', 'clerk', 'usuario'],
    mobileHide: true,
    keywords: ['conteo', 'venta por conteo', 'auditoría de stock', 'diferencia', 'existencias'],
  },
  {
    id: 'devolutions',
    label: 'Devoluciones',
    description: 'Registra y gestiona devoluciones de ventas: reversa, duplicado y trazabilidad por tienda.',
    icon: RotateCcw,
    type: 'item',
    route: { view: 'devolutions' },
    roles: ['admin', 'manager', 'encargado', 'clerk', 'usuario'],
    mobileHide: true,
    keywords: ['devoluciones', 'devolución', 'reversa', 'reembolso', 'anular venta'],
  },
  {
    id: 'quotations',
    label: 'Cotizaciones',
    description: 'Crea cotizaciones con búsqueda de productos y estados de seguimiento.',
    icon: FileText,
    type: 'item',
    route: { view: 'quotations' },
    roles: ['admin', 'manager', 'encargado', 'clerk', 'usuario'],
    mobileHide: true,
    keywords: ['cotizaciones', 'cotización', 'presupuesto', 'proforma'],
  },
  {
    // GRADUADA (2026-11-25) — MISIÓN CP-NAV-FINANCE-REORGANIZATION-001:
    // «Cuentas por Pagar» y «Cobros por Antigüedad» (id 'accounts-receivable')
    // se RETIRAN de esta lista: pasan a hojas de menú del submenú FINANZAS de
    // OPERACIÓN (mismo ViewType 'accounts_payable'/'accounts_receivable',
    // mismos roles). El palette las deriva ahora de flattenNavigation —
    // mantenerlas aquí duplicaría las acciones en ⌘K (SYSTEM_ACTIONS = árbol
    // + extensiones, sin dedup), exactamente como ocurrió con 'cash' en su
    // graduación (MISIÓN INGRESOS/EGRESOS 2026-10-20).
    id: 'ofertas',
    label: 'Ofertas',
    description: 'Crea y gestiona ofertas comerciales formales: suministrador, productos, ITBIS, validez y exportación a PDF.',
    icon: Megaphone,
    type: 'item',
    route: { view: 'ofertas' },
    roles: ['admin', 'manager', 'encargado', 'clerk', 'usuario'],
    mobileHide: true,
    keywords: ['ofertas', 'oferta', 'promoción', 'propuesta comercial', 'documento comercial', 'presupuesto formal'],
  },
  {
    // FASE B (UX-010 · GATE 1.4P): destino navegacional canónico ÚNICO del
    // CRM global = CustomersView (Supabase). El id 'clientes' evita pisar
    // IPV_ROUTES['customers'] (la tab interna de IPV conserva su ruta) y no
    // crea una tercera implementación — apunta a la vista existente.
    // La fragmentación con el catálogo local de IPV queda documentada como
    // deuda técnica en audit-evidence/FASE-B/ (resolución posterior).
    id: 'clientes',
    label: 'Clientes',
    description: 'Registro y consulta de clientes por tienda: alta con CI, teléfono y dirección, y búsqueda por nombre, CI o teléfono.',
    icon: Users,
    type: 'item',
    route: { view: 'customers' },
    roles: ['admin', 'manager', 'encargado', 'clerk', 'usuario'],
    mobileHide: true,
    keywords: ['clientes', 'cliente', 'crm', 'cartera de clientes', 'alta de cliente', 'buscar cliente'],
  },
];

// ────────────────────────────────────────────────────────────────────
// GATE 1.4R — REGISTRO DE TABS TÉCNICAS DEL MÓDULO FICHAS DE COSTO
// ────────────────────────────────────────────────────────────────────
/**
 * Fuente única con LABEL para las tabs técnicas de `cost-sheets` (GATE 1.4
 * UX-002: TECHNICAL_VIEW_IDS era una lista plana sin metadatos y el
 * breadcrumb caía en "Módulo No Disponible"; UX-003/UX-008: modos,
 * herramientas y acciones del editor eran palette-invisibles).
 *
 * Clasificación VISTA/MODO/ACCIÓN/HERRAMIENTA (mandato GATE 1.4R §2/§4 +
 * GATE 1.4R.1 §4-§7):
 *   - vista        → Arena FC (capacidad autónoma del dominio, beta) · Experto
 *                    (main — espacio de trabajo completo, ex "Tablero Principal")
 *   - modo         → view-assisted / view-reading (estados del editor;
 *                    NUNCA tarjetas ni vistas — render por viewMode)
 *   - accion       → tool-* (operaciones sobre la ficha abierta; los puentes
 *                    existentes en useCostSheetActions ejecutan y vuelven a `main`)
 *   - herramienta  → templates / massive-gen / steel-calculator (contextuales,
 *                    con camino de descubrimiento palette — sin menú)
 *
 * `palette: true` publica la entrada en ACTION_EXTENSIONS (⌘K); `mobileHide`
 * las excluye del sheet móvil (en móvil se alcanzan dentro del módulo).
 * El breadcrumb consume `label` vía navigation-map (fuente corregida, sin
 * excepciones aisladas — mandato §13).
 */
export interface CostSheetTabMeta {
  id: string;              // activeCostSection (tab técnica)
  label: string;           // label de usuario (palette + breadcrumb)
  description: string;
  keywords: string[];
  kind: 'vista' | 'modo' | 'accion' | 'herramienta';
  icon: LucideIcon;
  isBeta?: boolean;
  palette: boolean;
  mobileHide?: boolean;
}

export const COST_SHEETS_TABS: CostSheetTabMeta[] = [
  {
    id: 'gen-easy',
    label: 'Generar Ficha',
    description: 'Crea fichas de costo: generación rápida o masiva desde Excel/inventario.',
    keywords: ['generar ficha', 'generar', 'nueva ficha', 'crear ficha', 'gen fácil'],
    kind: 'vista',
    icon: Zap,
    // palette: false — la entrada de menú "Fichas de Costo" ya cubre este
    // destino (keyword 'generar'); duplicarlo en palette crearía exactamente
    // el ruido multi-entrada que prohíbe el mandato §8. Sirve para breadcrumb.
    palette: false,
    mobileHide: true,
  },
  {
    id: 'main',
    // GATE 1.4R.1 (mandato §1/§6/§7/§8): el tab 'main' ES la vista de trabajo
    // históricamente denominada "Tablero Principal" (CostSheetMainTabs:
    // Plantillas / Datos Generales / Estructura de Costos / Anexos). Recupera
    // su acceso visible como TAB "Experto" del segundo nivel + palette.
    label: 'Experto',
    description: 'Espacio completo de trabajo de la ficha: Plantillas, Datos Generales, Estructura de Costos y Anexos.',
    keywords: ['experto', 'tablero principal', 'editor', 'ficha', 'trabajo completo', 'estructura de costos', 'datos generales', 'anexos'],
    kind: 'vista',
    icon: PenTool,
    palette: true,
    mobileHide: true,
  },
  {
    id: 'arena-fc',
    label: 'Arena FC',
    description: 'Compara fichas de costo lado a lado: motor de cálculo y exportación del duelo (beta).',
    keywords: ['arena', 'comparar', 'comparación', 'versus', 'vs', 'duelo', 'fichas'],
    kind: 'vista',
    icon: Swords,
    isBeta: true,
    palette: true,
    mobileHide: true,
  },
  {
    id: 'view-assisted',
    label: 'Abrir Modo Asistido',
    description: 'Modo gráfico: completa la ficha guiado paso a paso (modo del editor).',
    keywords: ['asistido', 'modo asistido', 'guiado', 'paso a paso', 'wizard', 'gráfico', 'modo gráfico'],
    kind: 'modo',
    icon: Wand2,
    palette: true,
    mobileHide: true,
  },
  {
    id: 'view-reading',
    label: 'Informe de la Ficha',
    description: 'Lee la ficha como informe narrativo presentable (modo del editor).',
    keywords: ['informe', 'informe de ficha', 'lectura', 'narrativo', 'presentable'],
    kind: 'modo',
    icon: ClipboardList,
    palette: true,
    mobileHide: true,
  },
  {
    id: 'templates',
    label: 'Plantillas de Fichas',
    description: 'Explora plantillas predefinidas para arrancar una ficha.',
    keywords: ['plantillas', 'plantilla', 'modelos', 'ejemplos', 'formatos'],
    kind: 'herramienta',
    icon: FolderOpen,
    palette: true,
    mobileHide: true,
  },
  {
    id: 'massive-gen',
    label: 'Generación Masiva',
    description: 'Genera fichas en lote desde Excel o el inventario (también dentro de Generar).',
    keywords: ['masiva', 'masivo', 'lote', 'batch', 'varias fichas', 'generar muchas'],
    kind: 'herramienta',
    icon: Layers,
    palette: true,
    mobileHide: true,
  },
  {
    id: 'steel-calculator',
    label: 'Calculadora Estructural',
    description: 'Calcula costos de estructuras de acero: perfiles, pesos y precios.',
    keywords: ['calculadora estructural', 'acero', 'perfiles', 'estructura metálica', 'steel'],
    kind: 'herramienta',
    icon: Calculator,
    palette: true,
    mobileHide: true,
  },
  {
    id: 'tool-save-cloud',
    label: 'Guardar Ficha',
    description: 'Persiste la ficha actual en tu librería (Supabase).',
    keywords: ['guardar', 'guardar ficha', 'salvar', 'persistir', 'librería', 'nube', 'supabase'],
    kind: 'accion',
    icon: Save,
    palette: true,
    mobileHide: true,
  },
  {
    // C2-C (FASE C): renombrado honesto — este comando DESCARGA JSON, no guarda.
    // La persistencia real es 'tool-save-cloud' ("Guardar Ficha").
    id: 'tool-save',
    label: 'Exportar JSON',
    description: 'Descarga la ficha actual como archivo JSON (⌘S).',
    keywords: ['exportar json', 'json', 'descargar', 'backup', 'respaldo', 'exportar'],
    kind: 'accion',
    icon: FileJson,
    palette: true,
    mobileHide: true,
  },
  {
    id: 'tool-import',
    label: 'Importar ficha (JSON)',
    description: 'Carga un archivo JSON de una ficha existente.',
    keywords: ['importar', 'importar json', 'json', 'cargar', 'archivo', 'restaurar ficha'],
    kind: 'accion',
    icon: Upload,
    palette: true,
    mobileHide: true,
  },
  {
    id: 'tool-export-excel',
    label: 'Exportar ficha a Excel',
    description: 'Exporta la ficha a Excel con fórmulas dinámicas.',
    keywords: ['excel', 'exportar excel', 'csv', 'hoja de cálculo', 'planilla'],
    kind: 'accion',
    icon: FileText,
    palette: true,
    mobileHide: true,
  },
  {
    id: 'tool-export-pdf',
    label: 'Exportar ficha a PDF',
    description: 'Genera el PDF oficial de la ficha (formato Res. 148/2023).',
    keywords: ['pdf', 'exportar pdf', 'imprimir', 'resolución 148', 'formato oficial'],
    kind: 'accion',
    icon: Download,
    palette: true,
    mobileHide: true,
  },
];

/** Roles del dominio Costo (heredados de la entrada `cost-sheets`). */
const COSTO_DOMAIN_ROLES = ['admin', 'manager', 'encargado', 'costo'];

/** Tabs del módulo publicadas como acciones de palette (⌘K). */
const COST_SHEETS_PALETTE_ENTRIES: (NavEntry & { route: NavRoute })[] =
  COST_SHEETS_TABS.filter(t => t.palette).map(t => ({
    id: t.id,
    label: t.label,
    description: t.description,
    icon: t.icon,
    type: 'item' as const,
    route: { view: 'cost-sheets', tab: t.id },
    roles: COSTO_DOMAIN_ROLES,
    mobileHide: t.mobileHide,
    isBeta: t.isBeta,
    keywords: t.keywords,
  }));

export const ACTION_EXTENSIONS: (NavEntry & { route: NavRoute })[] = [
  {
    id: 'recepcion',
    label: 'Nueva Recepción',
    description: 'Registra el ingreso de mercancía: OCR, escaneo y validación contra OC.',
    icon: Warehouse,
    type: 'item',
    route: { view: 'recepcion' },
    roles: ['admin', 'manager', 'encargado', 'warehouse'],
    keywords: ['nueva recepción', 'recibir', 'mercancía', 'entrada', 'compra', 'remisión'],
  },
  {
    id: 'calculator',
    label: 'Calculadora',
    description: 'Calculadora Pro con historial, memoria y desglose de billetes.',
    icon: Calculator,
    type: 'item',
    route: { view: 'calculator' },
    mobileHide: true, // en móvil vive como widget/utilidad del shell
    keywords: ['calculadora', 'calcular', 'billetes', 'memoria', 'cambio'],
  },
  {
    // CAMBIO 3 (HOME/SALES/PERFORMANCE DEFAULTS): la entrada de menú/palette
    // "Chat con Darian" se ELIMINA — Darian ya vive dentro de Inicio (AI
    // Command Center) y una segunda entrada era duplicación conceptual.
    // El ViewType 'chat' sigue VÁLIDO (deep-link /?view=chat usado por
    // Acciones recientes al reabrir conversaciones; TerminalShell lo renderiza).
    id: 'storefront-config',
    label: 'Vitrina Pública',
    description: 'Personaliza banner, servicios, carrusel promocional y canales de contacto de tu vitrina.',
    icon: Home,
    type: 'item',
    route: { view: 'storefront-config' },
    roles: ['admin', 'manager', 'encargado'],
    keywords: ['vitrina', 'pública', 'storefront', 'banner', 'carrusel', 'tienda online'],
  },
  // GATE 1.3 — descubribles en palette (⌘K) sin duplicar navegación visible
  ...SALES_HUB_PALETTE_ENTRIES,
  // GATE 1.4R — tabs del módulo Fichas de Costo (Arena FC, modos, herramientas
  // y acciones del editor) descubribles en palette sin convertirse en vistas
  ...COST_SHEETS_PALETTE_ENTRIES,
];

// ────────────────────────────────────────────────────────────────────
// VISTAS CONTEXTUALES / TÉCNICAS (sin entrada de navegación)
// ────────────────────────────────────────────────────────────────────
/**
 * Vistas reales que NO aparecen en el menú (ni sidebar ni móvil ni palette
 * como destinos de primer nivel). Se alcanzan por contexto:
 *   - tabs internas de un hub o vista-módulo (news, stores, catalog…)
 *   - creación contextual (recepcion ya está en ACTION_EXTENSIONS)
 *   - modales elevados a vista (cash_report — CAMBIO 2026-10: ahora también
 *     hoja de menú del grupo Ventas; sigue siendo alcanzable por contexto
 *     desde Caja y POS. Dualidad documentada, no contradictoria)
 *   - dominios con rail propio (whatsapp-*, telegram-*)
 * El guard de roles las deja pasar (default-open, igual que hoy): la
 * seguridad real vive en backend/RLS.
 */
export const TECHNICAL_VIEW_IDS: string[] = [
  // FASE B: 'news' ya no es vista técnica — es hoja de menú de ANÁLISIS.
  // F4 (higiene IA): 'sales', 'inventory_count', 'devolutions', 'quotations',
  // 'accounts-payable' y 'ofertas' se retiran de esta lista — son entradas de
  // ACTION_EXTENSIONS (palette, GATE 1.3) y la doble clasificación era
  // documentación contradictoria ("sin entrada de navegación" vs "descubribles
  // en palette"). Sin efecto runtime: TECHNICAL_VIEW_IDS no tiene consumidor
  // de ejecución; el guard de roles es default-open (sidebar.structure.ts:78).
  // CAMBIO 2026-10: 'cash_report' retirado de esta lista — es hoja de menú
  // del grupo Ventas (hijo directo, entre Vender y Opciones). Sigue siendo
  // además destino contextual desde Caja/POS (el mismo destino, no otro).
  'stores', 'catalog', 'history', 'lots', 'warehouses',
  'customers', 'bank-reconciliation',
  // CP-UX-ORG-STORES-002: página dedicada de administración de una
  // organización — destino contextual (acción «Tiendas»/«Clientes y
  // Proveedores» del menú de la organización), sin hoja de menú propia.
  'organization-detail',
  'sales_catalog',
  // CP-NAV-FINANCE-REORGANIZATION-001 (2026-11-25): 'accounts_payable' y
  // 'accounts_receivable' son AHORA TAMBIÉN hojas de menú del submenú FINANZAS
  // (graduación desde el hub Ventas → Opciones). Conservan la clasificación
  // técnica: siguen siendo destinos contextuales por deep-link/bookmark
  // (/?view=…), con la dualidad documentada (mismo patrón que 'cash_report').
  'accounts_payable',
  'accounts_receivable', 'punto_venta', 'analitica',
  'cost_views', 'cost_gen', 'cost_templates', 'cost_tools',
  'ipv_reporting', 'ipv_operaciones', 'ipv_datos', 'ipv_procesamiento', 'ipv_avanzado',
  'ipv_module', 'costos', 'tienda', 'otros', 'administracion', 'recursos', 'core', 'core_tools',
  'whatsapp-config', 'whatsapp-conversations', 'whatsapp-invitations', 'whatsapp-dashboard', 'whatsapp-group',
  'telegram-config', 'telegram-conversations', 'telegram-invitations', 'telegram-dashboard', 'telegram-group',
];

// ────────────────────────────────────────────────────────────────────
// ALIASES LEGACY → destino canónico (migración de estado persistido, URLs
// antiguas y emisores históricos). occ → dashboard es OBLIGATORIO (§1).
// ────────────────────────────────────────────────────────────────────

export interface LegacyAlias {
  view: string;
  tab?: string;
}

export const LEGACY_VIEW_ALIASES: Record<string, LegacyAlias> = {
  // Home única (P0-4): cualquier 'occ' aterriza en el dashboard
  occ: { view: 'dashboard' },
  // Wrappers de grupos/submenús que ya no existen como secciones
  core: { view: 'dashboard' },
  core_tools: { view: 'calculator' },
  tienda: { view: 'management-hub' },
  costos: { view: 'cost-sheets', tab: 'gen-easy' },
  cost_views: { view: 'cost-sheets', tab: 'gen-easy' },
  cost_gen: { view: 'cost-sheets', tab: 'gen-easy' },
  cost_templates: { view: 'cost-sheets', tab: 'templates' },
  cost_tools: { view: 'cost-sheets', tab: 'gen-easy' },
  analitica: { view: 'dashboard' },
  punto_venta: { view: 'sales-hub' },
  administracion: { view: 'users' },
  recursos: { view: 'help' },
  otros: { view: 'ipv' },
  ipv_module: { view: 'ipv' },
  ipv_reporting: { view: 'ipv' },
  ipv_operaciones: { view: 'ipv' },
  ipv_datos: { view: 'ipv' },
  ipv_procesamiento: { view: 'ipv' },
  ipv_avanzado: { view: 'ipv' },
  // Alias legacy de generación de fichas (bookmarks antiguos)
  'gen-quick': { view: 'cost-sheets', tab: 'gen-easy' },
  'gen-expert': { view: 'cost-sheets', tab: 'gen-easy' },
  // El reporte de entrega vive dentro de Caja (hub Venta)
  // cash_report se mantiene como vista técnica (modal) — sin alias.
  // CP-NAV-FINANCE-REORGANIZATION-001 (2026-11-25): el hub «Caja» se RENOMBRA
  // a FINANZAS — los deep-links /?view=caja y el estado persistido histórico
  // normalizan al nuevo destino canónico (breadcrumb y sidebar derivan del
  // árbol). El ViewType 'caja' permanece en VALID_VIEWS como alias.
  caja: { view: 'finanzas' },
  // Alias kebab históricos de las cuentas: el id de la antigua extensión de
  // palette ('accounts-payable'/'accounts-receivable') ≠ ViewType snake de la
  // vista. Con la graduación a hojas de FINANZAS el destino canónico es el
  // snake; el alias conserva bookmarks/estado (despacha a la MISMA vista).
  'accounts-payable': { view: 'accounts_payable' },
  'accounts-receivable': { view: 'accounts_receivable' },
};

// ────────────────────────────────────────────────────────────────────
// CONTRATO ViewId (GATE 1.1) — un destino de navegación es SIEMPRE string
// ────────────────────────────────────────────────────────────────────
/**
 * El contrato canónico del shell: `ViewType` (string). Los objetos ricos
 * (NavEntry, NavRoute, HOME_ITEM) viven SOLO dentro de esta definición y se
 * aplanan a `entry.id` / `entry.route.view` en cada superficie.
 *
 * Estos artefactos son el resultado de coerciones String(objeto) y JAMÁS
 * pueden ser ViewIds legítimos (ninguna vista se llama así).
 */
const VIEW_ID_CONTRACT_VIOLATIONS: ReadonlySet<string> = new Set([
  '[object Object]', 'undefined', 'null', '',
]);

/**
 * Detecta violaciones del contrato ViewId: un valor que NO es string, o un
 * string que es artefacto de coerción (p. ej. String(NavEntry) →
 * "[object Object]"). Usado por el punto único de normalización, la
 * rehidratación del store y las fronteras de render (breadcrumb / shell).
 */
export function isViewIdContractViolation(value: unknown): boolean {
  if (typeof value !== 'string') return true;
  return VIEW_ID_CONTRACT_VIOLATIONS.has(value);
}

/**
 * Diagnóstico único para violaciones de contrato. Falla INMEDIATAMENTE en el
 * punto donde se recibió el valor (no 3 capas después en "Módulo No
 * Disponible") y NUNCA coerciona el objeto a string silenciosamente.
 */
function reportViewIdViolation(value: unknown, consumer: string): void {
  console.error(
    `[NAVIGATION] Invalid navigation target: expected ViewId string, received ${typeof value}. ` +
    `(consumer: ${consumer}) — aterrizando en Home ('${HOME_VIEW}'). ` +
    'No pases el objeto de navegación: pasa entry.id / entry.route.view.',
    { received: value }
  );
}

/**
 * Sanitiza un valor que entra desde FUERA del sistema de tipos (estado
 * persistido en localStorage, URL, APIs externas) a un ViewId canónico.
 * Garantiza: devuelve SIEMPRE un string; una violación de contrato aterriza
 * en Home con diagnóstico — nunca propaga el objeto ni su coerción.
 */
export function sanitizeViewId(value: unknown, consumer = 'unknown'): string {
  if (isViewIdContractViolation(value)) {
    reportViewIdViolation(value, consumer);
    return HOME_VIEW;
  }
  return normalizeLegacyView(value as string).view;
}

/**
 * Normaliza un viewId (posiblemente legacy) a su destino canónico.
 * Punto único de normalización usado por: store (persisted state), URL sync,
 * ChatBot/IA y cualquier emisor histórico.
 *
 * GATE 1.1 — CONTRATO: `viewId` debe ser SIEMPRE un string (ViewId). Si
 * llega un objeto (NavEntry/NavRoute/HOME_ITEM) es una violación de contrato
 * — la que produjo "[object Object]" en breadcrumb y shell tras la ventana
 * del bug `normalizeLegacyView(view)` sin `.view` en el store: el estado
 * persistido envenenado se re-inyectaba crudo en la rehidratación. Aquí la
 * violación se diagnostica y aterriza en Home; jamás se coerciona.
 */
export function normalizeLegacyView(
  viewId: string,
  tab?: string
): { view: string; tab?: string } {
  if (isViewIdContractViolation(viewId)) {
    reportViewIdViolation(viewId, 'normalizeLegacyView');
    return { view: HOME_VIEW };
  }
  const alias = LEGACY_VIEW_ALIASES[viewId];
  if (alias) return { view: alias.view, tab: alias.tab ?? tab };
  return { view: viewId, tab };
}

// ────────────────────────────────────────────────────────────────────
// DERIVADORES — las demás superficies se generan de aquí
// ────────────────────────────────────────────────────────────────────

export interface FlatNavItem {
  id: string;
  label: string;
  description?: string;
  icon?: LucideIcon;
  /** Etiqueta de la sección contenedora (INICIO, OPERACIÓN, …). */
  category: string;
  roles?: string[];
  isBeta?: boolean;
  isNew?: boolean;
  route?: NavRoute;
  navClass?: NavClass;
  keywords?: string[];
}

function inheritRoles(entry: NavEntry, ancestorRoles: string[] | undefined): string[] | undefined {
  return entry.roles ?? ancestorRoles;
}

/**
 * Aplana la definición a una lista de ítems de navegación (una entrada por
 * hoja), heredando roles y anotando la sección. Los ítems de submenú no son
 * navegables y no aparecen: solo hojas.
 */
export function flattenNavigation(): FlatNavItem[] {
  const out: FlatNavItem[] = [];
  for (const section of NAVIGATION_SECTIONS) {
    const sectionRoles = section.roles;
    const walk = (entries: NavEntry[], inherited?: string[]) => {
      for (const e of entries) {
        const effective = inheritRoles(e, inherited);
        if (e.type === 'item') {
          out.push({
            id: e.id,
            label: e.label,
            description: e.description,
            icon: e.icon,
            category: e === section ? e.label : section.label,
            roles: effective,
            isBeta: e.isBeta,
            isNew: e.isNew,
            route: e.route,
            navClass: e.navClass,
            keywords: e.keywords,
          });
        } else if (e.children) {
          walk(e.children, effective);
        }
      }
    };
    // CP-NAV-FINANCIAL-STATEMENTS-TOP-LEVEL-NAVIGATION-001 (2026-11-22):
    // la sección puede ser un NavEntry type 'item' de primer nivel (módulo
    // directo, p. ej. «Estados Financieros»). Se incluye la sección misma
    // en el walk: para grupos/submenús el flujo es IDÉNTICO al previo (el
    // nodo sección no es hoja → cae a walk(children)); para ítems de primer
    // nivel se emiten con categoría propia, sin listas paralelas.
    walk([section], sectionRoles);
  }
  return out;
}

/** Verifica si un rol (o jerarquía vía hasRole) accede a una lista de roles. */
export function roleMatches(userRoles: string[] | undefined, required: string[] | undefined): boolean {
  if (!required || required.length === 0) return true;
  if (!userRoles || userRoles.length === 0) return false;
  return userRoles.some(r => required.includes(r));
}

// ────────────────────────────────────────────────────────────────────
// MÓVIL — tabs fijos + mapa de estado activo (derivado, no tercera lista)
// ────────────────────────────────────────────────────────────────────

export interface MobileMainTab {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Vistas que marcan este tab como activo (mapeo por grupo de proceso). */
  activeViews: string[];
}

/**
 * 4+1 tabs fijos por diseño (GATE 0.1 §7-I). El estado activo se deriva del
 * proceso, no de la vista literal (corrige P2-5: "Vender" se marcaba activo
 * en `history` — Trazabilidad pertenece a Inventario).
 */
export const MOBILE_MAIN_TABS: MobileMainTab[] = [
  {
    id: 'pos',
    label: 'Vender',
    icon: ShoppingCart,
    activeViews: [
      'pos', 'sales-hub', 'sales_catalog', 'sales', 'inventory_count',
      'devolutions', 'quotations', 'ofertas', 'customers', 'cash_report',
      'accounts-payable', 'accounts_payable', 'accounts_receivable',
    ],
  },
  {
    id: 'reception_list',
    label: 'Recibir',
    icon: Warehouse,
    // MISIÓN ARQUITECTURA UX (2026-10-23): 'received-services' pasa de la tab
    // Inventario a la tab Recibir — espejo del traslado en escritorio
    // (OPERACIÓN → Logística).
    activeViews: ['reception_list', 'recepcion', 'purchase-orders', 'transferencias', 'received-services'],
  },
  {
    id: 'inventory',
    label: 'Inventario',
    icon: Package,
    activeViews: [
      'inventory', 'history', 'catalog', 'inventory_adjustments', 'vales_salida',
      'solicitud_materiales',
      'labels', 'lots', 'warehouses',
    ],
  },
  {
    id: 'cash',
    label: 'Caja',
    icon: DollarSign,
    // MISIÓN INGRESOS/EGRESOS 2026-10-20: el tab Caja también resalta la
    // vista Ingresos/Egresos (mismo dominio de efectivo).
    activeViews: ['cash', 'ingresos_egresos'],
  },
];

// ────────────────────────────────────────────────────────────────────
// ASSERT DE INTEGRIDAD (solo dev): detecta destinos muertos POR CONSTRUCCIÓN
// ────────────────────────────────────────────────────────────────────

/** Conjunto de ViewTypes válidos declarados en el store. */
export const VALID_VIEWS: Set<string> = new Set([
  'occ', 'dashboard', 'store-dashboard', 'pos', 'inventory', 'recepcion', 'reception_list',
  'transferencias', 'sales', 'inventory_count', 'cost-sheets', 'reports', 'catalog',
  'history', 'inventory_adjustments', 'vales_salida', 'solicitud_materiales', 'physical_inventory', 'audit', 'cash', 'users', 'roles', 'stores',
  'storefront-config', 'settings', 'help', 'wiki', 'news', 'rss_management',
  'management-hub', 'ipv', 'legal', 'health',
  'organizations',
  // CP-UX-ORG-STORES-002: página dedicada de administración de una organización
  // (tabs Tiendas | Clientes y Proveedores; contexto en la URL).
  'organization-detail',
  // CP-INFRA-002 (2026-10-23): 'pick3-intelligence' y 'wallet' retirados del producto activo.
  // CP-INFRA-002b (2026-10-23): 'academy' retirado del producto activo junto con el módulo Academia.
  'labels', 'sales_catalog', 'ofertas', 'purchase-orders', 'sales-hub',
  'exchange-intelligence', 'received-services', 'usage-monitoring', 'workers',
  'chat', 'costeo-dinamico', 'estructura-costo', 'whatsapp-config',
  'whatsapp-conversations', 'whatsapp-invitations', 'whatsapp-dashboard',
  'whatsapp-group', 'whatsapp-hub', 'telegram-config', 'telegram-conversations',
  'telegram-invitations', 'telegram-dashboard', 'telegram-group', 'telegram-hub',
  'accounts_payable', 'accounts_receivable', 'cash_report', 'production-orders',
  // MISIÓN 2026-10-16 (IPV): informe de ingresos por ventas con conciliación
  'ipv_ventas',
  // MISIÓN 2026-11-09 (CP-SALES-PRICE-LIST-001): listado de precios por rango de SKU
  'listado-precios',
  'devolutions', 'customers', 'quotations', 'fiscal-close', 'lots', 'warehouses',
  // MISIÓN CLASIFICADOR MAESTRO (FASE 3): vista única de terceros por organización
  'clientes-proveedores',
  // MISIÓN COMPARAR PRODUCTOS (2026-11-23): inteligencia comercial con informe
  // ejecutivo — hoja oficial de ANÁLISIS (antes solo alcanzable desde el botón
  // del Ranking Comercial del Inicio).
  'product-comparison',
  'abc-analysis', 'calculator', 'accounts-payable',
  // CP-INFRA-002: 'bank-reconciliation' retirado del producto activo.
  'punto_venta', 'almacen_gestion', 'almacen_operaciones', 'analitica',
  'ipv_reporting', 'ipv_operaciones', 'ipv_datos', 'ipv_procesamiento', 'ipv_avanzado',
  'cost_views', 'cost_gen', 'cost_templates', 'cost_tools',
  'costos', 'tienda', 'ipv_module', 'otros', 'administracion', 'recursos',
  'costo', // F4 (higiene IA): ViewType real (case SectionHubView) que faltaba aquí
  // CAMBIO 4: submenu hub "Ventas" (Vender + Opciones) — wayfinding SectionHub
  'ventas',
  // MISIÓN FECHAS DE TRABAJO (2026-10-18): centro de control transversal de
  // fechas de trabajo (OPERACIÓN → Control operativo → Fechas de trabajo).
  'control_operativo', 'work_dates',
  // Secciones/hubs nuevos de la arquitectura GATE 1
  // MISIÓN INGRESOS/EGRESOS 2026-10-20: submenú «Caja» de OPERACIÓN (hub
  // SectionHubView) + vista canónica del documento Ingreso/Egreso.
  // CP-NAV-FINANCE-REORGANIZATION-001 (2026-11-25): submenú «FINANZAS»
  // (renombre del hub 'caja', que permanece como alias legacy).
  'caja', 'ingresos_egresos', 'finanzas',
  'operacion', 'recursos-humanos', 'analisis', 'sistema', 'ayuda', 'desarrollo', 'redes',
  // MISIÓN CP-FIN (2026-11-13): Vista B — Estados Financieros.
  // CP-NAV-...-001 (2026-11-22): sección PROPIA de primer nivel (primera del
  // menú); misma vista, misma ruta, mismos roles.
  'financial-statements',
  // MISIÓN CP-FIN (2026-11-13): Vista A — Configuración de Documentos
  // (ANÁLISIS: reglas de partida doble del motor financiero).
  'document-config',
]);

/**
 * Valida que cada hoja de la definición apunte a un ViewType existente.
 * Se ejecuta en dev (TerminalShell montado en modo desarrollo) y lanza
 * console.error con los destinos muertos — hace imposible reintroducir
 * los 13 destinos muertos del GATE 0 sin notarlo.
 */
export function assertNavigationIntegrity(): void {
  if (process.env.NODE_ENV !== 'development') return;
  const dead: string[] = [];
  const checkRoute = (route?: NavRoute) => {
    if (route && !VALID_VIEWS.has(route.view)) dead.push(`${route.view} (por ${route.tab ? 'ruta con tab' : 'ruta directa'})`);
  };
  for (const leaf of flattenNavigation()) checkRoute(leaf.route ?? { view: leaf.id });
  for (const ext of ACTION_EXTENSIONS) checkRoute(ext.route);
  if (dead.length > 0) {
    console.error('[NAVIGATION] Destinos muertos detectados en la definición:', dead);
  }
}
