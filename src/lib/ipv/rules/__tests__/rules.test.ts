import { describe, it, expect } from 'vitest';
import { getDefaultIPVRulesConfig, mergeWithDefaults } from '../rules-config';
import { isTransactionSelected } from '../rules-types';
import { BankTransaction, MatchingRule } from '@/lib/dexie';

describe('IPV Rules Logic', () => {
  it('should have correct default rules order and state', () => {
    const defaults = getDefaultIPVRulesConfig();
    expect(defaults[0].tipo).toBe('STOCK_LIMIT');
    expect(defaults[0].activo).toBe(true);
    expect(defaults[0].meta?.allow_negative).toBe(false);

    expect(defaults[1].tipo).toBe('HARD_REF');

    expect(defaults[2].tipo).toBe('EXACT_SUM');
    expect(defaults[2].meta?.depth).toBe(1200);

    expect(defaults[3].tipo).toBe('CASH_FILL');
    expect(defaults[3].meta?.daily_limit).toBe(50000);

    expect(defaults[4].tipo).toBe('WILDCARDS');
    expect(defaults[5].tipo).toBe('TOLERANCE');
    expect(defaults[5].activo).toBe(false);
    expect(defaults[6].tipo).toBe('PRICE_FLEX');
    expect(defaults[6].activo).toBe(false);
  });

  it('should merge defaults with existing user config correctly', () => {
    const defaults = getDefaultIPVRulesConfig();
    const existing: MatchingRule[] = [
      { id: '1', tipo: 'STOCK_LIMIT', prioridad: 1, activo: false, meta: { allow_negative: true } } as MatchingRule,
      { id: '3', tipo: 'EXACT_SUM', prioridad: 10, activo: true, meta: { depth: 500 } } as MatchingRule
    ];

    const merged = mergeWithDefaults(existing, defaults);

    const stockLimit = merged.find(r => r.tipo === 'STOCK_LIMIT');
    expect(stockLimit?.activo).toBe(false);
    expect(stockLimit?.meta?.allow_negative).toBe(true);

    const exactSum = merged.find(r => r.tipo === 'EXACT_SUM');
    expect(exactSum?.prioridad).toBe(10);
    expect(exactSum?.meta?.depth).toBe(500);
    expect(exactSum?.meta?.timeout).toBe(200000); // from default

    const cashFill = merged.find(r => r.tipo === 'CASH_FILL');
    expect(cashFill?.activo).toBe(true); // from default
    expect(cashFill?.meta?.daily_limit).toBe(50000); // from default
  });

  it('should handle transaction selection defaults', () => {
    const creditTx = { tipo: 'Cr' } as BankTransaction;
    const debitTx = { tipo: 'Db' } as BankTransaction;

    expect(isTransactionSelected(creditTx)).toBe(true);
    expect(isTransactionSelected(debitTx)).toBe(false);

    const creditExcluido = { tipo: 'Cr', excluido: true } as BankTransaction;
    expect(isTransactionSelected(creditExcluido)).toBe(false);

    const debitIncluido = { tipo: 'Db', excluido: false } as BankTransaction;
    expect(isTransactionSelected(debitIncluido)).toBe(true);
  });
});
