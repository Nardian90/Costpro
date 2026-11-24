/**
 * IPV — Ingresos por Ventas: CONFIGURACIÓN CANÓNICA DE COLUMNAS NUMÉRICAS
 * (misión 2026-11-24, fase 4B «Ocultar columnas sin valores»).
 *
 * UNA sola fuente de verdad para tabla, PDF y Excel:
 *   · Orden canónico de las columnas numéricas (el «Valor histórico sin moneda
 *     verificable» SALIÓ de la presentación — fase 3 de la misión; la magnitud
 *     interna sigue calculándose y una venta sin evidencia de cobro se señala
 *     con la incidencia SALE_WITHOUT_PAYMENT_EVIDENCE, no con una columna).
 *   · Detección de columnas SIN VALORES SIGNIFICATIVOS sobre el conjunto de
 *     datos FILTRADO (nunca sobre todo el histórico de la tienda): una columna
 *     se oculta solo si TODOS los productos del resultado tienen la celda
 *     vacía (null / N/D) o cero. Con UN solo valor distinto de cero la columna
 *     permanece. Código y Descripción NO son configurables: siempre visibles.
 *   · Umbrales de «sin valor» idénticos a los del formateo visible
 *     (format.ts): cantidades < 1e-9 y importes < 0,005 se muestran como «—»,
 *     así la detección coincide EXACTAMENTE con lo que ve el usuario.
 *
 * La función es PURA y determinista: al cambiar período, tienda, búsqueda o
 * filtro de movimientos el subconjunto cambia y la visibilidad se recalcula.
 * No modifica datos ni cálculos: solo decide qué columnas se presentan.
 */

import type { IpvRow } from './compute';
import { IPV_COLUMN_LABELS } from './format';

export interface IpvNumericColumnDef {
  /** Clave del campo de IpvRow. */
  key: IpvNumericColumnKey;
  /** Etiqueta completa (Excel, aria). */
  label: string;
  /** Etiqueta compacta multi-línea (encabezado PDF). */
  short: string;
  /** Naturaleza del valor — define el umbral de «sin valor». */
  kind: 'qty' | 'money';
}

export type IpvNumericColumnKey =
  | 'existenciaInicial'
  | 'cantidadesVendidas'
  | 'valesSalidas'
  | 'entradas'
  | 'devoluciones'
  | 'ajustes'
  | 'transferencias'
  | 'existenciaFinal'
  | 'ventasImporteCup'
  | 'ventasImporteUsd';

/** Columnas numéricas del IPV en su orden canónico (sin la retirada «Valor hist.»). */
export const IPV_NUMERIC_TABLE_COLUMNS: readonly IpvNumericColumnDef[] = [
  { key: 'existenciaInicial', label: IPV_COLUMN_LABELS.existenciaInicial, short: 'Exist.\ninicial', kind: 'qty' },
  { key: 'cantidadesVendidas', label: IPV_COLUMN_LABELS.cantidadesVendidas, short: 'Cant.\nvendidas', kind: 'qty' },
  { key: 'valesSalidas', label: IPV_COLUMN_LABELS.valesSalidas, short: 'Vales\nsalidas', kind: 'qty' },
  { key: 'entradas', label: IPV_COLUMN_LABELS.entradas, short: 'Entradas', kind: 'qty' },
  { key: 'devoluciones', label: IPV_COLUMN_LABELS.devoluciones, short: 'Devolu-\nciones', kind: 'qty' },
  { key: 'ajustes', label: IPV_COLUMN_LABELS.ajustes, short: 'Ajustes', kind: 'qty' },
  { key: 'transferencias', label: IPV_COLUMN_LABELS.transferencias, short: 'Transf.', kind: 'qty' },
  { key: 'existenciaFinal', label: IPV_COLUMN_LABELS.existenciaFinal, short: 'Exist.\nfinal', kind: 'qty' },
  { key: 'ventasImporteCup', label: IPV_COLUMN_LABELS.ventasImporteCup, short: 'Ventas CUP\n(cobrado)', kind: 'money' },
  { key: 'ventasImporteUsd', label: IPV_COLUMN_LABELS.ventasImporteUsd, short: 'Ventas USD\n(cobrado)', kind: 'money' },
] as const;

/** Umbral de «celda sin valor» — idéntico al formateo (guion «—» de format.ts). */
const QTY_EPS = 1e-9;
const MONEY_EPS = 0.005;

/** ¿La celda aporta un valor significativo (no null, no cero)? */
function cellHasValue(row: IpvRow, key: IpvNumericColumnKey): boolean {
  const v = row[key];
  if (v === null || v === undefined) return false;
  const eps = IPV_NUMERIC_TABLE_COLUMNS.find((c) => c.key === key)?.kind === 'money' ? MONEY_EPS : QTY_EPS;
  return Math.abs(v) > eps;
}

/**
 * Columnas SIN ningún valor significativo en el subconjunto de filas dado.
 * Devuelve el conjunto de claves a OCULTAR. Con un solo valor ≠ 0 (o N/D que
 * realmente existe como no-cero) la columna se mantiene visible.
 * Filas vacías → nada que ocultar (todas las columnas visibles: sin datos no
 * hay conclusión de «columna vacía»).
 */
export function ipvValuelessColumns(rows: IpvRow[]): Set<IpvNumericColumnKey> {
  const hidden = new Set<IpvNumericColumnKey>();
  if (rows.length === 0) return hidden;
  for (const col of IPV_NUMERIC_TABLE_COLUMNS) {
    if (!rows.some((r) => cellHasValue(r, col.key))) hidden.add(col.key);
  }
  return hidden;
}

/**
 * Claves visibles tras aplicar la opción «Ocultar columnas sin valores».
 * `hideEmpty=false` → TODAS las columnas (opción desactivada = reversible).
 */
export function ipvVisibleColumnKeys(rows: IpvRow[], hideEmpty: boolean): IpvNumericColumnKey[] {
  if (!hideEmpty) return IPV_NUMERIC_TABLE_COLUMNS.map((c) => c.key);
  const hidden = ipvValuelessColumns(rows);
  return IPV_NUMERIC_TABLE_COLUMNS.map((c) => c.key).filter((k) => !hidden.has(k));
}
