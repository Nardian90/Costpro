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
 * POST /api/physical-inventory/[id]/review
 *   Registra la explicación de una diferencia (fase de conciliación).
 */
const ReviewSchema = z.object({
  itemId: uuidLoose,
  reviewNotes: z.string().trim().min(3).max(500),
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

  const parsed = ReviewSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }

  const storeId = await resolvePhysicalInventoryStore(id);
  if (!storeId) return NextResponse.json({ error: 'Inventario no encontrado' }, { status: 404 });
  if (!sessionHasStoreAccess(session, storeId)) {
    return NextResponse.json({ error: 'Sin acceso a la tienda de este inventario' }, { status: 403 });
  }

  const authClient = getSupabaseAuthClient(session.token);
  const { data, error } = await authClient.rpc('review_physical_inventory_item', {
    p_pi_id: id,
    p_item_id: parsed.data.itemId,
    p_review_notes: parsed.data.reviewNotes,
  });
  if (error) {
    return NextResponse.json({ error: 'Revisión rechazada', message: error.message }, { status: 400 });
  }
  return NextResponse.json(data);
}

export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/physical-inventory/[id]/review');
