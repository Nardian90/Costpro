import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAuthClient } from "@/lib/supabaseClient";
import { inventoryAdjustmentsSchema, zodError } from '@/validation/api-schemas';
import { getServerSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const session = await getServerSession(request);

  if (!session || !session.token) {
    return NextResponse.json(
      { error: "Unauthorized", message: "No active session" },
      { status: 401 }
    );
  }

  const userId = session.user.id;

  const rawBody = await request.json();
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
        { error: "Internal Server Error", message: rpcError.message },
        { status: 500 }
      );
    }

    const { data: saleItems, error: itemsError } = await authClient
      .from("sale_items")
      .select("*")
      .eq("sale_id", saleId);

    if (itemsError) {
      return NextResponse.json(
        { error: "Internal Server Error", message: itemsError.message },
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
      { error: "Internal Server Error", message: errorMessage },
      { status: 500 }
    );
  }
}
