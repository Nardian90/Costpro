/**
 * CP-AUTH-RESILIENCE-003 — RECUPERACIÓN DE AUTENTICACIÓN (lib/auth-recovery.ts)
 * =============================================================================
 * Escenarios obligatorios de la misión:
 *  · ALMACENAMIENTO: sin tokens, access vencido, refresh inválido, token
 *    malformado, clave vacía, clave residual no válida, localStorage bloqueado,
 *    IndexedDB/datos operativos intactos.
 *  · AUTENTICACIÓN: refresh exitoso, refresh rechazado, GoTrue 500, GoTrue
 *    timeout, perfil inaccesible (sin logout ficticio).
 *
 * Reglas verificadas:
 *  · La presencia de la clave `sb-*-auth-token` jamás autoriza nada.
 *  · La limpieza usa SOLO el SDK (supabase.auth.signOut({scope:'local'})).
 *  · JAMÁS localStorage.clear()/sessionStorage.clear()/IndexedDB: solo la clave
 *    EXACTA de Supabase Auth se elimina, y solo con rechazo definitivo.
 *  · Un error transitorio NO destruye la sesión local (INC-20261030).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
});

const { getSessionMock, getUserMock, signOutSdkMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getUserMock: vi.fn(),
  signOutSdkMock: vi.fn(),
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
      getUser: getUserMock,
      signOut: signOutSdkMock,
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

vi.mock('@/services/user-service', () => ({
  userService: { getUserProfile: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { recoverSession, classifySessionResidual, signOutLocalAuth } from '@/lib/auth-recovery';
import { userService } from '@/services/user-service';
import { useAuthStore } from '@/store';

const SB_KEY = 'sb-test-auth-token'; // ref «test» del URL simulado

const PROFILE_OK = {
  id: 'user-1',
  full_name: 'Admin QA',
  email: 'qa@costpro.cu',
  role: 'admin',
  is_active: true,
  created_at: new Date().toISOString(),
};

/** Siembra una sesión residual en localStorage (contenido válido o corrupto). */
function seedResidual(raw: string): void {
  window.localStorage.setItem(SB_KEY, raw);
}

const sessionOk = {
  access_token: 'at-1',
  refresh_token: 'rt-1',
  user: { id: 'user-1' },
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  useAuthStore.getState().logout();
  getSessionMock.mockResolvedValue({ data: { session: null } });
  getUserMock.mockResolvedValue({ data: { user: null }, error: null });
  signOutSdkMock.mockResolvedValue({ error: null });
});

afterEach(() => {
  window.localStorage.clear();
});

describe('CP-AUTH-RESILIENCE-003 · clasificación del residuo (nunca autoriza)', () => {
  it('navegador sin tokens → none (login disponible)', () => {
    expect(classifySessionResidual()).toEqual({ state: 'none' });
  });

  it('clave vacía → none', () => {
    seedResidual('');
    expect(classifySessionResidual()).toEqual({ state: 'none' });
  });

  it('token malformado → corrupt (sin crash, diagnosticado)', () => {
    seedResidual('{not-json-at-all');
    const c = classifySessionResidual();
    expect(c.state).toBe('corrupt');
    if (c.state === 'corrupt') expect(c.key).toBe(SB_KEY);
  });

  it('localStorage bloqueado → none y sin excepción', () => {
    const original = window.localStorage;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError: storage bloqueado');
      },
    });
    try {
      expect(classifySessionResidual()).toEqual({ state: 'none' });
    } finally {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: original,
      });
    }
  });

  it('clave residual con JSON válido → present (aún sin autorizar: solo clasifica)', () => {
    seedResidual(JSON.stringify({ access_token: 'stale', refresh_token: 'stale-r', user: { id: 'u' } }));
    expect(classifySessionResidual().state).toBe('present');
  });
});

