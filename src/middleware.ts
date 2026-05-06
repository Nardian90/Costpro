import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  let nonce = '';
  try {
    // Edge-compatible nonce generation using Web Crypto API
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    // Use Array.from to avoid issues with spreading Uint8Array in some environments
    nonce = btoa(String.fromCharCode(...Array.from(array)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  } catch (e) {
    // Fallback to randomUUID if Web Crypto fails
    nonce = crypto.randomUUID();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseWs = supabaseUrl.replace('https://', 'wss://');

  const cspHeader = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://vercel.live https://vercel.com https://storage.googleapis.com https://apis.google.com`,
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
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
