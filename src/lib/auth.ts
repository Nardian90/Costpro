import { type NextRequest } from "next/server";
import { supabase } from "@/lib/supabaseClient";

/**
 * Helper to get the user session in API Route Handlers.
 */
export async function getServerSession(request: NextRequest) {
  try {
    // 1. Try to get token from Authorization header
    const authHeader = request.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (!error && user) {
        return { user, token };
      }

      if (error) {
        console.error('[getServerSession] getUser error:', error.message);
      }
    }

    // FIX-SEC-024: getSession() fallback removed — only Bearer token auth is allowed
    console.warn('[getServerSession] getSession fallback removed for security (SEC-024)');
  } catch (err: any) {
    console.error('[getServerSession] Critical error:', err.message);
  }

  return null;
}
