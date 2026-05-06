import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Session Replay
  replaysSessionSampleRate: 0.05, // 5% of sessions in production
  replaysOnErrorSampleRate: 1.0,  // 100% of sessions with errors

  // Performance Monitoring
  profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Debug mode (off in production)
  debug: process.env.NODE_ENV !== 'production',

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
    // Browser tracing
    Sentry.browserTracingIntegration({
      // Set tracePropagationTargets to match your domain and subdomains
      tracePropagationTargets: ['localhost', /^\//],
    }),
  ],

  tunnel: '/api/monitoring',

  environment: process.env.NODE_ENV || 'development',

  // Release tracking
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE || undefined,
});
