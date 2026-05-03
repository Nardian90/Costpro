/**
 * Lightweight OpenTelemetry tracing operations using only @opentelemetry/api.
 *
 * This module is safe to import anywhere (including Turbopack dev) because
 * @opentelemetry/api is a lightweight, runtime-agnostic API with no Node.js deps.
 *
 * The heavy SDK setup (NodeSDK, exporters, auto-instrumentations) lives in
 * tracing.ts and is only loaded when OTEL_ENABLED=true or in production.
 */

import { trace, SpanStatusCode, SpanKind, type Span, type Tracer } from '@opentelemetry/api';

const SERVICE_NAME = 'costpro-enterprise';
const SERVICE_VERSION = process.env.npm_package_version || '0.2.0';

/**
 * Get the application tracer. Always returns a valid tracer
 * (no-op if SDK wasn't initialized).
 */
export function getTracer(): Tracer {
  return trace.getTracer(SERVICE_NAME, SERVICE_VERSION);
}

/**
 * Start a new span with the given name and optional attributes/kind.
 */
export function startSpan(
  name: string,
  options?: { attributes?: Record<string, string>; kind?: SpanKind }
): Span {
  const t = getTracer();
  return t.startSpan(name, {
    kind: options?.kind ?? SpanKind.INTERNAL,
    attributes: options?.attributes,
  });
}

/**
 * Wrap an async function with an active span that is automatically ended
 * when the function completes (success or error).
 */
export async function withActiveSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: { attributes?: Record<string, string> }
): Promise<T> {
  const t = getTracer();
  return t.startActiveSpan(name, { attributes: options?.attributes }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message });
      span.recordException(error instanceof Error ? error : new Error(message));
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Extract traceId and spanId from the current active span context.
 * Returns empty object if no active span.
 */
export function getTraceContext(): { traceId?: string; spanId?: string } {
  try {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      const spanContext = activeSpan.spanContext();
      if (spanContext && spanContext.traceId && spanContext.spanId) {
        return {
          traceId: spanContext.traceId,
          spanId: spanContext.spanId,
        };
      }
    }
  } catch {
    // Not in a span context — that's fine
  }
  return {};
}

// Re-export commonly used OTel API symbols
export { trace, SpanStatusCode, SpanKind };
export type { Span, Tracer };
