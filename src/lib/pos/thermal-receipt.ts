/**
 * MISIÓN IMPRESIÓN TÉRMICA (2026-10-20) — Comprobante POS para rollo térmico.
 *
 * Librería PURA (sin React, sin DOM) que centraliza:
 *  1. El tipo normalizado ThermalReceiptData — única forma de datos que consume
 *     el renderizador del comprobante (POSThermalReceipt.tsx). Dos fuentes la
 *     alimentan: la venta recién confirmada (LastSale enriquecido en Vender) y
 *     la reimpresión desde el historial (Transaction + items + resolveSalePayments).
 *  2. La configuración de ancho del rollo (55 mm / 58 mm / 80 mm / personalizado),
 *     persistida en localStorage. NOTA HONESTA: el equipo AXISOFT de destino NO
 *     tiene ficha técnica pública verificable — el ancho NO se fija como si
 *     estuviera verificado; se configura en la UI y debe confirmarse en el
 *     dispositivo físico (impresión de prueba).
 *  3. La generación del CSS de impresión (@page size …mm auto + márgenes +
 *     ocultación de toda la interfaz salvo el comprobante).
 *  4. La agregación de medios de pago a partir de las filas EXISTENTES del
 *     carrito (payments[] + campos legacy) — SIN recalcular importes: solo suma
 *     de lo ya cobrado (misma fuente que viaja al RPC create_sale_v2).
 *
 * Restricciones de la misión respetadas aquí:
 *  - Ningún segundo cálculo de importes/descuentos/impuestos: los totales del
 *    comprobante provienen de las MISMAS funciones del store (getSubtotalCup,
 *    getDiscountAmount, getTaxAmount, getTotal) o del registro persistido
 *    (transactions.*), nunca de una aritmética nueva.
 *  - La impresión jamás muta la venta: todo es lectura.
 */

// ── 1. Tipos normalizados del comprobante ─────────────────────────────────

/** Línea de artículo del comprobante (moneda de la línea = moneda del ítem). */
export interface ThermalReceiptItem {
  /** SKU/código del producto (si existe; null = no se imprime). */
  code: string | null;
  /** Descripción (nombre del producto + variante si aplica). */
  name: string;
  quantity: number;
  /** Precio unitario efectivamente cobrado (moneda del ítem). */
  unitPrice: number;
  /** Moneda de la línea ('CUP' | 'USD' | …). */
  currency: string;
  /** Importe de la línea (quantity × unitPrice, moneda del ítem). */
  lineTotal: number;
}

/** Medio de pago con importe en su moneda original (agregado de filas reales). */
export interface ThermalReceiptPayment {
  method: string;
  amount: number;
  currency: string;
}

/** Datos completos del comprobante térmico. */
export interface ThermalReceiptData {
  /** ID de la transacción (UUID persistido). */
  saleId: string;
  /** Número de factura persistido (solo reimpresión; POS en vivo suele ser null). */
  invoiceNumber?: string | null;
  /** Fecha/hora ISO de la operación (emisión o del documento original). */
  dateIso: string;
  /** Nombre comercial de la tienda (buscado en /api/stores; null = se omite). */
  storeName?: string | null;
  /** Vendedor (nombre del usuario autenticado; null = se omite). */
  sellerName?: string | null;
  customerName?: string | null;
  items: ThermalReceiptItem[];
  /** Subtotal en CUP (fuente: getSubtotalCup() / transactions.subtotal). */
  subtotal: number;
  /** Descuento en CUP (fuente: getDiscountAmount() / transactions.discount_value). */
  discountAmount: number;
  /** Etiqueta del descuento (p. ej. "10 %" / "fijo"), solo para detalle. */
  discountLabel?: string | null;
  /** Impuesto en CUP (fuente: getTaxAmount() / transactions.tax_amount). */
  taxAmount: number;
  /** Total en CUP (fuente: getTotal() / transactions.total_amount). */
  total: number;
  payments: ThermalReceiptPayment[];
  /** Método declarado de la venta (cash/transfer/zelle/mixed…; informativo). */
  paymentMethod?: string | null;
  /** Cambo/vuelto (solo informativo, capturado del panel de cobro; null = no aplica). */
  change?: number | null;
  /** Efectivo recibido según el panel de cobro (informativo; null = no aplica). */
  cashReceived?: number | null;
  /** 'completed' | 'voided' | … — marca visual en reimpresión. */
  status?: string | null;
  /** true cuando se imprime desde el historial (no en la emisión original). */
  isReprint?: boolean;
}

