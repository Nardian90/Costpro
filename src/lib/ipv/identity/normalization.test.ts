import { describe, it, expect } from 'vitest';
import {
  normalizeName,
  getCanonicalName,
  normalizeCliente,
  levenshteinDistance,
  similarity,
} from './normalization';

describe('normalizeName', () => {
  it('should uppercase and trim', () => {
    expect(normalizeName('juan perez')).toBe('JUAN PEREZ');
  });

  it('should remove accents', () => {
    expect(normalizeName('María González')).toBe('MARIA GONZALEZ');
  });

  it('should remove special characters', () => {
    expect(normalizeName('O\'Brien, Jr.')).toBe('OBRIEN JR');
  });

  it('should collapse multiple spaces', () => {
    expect(normalizeName('Juan   Pérez   García')).toBe('JUAN PEREZ GARCIA');
  });

  it('should return empty for null/empty', () => {
    expect(normalizeName('')).toBe('');
    expect(normalizeName(null as any)).toBe('');
  });

  it('should preserve numbers', () => {
    expect(normalizeName('Cliente 123')).toBe('CLIENTE 123');
  });
});

describe('getCanonicalName', () => {
  it('should remove all spaces for canonical comparison', () => {
    expect(getCanonicalName('Juan Perez')).toBe('JUANPEREZ');
  });

  it('should normalize and strip spaces', () => {
    expect(getCanonicalName('  María  González  ')).toBe('MARIAGONZALEZ');
  });

  it('should treat different spacing as equal', () => {
    expect(getCanonicalName('Juan Perez')).toBe(getCanonicalName('Juan  Perez'));
  });
});

describe('normalizeCliente', () => {
  it('should normalize a standard cliente object', () => {
    const result = normalizeCliente({
      ci: '12345678',
      nombre: 'Juan Pérez',
      telefono: '555-1234',
      tarjeta: '4242',
    });

    expect(result.ci).toBe('12345678');
    expect(result.nombre).toBe('JUAN PEREZ');
    expect(result.nombre_display).toBe('JUAN PÉREZ');
    expect(result.telefono).toBe('555-1234');
    expect(result.tarjeta).toBe('4242');
  });

  it('should handle alternative field names', () => {
    const result = normalizeCliente({
      CI: '89012345',
      name: 'Ana García López',
      phone: '555-0000',
      card_number: '1234',
    });

    expect(result.ci).toBe('89012345');
    expect(result.nombre).toBe('ANA GARCIA LOPEZ');
  });

  it('should handle missing fields gracefully', () => {
    const result = normalizeCliente({});
    expect(result.ci).toBe('');
    expect(result.nombre).toBe('');
    expect(result.nombre_display).toBe('—');
    expect(result.telefono).toBe('');
    expect(result.tarjeta).toBe('');
  });
});

describe('levenshteinDistance', () => {
  it('should return 0 for identical strings', () => {
    expect(levenshteinDistance('abc', 'abc')).toBe(0);
  });

  it('should return length for empty string', () => {
    expect(levenshteinDistance('abc', '')).toBe(3);
  });

  it('should calculate correct distance', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
  });

  it('should be symmetric', () => {
    expect(levenshteinDistance('abc', 'xyz')).toBe(levenshteinDistance('xyz', 'abc'));
  });

  it('should handle single character differences', () => {
    expect(levenshteinDistance('test', 'tent')).toBe(1);
    expect(levenshteinDistance('test', 'best')).toBe(1);
  });
});

describe('similarity', () => {
  it('should return 1.0 for identical strings', () => {
    expect(similarity('abc', 'abc')).toBe(1.0);
  });

  it('should return 1.0 for empty strings', () => {
    expect(similarity('', '')).toBe(1.0);
  });

  it('should return 0.5 for half-matching', () => {
    // "abc" vs "xyz" → distance=3, len=3 → (3-3)/3 = 0
    expect(similarity('abc', 'xyz')).toBe(0);
  });

  it('should return high similarity for small edits', () => {
    // "test" vs "tent" → distance=1, len=4 → (4-1)/4 = 0.75
    expect(similarity('test', 'tent')).toBe(0.75);
  });

  it('should use longer string length', () => {
    // "ab" vs "abc" → distance=1, len=3 → (3-1)/3 = 0.667
    expect(similarity('ab', 'abc')).toBeCloseTo(0.667, 2);
  });
});
