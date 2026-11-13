/**
 * API CP-FIN — Saldos iniciales (apertura financiera).
 *
 * GET  /api/fin/opening-balances?store_id=...   Lista de saldos (todos los estados).
 * POST /api/fin/opening-balances
 *      { action: 'create', category_code, amount, currency, exchange_rate?, as_of_date, notes? }
 *      { action: 'apply', id }   → RPC fin_apply_opening_balance (asiento de apertura)
 *      { action: 'void', id }    → solo borradores (status draft → voided)
 */
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { withSecurity } from '@/lib/with-security';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { getSupabaseForSession } from '@/lib/supabase-session';
import { z } from 'zod';

const createSchema = z.object({
  action: z.literal('create'),
  category_code: z.string().min(2).max(40),
  amount: z.number().positive(),
  currency: z.enum(['CUP', 'USD', 'EUR', 'MLC']).default('CUP'),
  exchange_rate: z.number().positive().optional(),
  as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().max(1000).nullable().optional(),
});

const idActionSchema = z.object({
  action: z.enum(['apply', 'void']),
  id: z.string().uuid(),
});

const bodySchema = z.union([createSchema, idActionSchema]);

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('store_id');
  if (!storeId) {
    return NextResponse.json({ error: 'store_id es requerido' }, { status: 400 });
  }
  const supabase = getSupabaseForSession(session);
  const { data, error } = await supabase
    .from('fin_opening_balances')
    .select(
      'id, category_code, amount, currency, exchange_rate, amount_cup, as_of_date, status, '
      + 'entry_id, notes, authorized_by, created_at, applied_at',
    )
    .eq('store_id', storeId)
    .order('created_at', { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ opening_balances: data ?? [] });
}

async function postHandler(request: NextRequest, session: AuthenticatedSession) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validación fallida', details: parsed.error.flatten() }, { status: 400 });
  }
  const admin = getSupabaseAdminSafe();
  if (!admin) {
    return NextResponse.json({ error: 'Servicio no disponible' }, { status: 503 });
  }

  // Tienda activa del perfil (TRUST BOUNDARY: nunca del body)
  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('active_store_id')
    .eq('id', session.user.id)
    .single();
  if (profileErr || !profile?.active_store_id) {
    return NextResponse.json({ error: 'Usuario sin tienda activa configurada' }, { status: 400 });
  }
  const storeId = profile.active_store_id;

  if (parsed.data.action === 'create') {
    const b = parsed.data;
    const rate = b.currency === 'CUP' ? 1 : b.exchange_rate;
    if (b.currency !== 'CUP' && !rate) {
      return NextResponse.json({ error: 'exchange_rate es requerido para moneda extranjera' }, { status: 400 });
    }
    const { data: created, error: insertErr } = await admin
      .from('fin_opening_balances')
      .insert({
        store_id: storeId,
        category_code: b.category_code,
        amount: b.amount,
        currency: b.currency,
        exchange_rate: rate ?? 1,
        amount_cup: Math.round((b.currency === 'CUP' ? b.amount : b.amount * (rate ?? 1)) * 100) / 100,
        as_of_date: b.as_of_date,
        notes: b.notes ?? null,
        created_by: session.user.id,
      })
      .select('id, category_code, amount, currency, amount_cup, as_of_date, status')
      .single();
    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: insertErr.code === '23505' ? 409 : 500 });
    }
    return NextResponse.json({ opening_balance: created }, { status: 201 });
  }

  if (parsed.data.action === 'apply') {
    const { data, error } = await admin.rpc('fin_apply_opening_balance', {
      p_id: parsed.data.id,
      p_user_id: session.user.id,
    });
    if (error) {
      const msg = error.message || '';
      return NextResponse.json(
        { error: msg, rpc_error: msg },
        { status: msg.includes('ERR_UNAUTHORIZED') ? 403 : msg.includes('ERR_OPENING_NOT_DRAFT') ? 409 : 500 },
      );
    }
    return NextResponse.json(data);
  }

  // void: solo borradores
  const { data: voided, error: voidErr } = await admin
    .from('fin_opening_balances')
    .update({ status: 'voided' })
    .eq('id', parsed.data.id)
    .eq('store_id', storeId)
    .eq('status', 'draft')
    .select('id, status')
    .single();
  if (voidErr || !voided) {
    return NextResponse.json({ error: 'Solo se pueden anular saldos en borrador' }, { status: 409 });
  }
  return NextResponse.json({ opening_balance: voided });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(withSecurity(postHandler, {
  rateLimitKey: 'fin-opening:post',
  maxRequests: 30,
}));
