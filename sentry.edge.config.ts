import * as Sentry from '@sentry/nextjs';

// FIX-PERF (2026-07-13): desactivar Sentry en edge cuando no hay DSN o en dev.
const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (SENTRY_DSN && process.env.NODE_ENV !== 'development') {
Sentry.init({
  dsn: SENTRY_DSN,

  // Minimal Edge config — avoid any Node.js APIs
  tracesSampleRate: 0.1,

  // Don't send events in localhost development
  enabled: process.env.NODE_ENV === 'production',

  environment: process.env.NODE_ENV || 'development',
});
}
