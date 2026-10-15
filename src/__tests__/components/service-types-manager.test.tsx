/**
 * service-types-manager.test.tsx — MISIÓN 2026-10-15 (Servicios Recibidos).
 *
 * Matriz SR aplicada a ServiceTypesManagerModal:
 *  · SR-03  crear un tipo → POST con nombre trimado; notifica preselección.
 *  · SR-04  duplicado (case/espacio) → error visible, SIN llamada de red.
 *  · SR-05  editar → PATCH por id (identidad preservada).
 *  · SR-06  desactivar tipo en uso → confirm() explica consecuencias
 *           (historial intacto) y envía is_active:false.
 *  · SR-08  fallo de red → mensaje útil, formulario conserva los datos.
 *  · SR-11  usuario sin rol admin global → modo lectura (sin controles de
 *           escritura).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const authState = vi.hoisted(() => ({
  user: null as any,
}));

vi.mock('@/store', () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) =>
    sel ? sel({ user: authState.user }) : { user: authState.user },
}));

import { ServiceTypesManagerModal } from '@/components/views/terminal/views/received_services/ServiceTypesManagerModal';
import type { ServiceType } from '@/hooks/useServiceTypes';

const TYPES: ServiceType[] = [
  { id: 't-1', store_id: null, name: 'Transporte', code: 'TRANSP', description: 'Transporte de mercancía', is_active: true, created_at: '2026-06-25', usage_count: 4 },
  { id: 't-2', store_id: null, name: 'Seguro', code: 'SEG', description: null, is_active: true, created_at: '2026-06-25', usage_count: 0 },
  { id: 't-3', store_id: null, name: 'Aduana', code: 'ADU', description: null, is_active: false, created_at: '2026-06-25', usage_count: 2 },
];

function setup(admin: boolean) {
  authState.user = admin
    ? { id: 'u-1', role: 'admin', activeStoreId: 'store-1', memberships: [] }
    : { id: 'u-2', role: 'clerk', activeStoreId: 'store-1', memberships: [{ store_id: 'store-1', role: 'clerk', status: 'active' }] };
  fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({}) });
}

function renderModal(overrides: Partial<Parameters<typeof ServiceTypesManagerModal>[0]> = {}) {
  return render(
    <ServiceTypesManagerModal
      isOpen
      onClose={vi.fn()}
      types={TYPES}
      loading={false}
      onRefresh={vi.fn()}
      onTypeCreated={vi.fn()}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  cleanup();
  setup(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ServiceTypesManagerModal', () => {
  it('muestra el catálogo completo con estado de uso (SR-12: sin registros → estado vacío útil)', async () => {
    const { rerender } = renderModal();
    expect(screen.getByText('Transporte')).toBeInTheDocument();
    expect(screen.getByText(/4 servicio\(s\) registrado\(s\)/)).toBeInTheDocument();
    expect(screen.getByText('Seguro')).toBeInTheDocument();
    expect(screen.getByText('Aduana')).toBeInTheDocument();
    expect(screen.getByText(/Inactivo/)).toBeInTheDocument();

    // SR-12 — catálogo vacío
    rerender(
      <ServiceTypesManagerModal
        isOpen onClose={vi.fn()} types={[]} loading={false}
        onRefresh={vi.fn()} onTypeCreated={vi.fn()} />,
    );
    expect(screen.getByText(/El catálogo está vacío/)).toBeInTheDocument();
  });

  it('SR-11: clerk (no admin) ve modo lectura — sin botones de crear/editar/desactivar', () => {
    setup(false);
    renderModal();
    expect(screen.queryByText('Agregar nuevo tipo')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Editar tipo Transporte')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Desactivar tipo Transporte')).not.toBeInTheDocument();
    expect(screen.getByText(/Solo un administrador puede modificarlo/)).toBeInTheDocument();
  });

  it('SR-03: crear tipo — POST con nombre trimado y notificación al formulario creador', async () => {
    const onRefresh = vi.fn();
    const onTypeCreated = vi.fn();
    fetchMock.mockResolvedValue({
      ok: true, status: 201,
      json: async () => ({ data: { id: 't-new', store_id: null, name: 'Montaje', code: 'MONTA', description: null, is_active: true, created_at: 'now', usage_count: 0 } }),
    });
    const user = userEvent.setup();
    renderModal({ onRefresh, onTypeCreated });

    await user.click(screen.getByText('Agregar nuevo tipo'));
    await user.type(screen.getByLabelText(/Nombre del tipo/), '  Montaje  ');
    await user.click(screen.getByRole('button', { name: 'Crear tipo' }));

    await waitFor(() => expect(onTypeCreated).toHaveBeenCalledTimes(1));
    expect(onTypeCreated.mock.calls[0][0].id).toBe('t-new');
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/service-types');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body).name).toBe('Montaje');
    expect(onRefresh).toHaveBeenCalled();
  });

  it('SR-04: duplicado case/espacio-insensitive → error local SIN llamada de red', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByText('Agregar nuevo tipo'));
    await user.type(screen.getByLabelText(/Nombre del tipo/), '   transporte');
    await user.click(screen.getByRole('button', { name: 'Crear tipo' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert').textContent).toMatch(/Ya existe un tipo de servicio/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('SR-05: editar conserva identidad — PATCH con id en body y nombre nuevo', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByLabelText('Editar tipo Transporte'));
    const input = screen.getByLabelText(/Nombre del tipo/) as HTMLInputElement;
    expect(input.value).toBe('Transporte');
    await user.clear(input);
    await user.type(input, 'Transporte Express');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, opts] = fetchMock.mock.calls[0];
    expect(opts.method).toBe('PATCH');
    const body = JSON.parse(opts.body);
    expect(body.id).toBe('t-1');
    expect(body.name).toBe('Transporte Express');
  });

  it('SR-06: desactivar tipo EN USO → confirm explica consecuencias (historial intacto) y envía is_active:false', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByLabelText('Desactivar tipo Transporte'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(confirmSpy.mock.calls[0][0]).toMatch(/está asociado a 4 servicio\(s\)/);
    expect(confirmSpy.mock.calls[0][0]).toMatch(/el historial NO se pierde/i);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(opts.method).toBe('PATCH');
    expect(JSON.parse(opts.body)).toEqual({ id: 't-1', is_active: false });
  });

  it('SR-06b: cancelar el confirm → NO se envía ninguna operación', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByLabelText('Desactivar tipo Transporte'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('SR-08: fallo de red al guardar → mensaje útil y los datos del formulario se conservan', async () => {
    fetchMock.mockRejectedValue(new Error('Network request failed'));
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByText('Agregar nuevo tipo'));
    await user.type(screen.getByLabelText(/Nombre del tipo/), 'Montaje');
    await user.click(screen.getByRole('button', { name: 'Crear tipo' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert').textContent).toMatch(/Network request failed/);
    expect((screen.getByLabelText(/Nombre del tipo/) as HTMLInputElement).value).toBe('Montaje');
    // El modal sigue abierto (el usuario puede reintentar)
    expect(screen.getByRole('button', { name: 'Crear tipo' })).toBeInTheDocument();
  });

  it('doble envío bloqueado: segundo submit mientras submitting no dispara segunda llamada', async () => {
    let resolvePost: (v: unknown) => void = () => {};
    fetchMock.mockImplementation(() => new Promise(res => { resolvePost = res; }));
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByText('Agregar nuevo tipo'));
    await user.type(screen.getByLabelText(/Nombre del tipo/), 'Montaje');
    await user.click(screen.getByRole('button', { name: /Crear tipo/ }));
    // El botón queda deshabilitado durante el envío → un segundo clic no reenvía
    const submitBtn = await screen.findByRole('button', { name: /Guardando…/ });
    expect(submitBtn).toBeDisabled();
    fireEvent.click(submitBtn);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolvePost({ ok: true, status: 201, json: async () => ({ data: { id: 't-new', name: 'Montaje' } }) });
  });
});
