import { logger } from '@/lib/logger';
import { useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store';
import { useSessionStore } from '@/store/session-store';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { mapProfileToContract } from '@/contracts/user';
import { userService } from '@/services/user-service';
import type { Profile } from '@/types';

const isSupabaseConfigured = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const SESSION_CHECK_THROTTLE = 60 * 1000; // 1 minute
const SESSION_CHECK_TIMEOUT = 8 * 1000; // 8 seconds
const PROFILE_FETCH_TIMEOUT = 12 * 1000; // 12 seconds

export function useSessionManager() {
    const { login, logout, setLoading, setStatus: setAuthStatus } = useAuthStore();
    const { isOnline, isCheckingSession, lastChecked, setOnlineStatus, setSessionStatus, setStatus } = useSessionStore();

    const checkSession = useCallback(async (force = false) => {
        const now = Date.now();
        const { isMocked, user: currentUser, token: currentToken } = useAuthStore.getState();

        // Dev mode without Supabase: keep existing session
        if (!isSupabaseConfigured) {
            setAuthStatus('authenticated_valid');
            setLoading(false);
            return;
        }

        // Clean up stale dev-bypass session from previous dev mode
        if (isMocked || currentToken === 'dev-token-bypass') {
            logout();
            setLoading(false);
            return;
        }

        if (!isOnline || isCheckingSession || (!force && now - lastChecked < SESSION_CHECK_THROTTLE)) {
            if (!isCheckingSession) setLoading(false);
            return;
        }

        setSessionStatus(true);

        try {
            // BUG-035: Use getSession() to get the token, then validate with getUser()
            const { data: { session } } = await supabase.auth.getSession();

            if (!session) {
                setAuthStatus('unauthenticated');
                setLoading(false);
                return;
            }

            // Validate token against server
            const { data: { user }, error: userError } = await Promise.race([
                supabase.auth.getUser(session.access_token),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Session check timeout')), SESSION_CHECK_TIMEOUT))
            ]) as any;

            if (userError || !user) {
                logout();
                setLoading(false);
                return;
            }

            let profileData: Profile | null = null;
            try {
                profileData = await Promise.race([
                    userService.getUserProfile(user.id),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Profile fetch timeout')), PROFILE_FETCH_TIMEOUT))
                ]) as Profile | null;
            } catch (err: any) {
                logger.warn('DATABASE', '[SESSIONMANAGER]_PROFILE_FETCH_FAILED', { data: err.message });
                // BUG-039: Fallback with stale marker and retry
                if (currentUser) {
                    login(currentUser, session.access_token, 'authenticated_stale_profile' as any);
                    setStatus('stable');
                    setTimeout(() => checkSession(true), 30000);
                    return;
                }
                setAuthStatus('authenticated_invalid_profile');
                setLoading(false);
                return;
            }

            if (profileData) {
                const userContractData = mapProfileToContract(profileData);
                if (session.access_token !== currentToken || JSON.stringify(userContractData) !== JSON.stringify(currentUser)) {
                    login(userContractData, session.access_token, 'authenticated_valid');
                } else {
                    setAuthStatus('authenticated_valid');
                    setLoading(false);
                }
                setStatus('stable');
            } else {
                await supabase.auth.signOut();
                logout();
                setLoading(false);
            }
        } catch (error: any) {
            logger.warn('DATABASE', 'SESSION_CHECK_FAILED', { message: error.message });
            setAuthStatus(useAuthStore.getState().user ? 'authenticated_valid' : 'unauthenticated');
            setLoading(false);
            setStatus('error');
        } finally {
            setSessionStatus(false);
        }
    }, [isOnline, isCheckingSession, lastChecked, login, logout, setAuthStatus, setSessionStatus, setStatus, setLoading]);

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
                const wasAuthed = useAuthStore.getState().status !== 'unauthenticated';
                logout();
                setLoading(false);
                // Only reload if there was an actual session (avoid reload loop on initial load)
                if (wasAuthed) {
                    window.location.reload();
                }
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

    useEffect(() => {
        const timer = setTimeout(() => {
            if (useAuthStore.getState().loading) setLoading(false);
        }, 5000);
        return () => clearTimeout(timer);
    }, [setLoading]);
}
