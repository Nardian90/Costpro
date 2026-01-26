import { createClient } from '@supabase/supabase-js'

// Fallback Supabase credentials provided by user
const FALLBACK_URL = 'https://wthkddeleylijmonclxg.supabase.co';
const FALLBACK_KEY = 'sb_publishable__wm5ULYU2FT_Cwq663dP5g_Ycg8AlXr';

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
  supabaseAnonKey
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
  });
};
