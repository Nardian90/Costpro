import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createServerClient } from '@/lib/supabaseClient';
import { headers } from 'next/headers';
import { StorefrontPage } from './StorefrontPage';
import { StorefrontErrorBoundary } from '@/components/StorefrontErrorBoundary';

interface PageProps {
  params: Promise<{ slug: string }>;
}

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_VERCEL_URL
  ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL || process.env.NEXT_PUBLIC_APP_URL}`
  : 'https://costpro.onrender.com';

/**
 * Normalizes a slug by:
 * 1. Decoding any URL-encoded characters (%20 → space)
 * 2. Replacing spaces/hyphens with underscores
 * 3. Lowercasing
 * 4. Stripping multiple consecutive underscores
 */
function normalizeSlug(raw: string): string {
  return decodeURIComponent(raw)
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export const revalidate = 0; // FIX-STOREFRONT-CONFIG: always render fresh (config changes must reflect instantly)

export async function generateStaticParams() {
  try {
    const supabase = createServerClient();
    const { data: stores } = await supabase
      .from('stores')
      .select('slug')
      .eq('is_active', true)
      .not('slug', 'is', null);

    return (stores || []).map((s) => ({
      slug: normalizeSlug(s.slug || ''),
    }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = normalizeSlug(rawSlug);
  const supabase = createServerClient();

  // FIX-MINOR-14: i18n SEO metadata — use next-intl server translations
  // so titles and descriptions are localized per request locale.
  const t = await getTranslations('stores.storefront');

  // Try exact match first, then normalized match
  const { data: store } = await supabase
    .from('stores')
    .select('id, name, logo_url, slug, plantilla, address, phone, email')
    .eq('is_active', true)
    .or(`slug.eq.${rawSlug},slug.eq.${slug}`)
    .maybeSingle();

  if (!store) {
    return { title: t('seoNotFound') };
  }

  const cleanSlug = normalizeSlug(store.slug || '');
  const storeUrl = `${SITE_URL}/tienda/${cleanSlug}`;

  const title = t('seoTitle', { name: store.name });
  const description = t('seoDescription', { name: store.name, address: store.address || null });
  const ogDescription = t('seoOgDescription', { name: store.name });

  return {
    title,
    description,
    alternates: {
      canonical: storeUrl,
    },
    openGraph: {
      title: store.name,
      description: ogDescription,
      url: storeUrl,
      siteName: 'CostPro',
      images: store.logo_url ? [{ url: store.logo_url, width: 200, height: 200, alt: store.name }] : [],
      locale: 'es_ES',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: ogDescription,
      images: store.logo_url ? [store.logo_url] : [],
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function TiendaPublicPage({ params }: PageProps) {
  const { slug: rawSlug } = await params;
  const slug = normalizeSlug(rawSlug);
  const supabase = createServerClient();
  // FIX-CSP: Read nonce from middleware for inline scripts
  const headersList = await headers();
  const nonce = headersList.get('x-csp-nonce') || '';

  // Try exact match first, then normalized match (handles spaces in DB slugs)
  // FIX-STOREFRONT-CONFIG (2026-07-04): incluir banner_url, store_tagline,
  // whatsapp_group_url, telegram_url, services, promo_images, opening_hours
  // para que el SSR renderice la vitrina con la configuración personalizada.
  // Antes el SELECT solo traía campos básicos y el storefront siempre caía
  // al banner por defecto, ignorando la configuración del admin.
  const { data: store, error: storeError } = await supabase
    .from('stores')
    .select('id, name, address, phone, email, logo_url, slug, plantilla, reeup, is_active, banner_url, store_tagline, whatsapp_group_url, telegram_url, services, promo_images, opening_hours')
    .eq('is_active', true)
    .or(`slug.eq.${rawSlug},slug.eq.${slug}`)
    .maybeSingle();

  if (storeError || !store) {
    notFound();
  }

  // If the URL slug doesn't match the DB slug (after normalization), redirect to canonical URL
  const cleanSlug = normalizeSlug(store.slug || '');
  if (slug !== cleanSlug) {
    redirect(`/tienda/${cleanSlug}`);
  }

  // Single fetch: RPC returns all product fields with accurate stock_current
  // (computed from stock_movements in real-time), avoiding a duplicate query.
  let rpcProducts: Array<Record<string, unknown>> = [];
  try {
    const { data, error: rpcError } = await supabase.rpc('get_paginated_products', {
      p_limit: 1000,
      p_offset: 0,
      p_store_id: store.id,
      p_search_term: '',
      p_category: ''
    });
    if (rpcError) throw rpcError;
    rpcProducts = (data || []) as Array<Record<string, unknown>>;
  } catch (e) {
    console.warn('[Tienda] RPC product fetch failed:', e);
  }

  // Filter for storefront-visible, active products and sort by name
  const visibleProducts = rpcProducts
    .filter((p) => p.visible_en_tienda === true && p.is_active === true)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

  // Fetch product_variants only for the visible product IDs (lightweight single query)
  const productIds = visibleProducts.map((p) => p.id as string);
  let variantsByProduct = new Map<string, Array<{
    id: string;
    name: string;
    sku: string | null;
    price: number;
    precio_empresa: number | null;
    conversion_factor: number;
  }>>();

  if (productIds.length > 0) {
    const { data: variantRows } = await supabase
      .from('product_variants')
      .select('id, name, sku, price, precio_empresa, conversion_factor, product_id')
      .in('product_id', productIds)
      .eq('is_active', true)
      .order('name');

    for (const v of (variantRows || [])) {
      const list = variantsByProduct.get(v.product_id) || [];
      list.push({
        id: v.id,
        name: v.name,
        sku: v.sku,
        price: v.price,
        precio_empresa: v.precio_empresa,
        conversion_factor: v.conversion_factor,
      });
      variantsByProduct.set(v.product_id, list);
    }
  }

  // FIX-SEC-H6: Strip commercially-sensitive fields before sending to the public client.
  // The storefront API route already excludes these, but the SSR page bypasses it
  // by calling get_paginated_products directly. We must filter here too.
  const productList = visibleProducts.map((p) => {
    const variants = variantsByProduct.get(p.id as string);
    const onPromotion = (p.on_promotion as boolean) === true;
    return {
      id: p.id as string,
      name: p.name as string,
      description: (p.description as string | null) ?? null,
      sku: (p.sku as string | null) ?? null,
      price: (p.price_visible as boolean) === false ? null : (p.price as number) ?? 0,
      price_currency: (p.price_currency as string) ?? 'CUP',
      image_url: (p.image_url as string | null) ?? null,
      public_image_url: (p.public_image_url as string | null) ?? null,
      category: (p.category as string | null) ?? null,
      unit_of_measure: (p.unit_of_measure as string | null) ?? null,
      inStock: onPromotion || ((p.stock_current as number) ?? 0) > 0,
      on_promotion: onPromotion,
      stock_visible: (p.stock_visible as boolean) !== false,
      product_variants: variants
        ? variants.map(({ id, name, sku, price, conversion_factor }) => ({
            id, name, sku, price, conversion_factor,
          }))
        : null,
    };
  });

  const storeUrl = `${SITE_URL}/tienda/${cleanSlug}`;

  // JSON-LD Structured Data for SEO
  // FIX-MINOR-14: Use i18n key for catalog name in JSON-LD
  // Note: getTranslations is async; for server components in the render phase,
  // we use a simple helper since JSON-LD doesn't support async at this point.
  // The catalog name falls back to Spanish if locale is unavailable.
  const catalogName = `Catálogo de ${store.name}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Store',
    name: store.name,
    url: storeUrl,
    logo: store.logo_url || undefined,
    telephone: store.phone || undefined,
    email: store.email || undefined,
    address: store.address
      ? {
          '@type': 'PostalAddress',
          streetAddress: store.address,
          addressCountry: 'CU',
        }
      : undefined,
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: catalogName,
      itemListElement: (productList).slice(0, 50).map((product, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'Product',
          name: product.name,
          description: product.description || undefined,
          sku: product.sku || undefined,
          image: product.public_image_url || product.image_url || undefined,
          offers: {
            '@type': 'Offer',
            price: product.price,
            priceCurrency: 'CUP',
            availability: product.inStock
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
          },
          category: product.category || undefined,
        },
      })),
    },
  };

  return (
    <>
      {/* JSON-LD Structured Data — sanitized to prevent XSS via </script> injection */}
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/<\/script/gi, '<\\/script') }}
      />
      <StorefrontErrorBoundary storeName={store.name}>
        <StorefrontPage
          store={store}
          products={productList}
        />
      </StorefrontErrorBoundary>
    </>
  );
}
