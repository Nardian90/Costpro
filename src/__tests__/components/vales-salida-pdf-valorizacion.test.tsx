/**
 * MISIÓN CP-WH-EXIT-VOUCHER-PDF-VALUATION-001 (2026-11-20)
 * ========================================================
 * Control «Incluir valores en el PDF (Vale de Salida valorizado)» en el flujo
 * de exportación SC-2-08 del modal de detalle de Vales de Salida.
 *
 * Comprueba:
 *  - El control existe, es único y está MARCADO por defecto (comportamiento
 *    vigente — sin sorpresas para el usuario).
 *  - Marcado → exportación VALORIZADA (incluirValores:true).
 *  - Desmarcado → exportación SIN VALORAR (incluirValores:false, solo físico).
 *  - La elección aplica SOLO a la exportación solicitada: la generación del
 *    PDF es 100% lectura — ninguna mutación del documento, inventario ni
 *    contabilización (ningún endpoint de escritura es invocado).
 *  - Vale en revisión (pending): sin exportación ni control (el modelo oficial
 *    ampara un despacho real).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ValeSalidaDetalleModal, type ValeSalidaDoc } from '@/components/views/terminal/views/inventory/ValeSalidaDetalleModal';
import { toast } from 'sonner';

// ── Mock: exportación SC-2-08 (espía — NO generamos jsPDF aquí) ──
const sc208Mock = vi.hoisted(() => ({ exportSc208ForVale: vi.fn() }));
vi.mock('@/lib/legal/sc208', async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, exportSc208ForVale: sc208Mock.exportSc208ForVale };
});

// ── Mock: supabase client (movimientos del vale — query de solo lectura) ──
const fromMock = vi.fn();
vi.mock('@/lib/supabaseClient', () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));

// ── Mock: auth store (tienda activa del usuario) ──
vi.mock('@/store', () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) =>
    sel
      ? sel({
          user: {
            id: 'u-1',
            role: 'admin',
            fullName: 'Ana Torres',
            activeStoreId: 'store-1',
          },
        })
      : { user: { id: 'u-1', role: 'admin', fullName: 'Ana Torres', activeStoreId: 'store-1' } },
}));

const VALE_COMPLETADO: ValeSalidaDoc = {
  id: 'bbbbbbbb-2222-4222-8222-222222222222',
  store_id: 'store-1',
  slip_number: 'VS-000123-2026',
  status: 'completed',
  production_order_id: null,
  notes: 'Consumo cafetería',
  total_cost: 4210.9,
  created_by: 'u-1',
  created_at: '2026-10-22T10:15:00Z',
  confirmed_at: '2026-10-22T11:00:00Z',
  confirmed_by: 'u-1',
  voided_at: null,
  voided_by: null,
  void_reason: null,
  items: [
    {
      id: 'it-1',
      slip_id: 'bbbbbbbb-2222-4222-8222-222222222222',
      product_id: 'p-1',
      variant_id: null,
      production_order_item_id: null,
      quantity: 5,
      unit_cost: 320.18,
      total_cost: 1600.9,
      products: { name: 'Azúcar 1 kg', sku: 'AZU-1K', unit_of_measure: 'unidades' },
    },
  ],
  creator: { full_name: 'Marta Rodríguez' },
  production_orders: null,
};

const VALE_PENDIENTE: ValeSalidaDoc = {
  ...VALE_COMPLETADO,
  status: 'pending',
  confirmed_at: null,
  confirmed_by: null,
};

function renderModal(vale: ValeSalidaDoc | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ValeSalidaDetalleModal
        open={true}
        onClose={vi.fn()}
        vale={vale}
        storeName="Almacén Central"
        canReverse={false}
        onReverse={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  cleanup();
  fromMock.mockReset().mockImplementation(() => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order']) c[m] = vi.fn(() => c);
    c.then = (res?: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(res);
    return c;
  });
  sc208Mock.exportSc208ForVale.mockReset().mockResolvedValue(undefined);
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
});

afterEach(() => cleanup());

describe('ValeSalidaDetalleModal — control de valorización del PDF (misión CP-WH-EXIT-VOUCHER-PDF-VALUATION-001)', () => {
  it('el control existe, es ÚNICO y está MARCADO por defecto (comportamiento vigente)', async () => {
    renderModal(VALE_COMPLETADO);
    const checkbox = await screen.findByRole('checkbox', {
      name: 'Incluir valores en el PDF (Vale de Salida valorizado)',
    });
    expect(checkbox).toBeTruthy();
    expect(screen.getAllByRole('checkbox', { name: /Incluir valores/i }).length).toBe(1);
    expect(checkbox).toBeChecked();
  });

  it('la etiqueta visible es inequívoca y acompañan al botón de exportación existente (sin duplicarlo)', async () => {
    renderModal(VALE_COMPLETADO);
    await screen.findByRole('checkbox', { name: /Incluir valores/i });
    expect(screen.getByText('Incluir valores en el PDF')).toBeTruthy();
    const exportar = screen.getAllByRole('button', { name: /Exportar el vale como modelo oficial SC-2-08/i });
    expect(exportar.length).toBe(1);
  });

  it('checkbox MARCADO + Exportar → exportación VALORIZADA (incluirValores:true)', async () => {
    const user = userEvent.setup();
    renderModal(VALE_COMPLETADO);
    const exportar = await screen.findByRole('button', { name: /Exportar el vale como modelo oficial SC-2-08/i });
    await user.click(exportar);
    await waitFor(() => expect(sc208Mock.exportSc208ForVale).toHaveBeenCalledTimes(1));
    const [vale, storeId, opciones] = sc208Mock.exportSc208ForVale.mock.calls[0];
    expect(opciones).toEqual({ incluirValores: true });
    expect((vale as ValeSalidaDoc).slip_number).toBe('VS-000123-2026');
    expect((vale as ValeSalidaDoc).status).toBe('completed');
    expect(storeId).toBe('store-1'); // RLS: tienda activa
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
      expect.stringContaining('valorizado'),
    );
  });

  it('checkbox DESMARCADO + Exportar → exportación SIN VALORAR (incluirValores:false, solo físico)', async () => {
    const user = userEvent.setup();
    renderModal(VALE_COMPLETADO);
    const checkbox = await screen.findByRole('checkbox', { name: /Incluir valores/i });
    await user.click(checkbox); // desmarcar
    expect(checkbox).not.toBeChecked();
    const exportar = screen.getByRole('button', { name: /Exportar el vale como modelo oficial SC-2-08/i });
    await user.click(exportar);
    await waitFor(() => expect(sc208Mock.exportSc208ForVale).toHaveBeenCalledTimes(1));
    const opciones = sc208Mock.exportSc208ForVale.mock.calls[0][2];
    expect(opciones).toEqual({ incluirValores: false });
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
      expect.stringContaining('sin valorar'),
    );
  });

  it('la elección es SOLO de presentación: exportar no muta nada (ninguna escritura)', async () => {
    const user = userEvent.setup();
    renderModal(VALE_COMPLETADO);
    const exportar = await screen.findByRole('button', { name: /Exportar el vale como modelo oficial SC-2-08/i });
    await user.click(exportar);
    await waitFor(() => expect(sc208Mock.exportSc208ForVale).toHaveBeenCalled());
    // El modal no invoca endpoints: toda mutación pasa por onReverse/otras
    // acciones — la exportación pura no toca el documento ni el inventario.
    expect(sc208Mock.exportSc208ForVale.mock.calls[0][0]).toMatchObject({
      id: VALE_COMPLETADO.id,
      status: 'completed',
      total_cost: VALE_COMPLETADO.total_cost, // documento intacto
    });
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
  });

  it('vale en REVISIÓN (pending): sin botón de exportación ni control de valorización', async () => {
    renderModal(VALE_PENDIENTE);
    await screen.findByRole('dialog');
    expect(screen.queryByRole('checkbox', { name: /Incluir valores/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Exportar el vale como modelo oficial SC-2-08/i })).toBeNull();
    // El aviso documental de revisión sigue presente:
    expect(screen.getByText(/sin efecto en inventario todavía/i)).toBeTruthy();
  });
});
