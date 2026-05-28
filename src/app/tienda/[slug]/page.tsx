import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabaseClient';
import { StorefrontPage } from './StorefrontPage';

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

export const revalidate = 60; // ISR: re-generate every 60s

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

  // Try exact match first, then normalized match
  const { data: store } = await supabase
    .from('stores')
    .select('id, name, logo_url, slug, plantilla, address, phone, email')
    .eq('is_active', true)
    .or(`slug.eq.${rawSlug},slug.eq.${slug}`)
    .maybeSingle();

  if (!store) {
    return { title: 'Tienda no encontrada' };
  }

  const cleanSlug = normalizeSlug(store.slug || '');
  const storeUrl = `${SITE_URL}/tienda/${cleanSlug}`;

  return {
    title: `${store.name} — Catálogo de Productos`,
    description: `Explora los productos disponibles en ${store.name}. Precios actualizados y gran variedad.${store.address ? ` Ubicada en ${store.address}.` : ''}`,
    alternates: {
      canonical: storeUrl,
    },
    openGraph: {
      title: store.name,
      description: `Catálogo de productos — ${store.name}`,
      url: storeUrl,
      siteName: 'CostPro',
      images: store.logo_url ? [{ url: store.logo_url, width: 200, height: 200, alt: store.name }] : [],
      locale: 'es_ES',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${store.name} — Catálogo de Productos`,
      description: `Catálogo de productos — ${store.name}`,
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

  // Try exact match first, then normalized match (handles spaces in DB slugs)
  const { data: store, error: storeError } = await supabase
    .from('stores')
    .select('id, name, address, phone, email, logo_url, slug, plantilla, reeup, is_active')
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

  const { data: products } = await supabase
    .from('products')
    .select('id, name, description, sku, price, image_url, public_image_url, category, unit_of_measure, stock_current, product_variants(id, name, sku, price, conversion_factor)')
    .eq('store_id', store.id)
    .eq('visible_en_tienda', true)
    .eq('is_active', true)
    .order('name');

  const storeUrl = `${SITE_URL}/tienda/${cleanSlug}`;

  // JSON-LD Structured Data for SEO
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
      name: `Catálogo de ${store.name}`,
      itemListElement: (products || []).slice(0, 50).map((product, index) => ({
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
            availability: (product.stock_current ?? 0) > 0
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
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <StorefrontPage
        store={store}
        products={products || []}
      />
    </>
  );
}
