import { supabase } from '@/lib/supabaseClient';
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
  rpcCall: () => PromiseLike<{ data: T | null; error: any }>,
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
    logger.error('DATABASE', `RPC_CALL_FAILED: ${rpcName}`, {
      ...params,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// Helper to wrap table operations with logging
export async function withTableLogging<T>(
  operation: 'select' | 'insert' | 'update' | 'delete',
  tableName: string,
  query: () => PromiseLike<{ data: T | null; error: any }>,
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
    logger.error('DATABASE', `TABLE_OP_FAILED: ${tableName}`, {
      ...params,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
