import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { rateLimit } from '@/lib/rate-limit';
import { validateOrigin } from '@/lib/csrf';
import { withTracing } from '@/lib/observability';
import { getSupabaseAdminSafe as getSupabaseAdmin } from '@/lib/supabase-admin';
import { z } from 'zod';
import { uuidRegex } from '@/validation/schemas';

/**
 * MISIÓN CP-CASH-OPENING-001 — APERTURA DE TURNO por la vía autoritativa.
 *
 * El RPC `open_cash_shift` (v2.24.1, reemitido en 20261027000000; ACL
 * service_role-only) es la única apertura que calcula server-side:
 *   · el saldo esperado del LIBRO FÍSICO por moneda (get_cash_currency_summary
 *     — NUNCA el esperado canónico: un residuo de valoración no puede
 *     prellenarse como «Fondo Inicial de Efectivo»);
 *   · la diferencia documentada de apertura (contado − libro) con nota de
 *     causa OBLIGATORIA (≥ 10 caracteres) cuando difiere — jamás un ingreso
 *     o egreso automático;
 *   · la apertura canónica CUP (billetes CUP + billetes USD a la tasa vigente
 *     del servidor) como base del arqueo al cierre;
 *   · idempotencia (idempotency_registry) + un solo turno pendiente por
 *     tienda (índice único) + auditoría atómica (CASH_SHIFT_OPENED).
 *
 * La ruta reemplaza el INSERT directo client-side (cashService.createClosure)
 * que calculaba todo en el cliente SIN ninguna de esas garantías. Si el RPC
 * no existe aún en el esquema (entorno sin la migración aplicada), responde
 * 501 { fallback: true } para que el cliente degrade al INSERT legado bajo
 * RLS — nunca bloquea la operación de abrir caja.
 */

const openSchema = z.object({
  store_id: z.string().regex(uuidRegex),
  /** Billetes CUP contados al abrir (fondo inicial físico CUP). */
  counted_cup: z.number().min(0).refine((n) => n === Math.round(n * 100) / 100, {
    message: 'Máximo 2 decimales',
  }),
  /** Billetes USD contados al abrir (fondo inicial físico USD). */
  counted_usd: z.number().min(0).refine((n) => n === Math.round(n * 100) / 100, {
    message: 'Máximo 2 decimales',
  }).default(0),
  /** Notas de apertura (libre). */
  opening_note: z.string().max(1000).optional().nullable(),
  /** Motivo de la diferencia contado − libro físico (exigido por el RPC). */
  difference_note: z.string().max(1000).optional().nullable(),
  /** Clave de idempotencia estable por apertura lógica (patrón v2.26). */
  idempotency_key: z.string().max(128).optional().nullable(),
});

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  if (!validateOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { allowed } = await rateLimit(`cash-open:${session.user.id}`, { windowMs: 60_000, maxRequests: 10 });
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const body = await req.json();
  const parsed = openSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid data', details: parsed.error.format() }, { status: 400 });

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  const { data, error } = await supabaseAdmin.rpc('open_cash_shift', {
    p_store_id: parsed.data.store_id,
    p_opening_balance_cup: parsed.data.counted_cup,
    p_opening_balance_usd: parsed.data.counted_usd ?? 0,
    p_opening_note: parsed.data.opening_note || null,
    p_difference_note: parsed.data.difference_note || null,
    p_idempotency_key: parsed.data.idempotency_key || null,
    p_user_id: session.user.id,
  });

  if (error) {
    const msg = error.message || '';
    // RPC ausente del esquema (entorno sin 20261024120000 aplicada): degradación
    // explícita — el cliente usa el INSERT legado bajo RLS (comportamiento previo).
    if (error.code === 'PGRST202' || /Could not find (the )?function/i.test(msg)) {
      return NextResponse.json(
        { error: 'RPC open_cash_shift no disponible en este entorno', fallback: true },
        { status: 501 },
      );
    }
    if (msg.includes('ERR_SHIFT_ALREADY_OPEN')) {
      return NextResponse.json(
        { error: 'Ya existe un turno pendiente para esta tienda. Cierra el turno actual antes de abrir uno nuevo.' },
        { status: 409 },
      );
    }
    if (msg.includes('ERR_OPENING_DIFFERENCE_NOTE_REQUIRED')) {
      return NextResponse.json({ error: msg, code: 'ERR_OPENING_DIFFERENCE_NOTE_REQUIRED' }, { status: 422 });
    }
    if (msg.includes('ERR_EXCHANGE_RATE_UNAVAILABLE')) {
      return NextResponse.json(
        { error: 'No hay tasa USD configurada para la tienda: configura la tasa antes de declarar apertura en USD.' },
        { status: 409 },
      );
    }
    if (msg.includes('ERR_FORBIDDEN_ROLE') || msg.includes('ERR_UNAUTHORIZED')) {
      return NextResponse.json({ error: 'No autorizado para abrir turno en esta tienda' }, { status: 403 });
    }
    if (msg.includes('ERR_INVALID_AMOUNT') || msg.includes('ERR_AMOUNT_PRECISION')) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (msg.includes('ERR_IDEMPOTENCY_KEY_REUSE')) {
      return NextResponse.json({ error: 'Reintento inconsistente: cambia los valores o intenta de nuevo' }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ success: true, ...(data as object || {}) });
}

export const POST = withTracing(
  withAuth(postHandler as Parameters<typeof withAuth>[0]) as Parameters<typeof withTracing>[0],
  'POST /api/cash-closures/open'
);
