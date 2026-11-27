import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { getSupabaseForSession } from '@/lib/supabase-session';
import { withSecurity } from '@/lib/with-security';
import { canManageStore } from '@/lib/roles';
import { z } from 'zod';
import { uuidLoose } from '@/validation/api-schemas';
import { randomUUID } from 'crypto';
import { checkNotFutureOperationDate } from '@/lib/pos/operation-date';

/**
 * R-03 — CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 §0.1 (decisión del propietario):
 * PAGOS MÚLTIPLES DE ÓRDENES DE TRABAJO = OPERACIÓN PARCIAL.
 *
 *   Regla fundamental: INDEPENDENCIA entre órdenes, ATOMICIDAD dentro de cada
 *   orden. Un fallo en una OT NO revierte los pagos correctos de las demás;
 *   y dentro de una OT, todos sus componentes se confirman en una sola
 *   transacción o ninguno (sin pagos parciales dentro de la orden).
 *
 * POST /api/payments/ot-batch
 *   { items: [{ ref_id, payments: [{ payment_method, amount, currency?,
 *               exchange_rate?, reference?, notes? }] }],
 *     payment_date?, idempotency_key? }
 *
 * Por CADA orden se ejecuta UNA llamada a register_ot_payment_batch (RPC
 * service_role exclusivo, migration 20261127140000) = UNA transacción
 * independiente: o se confirman todos los componentes de esa OT o ninguno.
 * Los fallos se recogen por ítem y NO abortan el lote (convención bulk-pay).
 *
 * Autorización canónica (patrón R-25 / ADN-009 §5):
 *   1) withAuth (sesión verificada server-side)
 *   2) identidad desde la sesión (session.user.id — NUNCA parámetro del cliente)
 *   3) tienda real del contexto validado (profiles.active_store_id)
 *   4) gate de gestión canManageStore ANTES de cualquier privilegio
 *   5) cada OT se contrasta contra la tienda con el cliente de sesión (RLS)
 *      antes de la llamada privilegiada; el RPC re-valida autoritativamente
 *      (FOR UPDATE + pertenencia de tienda + gate de estado)
 *   6) cliente administrativo exclusivamente server-side (nunca al navegador)
 *   7) actor real p_paid_by + idempotencia por bloque de OT.
 */

