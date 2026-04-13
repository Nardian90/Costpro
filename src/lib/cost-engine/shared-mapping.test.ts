import { describe, it, expect } from 'vitest';
import {
  evaluateAnnexExpressionShared,
  evaluateHeaderExpressionShared,
  buildVHSums,
  buildEngineRows,
  calculateAnnexesPure,
  assembleFichaJSON,
} from './shared-mapping';

describe('shared-mapping', () => {
  describe('evaluateAnnexExpressionShared', () => {
    it('returns 0 for null/empty expression', () => {
      expect(evaluateAnnexExpressionShared(null as any, {}, {}, [])).toBe(0);
      expect(evaluateAnnexExpressionShared(undefined as any, {}, {}, [])).toBe(0);
      expect(evaluateAnnexExpressionShared('', {}, {}, [])).toBe(0);
    });
    it('returns number directly', () => {
      expect(evaluateAnnexExpressionShared(42, {}, {}, [])).toBe(42);
    });
    it('parses plain numbers', () => {
      expect(evaluateAnnexExpressionShared('123.45', {}, {}, [])).toBe(123.45);
    });
    it('evaluates simple arithmetic', () => {
      expect(evaluateAnnexExpressionShared('=2 + 3', {}, {}, [])).toBe(5);
    });
    it('replaces row data variables', () => {
      const rowData = { precio: 10, cantidad: 5 };
      expect(evaluateAnnexExpressionShared('=precio * cantidad', rowData, {}, [])).toBe(50);
    });
    it('replaces header variables', () => {
      const header = { quantity: 100 };
      expect(evaluateAnnexExpressionShared('=QUANTITY * 2', {}, header, [])).toBe(200);
    });
    it('handles TotalAnexo prefix', () => {
      const annexes = [{
        id: 'I',
        data: [
          { total: 100 },
          { total: 200 },
        ],
      }];
      const result = evaluateAnnexExpressionShared('=TotalAnexoI', {}, {}, annexes);
      expect(result).toBe(300);
    });
    it('collects warnings on evaluation error', () => {
      const warnings: string[] = [];
      const result = evaluateAnnexExpressionShared('=invalidFn()', {}, {}, [], undefined, warnings);
      expect(result).toBe(0);
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  describe('evaluateHeaderExpressionShared', () => {
    it('returns non-formula strings as-is', () => {
      expect(evaluateHeaderExpressionShared('Hello', {}, [])).toBe('Hello');
    });
    it('evaluates formula expressions', () => {
      const header = { price: 5, multiplier: 10 };
      const result = evaluateHeaderExpressionShared('=price * multiplier', header, []);
      expect(result).toBe(50);
    });
  });

  describe('buildVHSums', () => {
    it('sums children recursively', () => {
      const sections = [{
        id: '1',
        rows: [{
          id: '1.1',
          valorHistorico: 100,
          children: [],
        }, {
          id: '1.2',
          children: [{
            id: '1.2.1',
            valorHistorico: 50,
            children: [],
          }, {
            id: '1.2.2',
            valorHistorico: 30,
            children: [],
          }],
        }],
      }];
      const vh = buildVHSums(sections);
      expect(vh['1.1']).toBe(100);
      expect(vh['1.2.1']).toBe(50);
      expect(vh['1.2.2']).toBe(30);
      expect(vh['1.2']).toBe(80); // 50 + 30 (sum of children)
      expect(vh['1']).toBe(180); // 100 + 80
    });

    it('respects ValorFijo for parent rows', () => {
      const sections = [{
        id: '1',
        rows: [{
          id: '1.1',
          valorHistorico: 999,
          calculationMethod: 'ValorFijo',
          children: [{
            id: '1.1.1',
            valorHistorico: 100,
            children: [],
          }],
        }],
      }];
      const vh = buildVHSums(sections);
      expect(vh['1.1']).toBe(999); // ValorFijo takes precedence
    });
  });

  describe('buildEngineRows', () => {
    it('builds flat engine rows from nested sections', () => {
      const template: any = {
        sections: [{
          id: '1',
          rows: [{
            id: '1.1',
            label: 'Material',
            value: 100,
            children: [],
          }],
        }],
        header: { quantity: 1 },
        annexes: [],
      };
      const vhSums = { '1.1': 100 };
      const rows = buildEngineRows(template, vhSums);
      expect(rows.length).toBe(1);
      expect(rows[0].id).toBe('1.1');
      expect(rows[0].classification).toBe('1.1');
      expect(rows[0].valorHistorico).toBe(100);
    });

    it('auto-assigns sum(children) for parents without ValorFijo', () => {
      const template: any = {
        sections: [{
          id: '1',
          rows: [{
            id: '1.1',
            label: 'Parent',
            children: [{
              id: '1.1.1',
              label: 'Child',
              value: 50,
              children: [],
            }],
          }],
        }],
        header: {},
        annexes: [],
      };
      const rows = buildEngineRows(template, { '1.1': 50, '1.1.1': 50 });
      expect(rows[0].formula).toBe('sum(children)');
    });

    it('does NOT assign sum(children) for ValorFijo parents', () => {
      const template: any = {
        sections: [{
          id: '1',
          rows: [{
            id: '1.1',
            label: 'Fixed Parent',
            calculationMethod: 'ValorFijo',
            totalFormula: '=100',
            children: [{
              id: '1.1.1',
              label: 'Child',
              value: 50,
              children: [],
            }],
          }],
        }],
        header: {},
        annexes: [],
      };
      const rows = buildEngineRows(template, { '1.1': 100, '1.1.1': 50 });
      expect(rows[0].formula).toBe('=100');
    });
  });

  describe('calculateAnnexesPure', () => {
    it('returns empty array for null template', () => {
      expect(calculateAnnexesPure(null as any)).toEqual([]);
    });
    it('returns empty array for template without annexes', () => {
      expect(calculateAnnexesPure({ annexes: [] } as any)).toEqual([]);
    });
    it('calculates annex totals from norm * price', () => {
      const template: any = {
        header: { quantity: 1 },
        annexes: [{
          id: 'I',
          coefficient: 1,
          isAdjustmentActive: false,
          columns: [{ key: 'norm', type: 'number' }, { key: 'price', type: 'number' }, { key: 'total', type: 'number' }],
          data: [{ norm: 10, price: 5, total: 0 }],
        }],
        sections: [],
      };
      const result = calculateAnnexesPure(template);
      expect(result[0].data[0].total).toBe(50);
    });
    it('applies coefficient to price column', () => {
      const template: any = {
        header: { quantity: 1 },
        annexes: [{
          id: 'I',
          coefficient: 2,
          isAdjustmentActive: true,
          adjustmentColumn: 'PRECIO UNITARIO',
          columns: [{ key: 'norm', type: 'number' }, { key: 'price', type: 'number' }, { key: 'total', type: 'number' }],
          data: [{ norm: 10, price: 5, total: 50 }],
        }],
        sections: [],
      };
      const result = calculateAnnexesPure(template);
      expect(result[0].data[0].price).toBe(10); // 5 * 2
      expect(result[0].data[0].total).toBe(100); // 10 * 10
    });
  });

  describe('assembleFichaJSON', () => {
    it('assembles a FichaJSON from components', () => {
      const header = { code: 'TEST', name: 'Test', currency: 'CUP', quantity: 1 };
      const annexes = [{
        id: 'I',
        title: 'Anexo I',
        data: [{ classification: '1.1', total: 100 }],
      }];
      const engineRows = [{
        id: '1',
        classification: '1.1',
        label: 'Material',
        type: 'COST' as const,
        formaCalculo: 'FIJO' as const,
        formula: null,
        valorHistorico: 100,
      }];

      const result = assembleFichaJSON(header, annexes, engineRows);
      expect(result.meta.id).toBe('TEST');
      expect(result.meta.name).toBe('Test');
      expect(result.anexos[0].id).toBe('I');
      expect(result.rows[0].id).toBe('1');
    });
  });
});
