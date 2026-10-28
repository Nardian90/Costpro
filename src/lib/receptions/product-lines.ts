/**
 * MISIÓN RECEPCIONES — VISTA POR PRODUCTOS (2026-10-28)
 * =====================================================
 * Lógica pura para la pestaña "Productos" de la vista Recepciones.
 *
 * Objetivo: presentar las MISMAS recepciones desde la perspectiva de sus
 * líneas de producto, sin alterar documentos ni inventario. Toda la lógica
 * de cálculo respeta lo que ya emplea COSTPRO:
 *
 *  - Importe de línea = quantity * unit_cost (igual que ReceptionDetailsModal,
 *    que muestra `formatCurrency(item.quantity * item.unit_cost)`).
 *  - Moneda de línea = moneda_recepcion (convención del sistema: 'CUP' cuando
 *    el valor no está presente — igual que el modal de detalles).
 *  - Equivalente CUP = quantity * unit_cost * tasa_cambio_recepcion — misma
 *    fórmula que usa useSavePendingReception para computar receipts.total_cost
 *    (PR-2 C1). Solo se expone cuando existe una tasa real (> 1) y la moneda
 *    no es CUP; nunca se inventa un valor.
 *  - No se redondean cantidades ni precios: el formateo visual es
 *    responsabilidad de formatCurrency en la UI.
 *
 * Esta función NO escribe en la base de datos: es solo presentación.
 */

import { z } from 'zod';

// ────────────────────────────────────────────────────────────────────────────
// Esquema de una línea de producto (fila de la tabla Productos)
// ────────────────────────────────────────────────────────────────────────────

