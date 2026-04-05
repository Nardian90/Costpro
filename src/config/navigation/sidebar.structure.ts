import {
  TrendingUp, BarChart3, Wallet, FileText, ShoppingCart, Receipt,
  DollarSign, Package, Warehouse, History, ArrowLeftRight, ClipboardList,
  RefreshCcw, HeartPulse, Shield, Settings, Users, ShieldCheck, Building,
  Rss, Newspaper, Scale, HelpCircle, Book, GraduationCap, BarChart4,
  Zap, Database, FileSearch, Workflow, Table2, PackageSearch, Cpu, Wand2,
  Target, AlertCircle, ListFilter, QrCode, ArrowRightLeft, MoreHorizontal,
  LayoutDashboard, Layout, PenTool, FileSpreadsheet
} from 'lucide-react';

export type NavItemType = 'group' | 'submenu' | 'item';

export interface NavModule {
  id: string;
  label: string;
  type: NavItemType;
  icon?: any;
  children?: NavModule[];
  featureFlag?: string;
  isDirect?: boolean;
  ariaLabel?: string;
}

export const SIDEBAR_STRUCTURE: NavModule[] = [
  {
    id: 'estrategico',
    label: 'ESTRATÉGICO',
    type: 'group',
    isDirect: true,
    ariaLabel: 'Módulo Estratégico',
    children: [
      { id: 'dashboard', label: 'Dashboard KPI', type: 'item', icon: TrendingUp, ariaLabel: 'Indicadores clave de desempeño' },
      { id: 'pick3-intelligence', label: 'Pick 3 Intelligence', type: 'item', icon: BarChart3, ariaLabel: 'Inteligencia de picking' },
      { id: 'wallet', label: 'Billetera Digital', type: 'item', icon: Wallet, ariaLabel: 'Gestión de billetera' },
      {
        id: 'cost-sheets-module',
        label: 'Fichas de Costo',
        type: 'submenu',
        icon: FileText,
        ariaLabel: 'Gestión de costos',
        children: [
            { id: 'cost-sheets', label: 'Principal', type: 'item', icon: FileText },
            { id: 'cs_kpis', label: 'Tablero KPI', type: 'item', icon: BarChart3 },
            { id: 'cs_header', label: 'Encabezado', type: 'item', icon: Layout },
            { id: 'cs_sections', label: 'Secciones', type: 'item', icon: ListFilter },
            { id: 'cs_annexes', label: 'Anexos', type: 'item', icon: FileSpreadsheet },
            { id: 'cs_signature', label: 'Firmas', type: 'item', icon: PenTool }
        ]
      }
    ]
  },
  {
    id: 'tienda',
    label: 'OPERACIONES TIENDA',
    type: 'group',
    ariaLabel: 'Operaciones de la Tienda',
    children: [
      {
        id: 'punto_venta',
        label: 'Punto de Venta',
        type: 'submenu',
        ariaLabel: 'Gestión de ventas y caja',
        children: [
          { id: 'pos', label: 'Terminal de Venta', type: 'item', icon: ShoppingCart, ariaLabel: 'Realizar ventas' },
          { id: 'sales', label: 'Historial de Ventas', type: 'item', icon: Receipt, ariaLabel: 'Consultar ventas' },
          { id: 'cash', label: 'Arqueo de Caja', type: 'item', icon: DollarSign, ariaLabel: 'Gestión de efectivo' }
        ]
      },
      {
        id: 'almacen_gestion',
        label: 'Gestión Inventario',
        type: 'submenu',
        ariaLabel: 'Control de existencias y catálogo',
        children: [
          { id: 'catalog', label: 'Catálogo Maestro', type: 'item', icon: Package, ariaLabel: 'Gestionar productos' },
          { id: 'inventory', label: 'Stock Actual', type: 'item', icon: Package, ariaLabel: 'Ver existencias' },
          { id: 'history', label: 'Trazabilidad Stock', type: 'item', icon: History, ariaLabel: 'Movimientos de inventario' },
          { id: 'inventory_adjustments', label: 'Ajustes Documentales', type: 'item', icon: RefreshCcw, ariaLabel: 'Corregir inventario' }
        ]
      },
      {
        id: 'almacen_operaciones',
        label: 'Logística',
        type: 'submenu',
        ariaLabel: 'Operaciones de almacén y logística',
        children: [
          { id: 'recepcion', label: 'Nueva Recepción', type: 'item', icon: Warehouse, ariaLabel: 'Recibir mercancía' },
          { id: 'reception_list', label: 'Historial Recepciones', type: 'item', icon: History, ariaLabel: 'Consultar recepciones' },
          { id: 'transferencias', label: 'Transferencia Stock', type: 'item', icon: ArrowLeftRight, ariaLabel: 'Mover entre almacenes' },
          { id: 'inventory_count', label: 'Auditoría Conteo', type: 'item', icon: ClipboardList, ariaLabel: 'Realizar inventario físico' }
        ]
      }
    ]
  },
  {
    id: 'ipv_module',
    label: 'IPV BUILDER',
    type: 'group',
    ariaLabel: 'Constructor de IPV',
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
    id: 'configuracion',
    label: 'CONFIGURACIÓN',
    type: 'group',
    ariaLabel: 'Ajustes del Sistema',
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
          { id: 'settings', label: 'Ajustes Globales', type: 'item', icon: Settings },
          { id: 'reports', label: 'Generador Reportes', type: 'item', icon: FileText }
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
    isDirect: true,
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
