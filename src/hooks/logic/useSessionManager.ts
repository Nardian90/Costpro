import { useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store';
import { useSessionStore } from '@/store/session-store';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { profileSchema } from '@/validation/schemas';
import { mapProfileToContract } from '@/contracts/user';
import type { UserRole, User } from '@/types';

const SESSION_CHECK_THROTTLE = 60 * 1000; // 1 minute
const SESSION_CHECK_TIMEOUT = 15 * 1000; // 15 seconds

/**
 * Manages Supabase session, syncs with Zustand, and handles online/offline state.
 * This hook should be used ONCE in a central component (e.g., TerminalView).
 */
export function useSessionManager() {
    const { login, logout, user, setLoading } = useAuthStore();
    const { isOnline, isCheckingSession, lastChecked, setOnlineStatus, setSessionStatus, setStatus } = useSessionStore();
    const router = useRouter();

    const checkSession = useCallback(async (force = false) => {
        const now = Date.now();
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
                const profileColumns = 'id, full_name, email, role, roles, active_store_id, logo_url, is_active, store_id, created_at';
                const storeColumns = 'id, name, address, logo_url, is_active, created_at';
                const membershipColumns = `id, user_id, store_id, role, status, created_at, updated_at, store:stores(${storeColumns})`;

                let profileData: any;
                let profileError: any;

                try {
                    const result = await Promise.race([
                        supabase.from('profiles').select(`${profileColumns}, memberships:user_store_memberships(${membershipColumns})`).eq('id', session.user.id).single(),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Profile fetch timeout')), SESSION_CHECK_TIMEOUT))
                    ]) as any;
                    profileData = result.data;
                    profileError = result.error;
                } catch (err: any) {
                    console.error('[SessionManager] Critical error fetching profile:', err);
                    // Attempt fallback without joined memberships and potentially missing columns
                    const { data: fallbackData, error: fallbackError } = await supabase.from('profiles').select('id, email, full_name, role').eq('id', session.user.id).single();
                    if (fallbackError) throw fallbackError;
                    profileData = fallbackData;
                }

                if (profileError) {
                    console.error('[SessionManager] Profile error:', profileError);
                    // If it's a "column does not exist" error, try a limited select
                    if (profileError.code === '42703') {
                        const { data: fallbackData, error: fallbackError } = await supabase.from('profiles').select('id, email, full_name, role').eq('id', session.user.id).single();
                        if (fallbackError) throw fallbackError;
                        profileData = fallbackData;
                    } else {
                        throw profileError;
                    }
                }

                if (profileData?.is_active) {
                    // Fix Supabase returning join as array
                    if (profileData.memberships) {
                        profileData.memberships = profileData.memberships.map((m: any) => ({
                            ...m,
                            store: Array.isArray(m.store) ? m.store[0] : m.store
                        }));
                    }

                    let effectiveActiveStoreId = profileData.active_store_id || profileData.store_id;

                    // AUTO-SELECT STORE: If no active store is set but memberships exist, pick the first one
                    // This ensures ENCARGADO and other non-admin users always have a context.
                    if (!effectiveActiveStoreId && profileData.memberships && profileData.memberships.length > 0) {
                        effectiveActiveStoreId = profileData.memberships[0].store_id;
                        console.log(`[SessionManager] Auto-selecting store ${effectiveActiveStoreId} for user ${profileData.id}`);
                    }

                    let activeRoles: UserRole[] = profileData.roles || [profileData.role];
                    if (effectiveActiveStoreId) {
                        // Use a regular select instead of .single() to prevent 406/Not Found errors
                        // if the membership record doesn't exist yet for the active store context.
                        const { data: membershipRows } = await supabase
                            .from('user_store_memberships')
                            .select('role')
                            .eq('user_id', profileData.id)
                            .eq('store_id', effectiveActiveStoreId)
                            .limit(1);

                        const membershipData = membershipRows?.[0];
                        if (membershipData?.role) {
                            activeRoles = [membershipData.role];
                        } else if (profileData.role === 'admin') {
                            // Admins preserve their global role if no specific store membership is found
                            activeRoles = ['admin'];
                        }
                    }

                    const userData = {
                        ...profileData,
                        roles: activeRoles,
                        active_store_id: effectiveActiveStoreId,
                        store_id: effectiveActiveStoreId || profileData.store_id,
                    };

                    // Validate with Zod
                    const validationResult = profileSchema.safeParse(userData);
                    if (!validationResult.success) {
                        console.error('[Zod Validation Error] profile data:', validationResult.error.format());
                    }

                    const userContractData = mapProfileToContract(validationResult.success ? validationResult.data : userData as any);

                    const currentState = useAuthStore.getState();
                    if (session.access_token !== currentState.token || JSON.stringify(userContractData) !== JSON.stringify(currentState.user)) {
                        login(userContractData, session.access_token);
                    } else {
                        setLoading(false);
                    }
                    setStatus('stable');
                } else {
                    await supabase.auth.signOut();
                    setLoading(false);
                    router.push('/login');
                }
            } else {
                if (useAuthStore.getState().user) {
                    await supabase.auth.signOut();
                }
                setLoading(false);
                router.push('/login');
            }
        } catch (error: any) {
            console.warn(`Session check failed: ${error.message}`);
            setStatus(useAuthStore.getState().user ? 'stable' : 'error'); // Keep session if user exists, otherwise error
            setLoading(false);
        } finally {
            setSessionStatus(false);
        }
    }, [isOnline, isCheckingSession, lastChecked, login, setSessionStatus, setStatus]);

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
                router.push('/login');
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
