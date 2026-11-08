import { logger } from '@/lib/logger';
import { useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '@/store';
import { useSessionStore, transitionAuthPhase } from '@/store/session-store';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { mapProfileToContract } from '@/contracts/user';
import { userService } from '@/services/user-service';
// INC-20261030: caída de GoTrue/Postgres NO debe expulsar al usuario con sesión
// local válida — reintento escalado en vez de logout por error transitorio.
import { isRetryableAuthOutage, AUTH_OUTAGE_RETRY_DELAYS_MS } from '@/lib/auth-outage';
// CP-AUTH-RESILIENCE-003: limpieza CONTROLADA por el mecanismo oficial del SDK
// (supabase.auth.signOut({scope:'local'}) + logout Zustand). Antes, el logout
// por credenciales irrecuperables solo limpiaba Zustand: la clave residual
// `sb-*-auth-token` sobrevivía y el CTA del landing re-navegaba a '/' con
// recarga en bucle (el usuario nunca veía el modal).
import { signOutLocalAuth } from '@/lib/auth-recovery';
import { hasCostproSession } from '@/lib/fcEntry';
import type { Session } from '@supabase/supabase-js';
import type { Profile } from '@/types';

const isSupabaseConfigured = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const SESSION_CHECK_THROTTLE = 60 * 1000; // 1 minute
const SESSION_CHECK_TIMEOUT = 8 * 1000; // 8 seconds
const PROFILE_FETCH_TIMEOUT = 12 * 1000; // 12 seconds

export function useSessionManager() {
    const { login, logout, setLoading, setStatus: setAuthStatus } = useAuthStore();
    const { setOnlineStatus, setSessionStatus, setStatus } = useSessionStore();
    const checkingRef = useRef(false);
    // INC-20261030: contador de reintentos por caída del backend de auth.
    // Se agota tras AUTH_OUTAGE_RETRY_DELAYS_MS.length intentos (comportamiento
    // previo acotado) y se resetea en cualquier verificación exitosa.
    const authOutageRetryRef = useRef(0);

    const checkSession = useCallback(async (force = false) => {
        // Prevent re-entrant async calls from effect re-fires
        if (checkingRef.current) return;

        const now = Date.now();
        const { isMocked, user: currentUser, token: currentToken } = useAuthStore.getState();
        // Read volatile session state at call-time to avoid circular callback deps
        const sessionState = useSessionStore.getState();

        // Dev mode without Supabase: keep existing session
        if (!isSupabaseConfigured) {
            setAuthStatus('authenticated_valid');
            transitionAuthPhase('authenticated', 'DEV_MODE');
            setLoading(false);
            return;
        }

        // Clean up stale dev-bypass session from previous dev mode
        if (isMocked || currentToken === 'dev-token-bypass') {
            logout();
            transitionAuthPhase('unauthenticated', 'DEV_STALE_CLEANUP');
            setLoading(false);
            return;
        }

        if (!sessionState.isOnline || sessionState.isCheckingSession || (!force && now - sessionState.lastChecked < SESSION_CHECK_THROTTLE)) {
            if (!sessionState.isCheckingSession) setLoading(false);
            return;
        }

        checkingRef.current = true;
        setSessionStatus(true);
        // CP-AUTH-RESILIENCE-003: fase «refreshing» — verificando/renovando
        // sesión; esperar sin generar navegación.
        transitionAuthPhase('refreshing', 'SESSION_CHECK_STARTED');

        // INC-20261030: declarada fuera del try para que el catch pueda
        // distinguir «sin sesión local» de «con sesión local + backend caído».
        let session: Session | null = null;

        try {
            // BUG-035: Use getSession() to get the token, then validate with getUser()
            const { data } = await supabase.auth.getSession();
            session = data.session;

            if (!session) {
                setAuthStatus('unauthenticated');
                transitionAuthPhase('unauthenticated', 'NO_LOCAL_SESSION');
                setLoading(false);
                return;
            }

            // Validate token against server
            const { data: { user }, error: userError } = await Promise.race([
                supabase.auth.getUser(session.access_token),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Session check timeout')), SESSION_CHECK_TIMEOUT))
            ]) as any;

            if (userError || !user) {
                // INC-20261030: error transitorio (red/5xx/timeout) con sesión local
                // presente → NO es un logout válido. Programa reintento escalado y
                // conserva loading=true (HomePageClient mantiene el splash honesto).
                if (
                    session &&
                    isRetryableAuthOutage(userError) &&
                    authOutageRetryRef.current < AUTH_OUTAGE_RETRY_DELAYS_MS.length
                ) {
                    const delay = AUTH_OUTAGE_RETRY_DELAYS_MS[authOutageRetryRef.current];
                    authOutageRetryRef.current += 1;
                    logger.warn('AUTH', 'AUTH_BACKEND_UNAVAILABLE', { data: `attempt=${authOutageRetryRef.current} delayMs=${delay}` });
                    transitionAuthPhase('refreshing', 'AUTH_OUTAGE_RETRY_SCHEDULED');
                    setTimeout(() => { void checkSession(true); }, delay);
                    return;
                }
                authOutageRetryRef.current = 0;
                // CP-AUTH-RESILIENCE-003: credenciales irrecuperables → limpieza
                // CONTROLADA (SDK signOut local + Zustand). Con solo logout() la
                // clave residual `sb-*-auth-token` sobrevivía y el CTA del landing
                // volvía a navegar a '/' con recarga en bucle (incidente reportado).
                logger.warn('AUTH', 'AUTH_SESSION_INVALID', { data: { reason: userError ? 'server_rejected' : 'no_user' } });
                transitionAuthPhase('session_expired', 'AUTH_SESSION_INVALID');
                await signOutLocalAuth('session_invalid', true);
                setLoading(false);
                return;
            }

            let profileData: Profile | null = null;
            try {
                profileData = await Promise.race([
                    userService.getUserProfile(user.id),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Profile fetch timeout')), PROFILE_FETCH_TIMEOUT))
                ]) as Profile | null;
            } catch (err: unknown) {
                logger.warn('DATABASE', '[SESSIONMANAGER]_PROFILE_FETCH_FAILED', { data: err instanceof Error ? err.message : String(err) });
                // BUG-039: Fallback with stale marker and retry
                if (currentUser) {
                    login(currentUser, session.access_token, 'authenticated_stale_profile' as any);
                    transitionAuthPhase('profile_unavailable', 'AUTH_PROFILE_STALE');
                    setStatus('stable');
                    setTimeout(() => checkSession(true), 30000);
                    return;
                }
                setAuthStatus('authenticated_invalid_profile');
                transitionAuthPhase('profile_unavailable', 'AUTH_PROFILE_INVALID');
                setLoading(false);
                return;
            }

            if (profileData) {
                // INC-20261030: verificación exitosa → resetea la escalera de reintentos.
                authOutageRetryRef.current = 0;
                const userContractData = mapProfileToContract(profileData);
                if (session.access_token !== currentToken || JSON.stringify(userContractData) !== JSON.stringify(currentUser)) {
                    login(userContractData, session.access_token, 'authenticated_valid');
                } else {
                    setAuthStatus('authenticated_valid');
                    setLoading(false);
                }
                transitionAuthPhase('authenticated', 'AUTH_SESSION_RESTORED');
                setStatus('stable');
            } else {
                await supabase.auth.signOut();
                logout();
                transitionAuthPhase('session_expired', 'AUTH_PROFILE_NOT_FOUND');
                setLoading(false);
            }
        } catch (error: unknown) {
            logger.warn('AUTH', 'SESSION_CHECK_FAILED', { message: error instanceof Error ? error.message : String(error) });
            // INC-20261030: timeout del Promise.race («Session check timeout») o fallo
            // de red con sesión local → reintento escalado en vez de expulsar al
            // usuario. La sesión local (sb-*-auth-token) no fue revocada: el fallo
            // es de infraestructura, no de credenciales.
            if (
                session?.access_token &&
                isRetryableAuthOutage(error) &&
                authOutageRetryRef.current < AUTH_OUTAGE_RETRY_DELAYS_MS.length
            ) {
                const delay = AUTH_OUTAGE_RETRY_DELAYS_MS[authOutageRetryRef.current];
                authOutageRetryRef.current += 1;
                logger.warn('AUTH', 'AUTH_BACKEND_UNAVAILABLE', { data: `attempt=${authOutageRetryRef.current} delayMs=${delay}` });
                transitionAuthPhase('refreshing', 'AUTH_OUTAGE_RETRY_SCHEDULED');
                setTimeout(() => { void checkSession(true); }, delay);
                return; // `finally` libera checkingRef; loading se conserva para el splash
            }
            authOutageRetryRef.current = 0;
            setAuthStatus(useAuthStore.getState().user ? 'authenticated_valid' : 'unauthenticated');
            // CP-AUTH-RESILIENCE-003: sin usuario y con escalera agotada, el estado
            // honesto es «auth no disponible» (reconexión + reintento), NO
            // «unauthenticated» — no se destruyó la sesión local por un fallo temporal.
            transitionAuthPhase(
                useAuthStore.getState().user ? 'authenticated' : 'auth_unavailable',
                'SESSION_CHECK_EXHAUSTED',
            );
            setLoading(false);
            setStatus('error');
        } finally {
            checkingRef.current = false;
            setSessionStatus(false);
        }
    // Removed volatile state (isOnline, isCheckingSession, lastChecked) from deps — read via getState() instead
    // This breaks the infinite loop: checkSession changing session state -> callback recreated -> effect re-fires
    }, [login, logout, setAuthStatus, setSessionStatus, setStatus, setLoading]);

    useEffect(() => {
        const handleOnline = () => { setOnlineStatus(true); checkSession(true); };
        const handleOffline = () => setOnlineStatus(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
    }, [setOnlineStatus, checkSession]);

    useEffect(() => {
        const handleVisibilityChange = () => { if (document.visibilityState === 'visible') checkSession(); };
        window.addEventListener('visibilitychange', handleVisibilityChange);
        return () => window.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [checkSession]);

    useEffect(() => {
        if (!isSupabaseConfigured) return; // Skip Supabase listener in dev mode
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') {
                // FIX-LOGOUT-SPLASH (2026-10-12): cierre de sesión = transición ÚNICA y
                // determinista. logout() limpia el auth store y HomePageClient (suscrito
                // al mismo store) intercambia el shell por el Landing de forma reactiva.
                // Antes se ejecutaba window.location.reload() cuando había sesión activa:
                // el reload re-montaba la app completa y reactivaba el Splash DESPUÉS de
                // que el Landing ya era visible → transición duplicada
                // Landing → Splash → Landing. Sin reload no existe la posibilidad del
                // bucle de recargas en carga inicial que el guard `wasAuthed` evitaba,
                // y el logout disparado desde otro tab u origen externo aterriza en el
                // Landing por la misma vía reactiva.
                logout();
                transitionAuthPhase('unauthenticated', 'SIGNED_OUT');
                setLoading(false);
            } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                const { user: currentUser } = useAuthStore.getState();
                if (session?.access_token && currentUser) {
                    login(currentUser, session.access_token);
                } else {
                    checkSession(true);
                }
            }
        });
        return () => subscription.unsubscribe();
    }, [login, logout, checkSession, setLoading]);

    useEffect(() => { checkSession(true); }, [checkSession]);

    // CP-AUTH-RESILIENCE-003: puente UI → gestor de sesión. El banner de
    // reconexión del modal de login (y otros agentes) pide reintentos vía
    // requestSessionCheck() sin recargar ni navegar.
    useEffect(() => {
        const unsub = useSessionStore.subscribe(
            (state, prev) => {
                if (state.checkRequests !== prev.checkRequests) {
                    void checkSession(true);
                }
            },
        );
        return () => unsub();
    }, [checkSession]);

    useEffect(() => {
        // INC-20261030: failsafe anti-loading-infinito. Sin sesión local → 5s
        // (comportamiento original). Con sesión local (sb-*-auth-token) el
        // reintento escalado puede tardar hasta ~53s en agotarse: se acota a 20s
        // para nunca colgar el splash más de lo razonable.
        const hasLocalSession = hasCostproSession();
        const timer = setTimeout(() => {
            if (useAuthStore.getState().loading) setLoading(false);
        }, hasLocalSession ? 20000 : 5000);
        return () => clearTimeout(timer);
    }, [setLoading]);
}
