import { logger } from '@/lib/logger';
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  logger.warn('DATABASE', 'ENV_MISSING', {
    detail: 'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set in environment variables. The application will not function without them.',
  });
}

// Initialize the Supabase client.
// No fallback credentials — env vars are required for security compliance (OWASP ASVS 2.8.1).
export const supabase: SupabaseClient = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key-required'
);

/**
 * Creates an authenticated Supabase client for use in server-side routes.
 * @param token The user's access token (JWT)
 */
export const getSupabaseAuthClient = (token: string) => {
  return createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder-key-required',
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    },
  );
};
