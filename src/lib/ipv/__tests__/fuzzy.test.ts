import { describe, it, expect } from 'vitest';
import { fuzzySimilarity } from '../utils';

describe('Fuzzy Similarity', () => {
    it('should calculate high similarity for similar strings', () => {
        expect(fuzzySimilarity('CERVEZA CRISTAL', 'CERVEZA CRISTAL 350ML')).toBeGreaterThan(0.6);
        expect(fuzzySimilarity('REFRESCO COLA', 'REFRECO COLA')).toBeGreaterThan(0.8);
    });

    it('should calculate low similarity for different strings', () => {
        expect(fuzzySimilarity('CERVEZA', 'PAN')).toBeLessThan(0.3);
    });
});
