/**
 * CP-INFRA-002b (2026-10-23) — Tracing core SIN OpenTelemetry.
 *
 * Retirada efectiva de OTel del runtime: el SDK @opentelemetry/* fue eliminado
 * de package.json y de serverExternalPackages. Este módulo conserva la MISMA
 * interfaz pública (getTracer, startSpan, withActiveSpan, getTraceContext,
 * getActiveTraceId, SpanStatusCode, Span) para no alterar los ~130 importadores
 * del barril @/lib/observability, pero todas las operaciones son no-op con
 * coste cero — no queda ningún import de @opentelemetry en el grafo runtime.
 *
 * El logging estructurado (logger.ts), la salud (/api/health, system-health),
 * la auditoría de negocio y los mensajes de error NO se ven afectados.
 *
 * Reactivación de OTel (si el propietario la pidiera algún día):
 *   1. git revert de esta misión (restaura tracing-core/api-tracing/tracing.ts
 *      reales + src/instrumentation.ts + los 5 paquetes @opentelemetry/*).
 *   2. bun install.
 *   3. Restaurar serverExternalPackages en next.config.ts.
 * Ver docs/CP-INFRA-002-REACTIVACION.md.
 */

// Códigos de estado canónicos (los valores numéricos preservan la semántica
// OTel: 1 = OK / UNSET, 2 = ERROR) para que el tipo del contrato no cambie.
export enum SpanStatusCode {
  UNSET = 0,
  OK = 1,
  ERROR = 2,
}

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

/** Span no-op compartido (singleton — el coste por request es nulo). */
const NOOP_SPAN: Span = {
  setAttribute() { return NOOP_SPAN; },
  setAttributes() { return NOOP_SPAN; },
  setStatus() { return NOOP_SPAN; },
  recordException() { return NOOP_SPAN; },
  addEvent() { return NOOP_SPAN; },
  end() {},
  isRecording() { return false; },
  spanContext() { return { traceId: '', spanId: '' }; },
};

/** Tracer no-op — ya no existe SDK subyacente. */
export function getTracer(): { startSpan(): Span } {
  return { startSpan: () => NOOP_SPAN };
}

export function startSpan(_name: string, _options?: Record<string, unknown>): Span {
  return NOOP_SPAN;
}

export async function withActiveSpan<T>(
  _name: string,
  _options: Record<string, unknown>,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  // Sin OTel: ejecutar fn directamente con el span no-op (coste cero).
  return fn(NOOP_SPAN);
}

export function getTraceContext(): { traceId?: string; spanId?: string } {
  // Sin OTel no existe trace distribuido — se omite el campo en los logs.
  return {};
}

export function getActiveTraceId(): string | null {
  return null;
}
