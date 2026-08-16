/**
 * POST /api/vale-salida/[id]/reverse
 *
 * Revierte un Vale de Salida completado — emite movimiento compensatorio
 * de entrada (issue_slip_reverse), restaura actual_qty en OT si aplica,
 * marca issue_slips.status='reversed'.
 *
 * TRUST BOUNDARY (H2 hardening):
 *   - slip_id   → del path param (validado UUID)
 *   - reason    → del body (string, requerido)
 *   - user_id   → derivado de session.user.id (JWT), NUNCA del body
 *
 *   La RPC reverse_vale_salida valida internamente:
 *     - has_store_access_as(p_user_id, issue_slips.store_id)
 *     - status='completed' (no doble reversión)
 *     - advisory lock para concurrencia
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { withSecurity } from '@/lib/with-security';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { z } from 'zod';

// =====================================================================
// Schema — solo reason del body
// =====================================================================
const reverseSchema = z.object({
  reason: z.string().min(1, { message: 'reason es requerido' }).max(500),
});

async function postHandler(
  request: NextRequest,
  session: AuthenticatedSession,
) {
  // Extract slip_id from URL: /api/vale-salida/{id}/reverse
  const match = request.nextUrl?.pathname?.match(/\/api\/vale-salida\/([^/]+)\/reverse$/);
  const slip_id = match?.[1];
  if (!slip_id) {
    return NextResponse.json({ error: 'slip_id no encontrado en URL' }, { status: 400 });
  }

  // Validar UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(slip_id)) {
    return NextResponse.json({ error: 'slip_id inválido' }, { status: 400 });
  }

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = reverseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validación fallida', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { reason } = parsed.data;

  // Invocar RPC (service_role, p_user_id from JWT)
  const admin = getSupabaseAdminSafe();
  if (!admin) {
    return NextResponse.json({ error: 'Servicio no disponible' }, { status: 503 });
  }

  const { data: result, error: rpcErr } = await admin.rpc('reverse_vale_salida', {
    p_slip_id: slip_id,
    p_reason: reason,
    p_user_id: session.user.id, // ← TRUST BOUNDARY: from JWT, not body
  });

  if (rpcErr) {
    const msg = rpcErr.message || '';
    const status = mapValeReverseErrorToHttpStatus(msg);
    const userMessage = mapValeReverseErrorToUserMessage(msg);
    return NextResponse.json({ error: userMessage, rpc_error: msg }, { status });
  }

  return NextResponse.json(result);
}

// =====================================================================
// Canonical error mapping for reverse_vale_salida RPC errors.
// =====================================================================
function mapValeReverseErrorToHttpStatus(msg: string): number {
  if (msg.includes('ERR_UNAUTHENTICATED')) return 401;
  if (msg.includes('ERR_UNAUTHORIZED')) return 403;
  if (msg.includes('ERR_SLIP_NOT_FOUND')) return 404;
  if (msg.includes('ERR_SLIP_NOT_REVERSIBLE')) return 409;
  return 500;
}

function mapValeReverseErrorToUserMessage(msg: string): string {
  if (msg.includes('ERR_UNAUTHENTICATED')) return 'No autenticado';
  if (msg.includes('ERR_UNAUTHORIZED')) return 'Sin acceso a la tienda del vale';
  if (msg.includes('ERR_SLIP_NOT_FOUND')) return 'Vale no encontrado';
  if (msg.includes('ERR_SLIP_NOT_REVERSIBLE')) return 'El vale no está en estado reversible (status must be completed)';
  return msg;
}

export const POST = withAuth(withSecurity(postHandler, {
  rateLimitKey: 'vale-salida:reverse',
  maxRequests: 10,
}));
