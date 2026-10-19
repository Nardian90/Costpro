import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseClient';
import { getProductImageUrl } from '@/lib/utils';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    // FIX-AUDIT-4: Rate limit public storefront to prevent scraping/enumeration
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
    const { allowed } = await rateLimit(`storefront:${clientIp}`, { windowMs: 60_000, maxRequests: 60 });
    if (!allowed) {
      return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });
    }

    const { slug } = await params;

    if (!slug || slug.length < 1) {
      return NextResponse.json(
        createApiError('MISSING_STORE_SLUG'),
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Fetch store by slug
    // FIX-STOREFRONT-CONFIG (2026-07-04): Include banner_url, store_tagline,
    // whatsapp_group_url, telegram_url, services, promo_images, opening_hours,
    // banner_cta_text, banner_cta_link so the public storefront can render the
    // configurable sections.
    // CP-SEC-027: superficie pública de tiendas (vista) — anon ya no tiene
    // SELECT directo sobre stores (tenant_id/bank_account/nit fuera de alcance).
    const { data: store, error: storeError } = await supabase
      .from('public_storefronts_v')
      .select('id, name, address, phone, email, logo_url, slug, plantilla, reeup, is_active, banner_url, store_tagline, whatsapp_group_url, telegram_url, services, promo_images, opening_hours, banner_cta_text, banner_cta_link')
      .eq('slug', slug)
      .eq('is_active', true)
      .single();

    if (storeError || !store) {
      return NextResponse.json(
        createApiError('STORE_NOT_FOUND'),
        { status: 404 }
      );
    }

    // Fetch visible products for this store
    // FIX-SEC-H6: Exclude sensitive fields (precio_empresa, conversion_factor) from public API
    // FIX-VISIBILITY: Include price_visible, stock_visible, on_promotion for storefront control
    // CP-SEC-027: catálogo público vía vista — anon ya no tiene SELECT directo
    // sobre products (cost_average/cost_price fuera de alcance). Las variantes
    // se consultan por separado en public_variants_v (misma forma de respuesta).
    const { data: products, error: productsError } = await supabase
      .from('public_catalog_v')
      .select('id, name, description, sku, price, price_currency, image_url, public_image_url, category, unit_of_measure, price_visible, stock_visible, on_promotion')
      .eq('store_id', store.id)
      .eq('visible_en_tienda', true)
      .eq('is_active', true)
      .order('name');

    // CP-SEC-027: variantes públicas en consulta separada (la vista no expone
    // precio_empresa). Mantiene la forma product_variants(id, name, sku, price).
    let variantsByProduct = new Map<string, Array<{ id: string; name: string; sku: string | null; price: number }>>();
    if (products && products.length > 0) {
      const productIds = products.map(p => p.id);
      const { data: variantRows, error: variantError } = await supabase
        .from('public_variants_v')
        .select('id, name, sku, price, product_id')
        .in('product_id', productIds)
        .order('name');
      if (variantError) {
        console.error('Error fetching product variants:', variantError);
      } else {
        for (const v of (variantRows || [])) {
          const list = variantsByProduct.get(v.product_id) || [];
          list.push({ id: v.id, name: v.name, sku: v.sku, price: v.price });
          variantsByProduct.set(v.product_id, list);
        }
      }
    }

    if (productsError) {
      console.error('Error fetching products:', productsError);
      return NextResponse.json({ store, products: [] });
    }

    // Resolve image URLs to full Supabase public URLs
    // FIX-SEC-H6: Removed stock_current from public response (commercial sensitivity)
    // FIX-VISIBILITY: Compute inStock based on on_promotion flag — promoted products
    // show as in stock even with stock_current=0
    // FIX-LOW-STOCK (2026-07-04): Compute stock_level ('low' | 'medium' | 'high' | null)
    // without exposing exact stock_current. Thresholds:
    //   - on_promotion=true OR stock_visible=false → null (no badge)
    //   - stock_current=0 → null (use soldOut badge instead)
    //   - 0 < stock_current <= 5 → 'low' (muestra "Solo quedan pocas")
    //   - 5 < stock_current <= 20 → 'medium'
    //   - stock_current > 20 → 'high'
    const productList = (products || []).map(p => {
      const onPromotion = p.on_promotion === true;
      const stockCurrent = (p as any).stock_current ?? 0;
      let stockLevel: 'low' | 'medium' | 'high' | null = null;
      if (!onPromotion && p.stock_visible !== false && stockCurrent > 0) {
        if (stockCurrent <= 5) stockLevel = 'low';
        else if (stockCurrent <= 20) stockLevel = 'medium';
        else stockLevel = 'high';
      }
      return {
        ...p,
        product_variants: variantsByProduct.get(p.id) || [],
        image_url: p.image_url ? getProductImageUrl(p.image_url) : null,
        public_image_url: p.public_image_url ? getProductImageUrl(p.public_image_url) : null,
        // Si está en promoción, siempre mostrar como disponible
        inStock: onPromotion ? true : stockCurrent > 0,
        // Si price_visible es false, no enviar el precio al cliente
        price: p.price_visible === false ? null : p.price,
        // Si stock_visible es false, no mostrar info de stock
        stock_visible: p.stock_visible !== false,
        // Nivel de stock categorizado (sin exponer número exacto)
        stock_level: stockLevel,
      };
    });

    return NextResponse.json({
      store,
      products: productList,
    });
  } catch (error) {
    console.error('Storefront API error:', error);
    return NextResponse.json(
      createApiError('INTERNAL_ERROR'),
      { status: 500 }
    );
  }
}
