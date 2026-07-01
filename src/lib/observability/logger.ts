/**
 * Structured JSON logger — OpenTelemetry tracing DISABLED.
 *
 * This module provides structured logging without OTel trace correlation.
 * All trace-related fields (traceId, spanId) will be omitted from logs.
 */

// No-op getTraceContext (OTel disabled)
function getTraceContext(): { traceId?: string; spanId?: string } {
  return {};
}

// Local SpanStatusCode (OTel disabled)
const SpanStatusCode = {
  UNSET: 0,
  OK: 1,
  ERROR: 2,
};

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context: string;
  traceId?: string;
  spanId?: string;
  tenantId?: string;
  storeId?: string;
  userId?: string;
  data?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * ANSI color codes for console output (development only).
 */
const COLORS: Record<LogLevel, string> = {
  debug: '\x1b[36m', // cyan
  info: '\x1b[32m',  // green
  warn: '\x1b[33m',  // yellow
  error: '\x1b[31m', // red
};
const RESET = '\x1b[0m';

/**
 * Format a log entry for human-readable console output in development.
 */
function formatConsole(entry: StructuredLogEntry): string {
  const color = COLORS[entry.level];
  const ts = entry.timestamp.slice(11, 23); // HH:MM:SS.mmm
  const ctx = `[${entry.context}]`;
  const traceCtx = entry.traceId ? ` trace=${entry.traceId.slice(0, 8)}` : '';
  const tenantCtx = entry.tenantId ? ` tenant=${entry.tenantId.slice(0, 8)}` : '';
  return `${color}${entry.level.toUpperCase()}${RESET} ${ts} ${ctx}${traceCtx}${tenantCtx} ${entry.message}`;
}

/**
 * Internal: emit a structured log entry.
 */
function emitLog(level: LogLevel, context: string, message: string, data?: Record<string, unknown>, error?: unknown): void {
  const { traceId, spanId } = getTraceContext();

  const entry: StructuredLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
    traceId,
    spanId,
  };

  // Extract security context from data if present
  if (data) {
    if (data.tenantId) entry.tenantId = String(data.tenantId);
    if (data.storeId) entry.storeId = String(data.storeId);
    if (data.userId) entry.userId = String(data.userId);
  }

  if (data && Object.keys(data).length > 0) {
    entry.data = data;
  }

  if (error !== undefined) {
    if (error instanceof Error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    } else {
      entry.error = {
        name: 'UnknownError',
        message: String(error),
      };
    }
  }

  // Always emit JSON to stdout (for log aggregators)
  console.log(JSON.stringify(entry));

  // In development, also emit human-readable colored output
  if (process.env.NODE_ENV !== 'production') {
    console.error(formatConsole(entry));
  }
}

/**
 * Log an info-level message.
 */
export function logInfo(context: string, message: string, data?: Record<string, unknown>): void {
  emitLog('info', context, message, data);
}

/**
 * Log a warning-level message.
 */
export function logWarn(context: string, message: string, data?: Record<string, unknown>): void {
  emitLog('warn', context, message, data);
}

/**
 * Log an error-level message with optional error object.
 */
export function logError(context: string, message: string, error?: unknown): void {
  emitLog('error', context, message, undefined, error);
}

/**
 * Log a security-specific event with mandatory context.
 */
export function logSecurity(context: string, message: string, securityContext: { tenantId: string; userId?: string; storeId?: string; isBreachAttempt?: boolean }): void {
  const level = securityContext.isBreachAttempt ? 'error' : 'info';
  emitLog(level, `SECURITY:${context}`, message, { ...securityContext });
}

/**
 * Log a debug-level message (only emitted when NODE_ENV !== 'production').
 */
export function logDebug(context: string, message: string, data?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'production') {
    return; // Skip debug logs in production
  }
  emitLog('debug', context, message, data);
}

// Re-export SpanStatusCode for convenience (used in api-tracing.ts)
export { SpanStatusCode };
