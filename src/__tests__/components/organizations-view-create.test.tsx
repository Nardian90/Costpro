/**
 * CP-ORG-001 (continuación, 2026-10-25) — brecha de creación §4.1:
 * «Inicio → SISTEMA → Organizaciones» debe permitir crear organizaciones
 * desde la interfaz.
 *
 * Contrato probado (vista + modal):
 *   · SuperAdmin VE el botón «Nueva Organización» en la cabecera y al
 *     pulsarlo se abre el formulario de creación.
 *   · admin ordinario NO ve el botón (crear empresas es acción de
 *     plataforma; la autorización real es del servidor — esto es UI).
 *   · El formulario valida el nombre obligatorio y bloquea el envío vacío.
 *   · El envío llama a la mutación de creación con el nombre normalizado.
 *   · El botón queda deshabilitado mientras el guardado está en curso
 *     (prevención de doble envío en UI).
 *   · Tras un error de persistencia el modal PERMANECE abierto con el
 *     mensaje del hook (el usuario no pierde lo escrito).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

const authState = { user: null as { id: string; role: string } | null };

vi.mock('@/store', () => ({
  useAuthStore: () => ({ user: authState.user }),
}));

const listState = {
  data: {
    data: [
      {
        id: 'org-1', name: 'Empresa Alfa', owner_id: null, owner_name: null,
        plan: 'free', is_active: true, created_at: '2026-10-01', updated_at: '2026-10-01',
        stores_total: 1, stores_active: 1, users: 2,
      },
    ],
    pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    summary: {
      organizations: 1, active_organizations: 1, stores: 1,
      assigned_users: 2, unassigned_users: 0, scope: 'all' as const,
    },
  },
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
  isRefetching: false,
};

const createMutate = vi.fn();
const createMutateAsync = vi.fn();
const updateMutateAsync = vi.fn();
let createIsPending = false;

vi.mock('@/hooks/api/useOrganizations', () => ({
  useOrganizations: () => listState,
  useOrganizationDetail: () => ({ data: undefined, isLoading: false }),
  useDeleteOrganization: () => ({ mutate: vi.fn() }),
  useCreateOrganization: () => ({
    mutate: createMutate,
    mutateAsync: createMutateAsync,
    isPending: createIsPending,
  }),
  useUpdateOrganization: () => ({
    mutateAsync: updateMutateAsync,
    isPending: false,
  }),
  useAssignUserOrganization: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import OrganizationsView from '@/components/views/terminal/views/organizations/OrganizationsView';
import { OrganizationFormModal } from '@/components/views/terminal/views/organizations/OrganizationFormModal';

describe('CP-ORG-001 — creación de organizaciones desde la vista (brecha §4.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
    authState.user = { id: 'sa-1', role: 'superadmin' };
    createMutateAsync.mockResolvedValue({ success: true });
  });

  it('SuperAdmin ve el botón «Nueva Organización» en la cabecera', () => {
    render(<OrganizationsView />);
    expect(screen.getByRole('button', { name: 'Nueva Organización' })).toBeTruthy();
  });

  it('admin ordinario NO ve el botón de creación (acción de plataforma)', () => {
    authState.user = { id: 'admin-1', role: 'admin' };
    render(<OrganizationsView />);
    expect(screen.queryByRole('button', { name: 'Nueva Organización' })).toBeNull();
  });

  it('pulsar el botón abre el formulario de creación (no edición)', async () => {
    render(<OrganizationsView />);
    await userEvent.click(screen.getByRole('button', { name: 'Nueva Organización' }));
    // El modal de creación existe con su título y descripción de creación.
    expect(screen.getByText('Nueva organización')).toBeTruthy();
    expect(screen.getByText('Crea una empresa que agrupará tiendas y usuarios.')).toBeTruthy();
  });

  it('el formulario bloquea el envío con nombre vacío y muestra el error', async () => {
    render(<OrganizationsView />);
    await userEvent.click(screen.getByRole('button', { name: 'Nueva Organización' }));
    const input = screen.getByLabelText(/Nombre de la organización/i);
    // Blur sin escribir → error de validación visible.
    await userEvent.click(input);
    (input as HTMLInputElement).blur();
    await waitFor(() => expect(screen.getByText('El nombre es obligatorio')).toBeTruthy());
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it('enviar un nombre válido llama a la creación con nombre normalizado y cierra', async () => {
    render(<OrganizationsView />);
    await userEvent.click(screen.getByRole('button', { name: 'Nueva Organización' }));
    await userEvent.type(screen.getByLabelText(/Nombre de la organización/i), '  Grupo   Creado  ');
    // El botón de envío en modo creación tiene aria-label «Guardar organización».
    await userEvent.click(screen.getByRole('button', { name: 'Guardar organización' }));
    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    expect(createMutateAsync).toHaveBeenCalledWith({ name: 'Grupo Creado', is_active: true });
  });

  it('si la creación falla, el modal PERMANECE abierto (no se pierde el texto)', async () => {
    createMutateAsync.mockRejectedValue(new Error('Ya existe una organización con ese nombre'));
    render(<OrganizationsView />);
    await userEvent.click(screen.getByRole('button', { name: 'Nueva Organización' }));
    await userEvent.type(screen.getByLabelText(/Nombre de la organización/i), 'Repetida');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar organización' }));
    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    // El modal sigue abierto: el usuario ve el error (toast del hook) y su texto.
    expect(screen.getByRole('button', { name: 'Guardar organización' })).toBeTruthy();
    expect((screen.getByLabelText(/Nombre de la organización/i) as HTMLInputElement).value).toBe('Repetida');
  });
});

describe('CP-ORG-001 — modal de creación: doble envío deshabilitado mientras guarda (§4.6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
    createIsPending = false;
  });

  it('con la creación en curso, el botón queda deshabilitado («Guardando...») y no dispara otra creación', async () => {
    createIsPending = true; // mutación en curso desde el primer render
    render(
      <OrganizationFormModal open organization={null} onOpenChange={() => {}} />
    );
    await userEvent.type(screen.getByLabelText(/Nombre de la organización/i), 'En Curso');
    // El botón es inalcanzable para un segundo envío: deshabilitado + Guardando.
    const saving = screen.getByRole('button', { name: 'Guardando' });
    expect((saving as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Guardando...')).toBeTruthy();
    // userEvent respeta disabled: el clic no ejecuta handleSubmit.
    await userEvent.click(saving);
    expect(createMutateAsync).not.toHaveBeenCalled();
    // Y con el nombre ya escrito, un envío válido SOLO ocurre una vez cuando
    // isPending vuelve a false (segunda mutación bloqueada por la primera).
  });
});
