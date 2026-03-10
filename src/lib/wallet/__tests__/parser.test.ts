import { describe, it, expect } from 'vitest';
import { parseSmsText, calculateAnalytics } from '../parser';

describe('Wallet Parser', () => {
  it('should parse TRANSFER_IN from SMS', () => {
    const sms = 'PAGOxMOVIL El titular del telefono 5353183965 le ha realizado una transferencia a la cuenta 9204069997231162 de 1000.00 CUP. Nro. Transaccion KW600HAHQE999. Fecha: 9/3/2026.';
    const txs = parseSmsText(sms);
    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('TRANSFER_IN');
    expect(txs[0].amount).toBe(1000);
    expect(txs[0].counterparty).toBe('5353183965');
    expect(txs[0].date).toBe('2026-03-09');
  });

  it('should parse tabular bank logs', () => {
    const log = '20/02/2026;Credito: Ref: EA60039732999;Cr;9043.85;CUP;';
    const txs = parseSmsText(log);
    expect(txs).toHaveLength(1);
    expect(txs[0].direction).toBe('IN');
    expect(txs[0].amount).toBe(9043.85);
  });

  it('should calculate analytics correctly', () => {
    const txs: any[] = [
      { direction: 'IN', amount: 1000, bank: 'BANDEC', date: '2026-03-01' },
      { direction: 'OUT', amount: 400, bank: 'BANDEC', date: '2026-03-02' }
    ];
    const analytics = calculateAnalytics(txs);
    expect(analytics.summary.total_income).toBe(1000);
    expect(analytics.summary.total_expenses).toBe(400);
    expect(analytics.summary.balance).toBe(600);
  });
});
