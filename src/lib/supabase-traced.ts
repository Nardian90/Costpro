/**
 * Iteración 11.5 — Wrapper for Supabase client rpc() with OpenTelemetry spans
 *
 * Uses Proxy to intercept ONLY the rpc() method. All other methods
 * (from, auth, channel, etc.) are delegated to the original client.
 *
 * In development: returns the client unmodified (zero overhead).
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { sanitizeAttributes } from './observability/sanitizer';

type RpcFunction = SupabaseClient['rpc'];

export function wrapRpcWithTracing<T extends SupabaseClient>(client: T): T {
  if (process.env.NODE_ENV === 'development' && process.env.OTEL_ENABLED !== 'true') {
    return client;
  }

  const originalRpc = client.rpc.bind(client);
  const tracer = trace.getTracer('costpro');

  const wrappedRpc: RpcFunction = (fn, args, options) => {
    return tracer.startActiveSpan(`rpc.${fn}`, {
      attributes: {
        'rpc.system': 'supabase',
        'rpc.method': fn,
        'rpc.params': JSON.stringify(sanitizeAttributes(args || {})),
      },
    }, async (span) => {
      try {
        const result = await originalRpc(fn, args, options);
        if (result.error) {
          span.setAttribute('rpc.error', result.error.message);
          span.setStatus({ code: SpanStatusCode.ERROR, message: result.error.message });
        } else {
          span.setAttribute('rpc.success', true);
        }
        return result;
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
        throw err;
      } finally {
        span.end();
      }
    }) as unknown as ReturnType<RpcFunction>;
  };

  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'rpc') {
        return wrappedRpc;
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as T;
}
