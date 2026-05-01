import { describe, it, expect } from 'vitest';
import { calculateCostSheetHealth } from './validations';

// Minimal mock data for testing
const makeRow = (total: number) => ({
  valorHistorico: 0, calculatedVH: 0, baseDeCalculoRef: null,
  baseTotal: 0, baseValorHistorico: 0, coeficiente: 0, total
} as const);

const mockCalculatedValues: Record<string, any> = {
  '1': makeRow(1000),
  '1.1': makeRow(600),
  '1.2': makeRow(400),
  '2': makeRow(500),
  '2.1': makeRow(300),
  '2.1.1': makeRow(30),
  '3': makeRow(200),
  '4': makeRow(150),
  '4.1.1': makeRow(100),
  '5': makeRow(1850),
  '5.1': makeRow(1850),
  '6': makeRow(80),
  '6.1.1': makeRow(50),
  '7': makeRow(60),
  '7.1.1': makeRow(40),
  '8': makeRow(30),
  '9': makeRow(20),
  '10': makeRow(80),
  '10.1': makeRow(70),
  '10.2': makeRow(25),
  '11': makeRow(270),
  '11.1': makeRow(270),
  '12': makeRow(2000),
  '12.1': makeRow(2000),
  '13': makeRow(200),
  '13.1': makeRow(200),
  '13.2': makeRow(2200),
  '13.3': makeRow(22),
  '14': makeRow(2200),
  '14.1': makeRow(2222),
  '15.1': makeRow(2000),
  '16.1': makeRow(2222),
};

describe('validations', () => {
  describe('calculateCostSheetHealth', () => {
    it('returns a health summary with validations array', () => {
      const mockData: any = {
        sections: [{
          id: '1',
          rows: [{
            id: '1',
            label: 'Section 1',
            children: [
              { id: '1.1', label: 'Child 1', children: [] },
              { id: '1.2', label: 'Child 2', children: [] },
            ],
          }],
        }],
        header: { quantity: 1 },
      };
      const mockHeader: any = { quantity: 1 };
      const result = calculateCostSheetHealth(mockData, mockCalculatedValues, mockHeader);
      expect(result).toHaveProperty('validations');
      expect(result).toHaveProperty('healthPercent');
      expect(result).toHaveProperty('passedCount');
      expect(result).toHaveProperty('totalCount');
      expect(Array.isArray(result.validations)).toBe(true);
      expect(typeof result.healthPercent).toBe('number');
    });

    it('handles null data gracefully', () => {
      const result = calculateCostSheetHealth(null as any, {}, {} as any);
      expect(result.healthPercent).toBe(0);
      expect(result.validations.length).toBe(0);
    });

    it('detects parent-child sum integrity', () => {
      // 1.1 (600) + 1.2 (400) = 1000 = parent '1' (1000) → should be SUCCESS
      const mockData: any = {
        sections: [{
          id: '1',
          rows: [{
            id: '1',
            label: 'Section 1',
            children: [
              { id: '1.1', label: 'Child 1', children: [] },
              { id: '1.2', label: 'Child 2', children: [] },
            ],
          }],
        }],
        header: { quantity: 1 },
      };
      const result = calculateCostSheetHealth(mockData, mockCalculatedValues, { quantity: 1 } as any);
      const integrityCheck = result.validations.find(
        (v: any) => v.category === 'Integridad Estructural' && v.rowId === '1'
      );
      expect(integrityCheck).toBeDefined();
      expect(integrityCheck!.type).toBe('SUCCESS');
    });

    it('detects negative values', () => {
      const negValues = { ...mockCalculatedValues, '1.1': makeRow(-50) };
      const mockData: any = {
        sections: [{ id: '1', rows: [{ id: '1', children: [{ id: '1.1' }], label: 'S1' }] }],
        header: { quantity: 1 },
      };
      const result = calculateCostSheetHealth(mockData, negValues, { quantity: 1 } as any);
      const negCheck = result.validations.find((v: any) => v.category === 'Integridad Matemática' && v.rowId === '1.1');
      expect(negCheck).toBeDefined();
      expect(negCheck!.type).toBe('CRITICAL');
    });

    it('detects parent-child sum mismatch', () => {
      // 1.1 (100) + 1.2 (200) = 300 ≠ parent '1' (1000) → should be CRITICAL
      const mismatchValues = {
        ...mockCalculatedValues,
        '1.1': makeRow(100),
        '1.2': makeRow(200),
      };
      const mockData: any = {
        sections: [{
          id: '1',
          rows: [{
            id: '1',
            label: 'Section 1',
            children: [
              { id: '1.1', label: 'Child 1', children: [] },
              { id: '1.2', label: 'Child 2', children: [] },
            ],
          }],
        }],
        header: { quantity: 1 },
      };
      const result = calculateCostSheetHealth(mockData, mismatchValues, { quantity: 1 } as any);
      const integrityCheck = result.validations.find(
        (v: any) => v.category === 'Integridad Estructural' && v.rowId === '1'
      );
      expect(integrityCheck).toBeDefined();
      expect(integrityCheck!.type).toBe('CRITICAL');
    });

    it('checks utility/cost ratio', () => {
      const mockData: any = {
        sections: [],
        header: { quantity: 1 },
      };
      const result = calculateCostSheetHealth(mockData, mockCalculatedValues, { quantity: 1 } as any);
      const rentCheck = result.validations.find((v: any) => v.category === 'Rentabilidad');
      expect(rentCheck).toBeDefined();
      // 13.1 total (200) / 12.1 total (2000) = 0.10 < 0.3 → SUCCESS
      expect(rentCheck!.type).toBe('SUCCESS');
    });

    it('warns on excessive utility ratio', () => {
      const highUtilValues = {
        ...mockCalculatedValues,
        '13': makeRow(1000),
        '13.1': makeRow(1500), // 1500/2000 = 0.75 > 0.3
      };
      const mockData: any = {
        sections: [],
        header: { quantity: 1 },
      };
      const result = calculateCostSheetHealth(mockData, highUtilValues, { quantity: 1 } as any);
      const rentCheck = result.validations.find((v: any) => v.category === 'Rentabilidad');
      expect(rentCheck).toBeDefined();
      expect(rentCheck!.type).toBe('WARNING');
    });

    it('computes healthPercent as percentage of passed validations', () => {
      const mockData: any = {
        sections: [{
          id: '1',
          rows: [{
            id: '1',
            label: 'Section 1',
            children: [
              { id: '1.1', label: 'Child 1', children: [] },
              { id: '1.2', label: 'Child 2', children: [] },
            ],
          }],
        }],
        header: { quantity: 1 },
      };
      const result = calculateCostSheetHealth(mockData, mockCalculatedValues, { quantity: 1 } as any);
      expect(result.healthPercent).toBeGreaterThanOrEqual(0);
      expect(result.healthPercent).toBeLessThanOrEqual(100);
      expect(result.passedCount).toBeLessThanOrEqual(result.totalCount);
      expect(result.totalCount).toBeGreaterThan(0);
    });
  });
});
