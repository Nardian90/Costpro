export interface ViewRegistryItem {
  id: string;
  route: string;
  description: string;
  actions: string[];
}

export const VIEW_REGISTRY: ViewRegistryItem[] = [
  {
    id: "dashboard",
    route: "/terminal",
    description: "Tablero principal con indicadores clave de rendimiento (KPIs), ventas del día y estado general.",
    actions: ["view_kpis", "refresh_data"]
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
  }
];

export const getViewDetails = (viewId: string) => {
  return VIEW_REGISTRY.find(v => v.id === viewId);
};
