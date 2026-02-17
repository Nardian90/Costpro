import { useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store';
import { useSessionStore } from '@/store/session-store';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { safeNavigate } from '@/lib/navigation';
import { mapProfileToContract } from '@/contracts/user';
import { userService } from '@/services/user-service';
import type { UserRole, User, Profile } from '@/types';

const SESSION_CHECK_THROTTLE = 60 * 1000; // 1 minute
const SESSION_CHECK_TIMEOUT = 8 * 1000; // 15 seconds

/**
 * Manages Supabase session, syncs with Zustand, and handles online/offline state.
 * This hook should be used ONCE in a central component (e.g., TerminalView).
 */
export function useSessionManager() {
    const { login, logout, user, setLoading, setStatus: setAuthStatus } = useAuthStore();
    const { isOnline, isCheckingSession, lastChecked, setOnlineStatus, setSessionStatus, setStatus } = useSessionStore();
    const router = useRouter();

    const checkSession = useCallback(async (force = false) => {
        const now = Date.now();
        const currentState = useAuthStore.getState();

        // Bypass session check if we are in mock mode
        if (currentState.isMocked) {
            setAuthStatus('authenticated_valid');
            setLoading(false);
            return;
        }

        // Prevent check if offline, another check is in progress, or within throttle period (unless forced)
        if (!isOnline || isCheckingSession || (!force && now - lastChecked < SESSION_CHECK_THROTTLE)) {
            if (!user && !isCheckingSession) {
                setLoading(false);
            }
            return;
        }

        setSessionStatus(true);

        try {
            const { data, error } = await Promise.race([
                supabase.auth.getSession(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Session check timeout')), SESSION_CHECK_TIMEOUT))
            ]) as { data: { session: any; }; error: Error | null; };

            if (error) throw error;

            const { session } = data;

            if (session?.user) {
                let profileData: Profile | null = null;

                try {
                    profileData = await Promise.race([
                        userService.getUserProfile(session.user.id),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Profile fetch timeout')), SESSION_CHECK_TIMEOUT))
                    ]) as Profile | null;
                } catch (err: any) {
                    console.error('[SessionManager] Critical error fetching profile:', err);
                    setAuthStatus('authenticated_invalid_profile');
                    return;
                }

                if (profileData) {
                    const userContractData = mapProfileToContract(profileData);

                    const currentState = useAuthStore.getState();
                    if (session.access_token !== currentState.token || JSON.stringify(userContractData) !== JSON.stringify(currentState.user)) {
                        login(userContractData, session.access_token, 'authenticated_valid');
                    } else {
                        setAuthStatus('authenticated_valid');
                    }
                    setStatus('stable');
                } else {
                    // User inactive or not found - force logout
                    await supabase.auth.signOut();
                    logout();
                }
            } else {
                // No session - set status to unauthenticated
                setAuthStatus('unauthenticated');
            }
        } catch (error: any) {
            console.warn(`Session check failed: ${error.message}`);
            setAuthStatus(useAuthStore.getState().user ? 'authenticated_valid' : 'unauthenticated');
            setStatus('error');
        } finally {
            setSessionStatus(false);
            setLoading(false); // Guarantee loader dismissal
        }
    }, [isOnline, isCheckingSession, lastChecked, login, logout, setAuthStatus, setSessionStatus, setStatus, user]);

    // Effect for online/offline listeners
    useEffect(() => {
        const handleOnline = () => {
            setOnlineStatus(true);
            checkSession(true); // Force re-check on reconnection
        };
        const handleOffline = () => setOnlineStatus(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [setOnlineStatus, checkSession]);

    // Effect for tab visibility
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                checkSession(); // Throttled check
            }
        };
        window.addEventListener('visibilitychange', handleVisibilityChange);
        return () => window.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [checkSession]);

    // Effect for Supabase auth state changes
    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') {
                logout();
                safeNavigate.push(router, '/login');
            } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                if(session?.access_token && user) {
                    // Update the token in the store without a full profile refetch
                    login(user, session.access_token);
                } else {
                     // If there is no user data, force a full session check.
                    checkSession(true)
                }
            }
        });

        return () => subscription.unsubscribe();
    }, [login, logout, router, user, checkSession]);

    // Initial check on mount
    useEffect(() => {
        checkSession(true);
    }, [checkSession]);
}
