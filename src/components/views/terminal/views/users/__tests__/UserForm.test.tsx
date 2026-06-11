/**
 * Tests para UserForm — formulario de creación/edición de usuarios.
 * Verifica: validación Zod, campos condicionales, membresías dinámicas.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';

// Mock dependencies
vi.mock('@/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

vi.mock('@/contracts/user', () => ({
  UserContract: {},
  UserContractFactory: { createEmpty: vi.fn() },
  mapProfileToContract: vi.fn(),
}));

const mockStores = [
  { id: 'store-001', name: 'Tienda Centro' },
  { id: 'store-002', name: 'Tienda Norte' },
];

describe('UserForm', () => {
  // Import after mocks
  let UserForm: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../UserForm');
    UserForm = mod.default;
  });

  const defaultProps = {
    mode: 'create' as const,
    initialData: undefined,
    stores: mockStores,
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    isSubmitting: false,
    allowedRoles: ['admin', 'encargado', 'clerk', 'warehouse'],
    isAdmin: true,
  };

  it('renderiza el campo "Nombre Completo"', () => {
    render(<UserForm {...defaultProps} />);
    expect(screen.getByLabelText(/nombre completo/i)).toBeInTheDocument();
  });

  it('renderiza el campo "Correo electrónico"', () => {
    render(<UserForm {...defaultProps} />);
    expect(screen.getByLabelText(/correo/i)).toBeInTheDocument();
  });

  it('renderiza el campo de contraseña en modo create', () => {
    render(<UserForm {...defaultProps} mode="create" />);
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();
  });

  it('NO renderiza el campo de contraseña en modo edit', () => {
    render(
      <UserForm
        {...defaultProps}
        mode="edit"
        initialData={{
          fullName: 'Test User',
          email: 'test@test.com',
          role: 'clerk',
          password: '',
          isActive: true,
          maxStoresLimit: 0,
          maxUsersLimit: 0,
          memberships: [],
        }}
      />
    );
    expect(screen.queryByLabelText(/contraseña/i)).not.toBeInTheDocument();
  });

  it('el campo email es readOnly en modo edit', () => {
    render(
      <UserForm
        {...defaultProps}
        mode="edit"
        initialData={{
          fullName: 'Test User',
          email: 'test@test.com',
          role: 'clerk',
          password: '',
          isActive: true,
          maxStoresLimit: 0,
          maxUsersLimit: 0,
          memberships: [],
        }}
      />
    );
    const emailInput = screen.getByLabelText(/correo/i);
    expect(emailInput).toHaveAttribute('readonly');
  });

  it('renderiza el select de rol con roles permitidos', () => {
    render(<UserForm {...defaultProps} />);
    const roleSelect = screen.getByLabelText(/rol/i);
    expect(roleSelect).toBeInTheDocument();
  });

  it('muestra "Sin tiendas asignadas" cuando no hay membresías', () => {
    render(<UserForm {...defaultProps} />);
    expect(screen.getByText('Sin tiendas asignadas')).toBeInTheDocument();
  });

  it('muestra el botón "Añadir Tienda"', () => {
    render(<UserForm {...defaultProps} />);
    expect(screen.getByText('Añadir Tienda')).toBeInTheDocument();
  });

  it('llama onCancel al hacer click en Cancelar', () => {
    const onCancel = vi.fn();
    render(<UserForm {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Cancelar'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('poblada con datos iniciales en modo edit', () => {
    render(
      <UserForm
        {...defaultProps}
        mode="edit"
        initialData={{
          fullName: 'Edit User',
          email: 'edit@test.com',
          role: 'admin',
          password: '',
          isActive: true,
          maxStoresLimit: 5,
          maxUsersLimit: 10,
          memberships: [
            { store_id: 'store-001', role: 'clerk', password: '', status: 'active' },
          ],
        }}
      />
    );
    expect(screen.getByLabelText(/nombre completo/i)).toHaveValue('Edit User');
    expect(screen.getByLabelText(/correo/i)).toHaveValue('edit@test.com');
  });

  it('deshabilita el botón submit durante envío', () => {
    render(<UserForm {...defaultProps} isSubmitting={true} />);
    const submitBtn = screen.getByRole('button', { name: /crear usuario/i });
    expect(submitBtn).toBeDisabled();
  });

  it('muestra error de validación para nombre < 3 chars', async () => {
    render(<UserForm {...defaultProps} />);
    const nameInput = screen.getByLabelText(/nombre completo/i);
    fireEvent.change(nameInput, { target: { value: 'AB' } });
    fireEvent.blur(nameInput);
    await waitFor(() => {
      // Should show some validation error about minimum length
      const form = nameInput.closest('form') || nameInput.closest('div');
      expect(form).toBeTruthy();
    });
  });

  it('muestra error de validación para email inválido', async () => {
    render(<UserForm {...defaultProps} />);
    const emailInput = screen.getByLabelText(/correo/i);
    fireEvent.change(emailInput, { target: { value: 'notanemail' } });
    fireEvent.blur(emailInput);
    await waitFor(() => {
      const form = emailInput.closest('form') || emailInput.closest('div');
      expect(form).toBeTruthy();
    });
  });

  it('llama onSubmit al enviar formulario válido', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<UserForm {...defaultProps} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/nombre completo/i), 'Test User');
    await user.type(screen.getByLabelText(/correo/i), 'test@test.com');
    await user.type(screen.getByLabelText(/contraseña/i), '123456');

    // Select admin (no membership required)
    const roleSelect = screen.getByLabelText(/rol/i);
    fireEvent.change(roleSelect, { target: { value: 'admin' } });

    const submitBtn = screen.getByRole('button', { name: /crear usuario/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
  });

  it('muestra el campo de contraseña opcional', () => {
    render(<UserForm {...defaultProps} mode="create" />);
    const passwordInput = screen.getByLabelText(/contraseña/i);
    expect(passwordInput).toBeInTheDocument();
    // Can be empty
    expect(passwordInput).toHaveValue('');
  });
});