describe('CP-AUTH-RESILIENCE-003 · recoverSession — escenarios de autenticación', () => {
  it('sin residuo → none', async () => {
    const r = await recoverSession();
    expect(r.outcome).toBe('none');
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it('token malformado → invalid (el servidor jamás lo validaría)', async () => {
    seedResidual('{corrupto');
    const r = await recoverSession();
    expect(r.outcome).toBe('invalid');
    expect(r.residuo).toBe('corrupt');
  });

  it('refresh exitoso + perfil OK → valid con UserContract (sesión conservada)', async () => {
    seedResidual(JSON.stringify(sessionOk));
    getSessionMock.mockResolvedValue({ data: { session: sessionOk } });
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    (userService.getUserProfile as ReturnType<typeof vi.fn>).mockResolvedValue(PROFILE_OK);

    const r = await recoverSession();
    expect(r.outcome).toBe('valid');
    expect(r.userContract?.id).toBe('user-1');
    expect(r.userContract?.fullName).toBe('Admin QA');
  });

  it('access vencido / refresh inválido (401 bad_jwt) → invalid con limpieza controlada', async () => {
    seedResidual(JSON.stringify(sessionOk));
    getSessionMock.mockResolvedValue({ data: { session: sessionOk } });
    getUserMock.mockResolvedValue({ data: { user: null }, error: { status: 401, message: 'invalid JWT: bad_jwt' } });

    const r = await recoverSession();
    expect(r.outcome).toBe('invalid');
    // Limpieza: SOLO el SDK con scope local
    await signOutLocalAuth('test_invalid', true);
    expect(signOutSdkMock).toHaveBeenCalledWith({ scope: 'local' });
    expect(window.localStorage.getItem(SB_KEY)).toBeNull();
  });

  it('GoTrue 500 → unavailable: NO se limpia la sesión local', async () => {
    seedResidual(JSON.stringify(sessionOk));
    getSessionMock.mockResolvedValue({ data: { session: sessionOk } });
    getUserMock.mockResolvedValue({ data: { user: null }, error: { status: 500, message: 'Internal error' } });

    const r = await recoverSession();
    expect(r.outcome).toBe('unavailable');
    expect(signOutSdkMock).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(SB_KEY)).not.toBeNull();
  });

  it('GoTrue timeout (getUser cuelga) → unavailable: sin logout ficticio', async () => {
    vi.useFakeTimers();
    try {
      seedResidual(JSON.stringify(sessionOk));
      getSessionMock.mockResolvedValue({ data: { session: sessionOk } });
      getUserMock.mockImplementation(() => new Promise(() => {})); // cuelga
      const p = recoverSession();
      await vi.advanceTimersByTimeAsync(9_000);
      const r = await p;
      expect(r.outcome).toBe('unavailable');
      expect(signOutSdkMock).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(SB_KEY)).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('perfil temporalmente inaccesible → profile_unavailable: SIN logout ficticio', async () => {
    seedResidual(JSON.stringify(sessionOk));
    getSessionMock.mockResolvedValue({ data: { session: sessionOk } });
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    (userService.getUserProfile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Failed to fetch'));

    const r = await recoverSession();
    expect(r.outcome).toBe('profile_unavailable');
    expect(signOutSdkMock).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(SB_KEY)).not.toBeNull();
  });

  it('perfil inexistente (null) → profile_unavailable (auth válida se conserva)', async () => {
    seedResidual(JSON.stringify(sessionOk));
    getSessionMock.mockResolvedValue({ data: { session: sessionOk } });
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    (userService.getUserProfile as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const r = await recoverSession();
    expect(r.outcome).toBe('profile_unavailable');
    expect(signOutSdkMock).not.toHaveBeenCalled();
  });
});

describe('CP-AUTH-RESILIENCE-003 · limpieza segura del almacenamiento', () => {
  it('signOutLocalAuth elimina SOLO la clave de Supabase Auth y nada más', async () => {
    seedResidual(JSON.stringify(sessionOk));
    window.localStorage.setItem('costpro_operativo_importante', 'fichas-offline');
    window.localStorage.setItem('ui_state', '{}');

    await signOutLocalAuth('test_cleanup', true);

    expect(signOutSdkMock).toHaveBeenCalledWith({ scope: 'local' });
    expect(window.localStorage.getItem(SB_KEY)).toBeNull();
    expect(window.localStorage.getItem('costpro_operativo_importante')).toBe('fichas-offline');
    expect(window.localStorage.getItem('ui_state')).toBe('{}');
  });

  it('JAMÁS usa localStorage.clear() / sessionStorage.clear() / IndexedDB.deleteDatabase', async () => {
    seedResidual(JSON.stringify(sessionOk));
    const lsClear = vi.spyOn(window.localStorage.__proto__, 'clear');
    const ssClear = vi.spyOn(window.sessionStorage.__proto__, 'clear');
    const idbDelete = vi.fn();
    (window as unknown as { indexedDB: unknown }).indexedDB = { deleteDatabase: idbDelete, open: vi.fn() };

    await signOutLocalAuth('test_no_clear', true);

    expect(lsClear).not.toHaveBeenCalled();
    expect(ssClear).not.toHaveBeenCalled();
    expect(idbDelete).not.toHaveBeenCalled();
    lsClear.mockRestore();
    ssClear.mockRestore();
  });

  it('signOut del SDK cuelga → igualmente limpia el residuo identificado (rompe bucles)', async () => {
    vi.useFakeTimers();
    try {
      seedResidual(JSON.stringify(sessionOk));
      signOutSdkMock.mockImplementation(() => new Promise(() => {})); // cuelga (red)
      const p = signOutLocalAuth('test_signout_hang', true);
      await vi.advanceTimersByTimeAsync(6_000);
      await p;
      expect(window.localStorage.getItem(SB_KEY)).toBeNull();
      expect(useAuthStore.getState().status).toBe('unauthenticated');
    } finally {
      vi.useRealTimers();
    }
  });
});
