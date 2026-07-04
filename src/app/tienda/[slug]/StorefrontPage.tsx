'use client';

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import Image from 'next/image';
import {
  Search,
  Package,
  Phone,
  Mail,
  MapPin,
  Filter,
  X,
  MessageCircle,
  Share2,
  Facebook,
  Send,
  Twitter,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  Zap,
  Truck,
  Shield,
  Clock,
  Star,
  LayoutGrid,
  List,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn, formatCurrency, getProductImageUrl } from '@/lib/utils';

// ── Shared Types ─────────────────────────────────────────────────

export interface StorefrontProduct {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  price: number | null;
  image_url: string | null;
  public_image_url: string | null;
  category: string | null;
  unit_of_measure: string | null;
  /** Whether the product is in stock — only a boolean is exposed publicly (FIX-SEC-H6) */
  inStock: boolean;
  /** Whether to show stock info (FIX-VISIBILITY) */
  stock_visible?: boolean;
  /** Whether product is on promotion (shows as available even with 0 stock) */
  on_promotion?: boolean;
  product_variants: {
    id: string;
    name: string;
    sku: string | null;
    price: number;
    conversion_factor: number;
  }[] | null;
}

export interface StorefrontStore {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  slug: string | null;
  plantilla: string | null;
  reeup: string | null;
  is_active: boolean;
}

export interface StorefrontPageProps {
  store: StorefrontStore;
  products: StorefrontProduct[];
}

// ── Shared Hook: Search, Filter, Stats ─────────────────────────

/** Debounce delay for search input — reduces re-renders while typing (PERF-003) */
const SEARCH_DEBOUNCE_MS = 300;

function useProductFilter(products: StorefrontProduct[]) {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce the search term to avoid excessive filtering on every keystroke
  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), SEARCH_DEBOUNCE_MS);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => { if (p.category) cats.add(p.category); });
    return Array.from(cats).sort((a, b) => a.localeCompare(b));
  }, [products]);

  // Use debouncedSearch for filtering — reduces useMemo recalculations
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchSearch = !debouncedSearch ||
        p.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(debouncedSearch.toLowerCase())) ||
        (p.description && p.description.toLowerCase().includes(debouncedSearch.toLowerCase()));
      const matchCategory = !selectedCategory || p.category === selectedCategory;
      return matchSearch && matchCategory;
    });
  }, [products, debouncedSearch, selectedCategory]);

  const totalProducts = products.length;
  const totalWithStock = products.filter((p) => p.inStock).length;

  const productImage = useCallback((p: StorefrontProduct) => {
    const raw = p.image_url || p.public_image_url;
    return raw ? getProductImageUrl(raw) : null;
  }, []);

  const clearFilters = useCallback(() => {
    setSearchTerm('');
    setDebouncedSearch('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSelectedCategory(null);
  }, []);

  return {
    searchTerm, setSearchTerm: handleSearchChange,
    selectedCategory, setSelectedCategory,
    showFilters, setShowFilters,
    categories, filteredProducts,
    totalProducts, totalWithStock,
    productImage, clearFilters,
  };
}

// ── Product Image with Skeleton ────────────────────────────────

function ProductImage({ src, alt, className, imgClassName }: {
  src: string;
  alt: string;
  className?: string;
  imgClassName?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={`relative overflow-hidden bg-muted ${className || ''}`}>
      {!loaded && <div className="absolute inset-0 animate-pulse bg-muted/50" />}
      <img
        src={src}
        alt={alt}
        className={`h-full w-full object-cover transition-[opacity,transform] duration-500 ${loaded ? 'opacity-100' : 'opacity-0'} ${imgClassName || ''}`}
        onLoad={() => setLoaded(true)}
        loading="lazy"
      />
    </div>
  );
}

// ── Product Detail Modal ────────────────────────────────────────

