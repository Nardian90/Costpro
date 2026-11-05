/**
 * IPV — Ingresos por Ventas: FILTROS DE RESULTADOS (petición 2026-11-06).
 *
 * Dos filtros de FILAS sobre el dataset real del IPV (las filas devueltas por
 * /api/ipv-ventas — valores EXACTOS calculados en servidor; nunca sobre
 * aproximaciones ni valores recalculados en la interfaz):
 *
 *  · «Con movimiento»: el producto registró cantidad ≠ 0 en el período en AL
 *    MENOS una de las columnas Vendidas, VS (vales de salida), Entradas o
 *    Devoluciones. Un producto con Ei=0, entradas 50, vendidas 50 y Ef=0 SÍ
 *    aparece: entró y salió completamente del inventario (Caso A obligatorio).
 *    Las columnas Ajustes y Transferencias NO cuentan como movimiento
 *    comercial según el criterio solicitado (quedan fuera del predicado a
 *    propósito — documentado aquí y en los tests).
 *  · «Existencia final > 0»: existencia final ESTRICTAMENTE mayor que cero.
 *    Excluye 0 y negativos; funciona con decimales (0.5, 0.000001 sí; −0.25
 *    no). N/D (null, producto sin ledger) NO cumple el filtro.
 *
 * COMPOSICIÓN: los dos filtros se combinan en AND (Caso E). Con ambos
 * activos solo se muestran productos con movimiento Y existencia final
 * positiva. Sin filtros activos el resultado es el IPV habitual — la lista
 * devuelta es la MISMA referencia (cero costo).
 *
 * GARANTÍAS (petición §4/§5):
 *  · NO modifica fórmulas, reglas de negocio ni cálculos del IPV — solo
 *    selecciona filas ya calculadas por computeIpv() en el servidor.
 *  · NO redondea cantidades durante el filtrado: los valores llegan
 *    normalizados a 6 decimales (roundQ) y los predicados comparan exacto.
 *  · Tabla, PDF y Excel consumen el MISMO subconjunto filtrado (la vista pasa
 *    por aquí antes de las tres representaciones) → resultados consistentes.
 */

import type { IpvRow } from './compute';

export interface IpvResultFilters {
  /** «Con movimiento»: Vendidas/VS/Entradas/Devoluciones ≠ 0. */
  conMovimiento: boolean;
  /** «Existencia final > 0»: estricto, decimales incluidos. */
  existenciaFinalPositiva: boolean;
}

export const IPV_FILTERS_OFF: IpvResultFilters = {
  conMovimiento: false,
  existenciaFinalPositiva: false,
};

/** Etiquetas canónicas de los filtros (chips, badge, aria-live, tests). */
export const IPV_FILTER_LABELS = {
  conMovimiento: 'Con movimiento',
  existenciaFinalPositiva: 'Existencia final > 0',
} as const;

/**
 * ¿El producto tuvo movimiento comercial en el período?
 * Columnas que cuentan (criterio solicitado, en este orden exacto):
 * Vendidas · VS (vales de salida) · Entradas · Devoluciones.
 * Los valores son los del IPV (netos del período, ya normalizados a 6
 * decimales por roundQ) → comparación exacta ≠ 0, sin redondeo aquí.
 */
export function ipvRowHasMovement(r: IpvRow): boolean {
  return (
    r.cantidadesVendidas !== 0 ||
    r.valesSalidas !== 0 ||
    r.entradas !== 0 ||
    r.devoluciones !== 0
  );
}

/**
 * ¿Existencia final estrictamente > 0? N/D (null) no cumple: un producto sin
 * ledger no tiene existencia final demostrable, no se inventa.
 */
export function ipvRowHasPositiveFinalStock(r: IpvRow): boolean {
  return r.existenciaFinal !== null && r.existenciaFinal > 0;
}

/** ¿Hay al menos un filtro activo? */
export function ipvAnyFilterActive(f: IpvResultFilters): boolean {
  return f.conMovimiento || f.existenciaFinalPositiva;
}

/**
 * Aplica los filtros activos sobre las filas del IPV.
 * AND entre los activos; sin filtros → la MISMA lista (identidad).
 */
export function applyIpvResultFilters(rows: IpvRow[], f: IpvResultFilters): IpvRow[] {
  if (!ipvAnyFilterActive(f)) return rows;
  return rows.filter((r) =>
    (!f.conMovimiento || ipvRowHasMovement(r)) &&
    (!f.existenciaFinalPositiva || ipvRowHasPositiveFinalStock(r)),
  );
}

/** Etiquetas de los filtros activos, para la indicación visual y aria-live. */
export function ipvActiveFilterLabels(f: IpvResultFilters): string[] {
  const out: string[] = [];
  if (f.conMovimiento) out.push(IPV_FILTER_LABELS.conMovimiento);
  if (f.existenciaFinalPositiva) out.push(IPV_FILTER_LABELS.existenciaFinalPositiva);
  return out;
}
