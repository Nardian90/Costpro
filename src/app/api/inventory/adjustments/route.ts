import { NextResponse, type NextRequest } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function POST(request: NextRequest) {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError || !sessionData.session) {
    return NextResponse.json(
      { error: "Unauthorized", message: "No active session" },
      { status: 401 }
    );
  }

  const userId = sessionData.session.user.id;

  const { storeId, items } = await request.json();

  if (!storeId || !items || !Array.isArray(items)) {
    return NextResponse.json(
      { error: "Bad Request", message: "Missing or invalid fields." },
      { status: 400 }
    );
  }

  try {
    const { data, error } = await supabase.rpc("process_inventory_adjustment", {
      p_store_id: storeId,
      p_cashier_id: userId,
      p_items: items,
    });

    if (error) {
      return NextResponse.json(
        { error: "Internal Server Error", message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "Inventory adjustment processed successfully",
      adjustmentId: data,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Internal Server Error", message: errorMessage },
      { status: 500 }
    );
  }
}
