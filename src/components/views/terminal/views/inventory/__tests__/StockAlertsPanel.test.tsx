import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StockAlertsPanel from '../StockAlertsPanel';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock framer-motion to immediately render/unmount children
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_target, prop) => {
      return (props: any) => {
        const { initial, animate, exit, transition, whileHover, whileTap, variants, layout, ...rest } = props;
        const Tag = typeof prop === 'string' ? prop : 'div';
        // Filter out framer-motion-only props
        const htmlProps: Record<string, any> = {};
        for (const [key, val] of Object.entries(rest)) {
          if (typeof val !== 'undefined') htmlProps[key] = val;
        }
// eslint-disable-next-line @typescript-eslint/no-require-imports
        return require('react').createElement(Tag, htmlProps);
      };
    },
  }),
  AnimatePresence: ({ children }: any) => children,
}));

vi.mock('@/hooks/ui/useReducedMotion', () => ({
  useReducedMotion: () => false,
  motionSafe: (_prefers: boolean, variants: any) => variants,
}));

vi.mock('@/hooks/ui/useFocusTrap', () => ({
  useFocusTrap: () => vi.fn(),
}));

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
