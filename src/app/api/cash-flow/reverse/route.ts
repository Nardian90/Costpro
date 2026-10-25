import { isAdminLevel } from '@/lib/roles';
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { withSecurity } from '@/lib/with-security';
import { withTracing } from '@/lib/observability';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { z } from 'zod';
import { uuidLoose } from '@/validation/api-schemas';
import { ANNULMENT_REASON_MAX_LENGTH, ANNULMENT_REASON_MIN_LENGTH } from '@/lib/cash-flow/constants';

/**
 * POST /api/cash-flow/reverse — anula un documento Ingreso/Egreso CONFIRMADO.
 *
 * MISIÓN INGRESOS/EGRESOS (2026-10-20). Anulación con motivo obligatorio:
 *   1. Permiso: admin/manager/encargado en la tienda del documento.
 *   2. Motivo ≥ 3 caracteres (obligatorio, auditoría).
 *   3. Confirmación con documento e importe: la exhibe la UI antes de llamar.
 *   4. El RPC registra quién, cuándo y por qué (annulled_at/by/reason).
 *   5. Revierte el efecto en caja con fila CONTRARIA en payment_transactions
 *      (payment_date = NOW()): nunca borra history ni edita importes.
 *   6. Referencia inequívoca al original (annulment_payment_transaction_id +
 *      ref_id del ledger apuntando al mismo documento).
 *   7. Doble anulación → ERR_ALREADY_ANNULLED (409).
 *   8. Cierres históricos intactos: la reversión entra a la ventana del turno
 *      vigente; los cierres pasados quedan congelados.
 */

const REVERSE_SCHEMA = z.object({
  document_id: uuidLoose,
  reason: z
    .string()
    .trim()
    .min(ANNULMENT_REASON_MIN_LENGTH, `El motivo debe tener al menos ${ANNULMENT_REASON_MIN_LENGTH} caracteres`)
    .max(ANNULMENT_REASON_MAX_LENGTH, `Máximo ${ANNULMENT_REASON_MAX_LENGTH} caracteres`),
});

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const body = await req.json();
    const parsed = REVERSE_SCHEMA.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Cuerpo inválido', details: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) },
        { status: 400 },
      );
    }
    const { document_id, reason } = parsed.data;

    // Anular es una operación de corrección: exige rol superior (doctrina de
    // reversas — igual que anular ventas). El RPC revalida con membresía.
    if (!isAdminLevel(session.user.role) && session.user.role !== 'manager' && session.user.role !== 'encargado') {
      return NextResponse.json(
        { error: 'Forbidden — anular requiere rol admin, manager o encargado' },
        { status: 403 },
      );
    }

    const supabaseAdmin = getSupabaseAdminSafe();
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server config error' }, { status: 500 });
    }

    const { data, error } = await supabaseAdmin.rpc('reverse_cash_flow_document', {
      p_document_id: document_id,
      p_reason: reason,
      p_user_id: session.user.id,
    });

    if (error) {
      const msg = error.message || '';
      const map: Array<[string, number, string]> = [
        ['ERR_DOCUMENT_NOT_FOUND', 404, 'Documento no encontrado'],
        ['ERR_UNAUTHORIZED', 403, 'No autorizado'],
        ['ERR_FORBIDDEN_ROLE', 403, 'Anular requiere rol admin, manager o encargado en la tienda del documento'],
        ['ERR_REASON_REQUIRED', 400, 'El motivo de la anulación es obligatorio (mínimo 3 caracteres)'],
        ['ERR_REASON_TOO_LONG', 400, 'El motivo no puede exceder 500 caracteres'],
        ['ERR_ALREADY_ANNULLED', 409, 'El documento ya está anulado'],
        ['ERR_NO_OPEN_SHIFT', 409, 'No hay turno abierto para registrar la reversión del efectivo'],
        ['ERR_INSUFFICIENT_CASH', 422, 'Anular este ingreso dejaría el efectivo esperado en negativo'],
      ];
      for (const [code, status, message] of map) {
        if (msg.includes(code)) {
          return NextResponse.json({ error: message, code }, { status });
        }
      }
      console.error('[cash-flow/reverse] POST error:', error);
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    return NextResponse.json({ success: true, ...(data as object) });
  } catch (err: unknown) {
    const e = err as { message?: string };
    return NextResponse.json({ error: e?.message || 'Error interno' }, { status: 500 });
  }
}

export const POST = withTracing(
  withAuth(withSecurity(postHandler, {
    rateLimitKey: 'cash-flow:reverse',
    maxRequests: 10,
  })) as any,
  'POST /api/cash-flow/reverse',
);
