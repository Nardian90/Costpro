/**
 * commission-engine.ts — Motor de cálculo de comisiones.
 *
 * Responsabilidad: PURE BUSINESS LOGIC. No I/O, no React, no Next.js.
 * Toma ventas + reglas → calcula comisión sugerida.
 *
 * Principios:
 *   - Reproducible: mismo input → mismo output (sin randomness)
 *   - Auditable: devuelve rule_applied_id + snapshot del cálculo
 *   - Sin side-effects: función pura
 *
 * Tipos de comisión (v2 — 2026-07-15):
 *   - percentage_sales: porcentaje sobre base_calculation
 *   - fixed_amount: monto fijo (ignora ventas)
 *   - salary_based: salario fijo (ignora ventas)
 *   - hybrid: salario + porcentaje sobre ventas
 *   - product_specific: monto fijo $ por cada venta de productos específicos
 *     (los productos se asocian vía tabla commission_rule_products;
 *      las ventas de estos productos se EXCLUYEN del cálculo % de otras reglas)
 *   - scale_percentage: porcentaje aplicado a productos cuyo precio unitario
 *     cae en el rango [min_price, max_price] (escalas por precio de producto)
 *
 * Base de cálculo (solo aplica a percentage_sales / hybrid):
 *   - total_sales: cash + transfer
 *   - cash_sales: solo cash
 *   - transfer_sales: solo transfer
 *   - net_sales: total - devoluciones (en esta v1 = total_sales)
 */

export type CommissionType =
  | 'percentage_sales'
  | 'fixed_amount'
  | 'salary_based'
  | 'hybrid'
  | 'product_specific'
  | 'scale_percentage';
export type BaseCalculation = 'total_sales' | 'cash_sales' | 'transfer_sales' | 'net_sales';

export interface WorkerSales {
  worker_id: string;
  sales: {
    cash: number;
    transfer: number;
    total: number;
  };
}

export interface CommissionRule {
  id: string;
  store_id: string;
  worker_id: string | null;
  type: CommissionType;
  value_percent: number | null;
  fixed_value: number | null;
  salary_amount: number | null;
  base_calculation: BaseCalculation;
  priority: number;
  valid_from: string;
  valid_to: string | null;
  // v2 (2026-07-15) — campos para scale_percentage y product_specific
  min_price?: number | null;
  max_price?: number | null;
  product_commission_amount?: number | null;
  // IDs de productos asociados (para type='product_specific').
  // Se carga vía join table commission_rule_products en la API.
  product_ids?: string[];
  // v3 (2026-07-17) — configuración por producto individual.
  // Map de product_id → { amount, mode } que permite que una sola regla
  // product_specific tenga monto y modo distintos por producto.
  // Se carga vía join table commission_rule_products en la API.
  // Si un product_id no está aquí, cae al default product_commission_amount + mode 'per_sale'.
  product_configs?: Record<string, { amount: number | null; mode: 'per_sale' | 'per_unit' }>;
  // v3 (2026-07-17) — modo default para la regla product_specific cuando
  // un producto no tiene override en product_configs.
  // Si es NULL o 'per_sale', comportamiento anterior (monto fijo por venta).
  // Si es 'per_unit', monto × cantidad vendida.
  product_commission_mode?: 'per_sale' | 'per_unit' | null;
}

/**
 * Línea de venta de un producto (para cálculo con reglas por producto/escala).
 * Proviene de transaction_items joined con transactions.
 */
export interface ProductLineItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;     // precio unitario en CUP
  line_total: number;     // quantity * unit_price
  cash_paid: number;      // proporción cobrada en cash
  transfer_paid: number;  // proporción cobrada en transfer
  sale_date: string;
  transaction_id?: string;
}

/**
 * Resultado detallado por producto cuando se aplican reglas product_specific o scale_percentage.
 * Cada entrada indica qué regla se aplicó y qué comisión generó.
 */
export interface ProductCommissionDetail {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  rule_id: string | null;
  rule_type: CommissionType | 'manual' | 'none';
  commission: number;
  excluded_from_percentage: boolean; // true si este producto consumió una regla product_specific
}

