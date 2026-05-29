import { render, screen, fireEvent } from '@testing-library/react';
import { CostSheetProblemsPanel } from '../CostSheetProblemsPanel';
import { describe, it, expect, vi } from 'vitest';

describe('CostSheetProblemsPanel', () => {
  const mockProblems = [
    { type: 'CRITICAL' as const, message: 'Falta valor base', rowId: 'row-1', code: 'MISSING_REF' as const },
    { type: 'WARNING' as const, message: 'Revisar coeficientes', rowId: 'row-2', code: 'SEMANTIC_DISCREPANCY' as const }
  ];

  it('no renderiza badge de alertas si no hay problemas', () => {
    render(<CostSheetProblemsPanel problems={[]} />);
    // The panel always renders KPIs, but badge should be absent
    expect(screen.queryByRole('button', { name: /problemas/i })).toBeNull();
  });

  it('muestra el número de problemas críticos si existen', () => {
    render(<CostSheetProblemsPanel problems={mockProblems} />);
    // Should show '1' because there's 1 critical problem (priority is given to critical count in badge)
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('llama a onGoToAudit al hacer click en el badge', () => {
    const onGoToAudit = vi.fn();
    render(<CostSheetProblemsPanel problems={mockProblems} onGoToAudit={onGoToAudit} />);
    fireEvent.click(screen.getByRole('button', { name: /problemas/i }));
    expect(onGoToAudit).toHaveBeenCalled();
  });

  it('renderiza botón de volver si es vista de auditoría', () => {
    const onGoBack = vi.fn();
    render(<CostSheetProblemsPanel problems={mockProblems} isAuditView={true} onGoBack={onGoBack} />);
    expect(screen.getByLabelText(/volver/i)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/volver/i));
    expect(onGoBack).toHaveBeenCalled();
  });
});
