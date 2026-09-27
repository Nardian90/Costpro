import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { canManageStore, canViewStore } from '@/lib/roles';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { storeRatesSchema, uuidLoose, zodError } from '@/validation/api-schemas';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/store-rates?storeId=X
 * POST /api/store-rates { storeId, rates: { USD: 680, EUR: 720, MLC: 600 } }
 *
 * Tasas de cambio manuales persistentes por tienda.
 *
 * SEC-TS-02 · H2 — cierre del cross-store write (y cross-store read):
 *   El storeId del body/query NUNCA es autorización por sí mismo.
 *   Orden del gate (idéntico al patrón FIX F3-P0-02 de received-services):
 *     request → session (withAuth, 401) → validar input (Zod, 400)
 *     → autorización de tienda → SOLO ENTONCES acceso service-role.
 *   - POST (write): canManageStore — membership activa con rol
 *     admin/manager/encargado EN ESA TIENDA (o admin global). RLS no aplica
 *     al cliente service-role: este check es la única barrera.
 *   - GET (read): canViewStore — membership activa en esa tienda (el POS y
 *     el modal de tasas lo consumen operadores de la tienda).
 */

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const storeId = req.nextUrl.searchParams.get('storeId');
  if (!storeId) return NextResponse.json({ error: 'storeId requerido' }, { status: 400 });

  const idCheck = uuidLoose.safeParse(storeId);
  if (!idCheck.success) {
    return NextResponse.json({ error: 'storeId inválido (UUID)' }, { status: 400 });
  }

  // Autorización de lectura ANTES del acceso service-role
  if (!canViewStore(session.user, storeId)) {
    logger.warn('WALLET', `Store rates read DENIED: user ${session.user.id} sin membresía en store ${storeId}`);
    return NextResponse.json({ error: 'No tienes acceso a esta tienda' }, { status: 403 });
  }

  const admin = getSupabaseAdminSafe();
  if (!admin) {
    return NextResponse.json({ error: 'Servicio no disponible' }, { status: 500 });
  }

  try {
    const { data, error } = await admin
      .from('store_exchange_rates')
      .select('currency, rate, updated_at')
      .eq('store_id', storeId);

    if (error) {
      logger.error('WALLET', `Store rates fetch: ${error.message}`);
      return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }

    // Convertir a objeto { USD: 680, EUR: 720, MLC: 600 }
    const rates: Record<string, number> = {};
    for (const r of data || []) {
      rates[r.currency] = parseFloat(r.rate);
    }

    return NextResponse.json({ rates });
  } catch (error: unknown) {
    logger.error('WALLET', `Store rates error: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const validated = storeRatesSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json(zodError(validated.error), { status: 400 });
  }

  const { storeId, rates } = validated.data;

  // Autorización ANTES del acceso service-role: el usuario debe poder GESTIONAR
  // esa tienda concreta. Sin esto, cualquier usuario autenticado podía
  // sobrescribir las tasas de CUALQUIER tienda (cross-store write).
  if (!canManageStore(session.user, storeId)) {
    logger.warn(
      'WALLET',
      `Store rates write DENIED (cross-store attempt): user ${session.user.id} → store ${storeId}`
    );
    return NextResponse.json(
      { error: 'No tienes permisos para gestionar las tasas de esta tienda' },
      { status: 403 }
    );
  }

  const admin = getSupabaseAdminSafe();
  if (!admin) {
    return NextResponse.json({ error: 'Servicio no disponible' }, { status: 500 });
  }

  try {
    // Upsert cada tasa — actor de auditoría tomado SIEMPRE de la sesión,
    // nunca del body.
    const rows = Object.entries(rates).map(([currency, rate]) => ({
      store_id: storeId,
      currency,
      rate,
      updated_by: session.user.id,
    }));

    const { error } = await admin.from('store_exchange_rates')
      .upsert(rows, { onConflict: 'store_id,currency' });

    if (error) {
      logger.error('WALLET', `Store rates save: ${error.message}`);
      return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }

    logger.info('WALLET', `Store rates saved by ${session.user.id} for store ${storeId}`);
    return NextResponse.json({ success: true, rates });
  } catch (error: unknown) {
    logger.error('WALLET', `Store rates save error: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export const GET = withAuth(getHandler as any);
export const POST = withAuth(postHandler as any);
