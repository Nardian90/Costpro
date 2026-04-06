import {
  FileText,
  CreditCard,
  ShoppingCart,
  Package,
  Users,
  Settings,
  BarChart3,
  BookOpen,
  History,
  Search,
  ShieldCheck,
  LayoutDashboard,
  Wallet,
  Activity,
  PlusCircle,
  Truck,
  RotateCcw,
  Scale,
  ClipboardList,
  Building2,
  Newspaper,
  Gavel,
  Zap
} from 'lucide-react';
import { ViewType } from '@/store';

export interface Action {
  id: string;
  label: string;
  icon: any; // Lucide icon
  keywords: string[];
  route: ViewType;
  roles?: string[];
  description?: string;
}

export const SYSTEM_ACTIONS: Action[] = [
  {
    id: 'new-cost',
    label: 'Nueva Ficha de Costo',
    icon: PlusCircle,
    keywords: ['ficha', 'costo', 'crear', 'nueva', 'plantilla', 'cálculo', 'simulación'],
    route: 'cost-sheets',
    roles: ['admin', 'costo', 'gerente'],
    description: 'Crea una nueva simulación de costos y precios.'
  },
  {
    id: 'reconcile',
    label: 'Conciliar Banco (IPV)',
    icon: CreditCard,
    keywords: ['conciliar', 'banco', 'cuenta', 'estado', 'matching', 'ipv', 'reconciliación'],
    route: 'ipv',
    roles: ['admin', 'gerente'],
    description: 'Cruza depósitos bancarios con salidas de inventario.'
  },
  {
    id: 'pos',
    label: 'Punto de Venta (POS)',
    icon: ShoppingCart,
    keywords: ['venta', 'pos', 'caja', 'vender', 'factura', 'ticket', 'cliente'],
    route: 'pos',
    description: 'Registra ventas directas y genera comprobantes.'
  },
  {
    id: 'inventory',
    label: 'Control de Inventario',
    icon: Package,
    keywords: ['stock', 'inventario', 'productos', 'almacén', 'existencias', 'conteo'],
    route: 'inventory',
    description: 'Gestiona niveles de stock y alertas de reposición.'
  },
  {
    id: 'catalog',
    label: 'Catálogo de Productos',
    icon: ClipboardList,
    keywords: ['catálogo', 'productos', 'precios', 'lista', 'maestro', 'referencias'],
    route: 'catalog',
    description: 'Administra el maestro de artículos y sus precios base.'
  },
  {
    id: 'reports',
    label: 'Reportes y Análisis',
    icon: BarChart3,
    keywords: ['reportes', 'informes', 'pdf', 'excel', 'estadísticas', 'análisis', 'ventas'],
    route: 'reports',
    description: 'Genera informes detallados de operación y rentabilidad.'
  },
  {
    id: 'wallet',
    label: 'Billetera Digital',
    icon: Wallet,
    keywords: ['billetera', 'digital', 'notificaciones', 'sms', 'transferencias', 'ingresos'],
    route: 'wallet',
    roles: ['admin', 'gerente'],
    description: 'Monitorea ingresos por transferencias y pagos digitales.'
  },
  {
    id: 'academy',
    label: 'Academy (Capacitación)',
    icon: BookOpen,
    keywords: ['aprender', 'capacitación', 'estudio', 'flashcards', 'conceptos', 'entrenamiento'],
    route: 'academy',
    description: 'Repasa conceptos clave y mejora tu dominio del sistema.'
  },
  {
    id: 'users',
    label: 'Gestión de Usuarios',
    icon: Users,
    keywords: ['usuarios', 'equipo', 'personal', 'permisos', 'acceso', 'roles'],
    route: 'users',
    roles: ['admin'],
    description: 'Administra cuentas de usuario y niveles de acceso.'
  },
  {
    id: 'stores',
    label: 'Sucursales',
    icon: Building2,
    keywords: ['tiendas', 'sucursales', 'locales', 'sedes', 'puntos de venta'],
    route: 'stores',
    roles: ['admin'],
    description: 'Configura las diferentes ubicaciones físicas de tu negocio.'
  },
  {
    id: 'settings',
    label: 'Configuración',
    icon: Settings,
    keywords: ['ajustes', 'configuración', 'preferencias', 'perfil', 'sistema'],
    route: 'settings',
    description: 'Personaliza tu entorno de trabajo y opciones de cuenta.'
  },
  {
    id: 'audit',
    label: 'Auditoría de Sistema',
    icon: ShieldCheck,
    keywords: ['logs', 'auditoría', 'seguridad', 'trazabilidad', 'eventos', 'historial'],
    route: 'audit',
    roles: ['admin'],
    description: 'Revisa el historial de acciones críticas realizadas.'
  },
  {
    id: 'health',
    label: 'Estado del Sistema',
    icon: Activity,
    keywords: ['salud', 'status', 'rendimiento', 'errores', 'diagnóstico', 'v9'],
    route: 'health',
    roles: ['admin'],
    description: 'Monitorea la integridad técnica y performance del ERP.'
  },
  {
    id: 'history',
    label: 'Movimientos de Stock',
    icon: History,
    keywords: ['historial', 'movimientos', 'kardex', 'entradas', 'salidas', 'stock'],
    route: 'history',
    description: 'Visualiza la trazabilidad completa de cada producto.'
  },
  {
    id: 'recepcion',
    label: 'Recepción de Mercancía',
    icon: Truck,
    keywords: ['recibir', 'mercancía', 'proveedor', 'entrada', 'compra', 'remisión'],
    route: 'recepcion',
    description: 'Registra el ingreso de nuevos productos al inventario.'
  },
  {
    id: 'cash',
    label: 'Cierre de Caja',
    icon: Scale,
    keywords: ['cierre', 'caja', 'arqueo', 'cuadre', 'efectivo', 'turno'],
    route: 'cash',
    description: 'Finaliza la jornada y verifica el saldo físico vs sistema.'
  },
  {
    id: 'news',
    label: 'Noticias y RSS',
    icon: Newspaper,
    keywords: ['noticias', 'actualidad', 'rss', 'feeds', 'información'],
    route: 'news',
    description: 'Mantente al tanto de las últimas novedades del sector.'
  },
  {
    id: 'pick3',
    label: 'Pick3 Intelligence',
    icon: Zap,
    keywords: ['pick3', 'inteligencia', 'análisis', 'predicción', 'datos'],
    route: 'pick3-intelligence',
    roles: ['admin', 'gerente'],
    description: 'Análisis avanzado y predicciones operativas.'
  }
];

export function getActionsForUser(role: string): Action[] {
  return SYSTEM_ACTIONS.filter(action => {
    if (!action.roles) return true;
    return action.roles.includes(role);
  });
}
