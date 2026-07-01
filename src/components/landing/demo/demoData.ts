/* ═══════════════════════════════════════════════════════════════
   Demo Data — Interactive Demo "CostPro en 2 minutos"

   Hilo conductor: María, dueña de panadería en Cuba
   Escena 1 → Crea ficha de costo
   Escena 2 → Analiza sus ingresos (IPV insight engine)
   Escena 3 → Controla sus 2 sucursales (multi-tienda ejecutivo)
   ═══════════════════════════════════════════════════════════════ */

export type DemoAction =
  | 'type'
  | 'highlight'
  | 'fade-in'
  | 'fade-out'
  | 'count-up'
  | 'alert'
  | 'click'
  | 'transition'
  | 'autocomplete'
  | 'micro-validate'
  | 'tab-switch';

export interface DemoEvent {
  time: number;       // seconds from scene start
  action: DemoAction;
  payload: Record<string, unknown>;
}

/* ─── Escena 1: Ficha de Costo (Cerveza Importada) ─── */

export const costSheetIngredients = [
  { id: 1, name: 'Cerveza importada', unit: 'caja', qty: 1, price: 2400 },
  { id: 2, name: 'Flete y transporte', unit: 'viaje', qty: 1, price: 180 },
  { id: 3, name: 'Salario almacenista', unit: 'mes', qty: 1, price: 94 },
  { id: 4, name: 'Arrendamiento prorrateado', unit: 'mes', qty: 1, price: 42 },
];

export const costSheetLabor = [
  { id: 1, role: 'Vendedor', hours: 176, rate: 25.00, count: 1 },
];

export const costSheetEvents: DemoEvent[] = [
  // Header typing
  { time: 0, action: 'fade-in', payload: { target: 'header' } },
  { time: 0.5, action: 'type', payload: { target: 'product-name', text: 'Cerveza Importada (caja x 24 und.)', speed: 65 } },
  { time: 3.2, action: 'type', payload: { target: 'presentation', text: '1 caja', speed: 70 } },

  // Switch to simplified annex 1
  { time: 4.5, action: 'tab-switch', payload: { tab: 'insumos' } },

  // Row 1: Cerveza importada — user types, autocomplete appears
  { time: 5.5, action: 'type', payload: { target: 'input-name-0', text: 'Cer', speed: 100 } },
  { time: 6.2, action: 'autocomplete', payload: { row: 0, suggestion: 'Cerveza importada' } },
  { time: 7.0, action: 'type', payload: { target: 'input-qty-0', text: '1', speed: 90 } },
  { time: 7.8, action: 'type', payload: { target: 'input-price-0', text: '2400', speed: 85 } },
  { time: 8.5, action: 'count-up', payload: { target: 'total-0', value: 2400 } },

  // Row 2: Flete y transporte
  { time: 9.5, action: 'type', payload: { target: 'input-name-1', text: 'Flet', speed: 100 } },
  { time: 10.2, action: 'autocomplete', payload: { row: 1, suggestion: 'Flete y transporte' } },
  { time: 11.0, action: 'type', payload: { target: 'input-qty-1', text: '1', speed: 80 } },
  { time: 11.6, action: 'type', payload: { target: 'input-price-1', text: '180', speed: 90 } },
  { time: 12.3, action: 'count-up', payload: { target: 'total-1', value: 180 } },

  // Row 3: Salario almacenista
  { time: 13.2, action: 'type', payload: { target: 'input-name-2', text: 'Salar', speed: 100 } },
  { time: 13.9, action: 'autocomplete', payload: { row: 2, suggestion: 'Salario almacenista' } },
  { time: 14.6, action: 'type', payload: { target: 'input-qty-2', text: '1', speed: 75 } },
  { time: 15.1, action: 'type', payload: { target: 'input-price-2', text: '94', speed: 85 } },
  { time: 15.8, action: 'count-up', payload: { target: 'total-2', value: 94 } },

  // Row 4: Arrendamiento prorrateado
  { time: 16.5, action: 'type', payload: { target: 'input-name-3', text: 'Arren', speed: 95 } },
  { time: 17.2, action: 'autocomplete', payload: { row: 3, suggestion: 'Arrendamiento prorrateado' } },
  { time: 17.9, action: 'type', payload: { target: 'input-qty-3', text: '1', speed: 70 } },
  { time: 18.3, action: 'type', payload: { target: 'input-price-3', text: '42', speed: 80 } },
  { time: 19.0, action: 'count-up', payload: { target: 'total-3', value: 42 } },
  { time: 19.8, action: 'micro-validate', payload: { type: 'good', text: 'Insumos registrados correctamente', row: 3 } },

  // Subtotal Insumos
  { time: 21, action: 'count-up', payload: { target: 'subtotal-mp', value: 2716 } },
  { time: 22, action: 'micro-validate', payload: { type: 'tip', text: 'Costo por caja: $2,716' } },

  // Transition to Gastos Generales (simplified)
  { time: 23, action: 'tab-switch', payload: { tab: 'gastos-generales' } },

  // Labor row (pre-filled quickly — user sees result)
  { time: 24, action: 'fade-in', payload: { target: 'labor-row-0' } },
  { time: 26, action: 'count-up', payload: { target: 'subtotal-labor', value: 4400 } },
  { time: 27, action: 'micro-validate', payload: { type: 'info', text: 'Incluye Seg. Social (14%) + Imp. Trabajo (5%)' } },

  // Ficha completa — resumen
  { time: 28.5, action: 'fade-in', payload: { target: 'summary-card' } },
  { time: 29, action: 'count-up', payload: { target: 'costo-unitario', value: 7116 } },
  { time: 30, action: 'count-up', payload: { target: 'precio-venta', value: 8500 } },
  { time: 31, action: 'micro-validate', payload: { type: 'good', text: 'Precio según Res. 148/2023 — listo para usar' } },

  // End scene
  { time: 33, action: 'fade-in', payload: { target: 'success-badge' } },
  { time: 35, action: 'fade-out', payload: { target: 'scene' } },
];

