/**
 * FIX-SEC-023: Minimal CSRF protection via Origin/Referer validation.
 * For state-changing requests, verify the request origin matches the app origin.
 */
export function validateOrigin(req: Request): boolean {
  const origin = req.headers.get('origin') || req.headers.get('referer');
  if (!origin) return true; // Same-origin requests have no origin header
  
  const appOrigin = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || '';
  if (!appOrigin) return true; // No origin configured, skip validation
  
  try {
    const originUrl = new URL(origin);
    const appUrl = new URL(appOrigin);
    return originUrl.origin === appUrl.origin;
  } catch {
    return false;
  }
}
