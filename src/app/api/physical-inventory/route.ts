import { isAdminLevel } from '@/lib/roles';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { uuidLoose } from '@/validation/api-schemas';
import { withStoreAccess, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { getSupabaseAuthClient } from '@/lib/supabaseClient';
import { rateLimit } from '@/lib/rate-limit';
import { validateOrigin } from '@/lib/csrf';
import { withTracing } from '@/lib/observability';

/**
 * GET /api/physical-inventory?storeId=...&status=...&from=...&to=...&search=...
 *   Lista los inventarios físicos de la tienda con contadores derivados.
 *   Authorization: withStoreAccess (membresía activa o admin) + RLS en BD.
 */
async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const { searchParams } = req.nextUrl;
  const storeId = searchParams.get('storeId');
  if (!storeId) {
    return NextResponse.json({ error: 'storeId requerido' }, { status: 400 });
  }

  const status = searchParams.get('status');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const search = searchParams.get('search')?.trim();

  const authClient = getSupabaseAuthClient(session.token);
  let query = authClient
    .from('physical_inventories')
    .select(
      `id, pi_number, status, cutoff_date, description, responsible_name,
       scope_type, blind_mode, total_items, counted_items, pending_items,
       shortfall_items, surplus_items, created_at,
       creator:profiles!physical_inventories_created_by_fkey(full_name),
       adjustments:physical_inventory_adjustments(kind, items_count, adjustment_id)`
    )
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (status && status !== 'all') query = query.eq('status', status);
  if (from) query = query.gte('cutoff_date', from);
  if (to) query = query.lte('cutoff_date', `${to}T23:59:59.999Z`);
  if (search) {
    query = query.or(`pi_number.ilike.%${search}%,description.ilike.%${search}%,responsible_name.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: 'Error listando inventarios', message: error.message }, { status: 500 });
  }
  return NextResponse.json({ inventories: data || [] });
}

/**
 * POST /api/physical-inventory
 *   Crea un inventario físico (borrador). Rol: admin/manager/encargado de la tienda.
 *   La RPC revalida el rol en BD (barrera final) aunque aquí se compruebe antes.
 */
const CreateSchema = z.object({
  storeId: uuidLoose,
  cutoffDate: z.string().datetime(), // ISO — no puede ser futura (valida la RPC)
  description: z.string().trim().max(200).optional().nullable(),
  responsibleName: z.string().trim().max(120).optional().nullable(),
  scopeType: z.enum(['full', 'category', 'selection']),
  categories: z.array(z.string().trim().min(1).max(120)).max(50).optional().nullable(),
  productIds: z.array(uuidLoose).max(2000).optional().nullable(),
  blindMode: z.boolean().default(false),
  observations: z.string().trim().max(2000).optional().nullable(),
});

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  if (!validateOrigin(req)) {
    return NextResponse.json({ error: 'Origen no permitido' }, { status: 403 });
  }
  const { allowed } = await rateLimit(session.user.id, { windowMs: 60_000, maxRequests: 20 });
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const parsed = CreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }
  const { storeId, cutoffDate, description, responsibleName, scopeType, categories, productIds, blindMode, observations } = parsed.data;

  // Autorización de rol (además de la membresía que ya validó withStoreAccess)
  const admin = getSupabaseAdminSafe();
  if (!admin) return NextResponse.json({ error: 'Servicio no disponible' }, { status: 500 });
  const membership = session.user.memberships?.find(m => m.store_id === storeId && m.status === 'active');
  // CP-ORG-001 ciclo 5: nivel administrativo transversal (admin|superadmin)
  const isGlobalAdmin = isAdminLevel(session.user.role);
  const hasPrivilegedRole = isGlobalAdmin || ['admin', 'manager', 'encargado'].includes(membership?.role || '');
  if (!hasPrivilegedRole) {
    return NextResponse.json(
      { error: 'Prohibido', message: 'Se requiere rol admin, manager o encargado para crear inventarios físicos' },
      { status: 403 }
    );
  }

  const authClient = getSupabaseAuthClient(session.token);
  const { data, error } = await authClient.rpc('create_physical_inventory', {
    p_store_id: storeId,
    p_cutoff_date: cutoffDate,
    p_description: description || null,
    p_responsible_name: responsibleName || null,
    p_scope_type: scopeType,
    p_categories: scopeType === 'category' ? categories || [] : null,
    p_product_ids: scopeType === 'selection' ? productIds || [] : null,
    p_blind_mode: blindMode,
    p_observations: observations || null,
  });
  if (error) {
    return NextResponse.json({ error: 'No se pudo crear el inventario', message: error.message }, { status: 400 });
  }
  return NextResponse.json({ id: data }, { status: 201 });
}

export const GET = withTracing(withStoreAccess(getHandler) as any, 'GET /api/physical-inventory');
export const POST = withTracing(withStoreAccess(postHandler) as any, 'POST /api/physical-inventory');
