import { isAdminLevel } from '@/lib/roles';
import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminSafe as getSupabaseAdmin } from '@/lib/supabase-admin';
import { withAuth } from '@/lib/auth-middleware';
import { rateLimit } from '@/lib/rate-limit';
import { validateOrigin } from '@/lib/csrf';
import { withTracing } from '@/lib/observability';
import { createApiError } from '@/lib/api-errors';
// CP-SEC-019: validadores UUID permisivos (resilientUuid) — prohibido el
// uuid estricto de zod en src/app/api (uuid-loose-central-contract).
import { optionalResilientUuid } from '@/validation/schemas';
import { z } from 'zod';

export const runtime = 'nodejs';

/**
 * CP-POS-002 (D4, acción 3) — Descarte AUDITADO de una venta en conflicto.
 * ============================================================================
 * Reglas de la misión (§6 D4):
 *   · Solo supervisor o administrador — el rol se verifica EN EL SERVIDOR
 *     con la sesión autenticada (jamás un rol enviado por el cliente).
 *   · Motivo obligatorio (10-500 chars).
 *   · Mecanismo de auditoría EXISTENTE: audit_logs (mismo patrón que
 *     sale_negative_rejected en /api/pos/checkout). Sin registro
 *     paralelo nuevo.
 *   · El evento NO registra nombres, teléfonos, direcciones ni el payload
 *     comercial completo — solo id de operación, entidad, código de error
 *     y el motivo humano.
 *   · El descarte se CONFIRMA solo después de que la auditoría se registró:
 *     si falla la auditoría, la respuesta es error y el cliente CONSERVA
 *     la venta en conflicto (fail-closed — ninguna venta desaparece
 *     silenciosamente).
 *
 * Nota de alcance: la operación vive en la COLA LOCAL del dispositivo del
 * cajero; este endpoint valida la AUTORIZACIÓN y deja la evidencia
 * server-side. El cliente, tras 200, marca la op como 'discarded' local.
 * Si el cliente muere entre la auditoría y el marcado local, la operación
 * local queda en conflicto y un nuevo descarte simplemente reaudita (la
 * auditoría es append-only por diseño).
 */
const discardSchema = z.object({
  /** IdempotencyKey de la operación en la cola local (UUID). */
  operationKey: z.string().regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'operationKey debe ser el UUID de la operación en cola',
  ),
  storeId: optionalResilientUuid,
  entity: z.enum(['sale', 'reception', 'adjustment', 'transfer']).default('sale'),
  /** Código canónico del conflicto (ERR_*, para la trazabilidad del evento). */
  errorCode: z.string().max(120).optional(),
  reason: z
    .string()
    .trim()
    .min(10, 'El motivo es obligatorio (mínimo 10 caracteres)')
    .max(500, 'El motivo no puede exceder 500 caracteres'),
});

const handler = withAuth(async (req: NextRequest, session) => {
  if (!validateOrigin(req)) {
    return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
  }

  const clientId = req.headers.get('x-forwarded-for') || session.user.id;
  const { allowed } = await rateLimit(clientId);
  if (!allowed) return new Response(JSON.stringify(createApiError('RATE_LIMITED')), { status: 429 });

  try {
    // 1. AUTORIZACIÓN server-side: admin o superadmin (supervisor de tienda
    //    se representa aquí como admin-level por rol de sesión — nunca el
    //    valor que envíe el cliente).
    if (!isAdminLevel(session.user.role)) {
      logger.warn('AUTH', 'SYNC_DISCARD_FORBIDDEN_ROLE', {
        userId: session.user.id,
        role: session.user.role,
      });
      return NextResponse.json(
        { ...createApiError('FORBIDDEN'), message: 'Solo un supervisor o administrador puede descartar ventas pendientes.' },
        { status: 403 },
      );
    }

    // 2. Payload validado.
    const parsed = discardSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { ...createApiError('INVALID_DATA'), details: parsed.error.format() },
        { status: 400 },
      );
    }
    const d = parsed.data;

    // 3. AUDITORÍA PRIMERO (mecanismo existente: audit_logs). Sin PII ni
    //    payload comercial — id de operación, código y motivo.
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      logger.error('SYNC', 'SYNC_DISCARD_ADMIN_CLIENT_UNAVAILABLE', {});
      return NextResponse.json(createApiError('INTERNAL_ERROR'), { status: 500 });
    }

    const { error: auditError } = await supabaseAdmin.from('audit_logs').insert({
      user_id: session.user.id,
      action: 'sync_sale_discarded',
      table_name: 'transactions',
      record_id: null,
      store_id: d.storeId ?? null,
      metadata: {
        operation_key: d.operationKey,
        entity: d.entity,
        error_code: d.errorCode ?? null,
        reason: d.reason,
        authorized_by_role: session.user.role,
        source: 'server',
        detail:
          'Venta pendiente descartada por supervisor/administrador tras conflicto de sincronización. La operación NO se registró como venta.',
        timestamp: new Date().toISOString(),
      },
    });

    if (auditError) {
      // Fail-closed: sin auditoría no hay descarte — la venta se CONSERVA.
      logger.error('AUDIT', 'SYNC_DISCARD_AUDIT_FAILED', {
        operationKey: d.operationKey,
        error: auditError.message,
      });
      return NextResponse.json(
        {
          ...createApiError('INTERNAL_ERROR'),
          message:
            'No se pudo registrar la auditoría del descarte. La venta se conserva en "Ventas por resolver" — inténtalo de nuevo.',
        },
        { status: 500 },
      );
    }

    // 4. Auditoría confirmada → descarte autorizado.
    logger.info('SYNC', 'SYNC_SALE_DISCARD_AUTHORIZED', {
      operationKey: d.operationKey,
      userId: session.user.id,
    });
    return NextResponse.json({ ok: true, discarded: true, operationKey: d.operationKey });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('Sync discard error:', errMsg);
    return NextResponse.json(createApiError('INTERNAL_ERROR'), { status: 500 });
  }
});

async function postHandler(req: NextRequest) {
  return handler(req);
}

export const POST = withTracing(postHandler, 'POST /api/sync/discard');
