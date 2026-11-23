/**
 * ADNEGOCIO-UI 2026-11-23 — Lógica de comparación comercial de productos
 * (misión §5.2/§5.3/§5.4). Cubre los casos obligatorios:
 *  1. Líder anterior con CERO ventas actuales permanece visible.
 *  2. Producto nuevo sin ventas anteriores.
 *  3. Caída de ventas manteniendo existencia.
 *  4. Stock actual cero.
 *  5. Sin evidencia histórica suficiente (ledger no conciliado / truncado).
 *  6. Período anterior sin ventas (sin base).
 *  7. Variación: sin división entre cero.
 */
import { describe, it, expect } from 'vitest';
import {
  buildComparison,
  situacionStock,
  SITUACION_LABEL,
  evaluarEvidenciaKardex,
  type PeriodProductRow,
  type ProductCatalogRow,
} from '@/lib/product-comparison/compare';

const fila = (id: string, name: string, net_cup: number, units: number, sku?: string | null): PeriodProductRow => ({
  product_id: id,
  name,
  sku: sku ?? null,
  units_sold: units,
  units_returned: 0,
  net_cup,
});

const catalogo = (id: string, stock: number, um = 'unidad'): ProductCatalogRow => ({
  id,
  name: id,
  sku: `SKU-${id}`,
  stock_current: stock,
  unit_of_measure: um,
});

