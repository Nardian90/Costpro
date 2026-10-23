/**
 * Next.js Instrumentation Hook
 *
 * This file is automatically loaded by Next.js at startup (before the server begins
 * handling requests). It registers process-level error handlers and initializes
 * Sentry tracing for the Node.js runtime (opt-in: solo con DSN + production).
 *
 * IMPORTANT: This file MUST be at the project root (not inside src/).
 * See: https://nextjs.org/docs/app/api-reference/config/instrumentation
 *
 * The instrumentation hook does NOT run in Edge Runtime — we check NEXT_RUNTIME
 * to avoid importing Node.js-only packages in Edge contexts.
 *
 * CP-INFRA-002b (2026-10-23): OpenTelemetry RETIRADO del arranque de la app y
 * del runtime serverless (dependencias @opentelemetry/* eliminadas). Este hook
 * ya no inicializa tracing; el logging estructurado (observability/logger),
 * la auditoría de negocio y /api/health siguen intactos. src/instrumentation.ts
 * (entry point OTel puro de la Iteración 11.5) fue eliminado en esta misión.
 * Reactivación: ver docs/CP-INFRA-002-REACTIVACION.md.
 */

export async function register() {
  // Only initialize in Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === 'edge') {
    return;
  }

  // Initialize Sentry in server runtime (solo en production — Sentry queda desactivado
  // en dev; su overhead es el motivo del FIX-PERF 2026-07-13. No se toca en esta misión.)
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NODE_ENV === 'production') {
    try {
      await import('./sentry.server.config');
    } catch (err) {
      // Sentry is optional — never crash the app if it fails
      console.error('[Instrumentation] Failed to initialize Sentry server:', err);
    }
  }

  // FIX-INF-023: Process-level error handlers (Node.js only)
  try {
    if (typeof process !== 'undefined' && typeof process.on === 'function') {
      process.on('unhandledRejection', (reason) => {
        console.error('[Process] Unhandled rejection:', reason);
      });
      process.on('uncaughtException', (error) => {
        console.error('[Process] Uncaught exception:', error);
      });
    }
  } catch {
    // process.on not available in this runtime
  }
}
