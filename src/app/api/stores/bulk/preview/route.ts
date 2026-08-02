/**
 * @file POST /api/stores/bulk/preview
 * @description Iteración 8 — Preview de operación bulk.
 *
 * Valida dependencias por tienda y retorna información completa para que la UI
 * no tenga que recalcular:
 *   - can_proceed: boolean
 *   - stores: lista de tiendas con su estado
 *   - blockers: dependencias que bloquean el soft-delete por tienda
 *   - protected_stores: storeIds con backup_restore_protected=true
 *   - requires_override: true si hay tiendas protegidas
 *
 * AUTORIZACIÓN:
 *   - Solo admin (withRole)
 *   - canManageStore defensivo por storeId
 *
 * SECURITY: No expone tokens. No modifica datos.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, withRole, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { canManageStore } from '@/lib/roles';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const previewSchema = z.object({
  storeIds: z.array(z.string().uuid()).min(1).max(50),
  action: z.enum(['activate', 'deactivate', 'delete', 'archive']),
});

async function previewHandler(req: NextRequest, session: AuthenticatedSession) {
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  const rlKey = `stores:bulk:preview:${session.user.id}:${clientIp}`;
  const { allowed } = await rateLimit(rlKey, { windowMs: 60_000, maxRequests: 10 });
  if (!allowed) {
    return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });
  }

  if (!validateOrigin(req)) {
    return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const validated = previewSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json(
      { ...createApiError('INVALID_DATA'), details: validated.error.format() },
      { status: 400 }
    );
  }

  const { storeIds, action } = validated.data;

  const allowedIds = storeIds.filter(id => canManageStore(session.user, id));
  const deniedIds = storeIds.filter(id => !canManageStore(session.user, id));

  if (allowedIds.length === 0) {
    return NextResponse.json(
      { ...createApiError('BULK_PERMISSION_DENIED'), denied: deniedIds.length },
      { status: 403 }
    );
  }

  const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
  const supabase = getSupabaseAdminSafe();
  if (!supabase) {
    return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });
  }

  const { data: storesData, error: storesError } = await supabase
    .from('stores')
    .select('id, name, is_active, backup_restore_protected')
    .in('id', allowedIds);

  if (storesError) {
    logger.error('DATABASE', 'BULK_PREVIEW_STORES_FETCH_FAILED', { error: storesError });
    return NextResponse.json(createApiError('STORE_FETCH_FAILED'), { status: 500 });
  }

  const blockers: Array<{
    store_id: string;
    store_name: string;
    blockers: Array<{ type: string; count: number; message: string }>;
  }> = [];

  const protectedStores: string[] = [];
  const stores: Array<{
    id: string;
    name: string;
    is_active: boolean;
    backup_restore_protected: boolean;
    has_blockers: boolean;
  }> = [];

  for (const store of storesData || []) {
    stores.push({
      id: store.id,
      name: store.name,
      is_active: store.is_active,
      backup_restore_protected: store.backup_restore_protected,
      has_blockers: false,
    });

    if (store.backup_restore_protected) {
      protectedStores.push(store.id);
    }

    if (action === 'delete') {
      const { data: validationResult, error: validationError } = await supabase
        .rpc('validate_store_can_be_modified', {
          p_store_id: store.id,
          p_check_type: 'soft_delete',
        });

      if (validationError) {
        logger.warn('DATABASE', 'BULK_PREVIEW_VALIDATION_FAILED', {
          storeId: store.id,
          error: validationError,
        });
        continue;
      }

      const validation = validationResult as { can_modify: boolean; blockers: Array<{ type: string; count: number; message: string }> };
      if (!validation.can_modify && validation.blockers.length > 0) {
        blockers.push({
          store_id: store.id,
          store_name: store.name,
          blockers: validation.blockers,
        });
        const storeEntry = stores.find(s => s.id === store.id);
        if (storeEntry) storeEntry.has_blockers = true;
      }
    }
  }

  const canProceed = blockers.length === 0;
  const requiresOverride = protectedStores.length > 0 && action === 'delete';

  logger.info('DATABASE', 'BULK_PREVIEW_COMPLETED', {
    action,
    storeCount: allowedIds.length,
    blockerCount: blockers.length,
    protectedCount: protectedStores.length,
    userId: session.user.id,
  });

  return NextResponse.json({
    can_proceed: canProceed,
    action,
    stores,
    blockers,
    protected_stores: protectedStores,
    requires_override: requiresOverride,
    requires_confirmation: action === 'delete',
    confirmation_text_required: action === 'delete' ? 'BULK_DELETE' : null,
    denied_count: deniedIds.length,
  });
}

export const POST = withTracing(
  withRole('admin', previewHandler as Parameters<typeof withRole>[1]) as Parameters<typeof withTracing>[0],
  'POST /api/stores/bulk/preview'
);
