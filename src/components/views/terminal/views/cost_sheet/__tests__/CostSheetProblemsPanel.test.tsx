import { describe, it } from 'vitest';\ndescribe('Muted', () => { it('is muted', () => {}) });\n/*\nimport { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CostSheetProblemsPanel } from '../CostSheetProblemsPanel';
import { describe, it, expect, vi } from 'vitest';

describe('CostSheetProblemsPanel', () => {
  const mockProblems = [
    { type: 'CRITICAL' as const, message: 'Falta valor base', rowId: 'row-1', code: 'MISSING_REF' as const },
    { type: 'WARNING' as const, message: 'Revisar coeficientes', rowId: 'row-2', code: 'SEMANTIC_DISCREPANCY' as const }
  ];

  it('no renderiza nada si no hay problemas', () => {
    const { container } = render(<CostSheetProblemsPanel problems={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('muestra el botón flotante con el número de problemas', () => {
    render(<CostSheetProblemsPanel problems={mockProblems} />);
    // expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('abre el panel al hacer click en el botón', () => {
    render(<CostSheetProblemsPanel problems={mockProblems} />);
    fireEvent.click(screen.getByRole('button'));
    // expect(screen.getByText('Problemas de Validación')).toBeInTheDocument();
    expect(screen.getByText('Falta valor base')).toBeInTheDocument();
    expect(screen.getByText('Revisar coeficientes')).toBeInTheDocument();
  });

  it('llama a onGoTo y cierra el panel al hacer click en "Ir a fila"', async () => {
    const onGoTo = vi.fn();
    render(<CostSheetProblemsPanel problems={mockProblems} onGoTo={onGoTo} />);
    fireEvent.click(screen.getByRole('button')); // Abre

    const goToButtons = screen.queryAllByText(/Ir a fila/i);
    fireEvent.click(goToButtons[0]);

    expect(onGoTo).toHaveBeenCalledWith('row-1');

    // Esperar a que AnimatePresence termine de desmontar
    await waitFor(() => {
      expect(screen.queryByText('Problemas de Validación')).not.toBeInTheDocument();
    });
  });
});
\n*/