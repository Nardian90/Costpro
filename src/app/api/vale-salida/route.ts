/**
 * POST /api/vale-salida
 *
 * Crea un Vale de Salida (issue slip) — operacion de salida de inventario
 * SIN venta comercial. Descuenta stock, opcionalmente descuenta OT actual_qty.
 *
 * TRUST BOUNDARY (H2 hardening):
 *   - store_id  → derivado de profiles.active_store_id (DB lookup con JWT user)
 *   - user_id   → derivado de session.user.id (JWT)
 *   - unit_cost → NUNCA del body. La RPC lo calcula server-side (products.cost_average).
 *
 *   Patrón de invocación:
 *     browser → JWT → withAuth → session.user.id → backend (service_role)
 *       → create_vale_salida(... p_user_id = session.user.id ...)
 *
 *   El body del request SOLO puede enviar:
 *     - items[] (product_id, variant_id, quantity, production_order_item_id)
 *     - production_order_id (opcional)
 *     - notes (requerido)
 *     - idempotency_key (requerido)
 *
 *   Cualquier intento de enviar store_id, user_id, o unit_cost es ignorado.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { withSecurity } from '@/lib/with-security';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { z } from 'zod';
import { uuidLoose } from '@/validation/api-schemas';
// MISIÓN FECHA OPERATIVA (2026-10-17): revalidación server-side (tope = hoy Habana
// para el flujo del carrito) + mapeos de error de fecha del RPC.
import { checkNotFutureOperationDate } from '@/lib/pos/operation-date';
import {
  mapValeRpcErrorToHttpStatus,
  mapValeRpcErrorToUserMessage,
} from '@/lib/vale-salida/errors';

// Re-exporta el mapeo canónico para consumidores existentes de la ruta
// (contrato público histórico; la fuente de verdad vive en la lib compartida).
export { mapValeRpcErrorToHttpStatus, mapValeRpcErrorToUserMessage };

// =====================================================================
// Schema de validación — SOLO campos del body que el cliente puede enviar
// =====================================================================
const valeItemSchema = z.object({
  product_id: uuidLoose,
  variant_id: uuidLoose.nullable().optional(),
  quantity: z.number().positive({ message: 'quantity debe ser > 0' }),
  production_order_item_id: uuidLoose.nullable().optional(),
});

const valeSalidaSchema = z.object({
  items: z.array(valeItemSchema).min(1, { message: 'items no puede estar vacío' }),
  production_order_id: uuidLoose.nullable().optional(),
  notes: z.string().min(1, { message: 'notes es requerido' }).max(2000),
  idempotency_key: z.string().min(8, { message: 'idempotency_key requerido (mín 8 chars)' }).max(200),
  // ENERVIDA import (2026-10-05): fecha de operación opcional (retro-compatible).
  // El RPC create_vale_salida ya la soporta (migración 20261004120000,
  // p_operation_date DEFAULT NULL) — paridad con /api/pos/checkout.
  // validate_operation_date aplica el mismo gate (6 meses atrás / +1 día).
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

  const parsed = valeSalidaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validación fallida', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { items, production_order_id, notes, idempotency_key, operation_date } = parsed.data;

  // ── MISIÓN FECHA OPERATIVA: revalidación server-side de la fecha ──
  // Misma política que /api/pos/checkout: sin confianza en el cliente; el RPC
  // revalida dentro de la transacción (validate_operation_date).
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
  // 3. Invocar RPC create_vale_salida con service_role
  //    p_user_id proviene del JWT (session.user.id), NUNCA del body.
  //    p_items se pasa como JSON para que la RPC haga validación server-side.
  // -----------------------------------------------------------------
  const { data: result, error: rpcErr } = await admin.rpc('create_vale_salida', {
    p_store_id: store_id,
    p_items: items, // PostgREST mapea array → jsonb
    p_production_order_id: production_order_id ?? null,
    p_notes: notes,
    p_idempotency_key: idempotency_key,
    p_user_id: session.user.id, // ← TRUST BOUNDARY: from JWT, not body
    p_operation_date: operation_date ?? null, // ENERVIDA import: paridad con checkout
  });

  // -----------------------------------------------------------------
  // 4. Mapear errores RPC → HTTP status codes (canonical map)
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
  rateLimitKey: 'vale-salida:post',
  maxRequests: 10, // 10/min por usuario
}));
