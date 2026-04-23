/* ═══════════════════════════════════════════════════════════════
   Demo Data — Interactive Demo "CostPro en 2 minutos"

   Hilo conductor: María, dueña de panadería en CDMX
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

/* ─── Escena 1: Ficha de Costo (Pan Francés Premium) ─── */

export const costSheetIngredients = [
  { id: 1, name: 'Harina de trigo', unit: 'kg', qty: 0.45, price: 1.20 },
  { id: 2, name: 'Levadura seca', unit: 'g', qty: 8, price: 0.06 },
  { id: 3, name: 'Azúcar blanca', unit: 'g', qty: 30, price: 0.03 },
  { id: 4, name: 'Mantequilla', unit: 'g', qty: 25, price: 0.08 },
];

export const costSheetLabor = [
  { id: 1, role: 'Panadero Maestro', hours: 176, rate: 2.50, count: 1 },
  { id: 2, role: 'Ayudante', hours: 176, rate: 1.20, count: 2 },
];

export const costSheetEvents: DemoEvent[] = [
  // Header typing
  { time: 0, action: 'fade-in', payload: { target: 'header' } },
  { time: 0.5, action: 'type', payload: { target: 'product-name', text: 'Pan Francés Premium', speed: 65 } },
  { time: 3.2, action: 'type', payload: { target: 'presentation', text: '1 kg', speed: 80 } },

  // Switch to simplified annex 1
  { time: 4.5, action: 'tab-switch', payload: { tab: 'materias-primas' } },

  // Row 1: Harina — user types, autocomplete appears
  { time: 5.5, action: 'type', payload: { target: 'input-name-0', text: 'Har', speed: 100 } },
  { time: 6.2, action: 'autocomplete', payload: { row: 0, suggestion: 'Harina de trigo' } },
  { time: 7.0, action: 'type', payload: { target: 'input-qty-0', text: '0.45', speed: 90 } },
  { time: 7.8, action: 'type', payload: { target: 'input-price-0', text: '1.20', speed: 85 } },
  { time: 8.5, action: 'count-up', payload: { target: 'total-0', value: 0.54 } },

  // Row 2: Levadura
  { time: 9.5, action: 'type', payload: { target: 'input-name-1', text: 'Lev', speed: 100 } },
  { time: 10.2, action: 'autocomplete', payload: { row: 1, suggestion: 'Levadura seca' } },
  { time: 11.0, action: 'type', payload: { target: 'input-qty-1', text: '8', speed: 80 } },
  { time: 11.6, action: 'type', payload: { target: 'input-price-1', text: '0.06', speed: 90 } },
  { time: 12.3, action: 'count-up', payload: { target: 'total-1', value: 0.48 } },

  // Row 3: Azúcar
  { time: 13.2, action: 'type', payload: { target: 'input-name-2', text: 'Azúc', speed: 100 } },
  { time: 13.9, action: 'autocomplete', payload: { row: 2, suggestion: 'Azúcar blanca' } },
  { time: 14.6, action: 'type', payload: { target: 'input-qty-2', text: '30', speed: 75 } },
  { time: 15.1, action: 'type', payload: { target: 'input-price-2', text: '0.03', speed: 85 } },
  { time: 15.8, action: 'count-up', payload: { target: 'total-2', value: 0.90 } },

  // Row 4: Mantequilla + micro-validation
  { time: 16.5, action: 'type', payload: { target: 'input-name-3', text: 'Mant', speed: 95 } },
  { time: 17.2, action: 'autocomplete', payload: { row: 3, suggestion: 'Mantequilla' } },
  { time: 17.9, action: 'type', payload: { target: 'input-qty-3', text: '25', speed: 70 } },
  { time: 18.3, action: 'type', payload: { target: 'input-price-3', text: '0.08', speed: 80 } },
  { time: 19.0, action: 'count-up', payload: { target: 'total-3', value: 2.00 } },
  { time: 19.8, action: 'micro-validate', payload: { type: 'good', text: 'Buen margen en materias primas', row: 3 } },

  // Subtotal Materias Primas
  { time: 21, action: 'count-up', payload: { target: 'subtotal-mp', value: 3.92 } },
  { time: 22, action: 'micro-validate', payload: { type: 'tip', text: 'Costo unitario por kg: $3.92' } },

  // Transition to Mano de Obra (simplified)
  { time: 23, action: 'tab-switch', payload: { tab: 'mano-de-obra' } },

  // Labor rows (pre-filled quickly — user sees result)
  { time: 24, action: 'fade-in', payload: { target: 'labor-row-0' } },
  { time: 25, action: 'fade-in', payload: { target: 'labor-row-1' } },
  { time: 26, action: 'count-up', payload: { target: 'subtotal-labor', value: 862.40 } },
  { time: 27, action: 'micro-validate', payload: { type: 'info', text: 'Distribuido en 1,000 unidades → $0.86/pan' } },

  // Ficha completa — resumen
  { time: 28.5, action: 'fade-in', payload: { target: 'summary-card' } },
  { time: 29, action: 'count-up', payload: { target: 'costo-unitario', value: 4.78 } },
  { time: 30, action: 'count-up', payload: { target: 'precio-venta', value: 12.00 } },
  { time: 31, action: 'micro-validate', payload: { type: 'good', text: 'Margen del 60% — saludable' } },

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
  { name: 'Restaurante El Sabor', amount: 21480, share: 45, risk: 'high' },
  { name: 'Café La Habana', amount: 6120, share: 13, risk: 'low' },
  { name: 'Hotel Caribe', amount: 5890, share: 12, risk: 'low' },
  { name: 'Panadería Dulce', amount: 4350, share: 9, risk: 'low' },
  { name: 'SuperMarket Max', amount: 3780, share: 8, risk: 'low' },
];

