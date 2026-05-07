import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

// Skip check during build or tests
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  if (process.env.NEXT_PHASE !== 'phase-production-build' && process.env.NODE_ENV !== 'test') {
    logger.warn('DATABASE', 'SUPABASE_CLIENT_CONFIG_MISSING', { url: !!process.env.NEXT_PUBLIC_SUPABASE_URL, key: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY });
  }
}

/**
 * Singleton instance for CLIENT-SIDE use only.
 */
export const supabase: SupabaseClient = createClient(url, key);

/**
 * BUG-037: Factory for request-scoped instances in SSR/API routes.
 */
export function createServerClient() {
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

/**
 * Helper to get a Supabase client with a specific user token
 */
export function getSupabaseAuthClient(token: string) {
  return createClient(url, key, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
  });
}
