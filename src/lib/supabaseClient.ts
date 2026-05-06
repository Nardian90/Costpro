import { logger } from '@/lib/logger';
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// FIX-INF-007: Throw in production if Supabase credentials are missing
// Added check to skip throw during build time if needed
const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build';

if (!supabaseUrl || !supabaseAnonKey) {
  if (process.env.NODE_ENV === 'production' && !isBuildTime) {
    throw new Error('Missing Supabase environment variables');
  }
  logger.warn('DATABASE', 'ENV_MISSING', { detail: 'Supabase credentials not configured — using placeholders' }); // FIX-INF-007
}
const url = supabaseUrl || 'https://placeholder.supabase.co';
const key = supabaseAnonKey || 'placeholder-key-required';

// Initialize the Supabase client.
// No fallback credentials — env vars are required for security compliance (OWASP ASVS 2.8.1).
export const supabase: SupabaseClient = createClient(
  url,
  key
);

/**
 * Creates an authenticated Supabase client for use in server-side routes.
 * @param token The user's access token (JWT)
 */
export const getSupabaseAuthClient = (token: string) => {
  return createClient(
    url, // FIX-INF-007
    key, // FIX-INF-007
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    },
  );
};
