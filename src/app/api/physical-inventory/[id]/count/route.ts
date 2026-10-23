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
 * POST /api/physical-inventory/[id]/count
 *
 * Registro por lotes de cantidades físicas (manual o importación Excel).
 * p_items: [{item_id, counted_qty (null = limpiar a pendiente), expected_updated_at}]
 * Bloqueo optimista: si la línea cambió desde que el cliente la cargó,
 * la RPC devuelve conflicts[] sin sobrescribir → 409 aquí.
 */
const CountItemSchema = z.object({
  item_id: uuidLoose,
  counted_qty: z.number().min(0).max(1_000_000_000).nullable(),
  expected_updated_at: z.string().nullable().optional(),
});

const CountSchema = z.object({
  items: z.array(CountItemSchema).min(1).max(2000),
  source: z.enum(['manual', 'excel']).default('manual'),
});

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  if (!validateOrigin(req)) {
    return NextResponse.json({ error: 'Origen no permitido' }, { status: 403 });
  }
  const { allowed } = await rateLimit(session.user.id, { windowMs: 60_000, maxRequests: 60 });
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const id = extractIdFromUrl(req);
  if (!id || !uuidLoose.safeParse(id).success) {
    return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
  }

  const parsed = CountSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }

  const storeId = await resolvePhysicalInventoryStore(id);
  if (!storeId) return NextResponse.json({ error: 'Inventario no encontrado' }, { status: 404 });
  if (!sessionHasStoreAccess(session, storeId)) {
    return NextResponse.json({ error: 'Sin acceso a la tienda de este inventario' }, { status: 403 });
  }

  const authClient = getSupabaseAuthClient(session.token);
  const { data, error } = await authClient.rpc('record_physical_inventory_counts', {
    p_pi_id: id,
    p_items: parsed.data.items,
    p_source: parsed.data.source,
  });
  if (error) {
    return NextResponse.json({ error: 'Registro de conteo rechazado', message: error.message }, { status: 400 });
  }

  // Conflicto de concurrencia: HTTP 409 con detalle (el cliente NO pierde su trabajo)
  const hasConflicts = Array.isArray(data?.conflicts) && data.conflicts.length > 0;
  if (hasConflicts) {
    return NextResponse.json({ error: 'Conflicto de concurrencia', ...data }, { status: 409 });
  }
  return NextResponse.json(data);
}

export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/physical-inventory/[id]/count');
