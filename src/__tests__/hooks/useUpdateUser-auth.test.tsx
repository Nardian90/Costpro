/**
 * useUpdateUser-auth.test.tsx — MISIÓN 2026-10-21 (TAREA 3: roles de usuario)
 *
 * Regresión del bug «Error al actualizar usuario. No autorizado»:
 * el hook useUpdateUser hacía PATCH /api/users/[id] SIN header Authorization
 * → withRole('admin') → getServerSession (fail-closed SEC-024) → 401.
 *
 * Contrato corregido:
 *   1. El PATCH lleva Authorization: Bearer <token de sesión Supabase>.
 *   2. Sin sesión activa → error claro de sesión (NO se contacta al endpoint).
 *   3. 401 del backend → mensaje de sesión inválida/expirada.
 *   4. 403 (ERR_UNAUTHORIZED de managed_update_user) → mensaje de permisos.
 *   5. 404 → «Usuario no encontrado.»
 *   6. Éxito → devuelve el JSON del servidor.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mocks
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

const getSessionMock = vi.fn(async () => ({
  data: { session: { access_token: 'jwt-admin-test' } },
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => getSessionMock(...(args as [])),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { useUpdateUser } from '@/hooks/api/useUsers';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const USER_ID = 'd1000000-0000-4000-8000-000000000001';

describe('useUpdateUser — FIX MISIÓN-ROLES (TAREA 3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockFetch.mockReset();
    getSessionMock.mockClear();
    getSessionMock.mockImplementation(async () => ({
      data: { session: { access_token: 'jwt-admin-test' } },
    }));
  });

  it('1 · envía PATCH con header Authorization: Bearer (raíz del bug 401)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const { result } = renderHook(() => useUpdateUser({ silentSuccess: true }), { wrapper: makeWrapper() });
    await result.current.mutateAsync({ id: USER_ID, role: 'encargado' as never });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`/api/users/${USER_ID}`);
    expect(init.method).toBe('PATCH');
    expect(init.headers).toEqual(
      expect.objectContaining({
        'Content-Type': 'application/json',
        'Authorization': 'Bearer jwt-admin-test',
      }),
    );
    expect(JSON.parse(init.body)).toEqual({ role: 'encargado' });
  });

  it('2 · sin sesión activa lanza error claro y NO llama al endpoint', async () => {
    getSessionMock.mockImplementationOnce(async () => ({ data: { session: null } }));

    const { result } = renderHook(() => useUpdateUser({ silentSuccess: true }), { wrapper: makeWrapper() });

    await expect(
      result.current.mutateAsync({ id: USER_ID, role: 'encargado' as never }),
    ).rejects.toThrow(/Sesión inválida o expirada/i);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('3 · 401 del backend → mensaje de sesión inválida (diferenciado)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'No autorizado', message: 'Se requiere sesión activa' }),
    });

    const { result } = renderHook(() => useUpdateUser({ silentSuccess: true }), { wrapper: makeWrapper() });

    await expect(
      result.current.mutateAsync({ id: USER_ID, role: 'encargado' as never }),
    ).rejects.toThrow(/Se requiere sesión activa/);
  });

  it('4 · 403 (ERR_UNAUTHORIZED de la RPC) → mensaje de permisos insuficientes', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: 'No autorizado' }),
    });

    const { result } = renderHook(() => useUpdateUser({ silentSuccess: true }), { wrapper: makeWrapper() });

    await expect(
      result.current.mutateAsync({ id: USER_ID, role: 'encargado' as never }),
    ).rejects.toThrow(/Permisos insuficientes para actualizar este usuario/);
  });

  it('5 · 404 → «Usuario no encontrado.»', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Usuario no encontrado' }),
    });

    const { result } = renderHook(() => useUpdateUser({ silentSuccess: true }), { wrapper: makeWrapper() });

    await expect(
      result.current.mutateAsync({ id: USER_ID, role: 'encargado' as never }),
    ).rejects.toThrow('Usuario no encontrado.');
  });

  it('6 · éxito (200) devuelve la respuesta del servidor', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, role: 'encargado' }),
    });

    const { result } = renderHook(() => useUpdateUser({ silentSuccess: true }), { wrapper: makeWrapper() });
    const data = await result.current.mutateAsync({ id: USER_ID, role: 'encargado' as never });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(data).toEqual({ success: true, role: 'encargado' });
  });
});
