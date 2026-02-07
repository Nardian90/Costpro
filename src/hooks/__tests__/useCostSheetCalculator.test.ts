import { renderHook, act } from '@testing-library/react';
import { useCostSheetCalculator } from "../logic/useCostSheetCalculator";
import { describe, it, expect } from 'vitest';
import { CostSheetData } from '@/types/cost-sheet';

const baseTemplate: CostSheetData = {
  header: {
    code: 'T-001',
    name: 'Test Sheet',
    date: '2023-01-01',
    category: 'General',
    type: 'Production',
    quantity: 100,
    currency: 'CUP',
    unit: 'kg',
    production_date: '2023-01-01',
    product_name: 'Test Product',
  },
  sections: [],
  annexes: [],
  signature: { prepared_by: 'Test User', approved_by: 'Test Approver' },
};

describe('useCostSheetCalculator', () => {
  it('should handle empty sections without errors', () => {
    const { result } = renderHook(() => useCostSheetCalculator(baseTemplate));
    expect(result.current.calculatedValues).toEqual({});
  });

  it('should calculate ValorFijo correctly', () => {
    const template: CostSheetData = {
      ...baseTemplate,
      sections: [{
        id: 's1',
        label: 'Section 1',
        rows: [{ id: 'r1', label: 'Row 1', valorHistorico: 500, calculationMethod: 'ValorFijo' }]
      }]
    };
    const { result } = renderHook(() => useCostSheetCalculator(template));
    expect(result.current.calculatedValues['r1'].total).toBe(500);
  });

  it('should handle zero and large numbers for valorHistorico', () => {
    const template: CostSheetData = {
      ...baseTemplate,
      sections: [{
        id: 's1',
        label: 'Section 1',
        rows: [
          { id: 'r1', label: 'Row 1', valorHistorico: 0, calculationMethod: 'ValorFijo' },
          { id: 'r2', label: 'Row 2', valorHistorico: 999999999, calculationMethod: 'ValorFijo' }
        ]
      }]
    };
    const { result } = renderHook(() => useCostSheetCalculator(template));
    expect(result.current.calculatedValues['r1'].total).toBe(0);
    expect(result.current.calculatedValues['r2'].total).toBe(999999999);
  });

  it('should calculate formula with ref() correctly', () => {
    const template: CostSheetData = {
        ...baseTemplate,
        sections: [{
            id: 's1',
            label: 'Section 1',
            rows: [
                { id: 'r1', label: 'Row 1', valorHistorico: 1000, calculationMethod: 'ValorFijo' },
                { id: 'r2', label: 'Row 2', formula: 'ref("r1") * 0.2' }
            ]
        }]
    };
    const { result } = renderHook(() => useCostSheetCalculator(template));
    expect(result.current.calculatedValues['r2'].total).toBe(200);
  });

  it('should handle nested children calculations (sum)', () => {
    const template: CostSheetData = {
      ...baseTemplate,
      sections: [{
        id: 's1',
        label: 'Section 1',
        rows: [{
          id: 'parent',
          label: 'Parent',
          children: [
            { id: 'c1', label: 'Child 1', valorHistorico: 150, calculationMethod: 'ValorFijo' },
            { id: 'c2', label: 'Child 2', valorHistorico: 250, calculationMethod: 'ValorFijo' }
          ]
        }]
      }]
    };
    const { result } = renderHook(() => useCostSheetCalculator(template));
    expect(result.current.calculatedValues['parent'].total).toBe(400);
  });

  it('should calculate Prorrateo based on annex and row references', () => {
    const template: CostSheetData = {
      ...baseTemplate,
      sections: [{
        id: 's1',
        label: 'Prorrateo Section',
        rows: [
          { id: 'base_row', label: 'Base Row', valorHistorico: 10000, calculationMethod: 'ValorFijo' },
          {
            id: 'prorrateo_row',
            label: 'Prorrateo Row',
            valorHistorico: 2000,
            calculationMethod: 'Prorrateo',
            baseDeCalculoRef: 'base_row' // Referencing another row
          }
        ]
      }],
      annexes: [{
        id: 'annex1',
        title: 'Annex 1',
        columns: [{ key: 'name', title: 'Name' }, { key: 'amount', title: 'Amount' }],
        data: [{ name: 'Item 1', amount: 500 }, { name: 'Item 2', amount: 1500 }]
      }]
    };

    const { result } = renderHook(() => useCostSheetCalculator(template));

    // Test prorrateo based on another row
    // Coeficiente = 2000 / 10000 = 0.2
    // Total = 0.2 * 10000 = 2000
    expect(result.current.calculatedValues['prorrateo_row'].coeficiente).toBe(0.2);
    expect(result.current.calculatedValues['prorrateo_row'].total).toBe(2000);

    // Now, create a row that references the annex
    const template2: CostSheetData = {
        ...template,
        sections: [...template.sections, {
            id: 's2',
            label: 'Annex Prorrateo',
            rows: [{
                id: 'annex_prorrateo',
                label: 'Annex Prorrateo Row',
                valorHistorico: 500,
                calculationMethod: 'Prorrateo',
                baseDeCalculoRef: 'annex1' // Referencing an annex
            }]
        }]
    };

    const { result: result2 } = renderHook(() => useCostSheetCalculator(template2));

    // Annex total = 500 + 1500 = 2000
    // Coeficiente = 500 / 2000 = 0.25
    // Total = 0.25 * 2000 = 500
    expect(result2.current.annexTotals['annex1']).toBe(2000);
    expect(result2.current.calculatedValues['annex_prorrateo'].coeficiente).toBe(0.25);
    expect(result2.current.calculatedValues['annex_prorrateo'].total).toBe(500);
  });

  it('should return 0 for invalid refs or formulas', () => {
    const template: CostSheetData = {
        ...baseTemplate,
        sections: [{
            id: 's1',
            label: 'Section 1',
            rows: [
                { id: 'r1', label: 'Row 1', formula: 'ref("non_existent_row") * 10' },
                { id: 'r2', label: 'Row 2', formula: 'invalidJsCode()' }
            ]
        }]
    };
    const { result } = renderHook(() => useCostSheetCalculator(template));
    expect(result.current.calculatedValues['r1'].total).toBe(0);
    expect(result.current.calculatedValues['r2'].total).toBe(0);
  });

  it('should handle numeric formulas correctly (manual total override)', () => {
    const template: CostSheetData = {
        ...baseTemplate,
        sections: [{
            id: 's1',
            label: 'Section 1',
            rows: [
                { id: 'r1', label: 'Row 1', formula: '100', calculationMethod: 'FORMULA' },
                { id: 'r2', label: 'Row 2', formula: '0', calculationMethod: 'FORMULA' }
            ]
        }]
    };
    const { result } = renderHook(() => useCostSheetCalculator(template));
    expect(result.current.calculatedValues['r1'].total).toBe(100);
    expect(result.current.calculatedValues['r2'].total).toBe(0);
  });

  it('should calculate header fields automatically and with formulas', () => {
    const template: CostSheetData = {
        ...baseTemplate,
        header: {
            ...baseTemplate.header,
            quantity: 50,
            production_level: 100,
            capacity_utilization: 0, // Should be calculated to 0.5
            code: '=GET_ANEXO_DATO("annex1", "1.1", "no")',
            product_code: '=GET_ANEXO_DATO("annex1", "1.1", "desc")',
            sale_price: '=GET_FILA_DATO("r1", "total")'
        },
        annexes: [{
            id: 'annex1',
            title: 'Annex 1',
            columns: [{ key: 'classification', title: 'Class' }, { key: 'no', title: 'No' }, { key: 'desc', title: 'Desc' }],
            data: [{ classification: '1.1', no: 'FC-999', desc: 'PROD-777' }]
        }],
        sections: [{
            id: 's1',
            rows: [{ id: 'r1', label: 'Row 1', valorHistorico: 1234.56, calculationMethod: 'ValorFijo' }]
        }]
    };

    const { result } = renderHook(() => useCostSheetCalculator(template));

    expect(result.current.calculatedHeader.capacity_utilization).toBe(50);
    expect(result.current.calculatedHeader.code).toBe('FC-999');
    expect(result.current.calculatedHeader.product_code).toBe('PROD-777');
    expect(result.current.calculatedHeader.sale_price).toBe(1234.56);
  });
});
