import { useEffect, useState, useRef } from 'react';
import { useAuthStore } from '@/store';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import type { UserRole } from '@/types';

/**
 * Hook to sync Supabase Auth session with Zustand store
 * Handles session persistence and automatic logout
 */
export function useSupabaseAuth() {
    const { login, logout, user, token } = useAuthStore();
    const router = useRouter();
    // Optimistic loading: if we have a persisted user, don't block the UI
    const [loading, setLoading] = useState(!user);

    // Concurrency and throttling control
    const isChecking = useRef(false);
    const lastChecked = useRef(0);

    useEffect(() => {
        // Check active session
        const checkSession = async (force = false) => {
            // Avoid concurrent checks
            if (isChecking.current) return;

            // Throttle checks (e.g. 60s) unless forced
            const now = Date.now();
            if (!force && now - lastChecked.current < 60000) {
                return;
            }

            isChecking.current = true;
            lastChecked.current = now;

            // Timeout failsafe of 15s to prevent hanging the app
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Session check timeout')), 15000)
            );

            try {
                const { data: { session } } = await Promise.race([
                    supabase.auth.getSession(),
                    timeoutPromise
                ]) as any;

                if (session?.user) {
                    // Fetch profile data
                    const { data: profileData } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', session.user.id)
                        .single();

                    if (profileData && profileData.is_active) {
                        // Fetch per-store roles if active store is set
                        let activeRoles: UserRole[] = [profileData.role];
                        if (profileData.active_store_id) {
                            const { data: accessData, error: accessError } = await supabase
                                .from('user_store_access')
                                .select('roles')
                                .eq('user_id', profileData.id)
                                .eq('store_id', profileData.active_store_id)
                                .single();

                            if (accessError) {
                                console.warn('Error fetching active store roles:', accessError.message);
                            } else if (accessData?.roles) {
                                activeRoles = accessData.roles as UserRole[];
                            }
                        }

                        const userData = {
                            id: profileData.id,
                            email: profileData.email,
                            full_name: profileData.full_name,
                            role: profileData.role,
                            roles: activeRoles,
                            store_id: profileData.active_store_id || profileData.store_id,
                            active_store_id: profileData.active_store_id,
                            max_stores_limit: profileData.max_stores_limit,
                            max_users_limit: profileData.max_users_limit,
                            created_by: profileData.created_by,
                            is_active: profileData.is_active,
                            created_at: profileData.created_at,
                            updated_at: profileData.updated_at,
                        };

                        // Only update store if data has changed to prevent unnecessary re-renders
                        // We use getState() to ensure we have the most recent data even in closures
                        const currentState = useAuthStore.getState();
                        const currentSessionChanged = session.access_token !== currentState.token;
                        const userDataChanged = JSON.stringify(userData) !== JSON.stringify(currentState.user);

                        if (currentSessionChanged || userDataChanged) {
                            login(userData, session.access_token);
                        }
                    } else {
                        // User inactive or profile not found
                        await supabase.auth.signOut();
                        logout();
                    }
                } else if (useAuthStore.getState().user) {
                    // No session but user in store - clear it
                    console.warn('No session found but user exists in store. Clearing state...');
                    await supabase.auth.signOut();
                    logout();
                }
            } catch (error: any) {
                // Ignore Abort errors - they are likely from browser behavior or concurrent requests
                if (error?.name === 'AbortError' || error?.message?.includes('signal is aborted')) {
                    console.warn('Session check aborted by browser/signal. Ignoring.');
                    return;
                }

                const currentState = useAuthStore.getState();
                console.error("Session check error", error);
                if (error.message === 'Session check timeout' && currentState.user) {
                    console.warn('Session check timed out but user exists in store. Keeping local session for resilience.');
                    // Don't logout, just continue with what we have in the store
                } else if (currentState.user) {
                    // For other errors, if we have a user, maybe it's a temporary network error
                    console.warn('Session check error with existing user, keeping local session.');
                } else {
                    // No user and error occurred, ensure we are logged out
                    logout();
                    await supabase.auth.signOut().catch(() => {});
                }
            } finally {
                isChecking.current = false;
                setLoading(false);
            }
        };

        checkSession(true); // Force check on mount

        // Re-check session when tab becomes visible (handles "inactivity" waking up)
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                console.log('App visible, re-checking session...');
                checkSession(); // throttled call
            }
        };
        window.addEventListener('visibilitychange', handleVisibilityChange);

        // Listen for auth state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                console.log('Auth state changed:', event);

                if (event === 'SIGNED_IN' && session?.user) {
                    // Fetch profile on sign in
                    const { data: profileData } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', session.user.id)
                        .single();

                    if (profileData && profileData.is_active) {
                        // Fetch per-store roles if active store is set
                        let activeRoles: UserRole[] = [profileData.role];
                        if (profileData.active_store_id) {
                            const { data: accessData, error: accessError } = await supabase
                                .from('user_store_access')
                                .select('roles')
                                .eq('user_id', profileData.id)
                                .eq('store_id', profileData.active_store_id)
                                .single();

                            if (accessError) {
                                console.warn('Error fetching active store roles on sign in:', accessError.message);
                            } else if (accessData?.roles) {
                                activeRoles = accessData.roles as UserRole[];
                            }
                        }

                        const userData = {
                            id: profileData.id,
                            email: profileData.email,
                            full_name: profileData.full_name,
                            role: profileData.role,
                            roles: activeRoles,
                            store_id: profileData.active_store_id || profileData.store_id,
                            active_store_id: profileData.active_store_id,
                            max_stores_limit: profileData.max_stores_limit,
                            max_users_limit: profileData.max_users_limit,
                            created_by: profileData.created_by,
                            is_active: profileData.is_active,
                            created_at: profileData.created_at,
                            updated_at: profileData.updated_at,
                        };

                        // Comparison check here too using latest state
                        const currentState = useAuthStore.getState();
                        const currentSessionChanged = session.access_token !== currentState.token;
                        const userDataChanged = JSON.stringify(userData) !== JSON.stringify(currentState.user);

                        if (currentSessionChanged || userDataChanged) {
                            login(userData, session.access_token);
                        }
                    }
                    setLoading(false);
                } else if (event === 'SIGNED_OUT') {
                    logout();
                    setLoading(false);
                    router.push('/login');
                } else if (event === 'TOKEN_REFRESHED' && session) {
                    // Update token in store
                    if (user) {
                        login(user, session.access_token);
                    }
                    setLoading(false);
                } else {
                    setLoading(false);
                }
            }
        );

        return () => {
            subscription.unsubscribe();
            window.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    return { user, loading };
}
