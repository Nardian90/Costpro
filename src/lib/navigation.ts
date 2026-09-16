/**
 * Utility for safe navigation to prevent app crashes during RSC payload fetch failures.
 */

export const safeNavigate = {
  push: (router: any, href: string) => {
    try {
      router.push(href);
    } catch (error) {
      console.error('[Navigation Error] Failed to push route:', href, error);
      // Fallback to browser navigation if router fails
      if (typeof window !== 'undefined') {
        window.location.href = href;
      }
    }
  },
  replace: (router: any, href: string) => {
    try {
      router.replace(href);
    } catch (error) {
      console.error('[Navigation Error] Failed to replace route:', href, error);
      if (typeof window !== 'undefined') {
        window.location.replace(href);
      }
    }
  }
};

/**
 * FC ACCESS FLOW FIX (2026-09-16) — returnTo es SOLO un auxiliar de navegación,
 * jamás un mecanismo de autorización. La autorización real sigue siendo:
 * sesión COSTPRO (Supabase Auth) + RLS (auth.uid()) + roles/entitlements.
 *
 * Open-redirect protection: se aceptan exclusivamente rutas INTERNAS de la
 * allowlist (rutas reales de COSTPRO). Rutas reales relevantes:
 *   · `/`         → landing + app (shell único de COSTPRO)
 *   · `/fc/`      → superficie de producto «Ficha de Costo»
 * Cualquier otro valor (absoluto, protocol-relative, desconocido) → '/'.
 */
const RETURNTO_ALLOWLIST = ['/fc/', '/fc'];

export function safeReturnTo(value: string | null | undefined): string {
  if (!value) return '/';
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return '/';
  }
  if (!decoded.startsWith('/') || decoded.startsWith('//')) return '/';
  if (decoded.includes('\\')) return '/';
  if (/^https?:\/\//i.test(decoded)) return '/';
  if (!RETURNTO_ALLOWLIST.includes(decoded)) return '/';
  return decoded.endsWith('/') ? decoded : `${decoded}/`;
}

/** Lee y valida returnTo de la URL actual (client-side). */
export function returnToFromLocation(): string {
  if (typeof window === 'undefined') return '/';
  try {
    return safeReturnTo(new URLSearchParams(window.location.search).get('returnTo'));
  } catch {
    return '/';
  }
}
