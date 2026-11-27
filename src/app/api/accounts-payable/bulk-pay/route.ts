import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseForSession } from '@/lib/supabase-session';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { canManageStore } from '@/lib/roles';
import { z } from 'zod';

// FIX (2026-07-14): regex simple para aceptar UUIDs no-v4
const uuidLooseRegex = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  'UUID inválido'
);

/**
 * POST /api/accounts-payable/bulk-pay
 *
 * Marca múltiples documentos como pagados en una sola operación.
 * Soporta receipts, services y commissions.
 *
 * FASE 4.2 (2026-07-13): bulk actions para Cuentas por Pagar.
 *
 * Body:
 *   {
 *     items: [{ ref_type, ref_id }, ...],
 *     payment_method: 'cash'|'transfer'|'mixed',
 *     payment_reference?: string
 *   }
 *
 * Para receipts y services: registra un pago por el saldo exacto via RPC.
 * Para commissions: actualiza status='paid' directamente (R2: pago completo).
 *
 * R3 (overpay): el monto del pago = saldo exacto, nunca más.
 */

const bulkPaySchema = z.object({
  items: z.array(z.object({
    ref_type: z.enum(['receipt', 'service', 'commission']),
    ref_id: uuidLooseRegex,
  })).min(1, 'Debe seleccionar al menos 1 documento'),
  payment_method: z.enum(['cash', 'transfer', 'mixed']),
  payment_reference: z.string().optional().nullable(),
});

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const body = await req.json();
    const parsed = bulkPaySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { items, payment_method, payment_reference } = parsed.data;
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

    // ─── R-25 / F011-001 (CP-BRA-R05-APPROVAL-AND-R25-R26-REMEDIATION-001):
    // gate de GESTIÓN canónico (canManageStore) para TODA la ruta. Esta ruta
    // registra pagos privilegiados (register_supplier_payment, ACL
    // service_role exclusiva vía cliente administrativo server-side — mismo
    // patrón que /api/payments, /api/payments/multi y la reversión) y paga
    // comisiones (pay_commission). Deny por defecto: clerk/warehouse/usuario/
    // costo → 403 (canon roles.ts para toda ruta que escribe recursos
    // financieros scoped por tienda).
    if (!canManageStore(session.user, storeId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const admin = getSupabaseAdminSafe();
    if (!admin) {
      return NextResponse.json({ error: 'CONFIG_ERROR' }, { status: 500 });
    }

    const results: { ref_type: string; ref_id: string; success: boolean; error?: string }[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const item of items) {
      try {
        if (item.ref_type === 'commission') {
          // R2: comisiones se pagan completo en CUP.
          // Fase A (misión integral 2026-10-24): UPDATE directo → RPC
          // pay_commission (protocolo del cajón: advisory por tienda +
          // validación física por moneda para efectivo + idempotencia natural).
          const { data: rpcData, error: rpcError } = await supabase.rpc('pay_commission', {
            p_payment_id: item.ref_id,
            p_payment_method: payment_method,
            p_reference: payment_reference || null,
            p_currency: 'CUP',
            p_exchange_rate: 1.0,
            p_paid_at: new Date().toISOString(),
            p_user_id: session.user.id || null,
          });
          if (rpcError) {
            const msg = String(rpcError.message || '');
            if (msg.includes('ERR_INSUFFICIENT_CURRENCY')) {
              results.push({ ...item, success: false, error: `Saldo físico insuficiente: ${msg}` });
              errorCount++;
              continue;
            }
            if (msg.includes('ERR_COMMISSION_STATE_CHANGED')) {
              results.push({ ...item, success: false, error: 'La comisión cambió de estado concurrentemente — reintentar' });
              errorCount++;
              continue;
            }
            // FIN-014 (CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 §5.2/§5.3): el
            // fallback legacy a UPDATE directo se ELIMINA — era un bypass del
            // protocolo del cajón (sin advisory por tienda, sin guard físico
            // de moneda, RLS de rol global en vez del gate de membresía del
            // RPC). El RPC pay_commission existe en E2E y producción; un
            // entorno sin él es un fallo de despliegue que DEBE fallar por
            // ítem (jamás consolidarse por la vía silenciosa).
            results.push({ ...item, success: false, error: rpcError.message });
            errorCount++;
            continue;
          }
          if (rpcData?.idempotent_replay) {
            // Ya estaba pagada: éxito idempotente (misma semántica previa).
            results.push({ ...item, success: true });
            successCount++;
            continue;
          }

          results.push({ ...item, success: true });
          successCount++;
        } else {
          // Receipts y Services: obtener saldo y registrar pago exacto
          const totalField = item.ref_type === 'receipt' ? 'total_cost' : 'total_amount';
          const table = item.ref_type === 'receipt' ? 'receipts' : 'received_services';

          const { data: doc, error: docError } = await supabase
            .from(table)
            .select(`id, ${totalField}, paid_amount, store_id, payment_status`)
            .eq('id', item.ref_id)
            .single();

          if (docError || !doc) {
            results.push({ ...item, success: false, error: 'Documento no encontrado' });
            errorCount++;
            continue;
          }

          if (doc.store_id !== storeId) {
            results.push({ ...item, success: false, error: 'Documento no pertenece a la tienda' });
            errorCount++;
            continue;
          }

          if (doc.payment_status === 'paid') {
            results.push({ ...item, success: false, error: 'Ya está pagado' });
            errorCount++;
            continue;
          }

          const total = Number((doc as any)[totalField]) || 0;
          const paid = Number(doc.paid_amount) || 0;
          const balance = total - paid;

          if (balance <= 0) {
            results.push({ ...item, success: false, error: 'Saldo pendiente es 0' });
            errorCount++;
            continue;
          }

          // R3: monto = saldo exacto
          // FIX-AUD4-4: idempotency key determinista (no Date.now())
          // FIX-AUD5-L2: para 'mixed', registrar 2 transacciones (cash + transfer)
          // cada una por la mitad del saldo, preservando trazabilidad del método mixto
          if (payment_method === 'mixed') {
            const halfBalance = balance / 2;
            const methods: Array<'cash' | 'transfer'> = ['cash', 'transfer'];

            for (const m of methods) {
              // R-25: RPC privilegiado vía cliente administrativo server-side,
              // tras el gate canManageStore. Actor auditado = usuario de la
              // sesión real (p_paid_by) — nunca el usuario técnico.
              const { error: rpcError } = await admin.rpc('register_supplier_payment', {
                p_store_id: storeId,
                p_ref_type: item.ref_type,
                p_ref_id: item.ref_id,
                p_amount: halfBalance,
                p_payment_method: m,
                p_currency: 'CUP',
                p_exchange_rate: 1.0,
                p_reference: payment_reference || null,
                p_notes: `Bulk pay (mixed ${m}) - ${items.length} documentos`,
                p_paid_by: session.user.id,
                p_idempotency_key: `bulk:${item.ref_type}:${item.ref_id}:${m}`,
              });

              if (rpcError) {
                results.push({ ...item, success: false, error: rpcError.message });
                errorCount++;
                break;
              }
            }

            // Si no hubo error en el loop, marcar como éxito
            if (!results.find(r => r.ref_id === item.ref_id && !r.success)) {
              results.push({ ...item, success: true });
              successCount++;
            }
          } else {
            // R-25: RPC privilegiado vía cliente administrativo server-side,
            // tras el gate canManageStore (mismo patrón que la vía batch).
            const { error: rpcError } = await admin.rpc('register_supplier_payment', {
              p_store_id: storeId,
              p_ref_type: item.ref_type,
              p_ref_id: item.ref_id,
              p_amount: balance,
              p_payment_method: payment_method,
              p_currency: 'CUP',
              p_exchange_rate: 1.0,
              p_reference: payment_reference || null,
              p_notes: `Bulk pay - ${items.length} documentos`,
              p_paid_by: session.user.id,
              p_idempotency_key: `bulk:${item.ref_type}:${item.ref_id}:${payment_method}`,
            });

            if (rpcError) {
              results.push({ ...item, success: false, error: rpcError.message });
              errorCount++;
              continue;
            }

            results.push({ ...item, success: true });
            successCount++;
          }
        }
      } catch (e: any) {
        results.push({ ...item, success: false, error: e.message });
        errorCount++;
      }
    }

    return NextResponse.json({
      success: errorCount === 0,
      results,
      success_count: successCount,
      error_count: errorCount,
      total: items.length,
    }, { status: 201 });
  } catch (error: any) {
    console.error('[accounts-payable/bulk-pay] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const POST = withAuth(postHandler);
