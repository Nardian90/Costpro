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

// =====================================================================
// Schema de validación — SOLO campos del body que el cliente puede enviar
// =====================================================================
const valeItemSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().nullable().optional(),
  quantity: z.number().positive({ message: 'quantity debe ser > 0' }),
  production_order_item_id: z.string().uuid().nullable().optional(),
});

const valeSalidaSchema = z.object({
  items: z.array(valeItemSchema).min(1, { message: 'items no puede estar vacío' }),
  production_order_id: z.string().uuid().nullable().optional(),
  notes: z.string().min(1, { message: 'notes es requerido' }).max(2000),
  idempotency_key: z.string().min(8, { message: 'idempotency_key requerido (mín 8 chars)' }).max(200),
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
  const { items, production_order_id, notes, idempotency_key } = parsed.data;

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
// Canonical error mapping for create_vale_salida RPC errors.
// Mantiene una única fuente de verdad para todos los códigos RPC → HTTP.
// Cualquier error no listado aquí cae a 500.
// =====================================================================
export function mapValeRpcErrorToHttpStatus(msg: string): number {
  // 401 Unauthorized
  if (msg.includes('ERR_UNAUTHENTICATED')) return 401;
  // 403 Forbidden
  if (msg.includes('ERR_UNAUTHORIZED')) return 403;
  // 400 Bad Request
  if (msg.includes('ERR_EMPTY_ITEMS')) return 400;
  if (msg.includes('ERR_NOTES_REQUIRED')) return 400;
  if (msg.includes('ERR_IDEMPOTENCY_KEY_REQUIRED')) return 400;
  if (msg.includes('ERR_INVALID_QUANTITY')) return 400;
  if (msg.includes('ERR_PO_ITEM_REQUIRED')) return 400;
  if (msg.includes('ERR_PO_ITEM_WITHOUT_ORDER')) return 400;
  if (msg.includes('ERR_PRODUCT_MISMATCH')) return 400;
  if (msg.includes('ERR_VARIANT_MISMATCH')) return 400;
  if (msg.includes('ERR_VARIANT_NOT_BELONG_TO_PRODUCT')) return 400;
  if (msg.includes('ERR_OVERCONSUMPTION')) return 400;
  if (msg.includes('ERR_ORDER_NOT_EDITABLE')) return 400;
  if (msg.includes('ERR_INSUFFICIENT_STOCK') || msg.includes('Stock negativo')) return 400;
  // 404 Not Found
  if (msg.includes('ERR_PRODUCT_NOT_FOUND')) return 404;
  if (msg.includes('ERR_PO_ITEM_NOT_FOUND')) return 404;
  if (msg.includes('ERR_ORDER_NOT_FOUND')) return 404;
  if (msg.includes('ERR_ITEM_NOT_FOUND')) return 404;
  // 409 Conflict
  if (msg.includes('ERR_IDEMPOTENCY') || msg.includes('duplicate key value')) return 409;
  if (msg.includes('ERR_DUPLICATE_PO_ITEM')) return 409;
  // 422 Unprocessable Entity (cost unavailable — server-side state issue)
  if (msg.includes('ERR_PRODUCT_COST_UNAVAILABLE')) return 422;
  // 500 fallback
  return 500;
}

export function mapValeRpcErrorToUserMessage(msg: string): string {
  if (msg.includes('ERR_UNAUTHENTICATED')) return 'No autenticado';
  if (msg.includes('ERR_UNAUTHORIZED')) return 'Sin acceso a la tienda';
  if (msg.includes('ERR_EMPTY_ITEMS')) return 'Items vacíos';
  if (msg.includes('ERR_NOTES_REQUIRED')) return 'Las notas son obligatorias';
  if (msg.includes('ERR_IDEMPOTENCY_KEY_REQUIRED')) return 'Idempotency key requerido';
  if (msg.includes('ERR_INVALID_QUANTITY')) return 'Cantidad inválida';
  if (msg.includes('ERR_PO_ITEM_REQUIRED')) return 'Cada item debe asociarse a una línea de OT';
  if (msg.includes('ERR_PO_ITEM_WITHOUT_ORDER')) return 'Item de OT sin orden de producción activa';
  if (msg.includes('ERR_PRODUCT_MISMATCH')) return 'Producto no coincide con la línea de OT';
  if (msg.includes('ERR_VARIANT_MISMATCH')) return 'Variante no coincide con la línea de OT';
  if (msg.includes('ERR_VARIANT_NOT_BELONG_TO_PRODUCT')) return 'Variante no pertenece al producto';
  if (msg.includes('ERR_OVERCONSUMPTION')) return 'Sobreconsumo de OT no permitido';
  if (msg.includes('ERR_ORDER_NOT_EDITABLE')) return 'La OT no está en estado editable';
  if (msg.includes('ERR_INSUFFICIENT_STOCK') || msg.includes('Stock negativo')) return 'Stock insuficiente';
  if (msg.includes('ERR_PRODUCT_NOT_FOUND')) return 'Producto no encontrado';
  if (msg.includes('ERR_PO_ITEM_NOT_FOUND')) return 'Línea de OT no encontrada';
  if (msg.includes('ERR_ORDER_NOT_FOUND')) return 'Orden de producción no encontrada';
  if (msg.includes('ERR_ITEM_NOT_FOUND')) return 'Item no encontrado';
  if (msg.includes('ERR_IDEMPOTENCY') || msg.includes('duplicate key value')) return 'Idempotency conflict — request ya procesado';
  if (msg.includes('ERR_DUPLICATE_PO_ITEM')) return 'Línea de OT duplicada en el vale';
  if (msg.includes('ERR_PRODUCT_COST_UNAVAILABLE')) return 'Costo del producto no disponible';
  return msg;
}

// =====================================================================
// Export con withAuth + withSecurity (CSRF + rate limit)
// =====================================================================
export const POST = withAuth(withSecurity(postHandler, {
  rateLimitKey: 'vale-salida:post',
  maxRequests: 10, // 10/min por usuario
}));
