import { describe, it, expect } from 'vitest';
import { classifyFormula, isSimpleAnnexRef } from '@/lib/cost-engine/formula-classifier';

describe('formula-classifier', () => {
  describe('classifyFormula', () => {
    it('classifies empty strings', () => {
      expect(classifyFormula('')).toEqual({ kind: 'EMPTY', annexRoman: null });
      expect(classifyFormula('   ')).toEqual({ kind: 'EMPTY', annexRoman: null });
    });

    it('classifies equations starting with =', () => {
      expect(classifyFormula('=1+2')).toEqual({ kind: 'EQUATION', annexRoman: null });
      expect(classifyFormula('=AnexoI')).toEqual({ kind: 'EQUATION', annexRoman: 'I' });
    });

    it('classifies bare annex references', () => {
      expect(classifyFormula('AnexoI')).toEqual({ kind: 'ANNEX_REF', annexRoman: 'I' });
      expect(classifyFormula('TotalAnexoIV')).toEqual({ kind: 'ANNEX_REF', annexRoman: 'IV' });
    });

    it('classifies engine function calls without =', () => {
      expect(classifyFormula("ref('1.1') * 5")).toEqual({ kind: 'ENGINE_FUNC', annexRoman: null });
      expect(classifyFormula("vh('2.1')")).toEqual({ kind: 'ENGINE_FUNC', annexRoman: null });
    });

    it('classifies numeric values', () => {
      expect(classifyFormula('123')).toEqual({ kind: 'NUMERIC', annexRoman: null });
      expect(classifyFormula('123.45')).toEqual({ kind: 'NUMERIC', annexRoman: null });
      expect(classifyFormula('-50')).toEqual({ kind: 'NUMERIC', annexRoman: null });
    });

    it('falls back to numeric for unknown strings', () => {
      expect(classifyFormula('invalid input')).toEqual({ kind: 'NUMERIC', annexRoman: null });
    });
  });

  describe('isSimpleAnnexRef', () => {
    it('returns roman numeral for simple refs', () => {
      expect(isSimpleAnnexRef('AnexoI')).toBe('I');
      expect(isSimpleAnnexRef('=AnexoII')).toBe('II');
      expect(isSimpleAnnexRef('  TotalAnexoIII  ')).toBe('III');
    });

    it('returns false for complex formulas', () => {
      expect(isSimpleAnnexRef('AnexoI + 5')).toBe(false);
      expect(isSimpleAnnexRef('=ref("AnexoI")')).toBe(false);
    });
  });
});