// ── 2. Configuración de ancho del rollo ────────────────────────────────────

/**
 * Presets del ancho NOMINAL del rollo. 55 mm (≈48-51 mm imprimibles tras
 * márgenes y cabezal) es el rollo del terminal de la misión; 58 mm es el más
 * común en terminales todo-en-uno compactas; 80 mm (≈72 mm imprimibles) es el
 * estándar de mostrador. El ancho exacto del cabezal NO es verificable desde
 * aquí — el usuario lo confirma/configura en la UI (éxito de venta o historial).
 */
export const THERMAL_WIDTH_PRESETS = [55, 58, 80] as const;

export const DEFAULT_THERMAL_WIDTH_MM = 55;

/** Ancho mínimo/máximo razonable para no romper el diseño (según presets ± margen). */
export const THERMAL_WIDTH_MIN_MM = 40;
export const THERMAL_WIDTH_MAX_MM = 120;

const THERMAL_WIDTH_LS_KEY = 'costpro_thermal_receipt_width_mm';

/** Sanitiza un ancho candidato → devuelve el preset válido o null. */
export function sanitizeThermalWidthMm(raw: number | null | undefined): number | null {
  const mm = Number(raw);
  if (!Number.isFinite(mm)) return null;
  if (mm < THERMAL_WIDTH_MIN_MM || mm > THERMAL_WIDTH_MAX_MM) return null;
  return Math.round(mm * 10) / 10;
}

/** Lee el ancho configurado (localStorage) con fallback honrado a 55 mm. */
export function getThermalWidthMm(): number {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return DEFAULT_THERMAL_WIDTH_MM;
  }
  try {
    const raw = window.localStorage.getItem(THERMAL_WIDTH_LS_KEY);
    if (raw === null) return DEFAULT_THERMAL_WIDTH_MM;
    const parsed = sanitizeThermalWidthMm(parseFloat(raw));
    return parsed ?? DEFAULT_THERMAL_WIDTH_MM;
  } catch {
    return DEFAULT_THERMAL_WIDTH_MM;
  }
}

/** Persiste el ancho (sanitizado). Devuelve el valor efectivamente guardado. */
export function setThermalWidthMm(mm: number): number {
  const safe = sanitizeThermalWidthMm(mm) ?? DEFAULT_THERMAL_WIDTH_MM;
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    try {
      window.localStorage.setItem(THERMAL_WIDTH_LS_KEY, String(safe));
    } catch {
      // localStorage bloqueado (modo privado): la selección vive solo en memoria
      // de la sesión — se acepta silenciosamente, la impresión sigue funcionando.
    }
  }
  return safe;
}

// ── 3. CSS de impresión dedicado ───────────────────────────────────────────

/**
 * Margen de impresión por defecto (mm). Reducido y fijo por rollo térmico;
 * configurable vía parámetro para ajustes finos en el dispositivo real.
 */
export const DEFAULT_THERMAL_MARGIN_MM = 2;

/**
 * Genera el CSS de impresión del comprobante.
 *
 * Estrategia (reescrita 2026-10-23 tras el diagnóstico del comprobante en
 * blanco — ver pos-thermal-print-flow.test.tsx y la evidencia del repro):
 *  - `@page { size: Wmm auto; margin: Mmm }` AL NIVEL SUPERIOR: el pipeline de
 *    impresión de Chromium IGNORA `size` si se declara `auto` de altura en el
 *    pipeline headless (verificado con micro-test A/B/C), y el diálogo real lo
 *    respeta mejor sin anidar. La altura `auto` deja que el comprobante fluya.
 *  - `color-scheme: light` + fondo blanco EXPLÍCITO en html/body con
 *    especificidad suficiente (html.dark / html[data-theme='dark']): la app es
 *    dark por defecto y `color-scheme: dark` pintaba el CANVAS de impresión
 *    completamente negro (100% de píxeles < 26/255 en el repro) — esta era una
 *    de las causas del comprobante "en blanco".
 *  - `body > *:not([data-thermal-print-overlay]) { display: none }`: oculta
 *    menús, carrito, botones, toasts y navegación SIN conservar su altura (a
 *    diferencia de `visibility: hidden`, que mantenía el layout de la app y
 *    producía 3 páginas vacías/negras extra) y sin depender de clases Tailwind.
 *  - El overlay contenedor se NEUTRALIZA a `position: static`: en pantalla vive
 *    en `position: fixed; left: -10000px` para no verse, y el CSS anterior solo
 *    reubicaba el div INTERIOR (#thermal-receipt-root → position:absolute), cuyo
 *    bloque contenedor seguía siendo el overlay fijo → el recibo se renderizaba
 *    a -10000px, fuera de la página. Causa raíz #1 del comprobante en blanco.
 *  - Sin fondos oscuros ni decoración: blanco y negro puro para papel térmico.
 */