export interface CommissionCalculation {
  worker_id: string;
  period: { from: string; to: string };
  sales: {
    cash: number;
    transfer: number;
    total: number;
    base_used: number; // monto sobre el que se aplica la comisión
  };
  rule_applied: CommissionRule | null;
  rule_applied_id: string | null;
  breakdown: {
    percentage_component: number;
    fixed_component: number;
    salary_component: number;
  };
  commission_suggested: number;
  calculation_explanation: string;
}

/**
 * Selecciona la regla aplicable para un worker en una fecha dada.
 * Prioridad: worker-specific > store-default; luego priority DESC.
 */
export function selectApplicableRule(
  rules: CommissionRule[],
  worker_id: string,
  dateInRange: string,
): CommissionRule | null {
  const applicable = rules.filter(r => {
    if (r.worker_id !== null && r.worker_id !== worker_id) return false;
    if (r.valid_from > dateInRange) return false;
    if (r.valid_to !== null && r.valid_to < dateInRange) return false;
    return true;
  });

  if (applicable.length === 0) return null;

  // Ordenar: worker-specific primero, luego priority DESC, luego valid_from DESC
  applicable.sort((a, b) => {
    if (a.worker_id !== null && b.worker_id === null) return -1;
    if (a.worker_id === null && b.worker_id !== null) return 1;
    if (a.priority !== b.priority) return b.priority - a.priority;
    return b.valid_from.localeCompare(a.valid_from);
  });

  return applicable[0];
}

/**
 * Calcula la comisión sugerida para un worker.
 */
export function calculateCommission(
  worker_id: string,
  sales: WorkerSales['sales'],
  rule: CommissionRule | null,
  period: { from: string; to: string },
): CommissionCalculation {
  const cash = Math.max(0, Number(sales.cash) || 0);
  const transfer = Math.max(0, Number(sales.transfer) || 0);
  const total = Math.max(0, Number(sales.total) || cash + transfer);

  const result: CommissionCalculation = {
    worker_id,
    period,
    sales: {
      cash,
      transfer,
      total,
      base_used: 0,
    },
    rule_applied: rule,
    rule_applied_id: rule?.id || null,
    breakdown: {
      percentage_component: 0,
      fixed_component: 0,
      salary_component: 0,
    },
    commission_suggested: 0,
    calculation_explanation: '',
  };

  if (!rule) {
    result.calculation_explanation = 'Sin regla de comisión configurada';
    return result;
  }

  // Calcular base según base_calculation
  let baseUsed = 0;
  let baseLabel = '';
  switch (rule.base_calculation) {
    case 'total_sales':
      baseUsed = total;
      baseLabel = `total (${total.toFixed(2)})`;
      break;
    case 'cash_sales':
      baseUsed = cash;
      baseLabel = `cash (${cash.toFixed(2)})`;
      break;
    case 'transfer_sales':
      baseUsed = transfer;
      baseLabel = `transfer (${transfer.toFixed(2)})`;
      break;
    case 'net_sales':
      baseUsed = total; // v1: net = total (sin devoluciones)
      baseLabel = `net (${total.toFixed(2)})`;
      break;
  }
  result.sales.base_used = baseUsed;

  // Calcular según type
  const explanations: string[] = [];

  switch (rule.type) {
    case 'percentage_sales': {
      const pct = rule.value_percent || 0;
      const commission = (baseUsed * pct) / 100;
      result.breakdown.percentage_component = commission;
      result.commission_suggested = commission;
      explanations.push(`${pct}% sobre ${baseLabel} = ${commission.toFixed(2)}`);
      break;
    }
    case 'fixed_amount': {
      const fixed = rule.fixed_value || 0;
      result.breakdown.fixed_component = fixed;
      result.commission_suggested = fixed;
      explanations.push(`Monto fijo ${fixed.toFixed(2)}`);
      break;
    }
    case 'salary_based': {
      const salary = rule.salary_amount || 0;
      result.breakdown.salary_component = salary;
      result.commission_suggested = salary;
      explanations.push(`Salario fijo ${salary.toFixed(2)}`);
      break;
    }
    case 'hybrid': {
      const salary = rule.salary_amount || 0;
      const pct = rule.value_percent || 0;
      const percentagePart = (baseUsed * pct) / 100;
      const commission = salary + percentagePart;
      result.breakdown.salary_component = salary;
      result.breakdown.percentage_component = percentagePart;
      result.commission_suggested = commission;
      explanations.push(`Salario ${salary.toFixed(2)} + ${pct}% sobre ${baseLabel} = ${percentagePart.toFixed(2)} = ${commission.toFixed(2)}`);
      break;
    }
  }

  result.calculation_explanation = explanations.join(' · ');
  return result;
}

