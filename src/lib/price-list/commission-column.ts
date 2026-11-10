/**
 * price-list/commission-column.ts — CP-PRODUCT-COMMISSION-001 TAREA 2.
 *
 * Columna «Comisión» del Listado de precios: traduce las reglas de comisión
 * REALES de la tienda a una presentación inequívoca por producto, SIN crear
 * ninguna fórmula propia (misión §2.2): reutiliza las mismas funciones de
 * resolución del motor de Trabajadores y Comisiones
 * (`selectProductSpecificRule` y `selectScaleRule` de commission-engine.ts) y
 * la misma fuente de datos (`commission_rules` con `product_configs` y
 * fallback `product_commission_amount`).
 *
 * Semántica de presentación (misión §2.3):
 *  · Regla product_specific de TIENDA → importe fijo configurado con unidad
 *    de aplicación («{n} CUP/venta» o «{n} CUP/unidad»). Un cero configurado
 *    se muestra como cero (comisión cero LEGÍTIMA, ≠ «Sin regla»).
 *  · Regla porcentual de tienda (scale_percentage cuyo rango incluye el
 *    precio, o percentage_sales) → el PORCENTAJE, sin conversión de moneda.
 *  · Reglas solo por importe global (fixed_amount/salary/hybrid) → «según
 *    venta» (el motor las aplica al total de la venta, no por producto).
 *  · Si existen reglas por TRABAJADOR (worker_id ≠ null) que cambiarían el
 *    valor → el valor de tienda se etiqueta «(base tienda)»; si SOLO hay
 *    reglas por trabajador → «según trabajador» (jamás un valor universal).
 *  · Sin regla → «Sin regla» (diferente de cero y de «según…»).
 */
import {
  selectProductSpecificRule,
  selectScaleRule,
  type CommissionRule,
} from '@/lib/commission-engine';

export type CommissionColumnKind =
  | 'fixed_per_sale'
  | 'fixed_per_unit'
  | 'percent'
  | 'percent_scale'
  | 'worker_dependent'
  | 'sale_dependent'
  | 'none';

export interface ProductCommissionPresentation {
  kind: CommissionColumnKind;
  /** Texto listo para el documento (etiqueta inequívoca). */
  label: string;
  /** Importe por unidad SOLO cuando es calculable e inequívoco (CUP, motor). */
  amountPerUnit: number | null;
  /** Porcentaje aplicable, si la regla es porcentual. */
  percent: number | null;
  ruleId: string | null;
}

const CURRENCY = 'CUP'; // el motor de comisiones trabaja en CUP (unit_price en CUP)

function fmt(n: number): string {
  return new Intl.NumberFormat('es-CU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function isVigente(r: CommissionRule, date: string): boolean {
  return r.valid_from <= date && (r.valid_to === null || r.valid_to === undefined || r.valid_to >= date);
}

export type CommissionValueFilter = 'all' | 'gt0' | 'eq0' | 'unset';

/**
 * TAREA 3 (§3.1-§3.2): criterio puro del filtro «Comisión» de Reglas por
 * producto. Los valores SIN regla configurada (NULL en el modelo) son una
 * categoría PROPIA ('unset') — no se convierten en cero.
 */
export function matchesCommissionFilter(
  effectiveAmount: number | null,
  filter: CommissionValueFilter,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'gt0') return effectiveAmount !== null && effectiveAmount > 0;
  if (filter === 'eq0') return effectiveAmount !== null && effectiveAmount === 0;
  return effectiveAmount === null; // 'unset': sin regla configurada
}

/**
 * Resuelve la presentación de la comisión de UN producto con las reglas
 * vigentes de la tienda. `rules` debe venir de la API de comisiones de la
 * tienda (con product_ids/product_configs populados) — la MISMA carga que
 * usan el catálogo «Por producto» y el motor de cálculo de pagos.
 */
export function resolveProductCommission(
  rules: readonly CommissionRule[],
  productId: string,
  unitPrice: number,
  date: string,
): ProductCommissionPresentation {
  const vigentes = rules.filter((r) => isVigente(r, date));
  const storeRules = vigentes.filter((r) => r.worker_id === null);
  const workerSpecific = vigentes.filter((r) => r.worker_id !== null);

  // 1) Regla product_specific de TIENDA (misma resolución del motor,
  //    worker_id null = regla de tienda; priority DESC dentro del engine).
  const ps = selectProductSpecificRule(storeRules as CommissionRule[], '', productId, date);
  if (ps) {
    const cfg = ps.product_configs?.[productId];
    const amount = cfg?.amount != null ? cfg.amount : ps.product_commission_amount;
    const mode = cfg?.mode || ps.product_commission_mode || 'per_sale';
    if (amount != null) {
      const hasWorkerRules = workerSpecific.length > 0;
      const base = hasWorkerRules ? ' (base tienda)' : '';
      if (mode === 'per_unit') {
        return {
          kind: 'fixed_per_unit',
          label: `${fmt(amount)} ${CURRENCY}/unidad${base}`,
          amountPerUnit: amount,
          percent: null,
          ruleId: ps.id,
        };
      }
      return {
        kind: 'fixed_per_sale',
        label: `${fmt(amount)} ${CURRENCY}/venta${base}`,
        amountPerUnit: amount,
        percent: null,
        ruleId: ps.id,
      };
    }
  }

  // 2) Porcentual de tienda: primero escala aplicable al precio unitario
  //    (misma selección que el motor para una línea), luego % general.
  const scale = selectScaleRule(storeRules as CommissionRule[], '', unitPrice, date);
  const percentRule = scale ?? storeRules.find((r) => r.type === 'percentage_sales' && r.value_percent != null);
  if (percentRule && percentRule.value_percent != null) {
    const hasWorkerRules = workerSpecific.length > 0;
    const base = hasWorkerRules ? ' (base tienda)' : '';
    return {
      kind: scale ? 'percent_scale' : 'percent',
      label: `${fmt(percentRule.value_percent)}%${base}`,
      amountPerUnit: null,
      percent: percentRule.value_percent,
      ruleId: percentRule.id,
    };
  }

  // 3) Reglas de tienda solo por importe global (fixed/salary/hybrid): el
  //    motor las aplica al TOTAL de la venta → no definibles por producto.
  if (storeRules.length > 0) {
    return { kind: 'sale_dependent', label: 'Según venta', amountPerUnit: null, percent: null, ruleId: null };
  }

  // 4) Solo reglas por trabajador: jamás se inventa un valor universal.
  if (workerSpecific.length > 0) {
    return { kind: 'worker_dependent', label: 'Según trabajador', amountPerUnit: null, percent: null, ruleId: null };
  }

  // 5) Sin regla de comisión configurada (≠ cero configurado).
  return { kind: 'none', label: 'Sin regla', amountPerUnit: null, percent: null, ruleId: null };
}
