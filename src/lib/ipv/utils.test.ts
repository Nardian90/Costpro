import { describe, it, expect } from 'vitest';
import { extractCommission, standardizeDate, isProductAMedida, classifyGroupHierarchy } from './utils';

describe('extractCommission', () => {
  it('should extract commission from "Comi 10.50"', () => {
    expect(extractCommission('Comi 10.50')).toBe(1050);
  });

  it('should extract commission from "comision: 25"', () => {
    expect(extractCommission('comision: 25')).toBe(2500);
  });

  it('should extract commission from "Comisión: 5.25"', () => {
    expect(extractCommission('Comisión: 5.25')).toBe(525);
  });

  it('should extract commission from "COMI 100"', () => {
    expect(extractCommission('COMI 100')).toBe(10000);
  });

  it('should return 0 when no commission pattern found', () => {
    expect(extractCommission('Transferencia de: Juan Perez')).toBe(0);
  });

  it('should return 0 for empty/null input', () => {
    expect(extractCommission('')).toBe(0);
    expect(extractCommission(null as any)).toBe(0);
    expect(extractCommission(undefined as any)).toBe(0);
  });

  it('should extract commission with integer values', () => {
    expect(extractCommission('comision 7')).toBe(700);
  });

  it('should extract commission from mixed text', () => {
    expect(extractCommission('DEPOSITO TRANSF. COMISIÓN: 12.30 EFECTIVO')).toBe(1230);
  });
});

describe('standardizeDate', () => {
  it('should convert DD/MM/YYYY to YYYY-MM-DD', () => {
    expect(standardizeDate('15/03/2024')).toBe('2024-03-15');
  });

  it('should convert DD/MM/YY to YYYY-MM-DD (20XX)', () => {
    expect(standardizeDate('01/01/25')).toBe('2025-01-01');
  });

  it('should pad single-digit day/month', () => {
    expect(standardizeDate('5/3/2024')).toBe('2024-03-05');
  });

  it('should return YYYY-MM-DD unchanged', () => {
    expect(standardizeDate('2024-06-15')).toBe('2024-06-15');
  });

  it('should return empty string for empty input', () => {
    expect(standardizeDate('')).toBe('');
    expect(standardizeDate(null as any)).toBe('');
  });
});

describe('isProductAMedida', () => {
  it('should return true for "m"', () => {
    expect(isProductAMedida('m')).toBe(true);
  });

  it('should return true for "M2" (case insensitive)', () => {
    expect(isProductAMedida('M2')).toBe(true);
  });

  it('should return true for "kg" and "lb"', () => {
    expect(isProductAMedida('kg')).toBe(true);
    expect(isProductAMedida('lb')).toBe(true);
  });

  it('should return true for "m3"', () => {
    expect(isProductAMedida('m3')).toBe(true);
  });

  it('should return false for "UNIDADES"', () => {
    expect(isProductAMedida('UNIDADES')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isProductAMedida('')).toBe(false);
    expect(isProductAMedida(null as any)).toBe(false);
  });
});

describe('classifyGroupHierarchy', () => {
  it('should assign cod_hijo based on descending price order', () => {
    const products = [
      { cod: 'A', precio_cents: 5000, id_grupo: 'G1', cod_hijo: '' },
      { cod: 'B', precio_cents: 3000, id_grupo: 'G1', cod_hijo: '' },
      { cod: 'C', precio_cents: 1000, id_grupo: 'G1', cod_hijo: '' },
    ] as any[];

    const result = classifyGroupHierarchy(products);

    const prodA = result.find(p => p.cod === 'A');
    const prodB = result.find(p => p.cod === 'B');
    const prodC = result.find(p => p.cod === 'C');

    expect(prodA!.cod_hijo).toBe('B');
    expect(prodB!.cod_hijo).toBe('C');
    expect(prodC!.cod_hijo).toBeUndefined();
  });

  it('should not overwrite existing cod_hijo', () => {
    const products = [
      { cod: 'A', precio_cents: 5000, id_grupo: 'G1', cod_hijo: 'X' },
      { cod: 'B', precio_cents: 3000, id_grupo: 'G1', cod_hijo: '' },
    ] as any[];

    const result = classifyGroupHierarchy(products);
    expect(result.find(p => p.cod === 'A')!.cod_hijo).toBe('X');
  });

  it('should handle products without id_grupo', () => {
    const products = [
      { cod: 'A', precio_cents: 5000, id_grupo: '', cod_hijo: '' },
      { cod: 'B', precio_cents: 3000, id_grupo: '', cod_hijo: '' },
    ] as any[];

    const result = classifyGroupHierarchy(products);
    expect(result.find(p => p.cod === 'A')!.cod_hijo).toBe('');
  });

  it('should handle multiple groups independently', () => {
    const products = [
      { cod: 'A', precio_cents: 5000, id_grupo: 'G1', cod_hijo: '' },
      { cod: 'B', precio_cents: 3000, id_grupo: 'G1', cod_hijo: '' },
      { cod: 'C', precio_cents: 8000, id_grupo: 'G2', cod_hijo: '' },
      { cod: 'D', precio_cents: 2000, id_grupo: 'G2', cod_hijo: '' },
    ] as any[];

    const result = classifyGroupHierarchy(products);

    expect(result.find(p => p.cod === 'A')!.cod_hijo).toBe('B');
    expect(result.find(p => p.cod === 'C')!.cod_hijo).toBe('D');
  });
});
