import { describe, it, expect } from 'vitest';
import { formatCost, formatCurrencyDisplay, formatAccounting } from './formatters';

describe('formatters', () => {
  describe('formatCost', () => {
    it('formats a positive number with 2 decimals', () => {
      const result = formatCost(1234.5);
      expect(result).toContain('1234');
      expect(result).toContain(',50');
    });
    it('formats zero', () => {
      expect(formatCost(0)).toBe('0,00');
    });
    it('formats null/undefined as 0,00', () => {
      expect(formatCost(null)).toBe('0,00');
      expect(formatCost(undefined)).toBe('0,00');
    });
    it('formats empty string as 0,00', () => {
      expect(formatCost('')).toBe('0,00');
    });
    it('parses string numbers', () => {
      const result = formatCost('1234.50');
      expect(result).toContain('1234');
      expect(result).toContain(',50');
    });
    it('handles negative numbers', () => {
      expect(formatCost(-99.9)).toBe('-99,90');
    });
  });

  describe('formatCurrencyDisplay', () => {
    it('formats with CUP currency symbol', () => {
      const result = formatCurrencyDisplay(100);
      expect(result).toContain('100'); // Locale-dependent symbol
    });
    it('handles null', () => {
      const result = formatCurrencyDisplay(null);
      expect(result).toContain('0');
    });
  });

  describe('formatAccounting', () => {
    it('formats positive numbers normally', () => {
      const result = formatAccounting(1234.5);
      expect(result).toContain('1234');
      expect(result).toContain(',50');
      expect(result).not.toContain('(');
    });
    it('formats negative numbers in parentheses', () => {
      const result = formatAccounting(-1234.5);
      expect(result).toContain('(');
      expect(result).toContain(')');
      expect(result).toContain('1234');
    });
    it('formats zero normally', () => {
      expect(formatAccounting(0)).toBe('0,00');
    });
    it('handles null as 0,00', () => {
      expect(formatAccounting(null)).toBe('0,00');
    });
  });
});
