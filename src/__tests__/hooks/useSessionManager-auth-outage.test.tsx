/**
 * INC-20261030 — La caída de GoTrue/Postgres NO expulsa al usuario con sesión local.
 *
 * Incidente real: Postgres del proyecto Supabase dejó de aceptar conexiones →
 * GoTrue inalcanzable (Cloudflare 522 en /auth/v1/*) → el check de sesión de
 * useSessionManager trataba el fallo transitorio como logout → HomePageClient
 * intercambiaba al landing («Entrar a COSTPRO» rebotaba de vuelta al landing).
 *
 * Contrato esperado:
 *  1. getUser() colgado/timeout con sesión local → reintento escalado, NO logout.
 *  2. Recuperación automática cuando el backend vuelve (login restaurado).
 *  3. Error definitivo (4xx/credenciales) → logout inmediato (comportamiento previo).
 *  4. Outage prolongado → la escalera se agota (3 reintentos) y el comportamiento
 *     previo deja un estado acotado (unauthenticated), nunca un bucle infinito.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// El hook evalúa isSupabaseConfigured al importar el módulo: el env debe
// existir ANTES de que se resuelvan los imports (vi.hoisted se eleva arriba).
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

const { getUserProfileMock } = vi.hoisted(() => ({ getUserProfileMock: vi.fn() }));

vi.mock('@/services/user-service', () => ({
  userService: {
    logout: vi.fn().mockResolvedValue(undefined),
    getUserProfile: getUserProfileMock,
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { renderHook, act } from '@testing-library/react';
import { useSessionManager } from '@/hooks/logic/useSessionManager';
import { useAuthStore } from '@/store';

type AuthEvent = string;
let emitAuthEvent: (event: AuthEvent, session: unknown) => void = () => {};

const validProfile = {
  id: 'user-1',
  email: 'admin@test.com',
  full_name: 'Test Admin',
  role: 'admin',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
};

const localSession = { access_token: 'tok-outage-1', user: { id: 'user-1' } };

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();

  // Restaurar el store a un estado conocido (equivalente al arranque real de la app)
  useAuthStore.getState().setLoading(true);
  useAuthStore.getState().logout();
  useAuthStore.getState().setLoading(true);
  useAuthStore.getState().setStatus('loading');

  // Capturar el callback que el hook registra en el SDK de Supabase
  onAuthStateChangeMock.mockImplementation((cb: (event: AuthEvent, session: unknown) => void) => {
    emitAuthEvent = cb;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });

  // Sesión local presente (simula el usuario autenticado antes del outage)
  getSessionMock.mockResolvedValue({ data: { session: localSession } });
  getUserProfileMock.mockResolvedValue(validProfile);

  // hasCostproSession() lee localStorage: sembrar el token COSTPRO
  window.localStorage.setItem('sb-test-auth-token', JSON.stringify(localSession));
});

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

const settle = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

describe('INC-20261030 — useSessionManager ante caída de GoTrue', () => {
  it('timeout de getUser() con sesión local NO hace logout: programa reintento y se recupera solo', async () => {
    let getUserCalls = 0;
    getUserMock.mockImplementation(() => {
      getUserCalls += 1;
      if (getUserCalls === 1) return new Promise(() => {}); // outage: cuelga
      return Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }); // backend vuelve
    });

    renderHook(() => useSessionManager());

    // SESSION_CHECK_TIMEOUT (8s): el Promise.race rechaza → catch → reintento a 5s
    await settle(8_000);
    // Vía de reintento: NO toca status, NO hace logout y CONSERVA loading=true
    // (el default del catch habría dejado loading=false + unauthenticated).
    expect(getUserMock).toHaveBeenCalledTimes(1);
    expect(signOutSdkMock).not.toHaveBeenCalled();
    expect(useAuthStore.getState().status).not.toBe('unauthenticated');
    expect(useAuthStore.getState().user).toBeNull(); // todavía sin perfil verificado
    expect(useAuthStore.getState().loading).toBe(true);

    // Reintento (5s) + getUser resuelve + perfil OK → login restaurado
    await settle(5_000);
    await settle(50);
    expect(getUserMock).toHaveBeenCalledTimes(2);
    const s = useAuthStore.getState();
    expect(s.status).toBe('authenticated_valid');
    expect(s.token).toBe('tok-outage-1');
    expect(s.user?.email).toBe('admin@test.com');
    expect(s.loading).toBe(false);
  });

  it('error definitivo (401 bad_jwt) SÍ hace logout inmediato (comportamiento previo intacto)', async () => {
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { status: 401, name: 'AuthApiError', message: 'Invalid JWT' },
    });

    renderHook(() => useSessionManager());
    await settle(100);

    const s = useAuthStore.getState();
    expect(s.status).toBe('unauthenticated');
    expect(s.user).toBeNull();
    expect(s.loading).toBe(false);
    expect(getUserMock).toHaveBeenCalledTimes(1); // sin reintentos
  });

  it('outage prolongado: la escalera se agota (3 reintentos) y queda un estado acotado', async () => {
    getUserMock.mockImplementation(() => new Promise(() => {})); // GoTrue colgado siempre

    renderHook(() => useSessionManager());

    // Ladder completa: 8s timeout + (5+8) + (15+8) + (30+8) → agotado ~82s
    await settle(90_000);

    expect(getUserMock).toHaveBeenCalledTimes(4); // inicial + 3 reintentos
    const s = useAuthStore.getState();
    expect(s.status).toBe('unauthenticated'); // acotado, no splash infinito
    expect(s.loading).toBe(false);
  });

  it('recuperación vía evento SDK: TOKEN_REFRESHED tras volver el backend refresca el token', async () => {
    useAuthStore.getState().login(
      { id: 'user-1', email: 'admin@test.com', fullName: 'Test Admin', role: 'admin', activeStoreId: '', memberships: [] } as never,
      'tok-viejo',
      'authenticated_valid'
    );
    renderHook(() => useSessionManager());
    await settle(50);

    await act(async () => {
      emitAuthEvent('TOKEN_REFRESHED', { access_token: 'tok-nuevo' });
    });
    await settle(50);

    expect(useAuthStore.getState().token).toBe('tok-nuevo');
    expect(useAuthStore.getState().status).toBe('authenticated_valid');
  });
});
