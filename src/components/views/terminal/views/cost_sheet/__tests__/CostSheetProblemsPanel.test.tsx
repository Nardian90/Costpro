import { render, screen, fireEvent } from '@testing-library/react';
import { CostSheetProblemsPanel } from '../CostSheetProblemsPanel';
import { describe, it, expect, vi } from 'vitest';

describe('CostSheetProblemsPanel', () => {
  const mockProblems = [
    { type: 'CRITICAL' as const, message: 'Falta valor base', rowId: 'row-1', code: 'MISSING_REF' as const },
    { type: 'WARNING' as const, message: 'Revisar coeficientes', rowId: 'row-2', code: 'SEMANTIC_DISCREPANCY' as const }
  ];

  it('siempre renderiza la barra de KPIs', () => {
    const { container } = render(<CostSheetProblemsPanel problems={[]} />);
    expect(container.firstChild).not.toBeNull();
    expect(screen.getByText('Precio Venta')).toBeInTheDocument();
    expect(screen.getByText('Unitario')).toBeInTheDocument();
    expect(screen.getByText('% Utilidad')).toBeInTheDocument();
  });

  it('muestra el badge de alerta si hay problemas', () => {
    render(<CostSheetProblemsPanel problems={mockProblems} />);
    // Debería mostrar el número de problemas críticos (1 en este caso)
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('llama a onGoToAudit al hacer click en el badge de problemas', () => {
    const onGoToAudit = vi.fn();
    render(<CostSheetProblemsPanel problems={mockProblems} onGoToAudit={onGoToAudit} />);

    const alertButton = screen.getByRole('button', { name: /problemas. Ir a Auditoría./i });
    fireEvent.click(alertButton);

    expect(onGoToAudit).toHaveBeenCalled();
  });

  it('muestra el botón de volver si isAuditView es true', () => {
    const onGoBack = vi.fn();
    render(<CostSheetProblemsPanel problems={[]} isAuditView={true} onGoBack={onGoBack} />);

    const backButton = screen.getByRole('button', { name: /volver a la vista anterior/i });
    expect(backButton).toBeInTheDocument();

    fireEvent.click(backButton);
    expect(onGoBack).toHaveBeenCalled();
  });
});
