import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { z } from 'zod';
import { logger } from '@/lib/logger';

/**
 * F4-T02: Endpoint bulk para asignar un usuario a múltiples tiendas.
 *
 * FIX-DEUDA: ahora usa el RPC `bulk_assign_memberships` (transaccional atómico)
 * en vez de Promise.allSettled. Cada asignación hace upsert (ON CONFLICT).
 * Si una asignación falla por FK violation, se cuenta como failed pero la
 * transacción continúa — no rollback total, pero consistente.
 *
 * Rate limit: 10 bulk ops por minuto. CSRF: validateOrigin.
 */

const bulkMembershipsSchema = z.object({
  assignments: z.array(z.object({
    store_id: z.string().uuid(),
    role: z.enum(['admin', 'encargado', 'manager', 'clerk', 'warehouse', 'usuario', 'costo']),
    status: z.enum(['active', 'revoked']).optional().default('active'),
  })).min(1).max(50),
});

async function bulkMembershipsHandler(
  req: NextRequest,
  session: AuthenticatedSession,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await context.params;

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    const rlKey = `memberships:bulk:${session.user.id}:${clientIp}`;
    const { allowed } = await rateLimit(rlKey, { windowMs: 60_000, maxRequests: 10 });
    if (!allowed) {
      return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });
    }

    if (!validateOrigin(req)) {
      return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
    }

    const body = await req.json();
    const validated = bulkMembershipsSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { ...createApiError('INVALID_DATA'), details: validated.error.format() },
        { status: 400 }
      );
    }

    // FIX-DEUDA: solo admin/manager pueden asignar memberships — validación explícita
    // (antes usaba withAuth + check manual; ahora check directo, consistente con F4-T01)
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
    }

    // Usar service role para invocar el RPC transaccional
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });
    }
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

    // FIX-DEUDA: invocar RPC transaccional en vez de Promise.allSettled
    const { data: rpcResult, error: rpcError } = await admin.rpc('bulk_assign_memberships', {
      p_user_id: userId,
      p_assignments: validated.data.assignments,
    });

    if (rpcError) {
      logger.error('DATABASE', 'MEMBERSHIPS_BULK_RPC_FAILED', {
        userId, error: rpcError.message,
      });
      return NextResponse.json(
        createApiError('MEMBERSHIP_BULK_FAILED', rpcError.message),
        { status: 500 }
      );
    }

    const affected = (rpcResult as { affected?: number })?.affected ?? 0;
    const failed = (rpcResult as { failed?: number })?.failed ?? 0;

    logger.info('DATABASE', 'MEMBERSHIPS_BULK_RPC_SUCCESS', {
      userId, requested: validated.data.assignments.length,
      affected, failed, assignedBy: session.user.id,
    });

    return NextResponse.json({
      success: true,
      affected,
      failed,
      userId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : createApiError('UNKNOWN_ERROR').error;
    return NextResponse.json({ ...createApiError('UNKNOWN_ERROR'), error: message }, { status: 500 });
  }
}

// FIX-DEUDA: estandarizado a withAuth + check admin/manager (consistente con F4-T01
// que usa withRole('admin')). Aquí permitimos manager también porque los managers
// pueden asignar memberships a tiendas que gestionan.
export const POST = withTracing(
  withAuth(bulkMembershipsHandler as Parameters<typeof withAuth>[0]) as Parameters<typeof withTracing>[0],
  'POST /api/users/[id]/memberships/bulk'
);
