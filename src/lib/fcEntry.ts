/**
 * FC ENTRY (PROMPT 3, GATE 1) — decisión de entrada al módulo Ficha de Costo
 * desde el landing, SIN recargas.
 *
 * Problema corregido: el CTA «Crear Ficha de Costo — Gratis» era un enlace
 * pasivo a /fc/; el wrapper redirigía a /?login=1&returnTo=/fc/ cuando no había
 * sesión, recargando el landing completo antes de mostrar el login.
 *
 * Solución: el CTA decide en el click con la MISMA señal que usa el wrapper
 * (presencia del token de sesión COSTPRO en localStorage de este origen) y:
 *   · Con sesión  → navega a /fc/ (una sola navegación, destino final).
 *   · Sin sesión  → NO navega: fija returnTo en la URL con history.replaceState
 *     (cero recarga) y abre el modal de login de COSTPRO. Tras autenticarse,
 *     LoginForm/HomePageClient consumen returnTo (allowlist en navigation.ts).
 *
 * Seguridad: aquí NO se autoriza nada. returnTo es SOLO navegación
 * (safeReturnTo); la identidad sigue siendo Supabase Auth y la autorización
 * RLS server-side. «Usar como invitado» permanece exclusivamente en el login.
 */

const SB_TOKEN_SUFFIX = '-auth-token';

/** Misma señal que el wrapper /fc/ index.html: token COSTPRO presente. */
export function hasCostproSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const ls = window.localStorage;
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && k.startsWith('sb-') && k.endsWith(SB_TOKEN_SUFFIX)) {
        return !!ls.getItem(k);
      }
    }
  } catch {
    /* localStorage bloqueado → tratar como no autenticado */
  }
  return false;
}

/**
 * Acción del CTA «Crear Ficha de Costo — Gratis»:
 * devuelve true si abrió el login (el llamador NO debe navegar); false si la
 * navegación a /fc/ quedó a cargo de este helper.
 */
export function enterFichaDeCosto(openLogin: () => void): boolean {
  if (hasCostproSession()) {
    // Autenticado: entrada directa al módulo (el wrapper sembrará el envelope).
    window.location.assign('/fc/');
    return false;
  }
  // No autenticado: modal de COSTPRO inmediato, sin recarga. returnTo queda en
  // la URL (replaceState no navega) para que el post-auth caiga en /fc/.
  try {
    const u = new URL(window.location.href);
    u.searchParams.set('returnTo', '/fc/');
    window.history.replaceState({}, '', u.pathname + '?' + u.searchParams.toString() + u.hash);
  } catch {
    /* sin URL manipulable: el modal se abre igual; el post-auth irá a '/' */
  }
  openLogin();
  return true;
}