describe('buildComparison — unión y clasificación (misión §5.3)', () => {
  it('el líder anterior con CERO ventas actuales permanece visible («dejó de venderse»)', () => {
    // Ejemplo de la misión: el cemento era #1 y ahora no aparece en el Top actual.
    const actual = [fila('bloque', 'Bloque', 500000, 10), fila('varilla', 'Varilla', 300000, 8)];
    const anterior = [fila('cemento', 'Cemento', 800000, 40), fila('bloque', 'Bloque', 300000, 6)];
    // Sin salidas por venta en el período actual (Set vacío = evidencia del ledger)
    const { rows } = buildComparison(actual, anterior, [catalogo('cemento', 120, 'saco')], new Set());

    const cemento = rows.find((r) => r.productId === 'cemento');
    expect(cemento).toBeDefined();
    expect(cemento!.posActual).toBeNull();
    expect(cemento!.posAnterior).toBe(1);
    expect(cemento!.ventasActuales).toBe(0);
    expect(cemento!.ventasAnteriores).toBe(800000);
    expect(cemento!.evolucion).toBe('dejo_de_venderse');
    expect(cemento!.stockActual).toBe(120); // sigue visible con su existencia
    // Con base válida: la caída al cero es −100 % (la prohibición de dividir
    // entre cero aplica cuando el ANTERIOR es 0)
    expect(cemento!.varPct).toBe(-100);
  });

  it('producto nuevo sin ventas anteriores → «nuevo»', () => {
    const actual = [fila('nuevo', 'Producto nuevo', 400000, 5)];
    const anterior = [fila('viejo', 'Producto viejo', 600000, 10)];
    const { rows, resumen } = buildComparison(actual, anterior, []);
    const nuevo = rows.find((r) => r.productId === 'nuevo')!;
    expect(nuevo.evolucion).toBe('nuevo');
    expect(nuevo.posAnterior).toBeNull();
    expect(nuevo.varPct).toBeNull();
    expect(resumen.nuevos).toContain('Producto nuevo');
  });

  it('sigue en el Top pero con ventas menores → «desciende»; mayor posición → «crece»', () => {
    const actual = [fila('a', 'A', 300000, 3), fila('b', 'B', 200000, 2)];
    const anterior = [fila('a', 'A', 500000, 6), fila('b', 'B', 100000, 1)];
    const { rows } = buildComparison(actual, anterior, []);
    const a = rows.find((r) => r.productId === 'a')!;
    const b = rows.find((r) => r.productId === 'b')!;
    expect(a.evolucion).toBe('desciende'); // posición igual (1→1) pero pierde ventas
    expect(b.evolucion).toBe('crece'); // mejora posición (2→1) y ventas
    expect(b.varPct).toBe(100); // +100%
  });

  it('sigue vendiendo fuera del Top actual → «sale del Top» (distinto de «dejó de venderse»)', () => {
    // El RPC solo lista el Top: aquí simulamos un producto del Top anterior con
    // ventas > 0 pero sin fila en el Top actual (salida del Top).
    const actual = [fila('lider', 'Líder', 900000, 9)];
    const anterior = [fila('lider', 'Líder', 400000, 4), fila('tercer', 'Tercer', 200000, 2)];
    // CON salidas por venta registradas en el período actual → sale del Top
    const { rows } = buildComparison(actual, anterior, [
      { id: 'tercer', name: 'Tercer', sku: 'S', stock_current: 7, unit_of_measure: 'unidad' },
    ], new Set(['tercer']));
    const tercer = rows.find((r) => r.productId === 'tercer')!;
    expect(tercer.evolucion).toBe('sale_del_top');
    // Nótese: ventasActuales = 0 porque el Top actual no lo lista — el enunciado
    // del caso ENERVIDA es: tenía ventas y en el actual no registra. Si el
    // sistema no lo lista, el clasificador no lo llama «dejó de venderse»
    // salvo ventas anteriores > 0 Y sin fila actual.
    expect(tercer.posActual).toBeNull();

    // SIN salidas por venta en el período actual (evidencia del ledger) → dejó de venderse
    const { rows: rows2 } = buildComparison(actual, anterior, [], new Set());
    expect(rows2.find((r) => r.productId === 'tercer')!.evolucion).toBe('dejo_de_venderse');

    // Sin evidencia disponible (parámetro ausente) → conservador: sale del Top
    const { rows: rows3 } = buildComparison(actual, anterior, []);
    expect(rows3.find((r) => r.productId === 'tercer')!.evolucion).toBe('sale_del_top');
  });

  it('resumen ejecutivo: líderes, cambio de líder, mayor crecimiento y mayor caída', () => {
    const actual = [fila('bloque', 'Bloque', 500000, 10), fila('varilla', 'Varilla', 300000, 8)];
    const anterior = [fila('cemento', 'Cemento', 800000, 40), fila('bloque', 'Bloque', 300000, 6)];
    // Sin salidas por venta del cemento en el período actual (Set vacío):
    // la clasificación «dejó de venderse» exige evidencia del ledger.
    const { resumen } = buildComparison(actual, anterior, [], new Set());
    expect(resumen.liderActual?.name).toBe('Bloque');
    expect(resumen.liderAnterior?.name).toBe('Cemento');
    expect(resumen.cambioLider).toContain('Bloque');
    expect(resumen.mayorCrecimiento?.name).toBe('Bloque');
    expect(resumen.mayorCaída?.name).toBe('Cemento'); // −800,000: la caída al cero domina
    expect(resumen.dejaronDeVenderse).toEqual(['Cemento']);
  });

  it('período anterior SIN ventas → sin base en todo el ranking', () => {
    const actual = [fila('a', 'A', 100000, 1)];
    const { rows } = buildComparison(actual, [], []);
    const a = rows.find((r) => r.productId === 'a')!;
    expect(a.evolucion).toBe('nuevo');
    expect(a.varPct).toBeNull();
  });

  it('identificadores canónicos: el nombre NO une filas — el product_id sí', () => {
    const actual = [fila('p1', 'Nombre nuevo en catálogo', 100000, 2)];
    const anterior = [fila('p1', 'Nombre viejo', 50000, 1)];
    const { rows } = buildComparison(actual, anterior, []);
    expect(rows).toHaveLength(1);
    expect(rows[0].posActual).toBe(1);
    expect(rows[0].posAnterior).toBe(1);
    expect(rows[0].ventasAnteriores).toBe(50000);
  });
});

