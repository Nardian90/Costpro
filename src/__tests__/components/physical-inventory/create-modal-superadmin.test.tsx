/**
 * MISIÓN INVENTARIO FÍSICO / SUPERADMIN (2026-10-26) — Regresión del
 * selector de tiendas de CreatePhysicalInventoryModal.
 *
 * Defecto original: el selector se construía SOLO con user.memberships →
 * «Sin Tiendas Autorizadas» para el SuperAdmin (sin membresías por diseño).
 * El modal ahora consume useAuthorizedStores y diferencia:
 *   - carga  → «Cargando tiendas…» (select deshabilitado)
 *   - error  → «Error al cargar tiendas» + reintento (role=alert)
 *   - vacío  → «Sin tiendas autorizadas» + guía (ausencia LEGÍTIMA)
 *   - datos  → opciones de tienda; por defecto la tienda activa si está
 *              autorizada, si no la primera
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  userHolder: { current: null as any },
  hookState: { current: {} as any },
}));

vi.mock('@/store', () => ({
  useAuthStore: () => ({ user: h.userHolder.current }),
}));

vi.mock('@/hooks/api/useAuthorizedStores', () => ({
  useAuthorizedStores: () => h.hookState.current,
}));

vi.mock('@/lib/api-fetch', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn() } }));

vi.mock('@/components/ui/BaseModal', () => ({
  BaseModal: ({ children, footer }: any) => (
    <div>
      <div data-testid="modal-body">{children}</div>
      <div data-testid="modal-footer">{footer}</div>
    </div>
  ),
}));

vi.mock('@/components/ui/atomic', () => ({
  PrimaryButton: ({ children, ...p }: any) => <button {...p}>{children}</button>,
  SecondaryButton: ({ children, ...p }: any) => <button {...p}>{children}</button>,
}));

import { CreatePhysicalInventoryModal } from '@/components/views/terminal/views/physical_inventory/CreatePhysicalInventoryModal';

const STORES = [
  { id: 'store-enervida', name: 'ENERVIDA-VITALLCONS' },
  { id: 'store-puerto', name: 'Puerto Padre VITALLCONS' },
];

function renderModal() {
  // El modal usa useQuery para categorías/productos del alcance (deshabilitadas
  // en estos escenarios, pero el contexto de React Query es obligatorio).
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CreatePhysicalInventoryModal open onOpenChange={vi.fn()} onCreated={vi.fn()} />
    </QueryClientProvider>
  );
}

describe('CreatePhysicalInventoryModal — selector de tiendas por rol (MISIÓN PI-SUPERADMIN)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.userHolder.current = {
      id: 'a1111111-1111-1111-1111-111111111111',
      email: 'admin@demo.com',
      fullName: 'Admin Demo',
      role: 'superadmin',
      memberships: [], // por diseño (§6 20260826120000)
      activeStoreId: 'store-puerto',
    };
  });

  it('SUPERADMIN sin membresías ve las tiendas autorizadas (regresión «Sin Tiendas Autorizadas»)', async () => {
    h.hookState.current = { data: STORES, isLoading: false, error: null, refetch: vi.fn() };
    renderModal();
    const select = screen.getByLabelText('Tienda') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.textContent);
    expect(options).toEqual(expect.arrayContaining(['ENERVIDA-VITALLCONS', 'Puerto Padre VITALLCONS']));
    expect(options).not.toContain('Sin tiendas autorizadas');
    // Por defecto: la tienda activa del usuario (está autorizada)
    await waitFor(() => expect(select.value).toBe('store-puerto'));
    // El botón de crear queda habilitado (tienda válida seleccionada)
    const createBtn = screen.getByRole('button', { name: /Crear inventario/i });
    expect(createBtn).not.toBeDisabled();
  });

  it('Tienda activa fuera de la lista → primera tienda autorizada (nunca un storeId huérfano)', async () => {
    h.userHolder.current = { ...h.userHolder.current, activeStoreId: 'store-retirada' };
    h.hookState.current = { data: STORES, isLoading: false, error: null, refetch: vi.fn() };
    renderModal();
    const select = screen.getByLabelText('Tienda') as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe('store-enervida'));
  });

  it('Cargando → «Cargando tiendas…», select deshabilitado y botón bloqueado', () => {
    h.hookState.current = { data: [], isLoading: true, error: null, refetch: vi.fn() };
    renderModal();
    const select = screen.getByLabelText('Tienda') as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    expect(Array.from(select.options).map((o) => o.textContent)).toContain('Cargando tiendas…');
    expect(screen.getByRole('button', { name: /Crear inventario/i })).toBeDisabled();
  });

  it('Error de carga → mensaje de error con reintento, NO «Sin tiendas autorizadas»', async () => {
    const refetch = vi.fn();
    h.hookState.current = {
      data: [],
      isLoading: false,
      error: new Error('permission denied for table stores'),
      refetch,
    };
    renderModal();
    const select = screen.getByLabelText('Tienda') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toContain('Error al cargar tiendas');
    expect(Array.from(select.options).map((o) => o.textContent)).not.toContain('Sin tiendas autorizadas');
    // Mensaje accionable + reintento
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('permission denied for table stores');
    expect(screen.getByRole('button', { name: /Reintentar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Crear inventario/i })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /Reintentar/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('Ausencia legítima → «Sin tiendas autorizadas» + guía (usuario sin tiendas)', () => {
    h.hookState.current = { data: [], isLoading: false, error: null, refetch: vi.fn() };
    renderModal();
    const select = screen.getByLabelText('Tienda') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toContain('Sin tiendas autorizadas');
    expect(screen.getByText(/Solicite acceso al administrador/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Crear inventario/i })).toBeDisabled();
  });
});
