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
    const sms = 'PAGOxMOVIL Fallo Banco Bandec: Limite diario excedido. Fecha: 12/3/2026.';
    const txs = parseSmsText(sms);
    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('FAILED_OPERATION');
    expect(txs[0].status).toBe('FAILED');
    expect(txs[0].extra_data?.reason).toBe('Banco Bandec: Limite diario excedido');
  });

  it('should parse LIMIT_CHANGE from SMS', () => {
    const sms = 'PAGOxMOVIL Cambio de limite efectuado: ATM: 50000.00; POS: 50000.00; TOTAL: 100000. Fecha: 13/3/2026.';
    const txs = parseSmsText(sms);
    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('LIMIT_CHANGE');
    expect(txs[0].extra_data?.total).toBe('100000');
  });

  it('should parse CASH_ATM from SMS', () => {
    const sms = 'PAGOxMOVIL Retiro de efectivo completado. Cajero: 1234. Monto: 2000.00 CUP. Saldo Disponible: CR 3432.10. Fecha: 14/3/2026.';
    const txs = parseSmsText(sms);
    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('CASH_ATM');
    expect(txs[0].amount).toBe(2000);
    expect(txs[0].counterparty).toBe('ATM: 1234');
    expect(txs[0].balance_after).toBe(3432.10);
  });

  it('should parse CASH_EXTRA from SMS', () => {
    const sms = 'PAGOxMOVIL Retiro en Caja Extra completado. Negocio: Bodega 1. Monto: 500.00 CUP. Fecha: 15/3/2026.';
    const txs = parseSmsText(sms);
    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('CASH_EXTRA');
    expect(txs[0].amount).toBe(500);
    expect(txs[0].counterparty).toBe('Caja Extra: Bodega 1');
  });

  it('should parse MITURNO from SMS', () => {
    const sms = 'PAGOxMOVIL Turno solicitado con exito. Servicio: Gas Licuado. Numero: 45. Fecha: 16/3/2026.';
    const txs = parseSmsText(sms);
    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('MITURNO');
    expect(txs[0].counterparty).toBe('MiTurno: Gas Licuado');
    expect(txs[0].extra_data?.turn_number).toBe('45');
  });

  it('should parse SECURITY_EVENT from SMS', () => {
    const sms = 'PAGOxMOVIL Autenticacion exitosa. Fecha: 17/3/2026.';
    const txs = parseSmsText(sms);
    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('SECURITY_EVENT');
    expect(txs[0].extra_data?.event).toBe('Autenticacion exitosa');
  });
});
