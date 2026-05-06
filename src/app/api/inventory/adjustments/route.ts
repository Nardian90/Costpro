import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAuthClient } from "@/lib/supabaseClient";
import { inventoryAdjustmentsSchema, zodError } from '@/validation/api-schemas';
import { getServerSession } from "@/lib/auth";
import { rateLimit } from '@/lib/rate-limit';
import { validateOrigin } from '@/lib/csrf';
import { withTracing } from '@/lib/observability';

async function postHandler(request: NextRequest) {
  const session = await getServerSession(request);

  if (!session || !session.token) {
    return NextResponse.json(
      { error: "Unauthorized", message: "No active session" },
      { status: 401 }
    );
  }

  if (!validateOrigin(request)) {
    return NextResponse.json({ error: 'Origen no permitido' }, { status: 403 });
  }

  const clientId = request.headers.get('x-forwarded-for') || session.user.id;
  const { allowed } = await rateLimit(clientId);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const userId = session.user.id;

  let rawBody;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de solicitud inválido' }, { status: 400 });
  }
  const parsed = inventoryAdjustmentsSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(zodError(parsed.error), { status: 400 });
  }
  const { storeId, items } = parsed.data;

  try {
    const authClient = getSupabaseAuthClient(session.token);

    const { data: saleId, error: rpcError } = await authClient.rpc("process_inventory_adjustment", {
      p_store_id: storeId,
      p_cashier_id: userId,
      p_items: items,
    });

    if (rpcError) {
      return NextResponse.json(
        // FIX-SEC-019: Hide error details in production
        { error: "Internal Server Error", message: process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' ? rpcError.message : undefined },
        { status: 500 }
      );
    }

    if (!saleId) return NextResponse.json({ message: "Ajuste procesado", saleId: null }, { status: 200 });

    const { data: saleItems, error: itemsError } = await authClient
      .from("sale_items")
      .select("*")
      .eq("sale_id", saleId);

    if (itemsError) {
      return NextResponse.json(
        // FIX-SEC-019: Hide error details in production
        { error: "Internal Server Error", message: process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' ? itemsError.message : undefined },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "Inventory adjustment processed successfully",
      saleId,
      saleItems,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      // FIX-SEC-019: Hide error details in production
      { error: "Internal Server Error", message: process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' ? errorMessage : undefined },
      { status: 500 }
    );
  }
}

export const POST = withTracing(postHandler, 'POST /api/inventory/adjustments');
