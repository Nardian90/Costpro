import { render, screen, fireEvent } from '@testing-library/react';
import AuditGlobalView from '../AuditGlobalView';
import { useAuthStore } from '@/store';
import { useStores } from '@/hooks/api/useStores';
import { useAuditLogs } from '@/hooks/api/useAuditLogs';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/store', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('@/hooks/api/useStores', () => ({
  useStores: vi.fn(),
}));

vi.mock('@/hooks/api/useAuditLogs', () => ({
  useAuditLogs: vi.fn(),
  AUDIT_ACTION_LABELS: {
    'sale_confirmed': 'Venta Confirmada',
    'store_reset': 'Reinicio de Tienda'
  }
}));

// Mock de StateRenderer
vi.mock('@/components/ui/StateRenderer', () => ({
  StateRenderer: ({ children, data, isLoading }: any) => {
    if (isLoading) return <div>Loading...</div>;
    return typeof children === 'function' ? children(data) : children;
  }
}));

describe('AuditGlobalView', () => {
  const mockUser = { id: 'user-1', role: 'admin' };
  const mockStores = [{ id: 'store-1', name: 'Tienda 1' }];
  const mockLogs = [
    {
      id: 'log-1',
      created_at: '2023-10-27T10:00:00Z',
      action: 'sale_confirmed',
      user_id: 'user-1',
      record_id: 'record-12345678',
      store_id: 'store-1',
      profiles: { full_name: 'Juan Pérez' },
      metadata: { total: 100 }
    }
  ];

  beforeEach(() => {
    (useAuthStore as any).mockReturnValue({ user: mockUser } as any);
    (useStores as any).mockReturnValue({ data: mockStores, isLoading: false } as any);
    (useAuditLogs as any).mockReturnValue({
      data: { pages: [{ logs: mockLogs, total: 1 }] },
      isLoading: false,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false
    } as any);
  });

  it('renderiza el título y la tabla de auditoría', () => {
    render(<AuditGlobalView />);
    expect(screen.getByText('Auditoría Global')).toBeInTheDocument();
    // Usamos getAllByText porque el select también tiene la opción
    expect(screen.getAllByText('Venta Confirmada').length).toBeGreaterThan(0);
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
  });

  it('expande los detalles de un registro al hacer click', () => {
    render(<AuditGlobalView />);
    const viewButton = screen.getByLabelText('Ver detalles del evento');
    fireEvent.click(viewButton);

    expect(screen.getByText(/"total": 100/)).toBeInTheDocument();
    expect(screen.getByLabelText('Colapsar detalles')).toBeInTheDocument();
  });

  it('filtra por texto de búsqueda', () => {
    render(<AuditGlobalView />);
    const searchInput = screen.getByLabelText(/Buscar en el historial de auditoría/i);

    fireEvent.change(searchInput, { target: { value: 'Inexistente' } });

    expect(screen.queryByText('Juan Pérez')).not.toBeInTheDocument();
  });

  it('exporta a CSV al hacer click en el botón', () => {
    const createObjectURLSpy = vi.fn().mockReturnValue('blob:url');
    const revokeObjectURLSpy = vi.fn();
    window.URL.createObjectURL = createObjectURLSpy;
    window.URL.revokeObjectURL = revokeObjectURLSpy;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<AuditGlobalView />);
    const exportButton = screen.getByLabelText(/Exportar registros de auditoría como CSV/i);
    fireEvent.click(exportButton);

    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
  });
});
