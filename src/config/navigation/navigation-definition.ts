/**
 * ════════════════════════════════════════════════════════════════════
 * NAVIGATION DEFINITION — FUENTE ÚNICA DE VERDAD (GATE 1)
 * ════════════════════════════════════════════════════════════════════
 *
 * Arquitectura aprobada (GATE 0.1 + autorización GATE 1):
 *
 *   INICIO (destino fijo: dashboard — NO es sección)
 *   OPERACIÓN   → Terminal de Venta · Venta · Almacén · Logística · Costo ·
 *                 Trabajadores y Comisiones · Gestión de Tiendas · Redes
 *   ANÁLISIS    → Dashboard de Tiendas · Tablero Dinámico · Inteligencia
 *                 Cambiaria · Reportes · Análisis ABC
 *   SISTEMA     → Ajustes · Usuarios · Roles · Salud · Monitoreo · Auditoría ·
 *                 Gestión RSS · Cierre Fiscal   (admin)
 *   AYUDA       → Centro de Ayuda · Wiki · Academia · Marco Legal
 *   EN DESARROLLO → IPV · Pick3 · Billetera   (admin, experimental)
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
  Scale, HelpCircle, Book, GraduationCap, FlaskConical, Layers, Wallet,
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
  description: 'Estado del negocio: KPIs consolidados (admin/manager) o tablero de tu tienda.',
  icon: Home,
  type: 'item',
  keywords: ['inicio', 'home', 'dashboard', 'kpi', 'indicadores', 'tablero', 'resumen'],
};

// ────────────────────────────────────────────────────────────────────
// SECCIONES (Nivel 1) → HUBS (Nivel 2) → VISTAS (Nivel 3)
// ────────────────────────────────────────────────────────────────────

export const NAVIGATION_SECTIONS: NavEntry[] = [
  // ═══════════════════════ OPERACIÓN ═══════════════════════
  {
    id: 'operacion',
    label: 'OPERACIÓN',
    type: 'group',
    icon: Zap,
    description: 'El trabajo diario: vender, mover stock, recibir mercancía y gestionar el ciclo comercial.',
    roles: ['admin', 'manager', 'encargado', 'clerk', 'usuario', 'warehouse'],
    children: [
      // PRIMARY — 1 clic (evidencia M-3: el clerk no debe pagar 2 clics diarios)
      {
        id: 'pos',
        label: 'Terminal de Venta',
        description: 'Venta rápida con carrito, atajos de teclado, escáner de código de barras y pago mixto. Incluye el modo Vale de Salida.',
        icon: Zap,
        type: 'item',
        navClass: 'primary',
        roles: ['admin', 'manager', 'encargado', 'clerk', 'usuario'],
        keywords: ['vender', 'venta', 'pos', 'terminal', 'caja', 'ticket', 'factura', 'vale de salida'],
      },
      // HUB — ciclo comercial completo
      {
        id: 'sales-hub',
        label: 'Venta',
        description: 'Centro del ciclo comercial: Tabla de Venta, Historial, Caja, Venta por Conteo, Devoluciones, Cotizaciones y cuentas.',
        icon: ShoppingCart,
        type: 'item',
        navClass: 'hub',
        roles: ['admin', 'manager', 'encargado', 'clerk', 'usuario'],
        keywords: ['venta', 'hub', 'tabla de venta', 'historial', 'arqueo', 'conteo', 'devoluciones', 'cotizaciones', 'cuentas'],
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
            id: 'received-services',
            label: 'Servicios Recibidos',
            description: 'Registro y distribución de costos de servicios: transporte, manipulación, seguro, aduana.',
            icon: Warehouse,
            type: 'item',
            roles: ['admin', 'manager', 'encargado', 'warehouse'],
            keywords: ['servicios', 'transporte', 'aduana', 'seguro', 'costos distribución'],
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
            description: 'Herramienta de fichas de costo: Generar fácil, Ficha, Modo Asistido, Informe, Arena FC (beta), plantillas y herramientas de exportación.',
            icon: FileText,
            type: 'item',
            route: { view: 'cost-sheets', tab: 'gen-easy' },
            roles: ['admin', 'manager', 'encargado', 'costo'],
            keywords: ['ficha', 'costo', 'generar', 'costeo', 'plantillas', 'arena'],
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
        id: 'workers',
        label: 'Trabajadores y Comisiones',
        description: 'CRUD de trabajadores por tienda, reglas de comisión versionables, cálculo por periodo y pagos con auditoría.',
        icon: UserCog,
        type: 'item',
        roles: ['admin', 'manager', 'encargado'],
        keywords: ['trabajadores', 'empleados', 'comisiones', 'pagos', 'nómina'],
      },
      {
        // Hub real (GATE 0.1 §3-D: nombre correcto, alcance = ciclo de vida completo)
        id: 'management-hub',
        label: 'Gestión de Tiendas',
        description: 'Centro unificado: Tablón de Noticias, Vitrina pública y ciclo de vida completo de tiendas (crear, configurar, backup/restore, KPIs por tienda).',
        icon: LayoutGrid,
        type: 'item',
        navClass: 'hub',
        roles: ['admin', 'manager', 'encargado'],
        keywords: ['tiendas', 'gestión', 'sucursales', 'tablón', 'vitrina', 'backup', 'kpi tiendas'],
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

  // ═══════════════════════ ANÁLISIS ═══════════════════════
  {
    id: 'analisis',
    label: 'ANÁLISIS',
    type: 'group',
    icon: TrendingUp,
    description: 'Herramientas de análisis: KPIs de tiendas, tablero dinámico, cambiaria y reportes.',
    roles: ['admin', 'manager', 'encargado'],
    children: [
      {
        // Aprobado §1/§baseline: "Dashboard de Tiendas" como entrada de ANÁLISIS.
        // La HOME única sigue siendo el destino fijo INICIO → dashboard.
        id: 'dashboard',
        label: 'Dashboard de Tiendas',
        description: 'KPIs consolidados por tienda: ventas, costos, ganancia y alertas de stock.',
        icon: TrendingUp,
        type: 'item',
        navClass: 'primary',
        keywords: ['dashboard', 'tiendas', 'kpi', 'indicadores', 'consolidado', 'análisis'],
      },
      {
        // Renombrado aprobado: "Tablero Principal" → "Tablero Dinámico" (ANÁLISIS)
        id: 'cost-analytics',
        label: 'Tablero Dinámico',
        description: 'Tabla dinámica tipo Power BI para analizar costos, márgenes y rentabilidad con drag & drop, plantillas y gráficos.',
        icon: Table2,
        type: 'item',
        route: { view: 'cost-sheets', tab: 'cost-analytics' },
        keywords: ['tablero', 'dinámico', 'pivot', 'márgenes', 'rentabilidad', 'power bi', 'productos'],
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
    ],
  },

  // ═══════════════════════ SISTEMA (admin) ═══════════════════════
  {
    id: 'sistema',
    label: 'SISTEMA',
    type: 'group',
    icon: Settings,
    description: 'Configuración y control administrativo del tenant: usuarios, roles, salud, auditoría.',
    roles: ['admin'],
    children: [
      {
        // Única entrada a settings (las 4 duplicadas mueren)
        id: 'settings',
        label: 'Ajustes',
        description: 'Preferencias personales (tema, conectividad), claves de IA e impuestos por tienda, y plan y límites.',
        icon: Settings,
        type: 'item',
        navClass: 'admin',
        keywords: ['ajustes', 'configuración', 'preferencias', 'tema', 'impuestos', 'plan', 'perfil'],
      },
      {
        id: 'users',
        label: 'Usuarios',
        description: 'Crea, edita y desactiva usuarios del tenant. Asigna memberships por tienda con roles granulares.',
        icon: Users,
        type: 'item',
        navClass: 'admin',
        keywords: ['usuarios', 'equipo', 'personal', 'memberships', 'acceso'],
      },
      {
        id: 'roles',
        label: 'Roles',
        description: 'Configura roles y permisos de acceso al sistema. Define qué puede hacer cada rol en cada módulo.',
        icon: ShieldCheck,
        type: 'item',
        navClass: 'admin',
        keywords: ['roles', 'permisos', 'seguridad', 'privilegios'],
      },
      {
        id: 'health',
        label: 'Salud',
        description: 'Estado de servicios, latencia de API, conexión a BD y servicios externos en tiempo real.',
        icon: HeartPulse,
        type: 'item',
        navClass: 'admin',
        keywords: ['salud', 'status', 'salud plataforma', 'diagnóstico', 'latencia'],
      },
      {
        id: 'usage-monitoring',
        label: 'Monitoreo',
        description: 'Consumo estimado de Vercel + Supabase, alertas antes de límites (60/80/90%) y forecast mensual.',
        icon: Gauge,
        type: 'item',
        navClass: 'admin',
        keywords: ['monitoreo', 'uso', 'consumo', 'vercel', 'supabase', 'límites', 'forecast'],
      },
      {
        // Auditoría = SISTEMA (control/trazabilidad, cero KPIs — GATE 0.1 §3 D-Auditoría)
        id: 'audit',
        label: 'Auditoría',
        description: 'Registro de acciones de control: anulaciones, ventas bajo costo, transferencias y resets. Quién, qué, cuándo. Exporta CSV.',
        icon: Shield,
        type: 'item',
        navClass: 'admin',
        keywords: ['auditoría', 'logs', 'trazabilidad', 'quién hizo', 'eventos', 'csv'],
      },
      {
        id: 'rss_management',
        label: 'Gestión RSS',
        description: 'Configura feeds RSS externos (noticias fiscales, contables, regulatorias) para el Tablón de Noticias.',
        icon: Rss,
        type: 'item',
        navClass: 'admin',
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
        keywords: ['cierre', 'fiscal', 'periodo', 'inmutabilidad', 'consolidar'],
      },
    ],
  },

  // ═══════════════════════ AYUDA ═══════════════════════
  {
    id: 'ayuda',
    label: 'AYUDA',
    type: 'group',
    icon: HelpCircle,
    description: 'Documentación, conocimiento contable, aprendizaje y normativa. El "?" del header es ayuda contextual de la vista actual.',
    children: [
      {
        id: 'help',
        label: 'Centro de Ayuda',
        description: 'Documentación de la app para operadores: guías por módulo, búsqueda, glosario y modo lectura.',
        icon: HelpCircle,
        type: 'item',
        keywords: ['ayuda', 'soporte', 'guía', 'tutorial', 'documentación', 'faq'],
      },
      {
        id: 'wiki',
        label: 'Wiki',
        description: 'Conocimiento contable cubano: asientos con Debe/Haber, plan de cuentas, normativas NC-29 y ONAT.',
        icon: Book,
        type: 'item',
        keywords: ['wiki', 'contable', 'asientos', 'cuentas', 'onat', 'nc-29', 'glosario'],
      },
      {
        id: 'academy',
        label: 'Academia',
        description: 'Flashcards con repetición espaciada (SRS) para dominar conceptos del sistema. Progreso guardado en tu cuenta.',
        icon: GraduationCap,
        type: 'item',
        keywords: ['academia', 'aprender', 'flashcards', 'estudio', 'capacitación'],
      },
      {
        // Descripción REAL (la anterior decía "RGPD" — falso, eso vive en /privacy)
        id: 'legal',
        label: 'Marco Legal',
        description: 'Consultor de normativa cubana (fiscal, laboral, mercantil) y generador de formularios oficiales en PDF.',
        icon: Scale,
        type: 'item',
        keywords: ['legal', 'normativa', 'cubana', 'formularios', 'fiscal', 'leyes'],
      },
    ],
  },

  // ═══════════════════════ EN DESARROLLO (admin, experimental) ═══════════════════════
  {
    id: 'desarrollo',
    label: 'EN DESARROLLO',
    type: 'group',
    icon: FlaskConical,
    description: 'Funcionalidades experimentales. No son parte del producto productivo todavía.',
    roles: ['admin'],
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
        keywords: ['ipv', 'conciliación', 'extracto', 'bancario', 'matching'],
      },
      {
        id: 'pick3-intelligence',
        label: 'Pick3',
        description: 'Gestor de riesgo de inversión: métricas cuantitativas, motores Markov, backtest y gestión de bankroll.',
        icon: BarChart3,
        type: 'item',
        navClass: 'experimental',
        keywords: ['pick3', 'riesgo', 'inversión', 'markov', 'backtest', 'bankroll', 'lotería'],
      },
      {
        id: 'wallet',
        label: 'Billetera',
        description: 'Billetera digital experimental: ingresos por transferencias, pagos digitales e importación de backups de Transfermóvil.',
        icon: Wallet,
        type: 'item',
        navClass: 'experimental',
        keywords: ['billetera', 'wallet', 'transferencias', 'transfermóvil', 'pagos', 'sms'],
      },
    ],
  },
];

// ────────────────────────────────────────────────────────────────────
// ACTION_EXTENSIONS — acciones que NO son navegación a una vista del menú
// ────────────────────────────────────────────────────────────────────
/**
 * Vistas contextuales o utilidades que no viven en el sidebar pero deben ser
 * descubribles (Command Palette / móvil). Una vista de MENÚ nunca va aquí.
 */
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
    id: 'chat',
    label: 'Chat con Darian (IA)',
    description: 'Asistente IA: consulta costos y ventas, busca productos, navega y ejecuta acciones.',
    icon: MessageCircle,
    type: 'item',
    route: { view: 'chat' },
    keywords: ['chat', 'darian', 'ia', 'asistente', 'inteligencia', 'preguntar'],
  },
  {
    id: 'storefront-config',
    label: 'Vitrina Pública',
    description: 'Personaliza banner, servicios, carrusel promocional y canales de contacto de tu vitrina.',
    icon: Home,
    type: 'item',
    route: { view: 'storefront-config' },
    roles: ['admin', 'manager', 'encargado'],
    keywords: ['vitrina', 'pública', 'storefront', 'banner', 'carrusel', 'tienda online'],
  },
];

