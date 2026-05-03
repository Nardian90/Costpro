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
 *
 * OpenTelemetry SDK is only initialized when OTEL_ENABLED=true env var is set.
 * In development with Turbopack, OTel SDK packages may not resolve correctly
 * (they use Node.js-specific module resolution), so tracing is opt-in.
 */

export async function register() {
  // Only initialize tracing in Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === 'edge') {
    return;
  }

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
