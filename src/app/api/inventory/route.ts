import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAuthClient } from "@/lib/supabaseClient";
import { getServerSession } from "@/lib/auth";
import { InventoryItem } from "@/types/inventory";
import { rateLimit } from '@/lib/rate-limit';
import { withTracing } from '@/lib/observability';

async function getHandler(request: NextRequest) {
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

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);
  const sku = searchParams.get("sku");
  const storeId = searchParams.get("storeId");

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    const authClient = getSupabaseAuthClient(session.token);

    const query = authClient
      .from("inventory")
      .select(
        `
        product_id,
        quantity,
        version,
        products (
          sku,
          name
        )
      `,
        { count: "exact" }
      );

    if (storeId) {
      query.eq("store_id", storeId);
    }
    if (sku) {
      query.ilike("products.sku", `%${sku}%`);
    }

    const { data, error, count } = await query.range(from, to);

    if (error) {
      console.error("Supabase query error:", error);
      return NextResponse.json(
        { error: "Internal Server Error", message: error.message },
        { status: 500 }
      );
    }

    const formattedData: InventoryItem[] = data.map((item: any) => ({
      productId: item.product_id,
      sku: item.products.sku,
      name: item.products.name,
      quantity: item.quantity,
      version: item.version,
    }));

    return NextResponse.json({
      data: formattedData,
      pagination: {
        totalItems: count || 0,
        currentPage: page,
        pageSize: pageSize,
        totalPages: Math.ceil((count || 0) / pageSize),
      },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export const GET = withTracing(getHandler, 'GET /api/inventory');
