import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAuthClient } from '@/lib/supabaseClient';
import { syncBatchSchema } from '@/validation/schemas';
import { withAuth } from '@/lib/auth-middleware';
import { rateLimit } from '@/lib/rate-limit';
import { validateOrigin } from '@/lib/csrf';
import { withTracing } from '@/lib/observability';
import { createApiError } from '@/lib/api-errors';

export const runtime = 'nodejs';

const handler = withAuth(async (req, session) => {
  if (!validateOrigin(req)) {
    return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
  }

  const clientId = req.headers.get('x-forwarded-for') || session.user.id;
  const { allowed } = await rateLimit(clientId);
  if (!allowed) return new Response(JSON.stringify(createApiError('RATE_LIMITED')), { status: 429 });

  try {
    // FIX-BUG-LOG-008: Removed redundant supabase.auth.getUser() call;
    // withAuth already validates the session and provides session.user.id.
    const supabase = getSupabaseAuthClient(session.token);

    const body = await req.json();
    const batch = syncBatchSchema.parse(body);

    // FIX-SEC-H3: Validate store membership for each operation in the batch
    const isAdmin = (session.user as any).role === 'admin';
    const memberships = (session.user as any).memberships || [];
    const accessibleStoreIds = new Set(
      memberships
        .filter((m: any) => m.status === 'active')
        .map((m: any) => m.store_id)
    );

    if (!isAdmin) {
      for (const op of batch.operations) {
        const opStoreId = op.payload?.p_store_id || op.payload?.store_id;
        if (opStoreId && !accessibleStoreIds.has(opStoreId)) {
          return NextResponse.json(
            { ...createApiError('STORE_ACCESS_DENIED'), operationKey: op.idempotencyKey },
            { status: 403 }
          );
        }
        // FIX-AUDIT-6: Validate destination_store_id for transfer operations
        if (op.entity === 'transfer') {
          const destStoreId = op.payload?.p_destination_store_id || op.payload?.destination_store_id;
          if (destStoreId && !accessibleStoreIds.has(destStoreId)) {
            return NextResponse.json(
              { ...createApiError('STORE_ACCESS_DENIED'), operationKey: op.idempotencyKey, direction: 'destination' },
              { status: 403 }
            );
          }
        }
      }
    }

    const results: unknown[] = [];

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
          user_id: session.user.id,
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
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`Error processing sync operation ${op.idempotencyKey}:`, err);

        // Check for conflicts (this is simplified, depends on error messages/codes)
        const isConflict = errMsg.includes('Duplicate') || (err instanceof Error && (err as any).code === '23505');
        const status = isConflict ? 'conflict' : 'error';

        // Record failure/conflict in sync_log
        await supabase.from('sync_log').upsert({
          idempotency_key: op.idempotencyKey,
          user_id: session.user.id,
          entity: op.entity,
          operation_type: op.operationType,
          status,
          // FIX-SEC-022: Hide internal error details in sync responses
          response_data: { error: (process.env.NODE_ENV !== 'production' || !!process.env.VITEST) ? errMsg : 'Error de sincronización' },
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
          // FIX-SEC-022: Hide internal error details in sync responses
          error: (process.env.NODE_ENV !== 'production' || !!process.env.VITEST) ? errMsg : 'Error de sincronización',
          serverData,
        });
      }
    }

    return NextResponse.json({ results });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('Batch sync error:', err);
    return NextResponse.json(createApiError('INTERNAL_ERROR'), { status: 500 });
  }
});

async function postHandler(req: NextRequest) {
  return handler(req);
}

export const POST = withTracing(postHandler, 'POST /api/sync/batch');
