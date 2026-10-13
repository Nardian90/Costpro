import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseForSession } from '@/lib/supabase-session';
import { withSecurity } from '@/lib/with-security';
import { z } from 'zod';

/**
 * GET /api/cash-report/adjustments?start_date=ISO&end_date=ISO
 * POST /api/cash-report/adjustments
 *
 * Ajustes extraordinarios del Reporte de Entrega (§7 del brief — auditoría
 * 2026-10). Vía EXCEPCIONAL y controlada; no compensa errores de fórmulas.
 *
 * POST body:
 *   {
 *     amount: number > 0            — importe (el signo lo da direction)
 *     direction: 'in' | 'out'       — in = suma al efectivo esperado; out = resta
 *     note: string (1..500)         — justificación OBLIGATORIA
 *     payment_date: 'YYYY-MM-DD'    — día del reporte al que pertenece
 *     idempotency_key?: string      — anti doble envío (uuid)
 *   }
 *
 * Persistencia: payment_transactions con ref_type='adjustment' (reutiliza
 * RLS por tienda, actor, fecha, nota e idempotencia — migración
 * 20261012000001). El RPC get_cash_report NO los incluye (filtra
 * ref_type IN ('receipt','service')): el ajuste se integra SOLO en el
 * resumen del reporte vía /api/cash-report (campo `adjustments`).
 *
 * Restricciones de seguridad:
 *   - Rol admin/manager/encargado (el reporte lo usan esos roles).
 *   - Membresía de tienda del caller (canManageStore).
 *   - amount estrictamente > 0; dirección explícita; nota obligatoria.
 *   - Idempotencia: clave única por usuario+periodo+importe+dirección.
 */

const ADJUSTMENT_SCHEMA = z.object({
  amount: z.number().positive({ message: 'El importe debe ser mayor que cero' }),
  direction: z.enum(['in', 'out']),
  note: z.string().trim().min(1, 'La nota justificativa es obligatoria').max(500, 'La nota no puede exceder 500 caracteres'),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'payment_date debe ser YYYY-MM-DD'),
  idempotency_key: z.string().uuid().optional(),
});

function isoRange(startDate: string, endDate: string) {
  const s = new Date(startDate + 'T00:00:00').toISOString();
  const e = new Date(endDate + 'T23:59:59.999').toISOString();
  return { s, e };
}

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    const supabase = getSupabaseForSession(session);
    const { data: userData } = await supabase
      .from('profiles').select('active_store_id').eq('id', session.user.id).single();
    if (!userData?.active_store_id) {
      return NextResponse.json({ error: 'Tienda no configurada' }, { status: 400 });
    }

    let query = supabase
      .from('payment_transactions')
      .select('id, direction, amount, notes, paid_by, created_at, payment_date, idempotency_key')
      .eq('store_id', userData.active_store_id)
      .eq('ref_type', 'adjustment')
      .order('payment_date', { ascending: true });

    if (startDate && endDate) {
      const { s, e } = isoRange(startDate, endDate);
      query = query.gte('payment_date', s).lte('payment_date', e);
    }

    const { data, error } = await query;
    if (error) {
      // Entorno sin migración aplicada: degradación limpia (lista vacía).
      if (/ref_type|violates/.test(error.message)) {
        return NextResponse.json({ adjustments: [], count: 0, migration_pending: true });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ adjustments: data || [], count: data?.length || 0 });
  } catch (err: unknown) {
    const e = err as { message?: string };
    return NextResponse.json({ error: e?.message || 'Error interno' }, { status: 500 });
  }
}

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const body = await req.json();
    const parsed = ADJUSTMENT_SCHEMA.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Cuerpo inválido', details: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) },
        { status: 400 },
      );
    }
    const { amount, direction, note, payment_date, idempotency_key } = parsed.data;

    if (session.user.role !== 'admin' && session.user.role !== 'manager' && session.user.role !== 'encargado') {
      return NextResponse.json({ error: 'Forbidden — requiere rol admin, manager o encargado' }, { status: 403 });
    }

    const supabase = getSupabaseForSession(session);
    const { data: userData } = await supabase
      .from('profiles').select('active_store_id').eq('id', session.user.id).single();
    if (!userData?.active_store_id) {
      return NextResponse.json({ error: 'Tienda no configurada' }, { status: 400 });
    }
    const storeId = userData.active_store_id;

    const { canManageStore } = await import('@/lib/roles');
    if (!canManageStore(session.user, storeId)) {
      return NextResponse.json({ error: 'No tienes acceso a esta tienda' }, { status: 403 });
    }

    // Idempotencia: la misma clave ya registrada devuelve el documento original
    // (nunca un segundo registro) — un doble clic no duplica el ajuste.
    const key = idempotency_key || crypto.randomUUID();
    const { data: existing } = await supabase
      .from('payment_transactions')
      .select('id, direction, amount, notes, payment_date')
      .eq('store_id', storeId)
      .eq('ref_type', 'adjustment')
      .eq('idempotency_key', key)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ adjustment: existing, idempotent_replay: true }, { status: 200 });
    }

    const { data, error } = await supabase
      .from('payment_transactions')
      .insert({
        store_id: storeId,
        ref_type: 'adjustment',
        ref_id: null,
        transaction_id: null,
        direction,
        amount,
        payment_method: 'cash',
        currency: 'CUP',
        exchange_rate: 1,
        payment_date: `${payment_date}T12:00:00+00:00`,
        notes: note,
        paid_by: session.user.id || null,
        idempotency_key: key,
        // amount_cup es GENERATED: currency CUP → amount_cup = amount.
      })
      .select('id, direction, amount, notes, payment_date, paid_by, created_at')
      .single();

    if (error) {
      if (error.code === '23514') {
        // CHECK ref_type: entorno sin la migración 20261012000001.
        return NextResponse.json(
          { error: 'El entorno no soporta ajustes todavía (migración 20261012000001 pendiente). Coordinar con el mantenedor.' },
          { status: 409 },
        );
      }
      if (error.code === '23505') {
        return NextResponse.json({ error: 'El ajuste ya fue registrado (idempotencia).' }, { status: 409 });
      }
      console.error('[cash-report/adjustments] POST error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ adjustment: data }, { status: 201 });
  } catch (err: unknown) {
    const e = err as { message?: string };
    return NextResponse.json({ error: e?.message || 'Error interno' }, { status: 500 });
  }
}

export const GET = withAuth(getHandler);
export const POST = withAuth(withSecurity(postHandler, {
  rateLimitKey: 'cash-report-adjustments:post',
  maxRequests: 10,
}));
