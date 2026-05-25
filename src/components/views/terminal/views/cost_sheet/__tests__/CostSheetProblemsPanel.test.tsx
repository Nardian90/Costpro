import { render, screen, fireEvent } from '@testing-library/react';
import { CostSheetProblemsPanel } from '../CostSheetProblemsPanel';
import { describe, it, expect, vi } from 'vitest';

describe('CostSheetProblemsPanel', () => {
  const mockProblems = [
    { type: 'CRITICAL' as const, message: 'Falta valor base', rowId: 'row-1', code: 'MISSING_REF' as const },
    { type: 'WARNING' as const, message: 'Revisar coeficientes', rowId: 'row-2', code: 'SEMANTIC_DISCREPANCY' as const }
  ];

  it('no muestra el badge de alerta si no hay problemas accionables', () => {
    render(<CostSheetProblemsPanel problems={[]} />);
    // El panel ahora siempre renderiza la barra de KPIs, pero no el badge de alerta
    expect(screen.queryByRole('button', { name: /problemas/i })).toBeNull();
    expect(screen.getByText(/Precio Venta/i)).toBeInTheDocument();
  });

  it('muestra el badge con el número de problemas críticos si existen', () => {
    render(<CostSheetProblemsPanel problems={mockProblems} />);
    // Muestra '1' porque solo hay un problema CRITICAL y el badge prioriza críticos
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('muestra el badge con advertencias si no hay críticos', () => {
    const onlyWarnings = [
      { type: 'WARNING' as const, message: 'Revisar algo', rowId: 'row-3', code: 'SEMANTIC_DISCREPANCY' as const }
    ];
    render(<CostSheetProblemsPanel problems={onlyWarnings} />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('llama a onGoToAudit al hacer click en el badge de alerta', () => {
    const onGoToAudit = vi.fn();
    render(<CostSheetProblemsPanel problems={mockProblems} onGoToAudit={onGoToAudit} />);

    const alertBadge = screen.getByRole('button', { name: /problemas/i });
    fireEvent.click(alertBadge);

    expect(onGoToAudit).toHaveBeenCalled();
  });

  it('muestra botón de volver en vista de auditoría', () => {
    const onGoBack = vi.fn();
    render(<CostSheetProblemsPanel problems={[]} isAuditView={true} onGoBack={onGoBack} />);

    const backButton = screen.getByRole('button', { name: /volver/i });
    fireEvent.click(backButton);

    expect(onGoBack).toHaveBeenCalled();
  });
});
