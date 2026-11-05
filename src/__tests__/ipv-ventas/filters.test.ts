/**
 * Pruebas de los FILTROS DE RESULTADOS del IPV (petición 2026-11-06):
 * «Con movimiento» y «Existencia final > 0».
 *
 * CASOS OBLIGATORIOS A–F de la petición, evaluados sobre filas producidas por
 * computeIpv() REAL (mismo camino que producción: /api/ipv-ventas → computeIpv
 * → filas → applyIpvResultFilters). Datos sintéticos en memoria: ninguna
 * prueba toca datos comerciales.
 *
 * Garantías verificadas:
 *  · Los filtros NO alteran cantidades ni totales (solo seleccionan filas).
 *  · Sin filtros → la misma lista (identidad, misma referencia).
 *  · Combinación AND; decimales exactos; N/D (null) no cumple «> 0»;
 *    negativos excluidos de «Existencia final > 0».
 */
import { describe, it, expect } from 'vitest';
import {
  computeIpv,
  totalsFromRows,
  type IpvComputeInput,
  type IpvMovementRow,
  type IpvRow,
} from '@/lib/ipv-ventas/compute';
import {
  applyIpvResultFilters,
  ipvAnyFilterActive,
  ipvActiveFilterLabels,
  ipvRowHasMovement,
  ipvRowHasPositiveFinalStock,
  IPV_FILTERS_OFF,
} from '@/lib/ipv-ventas/filters';

const FROM = '2026-11-01T04:00:00.000Z'; // límites locales Habana ≈ 00:00 del 01/11
const TO = '2026-11-06T03:59:59.999Z';
const PID = 'aaaaaaaa-1111-4111-8111-111111111111';

function base(overrides: Partial<IpvComputeInput> = {}): IpvComputeInput {
  return {
    window: { fromISO: FROM, toISO: TO },
    movements: [],
    inventory: [],
    salesLines: [],
    devolutionLines: [],
    products: [{ id: PID, sku: '100', name: 'Producto Prueba', unit_of_measure: 'un' }],
    ...overrides,
  };
}

const mov = (movement_type: string, quantity_change: number, iso: string, product_id = PID): IpvMovementRow => ({
  product_id, movement_type, quantity_change, movement_date: iso,
});

function rowOf(result: ReturnType<typeof computeIpv>): IpvRow {
  const row = result.rows.find((r) => r.productId === PID);
  expect(row, 'el producto debe estar incluido en el IPV (regla §6)').toBeDefined();
  return row as IpvRow;
}

const BOTH_ON = { conMovimiento: true, existenciaFinalPositiva: true };
const CON_MOV = { conMovimiento: true, existenciaFinalPositiva: false };
const EF_POS = { conMovimiento: false, existenciaFinalPositiva: true };

// ═══════════════════════════════════════════════════════════════════════════
// Casos de aceptación obligatorios (petición §5)
// ═══════════════════════════════════════════════════════════════════════════

describe('Caso A — Ei 0, entradas 50, vendidas 50, Ef 0 → SÍ con «Con movimiento»', () => {
  it('aparece con «Con movimiento» aunque Ei y Ef sean cero', () => {
    const r = computeIpv(base({
      movements: [
        mov('purchase', 50, '2026-11-02T15:00:00Z'),
        mov('sale', -50, '2026-11-03T15:00:00Z'),
      ],
      inventory: [{ product_id: PID, quantity: 0 }],
    }));
    const row = rowOf(r);
    expect(row.existenciaInicial).toBe(0);
    expect(row.entradas).toBe(50);
    expect(row.cantidadesVendidas).toBe(50);
    expect(row.existenciaFinal).toBe(0);
    expect(ipvRowHasMovement(row)).toBe(true);
    expect(ipvRowHasPositiveFinalStock(row)).toBe(false);
    expect(applyIpvResultFilters([row], CON_MOV)).toContain(row);
    expect(applyIpvResultFilters([row], EF_POS)).toHaveLength(0);
  });
});

