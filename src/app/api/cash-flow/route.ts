import { isAdminLevel } from '@/lib/roles';
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { withSecurity } from '@/lib/with-security';
import { withTracing } from '@/lib/observability';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { getSupabaseForSession } from '@/lib/supabase-session';
import { z } from 'zod';
import { uuidLoose } from '@/validation/api-schemas';
import {
  CASH_FLOW_CONCEPTS,
  COUNTERPARTY_MAX_LENGTH,
  JUSTIFICATION_MAX_LENGTH,
  NOTES_MAX_LENGTH,
  hasValidMonetaryPrecision,
} from '@/lib/cash-flow/constants';

/**
 * POST /api/cash-flow — registra un documento Ingreso/Egreso de caja.
 *
 * MISIÓN INGRESOS/EGRESOS (2026-10-20). Registra entradas/salidas FÍSICAS de
 * efectivo de la caja: constitución, reposición y devolución (total/parcial)
 * del fondo de cambio, y otros ingresos/egresos autorizados. NO es venta,
 * cobro, devolución comercial, gasto de proveedor ni transferencia de stock.
 *
 * Body:
 *   {
 *     doc_type: 'ingreso' | 'egreso',
 *     concept: <CashFlowConcept>,
 *     amount: number > 0 (máx. 2 decimales),
 *     currency: 'CUP' | 'USD',
 *     exchange_rate?: number (informativo — la tasa la resuelve el servidor),
 *     operation_date?: ISO | null (default NOW; debe caer en la ventana del turno),
 *     counterparty?: string | null (quién entrega/recibe el dinero),
 *     justification: string (1..500, OBLIGATORIA),
 *     notes?: string | null,
 *     related_document_id?: uuid | null (solo devoluciones de fondo),
 *     idempotency_key?: string | null (texto, p. ej. 'cf-<uuid>' — MISMA
 *       convención del default de esta ruta, del hook useCreateCashFlow y
 *       del flujo de anulación 'cf-anul-<doc>'; la columna DB es text y la
 *       RPC solo exige no-vacía)
 *   }
 *
 * MISIÓN CUERPO INVÁLIDO (2026-10-24): el esquema anterior exigía UUID puro
 * en idempotency_key y rechazaba null explícito en campos opcionales (Zod 4
 * .optional() ≠ nullable), mientras que el modal real SIEMPRE envía
 * 'cf-<uuid>' + notes/related_document_id/counterparty null ⇒ TODA
 * confirmación desde la UI caía en 400 «Cuerpo inválido» antes de llegar a
 * la RPC. El esquema ahora replica el contrato real (texto la clave,
 * nullish los opcionales) SIN tocar las validaciones financieras: importe
 * numérico > 0 con 2 decimales, moneda, concepto, justificación y longitudes
 * siguen intactos; las reglas de negocio (rol, turno, saldo por moneda,
 * entrega) siguen viviendo en la RPC.
 *
 * Persistencia: RPC create_cash_flow_document (service_role-only, actor
 * explícito p_user_id de la sesión) — documento cash_flow_documents +
 * UNA fila payment_transactions(ref_type='cash_flow'). Turno abierto
 * obligatorio; egreso ≤ efectivo disponible; devolución ≤ fondo vigente;
 * numeración IE-000001-2026 atómica; auditoría atómica; idempotencia v2.26.
 */

const CONCEPT_VALUES = CASH_FLOW_CONCEPTS.map(c => c.value) as [string, ...string[]];

