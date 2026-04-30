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
        { id: 'v1', label: 'Escenario 1', isActive: true, color: 'blue' },
        { id: 'v2', label: 'Escenario 2', isActive: true, color: 'violet' }
    ];

    render(
      <CostSheetComparisonTable
        scenarios={mockScenarios}
        scenarioConfig={{ activeScenarios: ['v1', 'v2'], primaryScenarioId: 'v1', comparisonBaseId: 'v1' }}
        sections={[]}
        calcV1={{ calculatedValues: {} }}
        calcV2={{ calculatedValues: {} }}
        calcV3={{ calculatedValues: {} }}
      />
    );

    // Verificamos que los inputs de nombre de escenario existen con los valores correctos
    expect(screen.getAllByDisplayValue('Escenario 1').length).toBeGreaterThan(0);
    expect(screen.getAllByDisplayValue('Escenario 2').length).toBeGreaterThan(0);
  });

  it('muestra la insignia Base Delta en el escenario base', () => {
    const mockScenarios = [
        { id: 'v1', label: 'Escenario 1', isActive: true, color: 'blue' },
    ];

    render(
      <CostSheetComparisonTable
        scenarios={mockScenarios}
        scenarioConfig={{ activeScenarios: ['v1'], primaryScenarioId: 'v1', comparisonBaseId: 'v1' }}
        sections={[]}
        calcV1={{ calculatedValues: {} }}
      />
    );

    // Usamos getAllByText y verificamos que al menos uno es el badge
    const badges = screen.getAllByText('Base Δ');
    expect(badges.length).toBeGreaterThan(0);
  });
});