export function buildThermalPrintCss(
  widthMm: number = getThermalWidthMm(),
  marginMm: number = DEFAULT_THERMAL_MARGIN_MM,
): string {
  const w = sanitizeThermalWidthMm(widthMm) ?? DEFAULT_THERMAL_WIDTH_MM;
  const m = Math.max(0, Math.min(10, Number(marginMm) || 0));
  return [
    // Nivel superior (no anidado): máxima compatibilidad con el diálogo real.
    `@page { size: ${w}mm auto; margin: ${m}mm; }`,
    '@media print {',
    '  /* Canvas de impresión claro: la app es dark por defecto y sin esto el',
    '     lienzo entero se imprime negro (color-scheme:dark en .dark). La',
    '     especificidad html.dark/html[data-theme=dark] gana a .dark { … !important } */',
    '  html, html.dark, html[data-theme="dark"] {',
    '    color-scheme: light !important;',
    '    background: #ffffff !important;',
    '  }',
    '  body {',
    '    background: #ffffff !important;',
    '    color: #000000 !important;',
    '    margin: 0 !important;',
    '    padding: 0 !important;',
    '    width: auto !important;',
    '    height: auto !important;',
    '    overflow: visible !important;',
    '  }',
    '  /* Toda la interfaz oculta SIN conservar altura (display:none): ni menús',
    '     en el papel ni páginas vacías extra. El único hijo visible de body es',
    '     el contenedor del comprobante. */',
    '  body > *:not([data-thermal-print-overlay]) { display: none !important; }',
    '  /* Neutralizar el posicionamiento fuera de pantalla del contenedor: en',
    '     pantalla vive en fixed/-10000px; para imprimir debe volver al flujo. */',
    '  [data-thermal-print-overlay] {',
    '    position: static !important;',
    '    display: block !important;',
    '    visibility: visible !important;',
    '    left: auto !important;',
    '    top: auto !important;',
    '    width: auto !important;',
    '    max-width: none !important;',
    '    z-index: auto !important;',
    '    background: #ffffff !important;',
    '  }',
    '  #thermal-receipt-root {',
    '    position: static !important;',
    '    left: auto !important;',
    '    top: auto !important;',
    '    width: 100% !important;',
    '    max-width: 100% !important;',
    '    margin: 0 !important;',
    '    padding: 0 !important;',
    '    background: #ffffff !important;',
    '    color: #000000 !important;',
    '    box-shadow: none !important;',
    '    border: none !important;',
    '  }',
    '}',
  ].join('\n');
}

// ── 4. Etiquetas de medios de pago (convención de la app) ─────────────────

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'EFECTIVO',
  transfer: 'TRANSFERENCIA',
  zelle: 'ZELLE (USD)',
  card: 'TARJETA',
  wallet: 'BILLETERA',
  mixed: 'MIXTO',
  other: 'OTRO',
};

export function paymentMethodLabel(method: string | null | undefined): string {
  return PAYMENT_LABELS[(method || '').toLowerCase()] || 'OTRO';
}

// ── 5. Agregación de pagos (suma de filas reales, sin recálculo) ──────────

/**
 * Ítem estructural compatible con CartItem del store (payments[] + legacy),
 * declarado AQUÍ para mantener la lib pura sin importar el store.
 */
export interface PaymentSourceItem {
  payments?: { method: string; amount: number; currency: string }[] | null;
  cash_paid?: number | null;
  cash_currency?: string | null;
  transfer_paid?: number | null;
  transfer_currency?: string | null;
  zelle_paid?: number | null;
  zelle_currency?: string | null;
}

/**
 * Agrega los medios de pago del carrito en filas {method, amount, currency}.
 * Prioriza payments[] (fuente actual); si el ítem no tiene filas, usa los
 * campos legacy sincronizados del store. Suma IMPORTES YA COBRADOS en su
 * moneda original — misma información que viaja al RPC. Orden estable:
 * efectivo → transferencia → zelle → otros.
 */