const CREATE_SCHEMA = z.object({
  doc_type: z.enum(['ingreso', 'egreso']),
  concept: z.enum(CONCEPT_VALUES as [string, ...string[]]),
  amount: z
    .number({ message: 'El importe debe ser numérico' })
    .positive({ message: 'El importe debe ser mayor que cero' })
    .refine(hasValidMonetaryPrecision, { message: 'El importe admite máximo 2 decimales' }),
  currency: z.enum(['CUP', 'USD']),
  // MISIÓN CUERPO INVÁLIDO (2026-10-24): los opcionales aceptan null
  // explícito (.nullish) — el modal los estampa siempre; Zod 4 .optional()
  // solo acepta undefined y rechazaba el contrato real de la UI.
  exchange_rate: z.number().positive().nullish(),
  operation_date: z.string().datetime().nullish(),
  counterparty: z.string().trim().max(COUNTERPARTY_MAX_LENGTH).nullish(),
  justification: z
    .string()
    .trim()
    .min(1, 'La justificación es obligatoria')
    .max(JUSTIFICATION_MAX_LENGTH, `Máximo ${JUSTIFICATION_MAX_LENGTH} caracteres`),
  notes: z.string().trim().max(NOTES_MAX_LENGTH).nullish(),
  related_document_id: uuidLoose.nullish(),
  // Clave de idempotencia TEXTO (contrato real: 'cf-<uuid>' del modal/hook/
  // default de esta ruta y 'cf-anul-<doc>' de la anulación; columna DB text,
  // RPC solo exige no-vacía). Se acota a 128 y '' ⇒ default cf- de la ruta.
  idempotency_key: z
    .string()
    .trim()
    .max(128, 'La clave de idempotencia no puede exceder 128 caracteres')
    .nullish()
    .transform(v => (v && v.length > 0 ? v : undefined)),
});

