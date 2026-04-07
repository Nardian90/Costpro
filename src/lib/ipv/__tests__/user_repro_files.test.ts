import { describe, it, expect, beforeEach } from 'vitest';
import { MatchingEngine, getDefaultIPVRulesConfig } from '../engine';
import { parseBandecTxt } from '../bandecParser';
import * as fs from 'fs';
import * as path from 'path';

describe('User Repro Files Matching Logic', () => {
  let products: any[] = [];
  let transactions: any[] = [];

  beforeEach(async () => {
    products = [
      { cod: 'P001', descripcion: 'Producto 1', precio_cents: 100000, activo: true, stock_inicial_manual: 10, um: 'UD' },
      { cod: 'P002', descripcion: 'Producto 2', precio_cents: 150000, activo: true, stock_inicial_manual: 5, um: 'UD' },
      { cod: 'P003', descripcion: 'Producto 3', precio_cents: 200000, activo: true, stock_inicial_manual: 20, um: 'UD' },
      { cod: 'P004', descripcion: 'Cerveza', precio_cents: 189000, activo: true, stock_inicial_manual: 100, um: 'UD', isWildcardCandidate: true },
      { cod: 'P005', descripcion: 'Refresco', precio_cents: 83000, activo: true, stock_inicial_manual: 0, um: 'UD' },
    ];

    const txtPath = path.resolve(__dirname, '../../../../e2e/verification/Transferencias.txt');
    const txtContent = fs.readFileSync(txtPath, 'utf-8');
    const parsed = await parseBandecTxt(txtContent);
    transactions = parsed.transactions.filter(t => t.tipo === 'Cr');
  });

  it('should process transactions and use CASH_FILL when stock is insufficient', async () => {
    const rules = getDefaultIPVRulesConfig();
    const stockLimitRule = rules.find(r => r.tipo === 'STOCK_LIMIT');
    if (stockLimitRule) {
        stockLimitRule.activo = true;
        stockLimitRule.meta = { allow_negative: false };
    }

    const engine = new MatchingEngine(products, rules);

    const targetTx = transactions.find(t => t.importe_cents === 83000);
    expect(targetTx).toBeDefined();

    const result = await engine.matchTransaction(targetTx!);

    expect(result.status).toBe('COMPLETO');
    expect(result.appliedRules).toContain('CASH_FILL');
  });

  it('should handle mixed payments (CASH_FILL for over-matching)', async () => {
      const rules = getDefaultIPVRulesConfig();
      const expensiveProduct = { cod: 'EXP', precio_cents: 120000, activo: true, stock_inicial_manual: 10, isWildcardCandidate: true };
      const engine = new MatchingEngine([expensiveProduct], rules);

      const tx = {
          referencia_origen: 'MIXED-TX',
          importe_cents: 100000,
          fecha: '2026-02-26',
          tipo: 'Cr',
          observaciones: 'Test'
      } as any;

      const result = await engine.matchTransaction(tx);

      expect(result.status).toBe('COMPLETO');
      expect(result.appliedRules).toContain('WILDCARDS');
      expect(result.appliedRules).toContain('CASH_FILL');

      const cashLine = result.lines.find(l => l.clasificacion === 'Efectivo');
      expect(cashLine).toBeDefined();
      expect(cashLine?.importe_linea_cents).toBe(20000);
  });
});