export const receptionProductLineSchema = z.object({
  id: z.string(),
  receipt_id: z.string(),
  product_id: z.string(),
  quantity: z.number(),
  unit_cost: z.number(),
  moneda_recepcion: z.string().nullable().optional(),
  tasa_cambio_recepcion: z.number().nullable().optional(),
  created_at: z.string().nullable().optional(),
  products: z
    .object({
      name: z.string().nullable().optional(),
      sku: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  receipts: z.object({
    id: z.string(),
    reference_doc: z.string().nullable().optional(),
    supplier: z.string().nullable().optional(),
    reception_date: z.string().nullable().optional(),
    status: z.string(),
    store_id: z.string().nullable().optional(),
    created_at: z.string().nullable().optional(),
  }),
});

export type ReceptionProductLine = z.infer<typeof receptionProductLineSchema>;

// Monedas soportadas por el sistema (misma lista que formatCurrency en utils)
const SYSTEM_CURRENCIES = ['CUP', 'USD', 'EUR', 'MLC'] as const;
export type SystemCurrency = (typeof SYSTEM_CURRENCIES)[number];

/** Umbral de tasa válida — paridad con F-21 (validateReceiptItemsTasa). */
const MIN_VALID_TASA = 1.5;

// ────────────────────────────────────────────────────────────────────────────
// Dinero de una línea — única fuente de verdad para Precio/Importe
// ────────────────────────────────────────────────────────────────────────────

export interface LineMoney {
  /** Moneda almacenada en la línea (siempre una moneda del sistema). */
  currency: SystemCurrency;
  /** Precio unitario tal cual almacenado (sin redondeo). */
  unitPrice: number;
  /** Cantidad tal cual almacenada (sin redondeo). */
  quantity: number;
  /** Importe de línea = quantity * unit_cost (lógica COSTPRO existente). */
  lineAmount: number;
  /**
   * Equivalente en CUP (quantity * unit_cost * tasa). Solo para líneas en
   * moneda extranjera con tasa real almacenada (> 1.5); null en cualquier
   * otro caso para no inventar valores.
   */
  cupEquivalent: number | null;
  /** Tasa almacenada (null cuando no aplica o no es fiable). */
  tasa: number | null;
}

export function computeLineMoney(item: Pick<
  ReceptionProductLine,
  'quantity' | 'unit_cost' | 'moneda_recepcion' | 'tasa_cambio_recepcion'
>): LineMoney {
  const rawMoneda = (item.moneda_recepcion || 'CUP').toUpperCase();
  const currency: SystemCurrency =
    (SYSTEM_CURRENCIES as readonly string[]).includes(rawMoneda)
      ? (rawMoneda as SystemCurrency)
      : 'CUP';

  const quantity = item.quantity;
  const unitPrice = item.unit_cost;
  const lineAmount = quantity * unitPrice;

  const rawTasa = item.tasa_cambio_recepcion;
  const tasa =
    currency !== 'CUP' && typeof rawTasa === 'number' && rawTasa > MIN_VALID_TASA
      ? rawTasa
      : null;

  const cupEquivalent = tasa !== null ? lineAmount * tasa : null;

  return { currency, unitPrice, quantity, lineAmount, cupEquivalent, tasa };
}

// ────────────────────────────────────────────────────────────────────────────
// Filtros — mismos criterios que la pestaña Documentos, adaptados a líneas
// ────────────────────────────────────────────────────────────────────────────

export interface ProductLineFilters {
  /** Búsqueda libre: SKU, producto, ID de documento, proveedor o factura. */
  search: string;
  /** Estado del documento de origen (mismos valores que la pestaña Documentos). */
  status: string;
  /** Fecha de recepción desde (YYYY-MM-DD, inclusivo). */
  dateFrom: string;
  /** Fecha de recepción hasta (YYYY-MM-DD, inclusivo). */
  dateTo: string;
}

const EMPTY_FILTERS: ProductLineFilters = { search: '', status: '', dateFrom: '', dateTo: '' };

/** Fecha efectiva de una línea: la del documento de recepción (fallback created_at del documento). */
export function lineEffectiveDate(line: ReceptionProductLine): Date {
  return new Date(line.receipts.reception_date || line.receipts.created_at || '');
}

/**
 * Filtra líneas de producto. Todos los criterios se combinan con AND
 * (mismo comportamiento que el filtro de la pestaña Documentos).
 * El ID del documento se busca por su forma corta visible (prefijo antes
 * del primer guion) o por el ID completo — igual que la vista Documentos.
 */
export function filterProductLines(
  lines: ReceptionProductLine[],
  filters: ProductLineFilters
): ReceptionProductLine[] {
  const { search, status, dateFrom, dateTo } = { ...EMPTY_FILTERS, ...filters };
  const term = search.trim().toLowerCase();

  return lines.filter((line) => {
    // Búsqueda: SKU, nombre de producto, ID de documento (corto o completo),
    // factura y proveedor — en una sola caja, como en Documentos.
    let matchesSearch = true;
    if (term) {
      const docId = line.receipt_id.toLowerCase();
      const docShort = docId.split('-')[0];
      const haystack = [
        line.products?.sku || '',
        line.products?.name || '',
        docId,
        docShort,
        line.receipts.reference_doc || '',
        line.receipts.supplier || '',
      ]
        .join(' ')
        .toLowerCase();
      matchesSearch = haystack.includes(term);
    }

    const matchesStatus = !status || line.receipts.status === status;

    let matchesDate = true;
    if (dateFrom || dateTo) {
      const date = lineEffectiveDate(line);
      if (isNaN(date.getTime())) {
        // Línea sin fecha válida: solo visible cuando no hay filtro de fecha activo.
        matchesDate = false;
      } else {
        if (dateFrom && date < new Date(dateFrom)) matchesDate = false;
        if (dateTo) {
          const to = new Date(dateTo);
          to.setHours(23, 59, 59, 999); // día "hasta" inclusivo
          if (date > to) matchesDate = false;
        }
      }
    }

    return matchesSearch && matchesStatus && matchesDate;
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Paginación client-side (rendimiento con muchas líneas)
// ────────────────────────────────────────────────────────────────────────────

export const PRODUCT_LINES_PAGE_SIZE = 50;

export function paginateProductLines<T>(
  lines: T[],
  page: number,
  pageSize: number = PRODUCT_LINES_PAGE_SIZE
): { rows: T[]; total: number; totalPages: number; page: number } {
  const total = lines.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    rows: lines.slice(start, start + pageSize),
    total,
    totalPages,
    page: safePage,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Export a Excel — misma herramienta (@e965/xlsx) y convenciones que Documentos
// ────────────────────────────────────────────────────────────────────────────

export interface ProductLineExcelRow {
  Documento: string;
  Factura: string;
  Fecha: string;
  Proveedor: string;
  Estado: string;
  SKU: string;
  Producto: string;
  Cantidad: number;
  Moneda: string;
  'Precio unitario': number;
  Importe: number;
  'Importe CUP': number | string;
  Tasa: number | string;
}

/** Etiqueta de estado — misma convención que el export de Documentos. */
export function receiptStatusLabel(status: string): string {
  switch (status) {
    case 'active':
      return 'Confirmada';
    case 'voided':
      return 'Anulada';
    case 'pending':
      return 'Pendiente';
    case 'partial':
      return 'Parcial';
    case 'reversed':
      return 'Revertida';
    case 'confirmed':
      return 'Confirmada';
    default:
      return status || '—';
  }
}

export function toProductLinesExcelRows(lines: ReceptionProductLine[]): ProductLineExcelRow[] {
  return lines.map((line) => {
    const money = computeLineMoney(line);
    return {
      Documento: line.receipt_id.split('-')[0],
      Factura: line.receipts.reference_doc || '',
      Fecha:
        line.receipts.reception_date || line.receipts.created_at
          ? new Date(line.receipts.reception_date || line.receipts.created_at || '').toLocaleDateString('es-CU')
          : '',
      Proveedor: line.receipts.supplier || '',
      Estado: receiptStatusLabel(line.receipts.status),
      SKU: line.products?.sku || '',
      Producto: line.products?.name || '',
      Cantidad: line.quantity,
      Moneda: money.currency,
      'Precio unitario': Number(money.unitPrice.toFixed(2)),
      Importe: Number(money.lineAmount.toFixed(2)),
      'Importe CUP': money.cupEquivalent !== null ? Number(money.cupEquivalent.toFixed(2)) : '',
      Tasa: money.tasa !== null ? money.tasa : '',
    };
  });
}
