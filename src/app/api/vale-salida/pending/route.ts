/**
 * POST /api/vale-salida/pending
 *
 * Crea un Vale de Salida EN REVISIÓN (estado 'pending') — etapa intermedia del
 * estándar documental de Ajustes Documentales (misión Res. 11, 2026-10-31).
 *
 * El vale se CONSERVA en BD sin descontar stock: el usuario lo revisa desde el
 * listado del módulo y lo confirma después (acción explícita
 * confirm_vale_salida) o lo anula (void_vale_salida). El flujo directo
 * «crear y confirmar ahora» sigue disponible en POST /api/vale-salida.
 *
 * TRUST BOUNDARY (idéntico a POST /api/vale-salida):
 *   - store_id  → derivado de profiles.active_store_id (DB lookup con JWT user)
 *   - user_id   → derivado de session.user.id (JWT)
 *   - unit_cost → NUNCA del body. La RPC toma el snapshot server-side
 *                 (products.cost_average); en la confirmación se relee.
 *
 *   El body del request SOLO puede enviar:
 *     - items[] (product_id, variant_id, quantity, production_order_item_id)
 *     - production_order_id (opcional)
 *     - notes (requerido)
 *     - idempotency_key (requerido)
 *     - operation_date (opcional, ISO 8601)
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { withSecurity } from '@/lib/with-security';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { z } from 'zod';
import { uuidLoose } from '@/validation/api-schemas';
import { checkNotFutureOperationDate } from '@/lib/pos/operation-date';
import { mapValeRpcErrorToHttpStatus, mapValeRpcErrorToUserMessage } from '@/lib/vale-salida/errors';

// =====================================================================
// Schema de validación — SOLO campos del body que el cliente puede enviar
// (mismas reglas que POST /api/vale-salida)
// =====================================================================
const valeItemSchema = z.object({
  product_id: uuidLoose,
  variant_id: uuidLoose.nullable().optional(),
  quantity: z.number().positive({ message: 'quantity debe ser > 0' }),
  production_order_item_id: uuidLoose.nullable().optional(),
});

const valePendingSchema = z.object({
  items: z.array(valeItemSchema).min(1, { message: 'items no puede estar vacío' }),
  production_order_id: uuidLoose.nullable().optional(),
  notes: z.string().min(1, { message: 'notes es requerido' }).max(2000),
  idempotency_key: z.string().min(8, { message: 'idempotency_key requerido (mín 8 chars)' }).max(200),
  operation_date: z.string().datetime().optional(),
});

// =====================================================================
// Handler
// =====================================================================
async function postHandler(request: NextRequest, session: AuthenticatedSession) {
  // -----------------------------------------------------------------
  // 1. Parse + validate body (Zod schema — sin store_id/user_id/unit_cost)
  // -----------------------------------------------------------------
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = valePendingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validación fallida', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { items, production_order_id, notes, idempotency_key, operation_date } = parsed.data;

  // ── Revalidación server-side de la fecha (misma política que el flujo directo) ──
  if (operation_date) {
    const dateCheck = checkNotFutureOperationDate(operation_date);
    if (!dateCheck.ok) {
      return NextResponse.json({ error: dateCheck.error, rpc_error: dateCheck.error }, { status: 422 });
    }
  }

  // -----------------------------------------------------------------
  // 2. Derivar store_id del perfil del usuario (NUNCA del body)
  // -----------------------------------------------------------------
  const admin = getSupabaseAdminSafe();
  if (!admin) {
    return NextResponse.json({ error: 'Servicio no disponible' }, { status: 503 });
  }

  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('active_store_id')
    .eq('id', session.user.id)
    .single();

  if (profileErr || !profile?.active_store_id) {
    return NextResponse.json({ error: 'Usuario sin tienda activa configurada' }, { status: 400 });
  }
  const store_id = profile.active_store_id;

  // -----------------------------------------------------------------
  // 3. Invocar RPC create_vale_salida_pending con service_role
  //    p_user_id proviene del JWT (session.user.id), NUNCA del body.
  // -----------------------------------------------------------------
  const { data: result, error: rpcErr } = await admin.rpc('create_vale_salida_pending', {
    p_store_id: store_id,
    p_items: items,
    p_production_order_id: production_order_id ?? null,
    p_notes: notes,
    p_idempotency_key: idempotency_key,
    p_user_id: session.user.id, // ← TRUST BOUNDARY: from JWT, not body
    p_operation_date: operation_date ?? null,
  });

  // -----------------------------------------------------------------
  // 4. Mapear errores RPC → HTTP (reutiliza el mapa canónico del módulo)
  // -----------------------------------------------------------------
  if (rpcErr) {
    const msg = rpcErr.message || '';
    const status = mapValeRpcErrorToHttpStatus(msg);
    const userMessage = mapValeRpcErrorToUserMessage(msg);
    return NextResponse.json({ error: userMessage, rpc_error: msg }, { status });
  }

  return NextResponse.json(result, { status: 201 });
}

// =====================================================================
// Export con withAuth + withSecurity (CSRF + rate limit)
// =====================================================================
export const POST = withAuth(withSecurity(postHandler, {
  rateLimitKey: 'vale-salida-pending:post',
  maxRequests: 10, // 10/min por usuario
}));
