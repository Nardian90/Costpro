/**
 * Tests para UsersManagementView — vista principal de gestión de usuarios.
 * Verifica: renderizado de tabla, búsqueda, self-protection, limit message.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock the hook
vi.mock('../useUsersView', () => ({
  useUsersView: vi.fn(),
}));

// Mock UI components that are external
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
        <button key={a.id} onClick={a.onClick} disabled={a.disabled} data-variant={a.variant}>
          {a.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange, disabled }: any) => (
    <button
      data-testid="switch"
      data-checked={checked}
      onClick={() => !disabled && onCheckedChange(!checked)}
      disabled={disabled}
    />
  ),
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, defaultValue, onValueChange }: any) => (
    <div data-testid="select" data-value={defaultValue}>{children}</div>
  ),
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <div data-value={value}>{children}</div>,
}));

vi.mock('../UserFormModal', () => ({
  UserFormModal: () => null,
}));

import UsersManagementView from '../UsersManagementView';
import { useUsersView } from '../useUsersView';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

const mockUser = { id: 'user-001', role: 'admin' };

const mockUsersData = [
  {
    id: 'user-001',
    email: 'admin@costpro.com',
    full_name: 'Administrador',
    role: 'admin',
    created_at: '2025-01-01T00:00:00Z',
    is_active: true,
    plan: 'pro',
    memberships: [],
  },
  {
    id: 'user-002',
    email: 'vendedor@costpro.com',
    full_name: 'Juan Vendedor',
    role: 'clerk',
    created_at: '2025-02-15T00:00:00Z',
    is_active: true,
    plan: 'free',
    memberships: [
      { store_id: 'store-001', role: 'clerk', status: 'active', store: { name: 'Tienda Centro' } },
    ],
  },
  {
    id: 'user-003',
    email: 'inactivo@costpro.com',
    full_name: 'Pedro Inactivo',
    role: 'clerk',
    created_at: '2025-03-01T00:00:00Z',
    is_active: false,
    plan: 'free',
    memberships: [],
  },
];

const defaultHookReturn = {
  searchTerm: '',
  setSearchTerm: vi.fn(),
  userFormMode: null,
  users: mockUsersData,
  stores: [],
  handleEditUser: vi.fn(),
  handleCreateUser: vi.fn(),
  handleCloseModal: vi.fn(),
  handleUserFormSubmit: vi.fn(),
  handleToggleUserStatus: vi.fn(),
  handleDeleteUser: vi.fn(),
  handleResetPassword: vi.fn(),
  handleUpdatePlan: vi.fn(),
  isSubmittingUser: false,
  allowedRoles: ['admin', 'encargado', 'clerk'],
  isAdmin: true,
  canCreateMoreUsers: true,
  limitReachedMessage: null,
  user: mockUser,
};

describe('UsersManagementView', () => {
  beforeEach(() => {
    vi.mocked(useUsersView).mockReturnValue(defaultHookReturn as any);
  });

  it('renderiza el título "Usuarios"', () => {
    render(<UsersManagementView />, { wrapper });
    expect(screen.getByText('Usuarios')).toBeInTheDocument();
  });

  it('renderiza las filas de la tabla con datos de usuarios', () => {
    render(<UsersManagementView />, { wrapper });
    expect(screen.getByText('Administrador')).toBeInTheDocument();
    expect(screen.getByText('Juan Vendedor')).toBeInTheDocument();
    expect(screen.getByText('Pedro Inactivo')).toBeInTheDocument();
  });

  it('muestra los emails de los usuarios', () => {
    render(<UsersManagementView />, { wrapper });
    expect(screen.getByText('admin@costpro.com')).toBeInTheDocument();
    expect(screen.getByText('vendedor@costpro.com')).toBeInTheDocument();
    expect(screen.getByText('inactivo@costpro.com')).toBeInTheDocument();
  });

  it('muestra el avatar con la inicial del nombre', () => {
    render(<UsersManagementView />, { wrapper });
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('J')).toBeInTheDocument();
    expect(screen.getByText('P')).toBeInTheDocument();
  });

  it('muestra días activos', () => {
    render(<UsersManagementView />, { wrapper });
    // Since days are calculated dynamically, we check for "Días" text
    const diasElements = screen.getAllByText('Días');
    expect(diasElements.length).toBe(3);
  });

  it('muestra el botón "Nuevo Usuario"', () => {
    render(<UsersManagementView />, { wrapper });
    expect(screen.getByText('Nuevo Usuario')).toBeInTheDocument();
  });

  it('deshabilita "Nuevo Usuario" cuando no se pueden crear más', () => {
    vi.mocked(useUsersView).mockReturnValue({
      ...defaultHookReturn,
      canCreateMoreUsers: false,
    } as any);
    render(<UsersManagementView />, { wrapper });
    const btn = screen.getByText('Nuevo Usuario');
    expect(btn).toBeDisabled();
  });

  it('muestra mensaje de límite alcanzado', () => {
    vi.mocked(useUsersView).mockReturnValue({
      ...defaultHookReturn,
      limitReachedMessage: 'Límite de 3 usuarios alcanzado',
    } as any);
    render(<UsersManagementView />, { wrapper });
    expect(screen.getByText('Límite de 3 usuarios alcanzado')).toBeInTheDocument();
  });

  it('muestra el buscador de usuarios', () => {
    render(<UsersManagementView />, { wrapper });
    expect(screen.getByTestId('searchbar')).toBeInTheDocument();
  });

  it('muestra estado vacío cuando no hay usuarios', () => {
    vi.mocked(useUsersView).mockReturnValue({
      ...defaultHookReturn,
      users: [],
    } as any);
    render(<UsersManagementView />, { wrapper });
    expect(screen.getByText(/No se encontraron usuarios/i)).toBeInTheDocument();
  });

  it('muestra badges de membresía "Cajero" para usuarios con tiendas asignadas', () => {
    render(<UsersManagementView />, { wrapper });
    // getRoleLabel maps 'clerk' to 'Cajero'
    expect(screen.getByText('Cajero')).toBeInTheDocument();
  });

  it('muestra "Sin asignaciones" para usuarios sin tiendas', () => {
    render(<UsersManagementView />, { wrapper });
    const sinAsignaciones = screen.getAllByText('Sin asignaciones');
    expect(sinAsignaciones.length).toBe(2); // admin and inactivo
  });

  it('muestra switches de estado activo/inactivo', () => {
    render(<UsersManagementView />, { wrapper });
    const switches = screen.getAllByTestId('switch');
    expect(switches.length).toBe(3); // one per user
  });

  it('muestra "Activo" para usuarios activos', () => {
    render(<UsersManagementView />, { wrapper });
    const activoTexts = screen.getAllByText('Activo');
    expect(activoTexts.length).toBe(2);
  });

  it('muestra "Baneado" para usuarios inactivos', () => {
    render(<UsersManagementView />, { wrapper });
    expect(screen.getByText('Baneado')).toBeInTheDocument();
  });

  it('muestra botones de acción en cada fila', () => {
    render(<UsersManagementView />, { wrapper });
    // Check that action buttons are rendered (edit, reset password, delete)
    const allButtons = screen.getAllByRole('button');
    // Should have multiple action buttons across 3 user rows
    expect(allButtons.length).toBeGreaterThan(3);
  });

  it('deshabilita eliminar para el usuario actual (self-protection)', () => {
    render(<UsersManagementView />, { wrapper });
    const deleteBtns = screen.getAllByLabelText('Eliminar usuario');
    // The first delete button is for admin (self), should be disabled
    expect(deleteBtns[0]).toBeDisabled();
  });

  it('renderiza selects de plan para admin', () => {
    render(<UsersManagementView />, { wrapper });
    const selects = screen.getAllByTestId('select');
    expect(selects.length).toBe(3); // one per user row
  });
});
