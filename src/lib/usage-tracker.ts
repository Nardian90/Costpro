/**
 * USAGE TRACKER — Contador en memoria con flush on-request.
 *
 * FIX C3+C4: Arquitectura corregida para Vercel serverless.
 *
 * ANTES (roto en serverless):
 *   - setInterval(60s) + unref() → nunca dispara en cold starts
 *   - Buffer module-level no se agrega entre instancias concurrentes
 *
 * AHORA:
 *   - Sin setInterval — flush on-request con debounce por timestamp
 *   - Toda API route autenticada (vía withAuth) trackea automáticamente
 *   - Al final de cada request, si han pasado >60s desde último flush,
 *     se dispara flush en background (usando waitUntil de Vercel)
 *   - Auto-flush inmediato si se acumulan 100 eventos
 *
 * Métricas capturadas:
 *   - api_request    → contador por endpoint
 *   - function_ms    → suma de latencia (para calcular GB-segundos Vercel)
 *   - error          → contador de errores 5xx
 *   - cron_invocation → contador de ejecuciones de cron
 *   - db_query       → contador de queries Supabase
 *   - bandwidth_bytes → suma de bytes transferidos
 */

interface MetricBuffer {
  count: number;
  sum_value: number;
  bucket_start: string;
  bucket_end: string;
  metric_type: string;
  service: string;
  endpoint: string | null;
}

// Buffer en memoria: Map<bucket_key, MetricBuffer>
const buffer = new Map<string, MetricBuffer>();

let lastFlushAt = Date.now();
let isFlushing = false;
const FLUSH_INTERVAL_MS = 60_000; // 60 segundos — debounce
const FLUSH_THRESHOLD = 100; // flush si acumulamos 100 eventos
let totalBuffered = 0;

/**
 * Devuelve el bucket_start actual (redondeado a 5 min).
 */
function getCurrentBucket(): { start: string; end: string } {
  const now = new Date();
  const bucketMinutes = Math.floor(now.getMinutes() / 5) * 5;
  const start = new Date(now);
  start.setMinutes(bucketMinutes, 0, 0);
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + 5);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

/**
 * Incrementa un contador en memoria. O(1). NO escribe a BD.
 */
export function incrementUsage(
  metric_type: string,
  service: string = 'api',
  endpoint: string | null = null,
  value: number = 0,
): void {
  const bucket = getCurrentBucket();
  const cleanEndpoint = endpoint
    ? endpoint.split('?')[0].split('/').slice(0, 4).join('/')
    : null;

  const key = `${bucket.start}|${metric_type}|${service}|${cleanEndpoint || ''}`;

  const existing = buffer.get(key);
  if (existing) {
    existing.count += 1;
    existing.sum_value += value;
  } else {
    buffer.set(key, {
      bucket_start: bucket.start,
      bucket_end: bucket.end,
      metric_type,
      service,
      endpoint: cleanEndpoint,
      count: 1,
      sum_value: value,
    });
  }

  totalBuffered++;

  // Auto-flush si llegamos al threshold
  if (totalBuffered >= FLUSH_THRESHOLD) {
    void flushUsage();
  }
}

/**
 * FIX C3+C4: Reemplaza setInterval.
 *
 * Llamar al final de cada request. Si han pasado >60s desde el último flush,
 * dispara flush en background. Usa waitUntil internamente si está disponible.
 *
 * Uso típico desde withAuth:
 *   const response = await handler(req, session);
 *   void maybeFlush();  // fire-and-forget, no bloquea la response
 *   return response;
 */
export function maybeFlush(waitUntil?: (promise: Promise<unknown>) => void): void {
  const elapsed = Date.now() - lastFlushAt;
  if (elapsed < FLUSH_INTERVAL_MS) return;
  if (buffer.size === 0) return;
  if (isFlushing) return;

  const flushPromise = flushUsage();

  // Si Vercel pasa waitUntil (desde NextResponse), usarlo para mantener
  // la instancia viva hasta que el flush termine
  if (waitUntil) {
    waitUntil(flushPromise);
  }
  // Si no hay waitUntil, el flush se ejecuta en background pero puede
  // cortarse si la instancia muere — aceptable (filosofía estimación)
}

