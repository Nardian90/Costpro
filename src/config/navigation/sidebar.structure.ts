import {
  Activity,
  ListFilter,
  Home,
  FileText,
  Truck,
  Package,
  ShoppingCart,
  Users,
  Settings,
  HelpCircle,
  TrendingUp,
  History,
  Shield,
  Layers,
  LayoutGrid,
  Database,
  Search,
  PlusCircle,
  FileSearch,
  BarChart4,
  Cpu,
  Zap,
  Target,
  AlertCircle,
  ClipboardList,
  RefreshCcw,
  Warehouse,
  ArrowLeftRight,
  Receipt,
  DollarSign,
  Building,
  GraduationCap,
  Scale,
  Book,
  Newspaper,
  Rss,
  MoreHorizontal,
  Wallet,
  BarChart3,
  QrCode,
  ArrowRightLeft,
  Workflow,
  Table2,
  PackageSearch,
  ShieldCheck,
  HeartPulse,
  Wand2,
  Sparkles,
  BookOpen,
  Save,
  Download,
  FileSpreadsheet,
  Upload,
  GitCompareArrows,
  Gauge,
  UserCog
} from 'lucide-react';

export type NavItemType = 'item' | 'submenu' | 'group';

export interface NavModule {
  id: string;
  label: string;
  type: NavItemType;
  icon?: any;
  ariaLabel?: string;
  children?: NavModule[];
  allowedRoles?: string[];
  isBeta?: boolean;
  isNew?: boolean;
  /**
   * E-SectionHub (IA Audit): descripción larga para mostrar en tarjetas del
   * SectionHubView (vista overview estilo Odoo). Si no se especifica, el
   * SectionHubView usa ariaLabel como fallback.
   */
  description?: string;
}

