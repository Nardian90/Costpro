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
  // 4. Mapear errores RPC → HTTP status codes
  // -----------------------------------------------------------------
  if (rpcErr) {
    const msg = rpcErr.message || '';
    if (msg.includes('ERR_UNAUTHENTICATED')) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    if (msg.includes('ERR_STORE_ACCESS_DENIED')) {
      return NextResponse.json({ error: 'Sin acceso a la tienda' }, { status: 403 });
    }
    if (msg.includes('ERR_INSUFFICIENT_STOCK') || msg.includes('Stock negativo')) {
      return NextResponse.json({ error: 'Stock insuficiente' }, { status: 400 });
    }
    if (msg.includes('ERR_OVERCONSUMPTION')) {
      return NextResponse.json({ error: 'Sobreconsumo de OT no permitido' }, { status: 400 });
    }
    if (msg.includes('ERR_PO_ITEM_WITHOUT_ORDER')) {
      return NextResponse.json({ error: 'Item de OT sin orden de producción activa' }, { status: 400 });
    }
    if (msg.includes('ERR_IDEMPOTENCY') || msg.includes('duplicate key value')) {
      return NextResponse.json({ error: 'Idempotency conflict — request ya procesado' }, { status: 409 });
    }
    if (msg.includes('ERR_PRODUCT_NOT_FOUND')) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
    }
    if (msg.includes('ERR_VARIANT_MISMATCH')) {
      return NextResponse.json({ error: 'Variante no pertenece al producto' }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
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