export function aggregateItemPayments(items: PaymentSourceItem[]): ThermalReceiptPayment[] {
  const order = ['cash', 'transfer', 'zelle'];
  const acc = new Map<string, ThermalReceiptPayment>();
  const add = (method: string, amount: number, currency: string) => {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const norm = (method || 'other').toLowerCase();
    const cur = (currency || 'CUP').toUpperCase();
    const key = `${norm}:${cur}`;
    const prev = acc.get(key);
    if (prev) prev.amount = Math.round((prev.amount + amount) * 100) / 100;
    else acc.set(key, { method: norm, amount: Math.round(amount * 100) / 100, currency: cur });
  };
  for (const i of items) {
    if (i.payments && i.payments.length > 0) {
      for (const p of i.payments) add(p.method, p.amount, p.currency);
    } else {
      add('cash', i.cash_paid || 0, i.cash_currency || 'CUP');
      add('transfer', i.transfer_paid || 0, i.transfer_currency || 'CUP');
      add('zelle', i.zelle_paid || 0, i.zelle_currency || 'USD');
    }
  }
  return Array.from(acc.values()).sort((a, b) => {
    const ia = order.indexOf(a.method);
    const ib = order.indexOf(b.method);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.currency.localeCompare(b.currency);
  });
}

// ── 6. Constructores de ThermalReceiptData ─────────────────────────────────

/**
 * Forma estructural del LastSale enriquecido (satisfecha por POSCart.types).
 * Declarada localmente para no acoplar la lib con la carpeta de componentes.
 */
export interface LastSaleSource {
  id: string;
  date: string;
  items: {
    product: { name: string; sku?: string | null };
    variantName?: string | null;
    quantity: number;
    price: number;
    subtotal: number;
    currency?: string;
  }[];
  subtotalCup?: number;
  subtotal: number;
  discountAmount?: number;
  discount?: { type: 'fixed' | 'percentage'; value: number } | null;
  taxAmount?: number;
  total: number;
  paymentMethod: string;
  payments?: ThermalReceiptPayment[] | null;
  change?: number | null;
  cashReceived?: number | null;
  customerName?: string;
}

/**
 * Construye el comprobante desde la venta recién confirmada (Vender).
 * Los importes provienen de las funciones del store pasadas por el checkout —
 * aquí SOLO se mapean (cero aritmética nueva).
 */
export function buildReceiptDataFromLastSale(
  lastSale: LastSaleSource,
  opts?: { storeName?: string | null; sellerName?: string | null },
): ThermalReceiptData {
  const discount = lastSale.discount;
  const discountLabel = discount && discount.value > 0
    ? (discount.type === 'percentage' ? `${discount.value} %` : 'fijo')
    : null;
  return {
    saleId: lastSale.id,
    invoiceNumber: null,
    dateIso: lastSale.date,
    storeName: opts?.storeName ?? null,
    sellerName: opts?.sellerName ?? null,
    customerName: lastSale.customerName ?? null,
    items: lastSale.items.map((i) => ({
      code: i.product.sku ?? null,
      name: i.variantName ? `${i.product.name} (${i.variantName})` : i.product.name,
      quantity: i.quantity,
      unitPrice: i.price,
      currency: (i.currency || 'CUP').toUpperCase(),
      lineTotal: i.subtotal,
    })),
    subtotal: lastSale.subtotalCup ?? lastSale.subtotal,
    discountAmount: lastSale.discountAmount ?? 0,
    discountLabel,
    taxAmount: lastSale.taxAmount ?? 0,
    total: lastSale.total,
    payments: lastSale.payments ?? [],
    paymentMethod: lastSale.paymentMethod ?? null,
    change: lastSale.change ?? null,
    cashReceived: lastSale.cashReceived ?? null,
    status: 'completed',
    isReprint: false,
  };
}

/**
 * Fuente para la reimpresión desde el historial (todo lectura — el comprobante
 * se reconstruye del registro persistido, sin tocar la venta).
 */
export interface TransactionSource {
  id: string;
  invoice_number?: string | null;
  created_at: string;
  subtotal?: number | string | null;
  discount_value?: number | string | null;
  tax_amount?: number | string | null;
  total_amount?: number | string | null;
  payment_method?: string | null;
  status?: string | null;
  customer_name?: string | null;
}

