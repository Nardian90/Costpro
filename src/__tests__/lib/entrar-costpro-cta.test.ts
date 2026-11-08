/**
 * CP-AUTH-RESILIENCE-003 — CTA «ENTRAR A COSTPRO» (casos A-D de la misión §4)
 * y REGRESIÓN del incidente (§9): el escenario de token residual documentado en
 * docs/audits/INCIDENTE-AUTH-GOTRUE-20261030.md, ampliado con credenciales
 * irrecuperables.
 *
 * Antes: `hasCostproSession()` (presencia de la clave) + `window.location.assign('/')`
 * → recarga → el shell re-verificaba → logout Zustand-only dejaba la clave
 * residual → segundo click → recarga otra vez: BUCLE, modal jamás visible.
 * Después: recuperación REAL vía Supabase Auth; jamás recarga; modal siempre
 * disponible; limpieza controlada solo con el SDK.
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

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { entrarACostpro, classifySessionResidual } from '@/lib/auth-recovery';
import { userService } from '@/services/user-service';
import { useAuthStore } from '@/store';
import { useSessionStore } from '@/store/session-store';

const SB_KEY = 'sb-test-auth-token';

const sessionOk = { access_token: 'at-1', refresh_token: 'rt-1', user: { id: 'user-1' } };
const PROFILE_OK = {
  id: 'user-1',
  full_name: 'Admin QA',
  email: 'qa@costpro.cu',
  role: 'admin',
  is_active: true,
  created_at: new Date().toISOString(),
};


/** jsdom: reload/assign son no-op no espiables → prohibición a nivel de fuente
 *  (patrón del repo, cf. useSessionManager-logout.test.tsx). */
function fuenteDe(rutaRelativa: string): string {
  return readFileSync(resolve(process.cwd(), rutaRelativa), 'utf8');
}

function openLoginSpy() {
  return vi.fn();
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  useAuthStore.getState().logout();
  useSessionStore.setState({ authPhase: 'initializing' });
  getSessionMock.mockResolvedValue({ data: { session: null } });
  getUserMock.mockResolvedValue({ data: { user: null }, error: null });
  signOutSdkMock.mockResolvedValue({ error: null });
  (userService.getUserProfile as ReturnType<typeof vi.fn>).mockReset();
});

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('CP-AUTH-RESILIENCE-003 · CTA «Entrar a COSTPRO» — caso A (sin sesión)', () => {
  it('abre el modal INMEDIATAMENTE: sin recarga, sin navigate, sin verificar nada', async () => {
    const openLogin = openLoginSpy();
    const result = await entrarACostpro({ openLogin, setLoginDefaultTab: vi.fn() });

    expect(result).toBe('modal');
    expect(openLogin).toHaveBeenCalledTimes(1);
    expect(getSessionMock).not.toHaveBeenCalled(); // nada que verificar
    expect(useSessionStore.getState().authPhase).toBe('recovery_required');
  });
});

describe('CP-AUTH-RESILIENCE-003 · CTA — caso B (sesión válida ya confirmada)', () => {
  it('store ya autenticado → shell reactivo, sin modal y sin navegación', async () => {
    useAuthStore.getState().login(
      {
        id: 'user-1', email: 'qa@costpro.cu', fullName: 'Admin QA', role: 'admin',
        roles: ['admin'], storeId: '', activeStoreId: '', maxStoresLimit: 1,
        maxUsersLimit: 1, createdBy: '', isActive: true,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        memberships: [], aiProvider: 'gemini', aiApiKey: '', plan: 'free',
      } as never,
      'token-1',
      'authenticated_valid',
    );
    const openLogin = openLoginSpy();
    const result = await entrarACostpro({ openLogin });

    expect(result).toBe('shell');
    expect(openLogin).not.toHaveBeenCalled();
  });
});

