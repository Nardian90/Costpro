import { describe, it, expect } from 'vitest';
import { extractIdentity } from '../mapping-engine';
import { parseObservations } from '../../parser';

describe('BPA Bancamovil Extraction', () => {
  const sample = "[COD_ORIGEN:12] 00062500DT3N 98025A6248224 98025A6248224 TRANSFERENCIA POR BANCAMOVIL-BPA. ORDENADA POR: CL AUDIA J. DUARTE R. PAN: 923812XXXXXX6246 ID_CUBACEL: 3437739136 5356562683 BE NEFICIARIO: 0664634000421716 SHA 0.00000";

  it('should extract and normalize the payer name from BPA observations', () => {
    const result = extractIdentity(sample);
    expect(result.nombre).toBe('CLAUDIA J. DUARTE R.');
  });

  it('should extract the enmasked PAN (card number)', () => {
    const result = extractIdentity(sample);
    expect(result.card).toBe('923812XXXXXX6246');
  });

  it('should extract the first phone starting with 53 from ID_CUBACEL', () => {
    const result = extractIdentity(sample);
    expect(result.phone).toBe('5356562683');
  });

  it('should integrate correctly with parseObservations', () => {
    const result = parseObservations(sample);
    expect(result.payer).toBe('CLAUDIA J. DUARTE R.');
    expect(result.phone).toBe('5356562683');
    expect(result.card).toBe('923812XXXXXX6246');
    expect(result.account).toBe('923812XXXXXX6246');
  });
});
