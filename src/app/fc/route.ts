/**
 * FC-MVP-INTEGRATION — entry point /fc → wrapper estático /fc/index.html.
 *
 * Redirect HTTP puro (307, sin depender de JS): /fc/ → (308 trailing-slash)
 * → /fc → (307 aquí) → /fc/index.html → (location.replace del wrapper)
 * → /fc/FC.release.html.
 *
 * El wrapper (public/fc/index.html) siembra la sesión de COSTPRO en el
 * sobre que la Ficha de Costo ya sabe leer y redirige a FC.release.html
 * (artefacto canónico byte-exacto, sha256 en public/fc/release-manifest.json).
 * Todo /fc/* queda exento de CSP en src/proxy.ts (artefacto monolítico con
 * scripts inline). Ver docs/fc-mvp-integration.md.
 */
export function GET() {
  // Location RELATIVO (RFC 7231): invariante detrás de proxies/dominios
  // (request.url expone 0.0.0.0:3000 cuando bun enlaza a todas las interfaces).
  return new Response(null, { status: 307, headers: { Location: '/fc/index.html' } });
}
