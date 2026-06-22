import { describe, it, expect } from 'vitest';
import {
  getFormulaReferenceIssue,
  translateFormulaFromSpanish,
  smartTranslate,
  RESERVED_FORMULA_NAMES
} from '@/lib/cost-engine/formula-utils';

describe('formula-utils', () => {
  describe('getFormulaReferenceIssue', () => {
    it('returns error for empty name', () => {
      expect(getFormulaReferenceIssue('')).toBe('El nombre no puede estar vacío.');
      expect(getFormulaReferenceIssue('   ')).toBe('El nombre no puede estar vacío.');
    });

    it('returns error for single letter identifiers', () => {
      expect(getFormulaReferenceIssue('a')).toContain('letra reservada potencial');
      expect(getFormulaReferenceIssue('Z')).toContain('letra reservada potencial');
    });

    it('returns error for reserved names', () => {
      expect(getFormulaReferenceIssue('sin')).toContain('palabra reservada');
      expect(getFormulaReferenceIssue('PI')).toContain('palabra reservada');
      expect(getFormulaReferenceIssue('SUMA')).toContain('palabra reservada');
    });

    it('returns null for valid names', () => {
      expect(getFormulaReferenceIssue('myVar')).toBeNull();
      expect(getFormulaReferenceIssue('total_1')).toBeNull();
      expect(getFormulaReferenceIssue('123')).toBeNull(); // Numeric IDs are safe
    });
  });

  describe('translateFormulaFromSpanish', () => {
    it('translates basic keywords', () => {
      expect(translateFormulaFromSpanish('SUMA(1,2)')).toBe('sum(1,2)');
      expect(translateFormulaFromSpanish('PROMEDIO(a,b)')).toBe('average(a,b)');
      expect(translateFormulaFromSpanish('REDONDEO(x)')).toBe('REDONDEO(x)');
    });

    it('normalizes vh and ref calls', () => {
      expect(translateFormulaFromSpanish('VH(id1)')).toBe("vh('id1')");
      expect(translateFormulaFromSpanish('REF("id2")')).toBe("ref('id2')");
    });

    it('returns empty/null input as is', () => {
      expect(translateFormulaFromSpanish('')).toBe('');
    });
  });

  describe('smartTranslate', () => {
    const knownIds = new Set(['101', '102']);
    const knownClasses = new Set(['C1']);

    it('returns "0" for empty formula', () => {
      expect(smartTranslate('', knownIds, knownClasses)).toBe('0');
    });

    it('translates pror(vh(X)) macro', () => {
      expect(smartTranslate('PROR(VH(101))', knownIds, knownClasses)).toBe("(VH / vh('101')) * ref('101')");
    });

    it('protects existing ref/vh calls from inner numbers being wrapped', () => {
      expect(smartTranslate("ref('101') + 102", knownIds, knownClasses)).toBe("ref('101') + ref('102')");
    });

    it('wraps known IDs and classes in ref()', () => {
      expect(smartTranslate('101 + C1 * 5', knownIds, knownClasses)).toBe("ref('101') + ref('C1') * 5");
    });

    it('does not wrap numbers adjacent to operators/dots', () => {
      expect(smartTranslate('101.5 + 5', knownIds, knownClasses)).toBe('101.5 + 5');
    });

    it('handles nested ref calls correctly', () => {
      // While unusual, the code attempts to handle it
      expect(smartTranslate("ref(ref('101'))", knownIds, knownClasses)).toBe("ref(ref('101'))");
    });

    it('protects valor() content', () => {
      expect(smartTranslate('valor(101 + 5)', knownIds, knownClasses)).toBe('valor(101 + 5)');
    });
  });

  describe('RESERVED_FORMULA_NAMES', () => {
    it('contains expected math functions', () => {
      expect(RESERVED_FORMULA_NAMES.has('sin')).toBe(true);
      expect(RESERVED_FORMULA_NAMES.has('sqrt')).toBe(true);
    });
  });
});
