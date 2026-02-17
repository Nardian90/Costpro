import { createClient } from '@supabase/supabase-js'

// Custom lock implementation to avoid Navigator LockManager issues in some browsers
const customLock = async <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => {
  return await fn();
};

// Fallback Supabase credentials provided by user
const FALLBACK_URL = 'https://wthkddeleylijmonclxg.supabase.co';
const FALLBACK_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0aGtkZGVsZXlsaWptb25jbHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0NzUxMzIsImV4cCI6MjA4MzA1MTEzMn0.ooFYAgZtOh4PXRAKsEWDrXaNpWy3aikmX_Grl4kQavU';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_KEY;

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  // eslint-disable-next-line no-console
  console.warn(
    'Supabase environment variables are missing. ' +
    'Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in your environment.'
  );
}

// Initialize the Supabase client.
// Using fallbacks ensures the application can function if environment variables are not yet configured.
export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'costpro-auth-token',
      lock: customLock,
    }
  }
)

/**
 * Creates an authenticated Supabase client for use in server-side routes.
 * @param token The user's access token (JWT)
 */
export const getSupabaseAuthClient = (token: string) => {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      lock: customLock,
    }
  });
};
