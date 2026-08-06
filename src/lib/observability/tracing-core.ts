/**
 * Iteración 11.5 — Real OpenTelemetry tracing core (replaces no-op)
 *
 * Uses @opentelemetry/api for span management.
 * In development: remains no-op (OTEL_ENABLED must be 'true' to activate).
 */

import { trace, context, SpanStatusCode as OtelSpanStatusCode } from '@opentelemetry/api';

// Re-export for compatibility
export { OtelSpanStatusCode as SpanStatusCode };

export interface Span {
  setAttribute(key: string, value: unknown): Span;
  setAttributes(attrs: Record<string, unknown>): Span;
  setStatus(status: { code: number; message?: string }): Span;
  recordException(exception: Error | string): Span;
  addEvent(name: string, attributes?: Record<string, unknown>): Span;
  end(): void;
  isRecording(): boolean;
  spanContext(): { traceId: string; spanId: string };
}

const isTracingEnabled = (): boolean => {
  return process.env.NODE_ENV === 'production' || process.env.OTEL_ENABLED === 'true';
};

export function getTracer() {
  return trace.getTracer('costpro');
}

export function startSpan(name: string, options?: Record<string, unknown>): Span {
  if (!isTracingEnabled()) {
    // Return no-op span in dev
    return {
      setAttribute() { return this; },
      setAttributes() { return this; },
      setStatus() { return this; },
      recordException() { return this; },
      addEvent() { return this; },
      end() {},
      isRecording() { return false; },
      spanContext() { return { traceId: '', spanId: '' }; },
    };
  }
  return getTracer().startSpan(name, options) as unknown as Span;
}

export function withActiveSpan<T>(
  name: string,
  options: Record<string, unknown>,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  if (!isTracingEnabled()) {
    // Dev: just call fn with a no-op span
    const noOpSpan: Span = {
      setAttribute() { return this; },
      setAttributes() { return this; },
      setStatus() { return this; },
      recordException() { return this; },
      addEvent() { return this; },
      end() {},
      isRecording() { return false; },
      spanContext() { return { traceId: '', spanId: '' }; },
    };
    return fn(noOpSpan);
  }
  return getTracer().startActiveSpan(name, options, async (otelSpan) => {
    return fn(otelSpan as unknown as Span);
  });
}

export function getTraceContext(): { traceId?: string; spanId?: string } {
  if (!isTracingEnabled()) return {};
  const span = trace.getSpan(context.active());
  if (!span) return {};
  const ctx = span.spanContext();
  return {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
  };
}

export function getActiveTraceId(): string | null {
  const { traceId } = getTraceContext();
  return traceId || null;
}
