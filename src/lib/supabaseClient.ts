import { createClient } from '@supabase/supabase-js'

// Fallback Supabase URL found in configuration for images
const FALLBACK_URL = 'https://wthkddeleylijmonclxg.supabase.co';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    'Supabase environment variables are missing. ' +
    'Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in your environment.'
  );
}

// Initialize the Supabase client.
// Using a fallback URL that is valid for the project helps avoid CORS errors
// and allows some parts of the app to function if only the anon key is missing (though most will fail).
export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey || 'placeholder-key'
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
