import { describe, it, expect } from 'vitest';
import { normalizeName, similarity } from '../normalization';

describe('Normalization', () => {
    it('should normalize names correctly', () => {
        expect(normalizeName('  José   María  ')).toBe('JOSE MARIA');
        expect(normalizeName('Áéíóú ñ')).toBe('AEIOU N');
        expect(normalizeName('Juan-Pérez #123')).toBe('JUANPEREZ 123');
    });
});

describe('Similarity', () => {
    it('should calculate similarity correctly', () => {
        expect(similarity('JOSE', 'JOSE')).toBe(1);
        expect(similarity('JOSE', 'JOSE MARIA')).toBe(4/10);
        expect(similarity('JUAN PEREZ', 'JUAN PERES')).toBeGreaterThan(0.85);
    });
});
