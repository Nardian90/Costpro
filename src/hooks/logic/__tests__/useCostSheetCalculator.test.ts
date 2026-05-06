import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCostSheetCalculator } from '../useCostSheetCalculator';
import { CostSheetDataContract, CostSheetDataFactory, CostSheetRowFactory, CostSheetSectionFactory } from '@/contracts';

// Mock del store de Zustand
vi.mock('@/store/cost-sheet-store', () => ({
  useCostSheetStore: (cb: any) => cb({ _hasHydrated: true })
}));

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
  it('calcula el total de una fila con formula simple', async () => {
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

    vi.useFakeTimers();
    const { result } = renderHook(() => useCostSheetCalculator(template));

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.calculatedValues['r1']?.total).toBe(10);
    vi.useRealTimers();
  });

  it('calcula totales de sección sumando filas hijas', async () => {
    const template = createBaseTemplate();
    template.sections = [
      CostSheetSectionFactory.create({
        id: 's1',
        rows: [
          CostSheetRowFactory.create({
            id: 'parent',
            children: [
              CostSheetRowFactory.create({ id: 'c1', value: 40, calculationMethod: 'ValorFijo' }),
              CostSheetRowFactory.create({ id: 'c2', value: 60, calculationMethod: 'ValorFijo' })
            ]
          })
        ]
      })
    ];

    vi.useFakeTimers();
    const { result } = renderHook(() => useCostSheetCalculator(template));

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.calculatedValues['parent']?.total).toBe(100);
    vi.useRealTimers();
  });

  it('detecta dependencias circulares', async () => {
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

     vi.useFakeTimers();
     const { result } = renderHook(() => useCostSheetCalculator(template));

     act(() => {
       vi.advanceTimersByTime(200);
     });

     expect(result.current.audits.some(a => a.type === 'CYCLE_DETECTED')).toBe(true);
     vi.useRealTimers();
  });

  it('aplica coeficiente correctamente con propagación recursiva', async () => {
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

      vi.useFakeTimers();
      const { result } = renderHook(() => useCostSheetCalculator(template));

      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(result.current.calculatedValues['child']?.total).toBe(120);
      expect(result.current.calculatedValues['parent']?.total).toBe(120);
      vi.useRealTimers();
  });
});
