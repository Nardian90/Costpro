/**
 * Tests — Lógica pura del Kardex por producto (§6, §10, §12, §21, §22, §40).
 *
 * Garantías:
 *   1. Ranking de búsqueda inteligente: exacto código > comienza código >
 *      contiene código > exacto nombre > comienza nombre > contiene nombre.
 *   2. Resumen del período: saldo inicial, entradas, salidas, saldo final
 *      tomado SIEMPRE del balance_after registrado (nunca recalculado).
 *   3. Orden cronológico determinista (created_at, luego id).
 *   4. Formateo de cantidades preserva decimales reales sin ruido flotante.
 */

import { describe, it, expect } from 'vitest';
import {
  rankearCoincidencias,
  calcularResumenPeriodo,
  formatearCantidad,
  ordenarCronologico,
  type KardexMovementLike,
} from '@/lib/inventory/kardexPeriod';

const mk = (
  id: string,
  created_at: string,
  movement_type: string,
  quantity_change: number,
  balance_after: number,
  reference_doc: string | null = null
): KardexMovementLike => ({
  id,
  created_at,
  movement_type,
  quantity_change,
  balance_after,
  reference_doc,
  reference_type: null,
  created_by: null,
});

describe('rankearCoincidencias — §6 búsqueda inteligente', () => {
  const productos = [
    { id: 'a', name: 'Kit solar MC4', sku: '122', stock_current: 5 },
    { id: 'b', name: 'Conector MC4', sku: '220', stock_current: 10 },
    { id: 'c', name: 'Cable MC4', sku: '22', stock_current: 3 },
    { id: 'd', name: 'Panel 220W', sku: 'PN-9', stock_current: 1 },
  ];

  it('la coincidencia exacta de código aparece PRIMERO (ej: buscar "22")', () => {
    const ranked = rankearCoincidencias(productos, '22');
    expect(ranked[0].sku).toBe('22');
    expect(ranked[0].name).toBe('Cable MC4');
    // '220' (comienza por código, score 1) antes que '122' (contiene, score 2)
    expect(ranked[1].sku).toBe('220');
    expect(ranked[2].sku).toBe('122');
    // 'Panel 220W' solo coincide por nombre (score 5) → último
    expect(ranked[3].sku).toBe('PN-9');
  });

  it('prioriza "comienza por código" sobre "contiene código"', () => {
    const items = [
      { id: 'x', name: 'Producto A', sku: 'X-22' },
      { id: 'y', name: 'Producto B', sku: '2200' },
    ];
    const ranked = rankearCoincidencias(items as any, '22');
    expect(ranked[0].id).toBe('y'); // comienza por 22
    expect(ranked[1].id).toBe('x'); // solo contiene
  });

  it('coincidencia exacta de nombre antes que parcial (ej: "MC4")', () => {
    const items = [
      { id: 'p', name: 'MC4', sku: 'ZZ' },
      { id: 'q', name: 'MC4 Pro', sku: 'YY' },
      { id: 'r', name: 'Cable MC4', sku: 'XX' },
    ];
    const ranked = rankearCoincidencias(items as any, 'MC4');
    expect(ranked[0].id).toBe('p'); // exacto
    expect(ranked[1].id).toBe('q'); // comienza
    expect(ranked[2].id).toBe('r'); // contiene
  });

  it('término vacío no altera el orden', () => {
    const ranked = rankearCoincidencias(productos, '  ');
    expect(ranked).toHaveLength(4);
  });
});

