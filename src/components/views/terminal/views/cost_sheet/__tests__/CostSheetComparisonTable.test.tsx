import { render, screen } from '@testing-library/react';
import { CostSheetComparisonTable } from '../CostSheetComparisonTable';
import { useScenarioStore } from '@/store/scenario-store';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/store/scenario-store', () => ({
  useScenarioStore: vi.fn(),
}));

// Mock para simplificar el renderizado
vi.mock('../MobileScenarioCards', () => ({
  default: () => <div data-testid="mobile-cards">Mobile View</div>
}));

// Mock de Tooltip para evitar problemas con TooltipProvider
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: any) => <div>{children}</div>,
  TooltipTrigger: ({ children }: any) => <div>{children}</div>,
  TooltipContent: ({ children }: any) => <div>{children}</div>,
  TooltipProvider: ({ children }: any) => <div>{children}</div>,
}));

describe('CostSheetComparisonTable', () => {
  beforeEach(() => {
    vi.mocked(useScenarioStore).mockReturnValue({
      activeScenarioIds: ['v1', 'v2'],
      setComparisonBase: vi.fn(),
      createScenario: vi.fn(),
      renameScenario: vi.fn(),
    } as any);
  });

  it('renderiza las columnas de los escenarios activos', () => {
    const mockScenarios = [
        { id: 'v1' as const, label: 'Escenario 1', isActive: true, color: 'blue' as const, createdAt: Date.now(), values: {} },
        { id: 'v2' as const, label: 'Escenario 2', isActive: true, color: 'violet' as const, createdAt: Date.now(), values: {} }
    ];

    render(
      <CostSheetComparisonTable
        scenarios={mockScenarios}
        scenarioConfig={{ primaryScenarioId: 'v1', comparisonBaseId: 'v1' }}
        sections={[]}
        calcV1={{ calculatedValues: {} }}
        calcV2={{ calculatedValues: {} }}
        calcV3={{ calculatedValues: {} }}
        onUpdateRowValue={vi.fn()}
        onScenarioAction={vi.fn()}
      />
    );

    // Verificamos que los inputs de nombre de escenario existen con los valores correctos
    expect(screen.getAllByDisplayValue('Escenario 1').length).toBeGreaterThan(0);
    expect(screen.getAllByDisplayValue('Escenario 2').length).toBeGreaterThan(0);
  });

  it('muestra la insignia Base Delta en el escenario base', () => {
    const mockScenarios = [
        { id: 'v1' as const, label: 'Escenario 1', isActive: true, color: 'blue' as const, createdAt: Date.now(), values: {} },
    ];

    render(
      <CostSheetComparisonTable
        scenarios={mockScenarios}
        scenarioConfig={{ primaryScenarioId: 'v1', comparisonBaseId: 'v1' }}
        sections={[]}
        calcV1={{ calculatedValues: {} }}
        onUpdateRowValue={vi.fn()}
        onScenarioAction={vi.fn()}
      />
    );

    // Usamos getAllByText y verificamos que al menos uno es el badge
    const badges = screen.getAllByText('Base Δ');
    expect(badges.length).toBeGreaterThan(0);
  });
});
