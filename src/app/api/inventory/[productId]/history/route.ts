import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAuthClient } from "@/lib/supabaseClient";
import { getServerSession } from "@/lib/auth";
import { InventoryMovement } from "@/types/inventory";
import { rateLimit } from '@/lib/rate-limit';
import { withTracing } from '@/lib/observability';

async function getHandler(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
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

  const { productId } = await params;
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);
  const storeId = searchParams.get("storeId");

  if (!productId) {
    return NextResponse.json(
      { error: "Bad Request", message: "Missing productId." },
      { status: 400 }
    );
  }

  try {
    const authClient = getSupabaseAuthClient(session.token);

    const { data, error } = await authClient.rpc(
      "get_product_stock_ledger_paginated",
      {
        p_product_id: productId,
        p_store_id: storeId,
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
      }
    );

    if (error) {
      return NextResponse.json(
        { error: "Internal Server Error", message: error.message },
        { status: 500 }
      );
    }

    const totalItems = data.length > 0 ? data[0].total_count : 0;
    const totalPages = Math.ceil(totalItems / pageSize);

    const formattedData: InventoryMovement[] = data.map((item: any) => ({
      movementId: item.movement_id,
      timestamp: item.created_at,
      quantityChange: item.quantity_change,
      movementType: item.movement_type,
    }));

    return NextResponse.json({
      data: formattedData,
      pagination: {
        totalItems,
        currentPage: page,
        pageSize,
        totalPages,
      },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Internal Server Error", message: errorMessage },
      { status: 500 }
    );
  }
}

export const GET = withTracing(getHandler as any, 'GET /api/inventory/[productId]/history');
