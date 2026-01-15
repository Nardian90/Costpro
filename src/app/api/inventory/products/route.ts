import { NextResponse, type NextRequest } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function GET(request: NextRequest) {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError || !sessionData.session) {
    return NextResponse.json(
      { error: "Unauthorized", message: "No active session" },
      { status: 401 }
    );
  }

  // TODO: Get storeId from session or user profile
  const storeId = "your_store_id";

  try {
    const { data: products, error } = await supabase
      .from("products")
      .select(`
        *,
        product_variants (*)
      `)
      .eq("store_id", storeId);

    if (error) {
      return NextResponse.json(
        { error: "Internal Server Error", message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(products);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Internal Server Error", message: errorMessage },
      { status: 500 }
    );
  }
}
