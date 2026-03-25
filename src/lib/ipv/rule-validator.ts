import { MatchingRule } from '../dexie';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class MatchingRuleValidator {
  static validateRule(rule: MatchingRule): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validar meta-datos por tipo
    switch (rule.tipo) {
      case 'PRICE_FLEX':
        if (!rule.meta) {
          errors.push('PRICE_FLEX requiere meta-datos');
        } else {
          const { max_variation_percent, max_variation_cents } = rule.meta;

          if (max_variation_percent === undefined) {
            errors.push('max_variation_percent es requerido');
          } else if (max_variation_percent > 50) {
            warnings.push(`max_variation_percent: ${max_variation_percent}% es muy alto (>50%)`);
          }

          if (max_variation_cents === undefined) {
            errors.push('max_variation_cents es requerido');
          }
        }
        break;

      case 'TOLERANCE':
        if (!rule.meta?.tolerance_cents) {
          errors.push('tolerance_cents es requerido');
        } else if (rule.meta.tolerance_cents > 500) {
          warnings.push(`tolerance_cents: ${rule.meta.tolerance_cents} es muy alto (>5 CUP)`);
        }
        break;

      case 'CASH_FILL':
        if (!rule.meta?.daily_limit) {
          warnings.push('daily_limit no especificado (sin límite)');
        }
        if (rule.activo === true) {
          warnings.push('CASH_FILL está activado. Asegúrese de que es intencional.');
        }
        break;

      case 'STOCK_LIMIT':
        if (rule.meta?.allow_negative === true) {
          warnings.push('allow_negative: true - permitirá stock negativo');
        }
        break;
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  static validateRuleSet(rules: MatchingRule[]): ValidationResult {
    const allErrors: string[] = [];
    const allWarnings: string[] = [];

    // Validar cada regla
    for (const rule of rules) {
      const result = this.validateRule(rule);
      allErrors.push(...result.errors.map(e => `[${rule.tipo}] ${e}`));
      allWarnings.push(...result.warnings.map(w => `[${rule.tipo}] ${w}`));
    }

    // Validar conjunto
    const hardRefRules = rules.filter(r => r.tipo === 'HARD_REF' && r.activo);
    if (hardRefRules.length > 1) {
      const priorities = hardRefRules.map(r => r.prioridad);
      if (new Set(priorities).size !== priorities.length) {
        allWarnings.push('Múltiples reglas HARD_REF activas con misma prioridad (comportamiento impredecible)');
      }
    }

    return {
      valid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings
    };
  }
}
