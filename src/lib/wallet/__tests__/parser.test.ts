import { describe, it, expect } from 'vitest';
import { parseSmsText } from '../parser';

describe('Wallet Parser Advanced', () => {
  it('should parse BALANCE_QUERY from SMS', () => {
    const sms = 'PAGOxMOVIL La consulta de saldo fue completada. Saldo Disponible: CR 5432.10 CUP. Fecha: 10/3/2026.';
    const txs = parseSmsText(sms);
    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('BALANCE_QUERY');
    expect(txs[0].balance_after).toBe(5432.10);
    expect(txs[0].date).toBe('2026-03-10');
  });

  it('should parse ELECTRICITY payment from SMS', () => {
    const sms = 'PAGOxMOVIL El pago de la factura de electricidad fue completado. Consumo mensual: 250 KW. Periodo Pagado: 02/2026. Fecha: 11/3/2026.';
    const txs = parseSmsText(sms);
    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('PAYMENT_SERVICE');
    expect(txs[0].service_category).toBe('ELECTRICITY');
    expect(txs[0].extra_data?.consumption_kwh).toBe(250);
  });

  it('should parse FAILED_OPERATION from SMS', () => {
    const sms = 'PAGOxMOVIL Fallo la transferencia. Banco Bandec: Limite diario excedido. Fecha: 12/3/2026.';
    const txs = parseSmsText(sms);
    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('FAILED_OPERATION');
    expect(txs[0].status).toBe('FAILED');
    expect(txs[0].extra_data?.reason).toBe('la transferencia. Banco Bandec: Limite diario excedido');
  });

  it('should parse LIMIT_CHANGE from SMS', () => {
    const sms = 'PAGOxMOVIL Cambio de limite efectuado: ATM: 50000.00; POS: 50000.00; TOTAL: 100000.00. Fecha: 13/3/2026.';
    const txs = parseSmsText(sms);
    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('LIMIT_CHANGE');
    expect(txs[0].extra_data?.total).toBe('100000.00');
  });
});
