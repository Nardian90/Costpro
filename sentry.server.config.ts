import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Adjust this value in production
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Debug mode
  debug: process.env.NODE_ENV !== 'production',

  // Don't send events in localhost development
  enabled: process.env.NODE_ENV !== 'development',

  environment: process.env.NODE_ENV || 'development',

  // Strip PII from URLs
  beforeSend(event) {
    if (event.request?.url) {
      event.request.url = event.request.url.replace(/\/api\/[^?]*\?[^&]*token=[^&]*/, '/api/REDACTED');
    }
    return event;
  },
});
