import {
  Activity,
  ListFilter,
  Home,
  FileText,
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
  FolderOpen,
  Save,
  Download,
  FileSpreadsheet,
  Upload,
  GitCompareArrows
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
    children: [
      {
        id: 'cost_views',
        label: 'Vistas de Trabajo',
        type: 'submenu',
        icon: LayoutGrid,
        children: [
          { id: 'cost-sheets', label: 'Tablero Principal', type: 'item', icon: Table2 },
          { id: 'view-assisted', label: 'Modo Asistido', type: 'item', icon: Sparkles },
          { id: 'view-reading', label: 'Informe', type: 'item', icon: ClipboardList }
        ]
      },
      {
        id: 'cost_gen',
        label: 'Generación',
        type: 'submenu',
        icon: Wand2,
        children: [
          { id: 'gen-quick', label: 'Generación Rápida', type: 'item', icon: Zap },
          { id: 'gen-expert', label: 'Generación Experta', type: 'item', icon: Wand2 }
        ]
      },
      {
        id: 'cost_templates',
        label: 'Plantillas',
        type: 'submenu',
        icon: FolderOpen,
        children: [
          { id: 'templates', label: 'Explorador Plantillas', type: 'item', icon: FolderOpen },
          { id: 'arena-fc', label: 'Arena FC', type: 'item', icon: GitCompareArrows, isBeta: true },
          { id: 'tool-import', label: 'Importar JSON', type: 'item', icon: Upload }
        ]
      },
      {
        id: 'cost_tools',
        label: 'Herramientas',
        type: 'submenu',
        icon: Settings,
        children: [
          { id: 'tool-save', label: 'Guardar Ficha', type: 'item', icon: Save },
          { id: 'tool-export-excel', label: 'Exportar Excel', type: 'item', icon: FileSpreadsheet },
          { id: 'tool-export-pdf', label: 'Exportar PDF', type: 'item', icon: Download }
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
    allowedRoles: ['admin', 'manager', 'encargado', 'clerk', 'usuario', 'warehouse'],
    children: [
      { id: 'dashboard', label: 'Dashboard KPI', type: 'item', icon: TrendingUp, ariaLabel: 'Indicadores clave de desempeño', allowedRoles: ['admin', 'manager', 'encargado'] },
      { id: 'reports', label: 'Generador de Reportes', type: 'item', icon: BarChart4, ariaLabel: 'Diseñar y generar reportes profesionales', allowedRoles: ['admin', 'manager'] },
      {
        id: 'punto_venta',
        label: 'Punto de Venta',
        type: 'submenu',
        ariaLabel: 'Gestión de ventas y caja',
        children: [
          { id: 'pos', label: 'Terminal de Venta', type: 'item', icon: ShoppingCart, ariaLabel: 'Realizar ventas', allowedRoles: ['admin', 'manager', 'encargado', 'clerk', 'usuario'] },
          { id: 'sales_catalog', label: 'Tabla IPV', type: 'item', icon: Table2, ariaLabel: 'Tabla interactiva de punto de venta', allowedRoles: ['admin', 'manager', 'encargado', 'clerk', 'usuario'], isNew: true },
          { id: 'sales', label: 'Historial de Ventas', type: 'item', icon: Receipt, ariaLabel: 'Consultar ventas', allowedRoles: ['admin', 'manager', 'encargado'] },
          { id: 'cash', label: 'Arqueo de Caja', type: 'item', icon: DollarSign, ariaLabel: 'Gestión de efectivo', allowedRoles: ['admin', 'manager', 'encargado'] }
        ]
      },
      {
        id: 'almacen_gestion',
        label: 'Gestión Inventario',
        type: 'submenu',
        ariaLabel: 'Control de existencias y catálogo',
        children: [
          { id: 'catalog', label: 'Catálogo Maestro', type: 'item', icon: Package, ariaLabel: 'Gestionar productos', allowedRoles: ['admin', 'manager', 'encargado'] },
          { id: 'inventory', label: 'Stock Actual', type: 'item', icon: Package, ariaLabel: 'Ver existencias', allowedRoles: ['admin', 'manager', 'encargado', 'warehouse'] },
          { id: 'history', label: 'Trazabilidad Stock', type: 'item', icon: History, ariaLabel: 'Movimientos de inventario', allowedRoles: ['admin', 'manager', 'encargado', 'warehouse'] },
          { id: 'inventory_adjustments', label: 'Ajustes Documentales', type: 'item', icon: RefreshCcw, ariaLabel: 'Corregir inventario', allowedRoles: ['admin', 'manager', 'encargado'] },
          { id: 'labels', label: 'Etiquetas y Codigos', type: 'item', icon: QrCode, ariaLabel: 'Generar etiquetas de producto', allowedRoles: ['admin', 'manager', 'encargado'] }
        ]
      },
      {
        id: 'almacen_operaciones',
        label: 'Logística',
        type: 'submenu',
        ariaLabel: 'Operaciones de almacén y logística',
        children: [
          { id: 'recepcion', label: 'Nueva Recepción', type: 'item', icon: Warehouse, ariaLabel: 'Recibir mercancía', allowedRoles: ['admin', 'manager', 'encargado', 'warehouse'] },
          { id: 'reception_list', label: 'Historial Recepciones', type: 'item', icon: History, ariaLabel: 'Consultar recepciones', allowedRoles: ['admin', 'manager', 'encargado', 'warehouse'] },
          { id: 'transferencias', label: 'Transferencia Stock', type: 'item', icon: ArrowLeftRight, ariaLabel: 'Mover entre almacenes', allowedRoles: ['admin', 'manager', 'encargado', 'warehouse'] },
          { id: 'inventory_count', label: 'Auditoría Conteo', type: 'item', icon: ClipboardList, ariaLabel: 'Realizar inventario físico', allowedRoles: ['admin', 'manager', 'encargado', 'warehouse'] }
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
    allowedRoles: ['admin', 'manager', 'encargado', 'clerk', 'usuario', 'warehouse'],
    children: [
      { id: 'pick3-intelligence', label: 'Pick 3 Intelligence', type: 'item', icon: BarChart3, ariaLabel: 'Inteligencia de picking' },
      { id: 'wallet', label: 'Billetera Digital', type: 'item', icon: Wallet, ariaLabel: 'Gestión de billetera' }
    ]
  },
  {
    id: 'configuracion',
    label: 'CONFIGURACIÓN',
    type: 'group',
    icon: Settings,
    ariaLabel: 'Ajustes del Sistema',
    allowedRoles: ['admin'],
    children: [
      {
        id: 'administrativa',
        label: 'Administrativa',
        type: 'submenu',
        ariaLabel: 'Gestión de usuarios y entidades',
        children: [
          { id: 'users', label: 'Control Usuarios', type: 'item', icon: Users },
          { id: 'roles', label: 'Seguridad Roles', type: 'item', icon: ShieldCheck },
          { id: 'stores', label: 'Gestión Tiendas', type: 'item', icon: Building }
        ]
      },
      {
        id: 'sistema',
        label: 'Sistema',
        type: 'submenu',
        ariaLabel: 'Mantenimiento del sistema',
        children: [
          { id: 'health', label: 'Salud Plataforma', type: 'item', icon: HeartPulse },
          { id: 'audit', label: 'Auditoría Global', type: 'item', icon: Shield },
          { id: 'settings', label: 'Ajustes Globales', type: 'item', icon: Settings }
        ]
      },
      {
        id: 'comunicacion',
        label: 'Comunicación',
        type: 'submenu',
        ariaLabel: 'Noticias y RSS',
        children: [
          { id: 'news', label: 'Tablón Noticias', type: 'item', icon: Newspaper },
          { id: 'rss_management', label: 'Gestión RSS', type: 'item', icon: Rss }
        ]
      }
    ]
  },
  {
    id: 'recursos',
    label: 'MÁS RECURSOS',
    type: 'group',
    icon: HelpCircle,
    ariaLabel: 'Ayuda y Documentación',
    children: [
      {
        id: 'legal_module_inner',
        label: 'Legal y Ayuda',
        type: 'submenu',
        icon: MoreHorizontal,
        ariaLabel: 'Información legal y soporte',
        children: [
          { id: 'legal', label: 'Marco Legal', type: 'item', icon: Scale },
          { id: 'help', label: 'Centro Ayuda', type: 'item', icon: HelpCircle },
          { id: 'wiki', label: 'Wiki Contable', type: 'item', icon: Book },
          { id: 'academy', label: 'Academia Pro', type: 'item', icon: GraduationCap }
        ]
      }
    ]
  }
];
