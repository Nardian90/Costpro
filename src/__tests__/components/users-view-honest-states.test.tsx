/**
 * CP-ORG-001 §6.9 — Estados de carga, ERROR y vacío en SISTEMA → Usuarios.
 *
 * Regresión del defecto «vacío fingido»: antes useUsers tragaba los errores
 * devolviendo [] y la vista mostraba «No se encontraron usuarios» ante un
 * fallo de red/BD. Ahora el error SE PROPAGA y la vista muestra un banner
 * reintentable; el estado vacío solo aparece cuando de verdad no hay datos.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import UsersManagementView from '@/components/views/terminal/views/users/UsersManagementView';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Vista dependientes de modales — se montan, no se usan aquí.
// Autenticación del store: admin con tenant.
const mockUser = {
  id: '11111111-1111-4111-8111-111111111111',
  role: 'admin',
  email: 'admin@x.dev',
  activeStoreId: null,
  memberships: [],
  maxUsersLimit: 0,
};

let fetchImpl: (url: string, init?: RequestInit) => Promise<Response>;

vi.mock('@/store', () => ({
  useAuthStore: () => ({ user: mockUser, token: 'tok' }),
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'tok' } } }),
    },
  },
}));

const { mockToast } = vi.hoisted(() => ({ mockToast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('sonner', () => ({ toast: mockToast }));

vi.mock('@/hooks/api/useStores', () => ({
  useStores: () => ({ data: [], isLoading: false }),
}));

global.fetch = vi.fn((url: string, init?: RequestInit) => fetchImpl(url, init)) as any;

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      // retryDelay 0: el hook define retry:1; sin backoff exponencial el
      // estado de error llega inmediatamente en la prueba.
      queries: { retry: false, retryDelay: 0, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderView() {
  const client = makeClient();
  return render(
    <QueryClientProvider client={client}>
      <UsersManagementView />
    </QueryClientProvider>
  );
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const USERS_LIST_OK = {
  data: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      full_name: 'Usuario Uno',
      email: 'u1@x.dev',
      role: 'clerk',
      is_active: true,
      tenant_id: 'aaaaaaa1-0000-4000-8000-00000000000a',
      tenant_name: 'Empresa Alfa',
      memberships: [],
      created_at: '2026-10-01',
      plan: 'free',
    },
  ],
  pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
};

describe('CP-ORG-001 §6.9 — estados de carga/error/vacío honestos en Usuarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser.role = 'admin';
  });

  it('fallo de la API → banner de error reintentable, NUNCA «no se encontraron usuarios»', async () => {
    // useUsersAdmin reintenta UNA vez: las dos primeras llamadas A /api/users
    // fallan (carga inicial + reintento automático) y la tercera (botón
    // Reintentar) tiene éxito. El mock es consciente de URL: la vista también
    // consulta /api/organizations (modal de asignación) y NO debe consumir el
    // contador de fallos.
    let usersCalls = 0;
    fetchImpl = async (url: string) => {
      if (String(url).includes('/api/users?')) {
        usersCalls++;
        if (usersCalls <= 2) {
          return jsonResponse(500, { error: 'No se pudieron cargar los usuarios' });
        }
        return jsonResponse(200, USERS_LIST_OK);
      }
      return jsonResponse(200, { data: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } });
    };
    renderView();

    // El error es visible y con acción de reintento (role=alert). El reintento
    // del hook (retry: 1) puede tardar por su backoff: espera real suficiente.
    await new Promise(r => setTimeout(r, 3500));
    const alerts = document.querySelectorAll('[role="alert"]');
    expect(alerts.length).toBe(1);
    expect(alerts[0].textContent).toContain('No se pudieron cargar los usuarios');
    // El mensaje del error saneado viaja, sin fingir vacío:
    expect(screen.queryByText(/No se encontraron usuarios/)).toBeNull();

    // Reintentar: tercera llamada exitosa → el banner desaparece y aparece la fila real.
    const retry = screen.getByRole('button', { name: /Reintentar la carga de usuarios/i });
    fireEvent.click(retry);
    await waitFor(() => {
      expect(document.querySelectorAll('[role="alert"]').length).toBe(0);
      expect(screen.getByText('Usuario Uno')).toBeTruthy();
    }, { timeout: 4000 });
    expect(usersCalls).toBe(3);
  });

  it('API correcta SIN datos → estado vacío honesto (sin banner de error)', async () => {
    fetchImpl = async () => jsonResponse(200, { data: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } });
    renderView();
    await waitFor(() => {
      expect(screen.getByText(/No se encontraron usuarios/i)).toBeTruthy();
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('carga inicial → esqueleto visible antes de los datos', async () => {
    const pending: Array<{ resolve: (r: Response) => void }> = [];
    fetchImpl = () => new Promise<Response>(res => { pending.push({ resolve: res }); });
    renderView();
    // Mientras la promesa está pendiente existen 4 filas esqueleto (aria-hidden).
    const skeletons = document.querySelectorAll('tr[aria-hidden="true"]');
    expect(skeletons.length).toBe(4);
    // Liberar las promesas pendientes (la consulta dispara tras el commit).
    await waitFor(() => expect(pending.length).toBeGreaterThan(0));
    for (const p of pending) p.resolve(jsonResponse(200, USERS_LIST_OK));
    await waitFor(() => {
      expect(screen.getByText('Usuario Uno')).toBeTruthy();
    });
  });

  it('total mayor que lo mostrado → aviso honesto de listado parcial', async () => {
    fetchImpl = async () => jsonResponse(200, {
      ...USERS_LIST_OK,
      pagination: { page: 1, limit: 100, total: 250, totalPages: 3 },
    });
    renderView();
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('250 usuarios coinciden con los filtros; se muestran 1');
    });
  });
});
