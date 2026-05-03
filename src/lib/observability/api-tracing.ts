/**
 * API route tracing middleware — higher-order function for Next.js App Router handlers.
 *
 * Wraps any Next.js route handler (GET, POST, PUT, DELETE, etc.) with:
 * - An OpenTelemetry span named after the route
 * - HTTP attributes (method, route, url, status_code)
 * - Automatic error recording and span status setting
 * - Structured log correlation via the observability logger
 *
 * Uses tracing-core.ts (lightweight @opentelemetry/api only) for span operations.
 * The heavy SDK setup is handled by instrumentation.ts + tracing.ts.
 *
 * Usage:
 *   import { withTracing } from '@/lib/observability';
 *
 *   async function handler(request: NextRequest) { ... }
 *   export const GET = withTracing(handler, 'GET /api/health');
 */

import type { NextRequest } from 'next/server';
import { withActiveSpan, SpanStatusCode } from './tracing-core';
import { logInfo, logError } from './logger';

type RouteHandler = (request: NextRequest, context?: { params?: Promise<Record<string, string | undefined>> }) => Promise<Response>;

/**
 * Higher-order function that wraps a Next.js route handler with distributed tracing.
 *
 * @param handler - The original route handler function
 * @param routeName - A descriptive name for the span (e.g., 'GET /api/health')
 * @returns A new handler function with tracing instrumentation
 */
export function withTracing<T extends RouteHandler>(
  handler: T,
  routeName: string
): T {
  const wrappedHandler = async (request: NextRequest, context?: { params?: Promise<Record<string, string | undefined>> }): Promise<Response> => {
    const url = request.url || 'unknown';
    const method = request.method || 'UNKNOWN';

    return withActiveSpan(
      `${routeName}`,
      async (span) => {
        // Set span attributes
        span.setAttributes({
          'http.method': method,
          'http.route': routeName,
          'http.url': url,
          'http.target': new URL(url).pathname,
          'component': 'api-route',
          'route.name': routeName,
        });

        const startTime = Date.now();

        try {
          const response = await handler(request, context);

          // Record response status code
          const statusCode = response.status;
          span.setAttribute('http.status_code', statusCode);

          if (statusCode >= 400) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: `HTTP ${statusCode}`,
            });
            logError(routeName, `Request completed with error status ${statusCode}`, undefined);
          } else {
            span.setStatus({ code: SpanStatusCode.OK });
          }

          const duration = Date.now() - startTime;
          logInfo(routeName, `${method} ${url} → ${statusCode} (${duration}ms)`, {
            method,
            statusCode,
            duration,
          });

          return response;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const duration = Date.now() - startTime;

          span.setStatus({
            code: SpanStatusCode.ERROR,
            message,
          });

          span.recordException(error instanceof Error ? error : new Error(message));
          span.setAttribute('http.status_code', 500);

          logError(routeName, `${method} ${url} failed after ${duration}ms: ${message}`, error);

          // Re-throw to let Next.js handle the error response
          throw error;
        }
      },
    );
  };

  // Type assertion needed because TypeScript can't infer the overloaded T type through the wrapper
  return wrappedHandler as T;
}
