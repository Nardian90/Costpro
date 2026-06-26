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
 * Tipos de comisión:
 *   - percentage_sales: porcentaje sobre base_calculation
 *   - fixed_amount: monto fijo (ignora ventas)
 *   - salary_based: salario fijo (ignora ventas)
 *   - hybrid: salario + porcentaje sobre ventas
 *
 * Base de cálculo:
 *   - total_sales: cash + transfer
 *   - cash_sales: solo cash
 *   - transfer_sales: solo transfer
 *   - net_sales: total - devoluciones (en esta v1 = total_sales)
 */

export type CommissionType = 'percentage_sales' | 'fixed_amount' | 'salary_based' | 'hybrid';
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

/**
 * Helper para generar el breakdown JSONB que se guarda en commission_payments.
 * Permite reproducir el cálculo posteriormente.
 */
export function buildBreakdownSnapshot(
  calc: CommissionCalculation,
  triggeredBy: string,
): Record<string, unknown> {
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
        }
      : null,
    breakdown: calc.breakdown,
    commission_suggested: calc.commission_suggested,
    calculation_explanation: calc.calculation_explanation,
  };
}