const otPaymentRowSchema = z.object({
  payment_method: z.enum(['cash', 'transfer', 'external_transfer', 'zelle']),
  amount: z.number().positive(),
  currency: z.string().default('CUP'),
  exchange_rate: z.number().positive().default(1.0),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const otBatchItemSchema = z.object({
  ref_id: uuidLoose,
  payments: z.array(otPaymentRowSchema).min(1).max(20),
});

const otBatchSchema = z.object({
  items: z.array(otBatchItemSchema).min(1).max(50),
  // Fecha financiera común del lote (opcional; nunca futuro — tope HOY Habana).
  payment_date: z.string().datetime().optional(),
  // Clave de idempotencia del LOTE: genera un bloque por orden
  // `otb:<key>:<ref_id>` (reintento del lote = replay sin duplicar pagos).
  // Si se omite, cada request es una operación nueva (idempotencia opcional,
  // convención /api/payments).
  idempotency_key: z.string().optional(),
});

type OtItemResult = {
  ref_id: string;
  order_number: string | null;
  success: boolean;
  amount_requested: number;
  amount_registered?: number;
  payment_ids?: string[];
  replayed?: boolean;
  error_code?: string;
  message?: string;
  retryable?: boolean;
  idempotency_key?: string;
};

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const raw = await req.json();
    const parsed = otBatchSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Cuerpo inválido', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const body = parsed.data;

    // Un mismo ref_id dos veces en el payload es ambiguo para la idempotencia
    // por bloque → rechazo determinista (misma convención que ERR_BATCH_SIZE).
    const seen = new Set<string>();
    for (const it of body.items) {
      if (seen.has(it.ref_id)) {
        return NextResponse.json(
          { error: `ERR_BATCH_DUPLICATE: la orden ${it.ref_id} aparece más de una vez en el lote`, code: 'ERR_BATCH_DUPLICATE' },
          { status: 400 }
        );
      }
      seen.add(it.ref_id);
    }

    const supabase = getSupabaseForSession(session);
    const { data: userData, error: userError } = await supabase
      .from('profiles')
      .select('active_store_id')
      .eq('id', session.user.id)
      .single();

    if (userError || !userData?.active_store_id) {
      return NextResponse.json({ error: 'Tienda no configurada' }, { status: 400 });
    }
    const storeId = userData.active_store_id;

    // Gate de GESTIÓN canónico ANTES de cualquier operación privilegiada
    // (canon roles.ts — deny por defecto: clerk/warehouse/usuario/costo → 403).
    if (!canManageStore(session.user, storeId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fecha financiera del lote: dato de cliente NO confiable — nunca futuro.
    if (body.payment_date) {
      const dateCheck = checkNotFutureOperationDate(body.payment_date);
      if (!dateCheck.ok) {
        return NextResponse.json(
          { error: 'Fecha del pago no admisible', message: dateCheck.error, code: 'ERR_FUTURE_OPERATION_DATE' },
          { status: 422 }
        );
      }
    }

    const admin = getSupabaseAdminSafe();
    if (!admin) {
      return NextResponse.json({ error: 'CONFIG_ERROR' }, { status: 500 });
    }

    const results: OtItemResult[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const item of body.items) {
      const amountRequested = item.payments.reduce((s, p) => s + p.amount, 0);
      // Bloque de idempotencia POR ORDEN: el reintento del lote (misma clave)
      // reusa el bloque de cada OT ya aplicada (replay) y solo procesa las
      // que fallaron — sin duplicar pagos anteriores.
      const blockKey = body.idempotency_key
        ? `otb:${body.idempotency_key}:${item.ref_id}`
        : `otb:req:${randomUUID()}:${item.ref_id}`;

      try {
        // Pre-check RLS con el cliente de sesión (sin fuga de información
        // entre tiendas): la OT debe existir y pertenecer a la tienda activa.
        // El RPC re-valida autoritativamente bajo FOR UPDATE.
        const { data: orderRow, error: orderErr } = await supabase
          .from('production_orders')
          .select('id, store_id, order_number, order_type, status')
          .eq('id', item.ref_id)
          .single();

        if (orderErr || !orderRow) {
          results.push({
            ref_id: item.ref_id, order_number: null, success: false,
            amount_requested: amountRequested,
            error_code: 'ERR_ORDER_NOT_FOUND', message: 'Orden no encontrada', retryable: false,
          });
          errorCount++;
          continue;
        }
        if (orderRow.store_id !== storeId) {
          results.push({
            ref_id: item.ref_id, order_number: orderRow.order_number ?? null, success: false,
            amount_requested: amountRequested,
            error_code: 'ERR_ORDER_STORE_MISMATCH', message: 'La orden no pertenece a esta tienda', retryable: false,
          });
          errorCount++;
          continue;
        }

        const refType = orderRow.order_type === 'work' ? 'work' : 'production_order';
        const { data: batchResult, error: rpcError } = await admin.rpc('register_ot_payment_batch', {
          p_store_id: storeId,
          p_ref_type: refType,
          p_ref_id: item.ref_id,
          p_payments: item.payments.map((p) => ({
            payment_method: p.payment_method,
            amount: p.amount,
            currency: p.currency,
            exchange_rate: p.exchange_rate,
            reference: p.reference || null,
            notes: p.notes || null,
          })),
          p_paid_by: session.user.id,
          ...(body.payment_date ? { p_payment_date: body.payment_date } : {}),
          p_idempotency_key: blockKey,
        });

        if (rpcError) {
          const msg = rpcError.message || '';
          // Rechazos del motor — clasificación accionable por ítem.
          const map: [string, string, boolean][] = [
            ['ERR_ORDER_NOT_PAYABLE', 'ERR_ORDER_NOT_PAYABLE', false],
            ['ERR_BATCH_OVERPAY', 'ERR_BATCH_OVERPAY', false],
            ['excede el saldo', 'ERR_BATCH_OVERPAY', false],
            ['ERR_TASA_NO_DISPONIBLE', 'ERR_TASA_NO_DISPONIBLE', false],
            ['ERR_COMBINACION_NO_SOPORTADA', 'ERR_COMBINACION_NO_SOPORTADA', false],
            ['ERR_COMPONENT_INVALID', 'ERR_BATCH_INVALID', false],
            ['ERR_BATCH_SIZE', 'ERR_BATCH_INVALID', false],
            ['ERR_FUTURE_DATED_DOCUMENT', 'ERR_FUTURE_DATED_DOCUMENT', false],
            ['ERR_BACKDATED_DOCUMENT', 'ERR_BACKDATED_DOCUMENT', false],
            ['no pertenece a la tienda', 'ERR_ORDER_STORE_MISMATCH', false],
            ['Documento no encontrado', 'ERR_ORDER_NOT_FOUND', false],
          ];
          let mapped: { code: string; retryable: boolean } | null = null;
          for (const [needle, code, retryable] of map) {
            if (msg.includes(needle)) { mapped = { code, retryable }; break; }
          }
          results.push({
            ref_id: item.ref_id, order_number: orderRow.order_number ?? null, success: false,
            amount_requested: amountRequested,
            error_code: mapped?.code || 'ERR_RPC_UNEXPECTED',
            message: msg || 'Error al registrar el pago de la orden',
            retryable: mapped?.retryable ?? true,
            idempotency_key: body.idempotency_key || undefined,
          });
          errorCount++;
          continue;
        }

        const rows = (batchResult?.payments ?? []) as { id: string; amount: number; replayed?: boolean }[];
        results.push({
          ref_id: item.ref_id, order_number: orderRow.order_number ?? null, success: true,
          amount_requested: amountRequested,
          amount_registered: rows.reduce((s, r) => s + Number(r.amount), 0),
          payment_ids: rows.map((r) => r.id),
          replayed: batchResult?.replayed === true,
          idempotency_key: body.idempotency_key || undefined,
        });
        successCount++;
      } catch (e: any) {
        results.push({
          ref_id: item.ref_id, order_number: null, success: false,
          amount_requested: amountRequested,
          error_code: 'ERR_ITEM_UNEXPECTED', message: e?.message || 'Error inesperado', retryable: true,
        });
        errorCount++;
      }
    }

    const status = errorCount === 0 ? 'all_success' : successCount === 0 ? 'all_failed' : 'partial';

    // Convención bulk-pay: 201 con resultados por ítem (una operación parcial
    // es una respuesta exitosa del endpoint aunque tenga ítems fallidos).
    return NextResponse.json({
      success: errorCount === 0,
      status,
      results,
      success_count: successCount,
      error_count: errorCount,
      total: body.items.length,
    }, { status: 201 });
  } catch (error: any) {
    console.error('[payments/ot-batch] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const POST = withAuth(withSecurity(postHandler, {
  rateLimitKey: 'payments:ot-batch',
  maxRequests: 10,
}));
