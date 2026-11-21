/**
 * API CP-FIN-REC-001 — Conciliación operativa-contable (misión
 * CP-FIN-INV-EXPORT-AND-CONTINUOUS-RECONCILIATION-001, OBJETIVO B).
 *
 * GET  /api/fin/reconciliation?store_id&as_of[&from&to]
 *        → RPC fin_get_reconciliation: matriz por cuenta (fuentes operativas
 *          independientes vs mayor de la generación activa, mismo corte).
 * GET  /api/fin/reconciliation?history=1&store_id[&limit]
 *        → RPC fin_reconciliation_history: evolución de snapshots.
 * POST /api/fin/reconciliation { store_id, as_of, from?, to? }
 *        → RPC fin_reconciliation_snapshot_save: persiste la ejecución como
 *          evidencia de auditoría (recalculada server-side; requiere nivel
 *          de gestión canManageStore — igual que /api/payments).
 *
 * Seguridad: withAuth (Bearer), autorización por tienda dentro del RPC
 * (guard anti-spoofing + has_store_access_as), canal service_role (canon
 * CP-FIN), sin service_role en el navegador, sin endpoints públicos.
 */
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { canManageStore } from '@/lib/roles';
import { z } from 'zod';
import { uuidLoose } from '@/validation/api-schemas';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dateStr = z.string().regex(DATE_RE, 'Fecha inválida (YYYY-MM-DD)');

// ── GET: ejecutar conciliación o consultar historial ──
async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('store_id');

  if (!storeId) {
    return NextResponse.json({ error: 'store_id es requerido' }, { status: 400 });
  }

  const admin = getSupabaseAdminSafe();
  if (!admin) {
    return NextResponse.json({ error: 'Servicio no disponible' }, { status: 503 });
  }

  // Historial de snapshots (metadatos + resumen por ejecución).
  if (searchParams.get('history') === '1') {
    const limit = Math.min(Number(searchParams.get('limit') ?? 20) || 20, 100);
    const { data, error } = await admin.rpc('fin_reconciliation_history', {
      p_store_id: storeId,
      p_limit: limit,
      p_user_id: session.user.id,
    });
    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: error.message.includes('ERR_UNAUTHORIZED') ? 403 : 500 },
      );
    }
    return NextResponse.json(data);
  }

  // Ejecución de la conciliación bajo demanda.
  const asOf = searchParams.get('as_of');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  if (!asOf || !DATE_RE.test(asOf)) {
    return NextResponse.json({ error: 'as_of (YYYY-MM-DD) es requerido' }, { status: 400 });
  }
  if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) {
    return NextResponse.json({ error: 'from/to deben ser YYYY-MM-DD' }, { status: 400 });
  }
  if ((from && !to) || (!from && to)) {
    return NextResponse.json({ error: 'from y to deben enviarse juntos' }, { status: 400 });
  }
  if (from && to && from > to) {
    return NextResponse.json(
      { error: 'El período es inválido: la fecha inicial es posterior a la final' },
      { status: 400 },
    );
  }

  const { data, error } = await admin.rpc('fin_get_reconciliation', {
    p_store_id: storeId,
    p_as_of: asOf,
    p_from: from ?? null,
    p_to: to ?? null,
    p_user_id: session.user.id,
  });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: error.message.includes('ERR_UNAUTHORIZED') ? 403 : 500 },
    );
  }
  return NextResponse.json(data);
}

// ── POST: guardar snapshot de la ejecución (evidencia de auditoría) ──
const saveSnapshotSchema = z.object({
  store_id: uuidLoose,
  as_of: dateStr,
  from: dateStr.optional().nullable(),
  to: dateStr.optional().nullable(),
}).refine((d) => d.from == null || d.to == null || d.from <= d.to, {
  message: 'El período es inválido: la fecha inicial es posterior a la final',
}).refine((d) => (d.from == null) === (d.to == null), {
  message: 'from y to deben enviarse juntos',
});

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo JSON inválido' }, { status: 400 });
  }
  const parsed = saveSnapshotSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Parámetros inválidos' },
      { status: 422 },
    );
  }
  const { store_id: storeId, as_of: asOf, from, to } = parsed.data;

  // Gate de gestión server-side (canon roles.ts, igual que /api/payments):
  // guardar evidencia de conciliación es una acción de administración.
  if (!canManageStore(session.user, storeId)) {
    return NextResponse.json({ error: 'ERR_UNAUTHORIZED' }, { status: 403 });
  }

  const admin = getSupabaseAdminSafe();
  if (!admin) {
    return NextResponse.json({ error: 'Servicio no disponible' }, { status: 503 });
  }

  // El snapshot se recalcula íntegramente en el servidor (nunca se persiste
  // un payload del cliente) — misión §5.7: evidencia de auditoría confiable.
  const { data, error } = await admin.rpc('fin_reconciliation_snapshot_save', {
    p_store_id: storeId,
    p_as_of: asOf,
    p_from: from ?? null,
    p_to: to ?? null,
    p_user_id: session.user.id,
  });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: error.message.includes('ERR_UNAUTHORIZED') ? 403 : 500 },
    );
  }
  return NextResponse.json(data);
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
