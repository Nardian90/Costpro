/**
 * Observability barrel export.
 *
 * Import from '@/lib/observability' to get access to tracing, structured logging,
 * and API route instrumentation utilities.
 */

// Lightweight tracing operations (safe for Turbopack)
export {
  getTracer,
  startSpan,
  withActiveSpan,
  getTraceContext,
  getActiveTraceId,
  SpanStatusCode,
} from './tracing-core';
export type { Span } from './tracing-core';

// Structured Logger
export {
  logInfo,
  logWarn,
  logError,
  logDebug,
} from './logger';

// API Route Tracing
export { withTracing } from './api-tracing';
