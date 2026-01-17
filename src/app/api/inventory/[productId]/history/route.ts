import { NextResponse, type NextRequest } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { InventoryMovement } from "@/types/inventory";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
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
    const { data, error } = await supabase.rpc(
      "get_product_stock_ledger_paginated",
      {
        p_product_id: productId,
        p_store_id: storeId,
        p_page: page,
        p_page_size: pageSize,
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