describe('CP-AUTH-RESILIENCE-003 · CTA — caso C (token residual/vencido)', () => {
  it('residuo irrecuperable (401 bad_jwt) → limpieza controlada + modal, SIN reload', async () => {
    window.localStorage.setItem(SB_KEY, JSON.stringify(sessionOk));
    getSessionMock.mockResolvedValue({ data: { session: sessionOk } });
    getUserMock.mockResolvedValue({ data: { user: null }, error: { status: 401, message: 'bad_jwt' } });
    const openLogin = openLoginSpy();

    const result = await entrarACostpro({ openLogin });

    expect(result).toBe('modal');
    expect(openLogin).toHaveBeenCalledTimes(1);
    expect(signOutSdkMock).toHaveBeenCalledWith({ scope: 'local' });
    expect(window.localStorage.getItem(SB_KEY)).toBeNull(); // bucle roto
  });

  it('residuo VÁLIDO (getUser OK) → entra al shell reactivamente: sin modal, sin reload', async () => {
    window.localStorage.setItem(SB_KEY, JSON.stringify(sessionOk));
    getSessionMock.mockResolvedValue({ data: { session: sessionOk } });
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    (userService.getUserProfile as ReturnType<typeof vi.fn>).mockResolvedValue(PROFILE_OK);
    const openLogin = openLoginSpy();

    const result = await entrarACostpro({ openLogin });

    expect(result).toBe('shell');
    expect(openLogin).not.toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('authenticated_valid');
    expect(useAuthStore.getState().user?.fullName).toBe('Admin QA');
  });

  it('REGRESIÓN DEL INCIDENTE: tras la limpieza, un segundo click abre el modal DIRECTO (bucle roto)', async () => {
    // Ciclo 1: residuo + rechazo definitivo (el caso del incidente con
    // credenciales irrecuperables tras revocación server-side).
    window.localStorage.setItem(SB_KEY, JSON.stringify(sessionOk));
    getSessionMock.mockResolvedValue({ data: { session: sessionOk } });
    getUserMock.mockResolvedValue({ data: { user: null }, error: { status: 401, message: 'invalid JWT' } });
    await entrarACostpro({ openLogin: openLoginSpy() });

    // El residuo ya no existe → el siguiente click es el CASO A (modal directo).
    expect(classifySessionResidual()).toEqual({ state: 'none' });
    const openLogin2 = openLoginSpy();
    const result2 = await entrarACostpro({ openLogin: openLogin2 });
    expect(result2).toBe('modal');
    expect(openLogin2).toHaveBeenCalledTimes(1);
    expect(getSessionMock).toHaveBeenCalledTimes(1); // el 2º click no re-verifica
  });
});

describe('CP-AUTH-RESILIENCE-003 · CTA — caso D (Supabase Auth no responde)', () => {
  it('outage transitorio → modal CON banner de reconexión y sesión local INTACTA', async () => {
    window.localStorage.setItem(SB_KEY, JSON.stringify(sessionOk));
    getSessionMock.mockResolvedValue({ data: { session: sessionOk } });
    getUserMock.mockResolvedValue({ data: { user: null }, error: { status: 503, message: 'Service Unavailable' } });
    const openLogin = openLoginSpy();

    const result = await entrarACostpro({ openLogin });

    expect(result).toBe('modal');
    expect(openLogin).toHaveBeenCalledTimes(1);
    expect(signOutSdkMock).not.toHaveBeenCalled(); // NO destruir sesión válida
    expect(window.localStorage.getItem(SB_KEY)).not.toBeNull();
    expect(useSessionStore.getState().authPhase).toBe('auth_unavailable');
  });

  it('presupuesto del CTA agotado (backend cuelga) → modal igualmente, sin bucle ni limpieza', async () => {
    vi.useFakeTimers();
    try {
      window.localStorage.setItem(SB_KEY, JSON.stringify(sessionOk));
      getSessionMock.mockResolvedValue({ data: { session: sessionOk } });
      getUserMock.mockImplementation(() => new Promise(() => {})); // GoTrue colgado
      const openLogin = openLoginSpy();

      const p = entrarACostpro({ openLogin });
      await vi.advanceTimersByTimeAsync(6_000);
      const result = await p;

      expect(result).toBe('modal');
      expect(openLogin).toHaveBeenCalledTimes(1);
      expect(signOutSdkMock).not.toHaveBeenCalled();
      expect(useSessionStore.getState().authPhase).toBe('auth_unavailable');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('CP-AUTH-RESILIENCE-003 · contrato de fuente — sin recargas en el flujo de acceso', () => {
  /** Evalúa la IMPLEMENTACIÓN: quita comentarios de bloque/línea y literales
   *  (la documentación puede mencionar lo prohibido; el código no puede). */
  const sinComentarios = (src: string) =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, '')   // bloques /* */
      .replace(/^\s*\/\/.*$/gm, '')       // líneas //
      .replace(/'[^'\n]*'/g, "''")        // literales de cadena
      .replace(/"[^"\n]*"/g, '""');

  it('HeroSection.tsx: el CTA usa entrarACostpro y ya no autoriza por hasCostproSession', () => {
    const hero = fuenteDe('src/components/landing/HeroSection.tsx');
    expect(hero).toContain('entrarACostpro');
    expect(hero).not.toContain('hasCostproSession }');
    const code = sinComentarios(hero);
    expect(code).not.toMatch(/window\.location\.assign\(\s*''\s*\)/);
    expect(code).not.toMatch(/hasCostproSession\(\)/);
  });

  it('auth-recovery.ts: la limpieza NO usa .clear() ni IndexedDB — solo la clave del SDK', () => {
    const recovery = fuenteDe('src/lib/auth-recovery.ts');
    expect(recovery).toContain("signOut({ scope: 'local' })");
    expect(recovery).toContain('removeItem(residual.key)'); // quirúrgica, clave identificada
    const code = sinComentarios(recovery);
    expect(code).not.toMatch(/localStorage\.clear\(\)/);
    expect(code).not.toMatch(/sessionStorage\.clear\(\)/);
    expect(code).not.toMatch(/indexedDB/i);
  });
});
