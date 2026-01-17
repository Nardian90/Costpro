import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAuthClient } from "@/lib/supabaseClient";
import { getServerSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getServerSession(request);

  if (!session || !session.token) {
    return NextResponse.json(
      { error: "Unauthorized", message: "No active session" },
      { status: 401 }
    );
  }

  try {
    const authClient = getSupabaseAuthClient(session.token);

    // Get storeId and role from user profile
    const { data: profile, error: profileError } = await authClient
      .from("profiles")
      .select("store_id, role")
      .eq("id", session.user.id)
      .single();

    if (profileError) {
      console.error("Error fetching profile in /api/inventory/products:", profileError);
      return NextResponse.json(
        { error: "Internal Server Error", message: "Could not fetch user profile." },
        { status: 500 }
      );
    }

    if (!profile?.store_id && profile?.role !== 'admin') {
      return NextResponse.json(
        { error: "Bad Request", message: "User is not assigned to a store." },
        { status: 400 }
      );
    }

    let query = authClient
      .from("products")
      .select(`
        *,
        product_variants (*)
      `);

    if (profile.store_id) {
      query = query.eq("store_id", profile.store_id);
    }
    // If admin and no store_id, they see all products

    const { data: products, error } = await query;

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
