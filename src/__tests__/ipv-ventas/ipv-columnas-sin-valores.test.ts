/**
 * Pruebas de la lógica de columnas del IPV (misión 2026-11-24 fase 4B):
 * «Ocultar columnas sin valores» sobre el subconjunto FILTRADO.
 *
 * Garantías:
 *  · Una columna se oculta SOLO si TODOS los productos del resultado tienen
 *    la celda vacía (null/N/D) o cero; con UN solo valor ≠ 0 permanece.
 *  · Código y Descripción NO son configurables (no están en el conjunto
 *    ocultable).
 *  · La detección usa los MISMOS umbrales que el formateo visible
 *    (cantidades < 1e-9 y importes < 0,005 = guion «—»): lo que se oculta es
 *    exactamente lo que el usuario ve como «—».
 *  · Reversible: con la opción apagada vuelven TODAS las columnas.
 *  · Filas vacías → nada que ocultar (sin datos no hay conclusión).
 *  · La columna «Valor histórico» NO existe ya en la configuración de
 *    columnas (fase 3 — retirada de la presentación).
 */
import { describe, it, expect } from 'vitest';
import {
  IPV_NUMERIC_TABLE_COLUMNS,
  ipvValuelessColumns,
  ipvVisibleColumnKeys,
} from '@/lib/ipv-ventas/columns';
import type { IpvRow } from '@/lib/ipv-ventas/compute';

function fila(p: Partial<IpvRow>): IpvRow {
  return {
    productId: 'p-1', sku: '1', name: 'Producto', unit: 'un',
    existenciaInicial: null, cantidadesVendidas: 0, valesSalidas: 0, entradas: 0,
    devoluciones: 0, ajustes: 0, transferencias: 0, existenciaFinal: null,
    ventasImporteCup: 0, ventasImporteUsd: 0, ventasCupHistorico: 0,
    hasPeriodMovements: false, incidenceTypes: [], ...p,
  };
}

describe('IPV_NUMERIC_TABLE_COLUMNS — configuración canónica de columnas', () => {
  it('contiene EXACTAMENTE las 10 columnas numéricas en orden, SIN la columna retirada «Valor histórico»', () => {
    expect(IPV_NUMERIC_TABLE_COLUMNS.map((c) => c.key)).toEqual([
      'existenciaInicial', 'cantidadesVendidas', 'valesSalidas', 'entradas',
      'devoluciones', 'ajustes', 'transferencias', 'existenciaFinal',
      'ventasImporteCup', 'ventasImporteUsd',
    ]);
  });
});

describe('ipvValuelessColumns — detección sobre el resultado filtrado', () => {
  it('oculta las columnas que son 0/null en TODOS los productos del conjunto', () => {
    const rows = [
      fila({ productId: 'p1', existenciaInicial: 0, entradas: 50, cantidadesVendidas: 50, existenciaFinal: 0, ventasImporteCup: 2500 }),
      fila({ productId: 'p2', existenciaInicial: 20, existenciaFinal: 20 }),
      fila({ productId: 'p3', existenciaInicial: 5, entradas: 20, cantidadesVendidas: 10, existenciaFinal: 15, ventasImporteCup: 1000 }),
    ];
    const hidden = ipvValuelessColumns(rows);
    expect(hidden.has('valesSalidas')).toBe(true);
    expect(hidden.has('devoluciones')).toBe(true);
    expect(hidden.has('ajustes')).toBe(true);
    expect(hidden.has('transferencias')).toBe(true);
    expect(hidden.has('ventasImporteUsd')).toBe(true);
    // Con valores reales en el subconjunto: permanecen.
    expect(hidden.has('existenciaInicial')).toBe(false);
    expect(hidden.has('existenciaFinal')).toBe(false);
    expect(hidden.has('cantidadesVendidas')).toBe(false);
    expect(hidden.has('entradas')).toBe(false);
    expect(hidden.has('ventasImporteCup')).toBe(false);
  });

  it('con UN solo valor ≠ 0 la columna NO se oculta (regla de la misión §4B.6)', () => {
    const rows = [
      fila({ productId: 'p1' }),
      fila({ productId: 'p2', ventasImporteUsd: 0.01 }), // un centavo: suficiente
    ];
    expect(ipvValuelessColumns(rows).has('ventasImporteUsd')).toBe(false);
  });

  it('usa los MISMOS umbrales que el formateo visible: 0.004 de importe y 1e-10 de cantidad son «sin valor»', () => {
    const rows = [fila({ productId: 'p1', ventasImporteCup: 0.004, cantidadesVendidas: 1e-10 })];
    const hidden = ipvValuelessColumns(rows);
    expect(hidden.has('ventasImporteCup')).toBe(true);  // en pantalla se ve «—»
    expect(hidden.has('cantidadesVendidas')).toBe(true); // en pantalla se ve «—»
  });

  it('los N/D (null) cuentan como celda sin valor, pero un N/D convive con valores reales', () => {
    const rows = [
      fila({ productId: 'p1', existenciaInicial: null, existenciaFinal: 12 }),
      fila({ productId: 'p2', existenciaInicial: null, existenciaFinal: null }),
    ];
    const hidden = ipvValuelessColumns(rows);
    expect(hidden.has('existenciaInicial')).toBe(true);
    expect(hidden.has('existenciaFinal')).toBe(false);
  });

  it('conjunto vacío → nada oculto (sin datos no hay conclusión de «columna vacía»)', () => {
    expect(ipvValuelessColumns([]).size).toBe(0);
  });

  it('la visibilidad se RECALCULA cuando cambia el subconjunto (cambio de período/filtro simulado)', () => {
    const antes = [fila({ productId: 'p1', ventasImporteUsd: 30 })];
    const despues = [fila({ productId: 'p1' })]; // «otro período» sin ventas USD
    expect(ipvValuelessColumns(antes).has('ventasImporteUsd')).toBe(false);
    expect(ipvValuelessColumns(despues).has('ventasImporteUsd')).toBe(true);
  });
});

describe('ipvVisibleColumnKeys — reversibilidad y orden', () => {
  const rows = [
    fila({ productId: 'p1', existenciaInicial: 10, ventasImporteCup: 500 }),
    fila({ productId: 'p2', existenciaInicial: null, existenciaFinal: 3, ventasImporteUsd: 5 }),
  ];

  it('opción apagada → TODAS las columnas (reversible, sin datos alterados)', () => {
    expect(ipvVisibleColumnKeys(rows, false)).toEqual(IPV_NUMERIC_TABLE_COLUMNS.map((c) => c.key));
  });

  it('opción encendida → solo las columnas con algún valor, conservando el orden canónico', () => {
    expect(ipvVisibleColumnKeys(rows, true)).toEqual([
      'existenciaInicial', 'existenciaFinal', 'ventasImporteCup', 'ventasImporteUsd',
    ]);
  });
});
