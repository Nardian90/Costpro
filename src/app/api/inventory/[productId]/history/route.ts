import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAuthClient } from "@/lib/supabaseClient";
import { InventoryMovement } from "@/contracts/inventory";
import { withStoreAccess, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { createApiError } from '@/lib/api-errors';

async function getHandler(
  request: NextRequest,
  session: AuthenticatedSession
) {
  const { searchParams } = new URL(request.url);
  // FIX-SEC-H1: storeId is now mandatory (enforced by withStoreAccess)
  const storeId = searchParams.get("storeId") || searchParams.get("store_id");

  const { productId } = await (async () => {
    // Extract productId from URL path
    const parts = new URL(request.url).pathname.split('/');
    const id = parts[parts.length - 2]; // /api/inventory/[productId]/history
    return { productId: id };
  })();

  // FIX-SEC-H1: Clamp pagination parameters to prevent abuse
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10) || 20));
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);

  if (!productId) {
    return NextResponse.json(
      createApiError('MISSING_PRODUCT_ID'),
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
        // FIX-SEC-019: Hide error details in production
        createApiError('INTERNAL_ERROR'),
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
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      // FIX-SEC-019: Hide error details in production
      createApiError('INTERNAL_ERROR'),
      { status: 500 }
    );
  }
}

// FIX-SEC-H1: Wrap with withStoreAccess to enforce store membership validation
export const GET = withTracing(
  withStoreAccess(getHandler as any) as any,
  'GET /api/inventory/[productId]/history'
);
