import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAuthClient } from "@/lib/supabaseClient";
import { withStoreAccess, AuthenticatedSession } from '@/lib/auth-middleware';
import { rateLimit } from '@/lib/rate-limit';
import { withTracing } from '@/lib/observability';

async function productsHandler(request: NextRequest, session: AuthenticatedSession) {
  const clientId = session.user.id;
  const { allowed } = await rateLimit(clientId);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  try {
    // storeId is required and validated by withStoreAccess middleware
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId') || searchParams.get('store_id');

    if (!storeId) {
      return NextResponse.json(
        { error: "Bad Request", message: "storeId es requerido" },
        { status: 400 }
      );
    }

    const authClient = getSupabaseAuthClient(session.token);

    // Use the unified get_products_for_pos RPC to ensure consistent logic
    // for stock calculation and multi-store isolation across the entire app.
    const { data: mappedProducts, error } = await authClient.rpc('get_products_for_pos', {
      p_store_id: storeId
    });

    if (error) {
      return NextResponse.json(
        { error: "Internal Server Error", message: (process.env.NODE_ENV !== 'production' || !!process.env.VITEST) ? error.message : undefined },
        { status: 500 }
      );
    }

    return NextResponse.json(mappedProducts);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Internal Server Error", message: (process.env.NODE_ENV !== 'production' || !!process.env.VITEST) ? errorMessage : undefined },
      { status: 500 }
    );
  }
}

export const GET = withTracing(withStoreAccess(productsHandler) as any, 'GET /api/inventory/products');