export const SIDEBAR_STRUCTURE: NavModule[] = [
  {
    id: 'core',
    label: 'ESCRITORIO',
    type: 'group',
    icon: Home,
    ariaLabel: 'Navegación principal',
    children: [
      { id: 'occ', label: 'Centro de Control', type: 'item', icon: Home, ariaLabel: 'Ir al escritorio principal' },
    ]
  },
  {
    id: 'costos',
    allowedRoles: ['admin', 'manager', 'encargado', 'costo'],
    label: 'COSTOS',
    type: 'group',
    icon: FileText,
    ariaLabel: 'Módulo de Gestión de Costos',
    description: 'Gestión de costos: vistas de trabajo (generar fácil, tablero, modo asistido, informe, Arena FC) y herramientas (guardar, exportar Excel/PDF, importar JSON).',
    children: [
      {
        id: 'cost_views',
        label: 'Vistas de Trabajo',
        type: 'submenu',
        icon: LayoutGrid,
        children: [
          // B2-B3: "Generar fácil" como PRIMERA opción — reemplaza al grupo
          // "Generación" eliminado. Al hacer clic abre una vista con 2 tabs
          // internos: "Generación Rápida" y "Generación Experta".
          { id: 'gen-easy', label: 'Generar fácil', type: 'item', icon: Zap, ariaLabel: 'Generación rápida y experta de fichas de costo' },
          { id: 'cost-sheets', label: 'Tablero Principal', type: 'item', icon: Table2 },
          { id: 'view-assisted', label: 'Modo Asistido', type: 'item', icon: Sparkles },
          { id: 'view-reading', label: 'Informe', type: 'item', icon: ClipboardList },
          // C3+G2: "Arena FC" movido aquí desde el grupo Plantillas (eliminado).
          // Ahora vive en Vistas de Trabajo, debajo de Informe.
          { id: 'arena-fc', label: 'Arena FC', type: 'item', icon: GitCompareArrows, isBeta: true }
        ]
      },
      // B2: Grupo "Generación" eliminado — ahora es "Generar fácil" como primera
      // opción dentro de Vistas de Trabajo, con 2 tabs internos.
      // C3+G2: Grupo "Plantillas" eliminado — "Explorador Plantillas" ya es Tab 1
      // dentro de Tablero Principal, "Arena FC" se movió a Vistas de Trabajo,
      // e "Importar JSON" se movió a Herramientas.
      {
        id: 'cost_tools',
        label: 'Herramientas',
        type: 'submenu',
        icon: Settings,
        children: [
          { id: 'tool-save', label: 'Guardar Ficha', type: 'item', icon: Save },
          { id: 'tool-export-excel', label: 'Exportar Excel', type: 'item', icon: FileSpreadsheet },
          { id: 'tool-export-pdf', label: 'Exportar PDF', type: 'item', icon: Download },
          // C3+G2: "Importar JSON" movido aquí desde el grupo Plantillas (eliminado).
          // Ahora vive en Herramientas, debajo de Exportar PDF.
          { id: 'tool-import', label: 'Importar JSON', type: 'item', icon: Upload }
        ]
      }
    ]
  },
  {
    id: 'tienda',
    label: 'MULTI-TIENDA',
    type: 'group',
    icon: Building,
    ariaLabel: 'Operaciones Multi-Tienda',
    description: 'Operaciones de tienda: venta (POS, tabla IPV, catálogo, ofertas), almacén (stock, ajustes, etiquetas), logística (recepciones, OCs, transferencias) y analítica (dashboard, reportes).',
    allowedRoles: ['admin', 'manager', 'encargado', 'clerk', 'usuario', 'warehouse'],
    children: [
      // F1-T01: 'Gestión Tiendas' movida aquí desde CONFIGURACIÓN > Administrativa
      // para que sea accesible con 1 clic desde el grupo MULTI-TIENDA (donde el admin
      // naturalmente la busca), en lugar de estar a 3 niveles de profundidad.
      { id: 'stores', label: 'Gestión Tiendas', type: 'item', icon: Building, ariaLabel: 'Administrar tiendas del tenant', allowedRoles: ['admin'] },
      { id: 'workers', label: 'Trabajadores y Comisiones', type: 'item', icon: UserCog, ariaLabel: 'Gestión de trabajadores y cálculo de comisiones', description: 'CRUD de trabajadores por tienda, reglas de comisión versionables, cálculo por periodo y registro de pagos con auditoría completa.', allowedRoles: ['admin', 'manager', 'encargado'] },
      // QW-4 (IA Audit): "Dashboard KPI" y "Generador de Reportes" agrupados en
      // un submenú "Analítica". Antes eran 2 ítems sueltos a nivel raíz del grupo
      // MULTI-TIENDA, lo que rompía la cohesión (mezclaba operación con análisis).
      // Ahora el grupo MULTI-TIENDA tiene 4 entradas lógicas en lugar de 6 dispersas:
      // Gestión Tiendas · Analítica (submenu) · Punto de Venta · Almacén · Logística.
      {
        id: 'analitica',
        label: 'Analítica',
        type: 'submenu',
        ariaLabel: 'Indicadores y reportes de gestión',
        description: 'Indicadores de desempeño y generación de reportes profesionales de operación.',
        allowedRoles: ['admin', 'manager', 'encargado'],
        children: [
          { id: 'dashboard', label: 'Dashboard KPI', type: 'item', icon: TrendingUp, ariaLabel: 'Indicadores clave de desempeño', description: 'Indicadores clave de desempeño en tiempo real: ventas, stock, recepciones, rentabilidad.', allowedRoles: ['admin', 'manager', 'encargado'] },
          { id: 'exchange-intelligence', label: 'Inteligencia Cambiaria', type: 'item', icon: DollarSign, ariaLabel: 'Inteligencia cambiaria y devaluación monetaria', description: 'Centro de inteligencia económica: tasas oficiales vs informales, impacto en precios, alertas estratégicas y simulador de escenarios.', allowedRoles: ['admin', 'manager', 'encargado'] },
          { id: 'reports', label: 'Generador de Reportes', type: 'item', icon: BarChart4, ariaLabel: 'Diseñar y generar reportes profesionales', description: 'Diseña y genera reportes profesionales en PDF/Excel con filtros y agrupaciones personalizadas.', allowedRoles: ['admin', 'manager'] }
        ]
      },
      {
        id: 'punto_venta',
        label: 'Punto de Venta',
        type: 'submenu',
        ariaLabel: 'Gestión de ventas y caja',
        description: 'Operaciones de venta: terminal rápido, tabla IPV, catálogo, historial, arqueo y ofertas.',
        children: [
          // M-3 (IA Audit): acceso directo al Terminal de Venta como atajo 1-clic.
          // El clerk necesita llegar a "vender" lo más rápido posible. Antes:
          // sidebar → Punto de Venta (expand) → Venta (hub) → Terminal (2 clics + navegación).
          // Ahora: sidebar → Terminal (1 clic directo). El hub "Venta" sigue existiendo
          // para los demás accesos (Tabla IPV, Catálogo, Historial, Arqueo, Venta por Conteo).
          // El icono Zap refuerza visualmente que es el acceso "rápido" principal.
          { id: 'pos', label: 'Terminal', type: 'item', icon: Zap, ariaLabel: 'Acceso directo al Terminal de Venta (atajo rápido)', description: 'Venta rápida con carrito, atajos de teclado, escáner de código de barras y pago mixto. Ideal para ventas mostrador.', allowedRoles: ['admin', 'manager', 'encargado', 'clerk', 'usuario'] },
          { id: 'sales-hub', label: 'Venta', type: 'item', icon: ShoppingCart, ariaLabel: 'Hub de venta con accesos a Terminal, Tabla IPV, Catálogo, Historial, Arqueo y Venta por Conteo', description: 'Hub central con accesos a Terminal, Tabla IPV, Catálogo, Historial, Arqueo y Venta por Conteo.', allowedRoles: ['admin', 'manager', 'encargado', 'clerk', 'usuario'] },
          { id: 'ofertas', label: 'Ofertas Comerciales', type: 'item', icon: FileText, ariaLabel: 'Gestionar ofertas comerciales', description: 'Crea y gestiona promociones, descuentos y combos activos para la tienda.', allowedRoles: ['admin', 'manager', 'encargado'], isNew: true }
        ]
      },
      {
        // QW-3 (IA Audit): renombrado de "Gestión Inventario" → "Almacén".
        // Razón: el prefijo "Gestión" es redundante con el item hijo "Inventario"
        // ("Gestión Inventario > Inventario" era confuso). "Almacén" es el término
        // natural del dominio (Panamá/Cuba) y agrupa stock + ajustes + etiquetas.
        id: 'almacen_gestion',
        label: 'Almacén',
        type: 'submenu',
        ariaLabel: 'Control de existencias y catálogo',
        description: 'Gestión de existencias: consulta de stock, ajustes documentales y generación de etiquetas.',
        children: [
          { id: 'inventory', label: 'Inventario', type: 'item', icon: Package, ariaLabel: 'Stock actual, catálogo y trazabilidad', description: 'Stock actual por producto, catálogo maestro y trazabilidad de movimientos. Tabs: Stock | Catálogo | Trazabilidad.', allowedRoles: ['admin', 'manager', 'encargado', 'warehouse'] },
          { id: 'received-services', label: 'Servicios Recibidos', type: 'item', icon: Truck, ariaLabel: 'Servicios recibidos y costos asociados', description: 'Registro y distribución de costos asociados a recepciones: transporte, manipulación, seguro, aduana y otros servicios.', allowedRoles: ['admin', 'manager', 'encargado', 'warehouse'] },
          { id: 'inventory_adjustments', label: 'Ajustes Documentales', type: 'item', icon: RefreshCcw, ariaLabel: 'Corregir inventario', description: 'Registra ajustes de inventario con justificación documental (mermas, sobrantes, correcciones).', allowedRoles: ['admin', 'manager', 'encargado'] },
          { id: 'labels', label: 'Etiquetas y Codigos', type: 'item', icon: QrCode, ariaLabel: 'Generar etiquetas de producto', description: 'Genera etiquetas con código de barras y QR para imprimir en productos y estantes.', allowedRoles: ['admin', 'manager', 'encargado'] }
        ]
      },
      {
        id: 'almacen_operaciones',
        label: 'Logística',
        type: 'submenu',
        ariaLabel: 'Operaciones de almacén y logística',
        description: 'Operaciones de abastecimiento: recepciones, órdenes de compra y transferencias entre tiendas.',
        children: [
          { id: 'reception_list', label: 'Recepciones', type: 'item', icon: Warehouse, ariaLabel: 'Historial de recepciones y crear nueva', description: 'Historial de recepciones de mercancía. Crea nuevas recepciones con OCR, escaneo y validación contra OC.', allowedRoles: ['admin', 'manager', 'encargado', 'warehouse'] },
          { id: 'purchase-orders', label: 'Órdenes de Compra', type: 'item', icon: ClipboardList, ariaLabel: 'Gestionar pedidos a proveedores', description: 'Crea pedidos a proveedores, haz seguimiento de OCs enviadas y recibe mercancía contra OC.', allowedRoles: ['admin', 'manager', 'encargado', 'warehouse'] },
          { id: 'transferencias', label: 'Transferencia Stock', type: 'item', icon: ArrowLeftRight, ariaLabel: 'Mover entre almacenes', description: 'Transfiere productos entre tiendas con tracking de envío, tránsito y recepción.', allowedRoles: ['admin', 'manager', 'encargado', 'warehouse'] }
        ]
      },
    ]
  },
  {
    id: 'ipv_module',
    label: 'IPV',
    type: 'group',
    icon: Layers,
    ariaLabel: 'Módulo IPV',
    description: 'Módulo IPV: reportes y extractos (dashboard, reportes, recibos, transferencias, QR, extracto bancario, consolidado), operaciones (panel de control, transacciones), catálogos (productos, clientes), procesamiento IA (reglas, simulación, recepciones IA) y auditoría avanzada.',
    allowedRoles: ['admin', 'manager', 'encargado', 'clerk', 'usuario', 'warehouse'],
    children: [
      {
        id: 'ipv_reporting',
        label: 'Reportes y Extractos',
        type: 'submenu',
        ariaLabel: 'Informes de IPV',
        children: [
          { id: 'analytics', label: 'Dashboard Institucional', type: 'item', icon: TrendingUp },
          { id: 'reports_ipv', label: 'Reportes IPV', type: 'item', icon: ClipboardList },
          { id: 'receipts', label: 'Recibos SC-3-01', type: 'item', icon: Receipt },
          { id: 'transfers', label: 'Transferencias', type: 'item', icon: ArrowRightLeft },
          { id: 'qr', label: 'Pagos QR', type: 'item', icon: QrCode },
          { id: 'ingestion', label: 'Extracto Bancario', type: 'item', icon: Database },
          { id: 'pivot', label: 'Consolidado Datos', type: 'item', icon: FileSearch }
        ]
      },
      {
        id: 'ipv_operaciones',
        label: 'Operaciones IPV',
        type: 'submenu',
        ariaLabel: 'Operaciones del motor IPV',
        children: [
          { id: 'dashboard_ipv', label: 'Panel de Control', type: 'item', icon: Workflow },
          { id: 'transactions', label: 'Gestión Transacciones', type: 'item', icon: Table2 }
        ]
      },
      {
        id: 'ipv_datos',
        label: 'Catálogos IPV',
        type: 'submenu',
        ariaLabel: 'Datos maestros de IPV',
        children: [
          { id: 'catalog_ipv', label: 'Catálogo Productos', type: 'item', icon: PackageSearch },
          { id: 'customers', label: 'Directorio Clientes', type: 'item', icon: Users }
        ]
      },
      {
        id: 'ipv_procesamiento',
        label: 'Procesamiento IA',
        type: 'submenu',
        ariaLabel: 'Reglas y simulación inteligente',
        children: [
          { id: 'rules', label: 'Reglas Negocio', type: 'item', icon: Cpu },
          { id: 'sim', label: 'Simulación Escenarios', type: 'item', icon: Zap },
          { id: 'intelligent-receipts', label: 'Recepciones IA', type: 'item', icon: Wand2 },
          { id: 'breakdown', label: 'Desglose Operativo', type: 'item', icon: BarChart4 }
        ]
      },
      {
        id: 'ipv_avanzado',
        label: 'Avanzado y Auditoría',
        type: 'submenu',
        ariaLabel: 'Funciones avanzadas IPV',
        children: [
          { id: 'audit_ipv', label: 'Registro Auditoría', type: 'item', icon: History },
          { id: 'movements', label: 'Trazabilidad Flujo', type: 'item', icon: Workflow },
          { id: 'planning', label: 'Planeación Fiscal', type: 'item', icon: Target },
          { id: 'errors', label: 'Centro Errores', type: 'item', icon: AlertCircle },
          { id: 'mapping-rules', label: 'Mapeo Dinámico', type: 'item', icon: ListFilter },
          { id: 'mvt', label: 'Exportación Datos', type: 'item', icon: FileText },
          { id: 'mipyme', label: 'Transacciones Mipyme', type: 'item', icon: Users }
        ]
      }
    ]
  },
  {
    id: 'otros',
    label: 'OTROS',
    type: 'group',
    icon: LayoutGrid,
    ariaLabel: 'Otros Recursos',
    description: 'Recursos adicionales: inteligencia de picking (Pick 3) y billetera digital.',
    allowedRoles: ['admin', 'manager', 'encargado', 'clerk', 'usuario', 'warehouse'],
    children: [
      { id: 'pick3-intelligence', label: 'Pick 3 Intelligence', type: 'item', icon: BarChart3, ariaLabel: 'Inteligencia de picking', description: 'Análisis inteligente de picking: identifica los 3 productos más vendidos por categoría y optimiza el reabastecimiento.' },
      { id: 'wallet', label: 'Billetera Digital', type: 'item', icon: Wallet, ariaLabel: 'Gestión de billetera', description: 'Monitorea ingresos por transferencias, pagos digitales y notificaciones SMS en tiempo real.' }
    ]
  },
  {
    // F3-T03 + F3-T04: CONFIGURACIÓN renombrada a ADMINISTRACIÓN y aplanada a 2 niveles.
    // Antes tenía 3 submenús (administrativa/sistema/comunicación) que sumaban 3 niveles
    // de profundidad. Ahora todos los items son directos bajo el grupo.
    // Solo admin puede acceder (allowedRoles: ['admin']).
    id: 'administracion',
    label: 'ADMINISTRACIÓN',
    type: 'group',
    icon: Settings,
    ariaLabel: 'Gestión administrativa del tenant',
    description: 'Gestión administrativa del tenant: control de usuarios, seguridad y roles, salud de la plataforma, auditoría global, tablón de noticias y gestión RSS.',
    allowedRoles: ['admin'],
    children: [
      // F3-T04: items de gestión de entidades (antes bajo submenu 'administrativa')
      { id: 'users', label: 'Control Usuarios', type: 'item', icon: Users, description: 'Crea, edita y desactiva usuarios del tenant. Asigna memberships por tienda con roles granulares.' },
      { id: 'roles', label: 'Seguridad Roles', type: 'item', icon: ShieldCheck, description: 'Configura roles y permisos de acceso al sistema. Define qué puede hacer cada rol en cada módulo.' },
      // F3-T04: items de sistema (antes bajo submenu 'sistema')
      { id: 'health', label: 'Salud Plataforma', type: 'item', icon: HeartPulse, description: 'Monitorea el estado de servicios, latencia de API, conexión a BD y servicios externos en tiempo real.' },
      { id: 'usage-monitoring', label: 'Monitoreo de Uso', type: 'item', icon: Gauge, description: 'Estima consumo de Vercel + Supabase en plan gratuito. Alertas antes de llegar a límites (60/80/90%). Forecast mensual con promedio 7 días.' },
      { id: 'audit', label: 'Auditoría Global', type: 'item', icon: Shield, description: 'Registro completo de acciones de usuarios: quién hizo qué, cuándo y desde dónde. Filtrado por usuario, fecha y acción.' },
      // F3-T04: items de comunicación (antes bajo submenu 'comunicación')
      { id: 'news', label: 'Tablón Noticias', type: 'item', icon: Newspaper, description: 'Publica anuncios internos para el equipo. Notificaciones push a usuarios conectados.' },
      { id: 'rss_management', label: 'Gestión RSS', type: 'item', icon: Rss, description: 'Configura feeds RSS externos (noticias fiscales, contables, regulatorias) para mostrar en el tablón.' },
    ]
  },
  {
    // F3-T03: MÁS RECURSOS aplanada — Legal y Ayuda era un submenu, ahora items directos.
    // QW-2 (IA Audit): "Ajustes Globales" movido aquí desde el grupo PREFERENCIAS
    // (que fue eliminado). Un grupo entero con un solo ítem era ruido visual:
    // ocupaba una línea de cabecera "PREFERENCIAS" + el ítem, cuando el usuario
    // solo necesita 1 clic a sus ajustes. Ahora convive naturalmente con
    // Ayuda, Legal, Wiki y Academia, todos a 1 clic.
    id: 'recursos',
    label: 'MÁS RECURSOS',
    type: 'group',
    icon: HelpCircle,
    ariaLabel: 'Ayuda y Documentación',
    description: 'Ayuda y documentación: ajustes globales, marco legal, centro de ayuda, wiki contable y academia Pro.',
    children: [
      { id: 'settings', label: 'Ajustes Globales', type: 'item', icon: Settings, description: 'Preferencias personales de interfaz: tema, idioma, densidad, notificaciones y accesibilidad.' },
      { id: 'legal', label: 'Marco Legal', type: 'item', icon: Scale, description: 'Documentos legales: términos de servicio, política de privacidad, RGPD, contratos.' },
      { id: 'help', label: 'Centro Ayuda', type: 'item', icon: HelpCircle, description: 'Centro de ayuda con guías, FAQ, tutoriales y contacto con soporte.' },
      { id: 'wiki', label: 'Wiki Contable', type: 'item', icon: Book, description: 'Wiki contable: glosario, normativas cubanas (NC-29, Resoluciones ONAT), casos de uso.' },
      { id: 'academy', label: 'Academia Pro', type: 'item', icon: GraduationCap, description: 'Cursos y certificaciones: costos ABC, IPv, multi-tienda, gestión de inventario.' },
    ]
  }
];
