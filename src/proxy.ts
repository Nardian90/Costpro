// FIX-DEPRECATION (2026-07-04): Renamed from middleware.ts to proxy.ts
// Next.js 16 deprecated the "middleware" file convention in favor of "proxy".
// This file now exports `proxy` instead of `middleware`.
// FIX-INF-003: CORS not configured at proxy level — all API routes are same-origin only by design.
// FIX-INF-004: Auth is enforced per-route via withAuth/withRole HOFs.
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // FC-MVP-INTEGRATION: /fc/* sirve el artefacto monolítico autocontenido
  // FC.html (public/fc/, release canónico v12.10.0 de fichascosto + 11 parches
  // de identidad del FC ACCESS FLOW FIX; hashes en public/fc/release-manifest.json).
  // Ese artefacto contiene cientos de scripts inline y no puede recibir un
  // nonce por-request sin alterar el artefacto byte a byte. Por eso
  // se omite ÚNICAMENTE la CSP en este path; todos los demás headers de
  // seguridad siguen aplicándose. Fuera de /fc/* la CSP permanece intacta.
  if (pathname === '/fc' || pathname.startsWith('/fc/')) {
    const fcResponse = NextResponse.next();
    fcResponse.headers.set('X-Content-Type-Options', 'nosniff');
    fcResponse.headers.set('X-Frame-Options', 'SAMEORIGIN');
    fcResponse.headers.set('X-XSS-Protection', '1; mode=block');
    fcResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    fcResponse.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    fcResponse.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    return fcResponse;
  }

  // Edge-compatible nonce generation using Web Crypto API
  const array = new Uint8Array(18);
  crypto.getRandomValues(array);
  const nonce = btoa(String.fromCharCode(...array)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  // FIX-INF-001: Use env var instead of hardcoded Supabase URL in CSP
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseWs = supabaseUrl.replace('https://', 'wss://');

  // CSP — en desarrollo permitimos unsafe-inline para scripts (los diagnósticos
  // inline de CostProLoader lo necesitan). En producción, el nonce debería bastar
  // pero lo mantenemos por compatibilidad con el entorno preview de Space-Z.
  const isDev = process.env.NODE_ENV !== 'production';

  const cspHeader = [
    `default-src 'self'`,
    isDev
      ? `script-src 'self' 'unsafe-inline' 'unsafe-eval' 'nonce-${nonce}' 'strict-dynamic' https://vercel.live https://vercel.com https://storage.googleapis.com https://apis.google.com`
      : `script-src 'self' 'unsafe-inline' 'nonce-${nonce}' 'strict-dynamic' https://vercel.live https://vercel.com https://storage.googleapis.com https://apis.google.com`,
    `worker-src 'self' blob:`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data: ${supabaseUrl} https://vercel.com https://vercel.live https://*.googleusercontent.com`,
    `font-src 'self' data:`,
    `connect-src 'self' ${supabaseUrl} ${supabaseWs} https://vercel.live https://vercel.com https://storage.googleapis.com https://accounts.google.com`,
    `frame-src 'self' blob: data: https://vercel.live https://vercel.com https://accounts.google.com`,
    `frame-ancestors 'self'`,
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('x-csp-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', cspHeader);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
