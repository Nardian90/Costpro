import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Skip check during build
if (!url || !key) {
  if (process.env.NEXT_PHASE !== 'phase-production-build') {
    logger.warn('DATABASE', 'SUPABASE_CLIENT_CONFIG_MISSING', { url: !!url, key: !!key });
  }
}

/**
 * Singleton instance for CLIENT-SIDE use only.
 * In Next.js App Router, global instances can share state in SSR/Edge.
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
