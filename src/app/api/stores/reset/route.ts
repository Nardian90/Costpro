import { NextRequest, NextResponse } from 'next/server';
import { withRole, AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { uuidLoose } from '@/validation/api-schemas';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { canManageStore } from '@/lib/roles';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
// FIX-AUDIT-MSTORE-04 (P2): idempotency para evitar doble-tap en reset destructivo
import { withIdempotency } from '@/lib/idempotency';
import type { SupabaseClient } from '@supabase/supabase-js';

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

    // FIX-AUDIT-9.0: mover canManageStore ANTES de getSupabaseAdminSafe().
    // Autorización primero (fail fast), luego instanciar cliente admin.
    // Antes el orden era: admin client → store lookup → canManageStore.
    // Si el cliente admin fallaba (null), devolvía 500 antes del 403.
    if (!canManageStore(session.user, storeId)) {
      return NextResponse.json(
        { ...createApiError('FORBIDDEN'), message: 'No tienes permisos para reiniciar esta tienda' },
        { status: 403 }
      );
    }

    // FIX-AUDIT-SEC (#5): usar getSupabaseAdminSafe() en vez de createClient inline
    const admin = getSupabaseAdminSafe();
    if (!admin) {
      return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });
    }

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

    // FIX-AUDIT-MSTORE-05 (P2): Snapshot pre-reset para recuperación manual.
    // Antes de invocar la RPC que borra los datos, capturamos las tablas afectadas
    // y las guardamos en store_reset_snapshots. Si el volumen es muy grande
    // (>5000 filas combinadas), guardamos solo un resumen agregado (counts por tabla)
    // y logueamos un warning — no bloqueamos el reset por esto.
    //
    // La restauración es MANUAL vía SQL (soporte) por ahora — no se automatiza
    // en esta ronda. El cron de limpieza (borrar snapshots expirados) queda como
    // TODO pendiente (ver PR description).
    try {
      await captureResetSnapshot(admin, storeId, session.user.id, keepCatalog);
    } catch (snapshotErr: unknown) {
      // No bloqueamos el reset si el snapshot falla — pero dejamos rastro
      logger.error('DATABASE', 'RESET_SNAPSHOT_CAPTURE_FAILED', { storeId, error: snapshotErr });
    }

    // FIX-AUDIT-MSTORE-04 (P2): idempotency para evitar doble-tap en reset.
    // TTL 48h (mayor que archive/restore porque reset es más destructivo y el
    // cliente puede tardar en reintentar tras un fallo de red).
    const idemKeyRaw = req.headers.get('idempotency-key');
    const idemKey = idemKeyRaw ? `reset:${session.user.id}:${storeId}:${idemKeyRaw}` : null;

    const { status: idemStatus, body: idemBody, replayed } = await withIdempotency<Record<string, unknown>>(
      idemKey,
      48 * 60 * 60, // 48h
      async () => {
        // Execute the reset via RPC — pasamos p_keep_catalog a la nueva versión de la RPC
        const { error: rpcError } = await admin.rpc('reset_store_data', {
          target_store_id: storeId,
          p_keep_catalog: keepCatalog,
        });

        if (rpcError) {
          logger.error('DATABASE', 'RESET_STORE_FAILED', { storeId, error: rpcError });
          return { status: 500, body: createApiError('STORE_RESET_FAILED') };
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

        return { status: 200, body: { success: true } };
      }
    );

    return NextResponse.json(idemBody, {
      status: idemStatus,
      ...(replayed ? { headers: { 'X-Idempotent-Replay': 'true' } } : {}),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : createApiError('UNKNOWN_ERROR').error;
    return NextResponse.json({ ...createApiError('UNKNOWN_ERROR'), error: message }, { status: 500 });
  }
}

// ── FIX-AUDIT-MSTORE-05: Snapshot helper ────────────────────────────────────
//
// Captura las tablas afectadas por reset_store_data antes de que se borren.
// Si el volumen combinado > 5000 filas, guarda solo un resumen (counts).
const SNAPSHOT_FULL_LIMIT = 5000;

async function captureResetSnapshot(
  admin: SupabaseClient,
  storeId: string,
  userId: string,
  keepCatalog: boolean
): Promise<void> {
  // Tablas que SIEMPRE se borran
  const [productsResult, transactionsResult, stockMovementsResult, receiptsResult] = await Promise.all([
    !keepCatalog
      ? admin.from('products').select('*').eq('store_id', storeId)
      : Promise.resolve({ data: null, error: null }),
    admin.from('transactions').select('*').eq('store_id', storeId),
    admin.from('stock_movements').select('*').eq('store_id', storeId),
    admin.from('receipts').select('*').eq('store_id', storeId),
  ]);

  const products = (productsResult as any).data || [];
  const transactions = (transactionsResult as any).data || [];
  const stockMovements = (stockMovementsResult as any).data || [];
  const receipts = (receiptsResult as any).data || [];

  const totalRows = products.length + transactions.length + stockMovements.length + receipts.length;

  const summary = {
    products: products.length,
    transactions: transactions.length,
    stock_movements: stockMovements.length,
    receipts: receipts.length,
  };

  // Si el volumen es muy grande, guardamos solo el resumen
  const isFull = totalRows <= SNAPSHOT_FULL_LIMIT;
  const snapshot: Record<string, unknown> = {
    summary,
    full: isFull,
    captured_at: new Date().toISOString(),
  };

  if (isFull) {
    if (!keepCatalog) snapshot.products = products;
    snapshot.transactions = transactions;
    snapshot.stock_movements = stockMovements;
    snapshot.receipts = receipts;
  } else {
    logger.warn('DATABASE', 'RESET_SNAPSHOT_TRUNCATED', {
      storeId, totalRows, limit: SNAPSHOT_FULL_LIMIT,
      message: 'Snapshot too large — only summary counts saved, full data not captured',
    });
  }

  const { error: snapError } = await admin.from('store_reset_snapshots').insert({
    store_id: storeId,
    initiated_by: userId,
    keep_catalog: keepCatalog,
    snapshot,
  });

  if (snapError) {
    logger.error('DATABASE', 'RESET_SNAPSHOT_INSERT_FAILED', { storeId, error: snapError });
  } else {
    logger.info('DATABASE', 'RESET_SNAPSHOT_CAPTURED', {
      storeId, keepCatalog, full: isFull, totalRows,
    });
  }
}

export const POST = withTracing(
  withRole('admin', postHandler as Parameters<typeof withRole>[1]),
  'POST /api/stores/reset'
);
