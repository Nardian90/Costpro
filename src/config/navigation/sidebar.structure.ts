import {
  TrendingUp, BarChart3, Wallet, FileText, ShoppingCart, Receipt,
  DollarSign, Package, Warehouse, History, ArrowLeftRight, ClipboardList,
  RefreshCcw, HeartPulse, Shield, Settings, Users, ShieldCheck, Building,
  Rss, Newspaper, Scale, HelpCircle, Book, GraduationCap, BarChart4,
  Zap, Database, FileSearch, Workflow, Table2, PackageSearch, Cpu, Wand2,
  Target, AlertCircle, ListFilter, QrCode, ArrowRightLeft
} from 'lucide-react';

export type NavItemType = 'group' | 'submenu' | 'item';

export interface NavModule {
  id: string;
  label: string;
  type: NavItemType;
  icon?: any;
  children?: NavModule[];
  featureFlag?: string;
  isDirect?: boolean; // Para retrocompatibilidad y comportamiento de despliegue
}

export const SIDEBAR_STRUCTURE: NavModule[] = [
  {
    id: 'estrategico',
    label: 'MÓDULO ESTRATÉGICO',
    type: 'group',
    isDirect: true,
    children: [
      { id: 'dashboard', label: 'KPI', type: 'item', icon: TrendingUp },
      { id: 'pick3-intelligence', label: 'Pick 3 Intelligence', type: 'item', icon: BarChart3 },
      { id: 'wallet', label: 'Billetera', type: 'item', icon: Wallet },
      { id: 'cost-sheets', label: 'Costos', type: 'item', icon: FileText }
    ]
  },
  {
    id: 'tienda',
    label: 'TIENDA',
    type: 'group',
    children: [
      {
        id: 'punto_venta',
        label: 'Punto de Venta',
        type: 'submenu',
        children: [
          { id: 'pos', label: 'Vender', type: 'item', icon: ShoppingCart },
          { id: 'sales', label: 'Ventas', type: 'item', icon: Receipt },
          { id: 'cash', label: 'Caja', type: 'item', icon: DollarSign }
        ]
      },
      {
        id: 'almacen',
        label: 'Almacén',
        type: 'submenu',
        children: [
          { id: 'catalog', label: 'Catálogo', type: 'item', icon: Package },
          { id: 'inventory', label: 'Inventario', type: 'item', icon: Package },
          { id: 'recepcion', label: 'Recepcionar', type: 'item', icon: Warehouse },
          { id: 'reception_list', label: 'Recepciones', type: 'item', icon: History },
          { id: 'transferencias', label: 'Transferencias', type: 'item', icon: ArrowLeftRight },
          { id: 'inventory_count', label: 'Conteo', type: 'item', icon: ClipboardList },
          { id: 'history', label: 'Movimientos', type: 'item', icon: History },
          { id: 'inventory_adjustments', label: 'Ajustes Doc.', type: 'item', icon: RefreshCcw }
        ]
      }
    ]
  },
  {
    id: 'ipv_module',
    label: 'IPV BUILDER',
    type: 'group',
    children: [
      {
        id: 'ipv_reporting',
        label: '📊 Reportes & Extractos',
        type: 'submenu',
        children: [
          { id: 'analytics', label: 'Dashboard Institucional', type: 'item', icon: TrendingUp },
          { id: 'reports_ipv', label: 'Reportes IPV', type: 'item', icon: ClipboardList },
          { id: 'receipts', label: 'Recibos SC-3-01', type: 'item', icon: Receipt },
          { id: 'transfers', label: 'Transferencias', type: 'item', icon: ArrowRightLeft },
          { id: 'qr', label: 'Pagos QR', type: 'item', icon: QrCode },
          { id: 'ingestion', label: 'Extracto', type: 'item', icon: Database },
          { id: 'pivot', label: 'Consolidado', type: 'item', icon: FileSearch }
        ]
      },
      {
        id: 'ipv_operaciones',
        label: '⚙️ Operaciones',
        type: 'submenu',
        children: [
          { id: 'dashboard_ipv', label: 'Panel de Control', type: 'item', icon: Workflow },
          { id: 'transactions', label: 'Transacciones', type: 'item', icon: Table2 }
        ]
      },
      {
        id: 'ipv_datos',
        label: '👥 Catálogos',
        type: 'submenu',
        children: [
          { id: 'catalog_ipv', label: 'Catálogo', type: 'item', icon: PackageSearch },
          { id: 'customers', label: 'Clientes', type: 'item', icon: Users }
        ]
      },
      {
        id: 'ipv_procesamiento',
        label: '🔄 Procesamiento',
        type: 'submenu',
        children: [
          { id: 'rules', label: 'Reglas', type: 'item', icon: Cpu },
          { id: 'sim', label: 'Simulación', type: 'item', icon: Zap },
          { id: 'intelligent-receipts', label: 'Recepciones Inteligentes', type: 'item', icon: Wand2 },
          { id: 'breakdown', label: 'Desglose', type: 'item', icon: BarChart4 }
        ]
      },
      {
        id: 'ipv_avanzado',
        label: '⚡ Avanzado',
        type: 'submenu',
        children: [
          { id: 'audit_ipv', label: 'Auditoría', type: 'item', icon: History },
          { id: 'movements', label: 'Trazabilidad', type: 'item', icon: Workflow },
          { id: 'planning', label: 'Planeación', type: 'item', icon: Target },
          { id: 'errors', label: 'Errores', type: 'item', icon: AlertCircle },
          { id: 'mapping-rules', label: 'Mapeo', type: 'item', icon: ListFilter },
          { id: 'mvt', label: 'Exportación', type: 'item', icon: FileText },
          { id: 'mipyme', label: 'Transacciones Mipyme', type: 'item', icon: Users }
        ]
      }
    ]
  },
  {
    id: 'configuracion',
    label: 'CONFIGURACIÓN',
    type: 'group',
    children: [
      {
        id: 'administrativa',
        label: 'Administrativa',
        type: 'submenu',
        children: [
          { id: 'users', label: 'Usuarios', type: 'item', icon: Users },
          { id: 'roles', label: 'Roles', type: 'item', icon: ShieldCheck },
          { id: 'stores', label: 'Tiendas', type: 'item', icon: Building }
        ]
      },
      {
        id: 'sistema',
        label: 'Sistema',
        type: 'submenu',
        children: [
          { id: 'health', label: 'Salud', type: 'item', icon: HeartPulse },
          { id: 'audit', label: 'Auditoría', type: 'item', icon: Shield },
          { id: 'settings', label: 'Configuración', type: 'item', icon: Settings },
          { id: 'reports', label: 'Reportes', type: 'item', icon: FileText }
        ]
      },
      {
        id: 'comunicacion',
        label: 'Comunicación',
        type: 'submenu',
        children: [
          { id: 'news', label: 'Noticias', type: 'item', icon: Newspaper },
          { id: 'rss_management', label: 'Feed RSS', type: 'item', icon: Rss }
        ]
      }
    ]
  },
  {
    id: 'legal_module',
    label: 'NORMATIVAS / LEGAL',
    type: 'group',
    isDirect: true,
    children: [
      { id: 'legal', label: 'Legal', type: 'item', icon: Scale },
      { id: 'help', label: 'Ayuda', type: 'item', icon: HelpCircle },
      { id: 'wiki', label: 'Wiki Contable', type: 'item', icon: Book },
      { id: 'academy', label: 'Academia', type: 'item', icon: GraduationCap }
    ]
  }
];