describe('Caso B — Ei 20, sin movimientos, Ef 20 → NO con movimiento, SÍ con Ef > 0', () => {
  it('queda excluido por «Con movimiento» e incluido por «Existencia final > 0»', () => {
    const r = computeIpv(base({
      movements: [mov('initial', 20, '2026-10-01T15:00:00Z')],
      inventory: [{ product_id: PID, quantity: 20 }],
    }));
    const row = rowOf(r);
    expect(row.existenciaInicial).toBe(20);
    expect(row.cantidadesVendidas).toBe(0);
    expect(row.entradas).toBe(0);
    expect(row.valesSalidas).toBe(0);
    expect(row.devoluciones).toBe(0);
    expect(row.existenciaFinal).toBe(20);
    expect(ipvRowHasMovement(row)).toBe(false);
    expect(ipvRowHasPositiveFinalStock(row)).toBe(true);
    expect(applyIpvResultFilters([row], CON_MOV)).toHaveLength(0);
    expect(applyIpvResultFilters([row], EF_POS)).toContain(row);
    // Con ambos activos tampoco aparece (AND).
    expect(applyIpvResultFilters([row], BOTH_ON)).toHaveLength(0);
  });
});

describe('Caso C — Ei 10, vendidas 10, Ef 0 → SÍ con «Con movimiento»', () => {
  it('aparece con «Con movimiento» aunque termine en cero', () => {
    const r = computeIpv(base({
      movements: [
        mov('initial', 10, '2026-10-01T15:00:00Z'),
        mov('sale', -10, '2026-11-02T15:00:00Z'),
      ],
      inventory: [{ product_id: PID, quantity: 0 }],
    }));
    const row = rowOf(r);
    expect(row.existenciaInicial).toBe(10);
    expect(row.cantidadesVendidas).toBe(10);
    expect(row.existenciaFinal).toBe(0);
    expect(ipvRowHasMovement(row)).toBe(true);
    expect(applyIpvResultFilters([row], CON_MOV)).toContain(row);
    expect(applyIpvResultFilters([row], EF_POS)).toHaveLength(0);
  });
});

describe('Caso D — Ei 0, sin movimientos, Ef 0 → NO aparece en ninguno de los dos filtros', () => {
  it('un row todo-ceros es excluido por ambos filtros', () => {
    const zeroRow: IpvRow = {
      productId: PID, sku: '100', name: 'Producto Prueba', unit: 'un',
      existenciaInicial: 0, cantidadesVendidas: 0, valesSalidas: 0, entradas: 0,
      devoluciones: 0, ajustes: 0, transferencias: 0, existenciaFinal: 0,
      ventasImporteCup: 0, ventasImporteUsd: 0, hasPeriodMovements: false,
      incidenceTypes: [],
    };
    expect(applyIpvResultFilters([zeroRow], CON_MOV)).toHaveLength(0);
    expect(applyIpvResultFilters([zeroRow], EF_POS)).toHaveLength(0);
    expect(applyIpvResultFilters([zeroRow], BOTH_ON)).toHaveLength(0);
  });

  it('el producto real (sin nada) ni siquiera entra al IPV por la regla de inclusión §6', () => {
    const r = computeIpv(base({
      inventory: [{ product_id: PID, quantity: 0 }],
    }));
    expect(r.rows).toHaveLength(0);
    expect(r.excludedCount).toBe(1);
  });
});

describe('Caso E — movimientos + existencia final positiva → aparece con AMBOS filtros activos', () => {
  it('la combinación es AND: con movimiento Y Ef > 0', () => {
    const r = computeIpv(base({
      movements: [
        mov('initial', 5, '2026-10-01T15:00:00Z'),
        mov('purchase', 20, '2026-11-02T15:00:00Z'),
        mov('sale', -10, '2026-11-03T15:00:00Z'),
      ],
      inventory: [{ product_id: PID, quantity: 15 }],
    }));
    const row = rowOf(r);
    expect(row.existenciaFinal).toBe(15);
    expect(ipvRowHasMovement(row)).toBe(true);
    expect(ipvRowHasPositiveFinalStock(row)).toBe(true);
    expect(applyIpvResultFilters([row], CON_MOV)).toContain(row);
    expect(applyIpvResultFilters([row], EF_POS)).toContain(row);
    expect(applyIpvResultFilters([row], BOTH_ON)).toContain(row);
  });
});