/** Mapa de errores ERR_* del RPC → status HTTP + mensaje humano. */
function mapRpcError(msg: string): NextResponse | null {
  const map: Array<[string, number, string]> = [
    ['ERR_UNAUTHORIZED', 403, 'No autorizado'],
    ['ERR_FORBIDDEN_ROLE', 403, 'No tienes permisos para registrar ingresos o egresos en esta tienda'],
    // MISIÓN CAJA v2.24.0 (D4): la entrega de efectivo exige rol de autoridad.
    ['ERR_DELIVERY_ROLE', 403, 'La entrega de efectivo requiere rol admin, manager o encargado (clerk no puede entregar).'],
    ['ERR_COUNTERPARTY_REQUIRED', 422, 'Identifica a la persona que recibe el efectivo (contraparte obligatoria).'],
    ['ERR_NO_OPEN_SHIFT', 409, 'La caja no tiene un turno abierto. Abre el turno en Caja antes de registrar movimientos (la entrega de efectivo es la única operación autorizada sin turno).'],
    ['ERR_DATE_OUTSIDE_SHIFT', 422, 'La fecha operativa debe caer dentro del turno abierto.'],
    ['ERR_BACKDATED_DOCUMENT', 422, 'La fecha operativa es anterior al mínimo permitido (6 meses).'],
    ['ERR_FUTURE_DATED_DOCUMENT', 422, 'La fecha operativa no puede ser futura.'],
    ['ERR_INSUFFICIENT_CASH', 422, 'El egreso supera el efectivo disponible en caja.'],
    // MISIÓN CAJA v2.24.0: la entrega valida POR MONEDA contra el libro físico.
    // MISIÓN POST-MERGE 20261024220000: el egreso ordinario y la reversión de
    // ingreso TAMBIÉN validan por moneda física (ERR_INSUFFICIENT_CURRENCY) —
    // el mensaje se generaliza (antes mencionaba solo «la entrega»).
    ['ERR_INSUFFICIENT_CURRENCY', 422, 'La operación supera el saldo físico disponible de esa moneda en caja.'],
    ['ERR_FUND_INSUFFICIENT', 422, 'La devolución supera el fondo de cambio vigente.'],
    ['ERR_EXCHANGE_RATE_UNAVAILABLE', 409, 'No hay tasa USD disponible. Configura la tasa de la tienda antes de operar en USD.'],
    ['ERR_RATE_STALE', 409, 'La tasa de cambio disponible está desactualizada (más de 45 días).'],
    ['ERR_CONCEPT_TYPE_MISMATCH', 400, 'El concepto no corresponde al tipo de documento.'],
    ['ERR_INVALID_DOC_TYPE', 400, 'Tipo de documento inválido.'],
    ['ERR_CONCEPT_REQUIRED', 400, 'El concepto es obligatorio.'],
    ['ERR_INVALID_AMOUNT', 400, 'El importe debe ser mayor que cero.'],
    ['ERR_AMOUNT_PRECISION', 400, 'El importe admite máximo 2 decimales.'],
    ['ERR_INVALID_CURRENCY', 400, 'Moneda no admitida (CUP o USD).'],
    ['ERR_JUSTIFICATION_REQUIRED', 400, 'La justificación es obligatoria.'],
    ['ERR_JUSTIFICATION_TOO_LONG', 400, `La justificación no puede exceder ${JUSTIFICATION_MAX_LENGTH} caracteres.`],
    ['ERR_RELATED_DOC_NOT_ALLOWED', 400, 'Solo las devoluciones de fondo pueden vincular un documento origen.'],
    ['ERR_RELATED_DOC_INVALID', 422, 'El documento origen debe ser una constitución o reposición confirmada de esta tienda.'],
    ['ERR_IDEMPOTENCY_KEY_REUSE', 409, 'Conflicto de idempotencia: la clave ya fue usada con otros datos.'],
  ];
  for (const [code, status, message] of map) {
    if (msg.includes(code)) {
      return NextResponse.json({ error: message, code }, { status });
    }
  }
  return null;
}

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const body = await req.json();
    const parsed = CREATE_SCHEMA.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Cuerpo inválido', details: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) },
        { status: 400 },
      );
    }
    const parsedData = parsed.data;

    // Roles autorizados a registrar: admin/manager/encargado/clerk (la caja
    // diaria la opera el cajero; el backend revalida con membresía de tienda).
    if (!isAdminLevel(session.user.role) && session.user.role !== 'manager'
        && session.user.role !== 'encargado' && session.user.role !== 'clerk') {
      return NextResponse.json(
        { error: 'Forbidden — requiere rol admin, manager, encargado o clerk' },
        { status: 403 },
      );
    }

    // Tienda activa del usuario (contexto del shell). El aislamiento real lo
    // garantiza el RPC con has_store_access_as sobre el actor de la sesión.
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

    const supabaseAdmin = getSupabaseAdminSafe();
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server config error' }, { status: 500 });
    }

    const { data: rpcData, error } = await supabaseAdmin.rpc('create_cash_flow_document', {
      p_store_id: storeId,
      p_doc_type: parsedData.doc_type,
      p_concept: parsedData.concept,
      p_amount: parsedData.amount,
      p_currency: parsedData.currency,
      // La tasa del cliente NO tiene autoridad financiera (se ignora; el RPC
      // resuelve la jerarquía canónica: tienda → BCC → Diviza informal).
      p_exchange_rate: null,
      p_operation_date: parsedData.operation_date ?? null,
      p_counterparty: parsedData.counterparty ?? null,
      p_justification: parsedData.justification,
      p_notes: parsedData.notes ?? null,
      p_related_document_id: parsedData.related_document_id ?? null,
      p_idempotency_key: parsedData.idempotency_key ?? `cf-${crypto.randomUUID()}`,
      p_user_id: session.user.id,
    });

    if (error) {
      const msg = error.message || '';
      const mapped = mapRpcError(msg);
      if (mapped) return mapped;
      console.error('[cash-flow] POST error:', error);
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    return NextResponse.json({ success: true, ...(rpcData as object) }, { status: 201 });
  } catch (err: unknown) {
    const e = err as { message?: string };
    return NextResponse.json({ error: e?.message || 'Error interno' }, { status: 500 });
  }
}

export const POST = withTracing(
  withAuth(withSecurity(postHandler, {
    rateLimitKey: 'cash-flow:create',
    maxRequests: 20,
  })) as any,
  'POST /api/cash-flow',
);
