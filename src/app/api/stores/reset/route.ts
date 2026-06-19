import { NextRequest, NextResponse } from 'next/server';
import { withRole, AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { uuidLoose } from '@/validation/api-schemas';
import { z } from 'zod';
import { logger } from '@/lib/logger';

const resetStoreSchema = z.object({
  storeId: uuidLoose,
  // Reset-Flow-Fix: parámetro opcional para mantener el catálogo de productos.
  // Si true: mantiene products + product_variants pero resetea stock a 0.
  // Si false (default): borra TODO incluyendo catálogo.
  // Usuarios y memberships NUNCA se tocan en ningún caso.
  keepCatalog: z.boolean().optional().default(false),
});

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    // Rate limit: 2 resets per minute (very destructive operation)
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    const rlKey = `stores:reset:${session.user.id}:${clientIp}`;
    const { allowed } = await rateLimit(rlKey, { windowMs: 60_000, maxRequests: 2 });
    if (!allowed) {
      return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });
    }

    // CSRF validation — critical for destructive operations
    if (!validateOrigin(req)) {
      return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
    }

    const body = await req.json();
    const validated = resetStoreSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { ...createApiError('INVALID_DATA'), details: validated.error.format() },
        { status: 400 }
      );
    }

    const { storeId, keepCatalog } = validated.data;

    // Create admin Supabase client
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });
    }
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

    // Verify the store exists and is active before resetting
    const { data: storeData, error: storeLookupError } = await admin
      .from('stores')
      .select('id, is_active, name')
      .eq('id', storeId)
      .single();

    if (storeLookupError || !storeData) {
      return NextResponse.json(createApiError('STORE_NOT_FOUND'), { status: 404 });
    }

    if (!storeData.is_active) {
      return NextResponse.json(
        { ...createApiError('STORE_ALREADY_INACTIVE'), message: 'La tienda está desactivada y no puede ser reiniciada' },
        { status: 400 }
      );
    }

    // Check that the user is an active member of the store (unless global admin)
    const isAdmin = session.user.role === 'admin';
    if (!isAdmin) {
      const memberships = session.user.memberships || [];
      const hasStoreMembership = memberships.some(
        m => m.store_id === storeId && m.status === 'active' && ['admin', 'manager', 'encargado'].includes(m.role)
      );
      if (!hasStoreMembership) {
        return NextResponse.json(
          { ...createApiError('FORBIDDEN'), message: 'No tienes permisos para reiniciar esta tienda' },
          { status: 403 }
        );
      }
    }

    logger.info('DATABASE', 'RESET_STORE_INITIATED', { storeId, userId: session.user.id, keepCatalog });

    // FIX MEDIUM-004: Notify active users of the store before resetting
    try {
      const { data: activeSessions } = await admin
        .from('user_store_memberships')
        .select('user_id, profiles!inner(full_name, email)')
        .eq('store_id', storeId)
        .eq('status', 'active');

      if (activeSessions && activeSessions.length > 0) {
        const notifications = activeSessions.map((m: { user_id: string }) => ({
          user_id: m.user_id,
          store_id: storeId,
          type: 'store_reset_warning',
          title: 'Reinicio de Tienda Programado',
          message: keepCatalog
            ? 'La tienda está siendo reiniciada. Se borrarán ventas, recepciones, movimientos y cierres de turno. El catálogo de productos se mantendrá. Por favor guarda tu trabajo y recarga la página.'
            : 'La tienda está siendo reiniciada. Todos los datos (incluyendo catálogo, ventas, recepciones y movimientos) serán eliminados. Por favor guarda tu trabajo y recarga la página.',
          is_read: false,
        }));

        const { error: notifError } = await admin
          .from('store_notifications')
          .insert(notifications);

        if (notifError) {
          logger.warn('DATABASE', 'RESET_NOTIFICATION_FAILED', { storeId, error: notifError });
        } else {
          logger.info('DATABASE', 'RESET_NOTIFICATIONS_SENT', { storeId, count: activeSessions.length });
        }
      }
    } catch (notifErr: unknown) {
      logger.warn('DATABASE', 'RESET_NOTIFICATION_EXCEPTION', { storeId, error: notifErr });
    }

    // Audit log: reset initiated
    try {
      await admin.from('audit_logs').insert({
        action: 'store_reset_initiated',
        table_name: 'stores',
        record_id: storeId,
        store_id: storeId,
        metadata: {
          initiated_at: new Date().toISOString(),
          initiated_by: session.user.id,
          keep_catalog: keepCatalog,
          warning: keepCatalog
            ? 'Store reset initiated — catalog preserved, all operational data deleted'
            : 'Full store data reset initiated by admin — all historical data including catalog will be deleted',
        },
      });
    } catch (auditErr: unknown) {
      logger.error('DATABASE', 'RESET_AUDIT_SNAPSHOT_FAILED', { storeId, error: auditErr });
    }

    // Execute the reset via RPC — pasamos p_keep_catalog a la nueva versión de la RPC
    const { error: rpcError } = await admin.rpc('reset_store_data', {
      target_store_id: storeId,
      p_keep_catalog: keepCatalog,
    });

    if (rpcError) {
      logger.error('DATABASE', 'RESET_STORE_FAILED', { storeId, error: rpcError });
      return NextResponse.json(
        createApiError('STORE_RESET_FAILED', rpcError.message),
        { status: 500 }
      );
    }

    // Audit log: reset completed
    try {
      await admin.from('audit_logs').insert({
        action: 'store_reset_completed',
        table_name: 'stores',
        record_id: storeId,
        store_id: storeId,
        metadata: {
          completed_at: new Date().toISOString(),
          initiated_by: session.user.id,
        },
      });
    } catch (auditErr: unknown) {
      logger.error('DATABASE', 'RESET_AUDIT_COMPLETE_FAILED', { storeId, error: auditErr });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : createApiError('UNKNOWN_ERROR').error;
    return NextResponse.json({ ...createApiError('UNKNOWN_ERROR'), error: message }, { status: 500 });
  }
}

export const POST = withTracing(
  withRole('admin', postHandler as Parameters<typeof withRole>[1]),
  'POST /api/stores/reset'
);
