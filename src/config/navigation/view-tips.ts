/**
 * ViewTips — Tips profesionales contextuales por vista.
 *
 * FIX-PERF-TIPS (2026-07-13): reemplaza la lista aleatoria de greetings
 * ("¡Hola!", "Listo", "¡Vamos!") por tips profesionales relevantes a la
 * vista actual del usuario. Cada vista tiene un tip que ayuda al usuario
 * a usar mejor la aplicación.
 *
 * En modo performance, el tip se muestra como texto sutil de fondo.
 * En modo enhanced, se muestra con animación de partículas.
 */

export const VIEW_TIPS: Record<string, string> = {
  // Escritorio / Dashboard
  'occ': 'Usa ⌘K para búsqueda rápida',
  'dashboard': 'Monitorea tus KPIs en tiempo real',

  // Chat
  'chat': 'Pregunta a Darian sobre costos, ventas o inventario',

  // Costos
  'cost-sheets': 'Genera fichas de costo con plantillas predefinidas',
  'cost-sheet-editor': 'Usa anexos para detallar materias primas',
  'gen-easy': 'Generación rápida: solo nombre y precio',
  'view-assisted': 'El modo asistido guía paso a paso',
  'view-reading': 'Exporta informes en PDF con un clic',
  'arena-fc': 'Compara fichas de costo lado a lado',
  'tool-save': 'Guarda con ⌘S para no perder cambios',
  'tool-export-excel': 'Excel incluye fórmulas dinámicas',
  'tool-export-pdf': 'PDF cumple formato Res. 148/2023',
  'tool-import': 'Importa JSON de fichas existentes',

  // Multi-Tienda
  'management-hub': 'Gestiona noticias, vitrina y tiendas en un solo lugar',
  'workers': 'Configura reglas de comisión por trabajador',
  'cost-analytics': 'Arrastra campos para crear vistas dinámicas',
  'exchange-intelligence': 'Simula escenarios de devaluación cambiaria',
  'reports': 'Diseña reportes con filtros personalizados',
  'pos': 'Escáner de código de barras integrado — presiona F2',
  'sales-hub': 'Terminal, Tabla IPV, Catálogo e Historial unificados',
  'ofertas': 'Crea promociones y combos activos',
  'inventory': 'Filtra por stock bajo para reabastecer',
  'received-services': 'Distribuye costos de servicios entre recepciones',
  'inventory_adjustments': 'Documenta cada ajuste con justificación',
  'labels': 'Genera etiquetas con código de barras y QR',
  'reception_list': 'OCR automático al subir fotos de la factura',
  'purchase-orders': 'Recibe mercancía contra OC pendiente',
  'transferencias': 'Trackea envíos entre tiendas en tránsito',
  'estructura-costo': 'Visualiza componentes: base, transporte, comisiones',
  'costeo-dinamico': 'Calcula costo de reposición por absorción',
  'production-orders': 'Anticipos y cierre con entrada de producto',
  'whatsapp-hub': 'Bot de WhatsApp con IA por tienda',
  'telegram-hub': 'Bot serverless de Telegram con IA',

  // Administración
  'users': 'Asigna memberships por tienda con roles granulares',
  'roles': 'Define permisos por rol y módulo',
  'health': 'Monitorea latencia de API y conexión a BD',
  'usage-monitoring': 'Alertas al 60/80/90% del límite del plan',
  'audit': 'Filtra auditoría por usuario, fecha y acción',
  'rss_management': 'Configura feeds RSS de noticias fiscales',

  // Más Recursos
  'settings': 'Personaliza tema, idioma y accesibilidad',
  'legal': 'Términos, privacidad y RGPD',
  'help': 'Tutoriales, FAQ y contacto con soporte',
  'wiki': 'Glosario contable y normativas cubanas',
  'academy': 'Cursos de costos ABC, IPv y multi-tienda',

  // En Desarrollo
  'pick3-intelligence': 'Gestión de riesgo con métricas cuantitativas',
  'wallet': 'Monitorea ingresos por transferencias en tiempo real',

  // Calculator
  'calculator': 'M+/M-/MR/MC para memoria, desglose de billetes automático',

  // IPV
  'ipv': 'Reportes y extractos del Índice de Precios de Venta',
  'analytics': 'Dashboard institucional con tendencias',
  'transactions': 'Gestión de transacciones IPV',
};

/**
 * Obtiene el tip profesional para una vista.
 * Si la vista no tiene tip específico, devuelve un tip genérico.
 */
export function getTipForView(viewId: string | undefined | null): string {
  if (!viewId) return 'CostPro — Gestión empresarial integral';

  const tip = VIEW_TIPS[viewId];
  if (tip) return tip;

  // Fallback genérico
  return 'CostPro — Gestión empresarial integral';
}
