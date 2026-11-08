/**
 * CP-AUTH-RESILIENCE-003 — REGRESIÓN del bucle del CTA en useSessionManager.
 * =============================================================================
 * Incidente reportado (ampliación de docs/audits/INCIDENTE-AUTH-GOTRUE-20261030.md):
 * con un token residual que el servidor RECHAZA DEFINITIVAMENTE (p. ej. sesión
 * revocada / refresh_token_not_found), `checkSession()` llamaba solo a
 * `logout()` de Zustand: la clave residual `sb-*-auth-token` SOBREVIVÍA y el
 * CTA «Entrar a COSTPRO» re-navegaba a '/' con recarga → rechazo → logout →
 * landing… en bucle, sin mostrar nunca el modal.
 *
 * Contrato corregido: el fallo DEFINITIVO de credenciales limpia con el
 * mecanismo oficial del SDK (signOut {scope:'local'}) + Zustand, eliminando la
 * clave residual. Un fallo TRANSITORIO sigue sin limpiar nada (INC-20261030).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
});

const { getSessionMock, getUserMock, onAuthStateChangeMock, signOutSdkMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getUserMock: vi.fn(),
  onAuthStateChangeMock: vi.fn(),
  signOutSdkMock: vi.fn(),
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
      getUser: getUserMock,
      onAuthStateChange: onAuthStateChangeMock,
      signOut: signOutSdkMock,
    },
  },
}));

vi.mock('@/services/user-service', () => ({
  userService: {
    logout: vi.fn().mockResolvedValue(undefined),
    getUserProfile: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { renderHook, act, waitFor } from '@testing-library/react';
import { useSessionManager } from '@/hooks/logic/useSessionManager';
import { useAuthStore } from '@/store';
import { useSessionStore } from '@/store/session-store';

const SB_KEY = 'sb-test-auth-token';
const sessionStale = { access_token: 'stale-at', refresh_token: 'stale-rt', user: { id: 'user-1' } };

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  useAuthStore.getState().setLoading(true);
  useAuthStore.getState().logout();
  useAuthStore.getState().setLoading(true);
  useSessionStore.setState({ authPhase: 'initializing' });

  onAuthStateChangeMock.mockImplementation((cb: unknown) => {
    void cb;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  signOutSdkMock.mockResolvedValue({ error: null });
});

describe('CP-AUTH-RESILIENCE-003 · checkSession — limpieza del residuo irrecuperable', () => {
  it('rechazo DEFINITIVO (401 bad_jwt) → SDK signOut local + Zustand limpio + clave residual eliminada', async () => {
    window.localStorage.setItem(SB_KEY, JSON.stringify(sessionStale));
    getSessionMock.mockResolvedValue({ data: { session: sessionStale } });
    getUserMock.mockResolvedValue({ data: { user: null }, error: { status: 401, message: 'invalid JWT: bad_jwt' } });

    renderHook(() => useSessionManager());

    await waitFor(() => {
      expect(signOutSdkMock).toHaveBeenCalledWith({ scope: 'local' });
    });
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(useAuthStore.getState().user).toBeNull();
    // La clave residual ya NO sobrevive: el CTA deja de rebotar (bucle roto).
    expect(window.localStorage.getItem(SB_KEY)).toBeNull();
    expect(useSessionStore.getState().authPhase).toBe('session_expired');
  });

  it('rechazo transitorio (503) con sesión local → NO limpia (INC-20261030 conservado)', async () => {
    window.localStorage.setItem(SB_KEY, JSON.stringify(sessionStale));
    getSessionMock.mockResolvedValue({ data: { session: sessionStale } });
    getUserMock.mockResolvedValue({ data: { user: null }, error: { status: 503, message: 'Service Unavailable' } });

    renderHook(() => useSessionManager());

    await waitFor(() => {
      // El reintento escalado programa la primera pausa (5s) — no se limpia nada.
      expect(useSessionStore.getState().authPhase).toBe('refreshing');
    });
    expect(signOutSdkMock).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(SB_KEY)).not.toBeNull();
  }, 10_000);

  it('sin sesión en el SDK → unauthenticated simple, sin signOut innecesario', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    renderHook(() => useSessionManager());

    await waitFor(() => {
      expect(useAuthStore.getState().status).toBe('unauthenticated');
    });
    expect(signOutSdkMock).not.toHaveBeenCalled();
    expect(useSessionStore.getState().authPhase).toBe('unauthenticated');
  });

  it('sesión válida → authenticated y fase de la máquina coherente', async () => {
    window.localStorage.setItem(SB_KEY, JSON.stringify(sessionStale));
    getSessionMock.mockResolvedValue({ data: { session: sessionStale } });
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    const { userService } = await import('@/services/user-service');
    (userService.getUserProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user-1',
      full_name: 'Admin QA',
      email: 'qa@costpro.cu',
      role: 'admin',
      is_active: true,
      created_at: new Date().toISOString(),
    });

    renderHook(() => useSessionManager());

    await waitFor(() => {
      expect(useAuthStore.getState().status).toBe('authenticated_valid');
    });
    expect(useAuthStore.getState().user?.fullName).toBe('Admin QA');
    expect(useSessionStore.getState().authPhase).toBe('authenticated');
    expect(signOutSdkMock).not.toHaveBeenCalled();
  });
});
