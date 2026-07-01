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
    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('id, name, address, phone, email, logo_url, slug, plantilla, reeup, is_active')
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
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, description, sku, price, image_url, public_image_url, category, unit_of_measure, product_variants(id, name, sku, price)')
      .eq('store_id', store.id)
      .eq('visible_en_tienda', true)
      .eq('is_active', true)
      .order('name');

    if (productsError) {
      console.error('Error fetching products:', productsError);
      return NextResponse.json({ store, products: [] });
    }

    // Resolve image URLs to full Supabase public URLs
    // FIX-SEC-H6: Removed stock_current from public response (commercial sensitivity)
    const productList = (products || []).map(p => ({
      ...p,
      image_url: p.image_url ? getProductImageUrl(p.image_url) : null,
      public_image_url: p.public_image_url ? getProductImageUrl(p.public_image_url) : null,
    }));

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
