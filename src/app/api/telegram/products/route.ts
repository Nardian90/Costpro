import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { canManageStore } from '@/lib/roles';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { getProductPresentation } from '@/lib/storefront/product-presentation';

/**
 * GET /api/telegram/products?store_id=UUID
 *
 * Returns the list of products in this store's vitrina that are ELIGIBLE
 * for Telegram publishing (is_active=true, visible_en_tienda=true).
 *
 * For each product, returns a compact preview object:
 *   - id, name, sku
 *   - eligible (always true here)
 *   - priceVisible (Vitrina rule)
 *   - formattedPrice (or null)
 *   - currency
 *   - stockVisible
 *   - stockQuantity (or null)
 *   - unitOfMeasure
 *   - hasImage
 *
 * Used by the preview UI to let the admin pick which product to preview.
 */
async function handler(req: NextRequest, session: AuthenticatedSession) {
  const url = new URL(req.url);
  const storeId = url.searchParams.get('store_id');
  if (!storeId) {
    return NextResponse.json({ error: 'store_id es obligatorio' }, { status: 400 });
  }
  if (!canManageStore(session.user, storeId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = getSupabaseAdminSafe();
  if (!admin) return NextResponse.json({ error: 'Config error' }, { status: 500 });

  const { data, error } = await admin
    .from('products')
    .select(
      'id, name, sku, description, price, price_currency, price_visible, stock_visible, stock_current, on_promotion, unit_of_measure, image_url, public_image_url, is_active, visible_en_tienda',
    )
    .eq('store_id', storeId)
    .eq('is_active', true)
    .eq('visible_en_tienda', true)
    .order('name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const products = (data || []).map((p: any) => {
    const presentation = getProductPresentation(p);
    return {
      id: p.id,
      name: p.name,
      sku: p.sku ?? null,
      eligible: presentation.eligible,
      priceVisible: presentation.priceVisible,
      formattedPrice: presentation.formattedPrice,
      currency: presentation.currency,
      stockVisible: presentation.stockVisible,
      stockQuantity: presentation.stockQuantity,
      unitOfMeasure: presentation.unitOfMeasure,
      hasImage: presentation.imageUrl !== null,
      // Provide raw flags so the UI can show why a price/stock is hidden
      price_visible_in_vitrina: presentation.priceVisible,
      stock_visible_in_vitrina: presentation.stockVisible,
      on_promotion: p.on_promotion === true,
    };
  });

  return NextResponse.json({ products });
}

export const GET = withAuth(handler as any);
