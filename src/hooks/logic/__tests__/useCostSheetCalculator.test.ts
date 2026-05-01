import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCostSheetCalculator } from '../useCostSheetCalculator';
import { CostSheetDataContract, CostSheetDataFactory, CostSheetRowFactory, CostSheetSectionFactory } from '@/contracts';

const createBaseTemplate = (): CostSheetDataContract => CostSheetDataFactory.create({
    header: {
        code: 'T-001',
        name: 'Test',
        date: '2024-01-01',
        quantity: 1,
        currency: 'CUP',
        category: '',
        type: '',
        unit: 'u',
        product_code: 'P-001',
        company: '',
        organism: '',
        union: '',
        destination: '',
        production_level: 1,
        capacity_utilization: 100,
        sale_price: 0,
        client: ''
    }
});

describe('useCostSheetCalculator', () => {
  describe('cálculo de totales', () => {
    it('calcula el total de una fila con formula simple', () => {
      const template = createBaseTemplate();
      template.sections = [
        CostSheetSectionFactory.create({
          id: 's1',
          rows: [
            CostSheetRowFactory.create({
              id: 'r1',
              calculationMethod: 'ValorFijo',
              value: 10,
            })
          ]
        })
      ];

      const { result } = renderHook(() => useCostSheetCalculator(template));
      expect(result.current.calculatedValues['r1'].total).toBe(10);
    });

    it('calcula totales de sección sumando filas hijas', () => {
      const template = createBaseTemplate();
      template.sections = [
        CostSheetSectionFactory.create({
          id: 's1',
          rows: [
            CostSheetRowFactory.create({
              id: 'parent',
              calculationMethod: 'Prorrateo',
              children: [
                CostSheetRowFactory.create({ id: 'c1', value: 40, calculationMethod: 'ValorFijo' }),
                CostSheetRowFactory.create({ id: 'c2', value: 60, calculationMethod: 'ValorFijo' })
              ]
            })
          ]
        })
      ];

      const { result } = renderHook(() => useCostSheetCalculator(template));
      expect(result.current.calculatedValues['parent'].total).toBe(100);
    });

    it('detecta dependencias circulares', () => {
       const template = createBaseTemplate();
       template.sections = [
         CostSheetSectionFactory.create({
           id: 's1',
           rows: [
             CostSheetRowFactory.create({ id: 'r1', calculationMethod: 'FORMULA', totalFormula: 'ref("r2") + 1' }),
             CostSheetRowFactory.create({ id: 'r2', calculationMethod: 'FORMULA', totalFormula: 'ref("r1") + 1' })
           ]
         })
       ];

       const { result } = renderHook(() => useCostSheetCalculator(template));
       expect(result.current.audits.some(a => a.type === 'CYCLE_DETECTED')).toBe(true);
    });
  });

  describe('Propagación de Indirectos', () => {
    it('aplica coeficiente correctamente con propagación recursiva', () => {
        const template = createBaseTemplate();
        template.sections = [
            {
                id: 'sec-affected',
                label: 'Affected Section',
                rows: [
                    CostSheetRowFactory.create({
                        id: 'parent',
                        children: [
                            CostSheetRowFactory.create({ id: 'child', value: 100, calculationMethod: 'ValorFijo' })
                        ]
                    })
                ]
            },
            {
                id: 'sec-base',
                label: 'Base Section',
                rows: [
                    CostSheetRowFactory.create({ id: 'base-row', value: 50, calculationMethod: 'ValorFijo' })
                ]
            }
        ];
        template.indirectConfig = {
            mode: 'coefficient',
            selectedSections: ['sec-affected'],
            baseSection: 'sec-base',
            coefficient: 1.20,
            fixedAmount: 0
        };

        const { result } = renderHook(() => useCostSheetCalculator(template));

        expect(result.current.calculatedValues['child'].total).toBe(120);
        expect(result.current.calculatedValues['parent'].total).toBe(120);
    });
  });
});
