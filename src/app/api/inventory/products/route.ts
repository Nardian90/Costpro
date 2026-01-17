import { NextResponse, type NextRequest } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { getServerSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getServerSession(request);

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized", message: "No active session" },
      { status: 401 }
    );
  }

  try {
    // Get storeId from user profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("store_id")
      .eq("id", session.user.id)
      .single();

    if (profileError || !profile?.store_id) {
      return NextResponse.json(
        { error: "Bad Request", message: "User is not assigned to a store." },
        { status: 400 }
      );
    }

    const { data: products, error } = await supabase
      .from("products")
      .select(`
        *,
        product_variants (*)
      `)
      .eq("store_id", profile.store_id);

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
