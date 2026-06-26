/**
 * withUsageTracking — HOF DEPRECADO (FIX R1).
 *
 * Antes se usaba como wrapper externo: withUsageTracking(withAuth(handler)).
 * Como withAuth ya aplica withAutoTracking internamente, este wrapper causaba
 * DOUBLE COUNTING (cada request se contaba 2x).
 *
 * Mantiene la exportación por compatibilidad con código legacy, pero ahora
 * es un passthrough transparente (sin tracking adicional).
 *
 * Si necesitas tracking manual en una ruta SIN withAuth, usa directamente:
 *   import { usage, maybeFlush } from '@/lib/usage-tracker';
 *   usage.apiRequest(endpoint, latency, isError);
 *   maybeFlush();
 */
import { NextRequest, NextResponse } from 'next/server';
// FIX R3: withCronTracking necesita flush + waitUntil
import { usage, maybeFlush } from '@/lib/usage-tracker';
import { waitUntil } from '@vercel/functions';

type AnyHandler = (req: NextRequest, ...args: any[]) => Promise<Response | NextResponse> | Response | NextResponse;

export function withUsageTracking<T extends AnyHandler>(
  handler: T,
  _options: { service?: string; endpoint?: string } = {},
): T {
  // Passthrough transparente — withAuth aplica tracking internamente
  return handler;
}

/**
 * withCronTracking — HOF para cron jobs que NO usan withAuth (crons usan JWT Vercel).
 *
 * FIX R3: ahora llama maybeFlush() al final para garantizar que el buffer
 * se envíe a Supabase aunque la instancia muera después.
 *
 * FIX R2: integra waitUntil de @vercel/functions para mantener la instancia
 * viva hasta que el flush termine.
 */
export function withCronTracking<T extends AnyHandler>(
  handler: T,
  options: { endpoint?: string } = {},
): T {
  const forcedEndpoint = options.endpoint;

  const wrapped = async (req: NextRequest, ...args: any[]): Promise<Response | NextResponse> => {
    const start = Date.now();
    const endpoint = forcedEndpoint || req.nextUrl?.pathname || '/api/cron/unknown';

    try {
      const response = await handler(req, ...args);
      const latency = Date.now() - start;
      const status = (response as Response).status ?? 200;
      const isError = status >= 500;
      usage.cronInvocation(endpoint, latency, isError);
      // FIX R3+R2: flush con waitUntil para garantizar envío a Supabase
      maybeFlush(waitUntil);
      return response;
    } catch (error) {
      const latency = Date.now() - start;
      usage.cronInvocation(endpoint, latency, true);
      maybeFlush(waitUntil);
      throw error;
    }
  };

  return wrapped as T;
}