// ════════════════════════════════════════════════════════════════════
// v2 (2026-07-15): Cálculo con reglas por producto y por escala
// ════════════════════════════════════════════════════════════════════

/**
 * Resultado del cálculo avanzado (con line items por producto).
 * Extiende CommissionCalculation con el desglose por producto.
 */
export interface AdvancedCommissionCalculation extends CommissionCalculation {
  /** Detalle por producto: qué regla se aplicó a cada línea y qué comisión generó. */
  product_breakdown?: ProductCommissionDetail[];
  /** Total de ventas que fueron excluidas del cálculo % (consumidas por reglas product_specific). */
  excluded_sales_total?: number;
  /** Modo de cálculo: 'rules' (automático) o 'manual' (el usuario edita por producto). */
  calculation_mode?: 'rules' | 'manual';
}

/**
 * Selecciona la regla product_specific aplicable a un producto dado.
 * Prioridad: worker-specific > store-wide; luego priority DESC.
 *
 * Solo considera reglas de type='product_specific' cuyo product_ids incluye el product_id.
 */
export function selectProductSpecificRule(
  rules: CommissionRule[],
  worker_id: string,
  product_id: string,
  dateInRange: string,
): CommissionRule | null {
  const candidates = rules.filter(r => {
    if (r.type !== 'product_specific') return false;
    if (r.worker_id !== null && r.worker_id !== worker_id) return false;
    if (r.valid_from > dateInRange) return false;
    if (r.valid_to !== null && r.valid_to < dateInRange) return false;
    if (!r.product_ids || r.product_ids.length === 0) return false;
    return r.product_ids.includes(product_id);
  });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (a.worker_id !== null && b.worker_id === null) return -1;
    if (a.worker_id === null && b.worker_id !== null) return 1;
    return b.priority - a.priority;
  });

  return candidates[0];
}

/**
 * Selecciona la regla scale_percentage aplicable a un precio unitario dado.
 * Prioridad: worker-specific > store-wide; luego priority DESC.
 *
 * Solo considera reglas de type='scale_percentage' donde el precio cae en [min_price, max_price].
 */
export function selectScaleRule(
  rules: CommissionRule[],
  worker_id: string,
  unitPrice: number,
  dateInRange: string,
): CommissionRule | null {
  const candidates = rules.filter(r => {
    if (r.type !== 'scale_percentage') return false;
    if (r.worker_id !== null && r.worker_id !== worker_id) return false;
    if (r.valid_from > dateInRange) return false;
    if (r.valid_to !== null && r.valid_to < dateInRange) return false;
    const minOk = r.min_price === null || r.min_price === undefined || unitPrice >= r.min_price;
    const maxOk = r.max_price === null || r.max_price === undefined || unitPrice <= r.max_price;
    return minOk && maxOk;
  });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (a.worker_id !== null && b.worker_id === null) return -1;
    if (a.worker_id === null && b.worker_id !== null) return 1;
    return b.priority - a.priority;
  });

  return candidates[0];
}