/* ─── Escena 2: IPV Insight Engine ─── */

export const ipvKpis = {
  ingresos: 47820,
  egresos: 12340,
  transacciones: 234,
  conciliadas: 89,
};

export const ipvTopClients = [
  { name: 'Cadenal de Hoteles Varadero', amount: 21480, share: 45, risk: 'high' },
  { name: 'Restaurante La Terraza', amount: 6120, share: 13, risk: 'low' },
  { name: 'Hotel Playa Azul', amount: 5890, share: 12, risk: 'low' },
  { name: 'Cafetería Habana Vieja', amount: 4350, share: 9, risk: 'low' },
  { name: 'Tienda de Artesanías', amount: 3780, share: 8, risk: 'low' },
];

export const ipvRecentTransactions = [
  { client: 'Cadenal de Hoteles Varadero', date: '15 May', amount: 1240, status: 'conciliada' as const },
  { client: 'Cadenal de Hoteles Varadero', date: '12 May', amount: 980, status: 'conciliada' as const },
  { client: 'Cadenal de Hoteles Varadero', date: '08 May', amount: 2100, status: 'parcial' as const },
  { client: 'Restaurante La Terraza', date: '10 May', amount: 1560, status: 'conciliada' as const },
  { client: 'Hotel Playa Azul', date: '09 May', amount: 890, status: 'conciliada' as const },
];

export const ipvEvents: DemoEvent[] = [
  // Dashboard fade in
  { time: 0, action: 'fade-in', payload: { target: 'dashboard' } },

  // Risk alert — the hero moment
  { time: 1.5, action: 'alert', payload: {
    target: 'risk-alert',
    severity: 'high',
    title: 'Riesgo detectado',
    text: 'El 45% de tus ingresos depende de un solo cliente',
  } },

  // Highlight the dangerous client
  { time: 4, action: 'highlight', payload: { target: 'client-0', type: 'risk' } },
  { time: 5, action: 'count-up', payload: { target: 'client-share', value: 45, suffix: '%' } },
  { time: 6, action: 'micro-validate', payload: { type: 'warning', text: 'Si este cliente se va, pierdes casi la mitad de tu facturación' } },

  // Show action buttons
  { time: 7.5, action: 'fade-in', payload: { target: 'action-buttons' } },

  // Click "Reducir riesgo"
  { time: 8.5, action: 'click', payload: { target: 'btn-reduce-risk' } },
  { time: 9, action: 'fade-in', payload: { target: 'diversify-panel' } },
  { time: 10, action: 'micro-validate', payload: { type: 'tip', text: 'Meta: ningún cliente > 25% de ingresos' } },

  // Quick view of client transactions
  { time: 11.5, action: 'click', payload: { target: 'client-0' } },
  { time: 12, action: 'fade-in', payload: { target: 'transactions-panel' } },

  // Transactions appear one by one
  { time: 12.5, action: 'fade-in', payload: { target: 'txn-0' } },
  { time: 13.2, action: 'fade-in', payload: { target: 'txn-1' } },
  { time: 13.9, action: 'fade-in', payload: { target: 'txn-2' } },
  { time: 14.5, action: 'micro-validate', payload: { type: 'warning', text: 'Cargo parcial — $210 pendientes por cuadrar' } },
  { time: 15.2, action: 'fade-in', payload: { target: 'txn-3' } },
  { time: 15.8, action: 'fade-in', payload: { target: 'txn-4' } },

  // Action: "Enviar recordatorio"
  { time: 16.5, action: 'click', payload: { target: 'btn-reminder' } },
  { time: 17, action: 'fade-in', payload: { target: 'toast-success' } },
  { time: 17.5, action: 'micro-validate', payload: { type: 'good', text: 'Recordatorio enviado por WhatsApp' } },

  // Overview: healthy clients
  { time: 19, action: 'transition', payload: { target: 'healthy-overview' } },
  { time: 19.5, action: 'fade-in', payload: { target: 'client-1' } },
  { time: 20, action: 'fade-in', payload: { target: 'client-2' } },
  { time: 20.5, action: 'fade-in', payload: { target: 'client-3' } },
  { time: 21, action: 'fade-in', payload: { target: 'client-4' } },
  { time: 22, action: 'micro-validate', payload: { type: 'good', text: '4 clientes adicionales con riesgo bajo' } },

  // End
  { time: 24, action: 'fade-in', payload: { target: 'insight-summary' } },
  { time: 26, action: 'fade-out', payload: { target: 'scene' } },
];

