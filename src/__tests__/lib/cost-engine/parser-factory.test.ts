import { describe, it, expect } from 'vitest';
import { createSafeParser, safeEvaluate } from '@/lib/cost-engine/parser-factory';

describe('parser-factory', () => {
  const parser = createSafeParser();

  describe('createSafeParser', () => {
    it('registers custom functions', () => {
      expect(parser.functions.REDONDEO).toBeDefined();
      expect(parser.functions.round).toBeDefined();
      expect(parser.functions.ROUND2).toBeDefined();
      expect(parser.functions.SUMA).toBeDefined();
      expect(parser.functions.SUM).toBeDefined();
      expect(parser.functions.SI).toBeDefined();
      expect(parser.functions.IF).toBeDefined();
    });

    it('REDONDEO works correctly', () => {
      expect(parser.functions.REDONDEO(10.555, 2)).toBe(10.56);
      expect(parser.functions.REDONDEO(10.554, 2)).toBe(10.55);
    });

    it('ROUND2 works correctly', () => {
      expect(parser.functions.ROUND2(10.555)).toBe(10.56);
    });

    it('SUMA works correctly', () => {
      expect(parser.functions.SUMA(1, 2, 3)).toBe(6);
      expect(parser.functions.SUMA(0.1, 0.2)).toBe(0.3); // Decimal.js handles precision
    });

    it('SI works correctly', () => {
      expect(parser.functions.SI(true, 1, 0)).toBe(1);
      expect(parser.functions.SI(false, 1, 0)).toBe(0);
    });
  });

  describe('safeEvaluate', () => {
    it('evaluates simple expressions', () => {
      const { result } = safeEvaluate(parser, '1 + 2');
      expect(result).toBe(3);
    });

    it('evaluates with context', () => {
      const { result } = safeEvaluate(parser, 'a * b', { a: 10, b: 5 });
      expect(result).toBe(50);
    });

    it('handles numeric strings', () => {
      const { result } = safeEvaluate(parser, '"123"');
      expect(result).toBe(123);
    });

    it('handles non-numeric strings by falling back to 0 or parseFloat', () => {
        const { result } = safeEvaluate(parser, '"abc"');
        expect(result).toBe(0);
    });

    it('returns 0 for unknown types', () => {
      const { result } = safeEvaluate(parser, 'true');
      expect(result).toBe(0);
    });

    it('returns error on invalid expression', () => {
      const { result, error } = safeEvaluate(parser, '1 + ');
      expect(result).toBe(0);
      expect(error).toBeDefined();
    });
  });
});
