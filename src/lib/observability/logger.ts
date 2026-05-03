/**
 * Structured JSON logger with OpenTelemetry trace correlation.
 *
 * Supplements the existing src/lib/logger.ts — this module is specifically for
 * the observability stack, providing traceId/spanId context in every log entry.
 *
 * Log levels: debug, info, warn, error
 * Output format: JSON with ISO 8601 timestamps
 * Trace correlation: automatically extracts traceId/spanId from active span context
 */

import { trace, SpanStatusCode } from '@opentelemetry/api';
import { getTraceContext } from './tracing-core';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context: string;
  traceId?: string;
  spanId?: string;
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
  return `${color}${entry.level.toUpperCase()}${RESET} ${ts} ${ctx}${traceCtx} ${entry.message}`;
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
