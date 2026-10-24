import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAuthClient } from '@/lib/supabaseClient';
import { syncBatchSchema } from '@/validation/schemas';
import { withAuth } from '@/lib/auth-middleware';
import { rateLimit } from '@/lib/rate-limit';
import { validateOrigin } from '@/lib/csrf';
import { withTracing } from '@/lib/observability';
import { createApiError } from '@/lib/api-errors';
// F-21: validar tasa_cambio_recepcion antes de llamar a register_reception
import { validateReceiptItemsTasa } from '@/lib/receipt-items-validation';
// MISIÓN POLÍTICA TEMPORAL (2026-10-18): revalidación server-side de las
// fechas operativas encoladas offline (venta/recepción) — tope HOY Habana.
import { checkNotFutureOperationDate } from '@/lib/pos/operation-date';

export const runtime = 'nodejs';

const handler = withAuth(async (req, session) => {
  if (!validateOrigin(req)) {
    return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
  }

  const clientId = req.headers.get('x-forwarded-for') || session.user.id;
  const { allowed } = await rateLimit(clientId);
  if (!allowed) return new Response(JSON.stringify(createApiError('RATE_LIMITED')), { status: 429 });

  try {
    // FIX-BUG-LOG-008: Removed redundant supabase.auth.getUser() call;
    // withAuth already validates the session and provides session.user.id.
    const supabase = getSupabaseAuthClient(session.token);

    const body = await req.json();
    // FIX DEFECT-005 (FASE E2E-80): .parse() con body inválido (p.ej. operations
    // vacío) lanzaba excepción sin capturar → 500. safeParse → 400 limpio.
    const parsedBatch = syncBatchSchema.safeParse(body);
    if (!parsedBatch.success) {
      return NextResponse.json(
        { ...createApiError('INVALID_DATA'), details: parsedBatch.error.format() },
        { status: 400 },
      );
    }
    const batch = parsedBatch.data;

    // FIX-SEC-H3: Validate store membership for each operation in the batch
    const isAdmin = (session.user as any).role === 'admin';
    const memberships = (session.user as any).memberships || [];
    const accessibleStoreIds = new Set(
      memberships
        .filter((m: any) => m.status === 'active')
        .map((m: any) => m.store_id)
    );

    if (!isAdmin) {
      for (const op of batch.operations) {
        const opStoreId = op.payload?.p_store_id || op.payload?.store_id;
        if (opStoreId && !accessibleStoreIds.has(opStoreId)) {
          return NextResponse.json(
            { ...createApiError('STORE_ACCESS_DENIED'), operationKey: op.idempotencyKey },
            { status: 403 }
          );
        }
        // FIX-AUDIT-6: Validate destination_store_id for transfer operations
        if (op.entity === 'transfer') {
          const destStoreId = op.payload?.p_destination_store_id || op.payload?.destination_store_id;
          if (destStoreId && !accessibleStoreIds.has(destStoreId)) {
            return NextResponse.json(
              { ...createApiError('STORE_ACCESS_DENIED'), operationKey: op.idempotencyKey, direction: 'destination' },
              { status: 403 }
            );
          }
        }
      }
    }

    const results: unknown[] = [];

    // ── W4 (perf audit 2026-10-12) — reducción de round-trips SIN tocar el orden ──
    // Los RPCs de negocio (create_sale_v2, register_reception, perform_inventory_
    // adjustment, create_transfer) son orden-sensibles (inventario/costeo) y se
    // mantienen SECUENCIALES. Solo se paraleliza/pipelinea lo demostrablemente
    // independiente:
    //   a) Prefetch en paralelo de los logs de idempotencia: LECTURAS puras de
    //      sync_log por clave única; el resultado por clave es idéntico al chequeo
    //      secuencial que se hacía justo antes de cada op.
    //   b) Upserts de sync_log en pipeline con encadenamiento por clave (tablas
    //      distintas del RPC siguiente; mismo orden por clave que el await
    //      original). Se resuelven con allSettled ANTES de responder: misma
    //      garantía de durabilidad y mismo envelope de errores (los errores de
    //      upsert ya se ignoraban en el código original).
    const uniqueKeys = [...new Set(batch.operations.map((op) => op.idempotencyKey))];
    const logByKey = new Map<string, { data: any }>();
    await Promise.all(
      uniqueKeys.map(async (key) => {
        const { data } = await supabase
          .from('sync_log')
          .select('*')
          .eq('idempotency_key', key)
          .single();
        logByKey.set(key, { data });
      }),
    );

    const upsertTailByKey = new Map<string, Promise<unknown>>();
    const pendingUpserts: Promise<unknown>[] = [];
    const queueUpsert = (row: {
      idempotency_key: string;
      [k: string]: unknown;
    }) => {
      const key = row.idempotency_key;
      const tail = upsertTailByKey.get(key) ?? Promise.resolve();
      const p = tail.then(() => supabase.from('sync_log').upsert(row));
      upsertTailByKey.set(key, p);
      pendingUpserts.push(p);
    };

    // Dedupe dentro del batch: el prefetch de logs ocurre ANTES de ejecutar, así
    // que un duplicado no vería el log escrito por la 1ª ocurrencia. La 1ª
    // ocurrencia ejecuta; si su resultado es 'ok', los duplicados copian (misma
    // semántica que el re-check secuencial contra sync_log). Si la 1ª falló, el
    // duplicado reintenta (idéntico al flujo original: log status != 'ok' →
    // retry). Caso extremo (1ª falla, reintento ok, 3er duplicado): puede
    // reintentar el RPC una vez más, pero los RPCs son idempotentes por clave
    // (p_idempotency_key / unique index) y el conflicto se reporta como tal —
    // sin duplicación de movimientos.
    const firstResultIndexByKey = new Map<string, number>();

    for (const op of batch.operations) {
      const firstIdx = firstResultIndexByKey.get(op.idempotencyKey);
      if (firstIdx !== undefined) {
        const prev = results[firstIdx] as { status?: string } | undefined;
        if (prev?.status === 'ok') {
          results.push({ ...prev, idempotencyKey: op.idempotencyKey });
          continue;
        }
        // 1ª ocurrencia falló → el duplicado reintenta (semántica original)
      } else {
        firstResultIndexByKey.set(op.idempotencyKey, results.length);
      }

      // F-21: para recepciones, validar tasa_cambio_recepcion antes de tocar la RPC.
      // Si el item viola la regla (moneda != CUP y tasa <= 1.5), se rechaza con
      // 400 para que el cliente pueda corregir y reintentar — no se encola.
      if (op.entity === 'reception' && Array.isArray(op.payload?.p_items)) {
        const tasaValidation = validateReceiptItemsTasa(op.payload.p_items);
        if (!tasaValidation.valid) {
          results.push({
            idempotencyKey: op.idempotencyKey,
            status: 'error',
            error: (process.env.NODE_ENV !== 'production' || !!process.env.VITEST)
              ? `F-21: ${tasaValidation.error} — ${tasaValidation.details}`
              : 'Tasa de cambio inválida',
          });
          // Registrar en sync_log para que el cliente pueda ver el rechazo (pipeline W4).
          queueUpsert({
            idempotency_key: op.idempotencyKey,
            user_id: session.user.id,
            entity: op.entity,
            operation_type: op.operationType,
            status: 'error',
            response_data: {
              error: 'ERR_F21_TASA_INVALIDA',
              message: tasaValidation.details,
            },
            store_id: op.payload?.p_store_id || null,
          });
          continue;
        }
      }

      // 1. Check idempotency (prefetch paralelo W4 — sin I/O en este punto)
      const { data: existingLog } = logByKey.get(op.idempotencyKey) ?? { data: null };

      if (existingLog) {
        if (existingLog.status === 'ok') {
          results.push({
            idempotencyKey: op.idempotencyKey,
            status: 'ok',
            serverId: existingLog.response_data?.id,
            serverData: existingLog.response_data,
          });
          continue;
        }
        // If it failed before, we retry
      }

      // 2. Execute operation
      let result;
      try {
        // ─── MISIÓN POLÍTICA TEMPORAL (2026-10-18) ───
        // El payload offline encolado es dato de cliente NO confiable: las
        // fechas operativas (venta: p_operation_date; recepción: p_reception_date)
        // se revalidan en el servidor antes de ejecutar el RPC — tope HOY como
        // día de negocio (America/Havana). El offline no puede colar documentos
        // futuros que el camino online ya rechaza con 422 (paridad de capas).
        {
          const opDate =
            op.entity === 'sale' ? op.payload?.p_operation_date
            : op.entity === 'reception' ? op.payload?.p_reception_date
            : undefined;
          if (opDate) {
            const dateCheck = checkNotFutureOperationDate(opDate);
            if (!dateCheck.ok) {
              results.push({
                idempotencyKey: op.idempotencyKey,
                status: 'error',
                error: 'ERR_FUTURE_OPERATION_DATE',
                message: dateCheck.error,
              });
              queueUpsert({
                idempotency_key: op.idempotencyKey,
                user_id: session.user.id,
                entity: op.entity,
                operation_type: op.operationType,
                status: 'error',
                response_data: {
                  error: 'ERR_FUTURE_OPERATION_DATE',
                  message: dateCheck.error,
                },
                store_id: op.payload?.p_store_id || null,
              });
              continue;
            }
          }
        }
        switch (op.entity) {
          case 'sale':
            // Iteración 11.2 (TD-11.2.1 resolved): Use create_sale_v2 for offline sync.
            // Map old payload to v2 format (v2 generates transaction_id internally,
            // accepts customer_id/supervisor_user_id, doesn't accept p_transaction_id/p_warehouse_id).
            {
              const v2Payload = {
                p_store_id: op.payload.p_store_id,
                // H0-R §10 (defensa en profundidad): el payload offline encolado
                // es dato de cliente NO confiable — el vendedor se DERIVA de la
                // sesión verificada del servidor. El RPC igualmente exige
                // p_seller_id == actor (ERR_SELLER_MISMATCH, §4).
                p_seller_id: session.user.id,
                p_items: op.payload.p_items,
                p_payment_method: op.payload.p_payment_method || 'cash',
                p_discount_type: op.payload.p_discount_type || 'fixed',
                p_discount_value: op.payload.p_discount_value || 0,
                p_applied_taxes: op.payload.p_applied_taxes || [],
                p_tax_amount: op.payload.p_tax_amount || 0,
                p_total_amount: op.payload.p_total_amount || 0,
                p_subtotal: op.payload.p_subtotal || 0,
                p_cash_amount: op.payload.p_cash_amount || 0,
                p_transfer_amount: op.payload.p_transfer_amount || 0,
                p_zelle_amount: op.payload.p_zelle_amount || 0,
                p_sale_currency: op.payload.p_sale_currency || 'CUP',
                p_sale_exchange_rate: op.payload.p_sale_exchange_rate || 1,
                p_customer_id: op.payload.p_customer_id || null,
                p_customer_name: op.payload.p_customer_name || null,
                p_supervisor_user_id: op.payload.p_supervisor_user_id || null,
                // E-SEC-FINAL (D2): motivo del descuento autorizado encolado
                // offline. La obligatoriedad la valida create_sale_v2 (self-
                // session path: RC-1 exige sup==auth.uid()).
                p_discount_reason: op.payload.p_discount_reason || null,
                // FIX CP-POS-007 (auditoría 2026-10-16): la nota del cajero
                // encolada offline se reenvía al RPC. create_sale_v2 la une con
                // la nota automática de incidencias SIN sobrescribirla
                // (v_notes_final, migración 20261017000000).
                //
                // FIX AMBIGÜEDAD DE OVERLOAD (2026-10-18 — misión Fechas de
                // Trabajo): p_notes y p_payment_incidents SIEMPRE presentes
                // (mismas claves que /api/pos/checkout) para resolver el
                // overload de 26 params (PGRST203 — ver el comentario completo
                // en esa ruta y la migración companion 20261018000001).
                p_notes: op.payload.p_notes || null,
                p_idempotency_key: op.idempotencyKey,
                p_operation_date: op.payload.p_operation_date || null,
                p_user_id: session.user.id,
                p_payment_incidents: op.payload.p_payment_incidents ?? null,
                // CP-MONEY-002 (D1, posmerge #1467): desglose real por moneda
                // encolado offline — passthrough al RPC (la validación de
                // estructura/tasas/pools derivados vive en create_sale_v2 §13.7).
                // La clave viaja SOLO si el payload encolado la trae: enviarla
                // SIEMPRE (null incluido) rompía la resolución de PostgREST
                // contra la BD sin migrar (PGRST202 — verificado contra la BD
                // viva 2026-10-24) y TODO replay offline de ventas fallaba,
                // incluidas las encoladas por builds legados (CUP canónico).
                // Sin la clave el RPC usa p_payment_components DEFAULT NULL
                // (firma 32-param) o la firma legada de 31 params — en ambos
                // casos el flujo es el previo (compatibilidad de contrato).
                ...(op.payload.p_payment_components
                  ? { p_payment_components: op.payload.p_payment_components }
                  : {}),
              };
              result = await supabase.rpc('create_sale_v2', v2Payload);
            }
            break;
          case 'reception':
            // PR-2 C6: enviar los 7 args explícitos a la firma C (register_reception 7-param TIMESTAMPTZ).
            // p_user_id se toma de la sesión del servidor (no del payload encolado offline)
            // para evitar suplantación de identidad. p_po_id se pasa tal cual del payload.
            result = await supabase.rpc('register_reception', {
              p_store_id: op.payload.p_store_id,
              p_supplier: op.payload.p_supplier,
              p_reception_date: op.payload.p_reception_date,
              p_invoice_number: op.payload.p_invoice_number,
              p_items: op.payload.p_items,
              p_user_id: session.user.id,
              p_po_id: op.payload.p_po_id ?? null,
            });
            break;
          case 'adjustment':
            result = await supabase.rpc('perform_inventory_adjustment', op.payload);
            break;
          case 'transfer':
            result = await supabase.rpc('create_transfer', op.payload);
            break;
          default:
            throw new Error(`Unknown entity: ${op.entity}`);
        }

        if (result.error) throw result.error;

        // 3. Record success in sync_log (pipeline W4)
        queueUpsert({
          idempotency_key: op.idempotencyKey,
          user_id: session.user.id,
          entity: op.entity,
          operation_type: op.operationType,
          status: 'ok',
          response_data: { id: result.data },
          store_id: op.payload.p_store_id || null,
        });

        results.push({
          idempotencyKey: op.idempotencyKey,
          status: 'ok',
          serverId: result.data,
        });
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`Error processing sync operation ${op.idempotencyKey}:`, err);

        // Check for conflicts (this is simplified, depends on error messages/codes)
        const isConflict = errMsg.includes('Duplicate') || (err instanceof Error && (err as any).code === '23505');
        const status = isConflict ? 'conflict' : 'error';

        // Record failure/conflict in sync_log (pipeline W4)
        queueUpsert({
          idempotency_key: op.idempotencyKey,
          user_id: session.user.id,
          entity: op.entity,
          operation_type: op.operationType,
          status,
          // FIX-SEC-022: Hide internal error details in sync responses
          response_data: { error: (process.env.NODE_ENV !== 'production' || !!process.env.VITEST) ? errMsg : 'Error de sincronización' },
          store_id: op.payload.p_store_id || null,
        });

        let serverData = null;
        if (isConflict) {
          try {
            if (op.entity === 'reception') {
              const { data } = await supabase.from('receipts')
                .select('*, items:receipt_items(*)')
                .eq('reference_doc', `${op.payload.p_supplier} | ${op.payload.p_invoice_number}`)
                .maybeSingle();
              serverData = data;
            }
          } catch (fetchErr) {
            logger.warn('DATABASE', 'FAILED_TO_FETCH_SERVER_DATA_FOR_CONFLICT:', { data: fetchErr })
          }
        }

        results.push({
          idempotencyKey: op.idempotencyKey,
          status,
          // FIX-SEC-022: Hide internal error details in sync responses
          error: (process.env.NODE_ENV !== 'production' || !!process.env.VITEST) ? errMsg : 'Error de sincronización',
          serverData,
        });
      }
    }

    // W4: resolver los upserts en pipeline antes de responder (misma garantía de
    // durabilidad que el await original; los errores de upsert ya se ignoraban)
    await Promise.allSettled(pendingUpserts);

    return NextResponse.json({ results });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('Batch sync error:', err);
    return NextResponse.json(createApiError('INTERNAL_ERROR'), { status: 500 });
  }
});

async function postHandler(req: NextRequest) {
  return handler(req);
}

export const POST = withTracing(postHandler, 'POST /api/sync/batch');
