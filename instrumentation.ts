/**
 * Next.js Instrumentation Hook
 *
 * This file is automatically loaded by Next.js at startup (before the server begins
 * handling requests). It initializes OpenTelemetry tracing for the Node.js runtime.
 *
 * IMPORTANT: This file MUST be at the project root (not inside src/).
 * See: https://nextjs.org/docs/app/api-reference/config/instrumentation
 *
 * The instrumentation hook does NOT run in Edge Runtime — we check NEXT_RUNTIME
 * to avoid importing Node.js-only packages in Edge contexts.
 */

export async function register() {
  // Only initialize tracing and process handlers in Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === 'edge') {
    return;
  }

  // FIX-INF-023: Process-level error handlers for uncaught exceptions
  process.on('unhandledRejection', (reason) => {
    console.error('[Process] Unhandled rejection:', reason);
  });
  process.on('uncaughtException', (error) => {
    console.error('[Process] Uncaught exception:', error);
  });

  // Opt-in: only initialize when explicitly enabled or in production
  const otelEnabled = process.env.OTEL_ENABLED === 'true' || process.env.NODE_ENV === 'production';
  if (!otelEnabled) {
    return;
  }

  try {
    // Dynamic import to avoid bundling OTel packages into Edge runtime
    const { setupTracing } = await import('./src/lib/observability/tracing');
    await setupTracing();
  } catch (err) {
    // Tracing is optional — never crash the app if it fails
    console.error('[Instrumentation] Failed to initialize OpenTelemetry:', err);
  }
}
