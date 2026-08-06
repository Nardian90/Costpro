/**
 * POST /api/transfers/[id]/confirm — Confirmar transferencia
 *
 * Iteración RLS (v2.21.0) Fix RLS-B6:
 * Antes no existía endpoint para confirmar transferencias — quedaban PENDIENTE
 * perpetuamente. El RPC confirm_transfer ya existía en DB pero no se llamaba
 * desde ninguna API route.
 *
 * Lógica:
 * - Validar transfer existe + status PENDIENTE
 * - Validar usuario tiene canManageStore en destination_store_id (quien recibe confirma)
 * - Llamar RPC confirm_transfer
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { canManageStore } from '@/lib/roles';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { z } from 'zod';

const confirmSchema = z.object({
  operation_date: z.string().datetime().optional(),
});

async function postHandler(
  req: NextRequest,
  session: AuthenticatedSession,
  context: { params: Promise<{ id: string }> }
) {
  if (!validateOrigin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { allowed } = await rateLimit(`transfer-confirm:${session.user.id}`, {
    windowMs: 60_000,
    maxRequests: 10,
  });
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const params = await context.params;
  const transferId = params.id;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(transferId)) {
    return NextResponse.json({ error: 'Invalid transfer_id' }, { status: 400 });
  }

  const admin = getSupabaseAdminSafe();
  if (!admin) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  // Verificar que el transfer existe y obtener store_ids
  const { data: transfer, error: transferError } = await admin
    .from('transfers')
    .select('id, origin_store_id, destination_store_id, status')
    .eq('id', transferId)
    .single();

  if (transferError || !transfer) {
    return NextResponse.json({ error: 'Transfer not found' }, { status: 404 });
  }

  // El usuario debe tener acceso a la tienda DESTINO (quien recibe confirma)
  if (!canManageStore(session.user, transfer.destination_store_id)) {
    return NextResponse.json({ error: 'Forbidden — no access to destination store' }, { status: 403 });
  }

  if (transfer.status !== 'PENDIENTE') {
    return NextResponse.json(
      { error: `Transfer is ${transfer.status}, not PENDIENTE` },
      { status: 409 }
    );
  }

  // Parse body (opcional — operation_date)
  let parsed: { success: true; data: z.infer<typeof confirmSchema> } | { success: false; error: unknown };
  try {
    const body = await req.json();
    parsed = confirmSchema.safeParse(body) as typeof parsed;
  } catch {
    parsed = { success: true, data: {} };
  }

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
  }

  // Llamar al RPC confirm_transfer
  const { data, error } = await admin.rpc('confirm_transfer', {
    p_transfer_id: transferId,
    p_user_id: session.user.id,
    p_operation_date: parsed.data.operation_date ? new Date(parsed.data.operation_date) : new Date(),
  });

  if (error) {
    const msg = error.message || '';
    if (msg.includes('ERR_UNAUTHORIZED')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }
    if (msg.includes('ERR_TRANSFER_NOT_PENDING') || msg.includes('NOT_PENDING')) {
      return NextResponse.json({ error: 'Transfer no está pendiente' }, { status: 409 });
    }
    if (msg.includes('ERR_TRANSFER_NOT_FOUND') || msg.includes('NOT_FOUND')) {
      return NextResponse.json({ error: 'Transfer no encontrada' }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ success: true, ...(data as object || {}) });
}

export const POST = withTracing(
  withAuth(postHandler as Parameters<typeof withAuth>[0]) as Parameters<typeof withTracing>[0],
  'POST /api/transfers/[id]/confirm'
);