/**
 * Calcula la comisión usando reglas avanzadas (product_specific + scale_percentage + default %).
 *
 * Lógica de cálculo (en orden):
 *   1. Para cada línea de producto:
 *      a. ¿Hay regla product_specific para ese producto? → aplica monto fijo $ por venta
 *         → marca la línea como "excluida del cálculo %"
 *      b. Si no, ¿hay regla scale_percentage cuyo rango incluya el precio unitario? → aplica %
 *         sobre el line_total de ese producto
 *   2. Para las líneas NO excluidas y SIN regla scale, se aplica la regla por defecto
 *      (percentage_sales / fixed_amount / salary_based / hybrid) sobre el subtotal.
 *
 * Si no hay line items (productos), cae al comportamiento original (calculateCommission).
 *
 * @param worker_id    ID del trabajador
 * @param sales        Totales agregados {cash, transfer, total}
 * @param lineItems    Lista de productos vendidos (de transaction_items)
 * @param rules        Todas las reglas aplicables (cargadas con product_ids populados)
 * @param period       {from, to}
 * @param dateInRange  Fecha de referencia para filtrar reglas vigentes (típicamente = period.to)
 */
export function calculateCommissionWithProducts(
  worker_id: string,
  sales: { cash: number; transfer: number; total: number },
  lineItems: ProductLineItem[],
  rules: CommissionRule[],
  period: { from: string; to: string },
  dateInRange: string = period.to,
): AdvancedCommissionCalculation {
  // Si no hay line items, delegar al cálculo simple
  if (!lineItems || lineItems.length === 0) {
    const defaultRule = selectApplicableRule(rules, worker_id, dateInRange);
    const base = calculateCommission(worker_id, sales, defaultRule, period);
    return { ...base, calculation_mode: 'rules' };
  }

  const productBreakdown: ProductCommissionDetail[] = [];
  let productSpecificTotal = 0;
  let scaleTotal = 0;
  let excludedSalesTotal = 0;
  let remainingSubtotal = 0;

  // Procesar cada línea
  for (const item of lineItems) {
    // 1. ¿Producto específico?
    const pRule = selectProductSpecificRule(rules, worker_id, item.product_id, dateInRange);
    // v3 (2026-07-17): condición robustecida — una regla aplica si tiene monto default
    // (product_commission_amount) O si tiene overrides por producto (product_configs).
    // Antes solo se verificaba product_commission_amount != null, lo que hacía que
    // reglas v3 puras (solo product_configs, sin default) fueran ignoradas silenciosamente.
    const hasProductConfig = pRule?.product_configs?.[item.product_id] != null;
    if (pRule && (pRule.product_commission_amount != null || hasProductConfig)) {
      // v3 (2026-07-17): resolver configuración específica del producto si existe override
      const productConfig = pRule.product_configs?.[item.product_id];
      const effectiveAmount = productConfig?.amount != null
        ? Number(productConfig.amount)
        : Number(pRule.product_commission_amount) || 0;
      const effectiveMode = productConfig?.mode || pRule.product_commission_mode || 'per_sale';

      // Calcular comisión según modo:
      // - per_sale: monto fijo por venta (sin importar cantidad) — comportamiento original
      // - per_unit: monto × cantidad vendida (ej: 1000 CUP × 3 paneles = 3000 CUP)
      const commission = effectiveMode === 'per_unit'
        ? effectiveAmount * item.quantity
        : effectiveAmount;

      productSpecificTotal += commission;
      excludedSalesTotal += item.line_total;

      productBreakdown.push({
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: item.line_total,
        rule_id: pRule.id,
        rule_type: 'product_specific',
        commission,
        excluded_from_percentage: true,
      });
      continue;
    }

    // 2. ¿Escala por precio?
    const sRule = selectScaleRule(rules, worker_id, item.unit_price, dateInRange);
    if (sRule && sRule.value_percent != null) {
      const pct = Number(sRule.value_percent) || 0;
      const commission = (item.line_total * pct) / 100;
      scaleTotal += commission;

      productBreakdown.push({
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: item.line_total,
        rule_id: sRule.id,
        rule_type: 'scale_percentage',
        commission,
        excluded_from_percentage: false,
      });
      continue;
    }

    // 3. No hay regla específica — se acumula al subtotal para la regla por defecto
    remainingSubtotal += item.line_total;
    productBreakdown.push({
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      line_total: item.line_total,
      rule_id: null,
      rule_type: 'none',
      commission: 0,
      excluded_from_percentage: false,
    });
  }

  // 4. Aplicar regla por defecto sobre el subtotal restante
  const defaultRule = selectApplicableRule(
    rules.filter(r => r.type !== 'product_specific' && r.type !== 'scale_percentage'),
    worker_id,
    dateInRange,
  );

  let defaultCommission = 0;
  let defaultExplanation = '';
  if (defaultRule) {
    // Calcular base según base_calculation, pero usando solo el subtotal restante
    // (no las ventas totales, porque las product_specific ya se comisionaron aparte)
    let baseUsed = remainingSubtotal;
    if (defaultRule.base_calculation === 'cash_sales') {
      // proporción cash del subtotal restante
      const ratio = sales.total > 0 ? sales.cash / sales.total : 0;
      baseUsed = remainingSubtotal * ratio;
    } else if (defaultRule.base_calculation === 'transfer_sales') {
      const ratio = sales.total > 0 ? sales.transfer / sales.total : 0;
      baseUsed = remainingSubtotal * ratio;
    }

    switch (defaultRule.type) {
      case 'percentage_sales': {
        const pct = defaultRule.value_percent || 0;
        defaultCommission = (baseUsed * pct) / 100;
        defaultExplanation = `${pct}% sobre ${baseUsed.toFixed(2)} (subtotal no excluido) = ${defaultCommission.toFixed(2)}`;
        break;
      }
      case 'hybrid': {
        const salary = defaultRule.salary_amount || 0;
        const pct = defaultRule.value_percent || 0;
        const pctPart = (baseUsed * pct) / 100;
        defaultCommission = salary + pctPart;
        defaultExplanation = `Salario ${salary.toFixed(2)} + ${pct}% sobre ${baseUsed.toFixed(2)} = ${defaultCommission.toFixed(2)}`;
        break;
      }
      case 'fixed_amount': {
        defaultCommission = defaultRule.fixed_value || 0;
        defaultExplanation = `Monto fijo ${defaultCommission.toFixed(2)}`;
        break;
      }
      case 'salary_based': {
        defaultCommission = defaultRule.salary_amount || 0;
        defaultExplanation = `Salario fijo ${defaultCommission.toFixed(2)}`;
        break;
      }
    }

    // Marcar las líneas "none" con la regla por defecto aplicada proporcionalmente
    // (solo para mostrar al usuario — el cálculo es sobre el subtotal)
    for (const pb of productBreakdown) {
      if (pb.rule_type === 'none' && defaultRule) {
        pb.rule_id = defaultRule.id;
        pb.rule_type = defaultRule.type;
        // Comisión proporcional al line_total del subtotal restante
        if (remainingSubtotal > 0) {
          pb.commission = defaultCommission * (pb.line_total / remainingSubtotal);
        }
      }
    }
  }

  const totalCommission = productSpecificTotal + scaleTotal + defaultCommission;

  const explanations: string[] = [];
  if (productSpecificTotal > 0) {
    const count = productBreakdown.filter(p => p.rule_type === 'product_specific').length;
    explanations.push(`${count} producto(s) con regla específica: ${productSpecificTotal.toFixed(2)}`);
  }
  if (scaleTotal > 0) {
    const count = productBreakdown.filter(p => p.rule_type === 'scale_percentage').length;
    explanations.push(`${count} producto(s) en escala de precio: ${scaleTotal.toFixed(2)}`);
  }
  if (defaultCommission > 0) {
    explanations.push(defaultExplanation);
  }
  if (excludedSalesTotal > 0) {
    explanations.push(`Excluido del %: ${excludedSalesTotal.toFixed(2)}`);
  }

  const result: AdvancedCommissionCalculation = {
    worker_id,
    period,
    sales: {
      cash: sales.cash,
      transfer: sales.transfer,
      total: sales.total,
      base_used: remainingSubtotal,
    },
    rule_applied: defaultRule,
    rule_applied_id: defaultRule?.id || null,
    breakdown: {
      percentage_component: scaleTotal,
      fixed_component: defaultRule?.type === 'fixed_amount' ? defaultCommission : 0,
      salary_component: defaultRule?.type === 'salary_based' || defaultRule?.type === 'hybrid'
        ? (defaultRule.salary_amount || 0) : 0,
    },
    commission_suggested: totalCommission,
    calculation_explanation: explanations.length > 0
      ? explanations.join(' · ')
      : 'Sin reglas aplicables a los productos vendidos',
    product_breakdown: productBreakdown,
    excluded_sales_total: excludedSalesTotal,
    calculation_mode: 'rules',
  };

  return result;
}

