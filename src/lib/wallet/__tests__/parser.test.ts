import { describe, it, expect } from 'vitest';
import { parseRawSms, calculateAnalytics } from '../parser';

describe('Wallet Parser SSoT', () => {
  it('should parse structured raw SMS', () => {
    const text = "Recibido\t9 mar. 2026\tPAGOxMOVIL\tBanco Popular de Ahorro Ultimas operaciones. 09/03/2026;OTR;Cr;1000,00;CUP;KW600HAHQE999; Saldo Disponible: CR 80914.49 CUP";
    const raw = parseRawSms(text);
    expect(raw).toHaveLength(1);
    expect(raw[0].type).toBe('Recibido');
    expect(raw[0].date).toBe('9 mar. 2026');
    expect(raw[0].nameNumber).toBe('PAGOxMOVIL');
  });

  it('should derive analytics from raw SMS', () => {
    const text = "Recibido\t9 mar. 2026\tPAGOxMOVIL\tBanco Popular de Ahorro Ultimas operaciones. 09/03/2026;OTR;Cr;1000,00;CUP;KW600HAHQE999; Saldo Disponible: CR 80914.49 CUP";
    const raw = parseRawSms(text);
    const analytics = calculateAnalytics(raw);

    expect(analytics.transactions).toHaveLength(1);
    expect(analytics.transactions[0].bank).toBe('BPA');
    expect(analytics.transactions[0].nature).toBe('CR');
    expect(analytics.transactions[0].amount).toBe(1000);
  });

  it('should deduplicate raw SMS', () => {
    const text = "Recibido\t9 mar. 2026\tPAGOxMOVIL\tContenido\nRecibido\t9 mar. 2026\tPAGOxMOVIL\tContenido";
    const raw = parseRawSms(text);
    expect(raw).toHaveLength(1);
  });

  it('should calculate adjustments when balances mismatch', () => {
    const text = [
      "Recibido\t8 mar. 2026\tPAGOxMOVIL\tSaldo Disponible: CR 1000.00 CUP",
      "Recibido\t9 mar. 2026\tPAGOxMOVIL\tTransferencia fue completada. Monto: 200.00 CUP. Nro. Transaccion KW1. Fecha: 09/03/2026",
      "Recibido\t10 mar. 2026\tPAGOxMOVIL\tSaldo Disponible: CR 500.00 CUP"
    ].join('\n');

    const raw = parseRawSms(text);
    const analytics = calculateAnalytics(raw);

    // Initial 1000 -> Out 200 -> Theoretical 800.
    // Reported 500. Diff -300.
    const adjustments = analytics.consolidated.filter(tx => tx.isAdjustment);
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0].operation).toBe('DB');
    expect(adjustments[0].amount).toBe(300);
  });
});