// ────────────────────────────────────────────────────────────────────
// VISTAS CONTEXTUALES / TÉCNICAS (sin entrada de navegación)
// ────────────────────────────────────────────────────────────────────
/**
 * Vistas reales que NO aparecen en el menú (ni sidebar ni móvil ni palette
 * como destinos de primer nivel). Se alcanzan por contexto:
 *   - tabs internas de un hub o vista-módulo (news, stores, catalog…)
 *   - creación contextual (recepcion ya está en ACTION_EXTENSIONS)
 *   - modales elevados a vista (cash_report)
 *   - dominios con rail propio (whatsapp-*, telegram-*)
 * El guard de roles las deja pasar (default-open, igual que hoy): la
 * seguridad real vive en backend/RLS.
 */
export const TECHNICAL_VIEW_IDS: string[] = [
  'news', 'stores', 'catalog', 'history', 'lots', 'warehouses',
  'customers', 'bank-reconciliation', 'cash_report', 'devolutions', 'quotations',
  'sales_catalog', 'sales', 'inventory_count', 'accounts_payable', 'accounts-payable',
  'accounts_receivable', 'ofertas', 'punto_venta', 'analitica',
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
};

/**
 * Normaliza un viewId (posiblemente legacy) a su destino canónico.
 * Punto único de normalización usado por: store (persisted state), URL sync,
 * ChatBot/IA y cualquier emisor histórico.
 */