/**
 * Construye un cálculo en modo manual (sin reglas) a partir de comisiones
 * editadas por producto por el usuario.
 *
 * @param worker_id
 * @param sales         Totales agregados {cash, transfer, total}
 * @param lineItems     Líneas de producto vendidas
 * @param manualCommissions  Array paralelo a lineItems con la comisión $ que el usuario asignó a cada producto
 * @param period
 */
export function buildManualCommissionCalculation(
  worker_id: string,
  sales: { cash: number; transfer: number; total: number },
  lineItems: ProductLineItem[],
  manualCommissions: number[],
  period: { from: string; to: string },
): AdvancedCommissionCalculation {
  const productBreakdown: ProductCommissionDetail[] = lineItems.map((item, idx) => ({
    product_id: item.product_id,
    product_name: item.product_name,
    quantity: item.quantity,
    unit_price: item.unit_price,
    line_total: item.line_total,
    rule_id: null,
    rule_type: 'manual' as const,
    commission: Number(manualCommissions[idx]) || 0,
    excluded_from_percentage: false,
  }));

  const totalCommission = productBreakdown.reduce((sum, p) => sum + p.commission, 0);

  return {
    worker_id,
    period,
    sales: {
      cash: sales.cash,
      transfer: sales.transfer,
      total: sales.total,
      base_used: sales.total,
    },
    rule_applied: null,
    rule_applied_id: null,
    breakdown: {
      percentage_component: 0,
      fixed_component: 0,
      salary_component: 0,
    },
    commission_suggested: totalCommission,
    calculation_explanation: `Comisión manual: ${lineItems.length} producto(s), total ${totalCommission.toFixed(2)} CUP`,
    product_breakdown: productBreakdown,
    excluded_sales_total: 0,
    calculation_mode: 'manual',
  };
}

