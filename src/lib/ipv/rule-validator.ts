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

    switch (rule.tipo) {
      case 'PRICE_FLEX':
        if (!rule.meta) {
          errors.push('PRICE_FLEX requiere meta-datos');
        } else {
          const { max_variation_percent, max_variation_cents } = rule.meta;
          if (max_variation_percent === undefined) errors.push('max_variation_percent es requerido');
          if (max_variation_cents === undefined) errors.push('max_variation_cents es requerido');
        }
        break;

      case 'TOLERANCE':
        if (!rule.meta?.tolerance_cents) {
          errors.push('tolerance_cents es requerido');
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

    for (const rule of rules) {
      const result = this.validateRule(rule);
      allErrors.push(...result.errors.map(e => `[${rule.tipo}] ${e}`));
      allWarnings.push(...result.warnings.map(w => `[${rule.tipo}] ${w}`));
    }

    return {
      valid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings
    };
  }
}