export const ipvRecentTransactions = [
  { client: 'Restaurante El Sabor', date: '15 Abr', amount: 1240, status: 'conciliada' as const },
  { client: 'Restaurante El Sabor', date: '12 Abr', amount: 980, status: 'conciliada' as const },
  { client: 'Restaurante El Sabor', date: '08 Abr', amount: 2100, status: 'parcial' as const },
  { client: 'Café La Habana', date: '10 Abr', amount: 1560, status: 'conciliada' as const },
  { client: 'Hotel Caribe', date: '09 Abr', amount: 890, status: 'conciliada' as const },
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
    name: 'Sucursal Centro',
    ventasHoy: 1240,
    ventasAyer: 1180,
    tickets: 87,
    ticketProm: 14.25,
    trend: 5,
    status: 'healthy' as const,
  },
  {
    name: 'Sucursal Norte',
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
    title: 'Sucursal Norte',
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
  { time: 12.5, action: 'micro-validate', payload: { type: 'info', text: 'Panadería principal: stock bajo en Croissant — podrían perder ventas' } },

  // Action: restock alert
  { time: 13.5, action: 'click', payload: { target: 'btn-restock' } },
  { time: 14, action: 'fade-in', payload: { target: 'toast-restock' } },
  { time: 14.5, action: 'micro-validate', payload: { type: 'good', text: 'Alerta de reposición enviada a Sucursal Norte' } },

  // Comparative overview
  { time: 16, action: 'transition', payload: { target: 'compare-view' } },
  { time: 16.5, action: 'fade-in', payload: { target: 'compare-chart' } },
  { time: 17, action: 'count-up', payload: { target: 'total-consolidado', value: 2130, prefix: '$' } },
  { time: 18, action: 'micro-validate', payload: { type: 'good', text: '$2,130 consolidado entre ambas sucursales' } },

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
    subtitle: 'María crea su primera ficha en minutos',
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
    subtitle: 'Controla tus sucursales en tiempo real',
    duration: 22,
    events: multiStoreEvents,
    icon: 'Store',
  },
];

export const totalDemoDuration = scenes.reduce((sum, s) => sum + s.duration, 0);
