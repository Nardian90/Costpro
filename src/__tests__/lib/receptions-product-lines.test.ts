import { describe, it, expect } from 'vitest';
import {
  computeLineMoney,
  filterProductLines,
  paginateProductLines,
  receiptStatusLabel,
  toProductLinesExcelRows,
  type ReceptionProductLine,
} from '@/lib/receptions/product-lines';

/**
 * MISIÓN RECEPCIONES — VISTA POR PRODUCTOS (2026-10-28)
 *
 * Pruebas de la lógica pura de la pestaña Productos:
 *  - Importe de línea = quantity * unit_cost (lógica COSTPRO del modal de detalles).
 *  - Moneda por línea (moneda_recepcion, default CUP) sin mezclar totales.
 *  - Equivalente CUP SOLO con tasa real (> 1.5) — nunca se inventan valores.
 *  - Filtros combinables (AND) con los mismos criterios que Documentos.
 *  - Paginación client-side con clamp de página.
 */

const mkLine = (overrides: Partial<ReceptionProductLine> = {}): ReceptionProductLine => ({
  id: 'item-1',
  receipt_id: 'abc12345-6789-4def-9012-3456789abcde',
  product_id: 'p-1',
  quantity: 10,
  unit_cost: 25,
  moneda_recepcion: 'CUP',
  tasa_cambio_recepcion: 1,
  created_at: '2026-10-20T10:00:00Z',
  products: { name: 'Cerveza Bucanero', sku: 'BUC-350' },
  receipts: {
    id: 'abc12345-6789-4def-9012-3456789abcde',
    reference_doc: 'FAC-001',
    supplier: 'Proveedor Central',
    reception_date: '2026-10-20T09:00:00Z',
    status: 'active',
    store_id: 'store-a',
    created_at: '2026-10-20T09:30:00Z',
  },
  ...overrides,
});

describe('computeLineMoney — dinero de una línea', () => {
  it('CUP: importe = cantidad × costo unitario, sin equivalente CUP', () => {
    const money = computeLineMoney({ quantity: 10, unit_cost: 25, moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1 });
    expect(money.currency).toBe('CUP');
    expect(money.lineAmount).toBe(250);
    expect(money.cupEquivalent).toBeNull();
    expect(money.tasa).toBeNull();
  });

  it('moneda ausente: default CUP (convención del sistema)', () => {
    const money = computeLineMoney({ quantity: 2, unit_cost: 100, moneda_recepcion: null, tasa_cambio_recepcion: null });
    expect(money.currency).toBe('CUP');
    expect(money.lineAmount).toBe(200);
    expect(money.cupEquivalent).toBeNull();
  });

  it('USD con tasa real: expone equivalente CUP con la fórmula del total del documento', () => {
    const money = computeLineMoney({ quantity: 3, unit_cost: 10, moneda_recepcion: 'USD', tasa_cambio_recepcion: 420 });
    expect(money.currency).toBe('USD');
    expect(money.lineAmount).toBe(30);
    expect(money.tasa).toBe(420);
    expect(money.cupEquivalent).toBe(30 * 420);
  });

  it('FX con tasa inválida (<= 1.5): NO inventa equivalente CUP', () => {
    const money = computeLineMoney({ quantity: 3, unit_cost: 10, moneda_recepcion: 'USD', tasa_cambio_recepcion: 1 });
    expect(money.cupEquivalent).toBeNull();
    expect(money.tasa).toBeNull();
  });

  it('moneda desconocida: fallback CUP (misma lista que formatCurrency)', () => {
    const money = computeLineMoney({ quantity: 1, unit_cost: 5, moneda_recepcion: 'XXX', tasa_cambio_recepcion: null });
    expect(money.currency).toBe('CUP');
  });

  it('no redondea valores almacenados', () => {
    const money = computeLineMoney({ quantity: 3, unit_cost: 1.333333, moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1 });
    expect(money.lineAmount).toBeCloseTo(3.999999, 10);
  });
});

