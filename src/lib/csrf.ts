/**
 * CSRF Origin Validation
 *
 * Validates that the request Origin/Referer matches the configured app origin.
 * Allowed origins are determined by:
 *   1. NEXTAUTH_URL / NEXT_PUBLIC_APP_URL (same-origin)
 *   2. CSRF_ALLOWED_DOMAINS env var (comma-separated, supports 3 pattern types)
 *   3. localhost/127.0.0.1 in non-production environments only
 *
 * CSRF_ALLOWED_DOMAINS pattern types:
 *   - Exact:       "costpro4.vercel.app"  → matches only that hostname
 *   - Suffix:      ".space-z.ai"          → matches *.space-z.ai (any subdomain)
 *   - Prefix+suffix: "costpro-*.vercel.app" → matches costpro-*.vercel.app (prefix wildcard)
 *
 * SECURITY: No hardcoded domain bypasses. All allowed domains must be explicitly configured.
 *
 * Example for Vercel production:
 *   CSRF_ALLOWED_DOMAINS=costpro4.vercel.app,costpro-*.vercel.app,.space-z.ai,space-z.ai
 *
 * ⚠️ AVOID ".vercel.app" — any Vercel user can create subdomains there.
 *   Use "costpro-*.vercel.app" instead to scope it to YOUR project's previews.
 */
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

    // Allow same origin
    if (originUrl.origin === appUrl.origin) return true;

    // Allow explicitly configured extra domains (CSRF_ALLOWED_DOMAINS)
    const allowedDomains = (process.env.CSRF_ALLOWED_DOMAINS || '').split(',').filter(Boolean);
    for (const domain of allowedDomains) {
      const trimmed = domain.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('.')) {
        // Suffix wildcard: ".space-z.ai" → matches any subdomain of space-z.ai
        if (originUrl.hostname.endsWith(trimmed)) return true;
      } else if (trimmed.includes('*')) {
        // Prefix+suffix wildcard: "costpro-*.vercel.app" → matches costpro-git-xxx.vercel.app
        if (matchPrefixWildcard(originUrl.hostname, trimmed)) return true;
      } else {
        // Exact hostname match
        if (originUrl.hostname === trimmed) return true;
      }
    }

    // Allow localhost on any port (development only — NOT in production)
    if (process.env.NODE_ENV !== 'production' && (originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1')) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Matches a hostname against a prefix wildcard pattern like "costpro-*.vercel.app"
 *
 * Rules:
 *   - Only ONE asterisk is allowed, and it must be in the leftmost segment
 *   - "costpro-*.vercel.app" matches: costpro-git-abc123-team.vercel.app
 *   - "costpro-*.vercel.app" does NOT match: evil-costpro-x.vercel.app
 *   - "*.vercel.app" is rejected (too broad — same as ".vercel.app" suffix)
 */
function matchPrefixWildcard(hostname: string, pattern: string): boolean {
  // Validate pattern: only one * allowed, must be in first segment
  const starCount = (pattern.match(/\*/g) || []).length;
  if (starCount !== 1) return false;

  const starIndex = pattern.indexOf('*');
  // Star must be in the first segment (before the first dot)
  const firstDotIndex = pattern.indexOf('.');
  if (firstDotIndex !== -1 && starIndex > firstDotIndex) return false;

  // Reject bare "*.domain" — that's what the ".domain" suffix syntax is for
  if (pattern.startsWith('*.')) return false;

  // Convert pattern to regex: "costpro-*.vercel.app" → /^costpro-[^.]+\.vercel\.app$/
  // The * segment matches one non-empty segment (no dots)
  const prefix = pattern.substring(0, starIndex);
  const suffix = pattern.substring(starIndex + 1);

  // Build regex: prefix + one-or-more non-dot chars + suffix (escaped)
  const regexStr = `^${escapeRegex(prefix)}[^.]+${escapeRegex(suffix)}$`;
  const regex = new RegExp(regexStr, 'i');

  return regex.test(hostname);
}

/** Escapes special regex characters in a string */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