describe('Caso F — existencia final NEGATIVA → NO aparece con «Existencia final > 0»', () => {
  it('se excluye de «Existencia final > 0» (y de la combinación AND)', () => {
    const r = computeIpv(base({
      movements: [
        mov('initial', 5, '2026-10-01T15:00:00Z'),
        mov('sale', -8, '2026-11-02T15:00:00Z'),
      ],
      inventory: [{ product_id: PID, quantity: -3 }],
    }));
    const row = rowOf(r);
    expect(row.existenciaFinal).toBe(-3);
    expect(ipvRowHasMovement(row)).toBe(true);
    expect(ipvRowHasPositiveFinalStock(row)).toBe(false);
    expect(applyIpvResultFilters([row], CON_MOV)).toContain(row);
    expect(applyIpvResultFilters([row], EF_POS)).toHaveLength(0);
    expect(applyIpvResultFilters([row], BOTH_ON)).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Columnas que cuentan como movimiento (criterio exacto de la petición)
// ═══════════════════════════════════════════════════════════════════════════

describe('«Con movimiento» — columnas Vendidas / VS / Entradas / Devoluciones', () => {
  const mkRow = (p: Partial<IpvRow>): IpvRow => ({
    productId: PID, sku: '100', name: 'Producto Prueba', unit: 'un',
    existenciaInicial: null, cantidadesVendidas: 0, valesSalidas: 0, entradas: 0,
    devoluciones: 0, ajustes: 0, transferencias: 0, existenciaFinal: null,
    ventasImporteCup: 0, ventasImporteUsd: 0, hasPeriodMovements: false,
    incidenceTypes: [], ...p,
  });

  it('VS (vales de salida) ≠ 0 cuenta como movimiento', () => {
    const r = computeIpv(base({
      movements: [mov('issue_slip_out', -3, '2026-11-02T15:00:00Z')],
      inventory: [{ product_id: PID, quantity: 0 }],
    }));
    const row = rowOf(r);
    expect(row.valesSalidas).toBe(3);
    expect(ipvRowHasMovement(row)).toBe(true);
  });

  it('Devoluciones ≠ 0 cuenta como movimiento', () => {
    const r = computeIpv(base({
      movements: [mov('return', 4, '2026-11-02T15:00:00Z')],
      inventory: [{ product_id: PID, quantity: 4 }],
    }));
    const row = rowOf(r);
    expect(row.devoluciones).toBe(4);
    expect(ipvRowHasMovement(row)).toBe(true);
  });

  it('solo Ajustes ≠ 0 NO cuenta como movimiento (criterio solicitado: 4 columnas)', () => {
    const row = mkRow({ ajustes: 7, existenciaInicial: 0, existenciaFinal: 7 });
    expect(ipvRowHasMovement(row)).toBe(false);
  });

  it('solo Transferencias ≠ 0 NO cuenta como movimiento (criterio solicitado: 4 columnas)', () => {
    const row = mkRow({ transferencias: -5, existenciaInicial: 5, existenciaFinal: 0 });
    expect(ipvRowHasMovement(row)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Decimales, N/D y garantías de no alteración
// ═══════════════════════════════════════════════════════════════════════════

describe('«Existencia final > 0» — decimales, cero, negativos y N/D', () => {
  const mkRow = (ef: number | null, movs = 0): IpvRow => ({
    productId: PID, sku: '100', name: 'Producto Prueba', unit: 'un',
    existenciaInicial: ef === null ? null : 0, cantidadesVendidas: movs,
    valesSalidas: 0, entradas: 0, devoluciones: 0, ajustes: 0, transferencias: 0,
    existenciaFinal: ef, ventasImporteCup: 0, ventasImporteUsd: 0,
    hasPeriodMovements: movs !== 0, incidenceTypes: [],
  });

  it('decimales positivos sí cumplen (0.5 y 0.000001), sin redondeo', () => {
    expect(ipvRowHasPositiveFinalStock(mkRow(0.5))).toBe(true);
    expect(ipvRowHasPositiveFinalStock(mkRow(0.000001))).toBe(true);
    expect(ipvRowHasPositiveFinalStock(mkRow(10.125))).toBe(true);
  });

  it('cero y negativos (incluidos decimales negativos) no cumplen', () => {
    expect(ipvRowHasPositiveFinalStock(mkRow(0))).toBe(false);
    expect(ipvRowHasPositiveFinalStock(mkRow(-3))).toBe(false);
    expect(ipvRowHasPositiveFinalStock(mkRow(-0.25))).toBe(false);
  });

  it('N/D (null) no cumple — no se inventa existencia', () => {
    expect(ipvRowHasPositiveFinalStock(mkRow(null))).toBe(false);
    expect(applyIpvResultFilters([mkRow(null)], EF_POS)).toHaveLength(0);
  });

  it('movimiento decimal ≠ 0 cuenta (exacto, sin redondeo)', () => {
    expect(ipvRowHasMovement(mkRow(0, 0.000001))).toBe(true);
    expect(ipvRowHasMovement(mkRow(0, -0.5))).toBe(true);
  });
});

describe('Composición y garantías generales de los filtros', () => {
  const rows: IpvRow[] = [
    { productId: 'p1', sku: '1', name: 'A', unit: 'un', existenciaInicial: 0, cantidadesVendidas: 50, valesSalidas: 0, entradas: 50, devoluciones: 0, ajustes: 0, transferencias: 0, existenciaFinal: 0, ventasImporteCup: 100, ventasImporteUsd: 0, hasPeriodMovements: true, incidenceTypes: [] },
    { productId: 'p2', sku: '2', name: 'B', unit: 'un', existenciaInicial: 20, cantidadesVendidas: 0, valesSalidas: 0, entradas: 0, devoluciones: 0, ajustes: 0, transferencias: 0, existenciaFinal: 20, ventasImporteCup: 0, ventasImporteUsd: 0, hasPeriodMovements: false, incidenceTypes: [] },
    { productId: 'p3', sku: '3', name: 'C', unit: 'un', existenciaInicial: 5, cantidadesVendidas: 10, valesSalidas: 0, entradas: 20, devoluciones: 0, ajustes: 0, transferencias: 0, existenciaFinal: 15, ventasImporteCup: 200, ventasImporteUsd: 0, hasPeriodMovements: true, incidenceTypes: [] },
  ];

  it('sin filtros devuelve la MISMA referencia (el IPV habitual, cero costo)', () => {
    expect(applyIpvResultFilters(rows, IPV_FILTERS_OFF)).toBe(rows);
    expect(applyIpvResultFilters(rows, { conMovimiento: false, existenciaFinalPositiva: false })).toBe(rows);
    expect(ipvAnyFilterActive(IPV_FILTERS_OFF)).toBe(false);
  });

  it('«Con movimiento» → A y C; «Ef > 0» → B y C; ambos → solo C', () => {
    expect(applyIpvResultFilters(rows, CON_MOV).map((r) => r.productId)).toEqual(['p1', 'p3']);
    expect(applyIpvResultFilters(rows, EF_POS).map((r) => r.productId)).toEqual(['p2', 'p3']);
    expect(applyIpvResultFilters(rows, BOTH_ON).map((r) => r.productId)).toEqual(['p3']);
  });

  it('los filtros NO alteran cantidades ni fórmulas: los totales del subconjunto salen de las mismas filas', () => {
    const filtered = applyIpvResultFilters(rows, BOTH_ON);
    const t = totalsFromRows(filtered);
    expect(t.cantidadesVendidas).toBe(10);
    expect(t.entradas).toBe(20);
    expect(t.existenciaFinal).toBe(15);
    // Las filas originales quedan intactas (misma referencia por fila).
    expect(rows).toHaveLength(3);
    expect(rows[0].cantidadesVendidas).toBe(50);
  });

  it('etiquetas de filtros activos para la indicación visual', () => {
    expect(ipvActiveFilterLabels(IPV_FILTERS_OFF)).toEqual([]);
    expect(ipvActiveFilterLabels(CON_MOV)).toEqual(['Con movimiento']);
    expect(ipvActiveFilterLabels(EF_POS)).toEqual(['Existencia final > 0']);
    expect(ipvActiveFilterLabels(BOTH_ON)).toEqual(['Con movimiento', 'Existencia final > 0']);
  });
});
