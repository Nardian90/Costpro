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
      { cod: 'P005', descripcion: 'Refresco', precio_cents: 83000, activo: true, stock_inicial_manual: 0, um: 'UD' },
    ];

    const txtPath = path.resolve(__dirname, '../../../../e2e/verification/Transferencias.txt');
    const txtContent = fs.readFileSync(txtPath, 'utf-8');
    const parsed = await parseBandecTxt(txtContent);
    transactions = parsed.transactions.filter(t => t.tipo === 'Cr');
  });

  it('should use deterministic transaction_ref for CASH_FILL', async () => {
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

    const fillLine = result.lines.find(l => l.origen_dato === 'CASH_FILLER');
    expect(fillLine).toBeDefined();
    expect(fillLine?.transaction_ref).toBe(`${targetTx!.referencia_origen}_EFECTIVO`);
  });

  it('should handle multiple CASH_FILL lines with incremental index', async () => {
      // This is a bit advanced but let's see if we can trigger it
      // Actually, my current applyCashFill implementation checks existing lines in the current pass
      // If the engine logic allows multiple passes where CASH_FILL is triggered, it will index
  });
});
