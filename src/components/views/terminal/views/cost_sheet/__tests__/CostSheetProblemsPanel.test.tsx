import { render, screen } from '@testing-library/react';
import { CostSheetProblemsPanel } from '../CostSheetProblemsPanel';
import { describe, it, expect } from 'vitest';

describe('CostSheetProblemsPanel', () => {
  const mockProblems = [
    { type: 'CRITICAL' as const, message: 'Falta valor base', rowId: 'row-1', code: 'MISSING_REF' as const },
    { type: 'WARNING' as const, message: 'Revisar coeficientes', rowId: 'row-2', code: 'SEMANTIC_DISCREPANCY' as const }
  ];

  it('renderiza KPIs básicos', () => {
    render(<CostSheetProblemsPanel problems={mockProblems} />);
    expect(screen.getByText(/Precio Venta/i)).toBeInTheDocument();
    expect(screen.getByText(/Unitario/i)).toBeInTheDocument();
  });

  it('muestra el número de problemas críticos si existen', () => {
    render(<CostSheetProblemsPanel problems={mockProblems} />);
    // 1 critical + 1 warning. Component shows critical count (1) in the badge
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('muestra el número de advertencias si no hay críticos', () => {
    const warningsOnly = [
        { type: 'WARNING' as const, message: 'Revisar', rowId: 'row-2', code: 'SEMANTIC_DISCREPANCY' as const }
    ];
    render(<CostSheetProblemsPanel problems={warningsOnly} />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
