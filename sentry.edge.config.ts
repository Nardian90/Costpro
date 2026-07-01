import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Minimal Edge config — avoid any Node.js APIs
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Don't send events in localhost development
  enabled: process.env.NODE_ENV !== 'development',

  environment: process.env.NODE_ENV || 'development',
});
