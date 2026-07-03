/**
 * REC-2 MM-R7: Endpoint POST /api/inventory/receptions
 *
 * Recibe recepciones encoladas offline por el SyncEngine y las procesa.
 * El SyncEngine mapea 'reception' → este endpoint (ver sync-engine.ts:148).
 *
 * Flujo:
 * 1. Auth: requiere sesión válida + membresía en la tienda.
 * 2. Body: params del registerReceptionParamsSchema (validado con Zod).
 * 3. Llama a la RPC `register_reception` con el auth client.
 * 4. Retorna el receipt_id generado.
 *
 * Si la RPC falla, retorna 500 con detalle para que el SyncEngine mantenga
 * el item en cola y reintente más tarde.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAuthClient } from "@/lib/supabaseClient";
import { rateLimit } from "@/lib/rate-limit";
import { withStoreAccess, AuthenticatedSession } from "@/lib/auth-middleware";
import { withTracing } from "@/lib/observability";
import { registerReceptionParamsSchema } from "@/validation/schemas";
// F-21: validar tasa_cambio_recepcion antes de llamar a la RPC
import { validateReceiptItemsTasa } from "@/lib/receipt-items-validation";

async function postHandler(request: NextRequest, session: AuthenticatedSession) {
  const clientId = request.headers.get('x-forwarded-for') || session.user.id;
  const { allowed } = await rateLimit(clientId);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Bad Request", message: "JSON inválido" },
      { status: 400 }
    );
  }

  // Validar con Zod
  const parseResult = registerReceptionParamsSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: "Validation Error",
        message: "Parámetros inválidos",
        details: parseResult.error.issues,
      },
      { status: 400 }
    );
  }

  const params = parseResult.data;
  const authClient = getSupabaseAuthClient(session.token);
  if (!authClient) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Sesión no válida" },
      { status: 401 }
    );
  }

  // F-21: validar que ningún item tenga tasa=1.0 (o <=1.5) con moneda no-CUP.
  // Esto evita costeos absurdos cuando falla el auto-fill de tasa.
  const tasaValidation = validateReceiptItemsTasa(params.p_items);
  if (!tasaValidation.valid) {
    return NextResponse.json(
      {
        error: tasaValidation.error,
        message: tasaValidation.details,
        code: 'ERR_F21_TASA_INVALIDA',
      },
      { status: 400 }
    );
  }

  // Verificar que el usuario tiene acceso a la tienda (RLS lo valida, pero doble check)
  const { data: membership, error: membErr } = await authClient
    .from('user_store_memberships')
    .select('store_id')
    .eq('store_id', params.p_store_id)
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (membErr || !membership) {
    // Si no es miembro, verificar si es admin (puede acceder a cualquier tienda)
    const { data: profile } = await authClient
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json(
        { error: "Forbidden", message: "No tienes acceso a esta tienda" },
        { status: 403 }
      );
    }
  }

  // Llamar a la RPC register_reception
  const { data: receiptId, error: rpcErr } = await authClient.rpc(
    'register_reception',
    params
  );

  if (rpcErr) {
    console.error('[receptions/route] RPC error:', rpcErr);
    return NextResponse.json(
      {
        error: "RPC Error",
        message: rpcErr.message,
        code: rpcErr.code,
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { id: receiptId, success: true },
    { status: 201 }
  );
}

export const POST = withTracing(withStoreAccess(postHandler) as any, 'POST /api/inventory/receptions');
