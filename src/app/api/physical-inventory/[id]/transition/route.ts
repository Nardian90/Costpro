import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { uuidLoose } from '@/validation/api-schemas';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseAuthClient } from '@/lib/supabaseClient';
import { resolvePhysicalInventoryStore, sessionHasStoreAccess } from '@/lib/physical-inventory-access';
import { rateLimit } from '@/lib/rate-limit';
import { validateOrigin } from '@/lib/csrf';
import { withTracing } from '@/lib/observability';

function extractIdFromUrl(req: NextRequest): string | null {
  const match = req.nextUrl?.pathname?.match(/\/api\/physical-inventory\/([^/]+)/);
  return match?.[1] || null;
}

/**
 * POST /api/physical-inventory/[id]/transition
 *
 * Transiciones del ciclo de vida (la RPC valida estado + rol en BD):
 *   prepare               draft → prepared                [admin/manager/encargado]
 *   start                 prepared → in_progress          [+warehouse/clerk]
 *   complete              in_progress → counted           [+acceptPending]
 *   submit_reconciliation counted → in_reconciliation    [admin/manager/encargado]
 *   submit_authorization  in_reconciliation → pending_authorization
 *   generate_adjustments  pending_authorization → conciliated (crea borradores)
 *   close                 conciliated → closed           [admin/manager]
 *   void                  (pre-conciliación) → voided      [motivo ≥ 3 chars]
 */
const TransitionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('prepare') }),
  z.object({ action: z.literal('start') }),
  z.object({ action: z.literal('complete'), acceptPending: z.boolean().default(false) }),
  z.object({ action: z.literal('submit_reconciliation') }),
  z.object({ action: z.literal('submit_authorization') }),
  z.object({ action: z.literal('generate_adjustments') }),
  z.object({ action: z.literal('close') }),
  z.object({ action: z.literal('void'), reason: z.string().trim().min(3).max(300) }),
]);

const RPC_MAP: Record<string, string> = {
  prepare: 'prepare_physical_inventory',
  start: 'start_physical_inventory_count',
  complete: 'complete_physical_inventory_count',
  submit_reconciliation: 'submit_physical_inventory_reconciliation',
  submit_authorization: 'submit_physical_inventory_authorization',
  generate_adjustments: 'generate_adjustments_from_physical_inventory',
  close: 'close_physical_inventory',
  void: 'void_physical_inventory',
};

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  if (!validateOrigin(req)) {
    return NextResponse.json({ error: 'Origen no permitido' }, { status: 403 });
  }
  const { allowed } = await rateLimit(session.user.id, { windowMs: 60_000, maxRequests: 30 });
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const id = extractIdFromUrl(req);
  if (!id || !uuidLoose.safeParse(id).success) {
    return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
  }

  const parsed = TransitionSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  // Acceso por documento: la tienda se resuelve desde el propio inventario
  const storeId = await resolvePhysicalInventoryStore(id);
  if (!storeId) return NextResponse.json({ error: 'Inventario no encontrado' }, { status: 404 });
  if (!sessionHasStoreAccess(session, storeId)) {
    return NextResponse.json({ error: 'Sin acceso a la tienda de este inventario' }, { status: 403 });
  }

  const rpcName = RPC_MAP[body.action];
  const rpcArgs: Record<string, unknown> = { p_pi_id: id };
  if (body.action === 'complete') rpcArgs.p_accept_pending = body.acceptPending;
  if (body.action === 'void') rpcArgs.p_reason = body.reason;

  const authClient = getSupabaseAuthClient(session.token);
  const { data, error } = await authClient.rpc(rpcName, rpcArgs);
  if (error) {
    // Las RPC lanzan errores P0001 legibles (ERR_*) → 400/409 según tipo
    const msg = error.message || 'Transición rechazada';
    const isConflict = msg.includes('ERR_CONCURRENT') || msg.includes('ERR_ADJUSTMENTS_ALREADY');
    return NextResponse.json({ error: 'Transición rechazada', message: msg }, { status: isConflict ? 409 : 400 });
  }
  return NextResponse.json(data || { status: 'success' });
}

export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/physical-inventory/[id]/transition');
