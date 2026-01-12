import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// TODO: Replace these with your actual Supabase credentials or load them securely
const supabaseUrl = 'https://wthkddeleylijmonclxg.supabase.co'
const supabaseAnonKey = 'sb_publishable__wm5ULYU2FT_Cwq663dP5g_Ycg8AlXr'

let supabaseInstance = null;

const isValidUrl = (url) => {
    try { return new URL(url).protocol.startsWith('http'); } catch (e) { return false; }
};

if (isValidUrl(supabaseUrl) && supabaseAnonKey !== 'YOUR_SUPABASE_ANON_KEY_HERE') {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey)
} else {
    console.error('Supabase credentials missing or invalid. Please update src/loyverse/supabaseClient.js with your actual credentials.')
    // Mock client to prevent crash
    supabaseInstance = {
        auth: {
            signInWithPassword: async () => ({ data: null, error: new Error('Supabase credentials missing') }),
            signOut: async () => ({ error: null }),
            getUser: async () => ({ data: { user: null }, error: new Error('Supabase credentials missing') }),
        },
        from: () => ({
            select: () => ({
                eq: () => ({
                    single: async () => ({ data: null, error: new Error('Supabase credentials missing') })
                })
            })
        })
    }
}

export const supabase = supabaseInstance
