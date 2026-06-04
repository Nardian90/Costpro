import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseClient';
import { getProductImageUrl } from '@/lib/utils';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    if (!slug || slug.length < 1) {
      return NextResponse.json(
        { error: 'Slug de tienda es requerido' },
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
        { error: 'Tienda no encontrada' },
        { status: 404 }
      );
    }

    // Fetch visible products for this store
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, description, sku, price, precio_empresa, image_url, public_image_url, category, unit_of_measure, stock_current, product_variants(id, name, sku, price, precio_empresa, conversion_factor)')
      .eq('store_id', store.id)
      .eq('visible_en_tienda', true)
      .eq('is_active', true)
      .order('name');

    if (productsError) {
      console.error('Error fetching products:', productsError);
      return NextResponse.json({ store, products: [] });
    }

    // Fetch accurate stock from RPC (computed from stock_movements in real-time)
    let stockMap = new Map<string, number>();
    try {
      const { data: rpcProducts } = await supabase.rpc('get_paginated_products', {
        p_limit: 1000,
        p_offset: 0,
        p_store_id: store.id,
        p_search_term: '',
        p_category: ''
      });
      for (const rp of (rpcProducts || [])) {
        if (rp.id && rp.stock_current !== undefined) {
          stockMap.set(rp.id, rp.stock_current);
        }
      }
    } catch (e) {
      console.warn('[Storefront API] RPC stock fetch failed, using products.stock_current:', e);
    }

    // Resolve image URLs to full Supabase public URLs and overlay accurate stock from RPC
    const productList = (products || []).map(p => ({
      ...p,
      stock_current: stockMap.get(p.id) ?? p.stock_current ?? 0,
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
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
