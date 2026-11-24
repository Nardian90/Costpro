/**
 * adn008-create-service-modal.test.tsx — ADN-SERVICES-RECEIVED-CREATION-WORKFLOW-008
 *
 * Matriz del formulario (misión §9 + complemento):
 *  · Borrador sin proveedor → save_as_draft + creation_key (validaciones
 *    relajadas; NUNCA inventa datos).
 *  · Confirmar SIN proveedor → bloqueado (campo obligatorio al confirmar).
 *  · Modo B (pendiente) → texto «Dejar pendiente de pago» + sin editor.
 *  · Modo A (Liquidar al confirmar) → editor multipago con default
 *    Efectivo/CUP/importe total.
 *  · Ejemplo §5.3: 40 USD efectivo + 1.000 CUP efectivo = liquidación única
 *    de dos componentes del MISMO servicio.
 *  · Complemento §1: vinculación operativa contraída por defecto; método de
 *    distribución solo con recepción vinculada.
 *  · Complemento §2: combobox de tipo de servicio con búsqueda.
 *  · §3.3 edición de borrador: prefill + guardar cambios / confirmar.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const authState = vi.hoisted(() => ({ user: null as any }));
vi.mock('@/store', () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) => (sel ? sel({ user: authState.user }) : { user: authState.user }),
}));

vi.mock('@/hooks/useStoreRates', () => ({
  useStoreRates: () => ({ rates: { USD: 400, EUR: 440, MLC: 120 } }),
}));

// Supabase: búsquedas de OT/recepciones y vínculos del borrador (vacíos por defecto)
const supabaseState = vi.hoisted(() => ({ otRows: [] as any[], rcptRows: [] as any[], links: { rcpt: [] as any[], ots: [] as any[] } }));
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => {
      const chain: any = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.in = async () => ({
        data: table === 'receipts' ? supabaseState.rcptRows : table === 'production_orders' ? supabaseState.otRows : [],
        error: null,
      });
      chain.not = () => chain;
      chain.or = () => chain;
      chain.order = () => chain;
      chain.limit = async () => {
        if (table === 'production_orders') return { data: supabaseState.otRows, error: null };
        if (table === 'receipts') return { data: supabaseState.rcptRows, error: null };
        return { data: [], error: null };
      };
      // service_*_links: select().eq() async directo
      chain.then = (res?: any, rej?: any) => {
        const data =
          table === 'service_reception_links' ? supabaseState.links.rcpt
          : table === 'service_production_order_links' ? supabaseState.links.ots
          : [];
        return Promise.resolve({ data, error: null }).then(res, rej);
      };
      return chain;
    },
  },
}));

vi.mock('@/hooks/ui/useWorkDateDefault', () => ({
  useApplyWorkDateDefault: vi.fn(),
}));

vi.mock('@/components/ui/OperationDatePicker', () => ({
  OperationDatePicker: ({ label }: any) => <div data-testid="operation-date-picker">{label}</div>,
  useOperationDateValidation: () => ({ valid: true, error: null }),
  formatOperationDateForRPC: (d: string) => `${d}T12:00:00Z`,
}));

// ADN-008 §4: el selector real se prueba en su propio dominio (Recepciones);
// aquí se stub-ifica para centrar las aserciones en el MODAL (selección con
// identidad = el contrato que el modal consume).
vi.mock('@/components/views/terminal/views/inventory/SupplierSelector', () => ({
  SupplierSelector: ({ value, onChange }: any) => (
    <div data-testid="supplier-selector-stub">
      <input data-testid="supplier-stub-input" value={value} onChange={(e) => onChange(e.target.value, null)} aria-label="Proveedor" />
      <button type="button" data-testid="supplier-stub-select" onClick={() => onChange('TransCaribe S.A.', { supplierId: '11111111-1111-4111-8111-111111111101', masterPartyId: null, code: 'TC', tax_id: 'NIT-1', phone: '55', address: 'calle', source: 'local' })}>
        select-existing
      </button>
      <button type="button" data-testid="supplier-stub-clear" onClick={() => onChange('', null)}>clear</button>
    </div>
  ),
}));

import { CreateServiceModal } from '@/components/views/terminal/views/received_services/ReceivedServicesView';
import type { ServiceType } from '@/hooks/useServiceTypes';
import { renderWithDialogs } from '../helpers/render-with-dialogs';

const TYPES: ServiceType[] = [
  { id: 't-1', store_id: null, name: 'Transporte', code: 'TRANSP', description: null, is_active: true, created_at: '2026-06-25' },
  { id: 't-2', store_id: null, name: 'Manipulación', code: 'MANIP', description: null, is_active: true, created_at: '2026-06-25' },
  { id: 't-3', store_id: null, name: 'Aduana', code: 'ADU', description: null, is_active: true, created_at: '2026-06-25' },
] as any;

const DRAFT = {
  id: 'srv-1',
  service_number: 'SRV-20261120-00099',
  service_date: '2026-11-20',
  service_type_id: 't-2',
  service_type_name: 'Manipulación',
  supplier: null,
  reference_doc: null,
  total_amount: 1040,
  currency: 'CUP',
  status: 'draft',
  distribution_method: 'amount',
  observations: 'nota del borrador',
} as any;

function renderModal(overrides: Record<string, unknown> = {}) {
  return renderWithDialogs(
    <CreateServiceModal
      isOpen
      onClose={vi.fn()}
      onCreate={vi.fn()}
      activeTypes={TYPES}
      typesLoading={false}
      onOpenManager={vi.fn()}
      preselectTypeId={null}
      {...overrides}
    />,
  );
}

function fillBase(amount = '1040') {
  fireEvent.change(screen.getByTestId('supplier-stub-input'), { target: { value: 'TransCaribe S.A.' } });
  fireEvent.change(screen.getByLabelText('Importe total'), { target: { value: amount } });
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = { id: 'u-1', role: 'manager', activeStoreId: 'store-1' };
  supabaseState.otRows = [];
  supabaseState.rcptRows = [];
  supabaseState.links = { rcpt: [], ots: [] };
  fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({}) });
});

afterEach(() => cleanup());

describe('ADN-008 §3 — Guardar borrador', () => {
  it('guarda borrador SIN proveedor (validación relajada) y SIN filas de pago', async () => {
    const onCreate = vi.fn();
    renderModal({ onCreate });
    // sin tocar el proveedor; solo importe
    fireEvent.change(screen.getByLabelText('Importe total'), { target: { value: '1040' } });
    fireEvent.click(screen.getByTestId('save-draft-button'));

    // CP-UX-FINAL-POLISH-003: el gate es ahora el diálogo propio de COSTPRO.
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('BORRADOR');
    fireEvent.click(screen.getByTestId('dialog-confirm'));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    const payload = onCreate.mock.calls[0][0];
    expect(payload.save_as_draft).toBe(true);
    expect(payload.creation_key).toBeTruthy();
    expect(payload.supplier).toBeNull();
    expect(payload.paymentRows).toEqual([]);
  });

  it('borrador CON proveedor seleccionado conserva su identidad', async () => {
    const onCreate = vi.fn();
    renderModal({ onCreate });
    fireEvent.click(screen.getByTestId('supplier-stub-select'));
    fireEvent.change(screen.getByLabelText('Importe total'), { target: { value: '500' } });
    fireEvent.click(screen.getByTestId('save-draft-button'));
    fireEvent.click(await screen.findByTestId('dialog-confirm'));

    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    const payload = onCreate.mock.calls[0][0];
    expect(payload.supplier).toBe('TransCaribe S.A.');
    expect(payload.supplier_id).toBe('11111111-1111-4111-8111-111111111101');
    expect(payload.supplier_meta).toEqual({ code: 'TC', tax_id: 'NIT-1', phone: '55', address: 'calle' });
  });
});

describe('ADN-008 §4.2/§7 — confirmación exige proveedor', () => {
  it('confirmar SIN proveedor → bloqueado con mensaje y sin onCreate', async () => {
    const onCreate = vi.fn();
    const { toast } = await import('sonner');
    renderModal({ onCreate });
    fireEvent.change(screen.getByLabelText('Importe total'), { target: { value: '100' } });
    fireEvent.click(screen.getByTestId('confirm-service-button'));

    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.queryByTestId('dialog-confirm')).toBeNull(); // sin diálogo propio: bloqueado ANTES
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('proveedor'));
  });

  it('confirmar pendiente (modo B) → paymentRows vacío y mensaje de obligación sin egresos', async () => {
    const onCreate = vi.fn();
    renderModal({ onCreate });
    fillBase('1040');
    fireEvent.click(screen.getByTestId('confirm-service-button'));
    // CP-UX-FINAL-POLISH-003: confirmar en el diálogo propio.
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('pendiente de pago');
    fireEvent.click(screen.getByTestId('dialog-confirm'));

    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    const payload = onCreate.mock.calls[0][0];
    expect(payload.paymentRows).toEqual([]);
    expect(screen.getByTestId('payment-mode-pending-text')).toBeTruthy();
    expect(screen.getByTestId('payment-mode-pending-text').textContent).toContain('No se generará ningún egreso');
  });
});

describe('ADN-008 §5.1 — valores predeterminados de la liquidación', () => {
  it('al activar Liquidar al confirmar: editor visible con Efectivo/CUP/importe total', async () => {
    renderModal({});
    fillBase('1040');
    fireEvent.click(screen.getByTestId('pay-now-toggle'));

    const editor = await screen.findByTestId('payment-rows-total');
    expect(editor.textContent).toContain('1,040.00');
    expect(screen.getByTestId('payment-mode-paynow-text')).toBeTruthy();
    // fila 1: Efectivo + CUP por defecto
    expect((screen.getByLabelText('Forma de pago componente 1') as HTMLSelectElement).value).toBe('cash');
    expect((screen.getByLabelText('Moneda componente 1') as HTMLSelectElement).value).toBe('CUP');
    expect((screen.getByLabelText('Importe componente 1') as HTMLInputElement).value).toBe('1040');
    expect(screen.getByTestId('payment-coverage-hint').textContent).toContain('Liquidación completa');
  });

  it('ejemplo §5.3: 40 USD efectivo + 1.000 CUP efectivo = UN servicio con dos componentes', async () => {
    const onCreate = vi.fn();
    renderModal({ onCreate });
    fillBase('17000');
    fireEvent.click(screen.getByTestId('pay-now-toggle'));

    // componente 1 → 40 USD (tasa de tienda 400)
    fireEvent.change(screen.getByLabelText('Importe componente 1'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('Moneda componente 1'), { target: { value: 'USD' } });
    // componente 2 → 1.000 CUP
    fireEvent.click(screen.getByTestId('payment-add-row'));
    fireEvent.change(screen.getByLabelText('Importe componente 2'), { target: { value: '1000' } });

    await waitFor(() => expect(screen.getByTestId('payment-rows-total').textContent).toContain('17,000.00'));

    fireEvent.click(screen.getByTestId('confirm-service-button'));
    fireEvent.click(await screen.findByTestId('dialog-confirm'));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));

    const payload = onCreate.mock.calls[0][0];
    expect(payload.total_amount).toBe(17000);
    expect(payload.paymentRows).toHaveLength(2);
    // Filas del editor (el padre las serializa con rowsToPayload → /api/payments).
    expect(payload.paymentRows[0]).toMatchObject({ method: 'cash', currency: 'USD', amount: 40, exchange_rate: 400 });
    expect(payload.paymentRows[1]).toMatchObject({ method: 'cash', currency: 'CUP', amount: 1000 });
  });

  it('liquidación parcial al confirmar → saldo pendiente visible (jamás «Pagado» implícito)', async () => {
    renderModal({});
    fillBase('1000');
    fireEvent.click(screen.getByTestId('pay-now-toggle'));
    fireEvent.change(screen.getByLabelText('Importe componente 1'), { target: { value: '400' } });

    expect(screen.getByTestId('payment-coverage-hint').textContent).toContain('600');
    expect(screen.getByTestId('payment-coverage-hint').textContent).toContain('Parcial');
  });
});

describe('ADN-008 complemento §2 — combobox de tipo de servicio', () => {
  it('busca por nombre y permite seleccionar (todas las opciones disponibles)', async () => {
    const onCreate = vi.fn();
    renderModal({ onCreate });
    const combo = screen.getByLabelText('Tipo de servicio');
    fireEvent.focus(combo);
    fireEvent.change(combo, { target: { value: 'adu' } });

    const listbox = await screen.findByRole('listbox');
    expect(listbox.textContent).toContain('Aduana');
    expect(listbox.textContent).not.toContain('Transporte');

    fireEvent.click(screen.getByRole('option', { name: /Aduana/ }));
    fireEvent.change(screen.getByLabelText('Importe total'), { target: { value: '100' } });
    fireEvent.click(screen.getByTestId('supplier-stub-select'));
    fireEvent.click(screen.getByTestId('confirm-service-button'));
    fireEvent.click(await screen.findByTestId('dialog-confirm'));

    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(onCreate.mock.calls[0][0].service_type_id).toBe('t-3');
    expect(onCreate.mock.calls[0][0].service_type_name).toBe('Aduana');
  });
});

describe('ADN-008 complemento §1 — vinculación operativa contraída', () => {
  it('contraída por defecto: sin método de distribución visible y sin badge', () => {
    renderModal({});
    expect(screen.getByTestId('operational-links-trigger')).toBeTruthy();
    expect(screen.queryByTestId('distribution-method-select')).toBeNull();
    expect(screen.queryByTestId('links-configured-badge')).toBeNull();
    expect(screen.getByTestId('operational-links-trigger').textContent).toContain('Configurar OT, recepción y distribución de costos');
  });

  it('expande → aparece búsqueda de OT y recepción; sin recepción no hay selector de distribución', async () => {
    renderModal({});
    fireEvent.click(screen.getByTestId('operational-links-trigger'));
    await waitFor(() => expect(screen.getByText('Orden de Trabajo / Producción (OT)')).toBeTruthy());
    expect(screen.getByText('Recepción de almacén')).toBeTruthy();
    expect(screen.queryByTestId('distribution-method-select')).toBeNull();
    expect(screen.getByText(/Vincula una Recepción de almacén para configurar la distribución/)).toBeTruthy();
  });

  it('con recepción vinculada aparece el método de distribución con las 3 modalidades', async () => {
    supabaseState.rcptRows = [{ id: 'rc-1', reference_doc: 'FAC-1', supplier: 'Prov', total_cost: 100, status: 'active', created_at: '2026-11-19' }];
    renderModal({});
    fireEvent.click(screen.getByTestId('operational-links-trigger'));
    fireEvent.focus(screen.getByPlaceholderText('Buscar por factura o proveedor...'));
    fireEvent.click(await screen.findByText('FAC-1'));
    const select = await screen.findByTestId('distribution-method-select');
    expect((select as HTMLSelectElement).value).toBe('amount');
    expect(select.textContent).toContain('Por cantidad (proporcional a unidades)');
    expect(select.textContent).toContain('Manual (definir porcentajes)');
  });

  it('contraer el panel no borra la recepción seleccionada (badge Configurado persiste)', async () => {
    supabaseState.rcptRows = [{ id: 'rc-1', reference_doc: 'FAC-1', supplier: 'Prov', total_cost: 100, status: 'active', created_at: '2026-11-19' }];
    renderModal({});
    fireEvent.click(screen.getByTestId('operational-links-trigger'));
    fireEvent.focus(screen.getByPlaceholderText('Buscar por factura o proveedor...'));
    fireEvent.click(await screen.findByText('FAC-1'));
    expect(await screen.findByTestId('links-configured-badge')).toBeTruthy();

    // contraer
    fireEvent.click(screen.getByTestId('operational-links-trigger'));
    // expandir de nuevo: la selección persiste
    fireEvent.click(screen.getByTestId('operational-links-trigger'));
    expect(await screen.findByTestId('distribution-method-select')).toBeTruthy();
    expect(screen.getByTestId('links-configured-badge')).toBeTruthy();
  });
});

describe('ADN-008 §3.3 — edición de borrador (recuperación)', () => {
  it('prefill completo + botones de edición; guardar cambios → onSaveEdit(mode=draft)', async () => {
    const onSaveEdit = vi.fn();
    supabaseState.links = { rcpt: [], ots: [] };
    renderModal({ editService: DRAFT, onSaveEdit });

    expect(screen.getByText(/Continuar Borrador SRV-20261120-00099/)).toBeTruthy();
    expect((screen.getByLabelText('Importe total') as HTMLInputElement).value).toBe('1040');
    expect((screen.getByLabelText('Proveedor') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Observaciones') as HTMLTextAreaElement).value).toBe('nota del borrador');

    fireEvent.click(screen.getByTestId('save-draft-button'));
    fireEvent.click(await screen.findByTestId('dialog-confirm'));
    await waitFor(() => expect(onSaveEdit).toHaveBeenCalledTimes(1));
    const [id, payload, mode] = onSaveEdit.mock.calls[0];
    expect(id).toBe('srv-1');
    expect(mode).toBe('draft');
    expect(payload.save_as_draft).toBe(true);
    expect(payload.total_amount).toBe(1040);
    expect(payload.service_type_name).toBe('Manipulación');
  });

  it('confirmar el borrador → onSaveEdit(mode=confirm) con fecha financiera del pago', async () => {
    const onSaveEdit = vi.fn();
    renderModal({ editService: DRAFT, onSaveEdit });
    fireEvent.click(screen.getByTestId('supplier-stub-select'));
    fireEvent.click(screen.getByTestId('confirm-service-button'));
    fireEvent.click(await screen.findByTestId('dialog-confirm'));

    await waitFor(() => expect(onSaveEdit).toHaveBeenCalledTimes(1));
    const [id, payload, mode] = onSaveEdit.mock.calls[0];
    expect(id).toBe('srv-1');
    expect(mode).toBe('confirm');
    expect(payload.supplier_id).toBe('11111111-1111-4111-8111-111111111101');
    expect(payload.payment_date).toBeTruthy();
  });

  it('los vínculos guardados del borrador se recuperan (badge Configurado al abrir)', async () => {
    const onSaveEdit = vi.fn();
    supabaseState.links = { rcpt: [{ receipt_id: 'rc-1' }], ots: [] };
    supabaseState.rcptRows = [{ id: 'rc-1', reference_doc: 'FAC-9', supplier: 'Prov', total_cost: 100, status: 'active', created_at: '2026-11-19' }];
    renderModal({ editService: DRAFT, onSaveEdit });
    await screen.findByTestId('links-configured-badge');
    expect(screen.getByTestId('links-configured-badge').textContent).toBe('Configurado');
  });
});