describe('calcularResumenPeriodo — §10/§12/§23', () => {
  it('calcula entradas, salidas y saldo final del período', () => {
    const movs = [
      mk('1', '2026-09-02T10:00:00Z', 'purchase', 50, 150, 'EN-0012'),
      mk('2', '2026-09-04T10:00:00Z', 'sale', -10, 140, 'V-0045'),
      mk('3', '2026-09-06T10:00:00Z', 'out', -5, 135, 'VS-0021'),
      mk('4', '2026-09-08T10:00:00Z', 'return', 2, 137, 'DEV-0004'),
    ];
    const r = calcularResumenPeriodo(movs, 100);
    expect(r.saldoInicial).toBe(100);
    expect(r.entradas).toBe(52); // 50 + 2
    expect(r.salidas).toBe(15); // 10 + 5
    expect(r.saldoFinal).toBe(137); // balance_after del último, NO recalculado
    expect(r.cantidadMovimientos).toBe(4);
  });

  it('período vacío: saldo final = saldo inicial', () => {
    const r = calcularResumenPeriodo([], 42.5);
    expect(r.saldoInicial).toBe(42.5);
    expect(r.saldoFinal).toBe(42.5);
    expect(r.entradas).toBe(0);
    expect(r.salidas).toBe(0);
    expect(r.cantidadMovimientos).toBe(0);
  });

  it('saldo final usa balance_after aunque matemáticamente no cuadre (nunca recalcula)', () => {
    // La fuente de verdad es la BD; si hubiera una divergencia histórica,
    // el Kardex la MUESTRA, no la oculta (§13).
    const movs = [mk('1', '2026-09-02T10:00:00Z', 'purchase', 10, 999, 'EN-0001')];
    const r = calcularResumenPeriodo(movs, 0);
    expect(r.saldoFinal).toBe(999);
  });

  it('balance_after nulo del último movimiento cae al saldo inicial', () => {
    const movs = [{ ...mk('1', '2026-09-02T10:00:00Z', 'adjustment', 5, 0), balance_after: null }];
    const r = calcularResumenPeriodo(movs, 7);
    expect(r.saldoFinal).toBe(7);
  });
});

describe('ordenarCronologico — §21/§22', () => {
  it('ordena de más antiguo a más reciente', () => {
    const movs = [
      mk('3', '2026-09-08T10:00:00Z', 'sale', -1, 99),
      mk('1', '2026-09-02T10:00:00Z', 'purchase', 50, 150),
      mk('2', '2026-09-04T10:00:00Z', 'sale', -10, 140),
    ];
    const sorted = ordenarCronologico(movs);
    expect(sorted.map(m => m.id)).toEqual(['1', '2', '3']);
  });

  it('misma fecha: desempate determinista por id (§22)', () => {
    const movs = [
      mk('b', '2026-09-04T10:00:00Z', 'sale', -1, 99),
      mk('a', '2026-09-04T10:00:00Z', 'purchase', 50, 150),
    ];
    const sorted = ordenarCronologico(movs);
    expect(sorted.map(m => m.id)).toEqual(['a', 'b']);
  });

  it('no muta el arreglo original', () => {
    const movs = [mk('2', '2026-09-04T10:00:00Z', 'sale', -1, 99), mk('1', '2026-09-02T10:00:00Z', 'purchase', 50, 150)];
    const copia = [...movs];
    ordenarCronologico(movs);
    expect(movs).toEqual(copia);
  });
});

describe('formatearCantidad — §40/§41', () => {
  it('conserva decimales reales sin redondeo arbitrario', () => {
    expect(formatearCantidad(65.5)).toBe('65.5');
    expect(formatearCantidad(65.25)).toBe('65.25');
    expect(formatearCantidad(0.5)).toBe('0.5');
    expect(formatearCantidad(1.75)).toBe('1.75');
    expect(formatearCantidad(10.125)).toBe('10.125');
  });

  it('elimina solo el ruido de coma flotante', () => {
    expect(formatearCantidad(0.30000000000000004)).toBe('0.3');
    expect(formatearCantidad(125.49999999999999)).toBe('125.5');
  });

  it('enteros sin decimales forzados', () => {
    expect(formatearCantidad(100)).toBe('100');
    expect(formatearCantidad(0)).toBe('0');
  });

  it('valores nulos o no numéricos → —', () => {
    expect(formatearCantidad(null)).toBe('—');
    expect(formatearCantidad(undefined)).toBe('—');
    expect(formatearCantidad(NaN)).toBe('—');
  });
});
