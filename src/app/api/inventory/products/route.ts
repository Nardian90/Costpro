import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAuthClient } from "@/lib/supabaseClient";
import { getServerSession } from "@/lib/auth";
import { rateLimit } from '@/lib/rate-limit';
import { withTracing } from '@/lib/observability';

async function productsHandler(request: NextRequest) {
  const session = await getServerSession(request);

  if (!session || !session.token) {
    return NextResponse.json(
      { error: "Unauthorized", message: "No active session" },
      { status: 401 }
    );
  }

  const clientId = request.headers.get('x-forwarded-for') || session.user.id;
  const { allowed } = await rateLimit(clientId);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  try {
    const authClient = getSupabaseAuthClient(session.token);

    // Get storeId and role from user profile
    const { data: profile, error: profileError } = await authClient
      .from("profiles")
      .select("store_id, active_store_id, role")
      .eq("id", session.user.id)
      .single();

    if (profileError) {
      console.error("Error fetching profile in /api/inventory/products:", profileError);
      return NextResponse.json(
        { error: "Internal Server Error", message: "Could not fetch user profile." },
        { status: 500 }
      );
    }

    const effectiveStoreId = profile?.active_store_id || profile?.store_id;

    if (!effectiveStoreId && profile?.role !== 'admin') {
      return NextResponse.json(
        { error: "Bad Request", message: "User is not assigned to a store." },
        { status: 400 }
      );
    }

    // Use the unified get_products_for_pos RPC to ensure consistent logic
    // for stock calculation and multi-store isolation across the entire app.
    const { data: mappedProducts, error } = await authClient.rpc('get_products_for_pos', {
      p_store_id: effectiveStoreId
    });

    if (error) {
      return NextResponse.json(
        // FIX-SEC-019: Hide error details in production
        { error: "Internal Server Error", message: (process.env.NODE_ENV !== 'production' || !!process.env.VITEST) ? error.message : undefined },
        { status: 500 }
      );
    }

    return NextResponse.json(mappedProducts);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      // FIX-SEC-019: Hide error details in production
      { error: "Internal Server Error", message: (process.env.NODE_ENV !== 'production' || !!process.env.VITEST) ? errorMessage : undefined },
      { status: 500 }
    );
  }
}

export const GET = withTracing(productsHandler, 'GET /api/inventory/products');
