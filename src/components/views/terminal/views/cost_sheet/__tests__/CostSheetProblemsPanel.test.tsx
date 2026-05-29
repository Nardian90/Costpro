import { render, screen, fireEvent } from '@testing-library/react';
import { CostSheetProblemsPanel } from '../CostSheetProblemsPanel';
import { describe, it, expect, vi } from 'vitest';

describe('CostSheetProblemsPanel', () => {
  const mockProblems = [
    { type: 'CRITICAL' as const, message: 'Falta valor base', rowId: 'row-1', code: 'MISSING_REF' as const },
    { type: 'WARNING' as const, message: 'Revisar coeficientes', rowId: 'row-2', code: 'SEMANTIC_DISCREPANCY' as const }
  ];

  it('renderiza el panel KPI aunque no haya problemas', () => {
    render(<CostSheetProblemsPanel problems={[]} />);
    // The bar always renders with KPIs (Precio Venta, Unitario, % Utilidad)
    expect(screen.getByText('Precio Venta')).toBeInTheDocument();
    expect(screen.getByText('Unitario')).toBeInTheDocument();
    expect(screen.getByText('% Utilidad')).toBeInTheDocument();
  });

  it('muestra el badge de alerta con el número de problemas', () => {
    render(<CostSheetProblemsPanel problems={mockProblems} />);
    // The badge shows critical count (1) since there's 1 CRITICAL
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('no muestra el badge de alerta cuando isAuditView=true', () => {
    render(<CostSheetProblemsPanel problems={mockProblems} isAuditView />);
    // In audit view, the alert badge (which has critical count) is not shown
    expect(screen.queryByLabelText(/problemas/i)).not.toBeInTheDocument();
  });

  it('llama a onGoToAudit al hacer click en el badge de alertas', () => {
    const onGoToAudit = vi.fn();
    render(<CostSheetProblemsPanel problems={mockProblems} onGoToAudit={onGoToAudit} />);
    const alertBadge = screen.getByLabelText(/problemas/i);
    fireEvent.click(alertBadge);
    expect(onGoToAudit).toHaveBeenCalled();
  });

  it('muestra el botón de volver cuando isAuditView=true y onGoBack está definido', () => {
    const onGoBack = vi.fn();
    render(<CostSheetProblemsPanel problems={mockProblems} isAuditView onGoBack={onGoBack} />);
    const backButton = screen.getByLabelText('Volver a la vista anterior');
    expect(backButton).toBeInTheDocument();
    fireEvent.click(backButton);
    expect(onGoBack).toHaveBeenCalled();
  });

  it('muestra KPIs calculados a partir de calculatedValues', () => {
    const calculatedValues = {
      '14.1': { total: 1500 },
      '16.1': { total: 75 },
      '13.1': { total: 500 },
      '12.1': { total: 1000 },
    };
    render(<CostSheetProblemsPanel problems={[]} calculatedValues={calculatedValues} />);
    // Should show $1,500.00 for Precio Venta (formatAccounting uses 2 decimal places)
    expect(screen.getByText('$1,500.00')).toBeInTheDocument();
    // % Utilidad = 500/1000 = 50.0%
    expect(screen.getByText('50.0%')).toBeInTheDocument();
  });
});
