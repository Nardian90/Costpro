/**
 * Observability barrel export.
 *
 * Import from '@/lib/observability' to get access to structured logging and
 * API route instrumentation utilities.
 *
 * CP-INFRA-002b (2026-10-23): OpenTelemetry retirado del runtime. El barril
 * conserva la MISMA superficie de export (compatibilidad con los ~130
 * importadores de rutas API), pero tracing-core/api-tracing ya no importan
 * @opentelemetry/*: los spans son no-op y withTracing solo hace logging
 * estructurado. Logger, salud y auditoría de negocio permanecen intactos.
 */

// Tracing surface (no-op sin OTel — misma interfaz pública)
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

// API Route wrapper (logging estructurado por request)
export { withTracing } from './api-tracing';