describe('filterProductLines — filtros combinables (AND)', () => {
  const lines: ReceptionProductLine[] = [
    mkLine(),
    mkLine({
      id: 'item-2',
      receipt_id: 'fff22222-aaaa-4bbb-4ccc-111122223334',
      quantity: 5,
      unit_cost: 8,
      moneda_recepcion: 'USD',
      tasa_cambio_recepcion: 420,
      products: { name: 'Refresco Tallín', sku: 'TAL-500' },
      receipts: {
        id: 'fff22222-aaaa-4bbb-4ccc-111122223334',
        reference_doc: 'FAC-002',
        supplier: 'Distribuidora Este',
        reception_date: '2026-10-25T09:00:00Z',
        status: 'pending',
        store_id: 'store-a',
        created_at: '2026-10-25T09:30:00Z',
      },
    }),
    mkLine({
      id: 'item-3',
      receipt_id: 'aaa33333-bbbb-4ccc-4ddd-222233334445',
      quantity: 1,
      unit_cost: 900,
      products: { name: 'Caja mixta', sku: 'MIX-001' },
      receipts: {
        id: 'aaa33333-bbbb-4ccc-4ddd-222233334445',
        reference_doc: null,
        supplier: null,
        reception_date: null,
        status: 'voided',
        store_id: 'store-a',
        created_at: null,
      },
    }),
  ];

  it('búsqueda por SKU, nombre, ID corto de documento, proveedor y factura', () => {
    expect(filterProductLines(lines, { search: 'TAL-500', status: '', dateFrom: '', dateTo: '' })).toHaveLength(1);
    expect(filterProductLines(lines, { search: 'bucanero', status: '', dateFrom: '', dateTo: '' })).toHaveLength(1);
    expect(filterProductLines(lines, { search: 'fff22222', status: '', dateFrom: '', dateTo: '' })).toHaveLength(1);
    expect(filterProductLines(lines, { search: 'distribuidora este', status: '', dateFrom: '', dateTo: '' })).toHaveLength(1);
    expect(filterProductLines(lines, { search: 'FAC-001', status: '', dateFrom: '', dateTo: '' })).toHaveLength(1);
  });

  it('búsqueda sin coincidencias devuelve vacío', () => {
    expect(filterProductLines(lines, { search: 'zzz-inexistente', status: '', dateFrom: '', dateTo: '' })).toHaveLength(0);
  });

  it('filtro de estado del documento de origen', () => {
    expect(filterProductLines(lines, { search: '', status: 'pending', dateFrom: '', dateTo: '' })).toHaveLength(1);
    expect(filterProductLines(lines, { search: '', status: 'voided', dateFrom: '', dateTo: '' })).toHaveLength(1);
    expect(filterProductLines(lines, { search: '', status: 'active', dateFrom: '', dateTo: '' })).toHaveLength(1);
  });

  it('rango de fechas inclusivo (mismo día se incluye) y usa fecha del documento', () => {
    expect(filterProductLines(lines, { search: '', status: '', dateFrom: '2026-10-20', dateTo: '2026-10-20' })).toHaveLength(1);
    expect(filterProductLines(lines, { search: '', status: '', dateFrom: '2026-10-25', dateTo: '2026-10-25' })).toHaveLength(1);
    // Línea sin fecha válida (item-3): excluida cuando hay filtro de fecha
    expect(filterProductLines(lines, { search: '', status: '', dateFrom: '2026-01-01', dateTo: '2026-12-31' })).toHaveLength(2);
  });

  it('combinación de criterios con AND', () => {
    expect(
      filterProductLines(lines, { search: 'bucanero', status: 'active', dateFrom: '2026-10-20', dateTo: '2026-10-20' })
    ).toHaveLength(1);
    expect(
      filterProductLines(lines, { search: 'bucanero', status: 'pending', dateFrom: '', dateTo: '' })
    ).toHaveLength(0);
  });
});

describe('paginateProductLines — paginación client-side', () => {
  const many = Array.from({ length: 120 }, (_, i) => i);

  it('partición estándar de 50 por página', () => {
    const p1 = paginateProductLines(many, 1);
    expect(p1.total).toBe(120);
    expect(p1.totalPages).toBe(3);
    expect(p1.rows).toHaveLength(50);
    expect(p1.rows[0]).toBe(0);
    const p3 = paginateProductLines(many, 3);
    expect(p3.rows).toHaveLength(20);
  });

  it('clamp de página fuera de rango', () => {
    expect(paginateProductLines(many, 0).page).toBe(1);
    expect(paginateProductLines(many, 99).page).toBe(3);
  });

  it('lista vacía: una página sin filas', () => {
    const p = paginateProductLines([], 1);
    expect(p.totalPages).toBe(1);
    expect(p.rows).toHaveLength(0);
  });
});

describe('presentación — etiquetas de estado y filas de Excel', () => {
  it('etiquetas de estado iguales a las del export de Documentos', () => {
    expect(receiptStatusLabel('active')).toBe('Confirmada');
    expect(receiptStatusLabel('voided')).toBe('Anulada');
    expect(receiptStatusLabel('pending')).toBe('Pendiente');
    expect(receiptStatusLabel('partial')).toBe('Parcial');
    expect(receiptStatusLabel('reversed')).toBe('Revertida');
  });

  it('filas de Excel conservan trazabilidad documento → producto', () => {
    const rows = toProductLinesExcelRows([
      mkLine({ quantity: 4, unit_cost: 12.5 }),
      mkLine({
        id: 'item-fx',
        quantity: 2,
        unit_cost: 10,
        moneda_recepcion: 'USD',
        tasa_cambio_recepcion: 400,
      }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      Documento: 'abc12345',
      Factura: 'FAC-001',
      Proveedor: 'Proveedor Central',
      SKU: 'BUC-350',
      Producto: 'Cerveza Bucanero',
      Cantidad: 4,
      Moneda: 'CUP',
      'Precio unitario': 12.5,
      Importe: 50,
      'Importe CUP': '',
      Tasa: '',
    });
    expect(rows[1]).toMatchObject({
      Moneda: 'USD',
      Importe: 20,
      'Importe CUP': 8000,
      Tasa: 400,
    });
  });
});
