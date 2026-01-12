import { useEffect } from 'react';
import { useAuthStore } from '@/store';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

/**
 * Hook to sync Supabase Auth session with Zustand store
 * Handles session persistence and automatic logout
 */
export function useSupabaseAuth() {
    const { login, logout, user } = useAuthStore();
    const router = useRouter();

    useEffect(() => {
        // Check active session on mount
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();

            if (session?.user) {
                // Fetch profile data
                const { data: profileData } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', session.user.id)
                    .single();

                if (profileData && profileData.is_active) {
                    const userData = {
                        id: profileData.id,
                        email: profileData.email,
                        full_name: profileData.full_name,
                        role: profileData.role,
                        store_id: profileData.store_id,
                        is_active: profileData.is_active,
                        created_at: profileData.created_at,
                        updated_at: profileData.updated_at,
                    };

                    login(userData, session.access_token);
                } else {
                    // User inactive or profile not found
                    await supabase.auth.signOut();
                    logout();
                }
            } else if (user) {
                // No session but user in store - clear it
                logout();
            }
        };

        checkSession();

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
                        const userData = {
                            id: profileData.id,
                            email: profileData.email,
                            full_name: profileData.full_name,
                            role: profileData.role,
                            store_id: profileData.store_id,
                            is_active: profileData.is_active,
                            created_at: profileData.created_at,
                            updated_at: profileData.updated_at,
                        };

                        login(userData, session.access_token);
                    }
                } else if (event === 'SIGNED_OUT') {
                    logout();
                    router.push('/login');
                } else if (event === 'TOKEN_REFRESHED' && session) {
                    // Update token in store
                    if (user) {
                        login(user, session.access_token);
                    }
                }
            }
        );

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    return { user };
}