export function normalizeLegacyView(
  viewId: string,
  tab?: string
): { view: string; tab?: string } {
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
            category: section.label,
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
    walk(section.children || [], sectionRoles);
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
      'devolutions', 'quotations', 'ofertas', 'cash_report',
      'accounts-payable', 'accounts_payable', 'accounts_receivable',
    ],
  },
  {
    id: 'reception_list',
    label: 'Recibir',
    icon: Warehouse,
    activeViews: ['reception_list', 'recepcion', 'purchase-orders', 'transferencias'],
  },
  {
    id: 'inventory',
    label: 'Inventario',
    icon: Package,
    activeViews: [
      'inventory', 'history', 'catalog', 'inventory_adjustments',
      'labels', 'received-services', 'lots', 'warehouses',
    ],
  },
  {
    id: 'cash',
    label: 'Caja',
    icon: DollarSign,
    activeViews: ['cash'],
  },
];

// ────────────────────────────────────────────────────────────────────
// ASSERT DE INTEGRIDAD (solo dev): detecta destinos muertos POR CONSTRUCCIÓN
// ────────────────────────────────────────────────────────────────────

/** Conjunto de ViewTypes válidos declarados en el store. */
export const VALID_VIEWS: Set<string> = new Set([
  'occ', 'dashboard', 'wallet', 'pos', 'inventory', 'recepcion', 'reception_list',
  'transferencias', 'sales', 'inventory_count', 'cost-sheets', 'reports', 'catalog',
  'history', 'inventory_adjustments', 'audit', 'cash', 'users', 'roles', 'stores',
  'storefront-config', 'settings', 'help', 'wiki', 'news', 'rss_management',
  'management-hub', 'ipv', 'academy', 'legal', 'health', 'pick3-intelligence',
  'labels', 'sales_catalog', 'ofertas', 'purchase-orders', 'sales-hub',
  'exchange-intelligence', 'received-services', 'usage-monitoring', 'workers',
  'chat', 'costeo-dinamico', 'estructura-costo', 'whatsapp-config',
  'whatsapp-conversations', 'whatsapp-invitations', 'whatsapp-dashboard',
  'whatsapp-group', 'whatsapp-hub', 'telegram-config', 'telegram-conversations',
  'telegram-invitations', 'telegram-dashboard', 'telegram-group', 'telegram-hub',
  'accounts_payable', 'accounts_receivable', 'cash_report', 'production-orders',
  'devolutions', 'customers', 'quotations', 'fiscal-close', 'lots', 'warehouses',
  'abc-analysis', 'bank-reconciliation', 'calculator', 'accounts-payable',
  'punto_venta', 'almacen_gestion', 'almacen_operaciones', 'analitica',
  'ipv_reporting', 'ipv_operaciones', 'ipv_datos', 'ipv_procesamiento', 'ipv_avanzado',
  'cost_views', 'cost_gen', 'cost_templates', 'cost_tools',
  'costos', 'tienda', 'ipv_module', 'otros', 'administracion', 'recursos',
  // Secciones/hubs nuevos de la arquitectura GATE 1
  'operacion', 'analisis', 'sistema', 'ayuda', 'desarrollo', 'redes',
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
