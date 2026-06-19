/**
 * @file Centralized Supabase Admin Client factory.
 * @description Single source of truth for creating Supabase service_role clients.
 * All API routes and integration services MUST use this instead of
 * creating their own admin client instances.
 *
 * This ensures:
 * - DRY: one place to update auth config
 * - Consistency: same client options everywhere
 * - Security: centralized null-check handling
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const ADMIN_CLIENT_OPTIONS = {
  auth: { autoRefreshToken: false, persistSession: false },
} as const;

/**
 * Creates a Supabase admin client using the service role key.
 * Only for use in API routes and server-side integration services.
 *
 * @throws {Error} If NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured
 */
export async function getSupabaseAdminClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase URL o Service Role Key no configurados');
  return createClient(url, key, ADMIN_CLIENT_OPTIONS);
}

/**
 * Synchronous variant — returns null if env vars are missing.
 * Used by auth middleware where throwing would break the response chain.
 */
export function getSupabaseAdminSafe(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, ADMIN_CLIENT_OPTIONS);
}

// Backward-compatible aliases
export const getAdminClient = getSupabaseAdminClient;
export const getSupabaseAdmin = getSupabaseAdminSafe;
