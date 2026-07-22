import * as Sentry from '@sentry/nextjs';

// FIX-PERF (2026-07-13): desactivar Sentry cuando no hay DSN o en dev.
// El server-side Sentry con tracesSampleRate=1.0 + debug=true generaba
// overhead masivo que causaba que el dev server consumiera 2.8GB de RAM.
const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (SENTRY_DSN && process.env.NODE_ENV !== 'development') {
Sentry.init({
  dsn: SENTRY_DSN,

  // Adjust this value in production
  tracesSampleRate: 0.1,

  // Debug mode (off always to reduce noise)
  debug: false,

  // Don't send events in localhost development
  enabled: process.env.NODE_ENV === 'production',

  environment: process.env.NODE_ENV || 'development',

  // Strip PII from URLs
  beforeSend(event) {
    if (event.request?.url) {
      event.request.url = event.request.url.replace(/\/api\/[^?]*\?[^&]*token=[^&]*/, '/api/REDACTED');
    }
    return event;
  },
});
} else {
   
  console.log('[Sentry Server] DSN not configured or dev mode — skipping initialization');
}