/* ─── Escena 3: Multi-Tienda Ejecutivo ─── */

export const storeKpis = [
  {
    name: 'Tienda Centro Habana',
    ventasHoy: 1240,
    ventasAyer: 1180,
    tickets: 87,
    ticketProm: 14.25,
    trend: 5,
    status: 'healthy' as const,
  },
  {
    name: 'Tienda Varadero',
    ventasHoy: 890,
    ventasAyer: 1270,
    tickets: 52,
    ticketProm: 17.12,
    trend: -30,
    status: 'alert' as const,
  },
];

export const multiStoreEvents: DemoEvent[] = [
  // Store selector
  { time: 0, action: 'fade-in', payload: { target: 'store-selector' } },
  { time: 1, action: 'fade-in', payload: { target: 'store-0' } },
  { time: 1.5, action: 'count-up', payload: { target: 'ventas-centro', value: 1240, prefix: '$' } },
  { time: 2.2, action: 'count-up', payload: { target: 'tickets-centro', value: 87 } },

  // Second store appears — with alert
  { time: 3, action: 'fade-in', payload: { target: 'store-1' } },
  { time: 3.5, action: 'count-up', payload: { target: 'ventas-norte', value: 890, prefix: '$' } },
  { time: 4.2, action: 'count-up', payload: { target: 'tickets-norte', value: 52 } },

  // Alert: comparative drop
  { time: 5, action: 'alert', payload: {
    target: 'store-alert',
    severity: 'medium',
    title: 'Tienda Varadero',
    text: 'Vendiendo 30% menos que ayer a esta hora',
  } },

  { time: 7.5, action: 'micro-validate', payload: { type: 'warning', text: 'Ayer a esta hora llevabas $1,270 — hoy solo $890' } },

  // Click to see details
  { time: 9, action: 'click', payload: { target: 'store-1' } },
  { time: 9.5, action: 'fade-in', payload: { target: 'store-detail' } },

  // Breakdown
  { time: 10.5, action: 'fade-in', payload: { target: 'detail-row-0' } },
  { time: 11.2, action: 'fade-in', payload: { target: 'detail-row-1' } },
  { time: 11.9, action: 'fade-in', payload: { target: 'detail-row-2' } },
  { time: 12.5, action: 'micro-validate', payload: { type: 'info', text: 'Tienda Varadero: stock bajo en Ron Havana Club — podrían perder ventas' } },

  // Action: restock alert
  { time: 13.5, action: 'click', payload: { target: 'btn-restock' } },
  { time: 14, action: 'fade-in', payload: { target: 'toast-restock' } },
  { time: 14.5, action: 'micro-validate', payload: { type: 'good', text: 'Alerta de reposición enviada a Tienda Varadero' } },

  // Comparative overview
  { time: 16, action: 'transition', payload: { target: 'compare-view' } },
  { time: 16.5, action: 'fade-in', payload: { target: 'compare-chart' } },
  { time: 17, action: 'count-up', payload: { target: 'total-consolidado', value: 2130, prefix: '$' } },
  { time: 18, action: 'micro-validate', payload: { type: 'good', text: '$2,130 consolidado entre ambas tiendas' } },

  // End
  { time: 19.5, action: 'fade-in', payload: { target: 'store-summary' } },
  { time: 21, action: 'fade-out', payload: { target: 'scene' } },
];

/* ─── Scene config ─── */

export interface SceneConfig {
  id: string;
  title: string;
  subtitle: string;
  duration: number;          // total seconds
  events: DemoEvent[];
  icon: string;
}

export const scenes: SceneConfig[] = [
  {
    id: 'cost-sheet',
    title: 'Ficha de Costo',
    subtitle: 'Liannis crea su primera ficha en minutos',
    duration: 36,
    events: costSheetEvents,
    icon: 'FileText',
  },
  {
    id: 'ipv',
    title: 'IPV Inteligente',
    subtitle: 'El sistema detecta riesgos automáticamente',
    duration: 27,
    events: ipvEvents,
    icon: 'Brain',
  },
  {
    id: 'multi-store',
    title: 'Multi-Tienda',
    subtitle: 'Monitorea tus tiendas en tiempo real',
    duration: 22,
    events: multiStoreEvents,
    icon: 'Store',
  },
];

export const totalDemoDuration = scenes.reduce((sum, s) => sum + s.duration, 0);
