import { NextResponse, type NextRequest } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { InventoryItem } from "@/types/inventory";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);
  const sku = searchParams.get("sku");
  const storeId = searchParams.get("storeId");

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    const query = supabase
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
