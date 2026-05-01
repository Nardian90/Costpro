import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Use Web Crypto API instead of Node.js crypto
  const nonce = btoa(crypto.randomUUID());

  const cspHeader = [
    `default-src 'self'`,
    // Scripts: nonce en lugar de unsafe-inline/unsafe-eval
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://vercel.live https://vercel.com https://storage.googleapis.com https://apis.google.com`,
    `worker-src 'self' blob:`,
    `style-src 'self' 'unsafe-inline'`, // los estilos inline en CSS-in-JS son inevitables con Tailwind
    `img-src 'self' blob: data: https://wthkddeleylijmonclxg.supabase.co https://vercel.com https://vercel.live https://*.googleusercontent.com`,
    `font-src 'self' data:`,
    `connect-src 'self' https://wthkddeleylijmonclxg.supabase.co wss://wthkddeleylijmonclxg.supabase.co https://vercel.live https://vercel.com https://storage.googleapis.com https://accounts.google.com`,
    `frame-src 'self' blob: data: https://vercel.live https://vercel.com https://accounts.google.com`,
    `frame-ancestors 'self'`,
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('x-csp-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', cspHeader);
  // Mantener los otros headers de seguridad que ya estaban en next.config.ts:
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
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
