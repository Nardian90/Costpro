import * as Sentry from '@sentry/nextjs';

// FIX-PERF (2026-07-13): desactivar Sentry completamente cuando no hay DSN
// configurado. Antes, Sentry se inicializaba igual y generaba overhead masivo
// (tracesSampleRate=1.0 + debug=true en dev) que causaba que el dev server
// consumiera 2.8GB de RAM y no pudiera responder a requests del preview.
const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (!SENTRY_DSN) {
  // Sin DSN → no inicializar Sentry. Evita overhead innecesario en dev.
  // eslint-disable-next-line no-console
  console.log('[Sentry] DSN not configured — skipping initialization');
} else {
Sentry.init({
  dsn: SENTRY_DSN,

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0.0,

  // Session Replay
  replaysSessionSampleRate: 0.05, // 5% of sessions in production
  replaysOnErrorSampleRate: 1.0,  // 100% of sessions with errors

  // Performance Monitoring
  profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0.0,

  // Debug mode (off in production AND off in dev to reduce console noise)
  debug: false,

  // Filter out noisy errors
  ignoreErrors: [
    // Browser extensions
    'Non-Error promise rejection captured',
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    // Network errors that are not actionable
    'NetworkError',
    'Failed to fetch',
    'Load failed',
    // Next.js development noise
    'AbortController is not defined',
  ],

  // Don't send events in localhost development
  enabled: process.env.NODE_ENV !== 'development',

  // Attach user info if available
  beforeSend(event) {
    // Strip PII from URLs
    if (event.request?.url) {
      event.request.url = event.request.url.replace(/\/api\/[^?]*\?[^&]*token=[^&]*/, '/api/REDACTED');
    }
    return event;
  },

  integrations: [
    // Replay integration for session replay on errors
    Sentry.replayIntegration({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
    }),
    // Browser tracing (tracePropagationTargets removed in Sentry v10 — defaults to same-origin only)
    Sentry.browserTracingIntegration(),
  ],

  tunnel: '/api/monitoring',

  environment: process.env.NODE_ENV || 'development',

  // Release tracking
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE || undefined,
});
} // cierre del else (SENTRY_DSN presente)
