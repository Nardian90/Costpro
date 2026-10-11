/**
 * FIX-LOGOUT-SPLASH (2026-10-12) — Cierre de sesión como transición ÚNICA.
 *
 * Causa raíz corregida: al emitirse `SIGNED_OUT`, el listener de
 * GlobalSessionManager ejecutaba `window.location.reload()` cuando había una
 * sesión activa, y TerminalShell recargaba en `handleLogout` y en un efecto
 * `status === 'unauthenticated'`. Como el auth store ya se limpiaba de forma
 * reactiva (HomePageClient intercambia el shell por el Landing), el reload
 * re-montaba toda la app y reactivaba el Splash DESPUÉS de que el Landing ya
 * era visible → transición duplicada Landing → Splash → Landing.
 *
 * Estrategia de test:
 *  - Conductual: el listener limpia el auth store exactamente una vez, es
 *    idempotente y conserva SIGNED_IN/TOKEN_REFRESHED; contrato de logout()
 *    (una sola notificación con loading=false + unauthenticated) que permite
 *    a HomePageClient intercambiar a Landing sin estados intermedios.
 *  - Contrato de fuente: jsdom implementa reload() como no-op silencioso (no
 *    espiable ni observable en runtime), así que la prohibición de
 *    `window.location.reload` en el flujo de cierre de sesión se blindan a
 *    nivel de fuente (patrón ya usado por integration/iteration-12.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

import { renderHook, act } from '@testing-library/react';
import { useSessionManager } from '@/hooks/logic/useSessionManager';
import { useAuthStore } from '@/store';
import { supabase } from '@/lib/supabaseClient';

type AuthEvent = string;
let emitAuthEvent: (event: AuthEvent, session: unknown) => void = () => {};

const authedUser = {
  id: 'user-1',
  fullName: 'Test Admin',
  email: 'admin@test.com',
  role: 'admin',
  activeStoreId: 'store-1',
  memberships: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  // Restaurar el store a un estado conocido
  useAuthStore.getState().setLoading(true);
  useAuthStore.getState().logout();
  useAuthStore.getState().setLoading(true);

  // Capturar el callback que el hook registra en el SDK de Supabase
  onAuthStateChangeMock.mockImplementation((cb: (event: AuthEvent, session: unknown) => void) => {
    emitAuthEvent = cb;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });

  // checkSession(true) corre en el mount: sin sesión en el SDK
  getSessionMock.mockResolvedValue({ data: { session: null } });
});

describe('FIX-LOGOUT-SPLASH — listener onAuthStateChange (useSessionManager)', () => {
  // Estabiliza el checkSession de montaje (getSession → null): sus
  // notificaciones no forman parte de la transición de logout.
  const settleMount = async () => {
    await act(async () => {});
    await act(async () => {});
  };

  it('SIGNED_OUT: limpia el auth store en una única transición determinista', async () => {
    useAuthStore.getState().login(authedUser as never, 'token-1', 'authenticated_valid');
    expect(useAuthStore.getState().status).toBe('authenticated_valid');

    renderHook(() => useSessionManager());
    expect(onAuthStateChangeMock).toHaveBeenCalledTimes(1);
    await settleMount();

    const seen: Array<{ loading: boolean; status: string }> = [];
    const unsub = useAuthStore.subscribe((state) => {
      seen.push({ loading: state.loading, status: state.status });
    });

    await act(async () => {
      emitAuthEvent('SIGNED_OUT', null);
    });
    await settleMount();
    unsub();

    const s = useAuthStore.getState();
    expect(s.user).toBeNull();
    expect(s.token).toBeNull();
    expect(s.status).toBe('unauthenticated');
    expect(s.loading).toBe(false);

    // Transición ÚNICA: la PRIMERA notificación tras SIGNED_OUT ya contiene el
    // estado final (loading=false + unauthenticated) — HomePageClient
    // intercambia a Landing en esa misma notificación, sin ventana intermedia
    // autenticada ni de loading. (logout() + setLoading(false) pueden emitir
    // dos set() idénticos: zustand notifica por set(), no por valor.)
    expect(seen.length).toBeGreaterThanOrEqual(1);
    expect(seen[0]).toEqual({ loading: false, status: 'unauthenticated' });
    for (const n of seen) {
      expect(n).toEqual({ loading: false, status: 'unauthenticated' });
    }
  });

  it('SIGNED_OUT repetido (otro tab / re-emisión): idempotente', async () => {
    useAuthStore.getState().login(authedUser as never, 'token-1', 'authenticated_valid');
    renderHook(() => useSessionManager());

    await act(async () => {
      emitAuthEvent('SIGNED_OUT', null);
      emitAuthEvent('SIGNED_OUT', null);
      emitAuthEvent('SIGNED_OUT', null);
    });

    const s = useAuthStore.getState();
    expect(s.status).toBe('unauthenticated');
    expect(s.user).toBeNull();
    expect(s.loading).toBe(false);
  });

  it('SIGNED_IN con usuario en memoria: refresca el token (lógica de login intacta)', async () => {
    useAuthStore.getState().login(authedUser as never, 'token-viejo', 'authenticated_valid');
    renderHook(() => useSessionManager());
    await settleMount();

    await act(async () => {
      emitAuthEvent('TOKEN_REFRESHED', { access_token: 'token-nuevo' });
    });
    await settleMount();

    const s = useAuthStore.getState();
    expect(s.token).toBe('token-nuevo');
    expect(s.status).toBe('authenticated_valid');
  });

  it('SIGNED_IN sin usuario en memoria: dispara checkSession (getSession)', async () => {
    useAuthStore.getState().logout();
    renderHook(() => useSessionManager());
    await settleMount();

    getSessionMock.mockClear();
    getSessionMock.mockResolvedValue({ data: { session: null } });

    await act(async () => {
      emitAuthEvent('SIGNED_IN', { access_token: 'token-1' });
    });
    await settleMount();

    expect(getSessionMock).toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('unauthenticated');
  });
});

describe('FIX-LOGOUT-SPLASH — contrato de logout() del auth store', () => {
  it('logout(): un único set() → loading=false + unauthenticated (sin estados intermedios)', () => {
    useAuthStore.getState().setLoading(true);
    useAuthStore.getState().login(authedUser as never, 'token-1', 'authenticated_valid');

    const seen: Array<{ loading: boolean; status: string }> = [];
    const unsub = useAuthStore.subscribe((state) => {
      seen.push({ loading: state.loading, status: state.status });
    });

    useAuthStore.getState().logout();
    unsub();

    // HomePageClient solo intercambia a Landing cuando `!state.loading`:
    // una sola notificación con el estado final es el contrato de la
    // transición reactiva sin Splash intermedio.
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({ loading: false, status: 'unauthenticated' });
  });

  it('secuencia real del SDK (SIGNED_OUT → signOut() resuelve → finally logout()): estado final estable', async () => {
    signOutSdkMock.mockResolvedValue({ error: null });
    useAuthStore.getState().login(authedUser as never, 'token-1', 'authenticated_valid');
    renderHook(() => useSessionManager());

    await act(async () => {
      // El SDK emite SIGNED_OUT durante signOut() y luego resuelve;
      // el `finally` de handleLogout vuelve a llamar logout() — no-op seguro.
      emitAuthEvent('SIGNED_OUT', null);
      await supabase.auth.signOut();
      useAuthStore.getState().logout();
    });

    const s = useAuthStore.getState();
    expect(s.status).toBe('unauthenticated');
    expect(s.user).toBeNull();
    expect(s.loading).toBe(false);
  });
});

describe('FIX-LOGOUT-SPLASH — contrato de fuente: el flujo de logout no recarga la página', () => {
  // El contrato aplica al CÓDIGO: se eliminan comentarios para que las
  // referencias descriptivas al bug original no falseen la aserción.
  const read = (p: string) =>
    readFileSync(resolve(process.cwd(), p), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

  it('useSessionManager: la rama SIGNED_OUT no contiene window.location.reload', () => {
    const src = read('src/hooks/logic/useSessionManager.ts');
    const branch = src.split("event === 'SIGNED_OUT'")[1]?.split("} else if")[0] ?? '';
    expect(branch.length).toBeGreaterThan(0);
    expect(branch).not.toContain('window.location.reload');
    expect(branch).not.toContain('location.reload');
    // La rama conserva la limpieza del store y del loading
    expect(branch).toContain('logout()');
    expect(branch).toContain('setLoading(false)');
  });

  it('TerminalShell: handleLogout no recarga; limpia store + caché de React Query', () => {
    const src = read('src/components/views/TerminalShell.tsx');
    const fn = src.match(/const handleLogout = async \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
    expect(fn.length).toBeGreaterThan(0);
    expect(fn).not.toContain('location.reload');
    expect(fn).toContain('logout()');
    // El reload borraba implícitamente la caché en memoria: ahora se limpia aquí
    expect(fn).toContain('queryClient.clear()');
  });

  it('TerminalShell: el efecto de prefetch no recarga cuando la sesión termina', () => {
    const src = read('src/components/views/TerminalShell.tsx');
    const effect = src.match(/useEffect\(\(\) => \{\s*\n\s*if \(user\?\.activeStoreId[\s\S]*?\}, \[user, queryClient, status\]\);/)?.[0] ?? '';
    expect(effect.length).toBeGreaterThan(0);
    expect(effect).not.toContain("status === 'unauthenticated'");
    expect(effect).not.toContain('location.reload');
  });
});
