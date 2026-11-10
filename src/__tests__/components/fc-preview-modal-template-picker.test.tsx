/**
 * FC-USR-TEMPLATE — FCPreviewModal: conexión Producto ↔ Ficha de Costo.
 *
 * Certifica la nueva experiencia del modal de FC del inventario:
 *   1. sin_fc → embebe el selector de plantillas guardadas (no dead-end).
 *   2. Acceso funcional a Plantillas de Fichas (navegación real de terminal).
 *   3. CORRECCIÓN 404: «Ajustes de la tienda» navega a management-hub (vía
 *      Zustand) y NO renderiza <a href="/settings/stores/…"> (ruta inexistente).
 *   4. vigente → acciones Cambiar Ficha / Desconectar (con confirmación).
 *   5. Desconexión: confirmación explícita antes del soft-delete.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// ── Mocks de infraestructura ──

const spySetCurrentView = vi.fn();
const spySetActiveCostSection = vi.fn();

vi.mock('@/store', () => ({
  useUIStore: (selector: any) =>
    selector({
      setCurrentView: spySetCurrentView,
      setActiveCostSection: spySetActiveCostSection,
    }),
  useAuthStore: (selector: any) => selector({ user: { id: 'u1', activeStoreId: 's1' } }),
}));

const mockGenerateMutation = { isPending: false, mutateAsync: vi.fn() };
const mockDeleteMutation = { isPending: false, mutateAsync: vi.fn() };

vi.mock('@/hooks/api/useProductCostSheet', () => ({
  useAutoGenerateFC: () => mockGenerateMutation,
  useDeleteProductCostSheet: () => mockDeleteMutation,
  useFCTemplateOptions: () => ({
    data: [
      {
        id: '11111111-2222-4333-8444-555555555555',
        name: 'Mi Plantilla de Pastelería',
        description: 'Estructura de pastelería artesanal',
        category: 'Gastronomía',
        type: 'private',
        created_by: 'u1',
        store_id: null,
        created_at: '2026-10-01',
        updated_at: '2026-11-01',
      },
      {
        id: '22222222-3333-4444-8555-666666666666',
        name: 'Plantilla Pública Global',
        description: null,
        category: 'General',
        type: 'public',
        created_by: 'otro',
        store_id: null,
        created_at: '2026-10-02',
        updated_at: '2026-11-02',
      },
    ],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useGenerateFCFromTemplate: () => mockGenerateMutation,
}));

vi.mock('@/services/store-api-client', () => ({
  authHeaders: () => ({ Authorization: 'Bearer test' }),
}));

// Dialog como passthrough (contenido siempre visible cuando open)
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/ui/FCStatusBadge', () => ({
  FCStatusBadge: ({ status }: any) => <span data-testid="fc-badge">{status}</span>,
}));

vi.mock('@/components/ui/StoreTemplateSelector', () => ({
  FC_TEMPLATE_OPTIONS: [
    { id: 'costpro-reinicio', label: 'CostPro — Reinicio (General)', category: 'General' },
    { id: 'template-pizza', label: 'Pizza — Gastronomía', category: 'Gastronomía' },
  ],
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant, className, ...rest }: any) => (
    <button type="button" onClick={onClick} disabled={disabled} data-variant={variant} className={className} {...rest}>
      {children}
    </button>
  ),
}));

import { FCPreviewModal } from '@/components/ui/FCPreviewModal';

const BASE_PROPS = {
  open: true,
  onClose: vi.fn(),
  productId: 'p1',
  productName: 'Producto Test',
  storeId: 's1',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGenerateMutation.isPending = false;
  mockDeleteMutation.isPending = false;
  // jsdom: fetch del PDF OK + URL.createObjectURL stub (la vista previa no
  // interfiere con las vistas internas del modal)
  (globalThis as any).fetch = vi.fn().mockResolvedValue({
    ok: true,
    blob: async () => ({ size: 1, type: 'application/pdf' }),
  });
  (URL as any).createObjectURL = vi.fn(() => 'blob:test');
  (URL as any).revokeObjectURL = vi.fn();
});

describe('FCPreviewModal — sin_fc (antes dead-end, ahora selector)', () => {
  it('NO muestra el mensaje de dead-end histórico', () => {
    render(<FCPreviewModal {...BASE_PROPS} fcStatus="sin_fc" />);
    expect(screen.queryByText('Sin plantilla configurada para esta tienda')).toBeNull();
  });

  it('embebe el selector de plantillas guardadas del usuario', () => {
    render(<FCPreviewModal {...BASE_PROPS} fcStatus="sin_fc" />);
    // El selector lista las plantillas del usuario por nombre legible
    expect(screen.getByText('Mi Plantilla de Pastelería')).toBeDefined();
    expect(screen.getByText('Plantilla Pública Global')).toBeDefined();
    // Filtro de búsqueda presente
    expect(screen.getByLabelText('Buscar plantillas')).toBeDefined();
  });

  it('ofrece acceso funcional a Plantillas de Fichas (navegación real)', async () => {
    const user = userEvent.setup();
    render(<FCPreviewModal {...BASE_PROPS} fcStatus="sin_fc" />);

    await user.click(screen.getByRole('button', { name: /ir a plantillas de fichas/i }));

    expect(BASE_PROPS.onClose).toHaveBeenCalled();
    expect(spySetCurrentView).toHaveBeenCalledWith('cost-sheets');
    expect(spySetActiveCostSection).toHaveBeenCalledWith('templates');
  });

  it('CORREGIDO 404: «Ajustes de la tienda» navega a management-hub, sin <a href>', async () => {
    const user = userEvent.setup();
    const { container } = render(<FCPreviewModal {...BASE_PROPS} fcStatus="sin_fc" />);

    // No existe el enlace roto histórico a /settings/stores/{id}
    const brokenLink = container.querySelector('a[href^="/settings/stores"]');
    expect(brokenLink).toBeNull();

    await user.click(screen.getByRole('button', { name: /ajustes de la tienda/i }));

    expect(BASE_PROPS.onClose).toHaveBeenCalled();
    expect(spySetCurrentView).toHaveBeenCalledWith('management-hub');
  });
});

describe('FCPreviewModal — vigente (consulta, cambio y desconexión)', () => {
  it('muestra acciones de gestión de la asociación', () => {
    render(
      <FCPreviewModal
        {...BASE_PROPS}
        fcStatus="vigente"
        costSheetId="cs-1"
        currentTemplateId="11111111-2222-4333-8444-555555555555"
      />,
    );

    expect(screen.getByRole('button', { name: /cambiar ficha/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /desconectar/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /eliminar y regenerar/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /exportar pdf/i })).toBeDefined();
  });

  it('resuelve el nombre legible de la plantilla asociada (UUID → nombre)', () => {
    render(
      <FCPreviewModal
        {...BASE_PROPS}
        fcStatus="vigente"
        costSheetId="cs-1"
        currentTemplateId="11111111-2222-4333-8444-555555555555"
      />,
    );
    expect(screen.getByText('Mi Plantilla de Pastelería')).toBeDefined();
  });

  it('«Cambiar Ficha» abre el selector marcando la plantilla Actual', async () => {
    const user = userEvent.setup();
    render(
      <FCPreviewModal
        {...BASE_PROPS}
        fcStatus="vigente"
        costSheetId="cs-1"
        currentTemplateId="11111111-2222-4333-8444-555555555555"
      />,
    );

    await user.click(screen.getByRole('button', { name: /cambiar ficha/i }));

    // Selector visible: la plantilla aparece en la lista del selector y está
    // marcada como «Actual» (no seleccionable — evita duplicados)
    expect(screen.getByText('Mi Plantilla de Pastelería')).toBeDefined();
    expect(screen.getByText('Actual')).toBeDefined();
    // Aviso de reemplazo de datos ya generados
    expect(screen.getByText(/reemplazará/i)).toBeDefined();
  });

  it('«Desconectar» exige confirmación antes del soft-delete', async () => {
    const user = userEvent.setup();
    render(
      <FCPreviewModal
        {...BASE_PROPS}
        fcStatus="vigente"
        costSheetId="cs-1"
        currentTemplateId="11111111-2222-4333-8444-555555555555"
      />,
    );

    await user.click(screen.getByRole('button', { name: /^desconectar$/i }));

    // Vista de confirmación — aún NO se llamó al borrado
    expect(screen.getByText(/¿desconectar la ficha de costo\?/i)).toBeDefined();
    expect(mockDeleteMutation.mutateAsync).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /desconectar$/i }));

    expect(mockDeleteMutation.mutateAsync).toHaveBeenCalledWith({ cost_sheet_id: 'cs-1' });
  });

  it('sin costSheetId las acciones destructivas quedan deshabilitadas', () => {
    render(
      <FCPreviewModal {...BASE_PROPS} fcStatus="vigente" costSheetId={null} />,
    );
    const btnDesconectar = screen.getByRole('button', { name: /^desconectar$/i }) as HTMLButtonElement;
    expect(btnDesconectar.disabled).toBe(true);
  });
});

describe('FCPreviewModal — pendiente', () => {
  it('ofrece Generar FC y también conectar una plantilla guardada', () => {
    render(<FCPreviewModal {...BASE_PROPS} fcStatus="pendiente" />);
    expect(screen.getByRole('button', { name: /generar fc/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /conectar plantilla guardada/i })).toBeDefined();
  });
});
