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

    // We fetch products, their variants, and their inventory entries
    // to determine the correct stock for the current store.
    let query = authClient
      .from("products")
      .select(`
        *,
        product_variants (*),
        inventory (*)
      `)
      .order('name');

    if (profile.store_id) {
      // Filter products that are either global (no specific store_id)
      // or specifically assigned to the user's store.
      query = query.or(`store_id.is.null,store_id.eq.${profile.store_id}`);
    }

    const { data: products, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: "Internal Server Error", message: error.message },
        { status: 500 }
      );
    }

    // Map the products to set the correct stock_current for the specific store
    const mappedProducts = products.map((product: any) => {
      let stock_current = 0;

      if (profile.store_id) {
        // Find stock for the user's specific store
        const storeInventory = product.inventory?.find(
          (inv: any) => inv.store_id === profile.store_id
        );
        stock_current = storeInventory ? storeInventory.quantity : 0;
      } else {
        // For admin without a specific store_id, sum stock from all stores
        stock_current = product.inventory?.reduce(
          (acc: number, inv: any) => acc + inv.quantity,
          0
        ) || 0;
      }

      // Return product with updated stock_current and without the raw inventory array
      const { inventory, ...productData } = product;
      return {
        ...productData,
        stock_current,
      };
    });

    return NextResponse.json(mappedProducts);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Internal Server Error", message: errorMessage },
      { status: 500 }
    );
  }
}
