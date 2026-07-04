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
  ShieldCheck,
  Wallet,
  Activity,
  PlusCircle,
  Truck,
  Scale,
  ClipboardList,
  Building2,
  Newspaper,
  Zap,
  TrendingUp,
  Receipt,
  ArrowRightLeft,
  QrCode,
  Database,
  FileSearch,
  Workflow,
  Table2,
  PackageSearch,
  Cpu,
  Wand2,
  BarChart4,
  Target,
  AlertCircle,
  ListFilter,
  Gavel,
  Book,
  HelpCircle,
  Shield,
  RotateCcw,
  Warehouse,
  GraduationCap,
  Rss,
  Building,
  HeartPulse,
  Store
} from 'lucide-react';
import { ViewType } from '@/store';

export interface Action {
  id: string;
  label: string;
  icon: any; // Lucide icon
  keywords: string[];
  route: string; // ViewType or sidebar ID (resolved by navigation-map)
  roles?: string[];
  description?: string;
}

export const SYSTEM_ACTIONS: Action[] = [
  // ─── Multi-Tienda ───────────────────────────────────────────
  {
    id: 'dashboard',
    label: 'Dashboard KPI',
    icon: TrendingUp,
    keywords: ['dashboard', 'escritorio', 'centro', 'control', 'kpi', 'indicadores'],
    route: 'dashboard',
    description: 'Centro de Control con indicadores clave de desempeño.'
  },
  {
    id: 'pos',
    label: 'Punto de Venta (POS)',
    icon: ShoppingCart,
    keywords: ['venta', 'pos', 'caja', 'vender', 'factura', 'ticket', 'cliente', 'terminal'],
    route: 'pos',
    description: 'Registra ventas directas y genera comprobantes.'
  },
  // M-5 (IA Audit): acciones faltantes añadidas para que CommandPalette (Ctrl+K)
  // pueda buscar TODAS las vistas del módulo MULTI-TIENDA. Antes estas vistas
  // solo eran accesibles vía sidebar, obligando al usuario a navegar manualmente.
  // Ahora se pueden buscar y abrir con Cmd+K.
  {
    id: 'sales-hub',
    label: 'Hub de Venta',
    icon: ShoppingCart,
    keywords: ['venta', 'hub', 'terminal', 'tabla ipv', 'catálogo', 'historial', 'arqueo', 'venta por conteo', 'ofertas'],
    route: 'sales-hub',
    description: 'Hub central de venta con accesos a Terminal, Tabla IPV, Catálogo, Historial, Arqueo y Venta por Conteo.'
  },
  {
    id: 'ofertas',
    label: 'Ofertas Comerciales',
    icon: FileText,
    keywords: ['ofertas', 'promociones', 'descuentos', 'combos', '2x1', 'rebajas'],
    route: 'ofertas',
    description: 'Gestiona ofertas y promociones comerciales activas.'
  },
  {
    id: 'purchase-orders',
    label: 'Órdenes de Compra',
    icon: ClipboardList,
    keywords: ['ordenes', 'compra', 'pedidos', 'proveedores', 'abastecimiento', 'oc', 'po'],
    route: 'purchase-orders',
    description: 'Crea y gestiona pedidos a proveedores.'
  },
  {
    id: 'labels',
    label: 'Etiquetas y Códigos',
    icon: QrCode,
    keywords: ['etiquetas', 'codigos', 'barras', 'qr', 'imprimir', 'etiqueta producto'],
    route: 'labels',
    description: 'Genera etiquetas y códigos de barras/QR para productos.'
  },
  {
    id: 'sales',
    label: 'Historial de Ventas',
    icon: Receipt,
    keywords: ['ventas', 'historial', 'facturas', 'comprobantes', 'consultar'],
    route: 'sales',
    description: 'Consulta y analiza el historial de transacciones.'
  },
  {
    id: 'cash',
    label: 'Arqueo de Caja',
    icon: Scale,
    keywords: ['cierre', 'caja', 'arqueo', 'cuadre', 'efectivo', 'turno'],
    route: 'cash',
    description: 'Finaliza la jornada y verifica el saldo físico vs sistema.'
  },
  {
    id: 'catalog',
    label: 'Catálogo Maestro',
    icon: Package,
    keywords: ['catálogo', 'productos', 'precios', 'lista', 'maestro', 'referencias'],
    route: 'catalog',
    description: 'Administra el maestro de artículos y sus precios base.'
  },
  {
    id: 'inventory',
    label: 'Stock Actual',
    icon: Package,
    keywords: ['stock', 'inventario', 'existencias', 'almacén', 'productos'],
    route: 'inventory',
    description: 'Gestiona niveles de stock y alertas de reposición.'
  },
  {
    id: 'history',
    label: 'Trazabilidad Stock',
    icon: History,
    keywords: ['historial', 'movimientos', 'kardex', 'entradas', 'salidas', 'stock'],
    route: 'history',
    description: 'Visualiza la trazabilidad completa de cada producto.'
  },
  {
    id: 'inventory_adjustments',
    label: 'Ajustes Documentales',
    icon: RotateCcw,
    keywords: ['ajuste', 'inventario', 'corrección', 'documental', 'diferencia'],
    route: 'inventory_adjustments',
    description: 'Corrige diferencias de inventario con respaldo documental.'
  },
  {
    id: 'recepcion',
    label: 'Nueva Recepción',
    icon: Warehouse,
    keywords: ['recibir', 'mercancía', 'proveedor', 'entrada', 'compra', 'remisión'],
    route: 'recepcion',
    description: 'Registra el ingreso de nuevos productos al inventario.'
  },
  {
    id: 'reception_list',
    label: 'Historial Recepciones',
    icon: History,
    keywords: ['recepciones', 'historial', 'consultar', 'entradas', 'proveedor'],
    route: 'reception_list',
    description: 'Consulta el historial de recepciones de mercancía.'
  },
  {
    id: 'transferencias',
    label: 'Transferencia Stock',
    icon: ArrowRightLeft,
    keywords: ['transferencia', 'mover', 'almacén', 'entre', 'sucursales', 'traslado'],
    route: 'transferencias',
    description: 'Mueve productos entre almacenes o sucursales.'
  },
  {
    id: 'inventory_count',
    label: 'Auditoría Conteo',
    icon: ClipboardList,
    keywords: ['conteo', 'auditoría', 'inventario', 'físico', 'verificar'],
    route: 'inventory_count',
    description: 'Realiza inventario físico y compara con el sistema.'
  },

  // ─── Costos ─────────────────────────────────────────────────
  {
    id: 'new-cost',
    label: 'Tablero Principal Costos',
    icon: Table2,
    keywords: ['ficha', 'costo', 'tablero', 'principal', 'plantilla', 'cálculo', 'simulación'],
    route: 'cost-sheets',
    description: 'Tablero principal de gestión de fichas de costos.'
  },
  {
    id: 'view-assisted',
    label: 'Modo Asistido',
    icon: Wand2,
    keywords: ['asistido', 'costo', 'wizard', 'guiado', 'simplificado'],
    route: 'view-assisted',
    description: 'Crea fichas de costo con el asistente paso a paso.'
  },
  {
    id: 'view-reading',
    label: 'Lectura Narrativa',
    icon: BookOpen,
    keywords: ['lectura', 'narrativa', 'costo', 'resumen', 'documento'],
    route: 'view-reading',
    description: 'Vista narrativa de la ficha de costo para lectura fluida.'
  },
  {
    id: 'gen-quick',
    label: 'Generación Rápida',
    icon: Zap,
    keywords: ['rápida', 'generación', 'costo', 'veloz', 'express'],
    route: 'gen-quick',
    description: 'Genera fichas de costo de forma rápida y automatizada.'
  },
  {
    id: 'gen-expert',
    label: 'Generación Experta',
    icon: Wand2,
    keywords: ['experta', 'generación', 'costo', 'avanzada', 'detallada'],
    route: 'gen-expert',
    description: 'Generación avanzada con control total sobre cada sección.'
  },
  {
    id: 'templates',
    label: 'Explorador Plantillas',
    icon: FileSearch,
    keywords: ['plantillas', 'costo', 'explorar', 'modelos', 'guardar'],
    route: 'templates',
    description: 'Explora y gestiona plantillas de fichas de costo.'
  },
  {
    id: 'tool-import',
    label: 'Importar JSON Costos',
    icon: ClipboardList,
    keywords: ['importar', 'json', 'costo', 'cargar', 'restaurar'],
    route: 'tool-import',
    description: 'Importa una ficha de costo desde archivo JSON.'
  },
  {
    id: 'tool-save',
    label: 'Guardar Ficha',
    icon: ClipboardList,
    keywords: ['guardar', 'costo', 'descargar', 'exportar', 'json'],
    route: 'tool-save',
    description: 'Descarga la ficha de costo actual como JSON.'
  },
  {
    id: 'tool-export-excel',
    label: 'Exportar Excel',
    icon: BarChart3,
    keywords: ['exportar', 'excel', 'costo', 'hoja', 'cálculo'],
    route: 'tool-export-excel',
    description: 'Exporta la ficha de costo a formato Excel.'
  },
  {
    id: 'tool-export-pdf',
    label: 'Exportar PDF',
    icon: FileText,
    keywords: ['exportar', 'pdf', 'costo', 'documento', 'imprimir'],
    route: 'tool-export-pdf',
    description: 'Exporta la ficha de costo a formato PDF.'
  },
  {
    id: 'res-help',
    label: 'Ayuda de Vista Costos',
    icon: HelpCircle,
    keywords: ['ayuda', 'costo', 'vista', 'tutorial', 'guía'],
    route: 'res-help',
    description: 'Ayuda contextual del módulo de costos.'
  },
  {
    id: 'res-system-help',
    label: 'Ayuda del Sistema',
    icon: Activity,
    keywords: ['ayuda', 'sistema', 'soporte', 'general'],
    route: 'res-system-help',
    description: 'Centro de ayuda general del sistema.'
  },
  {
    id: 'res-academy',
    label: 'Academia Pro (Costos)',
    icon: GraduationCap,
    keywords: ['academia', 'costo', 'capacitación', 'aprender'],
    route: 'res-academy',
    description: 'Capacitación especializada en módulo de costos.'
  },

  // ─── IPV ────────────────────────────────────────────────────
  {
    id: 'analytics',
    label: 'Dashboard Institucional',
    icon: TrendingUp,
    keywords: ['dashboard', 'institucional', 'ipv', 'kpi', 'indicadores', 'general'],
    route: 'analytics',
    description: 'Vista general de indicadores y estado del módulo IPV.'
  },
  {
    id: 'reports_ipv',
    label: 'Reportes IPV',
    icon: FileText,
    keywords: ['reportes', 'ipv', 'informes', 'extractos', 'estadísticas'],
    route: 'reports_ipv',
    description: 'Genera reportes detallados del módulo IPV.'
  },
  {
    id: 'receipts',
    label: 'Recibos SC-3-01',
    icon: Receipt,
    keywords: ['recibos', 'sc301', 'ingresos', 'documentos', 'comprobantes'],
    route: 'receipts',
    description: 'Gestión de recibos de ingresos SC-3-01.'
  },
  {
    id: 'transfers',
    label: 'Transferencias',
    icon: ArrowRightLeft,
    keywords: ['transferencias', 'bancarias', 'envíos', 'ipv', 'cuentas'],
    route: 'transfers',
    description: 'Consulta transferencias bancarias registradas.'
  },
  {
    id: 'qr',
    label: 'Pagos QR',
    icon: QrCode,
    keywords: ['qr', 'pagos', 'cobros', 'código', 'lectura'],
    route: 'qr',
    description: 'Registros de pagos mediante código QR.'
  },
  {
    id: 'ingestion',
    label: 'Extracto Bancario',
    icon: Database,
    keywords: ['extracto', 'banco', 'ingesta', 'estado', 'cuenta', 'importar'],
    route: 'ingestion',
    description: 'Importa y procesa extractos bancarios para conciliación.'
  },
  {
    id: 'pivot',
    label: 'Consolidado Datos',
    icon: FileSearch,
    keywords: ['consolidado', 'datos', 'pivot', 'resumen', 'agregado'],
    route: 'pivot',
    description: 'Vista consolidada de todos los datos del módulo.'
  },
  {
    id: 'dashboard_ipv',
    label: 'Panel de Control IPV',
    icon: Workflow,
    keywords: ['panel', 'control', 'ipv', 'operaciones', 'transacciones'],
    route: 'dashboard_ipv',
    description: 'Panel de control de operaciones IPV.'
  },
  {
    id: 'transactions',
    label: 'Gestión Transacciones',
    icon: Table2,
    keywords: ['transacciones', 'ipv', 'gestión', 'bancarias', 'procesar'],
    route: 'transactions',
    description: 'Gestiona y procesa transacciones bancarias.'
  },
  {
    id: 'catalog_ipv',
    label: 'Catálogo Productos IPV',
    icon: PackageSearch,
    keywords: ['catálogo', 'productos', 'ipv', 'referencias', 'códigos'],
    route: 'catalog_ipv',
    description: 'Catálogo de productos para el motor de matching IPV.'
  },
  {
    id: 'customers',
    label: 'Directorio Clientes',
    icon: Users,
    keywords: ['clientes', 'directorio', 'contactos', 'ipv'],
    route: 'customers',
    description: 'Gestiona el directorio de clientes del sistema.'
  },
  {
    id: 'rules',
    label: 'Reglas de Negocio',
    icon: Cpu,
    keywords: ['reglas', 'negocio', 'matching', 'motor', 'criterios', 'ipv'],
    route: 'rules',
    description: 'Configura las reglas de matching del motor IPV.'
  },
  {
    id: 'sim',
    label: 'Simulación Escenarios',
    icon: Zap,
    keywords: ['simulación', 'escenarios', 'prueba', 'matching', 'ipv'],
    route: 'sim',
    description: 'Simula escenarios de matching antes de ejecutar.'
  },
  {
    id: 'intelligent-receipts',
    label: 'Recepciones IA',
    icon: Wand2,
    keywords: ['recepciones', 'inteligencia', 'artificial', 'ia', 'automático', 'ipv'],
    route: 'intelligent-receipts',
    description: 'Procesamiento inteligente de recepciones con IA.'
  },
  {
    id: 'breakdown',
    label: 'Desglose Operativo',
    icon: BarChart4,
    keywords: ['desglose', 'operativo', 'detalle', 'análisis', 'ipv'],
    route: 'breakdown',
    description: 'Desglose operativo detallado de transacciones.'
  },
  {
    id: 'audit_ipv',
    label: 'Registro Auditoría IPV',
    icon: History,
    keywords: ['auditoría', 'registro', 'trazabilidad', 'ipv', 'logs'],
    route: 'audit_ipv',
    description: 'Registro de auditoría de todas las operaciones IPV.'
  },
  {
    id: 'movements',
    label: 'Trazabilidad Flujo',
    icon: Workflow,
    keywords: ['trazabilidad', 'flujo', 'movimientos', 'ipv', 'seguimiento'],
    route: 'movements',
    description: 'Seguimiento completo del flujo de conciliación.'
  },
  {
    id: 'planning',
    label: 'Planeación Fiscal',
    icon: Target,
    keywords: ['planeación', 'fiscal', 'impuestos', 'proyección', 'ipv'],
    route: 'planning',
    description: 'Herramientas de planeación fiscal y proyecciones.'
  },
  {
    id: 'errors',
    label: 'Centro Errores',
    icon: AlertCircle,
    keywords: ['errores', 'incidentes', 'problemas', 'fallos', 'ipv'],
    route: 'errors',
    description: 'Centro de errores e incidentes del módulo IPV.'
  },
  {
    id: 'mapping-rules',
    label: 'Mapeo Dinámico',
    icon: ListFilter,
    keywords: ['mapeo', 'dinámico', 'reglas', 'cuentas', 'ipv'],
    route: 'mapping-rules',
    description: 'Configuración de mapeo dinámico de cuentas.'
  },
  {
    id: 'mvt',
    label: 'Exportación Datos IPV',
    icon: FileText,
    keywords: ['exportación', 'datos', 'mvt', 'descargar', 'ipv'],
    route: 'mvt',
    description: 'Exporta datos del módulo en diferentes formatos.'
  },
  {
    id: 'mipyme',
    label: 'Transacciones Mipyme',
    icon: Users,
    keywords: ['mipyme', 'transacciones', 'pequeña', 'empresa', 'ipv'],
    route: 'mipyme',
    description: 'Gestión de transacciones de pequeñas empresas.'
  },

  // ─── Otros Módulos ─────────────────────────────────────────
  {
    id: 'wallet',
    label: 'Billetera Digital',
    icon: Wallet,
    keywords: ['billetera', 'digital', 'notificaciones', 'sms', 'transferencias', 'ingresos'],
    route: 'wallet',
    description: 'Monitorea ingresos por transferencias y pagos digitales.'
  },
  {
    id: 'reports',
    label: 'Generador Reportes',
    icon: BarChart3,
    keywords: ['reportes', 'informes', 'pdf', 'excel', 'estadísticas', 'análisis', 'ventas'],
    route: 'reports',
    description: 'Genera informes detallados de operación y rentabilidad.'
  },
  {
    id: 'pick3',
    label: 'Pick3 Intelligence',
    icon: Zap,
    keywords: ['pick3', 'inteligencia', 'análisis', 'predicción', 'datos'],
    route: 'pick3-intelligence',
    description: 'Análisis avanzado y predicciones operativas.'
  },
  {
    id: 'academy',
    label: 'Academia Pro',
    icon: GraduationCap,
    keywords: ['aprender', 'capacitación', 'estudio', 'flashcards', 'conceptos', 'entrenamiento'],
    route: 'academy',
    description: 'Repasa conceptos clave y mejora tu dominio del sistema.'
  },

  // ─── Configuración ─────────────────────────────────────────
  {
    id: 'users',
    label: 'Control Usuarios',
    icon: Users,
    keywords: ['usuarios', 'equipo', 'personal', 'permisos', 'acceso', 'roles'],
    route: 'users',
    roles: ['admin'],
    description: 'Administra cuentas de usuario y niveles de acceso.'
  },
  {
    id: 'roles',
    label: 'Seguridad Roles',
    icon: ShieldCheck,
    keywords: ['roles', 'seguridad', 'permisos', 'accesos', 'privilegios'],
    route: 'roles',
    roles: ['admin'],
    description: 'Configura roles y permisos de acceso al sistema.'
  },
  {
    id: 'stores',
    label: 'Gestión Tiendas',
    icon: Building,
    keywords: ['tiendas', 'sucursales', 'locales', 'sedes', 'puntos de venta'],
    route: 'stores',
    roles: ['admin'],
    description: 'Configura las diferentes ubicaciones físicas de tu negocio.'
  },
  {
    id: 'storefront-config',
    label: 'Vitrina Pública',
    icon: Store,
    keywords: ['vitrina', 'banner', 'storefront', 'publica', 'tienda online', 'carrusel', 'promociones', 'whatsapp group', 'telegram'],
    route: 'storefront-config',
    roles: ['admin', 'manager', 'encargado'],
    description: 'Personaliza el banner, servicios, carrusel promocional y canales de contacto de tu vitrina pública.'
  },
  {
    id: 'health',
    label: 'Salud Plataforma',
    icon: HeartPulse,
    keywords: ['salud', 'status', 'rendimiento', 'errores', 'diagnóstico'],
    route: 'health',
    roles: ['admin'],
    description: 'Monitorea la integridad técnica y performance del ERP.'
  },
  {
    id: 'audit',
    label: 'Auditoría Global',
    icon: Shield,
    keywords: ['logs', 'auditoría', 'seguridad', 'trazabilidad', 'eventos', 'historial'],
    route: 'audit',
    roles: ['admin'],
    description: 'Revisa el historial de acciones críticas realizadas.'
  },
  {
    id: 'settings',
    label: 'Ajustes Globales',
    icon: Settings,
    keywords: ['ajustes', 'configuración', 'preferencias', 'perfil', 'sistema'],
    route: 'settings',
    description: 'Personaliza tu entorno de trabajo y opciones de cuenta.'
  },
  {
    id: 'news',
    label: 'Tablón Noticias',
    icon: Newspaper,
    keywords: ['noticias', 'actualidad', 'tablón', 'novedades'],
    route: 'news',
    description: 'Mantente al tanto de las últimas novedades del sector.'
  },
  {
    id: 'rss_management',
    label: 'Gestión RSS',
    icon: Rss,
    keywords: ['rss', 'feeds', 'fuentes', 'suscripciones'],
    route: 'rss_management',
    description: 'Gestiona las fuentes RSS del sistema.'
  },

  // ─── Recursos ──────────────────────────────────────────────
  {
    id: 'legal',
    label: 'Marco Legal',
    icon: Gavel,
    keywords: ['legal', 'leyes', 'normativa', 'regulación', 'cumplimiento'],
    route: 'legal',
    description: 'Información sobre el marco legal aplicable.'
  },
  {
    id: 'help',
    label: 'Centro Ayuda',
    icon: HelpCircle,
    keywords: ['ayuda', 'soporte', 'guía', 'tutorial', 'documentación'],
    route: 'help',
    description: 'Centro de ayuda y documentación del sistema.'
  },
  {
    id: 'wiki',
    label: 'Wiki Contable',
    icon: Book,
    keywords: ['wiki', 'contable', 'contabilidad', 'conceptos', 'definiciones'],
    route: 'wiki',
    description: 'Wiki de conceptos contables y definiciones.'
  },
];

export function getActionsForUser(role: string): Action[] {
  return SYSTEM_ACTIONS.filter(action => {
    if (!action.roles) return true;
    return action.roles.includes(role);
  });
}
