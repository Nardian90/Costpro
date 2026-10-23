/**
 * API route wrapper — higher-order function for Next.js App Router handlers.
 *
 * CP-INFRA-002b (2026-10-23): SIN OpenTelemetry. El wrapper conserva el
 * COMPORTAMIENTO OPERATIVO que la app necesita — logging estructurado de cada
 * request (método, ruta, status, duración) y registro de errores con re-throw —
 * pero ya no crea spans ni importa el SDK de OTel. El coste por request es el
 * mismo que tenía el modo dev anterior (bypass), ahora también en producción.
 *
 * La bandera OTEL_ENABLED pierde efecto: no queda SDK que inicializar.
 *
 * Usage:
 *   import { withTracing } from '@/lib/observability';
 *   async function handler(request: NextRequest) { ... }
 *   export const GET = withTracing(handler, 'GET /api/health');
 */

import type { NextRequest } from 'next/server';
import { logInfo, logError } from './logger';

type RouteHandler = (request: NextRequest, context?: { params?: Promise<Record<string, string | undefined>> }) => Promise<Response>;

/**
 * Higher-order function that wraps a Next.js route handler with structured
 * request logging (espans eliminados — CP-INFRA-002b).
 *
 * @param handler - The original route handler function
 * @param routeName - A descriptive name for the log entry (e.g., 'GET /api/health')
 * @returns A new handler function with structured logging
 */
export function withTracing<T extends RouteHandler>(
  handler: T,
  routeName: string
): T {
  const wrappedHandler = async (request: NextRequest, context?: { params?: Promise<Record<string, string | undefined>> }): Promise<Response> => {
    const url = request.url || 'unknown';
    const method = request.method || 'UNKNOWN';
    const startTime = Date.now();

    try {
      const response = await handler(request, context);

      const statusCode = response.status;
      if (statusCode >= 400) {
        logError(routeName, `Request completed with error status ${statusCode}`, undefined);
      } else {
        const duration = Date.now() - startTime;
        logInfo(routeName, `${method} ${url} → ${statusCode} (${duration}ms)`, {
          method,
          statusCode,
          duration,
        });
      }

      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const duration = Date.now() - startTime;
      logError(routeName, `${method} ${url} failed after ${duration}ms: ${message}`, error);

      // Re-throw to let Next.js handle the error response
      throw error;
    }
  };

  // Type assertion needed because TypeScript can't infer the overloaded T type through the wrapper
  return wrappedHandler as T;
}
