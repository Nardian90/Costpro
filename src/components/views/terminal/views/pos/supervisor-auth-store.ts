/**
 * supervisor-auth-store.ts — REM-INV-4A-R (RC-1) client-side helper.
 *
 * Holds the supervisor authorization issued by /api/auth/supervisor-check
 * (supervisor_user_id + signed supervisor_token) until the checkout consumes it.
 * The token is bound server-side to (supervisor, operator, store) and expires
 * in SUPERVISOR_TOKEN_TTL_SECONDS (see src/lib/supervisor-token.ts).
 *
 * The POS flow (SupervisorAuthModal -> usePOSCheckout) previously dropped the
 * supervisor identity entirely, which left the ≥15% discount gate fail-closed
 * at the RPC while the RPC itself remained spoofable via direct calls
 * (REM-INV-4A F-04-A2). This module closes that wiring without touching the
 * modal consumers.
 */

let supervisorAuth: { userId: string; token: string; issuedAt: number } | null = null;

export function setSupervisorAuth(userId: string, token: string): void {
  supervisorAuth = { userId, token, issuedAt: Date.now() };
}

export function getSupervisorAuth(): { userId: string; token: string; issuedAt: number } | null {
  return supervisorAuth;
}

export function clearSupervisorAuth(): void {
  supervisorAuth = null;
}
