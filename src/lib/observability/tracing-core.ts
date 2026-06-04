/**
 * No-op tracing module — OpenTelemetry DISABLED.
 *
 * All functions are no-ops that return safe empty/fallback values.
 * This module was originally backed by @opentelemetry/api but has been
 * disabled because the OTel SDK is not installed in this environment.
 *
 * Replace with real OTel implementation if SDK packages are added.
 */

// No-op types
export interface NoOpSpan {
  setAttribute(key: string, value: unknown): this;
  setAttributes(attrs: Record<string, unknown>): this;
  setStatus(status: { code: number; message?: string }): this;
  recordException(exception: Error): this;
  addEvent(name: string, attributes?: Record<string, unknown>): this;
  end(): void;
  isRecording(): boolean;
  spanContext(): { traceId: string; spanId: string };
}

export interface NoOpTracer {
  startSpan(name: string, options?: Record<string, unknown>): NoOpSpan;
  startActiveSpan(name: string, options: Record<string, unknown>, fn: (span: NoOpSpan) => Promise<unknown>): Promise<unknown>;
}

const noOpSpan: NoOpSpan = {
  setAttribute() { return this; },
  setAttributes() { return this; },
  setStatus() { return this; },
  recordException() { return this; },
  addEvent() { return this; },
  end() {},
  isRecording() { return false; },
  spanContext() { return { traceId: '', spanId: '' }; },
};

const noOpTracer: NoOpTracer = {
  startSpan() { return noOpSpan; },
  startActiveSpan(_name: string, _opts: Record<string, unknown>, fn: (span: NoOpSpan) => Promise<unknown>) {
    return fn(noOpSpan);
  },
};

/** No-op SpanStatusCode values (matching OTel API constants) */
export const SpanStatusCode = {
  UNSET: 0,
  OK: 1,
  ERROR: 2,
};

/** No-op SpanKind values (matching OTel API constants) */
export const SpanKind = {
  INTERNAL: 0,
  SERVER: 1,
  CLIENT: 2,
  PRODUCER: 3,
  CONSUMER: 4,
};

/** No-op trace object */
export const trace = {
  getTracer() { return noOpTracer; },
  getActiveSpan() { return undefined; },
};

/** Always returns the no-op tracer */
export function getTracer(): NoOpTracer {
  return noOpTracer;
}

/** Returns a no-op span */
export function startSpan(_name: string, _options?: Record<string, unknown>): NoOpSpan {
  return noOpSpan;
}

/** Wraps fn with a no-op span — just calls fn directly */
export async function withActiveSpan<T>(
  _name: string,
  fn: (span: NoOpSpan) => Promise<T>,
  _options?: Record<string, unknown>
): Promise<T> {
  return fn(noOpSpan);
}

/** Returns empty trace context */
export function getTraceContext(): { traceId?: string; spanId?: string } {
  return {};
}

export type Span = NoOpSpan;
export type Tracer = NoOpTracer;
