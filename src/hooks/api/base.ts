import { supabase } from '@/lib/supabaseClient';
import type { PostgrestError } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { useUIStore } from '@/store';
import { formatPostgrestUrlToSql, formatRpcToSql } from '@/lib/query-inspector-utils';

/**
 * Normaliza el ID de la tienda para asegurar consistencia entre queryKeys y llamadas RPC.
 * Maneja valores como 'null', 'undefined' o cadenas vacías convirtiéndolos a null real.
 */
export const getCleanStoreId = (storeId?: string | null) => {
  if (storeId === 'null' || storeId === 'undefined' || !storeId) return null;
  return storeId;
};

// Helper to wrap RPC calls with logging
export async function withLogging<T>(
  rpcName: string,
  params: Record<string, unknown>,
  rpcCall: () => PromiseLike<{ data: T | null; error: PostgrestError | null }>,
  view?: string
): Promise<T | null> {
  logger.info('DATABASE', `RPC_CALL_START: ${rpcName}`, params);

  // Update last query for admin inspector
  try {
    const sql = formatRpcToSql(rpcName, params);
    useUIStore.getState().setLastQuery(sql, view);
  } catch (e) {
    // Ignore errors in formatting to not break the app
  }

  try {
    const { data, error } = await rpcCall();
    if (error) {
      throw error;
    }
    logger.info('DATABASE', `RPC_CALL_SUCCESS: ${rpcName}`, params);
    return data;
  } catch (error) {
    // Properly serialize Supabase RPC errors (which are objects, not Error instances)
    const errorDetails = (() => {
      if (!error) return 'Unknown error';
      if (error instanceof Error) return error.message;
      // Supabase PostgREST error shape: { message, code, details, hint }
      const obj = error as Record<string, unknown>;
      const parts: string[] = [];
      if (obj.message) parts.push(String(obj.message));
      if (obj.code) parts.push(`(code: ${obj.code})`);
      if (obj.details) parts.push(String(obj.details));
      if (obj.hint) parts.push(String(obj.hint));
      return parts.length > 0 ? parts.join(' — ') : JSON.stringify(error);
    })();
    logger.error('DATABASE', `RPC_CALL_FAILED: ${rpcName}`, {
      ...params,
      error: errorDetails,
    });
    throw new Error(errorDetails);
  }
}

// Helper to wrap table operations with logging
export async function withTableLogging<T>(
  operation: 'select' | 'insert' | 'update' | 'delete',
  tableName: string,
  query: () => PromiseLike<{ data: T | null; error: PostgrestError | null }>,
  view?: string
): Promise<T | null> {
  const params = { operation, tableName };
  logger.info('DATABASE', `TABLE_OP_START: ${tableName}`, params);

  // Capture builder URL for admin inspector
  const builder = query();
  try {
    // Supabase builders have a internal .url property that we use to format the SQL for the inspector.
    // We use a safe cast here to access it if it exists.
    const builderWithUrl = builder as unknown as { url?: { toString: () => string } };
    if (builderWithUrl?.url) {
      const sql = formatPostgrestUrlToSql(builderWithUrl.url.toString(), operation);
      useUIStore.getState().setLastQuery(sql, view);
    }
  } catch (e) {
    // Ignore errors in formatting
  }

  try {
    const { data, error } = await builder;
    if (error) {
      throw error;
    }
    logger.info('DATABASE', `TABLE_OP_SUCCESS: ${tableName}`, params);
    return data;
  } catch (error) {
    // HARDENING-LOGGING: never serialize error as "[object Object]".
    // PostgREST errors have shape: { message, code, details, hint, status }
    // Capture ALL fields structured-ly for diagnostics.
    const errorDetails = serializeError(error);
    logger.error('DATABASE', `TABLE_OP_FAILED: ${tableName}`, {
      ...params,
      error: errorDetails.summary,
      // Structured fields for post-mortem inspection
      error_code: errorDetails.code,
      error_message: errorDetails.message,
      error_details: errorDetails.details,
      error_hint: errorDetails.hint,
      error_status: errorDetails.status,
    });
    // Re-throw with a proper Error so callers see message correctly via getErrorMsg
    throw new Error(errorDetails.summary);
  }
}

/**
 * Serialize any error (PostgREST, native Error, or plain object) into a
 * structured shape suitable for logging and re-throwing.
 *
 * PostgREST errors look like:
 *   { message: '...', code: '42501'|'23514'|..., details: '...', hint: '...', status: 400 }
 *
 * Native Error instances look like:
 *   { message: '...', name: 'Error', stack: '...' }
 *
 * Plain objects may have anything. We try to extract the most useful fields.
 */
function serializeError(error: unknown): {
  summary: string;
  code?: string | number;
  message?: string;
  details?: string;
  hint?: string;
  status?: number;
} {
  if (!error) {
    return { summary: 'Unknown error (falsy)' };
  }
  if (error instanceof Error) {
    return { summary: error.message, message: error.message };
  }
  // Treat as object — extract standard PostgREST fields if available
  const obj = error as Record<string, unknown>;
  const message = typeof obj.message === 'string' ? obj.message : undefined;
  const code = typeof obj.code === 'string' || typeof obj.code === 'number' ? obj.code : undefined;
  const details = typeof obj.details === 'string' ? obj.details : undefined;
  const hint = typeof obj.hint === 'string' ? obj.hint : undefined;
  const status = typeof obj.status === 'number' ? obj.status : undefined;

  const parts: string[] = [];
  if (message) parts.push(message);
  if (code) parts.push(`(code: ${code})`);
  if (details) parts.push(`details: ${details}`);
  if (hint) parts.push(`hint: ${hint}`);

  // Fallback to JSON.stringify if nothing useful was found
  const summary = parts.length > 0 ? parts.join(' — ') : (() => {
    try { return JSON.stringify(error); } catch { return String(error); }
  })();

  return { summary, code, message, details, hint, status };
}
