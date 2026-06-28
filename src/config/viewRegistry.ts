export interface ViewRegistryItem {
  id: string;
  route: string;
  description: string;
  actions: string[];
}

export const VIEW_REGISTRY: ViewRegistryItem[] = [
  {
    id: "chat",
    route: "/terminal?view=chat",
    description: "Chat con Darian, el asistente IA de CostPro. Consulta costos, ventas, busca productos, navega vistas y ejecuta acciones.",
    actions: ["ask_question", "search_entity", "get_cost_summary", "get_sales_summary", "open_view"]
  },
  {
    id: "dashboard",
    route: "/terminal",
    description: "Tablero principal con indicadores clave de rendimiento (KPIs), ventas del día y estado general.",
    actions: ["view_kpis", "refresh_data"]
  },
  {
    id: "wallet",
    route: "/terminal?view=wallet",
    description: "Billetera digital para el control de finanzas personales y empresariales, con importación de SMS.",
    actions: ["import_sms", "view_analytics", "export_backup"]
  },
  {
    id: "cost-sheets",
    route: "/terminal?view=cost-sheets",
    description: "Gestión de fichas de costo para productos procesados y servicios.",
    actions: ["create", "edit", "delete", "export", "duplicate", "generate_annex"]
  },
  {
    id: "ipv",
    route: "/terminal?view=ipv",
    description: "Índice de Precios de Venta (IPV) y reportes de transferencias bancarias.",
    actions: ["view_reports", "process_transfers"]
  },
  {
    id: "pos",
    route: "/terminal?view=pos",
    description: "Punto de Venta para realizar facturación y ventas directas.",
    actions: ["process_sale", "scan_product"]
  },
  {
    id: "sales_catalog",
    route: "/terminal?view=sales_catalog",
    description: "Catálogo de Ventas: tabla previsualizada de venta tipo Excel con precios, descuentos, formas de pago y selección de unidad de medida por producto.",
    actions: ["bulk_sale", "set_prices", "set_discounts", "set_payments"]
  },
  {
    id: "sales",
    route: "/terminal?view=sales",
    description: "Historial y listado de ventas realizadas.",
    actions: ["view_details", "void_sale", "export_list"]
  },
  {
    id: "catalog",
    route: "/terminal?view=catalog",
    description: "Catálogo maestro de productos y servicios.",
    actions: ["create_product", "edit_product", "delete_product"]
  },
  {
    id: "inventory",
    route: "/terminal?view=inventory",
    description: "Control de existencias y niveles de stock por almacén.",
    actions: ["adjust_stock", "view_history"]
  },
  {
    id: "recepcion",
    route: "/terminal?view=recepcion",
    description: "Proceso de recepción de mercancía y entrada al almacén.",
    actions: ["register_entry"]
  },
  {
    id: "transferencias",
    route: "/terminal?view=transferencias",
    description: "Gestión de traslados de productos entre almacenes o tiendas.",
    actions: ["create_transfer"]
  },
  {
    id: "legal",
    route: "/terminal?view=legal",
    description: "Módulo de normativas legales y resoluciones vigentes.",
    actions: ["view_resolutions", "search_legal"]
  },
  {
    id: "health",
    route: "/terminal?view=health",
    description: "Panel de salud del sistema, métricas de infraestructura y Release Gate (MRI).",
    actions: ["check_status", "export_mri"]
  },
  {
    id: "settings",
    route: "/terminal?view=settings",
    description: "Configuración general del sistema, empresa y preferencias de usuario.",
    actions: ["update_profile", "configure_ai"]
  },
  {
    id: "help",
    route: "/terminal?view=help",
    description: "Centro de ayuda, documentación y tutoriales del sistema.",
    actions: ["search_docs"]
  },
  {
    id: "users",
    route: "/terminal?view=users",
    description: "Gestión de usuarios, permisos y accesos al sistema.",
    actions: ["create_user", "edit_user", "reset_password"]
  },
  {
    id: "stores",
    route: "/terminal?view=stores",
    description: "Administración de tiendas y almacenes de la empresa.",
    actions: ["create_store", "edit_store"]
  },
  {
    id: "reports",
    route: "/terminal?view=reports",
    description: "Generación de reportes avanzados y analítica de datos.",
    actions: ["generate_custom_report"]
  },
  {
    id: "academy",
    route: "/terminal?view=academy",
    description: "Academia de capacitación y aprendizaje para el personal.",
    actions: ["start_lesson", "view_progress"]
  },
  {
    id: "wiki",
    route: "/terminal?view=wiki",
    description: "Wiki de contabilidad con términos, definiciones y conceptos del área financiera y tributaria.",
    actions: ["search_terms", "view_article", "bookmark_entry"]
  },
  {
    id: "audit",
    route: "/terminal?view=audit",
    description: "Logs de auditoría y rastreo de acciones de usuarios en el sistema.",
    actions: ["view_audit_logs", "export_audit"]
  },
  {
    id: "cash",
    route: "/terminal?view=cash",
    description: "Gestión de caja, cierres y arqueos de efectivo.",
    actions: ["close_cash", "view_closures"]
  },
  {
    id: "history",
    route: "/terminal?view=history",
    description: "Historial de movimientos de inventario y trazabilidad de productos.",
    actions: ["view_stock_history"]
  },
  {
    id: "inventory_adjustments",
    route: "/terminal?view=inventory_adjustments",
    description: "Ajustes manuales de inventario por merma, rotura o corrección.",
    actions: ["create_adjustment"]
  },
  {
    id: "inventory_count",
    route: "/terminal?view=inventory_count",
    description: "Realización de conteos físicos y auditoría de stock.",
    actions: ["start_count", "reconcile_count"]
  },
  {
    id: "labels",
    route: "/terminal?view=labels",
    description: "Generación e impresión de etiquetas de producto con código de barras para exhibición. Hasta 4 por hoja carta.",
    actions: ["generate_labels", "print_labels"]
  },
  {
    id: "news",
    route: "/terminal?view=news",
    description: "Noticias y comunicados internos de la empresa.",
    actions: ["read_news"]
  },
  {
    id: "roles",
    route: "/terminal?view=roles",
    description: "Gestión de roles y permisos del sistema.",
    actions: ["manage_permissions"]
  },
  {
    id: "rss_management",
    route: "/terminal?view=rss_management",
    description: "Configuración de fuentes de noticias RSS externas.",
    actions: ["add_source"]
  }
];

export const getViewDetails = (viewId: string) => {
  return VIEW_REGISTRY.find(v => v.id === viewId);
};
