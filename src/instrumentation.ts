/**
 * Iteración 11.5 — Instrumentation entry point for Next.js
 *
 * Next.js calls register() before the server starts. We initialize
 * OpenTelemetry SDK here so spans are available for all requests.
 *
 * Aclaración 1: auto-instrumentations-node is NOT loaded — manual tracing only.
 * Aclaración 3: Backend generates its own traceId if frontend doesn't send one.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      if (process.env.NODE_ENV === 'production' || process.env.OTEL_ENABLED === 'true') {
        const { setupTracing } = await import('@/lib/observability/tracing');
        setupTracing();
        console.log('[instrumentation] OpenTelemetry SDK initialized');
      } else {
        console.log('[instrumentation] OpenTelemetry skipped (development mode)');
      }
    } catch (err) {
      // Aclaración: catch silencioso — el servidor debe continuar sin tracing
      console.warn('[instrumentation] OpenTelemetry failed to initialize, continuing without tracing:', err);
    }
  }
}
