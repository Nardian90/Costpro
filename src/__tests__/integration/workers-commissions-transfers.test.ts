/**
 * Tests de integración para Workers, Comisiones y Transferencias.
 * 
 * Estos tests validan la lógica de negocio pura (sin BD) de:
 * - parse-ci: validación de CI cubano
 * - commission-engine: cálculo de comisiones
 * - selectApplicableRule: selección de reglas por prioridad
 */

import { describe, it, expect } from 'vitest';
import { parseCI, getBirthDateFromCI, isValidCI } from '@/lib/parse-ci';
import {
  selectApplicableRule,
  calculateCommission,
  buildBreakdownSnapshot,
  type CommissionRule,
} from '@/lib/commission-engine';

// ════════════════════════════════════════════════════════════════════
// TESTS: parse-ci.ts
// ════════════════════════════════════════════════════════════════════
describe('parseCI — CI cubano', () => {
  describe('CI válidos', () => {
    it('CI 90040240202 → birth 1990-04-02', () => {
      const result = parseCI('90040240202');
      expect(result.isValid).toBe(true);
      expect(result.year).toBe(1990);
      expect(result.month).toBe(4);
      expect(result.day).toBe(2);
      expect(result.birthDate).toBeInstanceOf(Date);
    });

    it('CI 00040240202 → birth 2000-04-02 (siglo 2000)', () => {
      const result = parseCI('00040240202');
      expect(result.isValid).toBe(true);
      expect(result.year).toBe(2000);
    });

    it('CI 01010112345 → birth 2001-01-01', () => {
      const result = parseCI('01010112345');
      expect(result.isValid).toBe(true);
      expect(result.year).toBe(2001);
      expect(result.month).toBe(1);
      expect(result.day).toBe(1);
    });

    it('CI 85081540202 → birth 1985-08-15', () => {
      const result = parseCI('85081540202');
      expect(result.isValid).toBe(true);
      expect(result.year).toBe(1985);
      expect(result.month).toBe(8);
      expect(result.day).toBe(15);
    });
  });

  describe('CI inválidos', () => {
    it('CI vacío → inválido', () => {
      expect(parseCI('').isValid).toBe(false);
      expect(parseCI(null).isValid).toBe(false);
      expect(parseCI(undefined).isValid).toBe(false);
    });

    it('CI con letras → inválido (NO strip silencioso)', () => {
      const result = parseCI('9004024020A');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('no numéricos');
    });

    it('CI de 10 dígitos → inválido', () => {
      const result = parseCI('9004024020');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('11 dígitos');
    });

    it('CI de 12 dígitos → inválido', () => {
      const result = parseCI('900402402020');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('11 dígitos');
    });

    it('CI con mes 13 → inválido', () => {
      const result = parseCI('90130240202');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Mes inválido');
    });

    it('CI con día 32 → inválido', () => {
      const result = parseCI('90043240202');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Día inválido');
    });

    it('CI con mes 0 → inválido', () => {
      const result = parseCI('90000240202');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Mes inválido');
    });
  });

  describe('Helpers', () => {
    it('getBirthDateFromCI devuelve YYYY-MM-DD', () => {
      expect(getBirthDateFromCI('90040240202')).toBe('1990-04-02');
      expect(getBirthDateFromCI('00040240202')).toBe('2000-04-02');
    });

    it('getBirthDateFromCI con CI inválido devuelve null', () => {
      expect(getBirthDateFromCI('invalid')).toBeNull();
      expect(getBirthDateFromCI('')).toBeNull();
    });

    it('isValidCI funciona rápido', () => {
      expect(isValidCI('90040240202')).toBe(true);
      expect(isValidCI('123')).toBe(false);
    });
  });
});

