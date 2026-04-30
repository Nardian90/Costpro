import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAuthClient } from '@/lib/supabaseClient';
import { syncBatchSchema } from '@/validation/schemas';
import { withAuth } from '@/lib/auth-middleware';

export const runtime = 'nodejs';

const handler = withAuth(async (req, session) => {
  try {
    const supabase = getSupabaseAuthClient(session.token);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const batch = syncBatchSchema.parse(body);

    const results = [];

    for (const op of batch.operations) {
      // 1. Check idempotency
      const { data: existingLog } = await supabase
        .from('sync_log')
        .select('*')
        .eq('idempotency_key', op.idempotencyKey)
        .single();

      if (existingLog) {
        if (existingLog.status === 'ok') {
          results.push({
            idempotencyKey: op.idempotencyKey,
            status: 'ok',
            serverId: existingLog.response_data?.id,
            serverData: existingLog.response_data,
          });
          continue;
        }
        // If it failed before, we retry
      }

      // 2. Execute operation
      let result;
      try {
        switch (op.entity) {
          case 'sale':
            result = await supabase.rpc('create_sale', op.payload);
            break;
          case 'reception':
            result = await supabase.rpc('register_reception', op.payload);
            break;
          case 'adjustment':
            result = await supabase.rpc('perform_inventory_adjustment', op.payload);
            break;
          case 'transfer':
            result = await supabase.rpc('create_transfer', op.payload);
            break;
          default:
            throw new Error(`Unknown entity: ${op.entity}`);
        }

        if (result.error) throw result.error;

        // 3. Record success in sync_log
        await supabase.from('sync_log').upsert({
          idempotency_key: op.idempotencyKey,
          user_id: user.id,
          entity: op.entity,
          operation_type: op.operationType,
          status: 'ok',
          response_data: { id: result.data },
          store_id: op.payload.p_store_id || null,
        });

        results.push({
          idempotencyKey: op.idempotencyKey,
          status: 'ok',
          serverId: result.data,
        });
      } catch (err: any) {
        console.error(`Error processing sync operation ${op.idempotencyKey}:`, err);

        // Check for conflicts (this is simplified, depends on error messages/codes)
        const isConflict = err.message?.includes('Duplicate') || err.code === '23505';
        const status = isConflict ? 'conflict' : 'error';

        // Record failure/conflict in sync_log
        await supabase.from('sync_log').upsert({
          idempotency_key: op.idempotencyKey,
          user_id: user.id,
          entity: op.entity,
          operation_type: op.operationType,
          status,
          response_data: { error: err.message, code: err.code },
          store_id: op.payload.p_store_id || null,
        });

        let serverData = null;
        if (isConflict) {
          try {
            if (op.entity === 'reception') {
              const { data } = await supabase.from('receipts')
                .select('*, items:receipt_items(*)')
                .eq('reference_doc', `${op.payload.p_supplier} | ${op.payload.p_invoice_number}`)
                .maybeSingle();
              serverData = data;
            }
          } catch (fetchErr) {
            logger.warn('DATABASE', 'FAILED_TO_FETCH_SERVER_DATA_FOR_CONFLICT:', { data: fetchErr })
          }
        }

        results.push({
          idempotencyKey: op.idempotencyKey,
          status,
          error: err.message,
          serverData,
        });
      }
    }

    return NextResponse.json({ results });
  } catch (err: any) {
    console.error('Batch sync error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
});

export async function POST(req: NextRequest) {
  return handler(req);
}
