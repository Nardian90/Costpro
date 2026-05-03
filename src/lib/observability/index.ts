/**
 * Observability barrel export.
 *
 * Import from '@/lib/observability' to get access to tracing, structured logging,
 * and API route instrumentation utilities.
 *
 * The lightweight tracing API (getTracer, startSpan, withActiveSpan) uses only
 * @opentelemetry/api and is safe for Turbopack.
 *
 * The heavy SDK setup (setupTracing) is ONLY loaded via instrumentation.ts
 * and must be imported directly: import { setupTracing } from '@/lib/observability/tracing'
 */

// Lightweight tracing operations (safe for Turbopack)
export {
  getTracer,
  startSpan,
  withActiveSpan,
  getTraceContext,
  trace,
  SpanStatusCode,
  SpanKind,
} from './tracing-core';
export type { Span, Tracer } from './tracing-core';

// Structured Logger
export {
  logInfo,
  logWarn,
  logError,
  logDebug,
} from './logger';

// API Route Tracing
export { withTracing } from './api-tracing';
