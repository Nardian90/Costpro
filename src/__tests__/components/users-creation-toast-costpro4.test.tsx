/**
 * COSTPRO 4 (fix/usuarios-en-desarrollo-admin) — REGLA «una operación, un mensaje».
 *
 * Verifica sobre los hooks REALES (useUsersView + useCreateUser/useUpdateUser/
 * useManageUserMemberships) que el flujo de creación/edición de
 * Inicio → SISTEMA → Usuarios emite EXACTAMENTE una notificación por resultado:
 *
 *   A. Creación correcta  → UN solo toast verde, CERO rojos.
 *   B. Duplicado (409)    → UN solo toast rojo con mensaje claro, CERO verdes.
 *   C. Edición combinada  → UN solo toast verde (las mutaciones intermedias
 *                            son silentSuccess), CERO rojos.
 *   D. Fallo de red       → mensaje de «resultado incierto» (no afirma fracaso).
 *
 * No mockea useUsersView ni los hooks de mutación: solo las fronteras externas
 * (supabaseClient, fetch global, sonner). El conteo de toasts es la aserción
 * central del mandato COSTPRO 4.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Fronteras externas ────────────────────────────────────────────────────

const toastSpies = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
vi.mock('sonner', () => ({
  toast: {
    success: (...a: any[]) => toastSpies.success(...a),
    error: (...a: any[]) => toastSpies.error(...a),
    warning: (...a: any[]) => toastSpies.warning(...a),
    info: (...a: any[]) => toastSpies.info(...a),
  },
}));

const mockGetSession = vi.fn();
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: { getSession: (...a: any[]) => mockGetSession(...a) },
    from: () => {
      const chain: any = {
        select: () => chain, is: () => chain, order: () => chain, eq: () => chain,
        neq: () => chain,
      };
      return { ...chain, then: (res: any) => Promise.resolve({ data: [], error: null }).then(res) };
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}));

vi.mock('@/hooks/api/useStores', () => ({
  useStores: () => ({ data: [], error: null }),
}));

// fetch global: /api/users/managed-create y PATCH /api/users/:id bajo control
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { useUsersView } from '@/components/views/terminal/views/users/useUsersView';
import { useAuthStore } from '@/store';

// ── Harness ───────────────────────────────────────────────────────────────

const ADMIN_USER = {
  id: '9a111111-1111-4111-8111-999999999991',
  role: 'admin',
  activeStoreId: '9a222222-2222-4222-8222-999999999992',
  memberships: [{ store_id: '9a222222-2222-4222-8222-999999999992', role: 'admin', status: 'active' } as any],
};

function Harness({ onReady }: { onReady: (api: ReturnType<typeof useUsersView>) => void }) {
  const api = useUsersView();
  onReady(api);
  return <div>harness</div>;
}

function renderHarness() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  let api: ReturnType<typeof useUsersView>;
  render(
    <QueryClientProvider client={qc}>
      <Harness onReady={(a) => { api = a; }} />
    </QueryClientProvider>
  );
  return () => api!;
}

const CREATE_DATA = {
  fullName: 'Usuario Prueba QA',
  email: 'qa.usuario@costpro.test',
  role: 'clerk' as const,
  password: 'Secreta!123',
  isActive: true,
  plan: 'free' as const,
  maxStoresLimit: 0,
  maxUsersLimit: 0,
  memberships: [{ store_id: '9a222222-2222-4222-8222-999999999992', role: 'clerk' as const, status: 'active' as const }],
};

describe('COSTPRO 4 — creación de usuarios: una operación, un mensaje', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    useAuthStore.setState({ user: ADMIN_USER as any });
  });

  it('A. creación correcta → UN solo toast verde y CERO rojos', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true, user_id: 'u1' }), { status: 200 }));
    const getApi = renderHarness();
    await waitFor(() => expect(getApi()).toBeTruthy());
    const ok = await getApi().handleUserFormSubmit('create', CREATE_DATA as any);
    expect(ok).toBe(true);
    await waitFor(() => expect(toastSpies.success).toHaveBeenCalledTimes(1));
    expect(toastSpies.success).toHaveBeenCalledWith('Usuario creado correctamente');
    expect(toastSpies.error).not.toHaveBeenCalled();
    // El modal se cierra (limpia el modo del formulario)
    expect(getApi().userFormMode).toBeNull();
  });

  it('B. duplicado (409) → UN solo toast rojo con la causa real y CERO verdes; el formulario permanece', async () => {
    fetchMock.mockResolvedValue(new Response(
      JSON.stringify({ error: 'Ya existe un usuario con ese correo electrónico' }), { status: 409 }
    ));
    const getApi = renderHarness();
    await waitFor(() => expect(getApi()).toBeTruthy());
    const ok = await getApi().handleUserFormSubmit('create', CREATE_DATA as any);
    expect(ok).toBe(false);
    await waitFor(() => expect(toastSpies.error).toHaveBeenCalledTimes(1));
    expect(toastSpies.error.mock.calls[0][0]).toContain('Ya existe un usuario con ese correo electrónico');
    // Sin prefijo técnico doblado («Error al crear usuario: Error al crear usuario:»)
    expect(toastSpies.error.mock.calls[0][0]).not.toContain('Error al crear usuario: Error al crear usuario');
    expect(toastSpies.success).not.toHaveBeenCalled();
  });

  it('C. edición combinada (memberships + perfil) → UN solo toast verde, CERO rojos', async () => {
    fetchMock.mockImplementation(async (url: any) => {
      const u = String(url);
      if (u.includes('/api/users/9a999999-9999-4999-8999-999999999999')) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: null }), { status: 200 });
    });
    const getApi = renderHarness();
    await waitFor(() => expect(getApi()).toBeTruthy());
    const ok = await getApi().handleUserFormSubmit('edit', { ...CREATE_DATA, password: undefined } as any, '9a999999-9999-4999-8999-999999999999');
    expect(ok).toBe(true);
    await waitFor(() => expect(toastSpies.success).toHaveBeenCalledTimes(1));
    expect(toastSpies.success).toHaveBeenCalledWith('Usuario actualizado correctamente');
    expect(toastSpies.error).not.toHaveBeenCalled();
  });

  it('D. fallo de red → mensaje de resultado incierto (no afirma ni éxito ni fracaso)', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const getApi = renderHarness();
    await waitFor(() => expect(getApi()).toBeTruthy());
    const ok = await getApi().handleUserFormSubmit('create', CREATE_DATA as any);
    expect(ok).toBe(false);
    await waitFor(() => expect(toastSpies.error).toHaveBeenCalledTimes(1));
    expect(toastSpies.error.mock.calls[0][0]).toContain('No se pudo contactar al servidor');
    expect(toastSpies.error.mock.calls[0][0]).toContain('comprueba si el usuario fue creado');
    expect(toastSpies.success).not.toHaveBeenCalled();
  });
});