/**
 * Flush: envía todos los contadores acumulados a Supabase vía RPC atómico.
 * 1 llamada RPC por bucket+métrica (no por evento individual).
 *
 * FIX: usa flag isFlushing para prevenir 2 flushes concurrentes que
 * podrí­an duplicar entradas (race condition entre auto-flush y maybeFlush).
 */
export async function flushUsage(): Promise<{ flushed: number; errors: string[] }> {
  const errors: string[] = [];

  if (isFlushing) {
    return { flushed: 0, errors: ['already flushing'] };
  }

  if (buffer.size === 0) {
    lastFlushAt = Date.now();
    return { flushed: 0, errors };
  }

  isFlushing = true;

  // Snapshot del buffer actual y limpia atómicamente
  const entries = Array.from(buffer.values());
  buffer.clear();
  totalBuffered = 0;
  lastFlushAt = Date.now();

  try {
    // Cargar supabase admin client dinámicamente
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      errors.push('Supabase env vars missing');
      return { flushed: 0, errors };
    }
    const supabaseAdmin = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Enviar cada entrada como 1 RPC call (paralelo con límite de concurrencia)
    const BATCH_SIZE = 10; // FIX B5: aumentado de 5 a 10
    let flushed = 0;
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (entry) => {
          const { error } = await supabaseAdmin.rpc('upsert_usage_aggregate', {
            p_bucket_start: entry.bucket_start,
            p_bucket_end: entry.bucket_end,
            p_metric_type: entry.metric_type,
            p_service: entry.service,
            p_endpoint: entry.endpoint,
            p_count: entry.count,
            p_sum_value: entry.sum_value,
          });
          if (error) throw error;
          return entry.count;
        }),
      );
      for (const r of results) {
        if (r.status === 'fulfilled') {
          flushed += r.value;
        } else {
          errors.push(`Flush error: ${r.reason?.message || r.reason}`);
        }
      }
    }

    return { flushed, errors };
  } catch (e: any) {
    errors.push(`flushUsage outer error: ${e.message}`);
    return { flushed: 0, errors };
  } finally {
    isFlushing = false;
  }
}

/**
 * Devuelve el estado actual del buffer (para debug / dashboard).
 */
export function getBufferStatus(): {
  buffered_entries: number;
  buffered_count: number;
  last_flush_ms_ago: number;
  next_flush_in_ms: number;
  is_flushing: boolean;
} {
  return {
    buffered_entries: buffer.size,
    buffered_count: totalBuffered,
    last_flush_ms_ago: Date.now() - lastFlushAt,
    next_flush_in_ms: Math.max(0, FLUSH_INTERVAL_MS - (Date.now() - lastFlushAt)),
    is_flushing: isFlushing,
  };
}

/**
 * Convenience helpers para métricas comunes.
 */
export const usage = {
  /** Registra una request API con su latencia. */
  apiRequest(endpoint: string, latencyMs: number, isError: boolean = false): void {
    incrementUsage('api_request', 'api', endpoint, 0);
    incrementUsage('function_ms', 'api', endpoint, latencyMs);
    if (isError) {
      incrementUsage('error', 'api', endpoint, 0);
    }
  },

  /** Registra una invocación de cron job. */
  cronInvocation(path: string, latencyMs: number, isError: boolean = false): void {
    incrementUsage('cron_invocation', 'cron', path, 0);
    incrementUsage('function_ms', 'cron', path, latencyMs);
    if (isError) {
      incrementUsage('error', 'cron', path, 0);
    }
  },

  /** Registra una query a Supabase (estimación). */
  dbQuery(tableOrRpc: string, latencyMs: number): void {
    incrementUsage('db_query', 'db', tableOrRpc, latencyMs);
  },

  /** Registra bandwidth (bytes) en una respuesta. */
  bandwidth(bytes: number, endpoint: string): void {
    incrementUsage('bandwidth_bytes', 'api', endpoint, bytes);
  },
};