// ════════════════════════════════════════════════════════════════════
// TESTS: commission-engine.ts
// ════════════════════════════════════════════════════════════════════
describe('commission-engine — Motor de cálculo', () => {
  const baseRule: CommissionRule = {
    id: 'rule-1',
    store_id: 'store-1',
    worker_id: null,
    type: 'percentage_sales',
    value_percent: 5,
    fixed_value: null,
    salary_amount: null,
    base_calculation: 'total_sales',
    priority: 0,
    valid_from: '2026-01-01',
    valid_to: null,
  };

  describe('selectApplicableRule', () => {
    it('Selecciona regla worker-specific sobre store-default', () => {
      const storeRule = { ...baseRule, id: 'store', worker_id: null, priority: 0 };
      const workerRule = { ...baseRule, id: 'worker', worker_id: 'w-1', priority: 0 };
      const result = selectApplicableRule([storeRule, workerRule], 'w-1', '2026-06-01');
      expect(result?.id).toBe('worker');
    });

    it('Selecciona regla con mayor prioridad', () => {
      const low = { ...baseRule, id: 'low', priority: 0 };
      const high = { ...baseRule, id: 'high', priority: 10 };
      const result = selectApplicableRule([low, high], 'w-1', '2026-06-01');
      expect(result?.id).toBe('high');
    });

    it('Devuelve null si no hay reglas aplicables', () => {
      const expired = { ...baseRule, valid_from: '2027-01-01' };
      const result = selectApplicableRule([expired], 'w-1', '2026-06-01');
      expect(result).toBeNull();
    });

    it('Filtra reglas de otros workers', () => {
      const otherWorker = { ...baseRule, id: 'other', worker_id: 'w-2' };
      const result = selectApplicableRule([otherWorker], 'w-1', '2026-06-01');
      expect(result).toBeNull();
    });
  });

  describe('calculateCommission — percentage_sales', () => {
    it('5% sobre 1000 = 50', () => {
      const calc = calculateCommission('w-1', { cash: 600, transfer: 400, total: 1000 }, baseRule, { from: '2026-06-01', to: '2026-06-30' });
      expect(calc.commission_suggested).toBe(50);
      expect(calc.breakdown.percentage_component).toBe(50);
      expect(calc.calculation_explanation).toContain('5%');
    });

    it('0% sobre 1000 = 0', () => {
      const zeroRule = { ...baseRule, value_percent: 0 };
      const calc = calculateCommission('w-1', { cash: 1000, transfer: 0, total: 1000 }, zeroRule, { from: '2026-06-01', to: '2026-06-30' });
      expect(calc.commission_suggested).toBe(0);
    });

    it('Sin ventas = 0', () => {
      const calc = calculateCommission('w-1', { cash: 0, transfer: 0, total: 0 }, baseRule, { from: '2026-06-01', to: '2026-06-30' });
      expect(calc.commission_suggested).toBe(0);
    });
  });

  describe('calculateCommission — fixed_amount', () => {
    it('Monto fijo 500 sin importar ventas', () => {
      const fixedRule: CommissionRule = { ...baseRule, type: 'fixed_amount', value_percent: null, fixed_value: 500 };
      const calc = calculateCommission('w-1', { cash: 0, transfer: 0, total: 0 }, fixedRule, { from: '2026-06-01', to: '2026-06-30' });
      expect(calc.commission_suggested).toBe(500);
    });
  });

  describe('calculateCommission — salary_based', () => {
    it('Salario fijo 2000', () => {
      const salaryRule: CommissionRule = { ...baseRule, type: 'salary_based', value_percent: null, salary_amount: 2000 };
      const calc = calculateCommission('w-1', { cash: 5000, transfer: 3000, total: 8000 }, salaryRule, { from: '2026-06-01', to: '2026-06-30' });
      expect(calc.commission_suggested).toBe(2000);
    });
  });

  describe('calculateCommission — hybrid', () => {
    it('Salario 2000 + 3% sobre 1000 = 2030', () => {
      const hybridRule: CommissionRule = { ...baseRule, type: 'hybrid', value_percent: 3, salary_amount: 2000 };
      const calc = calculateCommission('w-1', { cash: 600, transfer: 400, total: 1000 }, hybridRule, { from: '2026-06-01', to: '2026-06-30' });
      expect(calc.commission_suggested).toBe(2030);
      expect(calc.breakdown.salary_component).toBe(2000);
      expect(calc.breakdown.percentage_component).toBe(30);
    });
  });

  describe('calculateCommission — base_calculation', () => {
    it('cash_sales: usa solo cash', () => {
      const cashRule = { ...baseRule, base_calculation: 'cash_sales' as const, value_percent: 10 };
      const calc = calculateCommission('w-1', { cash: 600, transfer: 400, total: 1000 }, cashRule, { from: '2026-06-01', to: '2026-06-30' });
      expect(calc.commission_suggested).toBe(60); // 10% de 600
    });

    it('transfer_sales: usa solo transfer', () => {
      const transferRule = { ...baseRule, base_calculation: 'transfer_sales' as const, value_percent: 10 };
      const calc = calculateCommission('w-1', { cash: 600, transfer: 400, total: 1000 }, transferRule, { from: '2026-06-01', to: '2026-06-30' });
      expect(calc.commission_suggested).toBe(40); // 10% de 400
    });
  });

  describe('calculateCommission — sin regla', () => {
    it('Sin regla → comisión 0 con explanation', () => {
      const calc = calculateCommission('w-1', { cash: 1000, transfer: 500, total: 1500 }, null, { from: '2026-06-01', to: '2026-06-30' });
      expect(calc.commission_suggested).toBe(0);
      expect(calc.calculation_explanation).toContain('Sin regla');
      expect(calc.rule_applied).toBeNull();
    });
  });

  describe('buildBreakdownSnapshot', () => {
    it('Genera snapshot reproducible', () => {
      const calc = calculateCommission('w-1', { cash: 600, transfer: 400, total: 1000 }, baseRule, { from: '2026-06-01', to: '2026-06-30' });
      const snapshot = buildBreakdownSnapshot(calc, 'user-1');
      expect(snapshot.calculated_by).toBe('user-1');
      expect(snapshot.calculated_at).toBeDefined();
      expect(snapshot.commission_suggested).toBe(50);
      expect(snapshot.rule_applied).toBeTruthy();
      expect((snapshot.breakdown as any).percentage_component).toBe(50);
    });
  });

  describe('Valores negativos', () => {
    it('Cash negativo se clamp a 0', () => {
      const calc = calculateCommission('w-1', { cash: -100, transfer: 400, total: 300 }, baseRule, { from: '2026-06-01', to: '2026-06-30' });
      expect(calc.sales.cash).toBe(0);
    });
  });
});
