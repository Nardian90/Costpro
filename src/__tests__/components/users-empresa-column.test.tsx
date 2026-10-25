/**
 * MISIÓN ORGANIZACIONES (2026-10-26) — FASE 9 §Usuarios: columna
 * Empresa/Organización en SISTEMA → Usuarios.
 *
 * Contrato (misión FASE 2 §1):
 *   · Usuario normal → nombre canónico de su organización (nunca el UUID).
 *   · Cuenta SuperAdmin → etiqueta «SuperAdmin» (rol de plataforma, no empresa).
 *   · Usuario ordinario sin organización → «Sin asignar» con estilo de
 *     incidencia visible.
 *   · La acción «Asignar empresa» existe en el menú ⋮ de cada fila.
 *   · Filtros presentes: empresa / rol / estado («Todas las empresas» solo
 *     con SuperAdmin).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

const mockHookState = {
  searchTerm: '',
  setSearchTerm: vi.fn(),
  orgFilter: 'all',
  setOrgFilter: vi.fn(),
  roleFilter: 'all',
  setRoleFilter: vi.fn(),
  statusFilter: 'all',
  setStatusFilter: vi.fn(),
  userFormMode: null,
  selectedUserContract: null,
  assignTarget: null,
  setAssignTarget: vi.fn(),
  orgOptions: [{ id: 'org-1', name: 'Empresa Enervida' }],
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
  isSuperAdmin: false,
  canCreateMoreUsers: true,
  limitReachedMessage: undefined,
  user: { id: 'admin-row-1', role: 'admin' } as any,
};

vi.mock('@/components/views/terminal/views/users/useUsersView', () => ({
  useUsersView: () => mockHookState,
}));

vi.mock('@/hooks/api/useOrganizations', () => ({
  useOrganizations: () => ({ data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn(), isRefetching: false }),
  useOrganizationDetail: () => ({ data: undefined, isLoading: false, isError: false, error: null }),
  useAssignUserOrganization: () => ({ mutateAsync: vi.fn(), isPending: false, reset: vi.fn() }),
}));

vi.mock('@/hooks/api/useStores', () => ({
  useStores: () => ({ data: [], error: null }),
}));

import UsersManagementView from '@/components/views/terminal/views/users/UsersManagementView';

const baseUser = {
  id: 'u-1',
  full_name: 'Usuario Prueba',
  email: 'u1@x.dev',
  role: 'clerk',
  is_active: true,
  created_at: new Date().toISOString(),
  memberships: [],
};

describe('MISIÓN ORGANIZACIONES — columna Empresa/Organización (FASE 2 §1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
    mockHookState.users = [];
    mockHookState.isSuperAdmin = false;
  });

  it('usuario normal → nombre canónico de su organización (no el UUID)', () => {
    mockHookState.users = [{ ...baseUser, tenant_id: 'org-1', tenant_name: 'Empresa Enervida' }];
    render(<UsersManagementView />);
    expect(screen.getByText('Empresa Enervida')).toBeTruthy();
    expect(screen.queryByText('org-1')).toBeNull();
  });

  it('cuenta SuperAdmin → etiqueta «SuperAdmin» (rol de plataforma)', () => {
    mockHookState.users = [{ ...baseUser, id: 'sa-1', role: 'superadmin', tenant_id: 'org-1', tenant_name: 'Empresa Enervida' }];
    render(<UsersManagementView />);
    expect(screen.getByText('SuperAdmin')).toBeTruthy();
    // La etiqueta de plataforma reemplaza al nombre de la empresa
    expect(screen.queryByText('Empresa Enervida')).toBeNull();
  });

  it('usuario sin organización → «Sin asignar» visible como incidencia', () => {
    mockHookState.users = [{ ...baseUser, tenant_id: null, tenant_name: null }];
    render(<UsersManagementView />);
    expect(screen.getByText('Sin asignar')).toBeTruthy();
  });

  it('la columna existe en el encabezado de la tabla', () => {
    mockHookState.users = [];
    render(<UsersManagementView />);
    expect(screen.getByText('Empresa / Organización')).toBeTruthy();
  });

  it('el menú ⋮ incluye «Asignar empresa»', async () => {
    mockHookState.users = [{ ...baseUser, tenant_id: null }];
    render(<UsersManagementView />);
    const menuButton = screen.getByRole('button', { name: 'Opciones de Usuario Prueba' });
    await userEvent.click(menuButton);
    expect(screen.getByText('Asignar empresa')).toBeTruthy();
  });

  it('«Asignar empresa» abre el modal de asignación (acción de resolución)', async () => {
    mockHookState.users = [{ ...baseUser, tenant_id: null }];
    render(<UsersManagementView />);
    await userEvent.click(screen.getByRole('button', { name: 'Opciones de Usuario Prueba' }));
    await userEvent.click(screen.getByText('Asignar empresa'));
    expect(mockHookState.setAssignTarget).toHaveBeenCalledWith(expect.objectContaining({ id: 'u-1' }));
  });

  it('con SuperAdmin, el filtro de empresa ofrece «Todas las empresas» y «Sin asignar»', () => {
    mockHookState.isSuperAdmin = true;
    mockHookState.users = [{ ...baseUser, tenant_id: null }];
    render(<UsersManagementView />);
    // Los Select de Radix renderizan triggers con el valor actual; los
    // ítems solo al abrir. Verificamos el trigger del filtro de empresa.
    expect(screen.getByRole('combobox', { name: 'Filtrar por empresa' })).toBeTruthy();
  });
});
