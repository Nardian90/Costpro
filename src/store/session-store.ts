import { create } from 'zustand';
import { logger } from '@/lib/logger';

/**
 * CP-AUTH-RESILIENCE-003 (2026-11-08) — MÁQUINA DE ESTADOS DE AUTENTICACIÓN
 * ===========================================================================
 * Estados diferenciados (misión §3) para NO interpretar cualquier error como
 * `unauthenticated`. NO es un segundo sistema de autenticación: es una ETIQUETA
 * de diagnóstico que vive junto a los contratos existentes (auth store:
 * user/token/status; Supabase Auth: fuente de verdad) y la alimentan
 * useSessionManager y src/lib/auth-recovery.ts.
 *
 *  | Estado              | Significado                              | Comportamiento
 *  | initializing        | Recuperando sesión                       | Splash honesto
 *  | authenticated       | Sesión válida                            | Shell
 *  | unauthenticated     | No existe sesión                         | Login disponible
 *  | session_expired     | Credenciales expiradas/irrecuperables    | Recuperar acceso
 *  | refreshing          | Renovando/verificando                    | Esperar sin navegar
 *  | auth_unavailable    | Auth no responde (red/5xx)               | Reconexión + reintento
 *  | profile_unavailable | Auth válida, perfil no disponible        | Conservar identidad
 *  | recovery_required   | Se necesita volver a autenticarse        | Abrir login
 */
export type AuthPhase =
  | 'initializing'
  | 'authenticated'
  | 'unauthenticated'
  | 'session_expired'
  | 'refreshing'
  | 'auth_unavailable'
  | 'profile_unavailable'
  | 'recovery_required';

/** Transiciones explícitas y verificables (misión §3): cualquier transición
 *  fuera de esta matriz es válida pero queda registrada como inesperada para
 *  auditoría — nunca bloquea la UI (un error de diagnóstico no puede colgar el
 *  acceso). */
const ALLOWED_TRANSITIONS: Record<AuthPhase, readonly AuthPhase[]> = {
  initializing: ['authenticated', 'unauthenticated', 'session_expired', 'refreshing', 'auth_unavailable', 'profile_unavailable', 'recovery_required'],
  authenticated: ['initializing', 'refreshing', 'session_expired', 'unauthenticated', 'profile_unavailable', 'auth_unavailable'],
  unauthenticated: ['initializing', 'refreshing', 'authenticated', 'auth_unavailable', 'recovery_required'],
  session_expired: ['initializing', 'refreshing', 'authenticated', 'unauthenticated', 'recovery_required'],
  refreshing: ['authenticated', 'unauthenticated', 'session_expired', 'auth_unavailable', 'profile_unavailable', 'refreshing'],
  auth_unavailable: ['initializing', 'refreshing', 'authenticated', 'unauthenticated', 'recovery_required'],
  profile_unavailable: ['initializing', 'refreshing', 'authenticated', 'recovery_required', 'session_expired'],
  recovery_required: ['initializing', 'refreshing', 'authenticated'],
};

interface SessionState {
  isOnline: boolean;
  isCheckingSession: boolean;
  lastChecked: number;
  status: 'stable' | 'checking' | 'error' | 'online' | 'offline';
  /** Fase de la máquina de autenticación (misión §3) — diagnóstico, no autorización. */
  authPhase: AuthPhase;
  /** Contador de peticiones de verificación (puente UI → GlobalSessionManager). */
  checkRequests: number;
  setOnlineStatus: (isOnline: boolean) => void;
  setSessionStatus: (isChecking: boolean, newStatus?: SessionState['status']) => void;
  setStatus: (status: SessionState['status']) => void;
  setAuthPhase: (phase: AuthPhase) => void;
  requestSessionCheck: () => void;
}

/** Transición de fase con observabilidad AUTH_* (evento, antes, después). */
export function transitionAuthPhase(next: AuthPhase, event?: string): void {
  const current = useSessionStore.getState().authPhase;
  if (current === next) return;
  const allowed = ALLOWED_TRANSITIONS[current]?.includes(next) ?? true;
  useSessionStore.setState({ authPhase: next });
  const payload = { data: { from: current, to: next, event: event || 'unspecified', expected: allowed } };
  if (allowed) {
    logger.info('AUTH', 'AUTH_PHASE_TRANSITION', payload);
  } else {
    logger.warn('AUTH', 'AUTH_PHASE_UNEXPECTED_TRANSITION', payload);
  }
}

export const useSessionStore = create<SessionState>()((set) => ({
  isOnline: typeof window !== 'undefined' ? window.navigator.onLine : true,
  isCheckingSession: false,
  lastChecked: 0,
  status: 'stable',
  authPhase: 'initializing',
  checkRequests: 0,
  setOnlineStatus: (isOnline: boolean) => set({ isOnline, status: isOnline ? 'online' : 'offline' }),
  setSessionStatus: (isChecking: boolean, newStatus: SessionState['status'] = 'checking') =>
    set({
      isCheckingSession: isChecking,
      lastChecked: Date.now(),
      status: newStatus
    }),
  setStatus: (status: SessionState['status']) => set({ status }),
  setAuthPhase: (phase: AuthPhase) => transitionAuthPhase(phase, 'setAuthPhase'),
  requestSessionCheck: () => set((s) => ({ checkRequests: s.checkRequests + 1 })),
}));