/**
 * Helper para generar el breakdown JSONB que se guarda en commission_payments.
 * Permite reproducir el cálculo posteriormente.
 */
export function buildBreakdownSnapshot(
  calc: CommissionCalculation,
  triggeredBy: string,
): Record<string, unknown> {
  const advanced = calc as AdvancedCommissionCalculation;
  return {
    calculated_at: new Date().toISOString(),
    calculated_by: triggeredBy,
    period: calc.period,
    sales: calc.sales,
    rule_applied: calc.rule_applied
      ? {
          id: calc.rule_applied.id,
          type: calc.rule_applied.type,
          value_percent: calc.rule_applied.value_percent,
          fixed_value: calc.rule_applied.fixed_value,
          salary_amount: calc.rule_applied.salary_amount,
          base_calculation: calc.rule_applied.base_calculation,
          priority: calc.rule_applied.priority,
          valid_from: calc.rule_applied.valid_from,
          valid_to: calc.rule_applied.valid_to,
          // v2: incluir campos avanzados
          min_price: (calc.rule_applied as CommissionRule).min_price,
          max_price: (calc.rule_applied as CommissionRule).max_price,
          product_commission_amount: (calc.rule_applied as CommissionRule).product_commission_amount,
        }
      : null,
    breakdown: calc.breakdown,
    commission_suggested: calc.commission_suggested,
    calculation_explanation: calc.calculation_explanation,
    // v2: snapshot del desglose por producto
    calculation_mode: advanced.calculation_mode,
    product_breakdown: advanced.product_breakdown,
    excluded_sales_total: advanced.excluded_sales_total,
  };
}
