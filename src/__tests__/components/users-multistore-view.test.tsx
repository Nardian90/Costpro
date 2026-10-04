/**
 * REMEDIACIÓN fix/users-multistore-admin-password — FASE 2/3/4 (UX multi-tienda).
 *
 * Contratos verificados sobre la tabla Usuarios:
 *   - 1 tienda  → badge compacto "1 tienda" (sin chips apilados).
 *   - 5 tiendas → badge "5 tiendas"; los nombres largos NO rompen la tabla
 *                 ni desplazan la columna de acciones fuera de pantalla.
 *   - El popover lista TODAS las tiendas (nombres completos + rol por tienda
 *     + marca "Activa" según active_store_id). Ninguna tienda se oculta.
 *   - Menú ⋮ "Opciones" conserva todas las acciones existentes y añade
 *     "Cambiar contraseña"; para la propia fila queda deshabilitado.
 *   - "Sin asignaciones" se mantiene.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

const mockHookState = {
  searchTerm: '',
  setSearchTerm: vi.fn(),
  userFormMode: null,
  selectedUserContract: null,
  users: [] as any[],
  stores: [] as any[],
  handleEditUser: vi.fn(),
  handleCreateUser: vi.fn(),
  handleCloseModal: vi.fn(),
  handleUserFormSubmit: vi.fn(),
  handleToggleUserStatus: vi.fn(),
  handleDeleteUser: vi.fn(),
  handleResetPassword: vi.fn(),
  handleUpdatePlan: vi.fn(),
  openSetPassword: vi.fn(),
  closeSetPassword: vi.fn(),
  submitSetPassword: vi.fn(),
  setPasswordTarget: null as any,
  isSubmittingUser: false,
  allowedRoles: ['admin', 'encargado', 'clerk'],
  isAdmin: true,
  canCreateMoreUsers: true,
  limitReachedMessage: undefined,
  user: { id: 'admin-row-1', role: 'admin' } as any,
};

vi.mock('@/components/views/terminal/views/users/useUsersView', () => ({
  useUsersView: () => mockHookState,
}));

vi.mock('@/hooks/api/useStores', () => ({
  useStores: () => ({ data: [], error: null }),
}));

import UsersManagementView from '@/components/views/terminal/views/users/UsersManagementView';

const LONG_NAME = 'Tienda ENER-VIDA VITALLCONS Centro — Sucursal Principal Norte con Nombre Extensísimo';

function makeMembership(i: number, role = 'clerk') {
  return {
    store_id: `store-uuid-${i}`,
    role,
    status: 'active',
    store: { id: `store-uuid-${i}`, name: `${LONG_NAME} #${i}`, is_active: true },
  };
}

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-uuid-1',
    full_name: 'Juan Pérez',
    email: 'juan.perez@costpro.dev',
    role: 'clerk',
    is_active: true,
    plan: 'free',
    created_at: '2026-01-01T00:00:00Z',
    memberships: [] as any[],
    active_store_id: null as string | null,
    ...overrides,
  };
}

function renderView() {
  return render(<UsersManagementView />);
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockHookState.user = { id: 'admin-row-1', role: 'admin' } as any;
});

describe('UsersManagementView — representación compacta multi-tienda (FASE 2/3)', () => {
  it('usuario con 1 tienda → badge "1 tienda" sin volcar el nombre en la tabla', async () => {
    mockHookState.users = [makeUser({ memberships: [makeMembership(1)] })];
    renderView();

    const badge = screen.getByRole('button', { name: /Ver 1 tienda asignada de Juan Pérez/i });
    expect(badge).toBeTruthy();
    expect(badge.textContent).toContain('1 tienda');

    // Compacto: el nombre largo de la tienda NO vive en la celda de la tabla.
    expect(screen.queryByText(LONG_NAME)).toBeNull();
  });

  it('usuario con 5 tiendas → UN badge "5 tiendas"; la tabla no apila chips', async () => {
    mockHookState.users = [
      makeUser({
        memberships: [1, 2, 3, 4, 5].map((i) => makeMembership(i, i === 1 ? 'encargado' : 'clerk')),
        active_store_id: 'store-uuid-2',
      }),
    ];
    renderView();

    const badge = screen.getByRole('button', { name: /Ver 5 tiendas asignadas de Juan Pérez/i });
    expect(badge).toBeTruthy();
    expect(badge.textContent).toContain('5 tiendas');

    // Ninguno de los 5 nombres largos aparece suelto en la tabla (compacto).
    expect(screen.queryByText(`${LONG_NAME} #1`)).toBeNull();
    expect(screen.queryByText(`${LONG_NAME} #5`)).toBeNull();

    // La columna de acciones sigue siendo UN solo botón de menú por fila.
    expect(screen.getAllByRole('button', { name: /Opciones de Juan Pérez/i })).toHaveLength(1);
  });

  it('popover "Tiendas asignadas" lista TODAS las tiendas con rol y marca Activa', async () => {
    const user = userEvent.setup();
    mockHookState.users = [
      makeUser({
        memberships: [1, 2, 3, 4, 5].map((i) => makeMembership(i, i === 1 ? 'encargado' : 'clerk')),
        active_store_id: 'store-uuid-2',
      }),
    ];
    renderView();

    await user.click(screen.getByRole('button', { name: /Ver 5 tiendas asignadas/i }));

    expect(screen.getByText('Tiendas asignadas (5)')).toBeTruthy();
    // Ninguna tienda se oculta: los 5 nombres completos están en el popover.
    for (let i = 1; i <= 5; i++) {
      expect(screen.getByText(`${LONG_NAME} #${i}`)).toBeTruthy();
    }
    // Roles visibles por tienda.
    expect(screen.getAllByText('Encargado')).toHaveLength(1);
    expect(screen.getAllByText('Cajero')).toHaveLength(4);
    // Tienda activa/default conservada.
    expect(screen.getByText('Activa')).toBeTruthy();
  });

  it('usuario sin memberships → "Sin asignaciones"', () => {
    mockHookState.users = [makeUser({ memberships: [] })];
    renderView();
    expect(screen.getByText('Sin asignaciones')).toBeTruthy();
  });
});

describe('UsersManagementView — columna de acciones estable con menú ⋮ (FASE 4)', () => {
  it('el menú Opciones conserva las acciones existentes y añade Cambiar contraseña', async () => {
    const user = userEvent.setup();
    const target = makeUser({ memberships: [makeMembership(1)] });
    mockHookState.users = [target];
    renderView();

    await user.click(screen.getByRole('button', { name: /Opciones de Juan Pérez/i }));

    expect(screen.getByText('Editar usuario')).toBeTruthy();
    expect(screen.getByText('Cambiar contraseña')).toBeTruthy();
    expect(screen.getByText('Enviar correo de recuperación')).toBeTruthy();
    expect(screen.getByText('Eliminar usuario')).toBeTruthy();
  });

  it('"Cambiar contraseña" abre el modal con el usuario objetivo', async () => {
    const user = userEvent.setup();
    const target = makeUser({ memberships: [makeMembership(1)] });
    mockHookState.users = [target];
    renderView();

    await user.click(screen.getByRole('button', { name: /Opciones de Juan Pérez/i }));
    await user.click(screen.getByText('Cambiar contraseña'));

    expect(mockHookState.openSetPassword).toHaveBeenCalledTimes(1);
    expect(mockHookState.openSetPassword).toHaveBeenCalledWith(target);
  });

  it('en la propia fila del admin, "Cambiar contraseña" queda deshabilitado (self-block UI)', async () => {
    const user = userEvent.setup();
    const selfRow = makeUser({ id: 'admin-row-1', full_name: 'Admin Demo' });
    mockHookState.users = [selfRow];
    renderView();

    await user.click(screen.getByRole('button', { name: /Opciones de Admin Demo/i }));
    // Radix DropdownMenuItem → role="menuitem" con data-disabled (no <button>).
    const item = screen.getByRole('menuitem', { name: /Cambiar contraseña/i });
    expect(item.getAttribute('data-disabled')).not.toBeNull();
  });

  it('"Eliminar usuario" ejecuta el handler preexistente (ninguna acción se elimina)', async () => {
    const user = userEvent.setup();
    const target = makeUser({ memberships: [makeMembership(1)] });
    mockHookState.users = [target];
    renderView();

    await user.click(screen.getByRole('button', { name: /Opciones de Juan Pérez/i }));
    await user.click(screen.getByText('Eliminar usuario'));
    expect(mockHookState.handleDeleteUser).toHaveBeenCalledWith(target.id);
  });
});
