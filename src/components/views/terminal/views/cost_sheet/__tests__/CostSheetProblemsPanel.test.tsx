import { render, screen } from '@testing-library/react';
import { CostSheetProblemsPanel } from '../CostSheetProblemsPanel';
import { describe, it, expect } from 'vitest';

describe('CostSheetProblemsPanel', () => {
  const mockProblems = [
    { type: 'CRITICAL' as const, message: 'Falta valor base', rowId: 'row-1', code: 'MISSING_REF' as const },
    { type: 'WARNING' as const, message: 'Revisar coeficientes', rowId: 'row-2', code: 'SEMANTIC_DISCREPANCY' as const }
  ];

  it('renderiza la barra de KPIs', () => {
    render(<CostSheetProblemsPanel problems={mockProblems} />);
    expect(screen.getByText('Precio Venta')).toBeInTheDocument();
    expect(screen.getByText('Unitario')).toBeInTheDocument();
    expect(screen.getByText('% Utilidad')).toBeInTheDocument();
  });

  it('muestra el contador de problemas si no está en vista de auditoría', () => {
    render(<CostSheetProblemsPanel problems={mockProblems} isAuditView={false} />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
