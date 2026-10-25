/**
 * CP-ORG-001 — Rol de plataforma en el formulario de usuarios: NUNCA se
 * degrada silenciosamente.
 *
 * Antes: toFormRole('superadmin') → 'admin' y el select mostraba
 * «Administrador» para una cuenta de plataforma; al guardar, el payload
 * llevaba el rol degradado (downgrade de la cuenta).
 *
 * Ahora: el rol real se muestra BLOQUEADO con su nombre real y el flujo de
 * edición de useUsersView OMITE «role» del payload para cuentas de
 * plataforma (prueba del contrato del hook en este archivo).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import UserForm from '@/components/views/terminal/views/users/UserForm';
import { UserContract } from '@/contracts/user';
import { Store } from '@/types';

vi.mock('@/hooks/ui/useMobile', () => ({ useIsMobile: () => false }));

function contract(role: 'superadmin' | 'tenant_admin' | 'clerk'): UserContract {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    fullName: 'Cuenta Objetivo',
    email: 'target@x.dev',
    role,
    roles: [role],
    isActive: true,
    maxStoresLimit: 0,
    maxUsersLimit: 0,
    memberships: [],
    activeStoreId: null,
  } as unknown as UserContract;
}

const stores: Store[] = [];

describe('CP-ORG-001 — UserForm: rol de plataforma bloqueado y sin degradación', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('editando una cuenta superadmin: NO se muestra «Administrador» degradado', () => {
    render(
      <UserForm
        mode="edit"
        initialData={contract('superadmin')}
        stores={stores}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        platformRole="superadmin"
      />
    );
    // El rol REAL (nombre de plataforma) es visible...
    expect(screen.getByText(/SuperAdmin/)).toBeTruthy();
    // ...y NO se ofrece el select editable degradado.
    const editableSelect = screen.queryByLabelText('Rol de Usuario');
    // El label existe, pero el control es el panel bloqueado, no un select.
    expect(screen.getByTitle(/rol de plataforma gestionado administrativamente/i)).toBeTruthy();
    expect(screen.getByText(/no editable aquí/i)).toBeTruthy();
    expect(editableSelect).toBeNull();
  });

  it('editando una cuenta tenant_admin: muestra «Admin de Tenant» bloqueado', () => {
    render(
      <UserForm
        mode="edit"
        initialData={contract('tenant_admin')}
        stores={stores}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        platformRole="tenant_admin"
      />
    );
    expect(screen.getByText('Admin de Tenant')).toBeTruthy();
    expect(screen.getByText(/no editable aquí/i)).toBeTruthy();
  });

  it('editando un usuario ordinario: el select de rol permanece editable', () => {
    render(
      <UserForm
        mode="edit"
        initialData={contract('clerk')}
        stores={stores}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    const select = screen.getByLabelText('Rol de Usuario') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect(select.value).toBe('clerk');
  });
});
