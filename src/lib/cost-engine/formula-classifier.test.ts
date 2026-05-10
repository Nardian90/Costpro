import { describe, it, expect } from 'vitest';
import { classifyFormula } from './formula-classifier';

describe('classifyFormula', () => {
  it('returns EMPTY for null/undefined/empty', () => {
    expect(classifyFormula(null)).toEqual({ kind: 'EMPTY' });
    expect(classifyFormula(undefined)).toEqual({ kind: 'EMPTY' });
    expect(classifyFormula('')).toEqual({ kind: 'EMPTY' });
    expect(classifyFormula('undefined')).toEqual({ kind: 'EMPTY' });
    expect(classifyFormula('null')).toEqual({ kind: 'EMPTY' });
  });

  it('detects ANEXO_REF for AnexoI, AnexoII, AnexoIII, etc.', () => {
    expect(classifyFormula('AnexoI')).toEqual({ kind: 'ANEXO_REF', anexoId: 'I' });
    expect(classifyFormula('AnexoII')).toEqual({ kind: 'ANEXO_REF', anexoId: 'II' });
    expect(classifyFormula('AnexoIV')).toEqual({ kind: 'ANEXO_REF', anexoId: 'IV' });
    expect(classifyFormula('AnexoV')).toEqual({ kind: 'ANEXO_REF', anexoId: 'V' });
    // Case insensitive
    expect(classifyFormula('anexoi')).toEqual({ kind: 'ANEXO_REF', anexoId: 'I' });
  });

  it('detects SUM_CHILDREN', () => {
    expect(classifyFormula('=SUMA(hijos)')).toEqual({ kind: 'SUM_CHILDREN' });
    expect(classifyFormula('sum(children)')).toEqual({ kind: 'SUM_CHILDREN' });
    expect(classifyFormula('=sum(children)')).toEqual({ kind: 'SUM_CHILDREN' });
    expect(classifyFormula('SUM_CHILDREN')).toEqual({ kind: 'SUM_CHILDREN' });
  });

  it('detects PERCENTAGE for PCT formulas', () => {
    const r = classifyFormula("=PCT(ref('2.1'), 9.09)");
    expect(r.kind).toBe('PERCENTAGE');
    expect((r as any).expression).toBe("=PCT(ref('2.1'), 9.09)");
  });

  it('detects VH_RATIO for vh() formulas', () => {
    const r = classifyFormula("vh('4.1.1')/vh('1.1.1')*ref('1.1.1')");
    expect(r.kind).toBe('VH_RATIO');
  });

  it('detects MATH for generic expressions', () => {
    const r = classifyFormula('=ref("1") + ref("2")');
    expect(r.kind).toBe('MATH');
    expect((r as any).expression).toBe('=ref("1") + ref("2")');
  });

  it('ANEXO_REF takes precedence over MATH', () => {
    // "AnexoI" must never be classified as MATH
    const r = classifyFormula('AnexoI');
    expect(r.kind).toBe('ANEXO_REF');
    expect(r.kind).not.toBe('MATH');
  });
});