export interface TransactionItemSource {
  quantity: number | string;
  price_at_sale: number | string;
  price_at_sale_cup?: number | string | null;
  /** Tasa de la línea (null/0 en filas históricas V1 → se asume 1, CUP). */
  exchange_rate?: number | string | null;
  price_currency?: string | null;
  products?: { name: string; sku?: string | null } | null;
}

/** Desglose autoritativo de pagos (resolveSalePayments de la app). */
export interface SalePaymentsSource {
  cashPaid: number;
  transferPaid: number;
  zellePaidUSD: number | null;
  /** Equivalente CUP del componente Zelle (respaldo si la tasa no se persistió). */
  zellePaidCUP?: number | null;
}

/**
 * Construye el comprobante para REIMPRESIÓN desde el historial.
 * price_at_sale SIEMPRE está en CUP (diseño de BD — ver TransactionDetailsModal);
 * los pagos usan el desglose autoritativo (payment_transactions vía
 * resolveSalePayments): efectivo/transferencia en CUP y Zelle en USD original
 * cuando la tasa es conocida.
 */
export function buildReceiptDataFromTransaction(
  transaction: TransactionSource,
  items: TransactionItemSource[],
  payments: SalePaymentsSource,
  opts?: { storeName?: string | null },
): ThermalReceiptData {
  const receiptPayments: ThermalReceiptPayment[] = [];
  if (payments.cashPaid > 0) receiptPayments.push({ method: 'cash', amount: payments.cashPaid, currency: 'CUP' });
  if (payments.transferPaid > 0) receiptPayments.push({ method: 'transfer', amount: payments.transferPaid, currency: 'CUP' });
  if (payments.zellePaidUSD !== null && payments.zellePaidUSD > 0) {
    receiptPayments.push({ method: 'zelle', amount: payments.zellePaidUSD, currency: 'USD' });
  } else if ((payments.zellePaidCUP ?? 0) > 0) {
    // Tasa no persistida (venta histórica): se imprime el equivalente CUP
    // etiquetado como tal — nunca se inventa un importe USD sin tasa real.
    receiptPayments.push({ method: 'zelle', amount: payments.zellePaidCUP as number, currency: 'CUP' });
  }
  return {
    saleId: transaction.id,
    invoiceNumber: transaction.invoice_number ?? null,
    dateIso: transaction.created_at,
    storeName: opts?.storeName ?? null,
    sellerName: null,
    customerName: transaction.customer_name ?? null,
    items: items.map((i) => {
      // CP-CORRECCIONES-VENTAS-ALMACÉN-001: misma regla canónica del sistema
      // (lineTotalCup, cash-report/summary.ts) que el modal de detalle —
      // price_at_sale_cup > 0 manda; si es 0/null (filas históricas V1) se
      // deriva de price_at_sale × tasa. `??` imprimía «0.00» en el recibo
      // reimpresso de ventas legacy con price_at_sale_cup = 0.
      const rate = Number(i.exchange_rate) > 0 ? Number(i.exchange_rate) : 1;
      const pCup = Number(i.price_at_sale_cup);
      const unitPriceCup = pCup > 0 ? pCup : Number(i.price_at_sale || 0) * rate;
      const qty = Number(i.quantity) || 0;
      return {
        code: i.products?.sku ?? null,
        name: i.products?.name || 'Producto no disponible',
        quantity: qty,
        unitPrice: unitPriceCup,
        currency: 'CUP',
        lineTotal: Math.round(unitPriceCup * qty * 100) / 100,
      };
    }),
    subtotal: Number(transaction.subtotal) || 0,
    discountAmount: Number(transaction.discount_value) || 0,
    discountLabel: null,
    taxAmount: Number(transaction.tax_amount) || 0,
    total: Number(transaction.total_amount) || 0,
    payments: receiptPayments,
    paymentMethod: transaction.payment_method ?? null,
    change: null,
    cashReceived: null,
    status: transaction.status ?? null,
    isReprint: true,
  };
}

// ── 7. Formato de fecha del comprobante (es-CU, determinista) ──────────────

/** Formatea fecha+hora para el comprobante: "20/10/2026, 3:45 p. m." (es-CU). */
export function formatReceiptDateTime(dateIso: string): string {
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return dateIso;
  try {
    return new Intl.DateTimeFormat('es-CU', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(d);
  } catch {
    return d.toISOString();
  }
}
