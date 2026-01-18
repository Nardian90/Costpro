## 2025-05-15 - [API Route Authentication Gap]
**Vulnerability:** Several API endpoints in `src/app/api/inventory/` were using the global, unauthenticated Supabase client and lacked explicit session verification.
**Learning:** Even with RLS enabled, using an unauthenticated client in server-side routes can lead to data leaks if RLS policies are misconfigured or missing. Explicit authentication checks at the API entry point provide defense-in-depth and better error handling.
**Prevention:** Always use `getServerSession` to verify the user and `getSupabaseAuthClient(token)` to ensure all database operations are performed in the context of the authenticated user.
