import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCostSheetCalculator } from '../logic/useCostSheetCalculator';
import { CostSheetDataContract, CostSheetDataFactory } from '@/contracts';

// Mock del store de Zustand
vi.mock('@/store/cost-sheet-store', () => ({
  useCostSheetStore: (cb: any) => cb({ _hasHydrated: true })
}));

const baseTemplate: CostSheetDataContract = CostSheetDataFactory.create({
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

describe('useCostSheetCalculator - Indirect Costs Complete', () => {
  it('should apply coefficient correctly with recursive propagation and parent safety', async () => {
    const template: CostSheetDataContract = {
        ...baseTemplate,
        sections: [
            {
                id: 'sec-affected',
                label: 'Affected Section',
                rows: [
                    {
                        id: 'parent',
                        label: 'Parent',
                        children: [
                            { id: 'child', label: 'Child', value: 100, valorHistorico: 100, calculationMethod: 'ValorFijo' }
                        ]
                    }
                ]
            },
            {
                id: 'sec-base',
                label: 'Base Section',
                rows: [
                    { id: 'base-row', label: 'Base Row', value: 50, valorHistorico: 50, calculationMethod: 'ValorFijo' }
                ]
            }
        ],
        indirectConfig: {
            mode: 'coefficient',
            selectedSections: ['sec-affected'],
            baseSection: 'sec-base',
            coefficient: 1.20,
            fixedAmount: 0
        }
    };

    vi.useFakeTimers();
    const { result } = renderHook(() => useCostSheetCalculator(template as any));

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // 1. Child in affected section should have CI applied
    expect(result.current.calculatedValues['child']?.metadata?.appliedFormula).toBe('VH * 1.2');
    expect(result.current.calculatedValues['child']?.total).toBe(120);

    // 2. Parent in affected section should sum children but NOT apply CI to itself
    expect(result.current.calculatedValues['parent']?.metadata?.appliedFormula).toBe('sum(children)');
    expect(result.current.calculatedValues['parent']?.total).toBe(120);
  });
});
