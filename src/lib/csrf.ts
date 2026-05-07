export function validateOrigin(req: Request): boolean {
  const appOrigin = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL;

  // BUG-034: fail-closed if app origin not configured, except in tests
  if (!appOrigin) {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) return true;
    console.error('[CSRF] App origin not configured - blocking request');
    return false;
  }

  const origin = req.headers.get('origin') || req.headers.get('referer');

  // In tests, allow if no origin provided
  if (!origin && (process.env.NODE_ENV === 'test' || process.env.VITEST)) return true;

  if (!origin) return false;

  try {
    const originUrl = new URL(origin);
    const appUrl = new URL(appOrigin);
    return originUrl.origin === appUrl.origin;
  } catch {
    return false;
  }
}