function ProductDetailModal({
  product,
  onClose,
  storePhone,
}: {
  product: StorefrontProduct;
  onClose: () => void;
  storePhone?: string | null;
}) {
  const t = useTranslations('stores.storefront');
  const imageUrlRaw = product.image_url || product.public_image_url;
  const imageUrl = imageUrlRaw ? getProductImageUrl(imageUrlRaw) : null;
  const inStock = product.inStock;
  const productText = encodeURIComponent(
    `${t('whatsappInquiryMessage', { name: product.name })}${product.sku ? t('whatsappInquirySku', { sku: product.sku }) : ''}${product.price != null ? t('whatsappInquiryPrice', { price: formatCurrency(product.price) }) : ''}`
  );
  const whatsappUrl = storePhone
    ? `https://wa.me/${storePhone.replace(/[^0-9]/g, '')}?text=${productText}`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 left-3 z-10 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
          aria-label={t('close')}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        {imageUrl ? (
          <ProductImage src={imageUrl} alt={product.name} className="aspect-[4/3] w-full rounded-t-2xl" />
        ) : (
          <div className="aspect-[4/3] w-full bg-stone-100 rounded-t-2xl flex items-center justify-center">
            <Package className="w-16 h-16 text-stone-200" />
          </div>
        )}
        <div className="p-5 space-y-4">
          <div>
            {product.category && (
              <span className="text-[10px] font-black uppercase tracking-widest text-stone-400">{product.category}</span>
            )}
            <h2 className="font-black text-xl uppercase tracking-tight">{product.name}</h2>
            {product.sku && <p className="text-xs font-mono text-stone-400 mt-0.5">{t('sku')}: {product.sku}</p>}
          </div>
          {product.description && (
            <p className="text-sm text-stone-600 leading-relaxed">{product.description}</p>
          )}
          {product.product_variants && product.product_variants.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-stone-400 mb-2">{t('variants')}</p>
              <div className="space-y-1.5">
                {product.product_variants.map((v) => (
                  <div key={v.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-stone-50 border border-stone-100">
                    <div>
                      <span className="text-xs font-bold text-stone-700">{v.name}</span>
                      <span className="text-[10px] text-stone-400 ml-1">(x{v.conversion_factor})</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-black text-stone-900">{formatCurrency(v.price)}</span>
                      {/* precio_empresa excluded from public storefront (FIX-SEC-H6) */}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-end justify-between pt-4 border-t border-stone-100">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-stone-400">{t('retailPrice')}</p>
              {product.price != null ? (
                <>
                  <p className="text-2xl font-black text-stone-900">{formatCurrency(product.price)}</p>
                  <span className="text-xs text-stone-400">{product.unit_of_measure || t('unit')}</span>
                </>
              ) : (
                <p className="text-2xl font-black text-stone-400 italic">{t('priceOnRequest', { defaultValue: 'Consultar' })}</p>
              )}
            </div>
            {product.stock_visible !== false && (
              <span className={cn(
                'px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest',
                inStock ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
              )}>
                {inStock ? t('inStock') : t('soldOut')}
              </span>
            )}
          </div>
          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-green-600 text-white text-sm font-black uppercase tracking-widest hover:bg-green-700 transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              {t('whatsappInquiry')}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Social Share Footer ─────────────────────────────────────────

function StorefrontFooter({
  store,
  template = 'construccion',
}: {
  store: StorefrontStore;
  template?: string;
}) {
  const t = useTranslations('stores.storefront');
  const storeUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/tienda/${(store.slug || '').toLowerCase().replace(/[\s-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}`
    : '';
  const shareText = encodeURIComponent(t('catalogOf', { name: store.name }));
  const [showShare, setShowShare] = useState(false);

  const isConstruccion = template === 'construccion';
  const footerBg = isConstruccion ? 'bg-stone-900 border-t-4 border-amber-500' : 'bg-white border-t border-stone-200';
  const footerText = isConstruccion ? 'text-stone-400' : 'text-stone-500';

  return (
    <footer className={cn(footerBg)}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            <p className={cn('font-black text-sm uppercase tracking-tighter', isConstruccion ? 'text-white' : 'text-stone-900')}>
              {store.name}
            </p>
            <p className="text-[10px] font-bold uppercase tracking-widest mt-1 text-stone-500">
              {t('catalogViewOnly')}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-center">
            {/* Social Share */}
            <div className="relative">
              <button
                onClick={() => setShowShare(!showShare)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors',
                  isConstruccion
                    ? 'border border-stone-700 hover:border-stone-500'
                    : 'border border-stone-200 hover:border-stone-400'
                )}
                title={t('shareStore')}
              >
                <Share2 className="w-4 h-4" />
                {t('share')}
              </button>
              {showShare && (
                <div className="absolute bottom-full mb-2 right-0 bg-white rounded-xl shadow-xl border border-stone-200 p-2 flex items-center gap-1.5 z-50">
                  <a
                    href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(storeUrl)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 transition-colors"
                    title={t('shareFacebook')}
                    onClick={() => setShowShare(false)}
                  >
                    <Facebook className="w-4 h-4" />
                  </a>
                  <a
                    href={`https://t.me/share/url?url=${encodeURIComponent(storeUrl)}&text=${shareText}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-9 h-9 rounded-lg bg-sky-500 text-white flex items-center justify-center hover:bg-sky-600 transition-colors"
                    title={t('shareTelegram')}
                    onClick={() => setShowShare(false)}
                  >
                    <Send className="w-4 h-4" />
                  </a>
                  <a
                    href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(storeUrl)}&text=${shareText}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-9 h-9 rounded-lg bg-stone-800 text-white flex items-center justify-center hover:bg-stone-900 transition-colors"
                    title={t('shareTwitter')}
                    onClick={() => setShowShare(false)}
                  >
                    <Twitter className="w-4 h-4" />
                  </a>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(storeUrl).then(() => {
                        setShowShare(false);
                      });
                    }}
                    className="w-9 h-9 rounded-lg bg-stone-100 text-stone-600 flex items-center justify-center hover:bg-stone-200 transition-colors"
                    title={t('copyLink')}
                  >
                    <span className="text-xs font-black">URL</span>
                  </button>
                </div>
              )}
            </div>
            {store.phone && (
              <a
                href={`https://wa.me/${store.phone.replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 text-white text-xs font-black uppercase tracking-widest hover:bg-green-700 transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                {t('whatsapp')}
              </a>
            )}
            {store.phone && (
              <a
                href={`tel:${store.phone}`}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-black uppercase tracking-widest transition-colors',
                  isConstruccion
                    ? 'border-stone-700 hover:border-stone-500'
                    : 'border-stone-200 hover:border-stone-400'
                )}
              >
                <Phone className="w-4 h-4" />
                {t('call')}
              </a>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}

// ── Search Toolbar (shared) ────────────────────────────────────

function SearchToolbar({
  searchTerm,
  setSearchTerm,
  showFilters,
  setShowFilters,
  categories,
  selectedCategory,
  setSelectedCategory,
  accentColor,
  totalProducts,
  totalWithStock,
}: {
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  showFilters: boolean;
  setShowFilters: (v: boolean) => void;
  categories: string[];
  selectedCategory: string | null;
  setSelectedCategory: (v: string | null) => void;
  accentColor: string;
  totalProducts: number;
  totalWithStock: number;
}) {
  const t = useTranslations('stores.storefront');

  return (
    <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border-2 border-stone-200 bg-stone-50 text-sm font-bold focus:border-stone-400 focus:bg-white outline-none transition-all"
              aria-label={t('searchProducts')}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                aria-label={t('clearSearch')}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
            aria-controls="minimalist-category-filters"
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-xs font-black uppercase tracking-widest transition-all',
              showFilters
                ? `border-stone-900 bg-stone-900 text-white`
                : 'border-stone-200 bg-stone-50 text-stone-600 hover:border-stone-400'
            )}
          >
            <Filter className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('categories')}</span>
          </button>
        </div>
        {showFilters && categories.length > 0 && (
          <div id="minimalist-category-filters" role="navigation" aria-label={t('filterByCategory')} className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory(null)}
              className={cn(
                'px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest border-2 transition-all',
                !selectedCategory
                  ? 'border-stone-900 bg-stone-900 text-white'
                  : 'border-stone-200 bg-white text-stone-600 hover:border-stone-400'
              )}
            >
              {t('allCategories')}
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest border-2 transition-all',
                  selectedCategory === cat
                    ? 'border-stone-900 bg-stone-900 text-white'
                    : 'border-stone-200 bg-white text-stone-600 hover:border-stone-400'
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// TEMPLATE: CONSTRUCCIÓN (Caribbean Cuban architecture, earth tones)
// ══════════════════════════════════════════════════════════════════

type ViewMode = 'grid' | 'list';

function ConstruccionTemplate({ store, products }: StorefrontPageProps) {
  const t = useTranslations('stores.storefront');
  const filter = useProductFilter(products);
  const [detailProduct, setDetailProduct] = useState<StorefrontProduct | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showBackTop, setShowBackTop] = useState(false);
  const [bannerLoaded, setBannerLoaded] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowBackTop(window.scrollY > 600);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900">
      {/* Hero Banner with Caribbean construction image */}
      <header className="relative overflow-hidden">
        {/* Animated amber top bar */}
        <div className="h-1.5" style={{
          background: 'linear-gradient(90deg, #f59e0b, #d97706, #f59e0b, #d97706)',
          backgroundSize: '300% 100%',
          animation: 'construccionShimmer 4s ease-in-out infinite',
        }} />

        {/* Banner background image */}
        <div className="relative h-52 sm:h-64 md:h-80 lg:h-96">
          {/* Preload placeholder */}
          <div className="absolute inset-0 bg-gradient-to-br from-amber-900 via-stone-800 to-stone-900" />
          {/* Actual image */}
          <img
            src="/storefront-construccion-banner.png"
            alt=""
            className={cn(
              'absolute inset-0 w-full h-full object-cover transition-opacity duration-700',
              bannerLoaded ? 'opacity-100' : 'opacity-0'
            )}
            onLoad={() => setBannerLoaded(true)}
            loading="eager"
          />
          {/* Dark gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-stone-900/95 via-stone-900/60 to-stone-900/30" />
          {/* Warm amber glow at bottom */}
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-amber-600/20 to-transparent" />

          {/* Store info overlaid on banner */}
          <div className="absolute inset-0 flex items-end">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-8 sm:pb-10 w-full">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex gap-0.5">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-3 h-3 text-amber-400 fill-amber-400" />
                    ))}
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-amber-300/90">{t('officialCatalog')}</span>
                </div>
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black uppercase tracking-tighter leading-[0.95] text-white drop-shadow-lg">
                  {store.name}
                </h1>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs sm:text-sm text-stone-300 font-medium">
                  {store.address && <span className="flex items-center gap-1.5"><MapPin className="w-3 h-3 text-amber-400/80" />{store.address}</span>}
                  {store.phone && <span className="flex items-center gap-1.5"><Phone className="w-3 h-3 text-amber-400/80" />{store.phone}</span>}
                  {store.email && <span className="flex items-center gap-1.5"><Mail className="w-3 h-3 text-amber-400/80" />{store.email}</span>}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats bar with glass effect */}
        <div className="bg-stone-900/90 backdrop-blur-md border-t border-amber-500/20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 sm:gap-8">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center">
                  <Package className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div>
                  <p className="text-base sm:text-lg font-black text-white leading-none">{filter.totalProducts}</p>
                  <p className="text-[8px] font-bold uppercase tracking-widest text-stone-400">{t('productsLabel', { count: filter.totalProducts })}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-base sm:text-lg font-black text-white leading-none">{filter.totalWithStock}</p>
                  <p className="text-[8px] font-bold uppercase tracking-widest text-stone-400">{t('availableLabel', { count: filter.totalWithStock })}</p>
                </div>
              </div>
            </div>
            {store.phone && (
              <a
                href={`https://wa.me/${store.phone.replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-[11px] font-black uppercase tracking-widest transition-all hover:shadow-lg hover:shadow-green-600/20 active:scale-95"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                {t('inquireNow')}
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Trust bar */}
      <div className="bg-white border-b border-stone-200/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="flex items-center gap-1.5 justify-center">
              <Truck className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="text-[9px] sm:text-[11px] font-bold uppercase tracking-wider text-stone-500">{t('deliveryAvailable')}</span>
            </div>
            <div className="flex items-center gap-1.5 justify-center">
              <Shield className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="text-[9px] sm:text-[11px] font-bold uppercase tracking-wider text-stone-500">{t('verifiedProducts')}</span>
            </div>
            <div className="flex items-center gap-1.5 justify-center">
              <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="text-[9px] sm:text-[11px] font-bold uppercase tracking-wider text-stone-500">{t('updatedToday')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Search + Filter + View Toggle Toolbar */}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                type="text"
                value={filter.searchTerm}
                onChange={(e) => filter.setSearchTerm(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border-2 border-stone-200 bg-stone-50 text-sm font-bold focus:border-amber-400 focus:bg-white outline-none transition-all"
                aria-label={t('searchProducts')}
              />
              {filter.searchTerm && (
                <button
                  onClick={() => filter.setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                  aria-label={t('clearSearch')}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {/* Category filter button */}
            <button
              onClick={() => filter.setShowFilters(!filter.showFilters)}
              aria-expanded={filter.showFilters}
              aria-controls="construccion-category-filters"
              className={cn(
                'flex items-center gap-1.5 px-3 py-2.5 rounded-xl border-2 text-[11px] font-black uppercase tracking-widest transition-all',
                filter.showFilters
                  ? 'border-amber-600 bg-amber-600 text-white'
                  : 'border-stone-200 bg-stone-50 text-stone-600 hover:border-amber-300'
              )}
            >
              <Filter className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('categories')}</span>
            </button>
            {/* View toggle */}
            <div className="flex rounded-xl border-2 border-stone-200 overflow-hidden">
              <button
                onClick={() => setViewMode('grid')}
                className={cn(
                  'p-2.5 transition-colors',
                  viewMode === 'grid' ? 'bg-amber-600 text-white' : 'bg-stone-50 text-stone-400 hover:bg-stone-100'
                )}
                title={t('gridView')}
                aria-label={t('gridView')}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={cn(
                  'p-2.5 transition-colors',
                  viewMode === 'list' ? 'bg-amber-600 text-white' : 'bg-stone-50 text-stone-400 hover:bg-stone-100'
                )}
                title={t('listView')}
                aria-label={t('listView')}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Category chips */}
          {filter.showFilters && filter.categories.length > 0 && (
            <div id="construccion-category-filters" role="navigation" aria-label={t('filterByCategory')} className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => filter.setSelectedCategory(null)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest border-2 transition-all active:scale-95',
                  !filter.selectedCategory
                    ? 'border-amber-600 bg-amber-600 text-white'
                    : 'border-stone-200 bg-white text-stone-600 hover:border-amber-300'
                )}
              >
                {t('allCategoriesCount', { count: filter.totalProducts })}
              </button>
              {filter.categories.map((cat) => {
                const count = products.filter(p => p.category === cat).length;
                return (
                  <button
                    key={cat}
                    onClick={() => filter.setSelectedCategory(cat === filter.selectedCategory ? null : cat)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest border-2 transition-all active:scale-95',
                      filter.selectedCategory === cat
                        ? 'border-amber-600 bg-amber-600 text-white'
                        : 'border-stone-200 bg-white text-stone-600 hover:border-amber-300'
                    )}
                  >
                    {cat} ({count})
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {filter.filteredProducts.length === 0 ? (
          <div className="py-24 text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-stone-200/50 flex items-center justify-center">
              <Package className="w-10 h-10 text-stone-300" />
            </div>
            <p className="font-black uppercase tracking-widest text-sm text-stone-400">{t('noProductsFound')}</p>
            <p className="text-xs text-stone-300 mt-2">{t('tryOtherSearch')}</p>
            {(filter.searchTerm || filter.selectedCategory) && (
              <button onClick={filter.clearFilters} className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 text-white text-xs font-black uppercase tracking-widest hover:bg-amber-500 transition-colors active:scale-95">
                <X className="w-3.5 h-3.5" />
                {t('clearFilters')}
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          /* ─── Grid View ─── */
          <>
            <div className="flex items-center gap-3 mb-6">
              <div className="h-px flex-1 bg-gradient-to-r from-amber-300 to-transparent" />
              <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-700">{t('ourProducts')}</h2>
              <div className="h-px flex-1 bg-gradient-to-l from-amber-300 to-transparent" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {filter.filteredProducts.map((p) => (
                <ConstruccionCard key={p.id} product={p} image={filter.productImage(p)} onClick={() => setDetailProduct(p)} />
              ))}
            </div>
          </>
        ) : (
          /* ─── List / Table View ─── */
          <>
            <div className="flex items-center gap-3 mb-6">
              <div className="h-px flex-1 bg-gradient-to-r from-amber-300 to-transparent" />
              <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-700">{t('productList')}</h2>
              <div className="h-px flex-1 bg-gradient-to-l from-amber-300 to-transparent" />
            </div>
            <div className="space-y-3">
              {filter.filteredProducts.map((p) => (
                <ConstruccionListItem key={p.id} product={p} image={filter.productImage(p)} onClick={() => setDetailProduct(p)} />
              ))}
            </div>
          </>
        )}

        {/* Product count footer */}
        {filter.filteredProducts.length > 0 && (
          <div role="status" aria-live="polite" className="mt-10 flex items-center justify-center gap-3">
            <div className="h-px w-12 bg-stone-300" />
            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
              {t('showingCount', { count: filter.filteredProducts.length, total: filter.totalProducts })}
            </p>
            <div className="h-px w-12 bg-stone-300" />
          </div>
        )}
      </main>

      {/* Back to top button */}
      {showBackTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-24 right-6 z-40 w-10 h-10 rounded-xl bg-amber-600 text-white shadow-lg shadow-amber-600/20 flex items-center justify-center hover:bg-amber-500 transition-all active:scale-90"
          aria-label={t('backToTop')}
        >
          <ArrowUp className="w-4 h-4" />
        </button>
      )}

      <StorefrontFooter store={store} template="construccion" />
      {detailProduct && <ProductDetailModal product={detailProduct} onClose={() => setDetailProduct(null)} storePhone={store.phone} />}
    </div>
  );
}

// ── Construccion Card (Grid view) ──────────────────────────────

function StockBadge({ inStock }: { inStock: boolean }) {
  const t = useTranslations('stores.storefront');
  return (
    <span className={cn(
      'px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest backdrop-blur-md flex items-center gap-1.5',
      inStock ? 'bg-emerald-600/90 text-white' : 'bg-red-600/90 text-white'
    )}>
      <span className={cn('w-1.5 h-1.5 rounded-full', inStock ? 'bg-emerald-200' : 'bg-red-200')} />
      {inStock ? t('inStock') : t('soldOut')}
    </span>
  );
}

function StockPill({ inStock }: { inStock: boolean }) {
  const t = useTranslations('stores.storefront');
  return (
    <div className={cn(
      'ml-auto flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md',
      inStock ? 'text-emerald-700 bg-emerald-50' : 'text-red-600 bg-red-50'
    )}>
      <span className={cn('w-1.5 h-1.5 rounded-full', inStock ? 'bg-emerald-500' : 'bg-red-500')} />
      {inStock ? t('inStock') : t('soldOut')}
    </div>
  );
}

function ConstruccionCard({ product, image, onClick }: { product: StorefrontProduct; image: string | null; onClick: () => void }) {
  const t = useTranslations('stores.storefront');
  const [expanded, setExpanded] = useState(false);
  const inStock = product.inStock;

  return (
    <div className={cn(
      'group rounded-2xl bg-white overflow-hidden transition-all duration-300 flex flex-col cursor-pointer shadow-sm',
      inStock
        ? 'hover:shadow-xl hover:shadow-amber-500/10 hover:-translate-y-1 border border-stone-200/80'
        : 'opacity-60 border border-stone-200/40',
    )} onClick={onClick}>
      <div className="relative aspect-[4/3] bg-gradient-to-br from-stone-100 to-stone-50 overflow-hidden">
        {image ? (
          <ProductImage src={image} alt={product.name} className="absolute inset-0" imgClassName="group-hover:scale-105" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <Package className="w-10 h-10 text-stone-200 mx-auto" />
              <p className="text-[9px] font-bold uppercase tracking-widest text-stone-300 mt-1">{t('noImage')}</p>
            </div>
          </div>
        )}
        {/* Top-left corner accent */}
        <div className="absolute top-0 left-0 w-10 h-10 z-10">
          <div className="absolute top-0 left-0 w-full h-[3px] bg-amber-500" />
          <div className="absolute top-0 left-0 w-[3px] h-full bg-amber-500" />
        </div>
        {product.category && (
          <span className="absolute top-3 left-3 px-2 py-0.5 rounded-md bg-stone-900/80 text-[9px] font-black uppercase tracking-widest text-amber-400 backdrop-blur-md">
            {product.category}
          </span>
        )}
        {product.stock_visible !== false && <StockBadge inStock={inStock} />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
      </div>
      <div className="flex-1 p-4 flex flex-col gap-1.5">
        <div className="min-w-0">
          <h3 className="font-black text-sm uppercase tracking-tight truncate text-stone-900 group-hover:text-amber-800 transition-colors">{product.name}</h3>
          {product.sku && <p className="text-[10px] font-mono text-stone-400 mt-0.5">{t('sku')}: {product.sku}</p>}
        </div>
        {product.description && (
          <div>
            <p className={cn('text-xs text-stone-500 leading-relaxed', !expanded && 'line-clamp-2')}>{product.description}</p>
            {product.description.length > 80 && (
              <button onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }} className="text-[10px] font-black uppercase tracking-widest text-amber-600 hover:text-amber-700 mt-1 flex items-center gap-0.5">
                {expanded ? <><span>{t('showLess')}</span><ChevronLeft className="w-3 h-3" /></> : <><span>{t('showMore')}</span><ChevronRight className="w-3 h-3" /></>}
              </button>
            )}
          </div>
        )}
        {product.product_variants && product.product_variants.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {product.product_variants.map((v) => (
              <span key={v.id} className="px-1.5 py-0.5 rounded bg-amber-50 text-[9px] font-bold text-amber-700 border border-amber-200/60">
                {v.name}{v.price !== product.price && <span className="ml-0.5 text-amber-600">{formatCurrency(v.price)}</span>}
              </span>
            ))}
          </div>
        )}
        <div className="flex-1" />
        <div className="flex items-end justify-between pt-2.5 border-t border-stone-100">
          <div>
            <p className="text-[8px] font-black uppercase tracking-[0.15em] text-stone-400 mb-0.5">{t('price')}</p>
            {product.price != null ? (
              <p className="text-lg sm:text-xl font-black text-stone-900 tracking-tight">{formatCurrency(product.price)}</p>
            ) : (
              <p className="text-lg sm:text-xl font-black text-stone-400 italic">{t('priceOnRequest', { defaultValue: 'Consultar' })}</p>
            )}
          </div>
          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">{product.unit_of_measure || t('unit')}</span>
        </div>
      </div>
    </div>
  );
}

// ── Construccion List Item (Table/List view) ────────────────────

function ConstruccionListItem({ product, image, onClick }: { product: StorefrontProduct; image: string | null; onClick: () => void }) {
  const t = useTranslations('stores.storefront');
  const inStock = product.inStock;

  return (
    <div
      className={cn(
        'group flex gap-4 p-3 sm:p-4 rounded-xl bg-white border transition-all duration-200 cursor-pointer',
        inStock
          ? 'border-stone-200/80 hover:border-amber-400/50 hover:shadow-md hover:shadow-amber-500/5'
          : 'border-stone-200/40 opacity-60'
      )}
      onClick={onClick}
    >
      {/* Thumbnail */}
      <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-lg bg-gradient-to-br from-stone-100 to-stone-50 overflow-hidden shrink-0">
        {image ? (
          <ProductImage src={image} alt={product.name} className="absolute inset-0" imgClassName="group-hover:scale-105" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-8 h-8 text-stone-200" />
          </div>
        )}
        {/* Stock dot */}
        <span className={cn('absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full border-2 border-white', inStock ? 'bg-emerald-500' : 'bg-red-500')} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {product.category && (
              <span className="text-[9px] font-black uppercase tracking-widest text-amber-600">{product.category}</span>
            )}
            <h3 className="font-black text-sm uppercase tracking-tight truncate text-stone-900 group-hover:text-amber-800 transition-colors">{product.name}</h3>
            {product.sku && <p className="text-[10px] font-mono text-stone-400 mt-0.5">{t('sku')}: {product.sku}</p>}
          </div>
          <div className="text-right shrink-0">
            {product.price != null ? (
              <p className="text-lg sm:text-xl font-black text-stone-900 tracking-tight">{formatCurrency(product.price)}</p>
            ) : (
              <p className="text-lg sm:text-xl font-black text-stone-400 italic">{t('priceOnRequest', { defaultValue: 'Consultar' })}</p>
            )}
            <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">{product.unit_of_measure || t('unit')}</span>
          </div>
        </div>
        {product.description && (
          <p className="text-xs text-stone-500 line-clamp-1 mt-1 hidden sm:block">{product.description}</p>
        )}
        <div className="flex items-center justify-between mt-auto pt-1.5">
          {product.product_variants && product.product_variants.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {product.product_variants.slice(0, 3).map((v) => (
                <span key={v.id} className="px-1.5 py-0.5 rounded bg-amber-50 text-[9px] font-bold text-amber-700 border border-amber-200/60">
                  {v.name}
                </span>
              ))}
            </div>
          )}
          {product.stock_visible !== false && <StockPill inStock={inStock} />}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// TEMPLATE: MINIMALISTA (Clean, white, thin borders)
// ══════════════════════════════════════════════════════════════════

function MinimalistaTemplate({ store, products }: StorefrontPageProps) {
  const t = useTranslations('stores.storefront');
  const filter = useProductFilter(products);
  const [detailProduct, setDetailProduct] = useState<StorefrontProduct | null>(null);

  return (
    <div className="min-h-screen bg-white text-stone-800">
      <header className="border-b border-stone-100">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-full border border-stone-100 flex items-center justify-center overflow-hidden shrink-0">
              {store.logo_url ? (
                <Image src={store.logo_url} alt={store.name} width={56} height={56} className="w-full h-full object-cover" unoptimized />
              ) : (
                <Package className="w-6 h-6 text-stone-300" />
              )}
            </div>
            <div>
              <h1 className="text-2xl font-light tracking-tight">{store.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-stone-400">
                {store.address && <span>{store.address}</span>}
                {store.phone && <span>{store.phone}</span>}
                {store.email && <span>{store.email}</span>}
              </div>
            </div>
          </div>
        </div>
      </header>

      <SearchToolbar {...filter} accentColor="stone" totalProducts={filter.totalProducts} totalWithStock={filter.totalWithStock} />

      <main className="max-w-5xl mx-auto px-6 py-10">
        {filter.filteredProducts.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-sm text-stone-400">{t('noProductsFound')}</p>
            {(filter.searchTerm || filter.selectedCategory) && (
              <button onClick={filter.clearFilters} className="mt-4 text-xs underline text-stone-500 hover:text-stone-700">{t('clearFilters')}</button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {filter.filteredProducts.map((p) => (
              <div key={p.id} className="group cursor-pointer" onClick={() => setDetailProduct(p)}>
                <div className="aspect-square bg-stone-50 rounded-lg overflow-hidden mb-3">
                  {filter.productImage(p) ? (
                    <ProductImage src={filter.productImage(p)!} alt={p.name} className="h-full w-full" imgClassName="group-hover:scale-[1.02]" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><Package className="w-10 h-10 text-stone-200" /></div>
                  )}
                </div>
                <p className="text-[10px] font-medium uppercase tracking-widest text-stone-400">{p.category || ''}</p>
                <h3 className="text-sm font-medium mt-0.5 truncate">{p.name}</h3>
                <p className="text-sm text-stone-600 mt-1">{formatCurrency(p.price)} <span className="text-stone-300">/ {p.unit_of_measure || t('unit')}</span></p>
              </div>
            ))}
          </div>
        )}
      </main>

      <StorefrontFooter store={store} template="minimalista" />
      {detailProduct && <ProductDetailModal product={detailProduct} onClose={() => setDetailProduct(null)} storePhone={store.phone} />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// TEMPLATE: MODERNA (Gradients, rounded, vibrant)
// ══════════════════════════════════════════════════════════════════

function ModernaTemplate({ store, products }: StorefrontPageProps) {
  const t = useTranslations('stores.storefront');
  const filter = useProductFilter(products);
  const [detailProduct, setDetailProduct] = useState<StorefrontProduct | null>(null);

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-50 via-white to-sky-50 text-stone-800">
      <header className="relative bg-gradient-to-r from-violet-600 via-indigo-600 to-sky-500 text-white overflow-hidden">
        <div className="absolute inset-0 bg-black/10" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center overflow-hidden shrink-0 border border-white/20">
              {store.logo_url ? (
                <Image src={store.logo_url} alt={store.name} width={80} height={80} className="w-full h-full object-cover" unoptimized />
              ) : (
                <Package className="w-8 h-8 sm:w-10 sm:h-10 text-white/60" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{store.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-white/70">
                {store.address && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{store.address}</span>}
                {store.phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{store.phone}</span>}
                {store.email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{store.email}</span>}
              </div>
            </div>
          </div>
          <div role="status" aria-live="polite" className="mt-6 flex items-center gap-6 text-sm">
            <div className="bg-white/15 backdrop-blur-sm rounded-xl px-4 py-2">
              <span className="font-bold">{filter.totalProducts}</span>
              <span className="text-white/60 ml-1">{t('productsLabel', { count: filter.totalProducts }).toLowerCase()}</span>
            </div>
            <div className="bg-white/15 backdrop-blur-sm rounded-xl px-4 py-2">
              <span className="font-bold">{filter.totalWithStock}</span>
              <span className="text-white/60 ml-1">{t('availableLabel', { count: filter.totalWithStock }).toLowerCase()}</span>
            </div>
          </div>
        </div>
      </header>

      <SearchToolbar {...filter} accentColor="violet" totalProducts={filter.totalProducts} totalWithStock={filter.totalWithStock} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {filter.filteredProducts.length === 0 ? (
          <div className="py-24 text-center">
            <Package className="w-16 h-16 mx-auto mb-4 text-stone-200" />
            <p className="font-semibold text-sm text-stone-400">{t('noProductsFound')}</p>
            {(filter.searchTerm || filter.selectedCategory) && (
              <button onClick={filter.clearFilters} className="mt-4 px-5 py-2 rounded-full bg-violet-100 text-violet-600 text-xs font-semibold hover:bg-violet-200 transition-colors">{t('clearFilters')}</button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filter.filteredProducts.map((p) => {
              const inStock = p.inStock;
              const img = filter.productImage(p);
              return (
                <div key={p.id} className={cn('group rounded-2xl bg-white shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden flex flex-col cursor-pointer', !inStock && 'opacity-50')} onClick={() => setDetailProduct(p)}>
                  <div className="relative aspect-[4/3] bg-gradient-to-br from-violet-50 to-sky-50 overflow-hidden">
                    {img ? (
                      <ProductImage src={img} alt={p.name} className="absolute inset-0" imgClassName="group-hover:scale-105" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Package className="w-12 h-12 text-violet-200" /></div>
                    )}
                    <span className={cn('absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest', inStock ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white')}>
                      {inStock ? t('inStock') : t('soldOut')}
                    </span>
                    {p.category && (
                      <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-white/90 text-[10px] font-bold text-stone-600 backdrop-blur-sm">{p.category}</span>
                    )}
                  </div>
                  <div className="flex-1 p-4 flex flex-col gap-1.5">
                    <h3 className="font-semibold text-sm truncate">{p.name}</h3>
                    {p.description && <p className="text-xs text-stone-400 line-clamp-2">{p.description}</p>}
                    <div className="flex-1" />
                    <div className="flex items-center justify-between pt-3 border-t border-stone-100">
                      <p className="text-lg font-bold bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">{formatCurrency(p.price)}</p>
                      <span className="text-[10px] text-stone-400 font-medium">{p.unit_of_measure || t('unit')}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <StorefrontFooter store={store} template="moderna" />
      {detailProduct && <ProductDetailModal product={detailProduct} onClose={() => setDetailProduct(null)} storePhone={store.phone} />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// TEMPLATE: CLÁSICA (Traditional, warm, structured)
// ══════════════════════════════════════════════════════════════════

function ClasicaTemplate({ store, products }: StorefrontPageProps) {
  const t = useTranslations('stores.storefront');
  const filter = useProductFilter(products);
  const [detailProduct, setDetailProduct] = useState<StorefrontProduct | null>(null);

  return (
    <div className="min-h-screen bg-amber-50/50 text-stone-800">
      <header className="bg-gradient-to-b from-amber-800 to-amber-900 text-amber-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
          <div className="text-center">
            {store.logo_url && (
              <div className="w-16 h-16 mx-auto mb-4 rounded-full border-2 border-amber-500/30 bg-amber-900/50 flex items-center justify-center overflow-hidden">
                <Image src={store.logo_url} alt={store.name} width={64} height={64} className="w-full h-full object-cover" unoptimized />
              </div>
            )}
            <h1 className="text-2xl sm:text-3xl font-bold tracking-wide uppercase">{store.name}</h1>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-xs text-amber-200">
              {store.address && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{store.address}</span>}
              {store.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{store.phone}</span>}
              {store.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{store.email}</span>}
            </div>
            <div className="mt-4 h-px w-24 mx-auto bg-amber-500/40" />
            <p role="status" aria-live="polite" className="mt-3 text-xs font-medium uppercase tracking-widest text-amber-300">
              {t('productAvailableCount', { products: filter.totalProducts, available: filter.totalWithStock })}
            </p>
          </div>
        </div>
      </header>

      <SearchToolbar {...filter} accentColor="amber" totalProducts={filter.totalProducts} totalWithStock={filter.totalWithStock} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {filter.filteredProducts.length === 0 ? (
          <div className="py-24 text-center">
            <p className="font-medium text-sm text-stone-400">{t('noProductsFound')}</p>
            {(filter.searchTerm || filter.selectedCategory) && (
              <button onClick={filter.clearFilters} className="mt-4 text-xs underline text-amber-700">{t('clearFilters')}</button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filter.filteredProducts.map((p) => {
              const inStock = p.inStock;
              const img = filter.productImage(p);
              return (
                <div key={p.id} className={cn('flex gap-4 p-4 rounded-xl border border-amber-200/60 bg-white cursor-pointer hover:shadow-md transition-all', !inStock && 'opacity-50')} onClick={() => setDetailProduct(p)}>
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-lg bg-amber-50 overflow-hidden shrink-0">
                    {img ? (
                      <ProductImage src={img} alt={p.name} className="h-full w-full" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Package className="w-8 h-8 text-amber-200" /></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-medium uppercase tracking-widest text-amber-600">{p.category || ''}</p>
                        <h3 className="font-bold text-sm truncate mt-0.5">{p.name}</h3>
                        {p.sku && <p className="text-[10px] font-mono text-stone-400 mt-0.5">{t('sku')}: {p.sku}</p>}
                      </div>
                      <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0', inStock ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600')}>
                        {inStock ? t('available') : t('soldOut')}
                      </span>
                    </div>
                    {p.description && <p className="text-xs text-stone-500 line-clamp-2 mt-1">{p.description}</p>}
                    <div className="flex-1" />
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-lg font-bold text-amber-800">{formatCurrency(p.price)}</p>
                      <span className="text-[10px] text-stone-400">{p.unit_of_measure || t('unit')}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {filter.filteredProducts.length > 0 && (
          <div role="status" aria-live="polite" className="mt-8 text-center">
            <p className="text-xs text-stone-400">{t('showingCount', { count: filter.filteredProducts.length, total: filter.totalProducts })}</p>
          </div>
        )}
      </main>

      <StorefrontFooter store={store} template="clasica" />
      {detailProduct && <ProductDetailModal product={detailProduct} onClose={() => setDetailProduct(null)} storePhone={store.phone} />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// TEMPLATE ROUTER
// ══════════════════════════════════════════════════════════════════

export function StorefrontPage({ store, products }: StorefrontPageProps) {
  switch (store.plantilla) {
    case 'minimalista':
      return <MinimalistaTemplate store={store} products={products} />;
    case 'moderna':
      return <ModernaTemplate store={store} products={products} />;
    case 'clasica':
      return <ClasicaTemplate store={store} products={products} />;
    case 'construccion':
    default:
      return <ConstruccionTemplate store={store} products={products} />;
  }
}
