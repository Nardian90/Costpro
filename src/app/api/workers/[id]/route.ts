import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
// FIX C1: usar getSupabaseAuthClient para que RLS respete el usuario autenticado
import { getSupabaseForSession } from '@/lib/supabase-session';
import { parseCI, getBirthDateFromCI } from '@/lib/parse-ci';

/**
 * /api/workers/[id]
 *
 * GET    — detalle del trabajador + reglas activas + últimos pagos
 * PATCH  — actualizar campos (re-valida CI si se cambia)
 * DELETE — soft delete (status=inactive) — nunca hard delete para preservar histórico
 */

function extractIdFromUrl(req: NextRequest): string | null {
  // URL pattern: /api/workers/{id}
  const match = req.nextUrl?.pathname?.match(/\/api\/workers\/([^/]+)/);
  return match?.[1] || null;
}

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const id = extractIdFromUrl(req);
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });

  const supabase = getSupabaseForSession(session);
  // Worker
  const { data: worker, error } = await supabase
    .from('workers')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !worker) {
    return NextResponse.json({ error: 'Trabajador no encontrado' }, { status: 404 });
  }

  // Reglas activas (worker-specific + store-default)
  const today = new Date().toISOString().split('T')[0];
  const { data: rules } = await supabase
    .from('commission_rules')
    .select('*')
    .eq('store_id', worker.store_id)
    .or(`worker_id.eq.${id},worker_id.is.null`)
    .lte('valid_from', today)
    .or(`valid_to.is.null,valid_to.gte.${today}`)
    .order('priority', { ascending: false });

  // Últimos 5 pagos
  const { data: payments } = await supabase
    .from('commission_payments')
    .select('*')
    .eq('worker_id', id)
    .order('period_start', { ascending: false })
    .limit(5);

  return NextResponse.json({ worker, rules: rules || [], payments: payments || [] });
}

async function patchHandler(req: NextRequest, session: AuthenticatedSession) {
  const id = extractIdFromUrl(req);
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });

  const body = await req.json();

  if (session.user.role !== 'admin' && session.user.role !== 'manager') {
    return NextResponse.json({ error: 'Forbidden — requiere rol admin o manager' }, { status: 403 });
  }

  const supabase = getSupabaseForSession(session);

  // FIX C3: verificar que el worker pertenece a una tienda del manager antes de permitir update
  const { data: existingWorker, error: loadErr } = await supabase
    .from('workers')
    .select('store_id')
    .eq('id', id)
    .single();

  if (loadErr || !existingWorker) {
    return NextResponse.json({ error: 'Trabajador no encontrado' }, { status: 404 });
  }

  // Admin global puede; manager debe tener membership en la tienda del worker
  const hasStoreAccess = session.user.role === 'admin' ||
    session.user.memberships?.some((m: any) => m.store_id === existingWorker.store_id && m.status === 'active');
  if (!hasStoreAccess) {
    return NextResponse.json({ error: 'Forbidden — sin acceso a la tienda del trabajador' }, { status: 403 });
  }

  const updateData: Record<string, unknown> = {};

  // Campos editables
  const editableFields = ['first_name', 'last_name', 'gender', 'address', 'province', 'municipality', 'shirt_size', 'shoe_size', 'waist_size', 'status'];
  for (const field of editableFields) {
    if (body[field] !== undefined) {
      updateData[field] = body[field];
    }
  }

  // CI: si se cambia, re-validar y re-derivar birth_date
  if (body.ci !== undefined) {
    const parsed = parseCI(body.ci);
    if (!parsed.isValid) {
      return NextResponse.json(
        { error: `CI inválido: ${parsed.error}` },
        { status: 400 },
      );
    }
    updateData.ci = String(body.ci).trim();
    updateData.birth_date = getBirthDateFromCI(body.ci);
  }

  const { data, error } = await supabase
    .from('workers')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: `Ya existe un trabajador con ese CI en esta tienda` },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ worker: data });
}

async function deleteHandler(req: NextRequest, session: AuthenticatedSession) {
  const id = extractIdFromUrl(req);
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });

  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — solo admin puede desactivar trabajadores' }, { status: 403 });
  }

  const supabase = getSupabaseForSession(session);

  // Soft delete: status = inactive (preserva histórico de ventas y pagos)
  const { data, error } = await supabase
    .from('workers')
    .update({ status: 'inactive' })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ worker: data, message: 'Trabajador desactivado (soft delete)' });
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);
