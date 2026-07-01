import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { getSupabaseAuthClient } from '@/lib/supabaseClient';
import { ofertaUpdateSchema, zodError } from '@/validation/api-schemas';

export const runtime = 'nodejs';

/**
 * Validates that the user has access to the store that owns the given oferta.
 * Admins bypass this check.
 */
function validateStoreMembership(session: AuthenticatedSession, ofertaStoreId: string): boolean {
  if (session.user.role === 'admin') return true;
  const memberships = (session.user as any).memberships || [];
  return memberships.some(
    (m: any) => m.store_id === ofertaStoreId && m.status === 'active'
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// GET /api/ofertas/[ofertaId] — Get oferta detail
// ────────────────────────────────────────────────────────────────────────────────
async function getHandler(req: NextRequest, _session: AuthenticatedSession, { ofertaId }: { ofertaId: string }) {
  try {
    const session = _session;
    const clientId = session.user.id;
    const { allowed } = await rateLimit(clientId, { windowMs: 60_000, maxRequests: 60 });
    if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const client = getSupabaseAuthClient(session.token);

    const { data, error } = await client
      .from('ofertas')
      .select('*')
      .eq('id', ofertaId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Oferta no encontrada' }, { status: 404 });
    }

    // Validate store membership
    if (!validateStoreMembership(session, data.store_id)) {
      return NextResponse.json(
        { error: 'Prohibido', message: 'No tienes acceso a esta oferta' },
        { status: 403 }
      );
    }

    return NextResponse.json({ data });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json(
      { error: (process.env.NODE_ENV !== 'production' || !!process.env.VITEST) ? errMsg : 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────────
// PATCH /api/ofertas/[ofertaId] — Update oferta
// ────────────────────────────────────────────────────────────────────────────────
async function patchHandler(req: NextRequest, _session: AuthenticatedSession, { ofertaId }: { ofertaId: string }) {
  try {
    const session = _session;
    if (!validateOrigin(req)) {
      return NextResponse.json({ error: 'Origen no permitido' }, { status: 403 });
    }

    const clientId = session.user.id;
    const { allowed } = await rateLimit(clientId, { windowMs: 60_000, maxRequests: 30 });
    if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const body = await req.json();
    const validated = ofertaUpdateSchema.safeParse({ ...body, id: ofertaId });

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: zodError(validated.error) },
        { status: 400 }
      );
    }

    const client = getSupabaseAuthClient(session.token);

    // First fetch the oferta to validate store membership + get existing financials
    const { data: existing, error: fetchError } = await client
      .from('ofertas')
      .select('store_id, status, productos, descuento, itbis')
      .eq('id', ofertaId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Oferta no encontrada' }, { status: 404 });
    }

    if (!validateStoreMembership(session, existing.store_id)) {
      return NextResponse.json(
        { error: 'Prohibido', message: 'No tienes permisos para editar esta oferta' },
        { status: 403 }
      );
    }

    // Build update object — exclude id from update data
    const { id, ...updateFields } = validated.data;

    // Recalculate financials if productos, descuento, or itbis are provided
    const needsRecalc = updateFields.productos || (updateFields as any).descuento !== undefined || (updateFields as any).itbis !== undefined;
    if (needsRecalc) {
      // Use updated productos if provided, otherwise use existing data
      const productos = updateFields.productos && Array.isArray(updateFields.productos)
        ? updateFields.productos
        : (existing.productos || []);

      const subtotal = productos.reduce(
        (sum: number, item: any) => sum + item.cantidad * item.precio_unitario,
        0
      );
      const descuento = (updateFields as any).descuento ?? (existing.descuento ?? 0);
      const impuestoRate = (updateFields as any).itbis ?? (existing.itbis ?? 0);
      const impuestoAmount = impuestoRate > 0 && impuestoRate < 100
        ? (subtotal - descuento) * impuestoRate / (100 - impuestoRate)
        : 0;
      const total = (subtotal - descuento) + impuestoAmount;

      (updateFields as any).subtotal = subtotal;
      (updateFields as any).total = total;
    }

    // Use service_role for update
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Error de configuración' }, { status: 500 });
    }
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await admin
      .from('ofertas')
      .update({ ...updateFields, updated_at: new Date().toISOString() })
      .eq('id', ofertaId)
      .select()
      .single();

    if (error) {
      const errMsg = error.message || 'Error al actualizar oferta';
      return NextResponse.json(
        { error: (process.env.NODE_ENV !== 'production' || !!process.env.VITEST) ? errMsg : 'Error interno del servidor' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json(
      { error: (process.env.NODE_ENV !== 'production' || !!process.env.VITEST) ? errMsg : 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────────
// DELETE /api/ofertas/[ofertaId] — Soft delete (set status=expired)
// ────────────────────────────────────────────────────────────────────────────────
async function deleteHandler(req: NextRequest, _session: AuthenticatedSession, { ofertaId }: { ofertaId: string }) {
  try {
    const session = _session;
    if (!validateOrigin(req)) {
      return NextResponse.json({ error: 'Origen no permitido' }, { status: 403 });
    }

    const clientId = session.user.id;
    const { allowed } = await rateLimit(clientId, { windowMs: 60_000, maxRequests: 15 });
    if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    // Only admin/manager can delete
    const isAdmin = session.user.role === 'admin';
    const memberships = (session.user as any).memberships || [];
    const isManager = memberships.some(
      (m: any) => m.status === 'active' && m.role === 'manager'
    );

    if (!isAdmin && !isManager) {
      return NextResponse.json(
        { error: 'Prohibido', message: 'Solo administradores o managers pueden eliminar ofertas' },
        { status: 403 }
      );
    }

    const client = getSupabaseAuthClient(session.token);

    // Fetch the oferta to validate store membership
    const { data: existing, error: fetchError } = await client
      .from('ofertas')
      .select('store_id, status')
      .eq('id', ofertaId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Oferta no encontrada' }, { status: 404 });
    }

    if (!validateStoreMembership(session, existing.store_id)) {
      return NextResponse.json(
        { error: 'Prohibido', message: 'No tienes permisos para eliminar esta oferta' },
        { status: 403 }
      );
    }

    // Soft-delete by setting status to 'expired'
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Error de configuración' }, { status: 500 });
    }
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error } = await admin
      .from('ofertas')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', ofertaId);

    if (error) {
      const errMsg = error.message || 'Error al eliminar oferta';
      return NextResponse.json(
        { error: (process.env.NODE_ENV !== 'production' || !!process.env.VITEST) ? errMsg : 'Error interno del servidor' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json(
      { error: (process.env.NODE_ENV !== 'production' || !!process.env.VITEST) ? errMsg : 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

// Route params are passed by Next.js App Router as the second argument
type RouteContext = { params: Promise<{ ofertaId: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { ofertaId } = await ctx.params;
  return withTracing(
    withAuth((r: NextRequest, s: AuthenticatedSession) => getHandler(r, s, { ofertaId }) as any) as any,
    'GET /api/ofertas/[ofertaId]'
  )(req);
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { ofertaId } = await ctx.params;
  return withTracing(
    withAuth((r: NextRequest, s: AuthenticatedSession) => patchHandler(r, s, { ofertaId }) as any) as any,
    'PATCH /api/ofertas/[ofertaId]'
  )(req);
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const { ofertaId } = await ctx.params;
  return withTracing(
    withAuth((r: NextRequest, s: AuthenticatedSession) => deleteHandler(r, s, { ofertaId }) as any) as any,
    'DELETE /api/ofertas/[ofertaId]'
  )(req);
}
