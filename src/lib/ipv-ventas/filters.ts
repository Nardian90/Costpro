/**
 * IPV — Ingresos por Ventas: FILTROS DE RESULTADOS (petición 2026-11-06,
 * ampliada misión 2026-11-24 fase 4A: filtro de movimientos de TRES estados).
 *
 * FILTRO DE MOVIMIENTOS — selección exclusiva (Todos · Con movimiento · Sin
 * movimiento):
 *  · «Con movimiento»: el producto registró cantidad ≠ 0 en el período en AL
 *    MENOS una de las columnas Vendidas, VS (vales de salida), Entradas o
 *    Devoluciones. Un producto con Ei=0, entradas 50, vendidas 50 y Ef=0 SÍ
 *    aparece: entró y salió completamente del inventario (Caso A obligatorio).
 *    Las columnas Ajustes y Transferencias NO cuentan como movimiento
 *    comercial según el criterio solicitado (quedan fuera del predicado a
 *    propósito — documentado aquí y en los tests).
 *  · «Sin movimiento»: negación EXACTA del mismo predicado contable
 *    (ipvRowHasMovement) — sin criterios nuevos: lo que «Con movimiento»
 *    incluye, «Sin movimiento» excluye, y viceversa. Ningún producto se
 *    pierde: Con ∪ Sin = Todos.
 *  · «Todos»: sin filtro (identidad — la MISMA lista, cero costo).
 *
 * FILTRO ADICIONAL «Existencia final > 0»: existencia final ESTRICTAMENTE
 * mayor que cero. Excluye 0 y negativos; funciona con decimales (0.5,
 * 0.000001 sí; −0.25 no). N/D (null, producto sin ledger) NO cumple.
 *
 * COMPOSICIÓN: el filtro de movimientos y «Existencia final > 0» se combinan
 * en AND (Caso E). «Todos» + sin Ef>0 = el IPV habitual.
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

/** Estado del filtro de movimientos (selección exclusiva — fase 4A). */
export type IpvMovimientoFilter = 'todos' | 'con' | 'sin';

export interface IpvResultFilters {
  /** Todos · Con movimiento · Sin movimiento (criterio contable intacto). */
  movimiento: IpvMovimientoFilter;
  /** «Existencia final > 0»: estricto, decimales incluidos. */
  existenciaFinalPositiva: boolean;
}

export const IPV_FILTERS_OFF: IpvResultFilters = {
  movimiento: 'todos',
  existenciaFinalPositiva: false,
};

/** Etiquetas canónicas de los filtros (chips, badge, aria-live, tests). */
export const IPV_FILTER_LABELS = {
  conMovimiento: 'Con movimiento',
  sinMovimiento: 'Sin movimiento',
  existenciaFinalPositiva: 'Existencia final > 0',
} as const;

/**
 * ¿El producto tuvo movimiento comercial en el período?
 * Columnas que cuentan (criterio solicitado, en este orden exacto):
 * Vendidas · VS (vales de salida) · Entradas · Devoluciones.
 * Los valores son los del IPV (netos del período, ya normalizados a 6
 * decimales por roundQ) → comparación exacta ≠ 0, sin redondeo aquí.
 * PREDICADO CONTABLE INTACTO: ni «Con movimiento» ni «Sin movimiento»
 * alteran esta definición (misión 2026-11-24: comportamiento actual sin
 * modificar los criterios contables).
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
  return f.movimiento !== 'todos' || f.existenciaFinalPositiva;
}

/**
 * Aplica los filtros activos sobre las filas del IPV.
 * AND entre el filtro de movimientos y «Existencia final > 0»;
 * sin filtros → la MISMA lista (identidad).
 */
export function applyIpvResultFilters(rows: IpvRow[], f: IpvResultFilters): IpvRow[] {
  if (!ipvAnyFilterActive(f)) return rows;
  return rows.filter((r) => {
    if (f.movimiento === 'con' && !ipvRowHasMovement(r)) return false;
    if (f.movimiento === 'sin' && ipvRowHasMovement(r)) return false;
    if (f.existenciaFinalPositiva && !ipvRowHasPositiveFinalStock(r)) return false;
    return true;
  });
}

/** Etiquetas de los filtros activos, para la indicación visual y aria-live. */
export function ipvActiveFilterLabels(f: IpvResultFilters): string[] {
  const out: string[] = [];
  if (f.movimiento === 'con') out.push(IPV_FILTER_LABELS.conMovimiento);
  if (f.movimiento === 'sin') out.push(IPV_FILTER_LABELS.sinMovimiento);
  if (f.existenciaFinalPositiva) out.push(IPV_FILTER_LABELS.existenciaFinalPositiva);
  return out;
}
