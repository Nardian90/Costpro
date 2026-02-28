import { describe, it, expect } from 'vitest';
import { parseObservations } from '../parser';

describe('Relacion Bancaria Parsing', () => {
  it('should extract name, CI and phone from complex observations', () => {
    const obs = "TRANSFERENCIA POR BANCAMOVIL-BPA. ORDENADA POR: CLAUDIA J. DUARTE R. PAN: 923812XXXXXX6246 ID_CUBACEL: 3437739136 5356562683 BENEFICIARIO: 0664634000421716";
    const parsed = parseObservations(obs);
    expect(parsed.payer).toBe('CLAUDIA J. DUARTE R.');
    expect(parsed.phone).toBe('5356562683');
  });

  it('should extract CI when explicitly mentioned', () => {
    const obs = "ORDENANTE NOMBRE:CARLOS E. POLANCO LEYVA| CI:63071201501 | Tarjeta RED:9227069998164274";
    const parsed = parseObservations(obs);
    expect(parsed.payer).toBe('CARLOS E. POLANCO LEYVA');
    expect(parsed.ci).toBe('63071201501');
  });

  it('should extract CI from numeric string fallback', () => {
    const obs = "TRANSFERENCIA DE IDANIA TORRES LEYVA 69101424778";
    const parsed = parseObservations(obs);
    expect(parsed.ci).toBe('69101424778');
  });
});
