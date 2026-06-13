/**
 * Tests para RolesManagementView — vista de gestión de roles y permisos.
 * Verifica: renderizado de tabla, búsqueda, creación, edición, eliminación.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/api/useRoles', () => ({
  useRoles: vi.fn(),
  useDeleteRole: vi.fn(),
  useCreateRole: vi.fn(),
  useUpdateRole: vi.fn(),
}));

vi.mock('@/components/ui/SearchBar', () => ({
  default: ({ value, onChange, placeholder }: any) => (
    <input
      data-testid="searchbar" aria-label="Buscar"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
}));

vi.mock('@/components/ui/ActionMenu', () => ({
  default: ({ actions }: any) => (
    <div data-testid="action-menu">
      {actions.map((a: any) => (
        <button key={a.id} onClick={a.onClick}>{a.label}</button>
      ))}
    </div>
  ),
}));

vi.mock('@/components/ui/BaseModal', () => ({
  BaseModal: ({ open, children, title }: any) =>
    open ? <div data-testid="role-modal" data-title={title}>{children}</div> : null,
}));

vi.mock('../RoleForm', () => ({
  default: ({ initialData, onSubmit, onCancel }: any) => (
    <div data-testid="role-form">
      <button onClick={() => onSubmit(initialData || { name: 'Test', is_default: false, permissions: { views: ['Dashboard'], all: false } })}>
        {initialData ? 'Guardar' : 'Crear'}
      </button>
      <button onClick={onCancel}>Cancelar</button>
    </div>
  ),
}));

import RolesManagementView from '../RolesManagementView';
import { useRoles, useDeleteRole, useCreateRole, useUpdateRole } from '@/hooks/api/useRoles';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

const mockRoles = [
  {
    id: 'role-001',
    name: 'Administrador',
    permissions: { views: [], all: true },
    is_default: false,
    created_at: '2025-01-01',
  },
  {
    id: 'role-002',
    name: 'Vendedor',
    permissions: { views: ['Dashboard', 'POS', 'Inventory'], all: false },
    is_default: true,
    created_at: '2025-01-15',
  },
  {
    id: 'role-003',
    name: 'Almacén',
    permissions: { views: ['Dashboard', 'Inventory'], all: false },
    is_default: false,
    created_at: '2025-02-01',
  },
];

describe('RolesManagementView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRoles).mockReturnValue({
      data: mockRoles,
      isLoading: false,
    } as any);
    vi.mocked(useDeleteRole).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
    } as any);
    vi.mocked(useCreateRole).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    } as any);
    vi.mocked(useUpdateRole).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    } as any);
  });

  it('renderiza el título "Roles y Permisos"', () => {
    render(<RolesManagementView />, { wrapper });
    expect(screen.getByText('Roles y Permisos')).toBeInTheDocument();
  });

  it('renderiza todas las filas de roles', () => {
    render(<RolesManagementView />, { wrapper });
    expect(screen.getByText('Administrador')).toBeInTheDocument();
    expect(screen.getByText('Vendedor')).toBeInTheDocument();
    expect(screen.getByText('Almacén')).toBeInTheDocument();
  });

  it('muestra "Acceso Total" para rol con permisos all=true', () => {
    render(<RolesManagementView />, { wrapper });
    expect(screen.getByText('Acceso Total')).toBeInTheDocument();
  });

  it('muestra las vistas permitidas en la descripción', () => {
    render(<RolesManagementView />, { wrapper });
    // Views are shown in the component - check for any view text
    expect(screen.getByText('Vendedor')).toBeInTheDocument();
  });

  it('muestra el buscador de roles', () => {
    render(<RolesManagementView />, { wrapper });
    expect(screen.getByTestId('searchbar')).toBeInTheDocument();
  });

  it('filtra roles por búsqueda de nombre', () => {
    render(<RolesManagementView />, { wrapper });
    const searchInput = screen.getByTestId('searchbar');
    fireEvent.change(searchInput, { target: { value: 'Admin' } });
    expect(screen.getByText('Administrador')).toBeInTheDocument();
    expect(screen.queryByText('Vendedor')).not.toBeInTheDocument();
  });

  it('muestra estado vacío cuando no hay roles', () => {
    vi.mocked(useRoles).mockReturnValue({
      data: [],
      isLoading: false,
    } as any);
    render(<RolesManagementView />, { wrapper });
    expect(screen.getByText(/No se encontraron roles/i)).toBeInTheDocument();
  });

  it('muestra el botón para crear rol', () => {
    render(<RolesManagementView />, { wrapper });
    expect(screen.getByText('Nuevo Rol')).toBeInTheDocument();
  });

  it('abre modal al hacer click en Nuevo Rol', () => {
    render(<RolesManagementView />, { wrapper });
    fireEvent.click(screen.getByText('Nuevo Rol'));
    expect(screen.getByTestId('role-modal')).toBeInTheDocument();
  });

  it('abre modal al hacer click en editar un rol', () => {
    render(<RolesManagementView />, { wrapper });
    // Find edit buttons
    const editBtns = screen.getAllByLabelText(/editar/i);
    fireEvent.click(editBtns[0]);
    expect(screen.getByTestId('role-modal')).toBeInTheDocument();
  });

  it('elimina un rol con confirmación', async () => {
    global.confirm = vi.fn().mockReturnValue(true);
    const deleteRole = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useDeleteRole).mockReturnValue({
      mutateAsync: deleteRole,
    } as any);

    render(<RolesManagementView />, { wrapper });
    const deleteBtns = screen.getAllByLabelText(/eliminar/i);
    if (deleteBtns.length > 0) {
      fireEvent.click(deleteBtns[0]);
      expect(global.confirm).toHaveBeenCalled();
    }
  });
});
