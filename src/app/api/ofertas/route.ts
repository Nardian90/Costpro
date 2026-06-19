import { NextRequest, NextResponse } from 'next/server';
import { withStoreAccess, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { getSupabaseAuthClient } from '@/lib/supabaseClient';
import { ofertaCreateSchema, zodError } from '@/validation/api-schemas';

export const runtime = 'nodejs';

// ────────────────────────────────────────────────────────────────────────────────
// GET /api/ofertas — List ofertas for the active store
// ────────────────────────────────────────────────────────────────────────────────
async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const clientId = session.user.id;
    const { allowed } = await rateLimit(clientId, { windowMs: 60_000, maxRequests: 60 });
    if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const url = new URL(req.url);
    const storeId = url.searchParams.get('storeId') || url.searchParams.get('store_id');
    if (!storeId) {
      return NextResponse.json({ error: 'storeId requerido' }, { status: 400 });
    }

    const statusFilter = url.searchParams.get('status');
    const search = url.searchParams.get('search')?.trim() || '';
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') || '50', 10)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const client = getSupabaseAuthClient(session.token);

    let query = client
      .from('ofertas')
      .select('id, numero, fecha, objeto, status, subtotal, total, moneda, cliente, created_at', { count: 'exact' })
      .eq('store_id', storeId)
      .neq('status', 'expired')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (statusFilter && ['draft', 'sent', 'accepted', 'rejected'].includes(statusFilter)) {
      query = query.eq('status', statusFilter);
    }

    // Server-side search: filter by numero, objeto, or cliente.empresa
    if (search) {
      query = query.or(`numero.ilike.%${search}%,objeto.ilike.%${search}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      const errMsg = error.message || 'Error al consultar ofertas';
      return NextResponse.json(
        { error: (process.env.NODE_ENV !== 'production' || !!process.env.VITEST) ? errMsg : 'Error interno del servidor' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: data || [],
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      },
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json(
      { error: (process.env.NODE_ENV !== 'production' || !!process.env.VITEST) ? errMsg : 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────────
// POST /api/ofertas — Create a new oferta
// ────────────────────────────────────────────────────────────────────────────────
async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    if (!validateOrigin(req)) {
      return NextResponse.json({ error: 'Origen no permitido' }, { status: 403 });
    }

    const clientId = session.user.id;
    const { allowed } = await rateLimit(clientId, { windowMs: 60_000, maxRequests: 30 });
    if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const body = await req.json();
    const validated = ofertaCreateSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: zodError(validated.error) },
        { status: 400 }
      );
    }

    // R-6: Validate that the store_id from the body matches the user's active store membership
    const bodyStoreId = validated.data.store_id;
    const memberships = (session.user as any).memberships || [];
    const isAdmin = session.user.role === 'admin';
    const hasStoreAccess = isAdmin || memberships.some(
      (m: any) => m.store_id === bodyStoreId && m.status === 'active'
    );
    if (!hasStoreAccess) {
      return NextResponse.json(
        { error: 'Prohibido', message: 'No tienes acceso a la tienda especificada' },
        { status: 403 }
      );
    }

    // Auto-calculate financials from productos
    const subtotal = validated.data.productos.reduce(
      (sum, item) => sum + item.cantidad * item.precio_unitario,
      0
    );
    const descuento = validated.data.descuento || 0;
    const impuestoRate = validated.data.itbis || 0;
    const impuestoAmount = impuestoRate > 0 && impuestoRate < 100
      ? (subtotal - descuento) * impuestoRate / (100 - impuestoRate)
      : 0;
    const total = (subtotal - descuento) + impuestoAmount;

    // Use service_role client for insert (with explicit store_id)
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Error de configuración' }, { status: 500 });
    }
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const insertData = {
      ...validated.data,
      subtotal,
      total,
      status: 'draft' as const,
      created_by: session.user.id,
    };

    const { data, error } = await admin
      .from('ofertas')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      const errMsg = error.message || 'Error al crear oferta';
      return NextResponse.json(
        { error: (process.env.NODE_ENV !== 'production' || !!process.env.VITEST) ? errMsg : 'Error interno del servidor' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json(
      { error: (process.env.NODE_ENV !== 'production' || !!process.env.VITEST) ? errMsg : 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

export const GET = withTracing(
  withStoreAccess(getHandler as any) as any,
  'GET /api/ofertas'
);

export const POST = withTracing(
  withStoreAccess(postHandler as any) as any,
  'POST /api/ofertas'
);
