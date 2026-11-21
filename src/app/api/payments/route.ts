import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { getSupabaseForSession } from '@/lib/supabase-session';
import { withSecurity } from '@/lib/with-security';
import { canManageStore } from '@/lib/roles';
import { z } from 'zod';
import { uuidLoose } from '@/validation/api-schemas';
import { randomUUID } from 'crypto';
// MISIÓN SERVICIOS RECIBIDOS (2026-10-23): misma convención que
// /api/production-orders/[id]/payments — la fecha financiera del pago es un
// dato de cliente NO confiable; el backdating legítimo («fechas históricas»,
// V2.12.32) se conserva, pero NUNCA futuro: tope HOY (día de negocio
// America/Havana) → 422 accionable. El RPC register_supplier_payment ya
// acepta p_payment_date (DEFAULT NULL → NOW()); esta ruta nunca lo pasaba.
import { checkNotFutureOperationDate } from '@/lib/pos/operation-date';

// ── Schema de validación para un pago individual ──
const paymentRowSchema = z.object({
  payment_method: z.enum(['cash', 'transfer', 'external_transfer', 'zelle']),
  amount: z.number().positive(),
  currency: z.string().default('CUP'),
  exchange_rate: z.number().positive().default(1.0),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// ── Schema para registro de pago (soporta 1 o múltiples filas) ──
// FIX-FASE-0.4 (2026-07-13): soporta payments[] para pago mixto multi-moneda
// (mismo patrón que el POS). Backward compatible: si envías `amount` + `payment_method`
// en el root, funciona como antes (pago simple).
const registerPaymentSchema = z.object({
  ref_type: z.enum(['receipt', 'service', 'production_order', 'work']),
  ref_id: uuidLoose,
  // Opción A: pago simple (1 fila)
  payment_method: z.enum(['cash', 'transfer', 'external_transfer', 'zelle']).optional(),
  amount: z.number().positive().optional(),
  currency: z.string().default('CUP'),
  exchange_rate: z.number().positive().default(1.0),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  // Opción B: pago mixto (múltiples filas, como el POS)
  payments: z.array(paymentRowSchema).optional(),
  // Idempotencia: si se envía, previene doble-click
  idempotency_key: z.string().optional(),
  // V2.12.32 (paridad con production-orders/payments): fecha financiera del
  // pago, opcional para soportar fechas históricas. Si se omite, el RPC usa
  // NOW(). Formato ISO 8601 (ej: "2026-07-20T12:00:00Z"). Aplica a TODAS las
  // filas del envío (pago simple o mixto comparten la fecha del dinero).
  payment_date: z.string().datetime().optional(),
}).refine(
  (data) => data.payments || (data.amount !== undefined && data.payment_method !== undefined),
  { message: 'Debe enviar `payments` (array) o `amount` + `payment_method` en el root' }
);

// ── POST: Registrar pago(s) a proveedor ──
async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const body = await req.json();
    const parsed = registerPaymentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { ref_type, ref_id, idempotency_key, payment_date } = parsed.data;

    // MISIÓN SERVICIOS RECIBIDOS: gate de fecha — nunca futuro (tope HOY día
    // de negocio Habana). El piso de 6 meses y la semántica completa los
    // impone validate_operation_date en la BD (fuente de verdad); aquí solo
    // se rechaza lo inmediatamente inadmisible con un 422 accionable.
    if (payment_date) {
      const dateCheck = checkNotFutureOperationDate(payment_date);
      if (!dateCheck.ok) {
        return NextResponse.json(
          { error: 'Fecha del pago no admisible', message: dateCheck.error, code: 'ERR_FUTURE_OPERATION_DATE' },
          { status: 422 }
        );
      }
    }

    // Normalizar a array de pagos
    const payments = parsed.data.payments || [{
      payment_method: parsed.data.payment_method!,
      amount: parsed.data.amount!,
      currency: parsed.data.currency,
      exchange_rate: parsed.data.exchange_rate,
      reference: parsed.data.reference || null,
      notes: parsed.data.notes || null,
    }];

    if (payments.length === 0) {
      return NextResponse.json({ error: 'Debe incluir al menos un pago' }, { status: 400 });
    }

    const supabase = getSupabaseForSession(session);

    // Obtener store_id del usuario
    const { data: userData, error: userError } = await supabase
      .from('profiles')
      .select('active_store_id')
      .eq('id', session.user.id)
      .single();

    if (userError || !userData?.active_store_id) {
      return NextResponse.json({ error: 'Tienda no configurada' }, { status: 400 });
    }

    const storeId = userData.active_store_id;

    // ─── ADN-009 (§5): autorización de GESTIÓN en la tienda activa ANTES de
    // cualquier operación privilegiada. El store_id activo no es autorización
    // por sí mismo (canon roles.ts: canManageStore para toda ruta que escriba
    // recursos scoped por tienda). Deny por defecto: clerk/warehouse/usuario/
    // costo registran pagos solo si su módulo lo permite vía su propia ruta.
    if (!canManageStore(session.user, storeId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // ─── ADN-008 §5: liquidación multipago ATÓMICA para servicios ───
    // register_supplier_payment_batch inserta TODOS los componentes en UNA
    // transacción (pre-check de la suma contra el saldo pendiente en la moneda
    // del documento + idempotencia de bloque '<key>:<i>' + reuso íntegro del
    // motor register_supplier_payment: tasas fail-closed, overpay, asientos
    // 'pago' por componente vía fin_trg_payment_transactions).
    // El loop no transaccional permanece SOLO para los demás ref_types
    // (receipt / production_order / work) — fuera del alcance de la misión 008.
    //
    // ─── ADN-009 (§5, Alternativa A): la RPC batch es service_role EXCLUSIVA
    // (REVOKE authenticated — alineado a CP-FIN-004 y al canal exclusivo del
    // motor que envuelve). Toda la autorización ocurre AQUÍ antes de la
    // llamada privilegiada: canManageStore (gate de gestión arriba) + actor
    // validado de la sesión server-side (p_paid_by = session.user.id — NUNCA
    // un parámetro del cliente). La llamada privilegiada usa el cliente
    // service_role; el resto de la ruta no cambia.
    if (ref_type === 'service') {
      const admin = getSupabaseAdminSafe();
      if (!admin) {
        return NextResponse.json({ error: 'CONFIG_ERROR' }, { status: 500 });
      }
      const { data: batchResult, error: batchErr } = await admin.rpc('register_supplier_payment_batch', {
        p_store_id: storeId,
        p_ref_type: ref_type,
        p_ref_id: ref_id,
        p_payments: payments.map((p) => ({
          payment_method: p.payment_method,
          amount: p.amount,
          currency: p.currency,
          exchange_rate: p.exchange_rate,
          reference: p.reference || null,
          notes: p.notes || null,
        })),
        p_paid_by: session.user.id,
        ...(payment_date ? { p_payment_date: payment_date } : {}),
        p_idempotency_key: idempotency_key || null,
      });

      if (batchErr) {
        const msg = batchErr.message || '';
        // Rechazos del gate de fechas de la BD → 422 accionable.
        if (batchErr.code === 'P0001' && (msg.includes('ERR_FUTURE_DATED_DOCUMENT') || msg.includes('ERR_BACKDATED_DOCUMENT'))) {
          return NextResponse.json(
            { error: 'Fecha del pago no admisible', message: msg, code: msg.includes('ERR_FUTURE') ? 'ERR_FUTURE_DATED_DOCUMENT' : 'ERR_BACKDATED_DOCUMENT' },
            { status: 422 }
          );
        }
        // Tasa ausente para divisa → 422 accionable (configurable en Tasas).
        if (msg.includes('ERR_TASA_NO_DISPONIBLE')) {
          return NextResponse.json({ error: msg, code: 'ERR_TASA_NO_DISPONIBLE' }, { status: 422 });
        }
        // Overpay (pre-check del lote o del componente) → 400.
        if (msg.includes('excede el saldo') || msg.includes('ERR_BATCH_OVERPAY')) {
          return NextResponse.json({ error: msg, code: 'ERR_BATCH_OVERPAY' }, { status: 400 });
        }
        // Componentes inválidos (medio/moneda/importe) o tamaño del lote → 400.
        if (msg.includes('ERR_COMPONENT_INVALID') || msg.includes('ERR_BATCH_SIZE')) {
          return NextResponse.json({ error: msg, code: 'ERR_BATCH_INVALID' }, { status: 400 });
        }
        // ADN-009: combinación medio×moneda no soportada (Transf. Exterior solo
        // USD/EUR) → 400 accionable (espejo POS CP-FIN-004).
        if (msg.includes('ERR_COMBINACION_NO_SOPORTADA')) {
          return NextResponse.json({ error: msg, code: 'ERR_COMBINACION_NO_SOPORTADA' }, { status: 400 });
        }
        // ADN-009: estado del documento tras el lock — solo un servicio ACTIVO
        // admite pagos (borrador sin obligación / anulado sin liquidación).
        if (msg.includes('ERR_SERVICE_NOT_ACTIVE')) {
          return NextResponse.json({ error: msg, code: 'ERR_SERVICE_NOT_ACTIVE' }, { status: 409 });
        }
        console.error('[payments] Error RPC batch:', batchErr);
        return NextResponse.json({ error: msg || 'Error al registrar el pago' }, { status: 500 });
      }

      const rows = (batchResult?.payments ?? []) as { id: string; index: number; payment_method: string; currency: string; amount: number; replayed?: boolean }[];
      return NextResponse.json({
        success: true,
        payments: rows.map((r) => ({ id: r.id, method: r.payment_method, amount: r.amount, currency: r.currency })),
        count: batchResult?.count ?? rows.length,
        replayed: batchResult?.replayed === true,
      }, { status: 201 });
    }

    // Registrar cada pago dentro de la misma idempotency key (con sufijo por índice)
    // Esto permite que un pago mixto de 3 filas sea idempotente como bloque.
    // NOTA ADN-008: para ref_type='service' este loop fue sustituido por el RPC
    // transaccional register_supplier_payment_batch (arriba).
    const results: { id: string; method: string; amount: number; currency: string }[] = [];

    for (let i = 0; i < payments.length; i++) {
      const p = payments[i];
      const idemKey = idempotency_key
        ? `${idempotency_key}:${i}`
        : null;

      const { data, error } = await supabase.rpc('register_supplier_payment', {
        p_store_id: storeId,
        p_ref_type: ref_type,
        p_ref_id: ref_id,
        p_amount: p.amount,
        p_payment_method: p.payment_method,
        p_currency: p.currency,
        p_exchange_rate: p.exchange_rate,
        p_reference: p.reference || null,
        p_notes: p.notes || null,
        p_paid_by: session.user.id,
        p_idempotency_key: idemKey,
        // V2.12.32: fecha financiera del pago (fechas históricas). Solo se
        // pasa si se especificó — el RPC usa NOW() por defecto.
        ...(payment_date ? { p_payment_date: payment_date } : {}),
      });

      if (error) {
        // MISIÓN SERVICIOS RECIBIDOS: rechazos del gate de fechas de la BD
        // (validate_operation_date) → 422 accionable, no 500 opaco.
        if (error.code === 'P0001' && (error.message.includes('ERR_FUTURE_DATED_DOCUMENT') || error.message.includes('ERR_BACKDATED_DOCUMENT'))) {
          return NextResponse.json(
            { error: 'Fecha del pago no admisible', message: error.message, code: error.message.includes('ERR_FUTURE') ? 'ERR_FUTURE_DATED_DOCUMENT' : 'ERR_BACKDATED_DOCUMENT' },
            { status: 422 }
          );
        }
        // Si ya existe (idempotency replay), el RPC devuelve el ID existente
        // pero Supabase puede reportar error. Verificamos el código.
        if (error.code === 'P0001' && error.message.includes('excede el saldo')) {
          return NextResponse.json(
            { error: `Pago ${i + 1}: excede el saldo pendiente. Overpay no permitido.`, payment_index: i },
            { status: 400 }
          );
        }
        console.error('[payments] Error RPC:', error);
        return NextResponse.json(
          { error: error.message, payment_index: i },
          { status: 500 }
        );
      }

      results.push({
        id: data,
        method: p.payment_method,
        amount: p.amount,
        currency: p.currency,
      });
    }

    return NextResponse.json({
      success: true,
      payments: results,
      count: results.length,
    }, { status: 201 });
  } catch (error: any) {
    console.error('[payments] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ── GET: Listar pagos de un documento ──
// FIX-AUD5-H1 (2026-07-13): store_id obligatorio para prevenir cross-store
// data leakage si RLS falla. Antes era opcional y dependía solo de RLS.
async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const { searchParams } = new URL(req.url);
    const ref_type = searchParams.get('ref_type');
    const ref_id = searchParams.get('ref_id');
    const store_id = searchParams.get('store_id');

    if (!ref_type || !ref_id) {
      return NextResponse.json({ error: 'ref_type y ref_id son requeridos' }, { status: 400 });
    }

    if (!store_id) {
      return NextResponse.json({ error: 'store_id es requerido' }, { status: 400 });
    }

    const supabase = getSupabaseForSession(session);

    // FIX-AUD5-H1: siempre filtrar por store_id (no opcional)
    const { data, error } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('ref_type', ref_type)
      .eq('ref_id', ref_id)
      .eq('store_id', store_id)
      .order('payment_date', { ascending: false });

    if (error) {
      console.error('[payments] Error fetching:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error: any) {
    console.error('[payments] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const POST = withAuth(withSecurity(postHandler, {
  rateLimitKey: 'payments:post',
  maxRequests: 10,
}));
export const GET = withAuth(getHandler);
