/**
 * @file POST /api/stores/bulk/execute
 * @description Iteración 8 — Execute bulk operation con validación server-side completa.
 *
 * Flujo:
 *   1. Validar admin + CSRF + rate limit
 *   2. Validar rate limit por hora (H-08-02)
 *   3. Insertar bulk_ops_log (auditoría previa — H-08-08)
 *   4. Para delete:
 *      a. Validar confirmation_text === 'BULK_DELETE' (H-08-10)
 *      b. Validar reason (min 10 chars)
 *      c. Validar confirmation_token válido
 *      d. Si hay protegidas: validar override_token
 *      e. Llamar RPC bulk_soft_delete_stores() (atómico — H-08-04)
 *   5. Para activate/deactivate:
 *      a. UPDATE atómico con .in() (H-08-07)
 *   6. Update bulk_ops_log con resultado
 *   7. Retornar resultado
 *
 * SECURITY:
 *   - confirmation_token y override_token NO se loggean
 *   - Re-validación server-side completa (no confía en frontend)
 *   - Auditoría previa y post-completion
 */

import { NextResponse, type NextRequest } from 'next/server';
import { withRole, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { canManageStore } from '@/lib/roles';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const executeSchema = z.object({
  storeIds: z.array(z.string().uuid()).min(1).max(50),
  action: z.enum(['activate', 'deactivate', 'delete', 'archive']),
  confirmation_text: z.string().optional(),
  reason: z.string().optional(),
  confirmation_token: z.string().optional(),
  override_token: z.string().optional(),
}).refine(
  (data) => {
    // Para delete: requerir confirmation_text='BULK_DELETE', reason (min 10), confirmation_token
    if (data.action === 'delete') {
      return data.confirmation_text === 'BULK_DELETE'
        && !!data.reason && data.reason.length >= 10
        && !!data.confirmation_token;
    }
    return true;
  },
  { message: 'Delete requiere confirmation_text=BULK_DELETE, reason (min 10 chars), confirmation_token' }
);

async function executeHandler(req: NextRequest, session: AuthenticatedSession) {
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';

  // Rate limit per minute
  const rlKey = `stores:bulk:execute:${session.user.id}:${clientIp}`;
  const { allowed } = await rateLimit(rlKey, { windowMs: 60_000, maxRequests: 3 });
  if (!allowed) {
    return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });
  }

  if (!validateOrigin(req)) {
    return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const validated = executeSchema.safeParse(body);
  if (!validated.success) {
    const errMsg = validated.error.issues[0]?.message || 'Validation error';
    if (errMsg.includes('BULK_DELETE')) {
      return NextResponse.json(
        { ...createApiError('BULK_CONFIRMATION_TEXT_REQUIRED'), details: errMsg },
        { status: 400 }
      );
    }
    if (errMsg.includes('reason')) {
      return NextResponse.json(
        { ...createApiError('BULK_REASON_REQUIRED'), details: errMsg },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { ...createApiError('INVALID_DATA'), details: validated.error.format() },
      { status: 400 }
    );
  }

  const { storeIds, action, confirmation_text, reason, confirmation_token, override_token } = validated.data;

  // Defensive: filter by canManageStore
  const allowedIds = storeIds.filter(id => canManageStore(session.user, id));
  const deniedIds = storeIds.filter(id => !canManageStore(session.user, id));

  if (allowedIds.length === 0) {
    return NextResponse.json(createApiError('BULK_PERMISSION_DENIED'), { status: 403 });
  }

  const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
  const supabase = getSupabaseAdminSafe();
  if (!supabase) {
    return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });
  }

  // Get user's plan for hourly rate limit
  const { data: profileData } = await supabase
    .from('profiles')
    .select('plan, tenant_id')
    .eq('id', session.user.id)
    .single();

  const plan = (profileData as { plan?: string } | null)?.plan || 'free';
  const tenantId = (profileData as { tenant_id?: string } | null)?.tenant_id || null;

  // H-08-02: Check hourly rate limit
  const { data: hourlyLimit, error: hourlyError } = await supabase.rpc('check_bulk_ops_hourly_limit', {
    p_user_id: session.user.id,
    p_plan: plan,
  });

  if (hourlyError) {
    logger.warn('DATABASE', 'BULK_HOURLY_LIMIT_CHECK_FAILED', { error: hourlyError });
    // Fail-open: if we can't check, allow (logged)
  } else {
    const limit = hourlyLimit as { allowed: boolean; used: number; limit: number; remaining: number };
    if (!limit.allowed) {
      return NextResponse.json(
        { ...createApiError('BULK_RATE_LIMIT_EXCEEDED'), details: { used: limit.used, limit: limit.limit } },
        { status: 429 }
      );
    }
  }

  // H-08-08: Insert bulk_ops_log (auditoría previa)
  const idempotencyKey = req.headers.get('idempotency-key');
  const { data: logEntry } = await supabase
    .from('bulk_ops_log')
    .insert({
      user_id: session.user.id,
      tenant_id: tenantId,
      action,
      store_count: allowedIds.length,
      store_ids: allowedIds,
      initiated_at: new Date().toISOString(),
      status: 'initiated',
      ip_address: clientIp,
      idempotency_key: idempotencyKey || null,
      reason: reason || null,
    })
    .select('id')
    .single();

  const logId = logEntry?.id;

  try {
    let result;

    if (action === 'delete') {
      // H-08-04: Call atomic bulk_soft_delete_stores RPC
      const { data: rpcResult, error: rpcError } = await supabase.rpc('bulk_soft_delete_stores', {
        p_store_ids: allowedIds,
        p_deleted_by: session.user.id,
        p_confirmation_token: confirmation_token!,
        p_override_token: override_token || null,
        p_reason: reason || null,
      });

      if (rpcError) {
        const errMsg = rpcError.message || '';

        // Map RPC errors to API errors
        if (errMsg.includes('ERR_INVALID_CONFIRMATION_TOKEN')) {
          return NextResponse.json(createApiError('BULK_INVALID_CONFIRMATION_TOKEN'), { status: 400 });
        }
        if (errMsg.includes('ERR_OVERRIDE_REQUIRED')) {
          return NextResponse.json(createApiError('BULK_OVERRIDE_REQUIRED'), { status: 403 });
        }
        if (errMsg.includes('ERR_INVALID_OVERRIDE_TOKEN')) {
          return NextResponse.json(createApiError('BULK_INVALID_CONFIRMATION_TOKEN'), { status: 400 });
        }
        if (errMsg.includes('ERR_SAME_USER_OVERRIDE')) {
          return NextResponse.json(createApiError('BULK_SAME_USER_OVERRIDE'), { status: 403 });
        }
        if (errMsg.includes('ERR_STORE_IDS_MISMATCH')) {
          return NextResponse.json(
            { ...createApiError('INVALID_DATA'), message: 'Store IDs no coinciden con el token' },
            { status: 400 }
          );
        }

        logger.error('DATABASE', 'BULK_DELETE_RPC_FAILED', {
          error: errMsg,
          userId: session.user.id,
          // Do NOT log tokens
        });
        return NextResponse.json(createApiError('STORE_DELETE_FAILED'), { status: 500 });
      }

      result = rpcResult as { status: string; processed: number; total_requested: number; errors: unknown[] };

      // Update bulk_ops_log
      if (logId) {
        await supabase
          .from('bulk_ops_log')
          .update({
            completed_at: new Date().toISOString(),
            status: result.status === 'COMPLETED' ? 'completed' : 'failed',
            result: result,
          })
          .eq('id', logId);
      }

      logger.info('DATABASE', 'BULK_DELETE_COMPLETED', {
        userId: session.user.id,
        action,
        storeCount: allowedIds.length,
        processed: result.processed,
        status: result.status,
        // Do NOT log tokens
      });

      if (result.status === 'FAILED') {
        return NextResponse.json(
          { ...createApiError('BULK_STORE_HAS_BLOCKERS'), details: result },
          { status: 409 }
        );
      }

      return NextResponse.json({
        success: true,
        action,
        processed: result.processed,
        total_requested: result.total_requested,
        denied: deniedIds.length,
        audit_log_id: logId,
      });
    }

    if (action === 'activate' || action === 'deactivate') {
      // H-08-07: Atomic UPDATE with .in()
      const isActive = action === 'activate';
      const { data: updatedRows, error: updateError } = await supabase
        .from('stores')
        .update({ is_active: isActive })
        .in('id', allowedIds)
        .select('id');

      if (updateError) {
        logger.error('DATABASE', 'BULK_TOGGLE_FAILED', { error: updateError });
        return NextResponse.json(createApiError('STORE_UPDATE_FAILED'), { status: 500 });
      }

      const affected = updatedRows?.length || 0;

      // Update bulk_ops_log
      if (logId) {
        await supabase
          .from('bulk_ops_log')
          .update({
            completed_at: new Date().toISOString(),
            status: 'completed',
            result: { affected, action },
          })
          .eq('id', logId);
      }

      logger.info('DATABASE', 'BULK_TOGGLE_COMPLETED', {
        userId: session.user.id,
        action,
        storeCount: allowedIds.length,
        affected,
      });

      return NextResponse.json({
        success: true,
        action,
        affected,
        failed: allowedIds.length - affected,
        denied: deniedIds.length,
        audit_log_id: logId,
      });
    }

    if (action === 'archive') {
      // Archive: set is_archived=true, is_active=false (no confirmation token needed)
      const { data: updatedRows, error: updateError } = await supabase
        .from('stores')
        .update({
          is_active: false,
          is_archived: true,
          archived_at: new Date().toISOString(),
          archived_by: session.user.id,
        })
        .in('id', allowedIds)
        .select('id');

      if (updateError) {
        logger.error('DATABASE', 'BULK_ARCHIVE_FAILED', { error: updateError });
        return NextResponse.json(createApiError('STORE_UPDATE_FAILED'), { status: 500 });
      }

      const affected = updatedRows?.length || 0;

      // Update bulk_ops_log
      if (logId) {
        await supabase
          .from('bulk_ops_log')
          .update({
            completed_at: new Date().toISOString(),
            status: 'completed',
            result: { affected, action },
          })
          .eq('id', logId);
      }

      return NextResponse.json({
        success: true,
        action,
        affected,
        failed: allowedIds.length - affected,
        denied: deniedIds.length,
        audit_log_id: logId,
      });
    }

    return NextResponse.json(createApiError('INVALID_DATA'), { status: 400 });
  } catch (error: unknown) {
    // Update bulk_ops_log with failure
    if (logId) {
      await supabase
        .from('bulk_ops_log')
        .update({
          completed_at: new Date().toISOString(),
          status: 'failed',
          result: { error: error instanceof Error ? error.message : 'Unknown error' },
        })
        .eq('id', logId);
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('DATABASE', 'BULK_EXECUTE_UNHANDLED_ERROR', {
      error: message,
      userId: session.user.id,
      action,
    });
    return NextResponse.json(
      { ...createApiError('UNKNOWN_ERROR'), error: message },
      { status: 500 }
    );
  }
}

export const POST = withTracing(
  withRole('admin', executeHandler as Parameters<typeof withRole>[1]) as Parameters<typeof withTracing>[0],
  'POST /api/stores/bulk/execute'
);
