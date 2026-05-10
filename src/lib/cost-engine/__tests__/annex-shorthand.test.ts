import { describe, it, expect } from 'vitest';
import { buildEngineRows } from '../shared-mapping';

describe('buildEngineRows shorthand annex detection', () => {
  it('detects shorthand "AnexoI" in totalFormula', () => {
    const template: any = {
      sections: [{
        id: '1',
        rows: [{
          id: '1.1.1',
          label: 'De ello: Insumos (MP)',
          totalFormula: 'AnexoI',
          children: [],
        }],
      }],
      header: { quantity: 1 },
      annexes: [{ id: 'I' }],
    };
    const vhSums = { '1.1.1': 0 };
    const rows = buildEngineRows(template, vhSums);

    expect(rows.length).toBe(1);
    expect(rows[0].formaCalculo).toBe('IMPORTAR_ANEXO');
    expect(rows[0].baseCalculo).toEqual({ type: 'ANEXO', anexoId: 'I' });
    expect(rows[0].formula).toBeUndefined();
  });

  it('detects shorthand "AnexoII" in formula (legacy)', () => {
    const template: any = {
      sections: [{
        id: '2',
        rows: [{
          id: '2.1',
          label: 'Other',
          formula: 'AnexoII',
          children: [],
        }],
      }],
      header: { quantity: 1 },
      annexes: [{ id: 'II' }],
    };
    const vhSums = { '2.1': 0 };
    const rows = buildEngineRows(template, vhSums);

    expect(rows.length).toBe(1);
    expect(rows[0].formaCalculo).toBe('IMPORTAR_ANEXO');
    expect(rows[0].baseCalculo).toEqual({ type: 'ANEXO', anexoId: 'II' });
    expect(rows[0].formula).toBeUndefined();
  });

  it('is case-insensitive for shorthand detection', () => {
    const template: any = {
      sections: [{
        id: '1',
        rows: [{
          id: '1.1.1',
          label: 'Test',
          totalFormula: 'anexoi',
          children: [],
        }],
      }],
      header: { quantity: 1 },
      annexes: [{ id: 'I' }],
    };
    const vhSums = { '1.1.1': 0 };
    const rows = buildEngineRows(template, vhSums);

    expect(rows.length).toBe(1);
    expect(rows[0].formaCalculo).toBe('IMPORTAR_ANEXO');
    expect(rows[0].baseCalculo).toEqual({ type: 'ANEXO', anexoId: 'I' });
  });

  it('does not detect shorthand if it is part of a larger formula', () => {
    const template: any = {
      sections: [{
        id: '1',
        rows: [{
          id: '1.1.1',
          label: 'Test',
          totalFormula: 'AnexoI * 0.1',
          children: [],
        }],
      }],
      header: { quantity: 1 },
      annexes: [{ id: 'I' }],
    };
    const vhSums = { '1.1.1': 0 };
    const rows = buildEngineRows(template, vhSums);

    expect(rows.length).toBe(1);
    expect(rows[0].formaCalculo).toBe('FORMULA');
    expect(rows[0].formula).toBe('AnexoI * 0.1');
  });
});
