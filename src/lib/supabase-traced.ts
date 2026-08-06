/**
 * Iteración 11.5 — Wrapper for Supabase client rpc() with OpenTelemetry spans
 *
 * Uses Proxy to intercept ONLY the rpc() method. All other methods
 * (from, auth, channel, etc.) are delegated to the original client.
 *
 * In development: returns the client unmodified (zero overhead) — unless
 * OTEL_ENABLED=true is set explicitly (hot-test mode).
 *
 * Hot-test patch (Iteración 11.5): post-hoc UPDATE on audit_logs.trace_id
 * for the 5 critical RPCs. The trigger-based approach (migration
 * 20260811000002) doesn't work in Supabase because PostgREST uses
 * transaction-level pooling and the `app.trace_id` GUC set via
 * `set_config(..., false)` doesn't reliably persist across HTTP requests.
 * The `Settings` header is also not honored by Supabase's PostgREST.
 *
 * The post-hoc UPDATE is reliable because:
 * - It uses the record_id from the RPC result/input (known after RPC completes)
 * - It only updates rows WHERE trace_id IS NULL (idempotent)
 * - It uses the admin client (bypasses RLS) so it works for both admin and auth sessions
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { sanitizeAttributes } from './observability/sanitizer';
import { getSupabaseAdminSafe } from './supabase-admin';

type RpcFunction = SupabaseClient['rpc'];

/**
 * Mapping of critical RPC names → record_id extraction strategy.
 * - 'result:<field>' → extract record_id from result.data[field]
 * - 'args:<field>'   → extract record_id from args[field]
 *
 * Derived from inspection of each RPC's INSERT INTO audit_logs statement
 * (the `record_id` column value tells us which ID is logged).
 */
const RPC_RECORD_ID_STRATEGY: Record<string, string> = {
  // create_sale_v2: INSERT ... VALUES (..., v_tx_id, ...) → returns { transaction_id: v_tx_id }
  'create_sale_v2': 'result:transaction_id',
  // reverse_transaction_v2: INSERT ... VALUES (..., p_transaction_id, ...) → input param
  'reverse_transaction_v2': 'args:p_transaction_id',
  // void_transaction: INSERT ... VALUES (..., p_transaction_id, ...) → input param
  'void_transaction': 'args:p_transaction_id',
  // close_cash_shift: INSERT ... VALUES (..., p_closure_id, ...) → input param
  'close_cash_shift': 'args:p_closure_id',
  // create_devolution_v2: INSERT ... VALUES (..., v_devolution_id, ...) → returns { devolution_id: v_devolution_id }
  'create_devolution_v2': 'result:devolution_id',
};

/**
 * Best-effort post-hoc UPDATE of audit_logs.trace_id.
 * Called after critical RPCs complete successfully.
 * Never throws — if the UPDATE fails, the RPC result is still returned.
 */
async function updateAuditLogTraceId(rpcName: string, args: Record<string, unknown> | undefined, result: unknown, traceId: string): Promise<void> {
  const strategy = RPC_RECORD_ID_STRATEGY[rpcName];
  if (!strategy) return;

  let recordId: string | undefined;
  try {
    if (strategy.startsWith('result:')) {
      const field = strategy.substring('result:'.length);
      const data = (result as { data?: unknown }).data;
      if (data && typeof data === 'object') {
        recordId = (data as Record<string, unknown>)[field] as string | undefined;
        // Some RPCs return an array
        if (!recordId && Array.isArray(data) && data.length > 0) {
          recordId = (data[0] as Record<string, unknown>)[field] as string | undefined;
        }
      }
    } else if (strategy.startsWith('args:')) {
      const field = strategy.substring('args:'.length);
      recordId = (args as Record<string, unknown> | undefined)?.[field] as string | undefined;
    }
  } catch {
    return; // best effort
  }

  if (!recordId || typeof recordId !== 'string') return;

  try {
    const admin = getSupabaseAdminSafe();
    if (!admin) return;
    // Only update rows created in the last 10 seconds — prevents updating
    // old audit_log entries that happen to share the same record_id (e.g.
    // the original CREATE_SALE_V2 entry when reversing a sale 8 min later).
    const tenSecondsAgo = new Date(Date.now() - 10_000).toISOString();
    await admin
      .from('audit_logs')
      .update({ trace_id: traceId })
      .eq('record_id', recordId)
      .is('trace_id', null)
      .gt('created_at', tenSecondsAgo);
  } catch {
    // best effort — don't fail the RPC
  }
}

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
          // Hot-test patch: post-hoc UPDATE audit_logs.trace_id for critical RPCs
          const traceId = span.spanContext().traceId;
          if (traceId && RPC_RECORD_ID_STRATEGY[fn]) {
            await updateAuditLogTraceId(fn, args, result, traceId);
          }
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
