import { NextResponse, type NextRequest } from "next/server";
import { inventoryAdjustSchema, zodError } from '@/validation/api-schemas';
import { AdjustInventoryResponse } from "@/contracts/inventory";
import { withStoreAccess, AuthenticatedSession } from '@/lib/auth-middleware';
import { rateLimit } from '@/lib/rate-limit';
import { validateOrigin } from '@/lib/csrf';
import { withTracing } from '@/lib/observability';

async function postHandler(request: NextRequest, session: AuthenticatedSession) {
  // FIX-AUDIT-12: CSRF validation on inventory mutation
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: 'Origen no permitido' }, { status: 403 });
  }

  const clientId = session.user.id;
  const { allowed } = await rateLimit(clientId);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const userId = session.user.id;

  try {
    const rawBody = await request.json();
    const parsed = inventoryAdjustSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(zodError(parsed.error), { status: 400 });
    }
    const { productId, quantity, movementType, version, storeId, reason } = parsed.data;

    // DEFECT-001 + REM-INV-6 (E2E-PRODUCT-FIX-ROUND1): register_stock_movement
    // es service_role-only en la superficie certificada (W9.4.2-F06 y
    // REM-INV-6 revocaron EXECUTE de PUBLIC/anon/authenticated). La llamada
    // con el client del usuario devolvía 42501 (permission denied) → 500.
    // Se usa el admin client con p_user_id tomado del JWT (trust boundary,
    // mismo patrón que /api/vale-salida).
    const { getSupabaseAdminSafe } = await import("@/lib/supabase-admin");
    const admin = getSupabaseAdminSafe();
    if (!admin) {
      return NextResponse.json({ error: "Error de configuración del servidor" }, { status: 500 });
    }

    // DEFECT-001: el contrato de la API expone movementType 'add'|'subtract'|'set',
    // pero el enum movement_type de la RPC solo acepta valores de negocio
    // ('sale'|'purchase'|'adjustment'|...). Mapear a 'adjustment' con delta:
    //   add      → +|quantity|
    //   subtract → −|quantity|
    //   set      → quantity − stock actual
    let delta = Number(quantity);
    if (movementType === "subtract") {
      delta = -Math.abs(delta);
    } else if (movementType === "set") {
      const { data: currentInv } = await admin
        .from("inventory")
        .select("quantity")
        .eq("product_id", productId)
        .eq("store_id", storeId)
        .single();
      delta = Number(quantity) - Number(currentInv?.quantity ?? 0);
    }

    if (delta === 0) {
      // Ajuste nulo ('set' al valor actual): responder estado sin mutar stock
      // (la RPC devolvería {status:'skipped'} sin new_quantity/new_version).
      const { data: currentInv } = await admin
        .from("inventory")
        .select("quantity, version")
        .eq("product_id", productId)
        .eq("store_id", storeId)
        .single();
      const unchanged: AdjustInventoryResponse = {
        productId,
        newQuantity: currentInv?.quantity,
        newVersion: currentInv?.version,
      };
      return NextResponse.json(unchanged);
    }

    // Enervida 20261004120002 (patrón certificado): los RPCs que hacen su
    // propio gate de acceso pasan p_skip_access_check := TRUE al escritor
    // interno register_stock_movement, cuya validación interna usa
    // has_store_access(auth.uid()) — insatisfacible bajo service_role
    // (auth.uid() nulo). El gate de esta ruta es withStoreAccess
    // (canManageStore del usuario de sesión vs el storeId del body, 403 en
    // caso contrario), verificado antes de llegar aquí.
    const { data, error } = await admin.rpc("register_stock_movement", {
      p_product_id: productId,
      p_store_id: storeId,
      p_user_id: userId,
      p_quantity: delta,
      p_movement_type: "adjustment",
      p_reason: reason,
      p_sale_id: null,
      p_unit_cost: 0,
      p_notes: `Ajuste manual (Version: ${version})`,
      p_skip_access_check: true,
    });

    if (error) {
      if (error.message.includes("Concurrency error")) {
        const { data: currentInventory } = await admin
          .from("inventory")
          .select("quantity, version")
          .eq("product_id", productId)
          .eq("store_id", storeId)
          .single();

        return NextResponse.json(
          {
            error: "Conflict",
            message: "Inventory version mismatch.",
            serverVersion: currentInventory?.version,
            currentQuantity: currentInventory?.quantity,
          },
          { status: 409 }
        );
      }
      if (error.message.includes("ERR_INSUFFICIENT_STOCK")) {
        return NextResponse.json(
          { error: "Bad Request", message: "Negative stock is not allowed." },
          { status: 400 }
        );
      }
      return NextResponse.json(
        // FIX-SEC-019: Hide error details in production
        { error: "Internal Server Error", message: (process.env.NODE_ENV !== 'production' || !!process.env.VITEST) ? error.message : undefined },
        { status: 500 }
      );
    }

    const response: AdjustInventoryResponse = {
      productId: productId,
      newQuantity: data.new_quantity,
      newVersion: data.new_version,
    };

    return NextResponse.json(response);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      // FIX-SEC-019: Hide error details in production
      { error: "Internal Server Error", message: (process.env.NODE_ENV !== 'production' || !!process.env.VITEST) ? errorMessage : undefined },
      { status: 500 }
    );
  }
}

export const POST = withTracing(withStoreAccess(postHandler) as any, 'POST /api/inventory/adjust');
