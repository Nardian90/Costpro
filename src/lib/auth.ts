import { type NextRequest } from "next/server";
import { supabase } from "@/lib/supabaseClient";

/**
 * Helper to get the user session in API Route Handlers.
 * It first checks the Authorization header for a Bearer token,
 * then falls back to the Supabase client's getSession() (which might work if cookies are set).
 */
export async function getServerSession(request: NextRequest) {
  // 1. Try to get token from Authorization header
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (!error && user) {
      return { user, token };
    }
  }

  // 2. Fallback to getSession (might work in some environments if cookies are propagated)
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (!sessionError && session?.user) {
    return { user: session.user, token: session.access_token };
  }

  return null;
}
