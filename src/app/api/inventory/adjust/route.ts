import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAuthClient } from "@/lib/supabaseClient";
import { inventoryAdjustSchema, zodError } from '@/validation/api-schemas';
import { AdjustInventoryResponse } from "@/types/inventory";
import { getServerSession } from "@/lib/auth";
import { rateLimit } from '@/lib/rate-limit';
import { withTracing } from '@/lib/observability';

async function postHandler(request: NextRequest) {
  const session = await getServerSession(request);

  if (!session || !session.token) {
    return NextResponse.json(
      { error: "Unauthorized", message: "No active session" },
      { status: 401 }
    );
  }

  const clientId = session.user.id;
  const { allowed } = await rateLimit(clientId);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const userId = session.user.id;

  try {
    const rawBody = await request.json();
    const parsed = inventoryAdjustSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(zodError(parsed.error), { status: 400 });
    }
    const { productId, quantity, movementType, version, storeId, reason } = parsed.data;

    const authClient = getSupabaseAuthClient(session.token);

    const { data, error } = await authClient.rpc("register_stock_movement", {
      p_product_id: productId,
      p_store_id: storeId,
      p_user_id: userId,
      p_quantity: Number(quantity),
      p_movement_type: movementType,
      p_reason: reason,
      p_sale_id: null,
      p_unit_cost: 0,
      p_notes: `Ajuste manual (Version: ${version})`
    });

    if (error) {
      if (error.message.includes("Concurrency error")) {
        const { data: currentInventory } = await authClient
          .from("inventory")
          .select("quantity, version")
          .eq("product_id", productId)
          .eq("store_id", storeId)
          .single();

        return NextResponse.json(
          {
            error: "Conflict",
            message: "Inventory version mismatch.",
            serverVersion: currentInventory?.version,
            currentQuantity: currentInventory?.quantity,
          },
          { status: 409 }
        );
      }
      if (error.message.includes("ERR_INSUFFICIENT_STOCK")) {
        return NextResponse.json(
          { error: "Bad Request", message: "Negative stock is not allowed." },
          { status: 400 }
        );
      }
      return NextResponse.json(
        // FIX-SEC-019: Hide error details in production
        { error: "Internal Server Error", message: (process.env.NODE_ENV !== 'production' || !!process.env.VITEST) ? error.message : undefined },
        { status: 500 }
      );
    }

    const response: AdjustInventoryResponse = {
      productId: productId,
      newQuantity: data.new_quantity,
      newVersion: data.new_version,
    };

    return NextResponse.json(response);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      // FIX-SEC-019: Hide error details in production
      { error: "Internal Server Error", message: (process.env.NODE_ENV !== 'production' || !!process.env.VITEST) ? errorMessage : undefined },
      { status: 500 }
    );
  }
}

export const POST = withTracing(postHandler, 'POST /api/inventory/adjust');
