import { render, screen, fireEvent } from '@testing-library/react';
import StockAlertsPanel from '../StockAlertsPanel';
import { describe, it, expect, vi } from 'vitest';

describe('StockAlertsPanel', () => {
  const mockAlerts = [
    {
      product: { id: 'p1', name: 'Producto Agotado' } as any,
      severity: 'critical' as const,
      currentStock: 0,
      minStock: 5
    },
    {
      product: { id: 'p2', name: 'Producto Bajo' } as any,
      severity: 'warning' as const,
      currentStock: 3,
      minStock: 5
    }
  ];

  it('muestra el FAB con el número total de alertas', () => {
    render(<StockAlertsPanel alerts={mockAlerts} onReceive={vi.fn()} />);
    expect(screen.getByText('2 alertas')).toBeInTheDocument();
  });

  it('abre el panel al hacer click en el FAB', () => {
    render(<StockAlertsPanel alerts={mockAlerts} onReceive={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /alertas de stock/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Alertas de Stock')).toBeInTheDocument();
    expect(screen.getByText('Producto Agotado')).toBeInTheDocument();
    expect(screen.getByText('Producto Bajo')).toBeInTheDocument();
  });

  it('llama a onReceive y cierra el panel al hacer click en "Recibir"', () => {
    const onReceive = vi.fn();
    render(<StockAlertsPanel alerts={mockAlerts} onReceive={onReceive} />);
    fireEvent.click(screen.getByRole('button', { name: /alertas de stock/i }));

    const receiveBtns = screen.getAllByRole('button', { name: /Recibir mercancía/i });
    fireEvent.click(receiveBtns[0]);

    expect(onReceive).toHaveBeenCalledWith(mockAlerts[0].product);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
