/**
 * CP-AUTH-RESILIENCE-003 (2026-11-08) — RECUPERACIÓN CENTRALIZADA DE SESIONES
 * ===========================================================================
 * Un problema de sesión NO puede convertirse en un bloqueo de acceso: esta
 * librería es el mecanismo ÚNICO y reutilizable para decidir si el navegador
 * tiene una sesión real (validada por Supabase Auth), una sesión residual
 * irrecuperable (limpieza CONTROLADA con el SDK) o un backend de auth
 * temporalmente inaccesible (conserva la sesión y permite el login igual).
 *
 * REGLA DE ORO (misión §4): la presencia de una clave `sb-*-auth-token` jamás
 * es prueba de autenticación. La única evidencia válida es la respuesta de
 * Supabase Auth (getUser valida el JWT contra el servidor).
 *
 * Contratos respetados:
 *  · NO se crea un segundo sistema de auth: se usa el cliente singleton
 *    existente (src/lib/supabaseClient.ts) y el auth store existente
 *    (src/store/index.ts). Esta lib solo ORQUESTA y clasifica.
 *  · Limpieza SOLO por el mecanismo oficial del SDK
 *    (supabase.auth.signOut({ scope: 'local' })): el SDK elimina EXCLUSIVAMENTE
 *    su propia clave `sb-<ref>-auth-token`. NUNCA localStorage.clear(),
 *    NUNCA sessionStorage.clear(), NUNCA IndexedDB — las fichas de costo
 *    offline y los datos operativos quedan intactos (misión §6).
 *  · Errores transitorios (5xx/red/timeout — clasificación de
 *    src/lib/auth-outage.ts) NO limpian sesión: los déficits de conectividad
 *    no son credenciales inválidas (INC-20261030).
 *  · Observabilidad: eventos AUTH_* estructurados, sin tokens ni PII.
 */

import { supabase } from '@/lib/supabaseClient';
import { isRetryableAuthOutage } from '@/lib/auth-outage';
import { mapProfileToContract } from '@/contracts/user';
import { userService } from '@/services/user-service';
import { useAuthStore } from '@/store';
import { transitionAuthPhase } from '@/store/session-store';
import { logger } from '@/lib/logger';
import type { Session } from '@supabase/supabase-js';

const SB_TOKEN_SUFFIX = '-auth-token';

/** Timeout de getSession() en la recuperación (backend colgado → no colgar el CTA). */
export const RECOVERY_SESSION_TIMEOUT_MS = 6_000;
/** Timeout de getUser() (validación server-side del JWT). */
export const RECOVERY_VERIFY_TIMEOUT_MS = 8_000;
/** Timeout de la consulta de perfil durante la recuperación. */
export const RECOVERY_PROFILE_TIMEOUT_MS = 10_000;
/** Presupuesto total del CTA antes de abrir el login (la UI nunca cuelga). */
export const ENTRY_RECOVERY_DEADLINE_MS = 5_000;
/** Timeout del signOut del SDK durante la limpieza controlada. */
export const SIGNOUT_LOCAL_TIMEOUT_MS = 5_000;

export type AuthRecoveryOutcome =
  | 'none'                 // sin token residual: login disponible
  | 'valid'                // sesión validada POR EL SERVIDOR (+ perfil)
  | 'invalid'              // credenciales rechazadas/irrecuperables → limpieza controlada
  | 'unavailable'          // auth no responde (red/5xx/timeout) → NO limpiar
  | 'profile_unavailable'; // auth válida, perfil no consultable → NO limpiar, diagnosticar

export interface AuthRecoveryResult {
  outcome: AuthRecoveryOutcome;
  /** Clasificación del almacenamiento local al iniciar (nunca su contenido). */
  residuo?: 'present' | 'corrupt';
  detail?: string;
  /** Datos para sincronizar el store cuando outcome === 'valid'. */
  session?: Session | null;
  userContract?: import('@/contracts/user').UserContract;
}

/** Correlación de logs de una recuperación (sin datos sensibles). */
let recoverySeq = 0;

function raceTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout`)), ms),
    ),
  ]);
}

/**
 * Clasifica el residuo de sesión SIN interpretarlo como autenticación.
 * Devuelve la clave EXACTA gestionada por Supabase Auth (`sb-<ref>-auth-token`)
 * cuando existe, y si su JSON es parseable — solo para diagnóstico y para una
 * eventual limpieza quirúrgica; JAMÁS para autorizar.
 */
export function classifySessionResidual():
  | { state: 'none' }
  | { state: 'present'; key: string }
  | { state: 'corrupt'; key: string } {
  if (typeof window === 'undefined') return { state: 'none' };
  try {
    const ls = window.localStorage;
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && k.startsWith('sb-') && k.endsWith(SB_TOKEN_SUFFIX)) {
        const raw = ls.getItem(k);
        if (!raw) return { state: 'none' }; // clave vacía → sin sesión
        try {
          JSON.parse(raw);
          return { state: 'present', key: k };
        } catch {
          // Token malformado/corrupto: el SDK no puede usarlo y el servidor
          // tampoco. Es 'corrupt', no 'present' — sin crash en ningún caso.
          return { state: 'corrupt', key: k };
        }
      }
    }
  } catch {
    // localStorage bloqueado/no disponible → tratar como sin sesión:
    // la app NO se rompe y el login queda disponible (misión §9).
    return { state: 'none' };
  }
  return { state: 'none' };
}

/** Lee el error de forma segura para logs — jamás imprime tokens/headers. */
function describeError(err: unknown): string {
  if (!err) return 'unknown';
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  const status = (err as { status?: unknown }).status;
  if (typeof status === 'number') return `http_status_${status}`;
  try {
    return JSON.stringify(err)?.slice(0, 160) ?? 'unknown';
  } catch {
    return String(err).slice(0, 160);
  }
}

/**
 * Recuperación de sesión con Supabase Auth (mecanismo central reutilizable).
 * Orden: clasificar residuo → getSession → getUser (validación server-side) →
 * perfil. Cada paso distingue transitorio (no limpiar) de definitivo (limpiar).
 */
export async function recoverSession(): Promise<AuthRecoveryResult> {
  const correlation = `auth-rec-${++recoverySeq}`;
  const t0 = Date.now();
  const residual = classifySessionResidual();
  logger.info('AUTH', 'AUTH_RECOVERY_STARTED', {
    data: { correlation, residual: residual.state },
  });

  try {
    // 0) Token malformado: el SDK ni el servidor pueden usarlo. Limpieza
    //    controlada garantizada (el servidor jamás lo validaría → evita
    //    pedir credenciales al usuario dos veces).
    if (residual.state === 'corrupt') {
      logger.warn('AUTH', 'AUTH_SESSION_INVALID', {
        data: { correlation, reason: 'malformed_storage_payload' },
      });
      return { outcome: 'invalid', residuo: 'corrupt', detail: 'malformed' };
    }

    // 1) Sesión local según el SDK (lee su storage; no toca la red).
    let session: Session | null = null;
    try {
      const { data } = await raceTimeout(
        supabase.auth.getSession(),
        RECOVERY_SESSION_TIMEOUT_MS,
        'getSession',
      );
      session = data.session;
    } catch (err) {
      // getSession no valida contra el servidor: si cuelga es storage/local.
      logger.warn('AUTH', 'AUTH_RECOVERY_FAILED', {
        data: { correlation, step: 'getSession', error: describeError(err) },
      });
      transitionAuthPhase('auth_unavailable', 'AUTH_RECOVERY_FAILED');
      return { outcome: 'unavailable', residuo: 'present', detail: describeError(err) };
    }

    if (!session) {
      // El SDK no tiene sesión utilizable (sin token, vacío o ya limpiada).
      logger.info('AUTH', 'AUTH_SESSION_EXPIRED', {
        data: { correlation, reason: 'no_local_session' },
      });
      return { outcome: 'none', residuo: residual.state === 'present' ? 'present' : undefined };
    }

    // 2) Validación SERVER-SIDE del JWT (la única evidencia de autenticación).
    try {
      const { data, error } = await raceTimeout(
        supabase.auth.getUser(session.access_token),
        RECOVERY_VERIFY_TIMEOUT_MS,
        'getUser',
      ) as { data: { user: unknown } | null; error: unknown };

      if (error || !data?.user) {
        if (isRetryableAuthOutage(error)) {
          // GoTrue caído / red: la sesión local NO está revocada. No limpiar.
          logger.warn('AUTH', 'AUTH_BACKEND_UNAVAILABLE', {
            data: { correlation, step: 'getUser', error: describeError(error) },
          });
          transitionAuthPhase('auth_unavailable', 'AUTH_BACKEND_UNAVAILABLE');
          return { outcome: 'unavailable', residuo: 'present', detail: describeError(error) };
        }
        // Rechazo DEFINITIVO del servidor (4xx, bad_jwt, refresh_token_not_found…):
        // la sesión residual es irrecuperable → limpieza controlada.
        logger.warn('AUTH', 'AUTH_SESSION_INVALID', {
          data: { correlation, reason: describeError(error || 'no-user') },
        });
        transitionAuthPhase('session_expired', 'AUTH_SESSION_INVALID');
        return { outcome: 'invalid', residuo: 'present', detail: describeError(error || 'no-user') };
      }

      // 3) Perfil: auth válida ≠ permisos. Sin perfil no se entra al shell,
      //    pero TAMPOCO se destruye la identidad sin diagnóstico.
      try {
        const userId = (data.user as { id?: string } | null)?.id;
        if (!userId) {
          transitionAuthPhase('profile_unavailable', 'AUTH_PROFILE_MISSING_ID');
          return { outcome: 'profile_unavailable', residuo: 'present', session };
        }
        const profile = await raceTimeout(
          userService.getUserProfile(userId),
          RECOVERY_PROFILE_TIMEOUT_MS,
          'getUserProfile',
        );
        if (!profile) {
          logger.warn('AUTH', 'AUTH_RECOVERY_FAILED', {
            data: { correlation, step: 'profile', reason: 'profile_not_found' },
          });
          transitionAuthPhase('profile_unavailable', 'AUTH_PROFILE_NOT_FOUND');
          return { outcome: 'profile_unavailable', residuo: 'present', session };
        }
        const userContract = mapProfileToContract(profile);
        logger.info('AUTH', 'AUTH_SESSION_RESTORED', {
          data: { correlation, durationMs: Date.now() - t0, residual: residual.state },
        });
        return { outcome: 'valid', residuo: 'present', session, userContract };
      } catch (err) {
        logger.warn('AUTH', 'AUTH_RECOVERY_FAILED', {
          data: { correlation, step: 'profile', error: describeError(err) },
        });
        // Error de consulta del perfil: si es transitorio NO destruye auth.
        transitionAuthPhase('profile_unavailable', 'AUTH_PROFILE_UNAVAILABLE');
        return { outcome: 'profile_unavailable', residuo: 'present', session, detail: describeError(err) };
      }
    } catch (err) {
      if (isRetryableAuthOutage(err)) {
        logger.warn('AUTH', 'AUTH_BACKEND_UNAVAILABLE', {
          data: { correlation, step: 'getUser', error: describeError(err) },
        });
        transitionAuthPhase('auth_unavailable', 'AUTH_BACKEND_UNAVAILABLE');
        return { outcome: 'unavailable', residuo: 'present', detail: describeError(err) };
      }
      logger.warn('AUTH', 'AUTH_SESSION_INVALID', {
        data: { correlation, reason: describeError(err) },
      });
      transitionAuthPhase('session_expired', 'AUTH_SESSION_INVALID');
      return { outcome: 'invalid', residuo: 'present', detail: describeError(err) };
    }
  } finally {
    logger.info('AUTH', 'AUTH_RECOVERY_COMPLETED', {
      data: { correlation, durationMs: Date.now() - t0, residual: residual.state },
    });
  }
}

/**
 * Limpieza CONTROLADA de una sesión irrecuperable — SOLO el estado de
 * autenticación, SOLO con el mecanismo oficial del SDK:
 *   1. supabase.auth.signOut({ scope: 'local' }): el SDK revoca lo revocable y
 *      elimina EXCLUSIVAMENTE su clave `sb-<ref>-auth-token`.
 *   2. logout() del auth store → los componentes suscritos se actualizan.
 *   3. Verificación post-limpieza: si (solo en outcome 'invalid') la clave
 *      exacta sobreviviera (p. ej. signOut colgado), se elimina ESA clave
 *      identificada — nunca .clear(), nunca otras claves (fichas de costo
 *      offline, preferencias y datos operativos quedan intactos).
 * Nunca lanza: un fallo de limpieza no puede derribar la app.
 */
export async function signOutLocalAuth(reason: string, forceRemoveResidual = false): Promise<void> {
  const t0 = Date.now();
  const residual = classifySessionResidual();
  try {
    await raceTimeout(
      supabase.auth.signOut({ scope: 'local' }),
      SIGNOUT_LOCAL_TIMEOUT_MS,
      'signOut',
    );
  } catch (err) {
    logger.warn('AUTH', 'AUTH_RECOVERY_FAILED', {
      data: { step: 'signOutLocal', reason, error: describeError(err) },
    });
  }
  // Estado Zustand → componentes suscritos (landing reactiva, sin reload).
  useAuthStore.getState().logout();

  // Verificación: la clave EXACTA de Supabase Auth no debe sobrevivir a una
  // limpieza por credenciales irrecuperables (rompe el bucle del CTA).
  if (forceRemoveResidual && residual.state !== 'none' && typeof window !== 'undefined') {
    try {
      if (window.localStorage.getItem(residual.key) !== null) {
        window.localStorage.removeItem(residual.key); // SOLO esa clave
        logger.warn('AUTH', 'AUTH_SESSION_INVALID', {
          data: { step: 'residual_key_removed', key: residual.key, reason },
        });
      }
    } catch {
      /* localStorage bloqueado: nada más que hacer; el SDK la intentó */
    }
  }
  logger.info('AUTH', 'AUTH_RECOVERY_COMPLETED', {
    data: { step: 'signOutLocal', reason, durationMs: Date.now() - t0, hadResidual: residual.state },
  });
}

export interface EntrarACostproActions {
  /** Abre el modal de login del landing (obligatorio en toda vía sin sesión). */
  openLogin: () => void;
  /** Pestaña por defecto del modal ('login'). */
  setLoginDefaultTab?: (tab: 'login' | 'register') => void;
}

export type EntrarACostproResult = 'modal' | 'shell';

/**
 * ACCIÓN DEL CTA «Entrar a COSTPRO» (misión §4 — casos A-D).
 * Sustituye definitivamente a `hasCostproSession() + window.location.assign('/')`:
 *   · JAMÁS recarga ni navega: con sesión válida el shell entra REACTIVAMENTE
 *     (HomePageClient está suscrito al auth store).
 *   · El modal queda SIEMPRE disponible: ningún resultado de sesión lo bloquea.
 *   · Caso C (residual/vencido): recuperación real → si es irrecuperable,
 *     limpieza controlada (SDK) → modal. Sin bucles.
 *   · Caso D (auth caído): NO confunde conectividad con credenciales, NO
 *     destruye la sesión local, abre el modal con estado de reconexión.
 */
export async function entrarACostpro(actions: EntrarACostproActions): Promise<EntrarACostproResult> {
  const { openLogin, setLoginDefaultTab } = actions;
  const openModal = () => {
    setLoginDefaultTab?.('login');
    openLogin();
    logger.info('AUTH', 'AUTH_MODAL_OPENED', {
      data: { source: 'cta_entrar_costpro', path: typeof window !== 'undefined' ? window.location.pathname : '' },
    });
  };

  // Sesión ya confirmada en el store → el shell es visible/monta reactivo.
  const { status: authStatus, user } = useAuthStore.getState();
  if (user && (authStatus === 'authenticated_valid' || authStatus === 'authenticated_no_store')) {
    return 'shell';
  }

  const residual = classifySessionResidual();
  if (residual.state === 'none') {
    // CASO A: sin sesión → modal inmediato, sin recarga, sin navegar a '/'.
    transitionAuthPhase('recovery_required', 'AUTH_MODAL_OPENED');
    openModal();
    return 'modal';
  }

  // CASO C/D: hay residuo (válido, vencido o corrupto) → recuperación REAL
  // con presupuesto de UI duro; el usuario nunca espera de más.
  const recovery = await Promise.race([
    recoverSession(),
    new Promise<AuthRecoveryResult>((resolve) =>
      setTimeout(
        () => resolve({ outcome: 'unavailable', residuo: residual.state === 'corrupt' ? 'corrupt' : 'present', detail: 'entry_deadline' }),
        ENTRY_RECOVERY_DEADLINE_MS,
      ),
    ),
  ]);

  switch (recovery.outcome) {
    case 'valid': {
      // CASO B: sesión válida confirmada por el SERVIDOR → acceso reactivo al
      // shell (sin window.location.assign, sin recarga).
      if (recovery.session && recovery.userContract) {
        useAuthStore.getState().login(
          recovery.userContract,
          recovery.session.access_token,
          'authenticated_valid',
        );
        logger.info('AUTH', 'AUTH_LOGIN_SUCCESS', { data: { source: 'cta_session_restored' } });
        return 'shell';
      }
      openModal();
      return 'modal';
    }
    case 'invalid': {
      // CASO C: irrecuperable → limpieza controlada (solo el estado de auth)
      // y modal. El residuo que alimentaba el bucle queda eliminado.
      await signOutLocalAuth('cta_residual_invalid', true);
      transitionAuthPhase('recovery_required', 'AUTH_RECOVERY_STARTED');
      openModal();
      return 'modal';
    }
    case 'profile_unavailable': {
      // Auth válida pero perfil no consultable: conservar identidad,
      // diagnosticar y permitir el acceso al formulario.
      openModal();
      return 'modal';
    }
    case 'unavailable':
    default: {
      // CASO D: backend de auth no responde (o presupuesto agotado). NO se
      // destruye una sesión potencialmente válida; el modal abre igual con
      // estado de reconexión (LoginForm muestra el banner de la máquina).
      transitionAuthPhase('auth_unavailable', 'AUTH_BACKEND_UNAVAILABLE');
      openModal();
      return 'modal';
    }
  }
}
