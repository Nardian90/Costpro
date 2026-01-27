import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';

// Helper to wrap RPC calls with logging
export async function withLogging<T>(
  rpcName: string,
  params: Record<string, unknown>,
  rpcCall: () => PromiseLike<{ data: T | null; error: any }>
): Promise<T> {
  logger.info('DATABASE', `RPC_CALL_START: ${rpcName}`, params);
  try {
    const { data, error } = await rpcCall();
    if (error) {
      throw error;
    }
    logger.info('DATABASE', `RPC_CALL_SUCCESS: ${rpcName}`, params);
    return data as T;
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
  query: () => PromiseLike<{ data: T | null; error: any }>
): Promise<T> {
  const params = { operation, tableName };
  logger.info('DATABASE', `TABLE_OP_START: ${tableName}`, params);
  try {
    const { data, error } = await query();
    if (error) {
      throw error;
    }
    logger.info('DATABASE', `TABLE_OP_SUCCESS: ${tableName}`, params);
    return data as T;
  } catch (error) {
    logger.error('DATABASE', `TABLE_OP_FAILED: ${tableName}`, {
      ...params,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