describe('situacionStock — etiquetas de inventario (misión §5.4)', () => {
  const base = {
    productId: 'x', name: 'X', sku: null, posActual: null, posAnterior: null,
    ventasActuales: 0, ventasAnteriores: 0, unidadesActuales: 0, unidadesAnteriores: 0,
    devolucionesActuales: 0, devolucionesAnteriores: 0, difCup: 0, varPct: null,
    stockActual: null, unidadMedida: null, evolucion: 'dejo_de_venderse' as const,
    minStock: null, // misión 2026-11-24: mínimo del catálogo propagado a las filas
    participacionActual: null, // misión 2026-11-23: participación oficial opcional
  };

  it('stock cero + sin ventas → «Stock actual agotado» (sin afirmar causa)', () => {
    const s = situacionStock({ ...base, stockActual: 0 });
    expect(SITUACION_LABEL[s]).toBe('Stock actual agotado');
  });

  it('stock disponible + sin ventas → «Sin ventas en el período actual»', () => {
    const s = situacionStock({ ...base, stockActual: 50 });
    expect(SITUACION_LABEL[s]).toBe('Sin ventas en el período actual');
  });

  it('catálogo sin datos → «Sin información histórica suficiente»', () => {
    const s = situacionStock(base);
    expect(SITUACION_LABEL[s]).toBe('Sin información histórica suficiente');
  });
});

describe('evaluarEvidenciaKardex — regla crítica de la misión §5.4', () => {
  const mov = (saldo: number, q: number, fecha = '2026-11-10T12:00:00Z', tipo = 'out') => ({
    created_at: fecha, quantity_change: q, saldo, movement_type: tipo,
  });

  it('ledger conciliado con saldo mínimo ≤ 0 → EVIDENCIA de agotamiento con momento', () => {
    const e = evaluarEvidenciaKardex({
      saldoInicial: 10,
      movimientos: [mov(10, 0, '2026-11-05T12:00:00Z'), mov(0, -10, '2026-11-12T12:00:00Z'), mov(5, 5, '2026-11-15T12:00:00Z', 'in')],
      isTruncated: false,
      sumaTotal: 5,
      stockAutoritativo: 5,
    });
    expect(e.historicoConfiable).toBe(true);
    expect(e.saldoMinimo).toBe(0);
    expect(e.momentoAgotamiento).toBe('2026-11-12T12:00:00Z');
    expect(e.nota).toMatch(/evidencia de agotamiento/);
  });

  it('ledger NO conciliado (hueco de datos) → SIN evidencia, se dice expresamente', () => {
    const e = evaluarEvidenciaKardex({
      saldoInicial: 10,
      movimientos: [mov(0, -10, '2026-11-12')],
      isTruncated: false,
      sumaTotal: 0, // Σ del ledger ≠ stock autoritativo (p. ej. 25)
      stockAutoritativo: 25,
    });
    expect(e.historicoConfiable).toBe(false);
    expect(e.momentoAgotamiento).toBeNull();
    expect(e.nota).toMatch(/no es concluyente/);
  });

  it('ledger truncado → sin evidencia confiable', () => {
    const e = evaluarEvidenciaKardex({
      saldoInicial: 10,
      movimientos: [mov(0, -10)],
      isTruncated: true,
      sumaTotal: null,
      stockAutoritativo: 0,
    });
    expect(e.historicoConfiable).toBe(false);
    expect(e.nota).toMatch(/límite de consulta/);
  });

  it('saldo corrido siempre > 0 → NO hay evidencia de agotamiento (no se inventa)', () => {
    const e = evaluarEvidenciaKardex({
      saldoInicial: 40,
      movimientos: [mov(30, -10), mov(15, -15), mov(10, -5)],
      isTruncated: false,
      sumaTotal: 10,
      stockAutoritativo: 10,
    });
    expect(e.historicoConfiable).toBe(true);
    expect(e.saldoMinimo).toBe(10);
    expect(e.momentoAgotamiento).toBeNull();
    expect(e.nota).toMatch(/no hay evidencia de agotamiento/);
  });

  it('sin movimientos en el período → sin información suficiente', () => {
    const e = evaluarEvidenciaKardex({
      saldoInicial: 10,
      movimientos: [],
      isTruncated: false,
      sumaTotal: 10,
      stockAutoritativo: 10,
    });
    expect(e.historicoConfiable).toBe(false);
    expect(e.nota).toMatch(/sin movimientos registrados/i);
  });
});
