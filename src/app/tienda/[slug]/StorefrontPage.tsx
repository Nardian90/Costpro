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
  Wrench,
  Headphones,
  Calendar,
  ExternalLink,
  Loader2,
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
  // ── Storefront config (2026-07-04) ──
  banner_url?: string | null;
  store_tagline?: string | null;
  whatsapp_group_url?: string | null;
  telegram_url?: string | null;
  services?: Array<{ icon: string; title: string; description?: string }> | null;
  promo_images?: Array<{ url: string; caption?: string; link?: string }> | null;
  opening_hours?: string | null;
  banner_cta_text?: string | null;
  banner_cta_link?: string | null;
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
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce the search term to avoid excessive filtering on every keystroke.
  // FIX-SEARCH-DEBOUNCE-VISUAL (2026-07-04): también exponemos `isSearching`
  // para que el input pueda mostrar "Buscando…" mientras el debounce corre.
  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    if (value && value !== debouncedSearch) {
      setIsSearching(true);
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setIsSearching(false);
    }, SEARCH_DEBOUNCE_MS);
  }, [debouncedSearch]);

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
    isSearching,
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

// ── Price Display (monto + moneda separados, con color distintivo) ──
//
// FIX-PRICE-FORMAT (2026-07-04): Antes el precio se mostraba con
// Intl.NumberFormat('es-CU', { style: 'currency' }) que produce
// "12,50 US$" o "1.234,00 CUP" — todo pegado y con el símbolo al final.
// El usuario reportó que no se distingue visualmente USD de CUP.
//
// Ahora separamos el monto (formato es-CU con separador de miles y 2
// decimales) del código de moneda, y aplicamos color distintivo:
//   - USD → verde esmeralda (asociado a divisa fuerte / dólar)
//   - CUP → ámbar dorado (color nacional cubano, coherente con la paleta)
//   - EUR → azul (estándar europeo)
//   - MLC → púrpura (distintivo, no se confunde con CUP)

const CURRENCY_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  USD: { color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', label: 'USD' },
  CUP: { color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200',    label: 'CUP' },
  EUR: { color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',      label: 'EUR' },
  MLC: { color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200',  label: 'MLC' },
};

function formatAmount(amount: number): string {
  return new Intl.NumberFormat('es-CU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * PriceDisplay — renderiza el precio con monto y moneda separados.
 *
 * Variantes:
 *   - 'card'    → tarjeta de producto (precio grande, badge pequeño)
 *   - 'list'    → fila de lista (precio mediano, badge pequeño)
 *   - 'modal'   → modal de detalle (precio XL, badge mediano)
 *   - 'compact' → variantes inline (precio pequeño, badge tiny)
 */
function PriceDisplay({
  price,
  currency = 'CUP',
  variant = 'card',
  className,
}: {
  price: number;
  currency?: string;
  variant?: 'card' | 'list' | 'modal' | 'compact';
  className?: string;
}) {
  const validCurrency = ['CUP', 'USD', 'EUR', 'MLC'].includes(currency) ? currency : 'CUP';
  const styles = CURRENCY_STYLES[validCurrency];

  // Tamaños por variante
  const sizeConfig = {
    card:    { amount: 'text-lg sm:text-xl font-black',     badge: 'text-[10px] font-black px-1.5 py-0.5 rounded' },
    list:    { amount: 'text-lg sm:text-xl font-black',     badge: 'text-[10px] font-black px-1.5 py-0.5 rounded' },
    modal:   { amount: 'text-2xl sm:text-3xl font-black',   badge: 'text-xs font-black px-2 py-0.5 rounded-md' },
    compact: { amount: 'text-sm font-black',                badge: 'text-[9px] font-bold px-1 py-0.5 rounded' },
  }[variant];

  return (
    <span className={cn('inline-flex items-baseline gap-1.5', className)}>
      <span className={cn(sizeConfig.amount, 'text-stone-900 tracking-tight tabular-nums')}>
        {formatAmount(price)}
      </span>
      <span className={cn(sizeConfig.badge, 'uppercase tracking-widest border', styles.color, styles.bg)}>
        {styles.label}
      </span>
    </span>
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
    `${t('whatsappInquiryMessage', { name: product.name })}${product.sku ? t('whatsappInquirySku', { sku: product.sku }) : ''}${product.price != null ? t('whatsappInquiryPrice', { price: formatCurrency(product.price, (product as any).price_currency || "CUP") }) : ''}`
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
                      <span className="text-xs font-black text-stone-900">{v.price != null ? formatCurrency(v.price) : "—"}</span>
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
                  <PriceDisplay price={product.price} currency={(product as any).price_currency || 'CUP'} variant="modal" className="mt-1" />
                  <span className="block text-xs text-stone-400 mt-1">{product.unit_of_measure || t('unit')}</span>
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

/**
 * Mapeo de nombres de iconos (string, guardado en DB) a componentes lucide-react.
 * El admin configura el servicio en StorefrontConfigPanel eligiendo de una lista
 * acotada — aquí solo necesitamos renderizar el que corresponda.
 */
const SERVICE_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  truck: Truck,
  shield: Shield,
  clock: Clock,
  wrench: Wrench,
  package: Package,
  headphones: Headphones,
  zap: Zap,
  star: Star,
};

function ServiceIcon({ name, className }: { name: string; className?: string }) {
  const Icon = SERVICE_ICON_MAP[name] ?? Package;
  return <Icon className={className} />;
}

// ── Services Section ────────────────────────────────────────────

function ServicesSection({ services }: { services: NonNullable<StorefrontStore['services']> }) {
  if (!services || services.length === 0) return null;
  return (
    <section className="bg-white border-b border-stone-200/60" aria-label="Servicios">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-px flex-1 bg-gradient-to-r from-amber-300 to-transparent" />
          <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-700">
            Nuestros Servicios
          </h2>
          <div className="h-px flex-1 bg-gradient-to-l from-amber-300 to-transparent" />
        </div>
        <div className={cn(
          "grid gap-3 sm:gap-4",
          services.length <= 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
        )}>
          {services.map((service, i) => (
            <div
              key={i}
              className="rounded-2xl bg-stone-50 border border-stone-200/80 p-3 sm:p-4 flex flex-col items-center text-center hover:shadow-md hover:shadow-amber-500/5 transition-all"
            >
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-amber-500/15 flex items-center justify-center mb-2">
                <ServiceIcon name={service.icon} className="w-5 h-5 text-amber-700" />
              </div>
              <p className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-stone-900 leading-tight">
                {service.title}
              </p>
              {service.description && (
                <p className="text-[9px] sm:text-[10px] text-stone-500 mt-1 leading-relaxed line-clamp-2">
                  {service.description}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Live Sales Notifications (social proof en vivo) ─────────────
//
// FIX-LIVE-SALES (2026-07-04): simula notificaciones tipo "Se vendió X hace
// 2 min" para dar sensación de tienda viva. Aparecen como toasts flotantes
// en la esquina inferior izquierda, cada 25-45s aleatoriamente.
//
// Comportamiento:
//   - Selecciona un producto al azar del catálogo
//   - Muestra notificación por 5s con animación slide-in
//   - Descarta y espera 25-45s para la siguiente
//   - Pausa cuando el usuario tiene la pestaña en background (visibilitychange)
//   - No muestra si hay < 3 productos (no tendría sentido)
//   - Variantes de mensaje: "Se vendió", "Alguien compró", "Nuevo pedido de"
//   - Time stamps aleatorios: "hace 2 min", "hace 5 min", "hace 1 min"
//   - Nombres de clientes genéricos cubanos: "Carlos en La Habana", "María en Santiago"

const LIVE_SALE_MESSAGES = [
  'Se vendió',
  'Alguien compró',
  'Nuevo pedido de',
  'Acaba de venderse',
  'Cliente adquirió',
];

const LIVE_SALE_LOCATIONS = [
  'La Habana', 'Santiago de Cuba', 'Camagüey', 'Holguín', 'Santa Clara',
  'Guantánamo', 'Bayamo', 'Las Tunas', 'Cienfuegos', 'Pinar del Río',
  'Matanzas', 'Ciego de Ávila', 'Sancti Spíritus', 'Manzanillo',
];

const LIVE_SALE_TIMES = [
  'hace 1 min', 'hace 2 min', 'hace 3 min', 'hace 5 min',
  'hace 8 min', 'hace 12 min', 'ahora mismo',
];

interface LiveSale {
  id: number;
  product: StorefrontProduct;
  message: string;
  location: string;
  timeAgo: string;
}

function LiveSalesNotifications({ products }: { products: StorefrontProduct[] }) {
  const [currentSale, setCurrentSale] = useState<LiveSale | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const saleIdRef = useRef(0);

  useEffect(() => {
    // No mostrar si hay menos de 3 productos o la pestaña no está visible
    if (products.length < 3) return;

    let timeoutShow: ReturnType<typeof setTimeout>;
    let timeoutHide: ReturnType<typeof setTimeout>;
    let isPaused = false;

    const scheduleNext = () => {
      if (isPaused) return;
      // Intervalo aleatorio entre 25s y 45s
      const delay = 25_000 + Math.random() * 20_000;
      timeoutShow = setTimeout(() => {
        if (isPaused) return;
        // Seleccionar producto al azar
        const randomProduct = products[Math.floor(Math.random() * products.length)];
        const message = LIVE_SALE_MESSAGES[Math.floor(Math.random() * LIVE_SALE_MESSAGES.length)];
        const location = LIVE_SALE_LOCATIONS[Math.floor(Math.random() * LIVE_SALE_LOCATIONS.length)];
        const timeAgo = LIVE_SALE_TIMES[Math.floor(Math.random() * LIVE_SALE_TIMES.length)];
        saleIdRef.current += 1;
        setCurrentSale({
          id: saleIdRef.current,
          product: randomProduct,
          message,
          location,
          timeAgo,
        });
        setIsVisible(true);

        // Ocultar después de 5.5s
        timeoutHide = setTimeout(() => {
          setIsVisible(false);
          // Limpiar después de la animación de salida (500ms)
          setTimeout(() => setCurrentSale(null), 500);
          // Programar la siguiente
          scheduleNext();
        }, 5500);
      }, delay);
    };

    // Pausar cuando la pestaña no está visible
    const onVisibilityChange = () => {
      isPaused = document.hidden;
      if (!isPaused) {
        // Al volver, re-programar si no hay notificación activa
        if (!currentSale) scheduleNext();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Primera notificación después de 8s (más rápida para que el usuario la vea)
    timeoutShow = setTimeout(() => {
      if (isPaused) return;
      const randomProduct = products[Math.floor(Math.random() * products.length)];
      const message = LIVE_SALE_MESSAGES[Math.floor(Math.random() * LIVE_SALE_MESSAGES.length)];
      const location = LIVE_SALE_LOCATIONS[Math.floor(Math.random() * LIVE_SALE_LOCATIONS.length)];
      const timeAgo = LIVE_SALE_TIMES[Math.floor(Math.random() * LIVE_SALE_TIMES.length)];
      saleIdRef.current += 1;
      setCurrentSale({
        id: saleIdRef.current,
        product: randomProduct,
        message,
        location,
        timeAgo,
      });
      setIsVisible(true);
      timeoutHide = setTimeout(() => {
        setIsVisible(false);
        setTimeout(() => setCurrentSale(null), 500);
        scheduleNext();
      }, 5500);
    }, 8000);

    return () => {
      clearTimeout(timeoutShow);
      clearTimeout(timeoutHide);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [products.length]);

  if (!currentSale) return null;

  const p = currentSale.product;
  const imageUrlRaw = p.image_url || p.public_image_url;
  const imageUrl = imageUrlRaw ? getProductImageUrl(imageUrlRaw) : null;
  const priceText = p.price != null
    ? formatCurrency(p.price, (p as any).price_currency || 'CUP')
    : null;

  return (
    <div
      key={currentSale.id}
      role="status"
      aria-live="polite"
      className={cn(
        'fixed bottom-4 left-4 z-40 max-w-[calc(100vw-2rem)] sm:max-w-sm',
        'transition-all duration-500 ease-out',
        isVisible
          ? 'translate-y-0 opacity-100'
          : 'translate-y-8 opacity-0 pointer-events-none'
      )}
    >
      <div className="bg-white rounded-xl shadow-2xl border border-stone-200/80 overflow-hidden flex items-center gap-3 p-2.5 pr-4">
        {/* Thumbnail del producto */}
        <div className="w-12 h-12 rounded-lg overflow-hidden bg-stone-100 shrink-0 flex items-center justify-center">
          {imageUrl ? (
            <img src={imageUrl} alt={p.name} className="w-full h-full object-cover" />
          ) : (
            <Package className="w-5 h-5 text-stone-300" />
          )}
        </div>
        {/* Texto */}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold text-stone-700 leading-tight">
            <span className="text-emerald-600 font-black uppercase tracking-wider text-[10px]">
              {currentSale.message}
            </span>{' '}
            <span className="text-stone-900 font-black truncate">{p.name}</span>
          </p>
          <p className="text-[10px] text-stone-500 mt-0.5 flex items-center gap-1.5">
            <span className="font-medium">{currentSale.location}</span>
            <span className="text-stone-300">·</span>
            <span>{currentSale.timeAgo}</span>
            {priceText && (
              <>
                <span className="text-stone-300">·</span>
                <span className="font-black text-stone-700">{priceText}</span>
              </>
            )}
          </p>
        </div>
        {/* Indicador "live" */}
        <div className="shrink-0 flex items-center gap-1 self-start mt-0.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600">
            Live
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Promo Carousel ──────────────────────────────────────────────
//
// FIX-CAROUSEL-TRANSITION (2026-07-04): antes usaba `translateX(-100%)` para
// "deslizar" entre slides, lo que produce un cambio seco y brusco. Ahora usamos
// crossfade: todas las imágenes están apiladas (absolute inset-0) y solo
// cambiamos la opacidad. Transición de 1000ms con ease-in-out → feel suave y
// natural. La imagen activa tiene opacity-100, las demás opacity-0.
// Cada slide también tiene un sutil scale(1.02) → scale(1) durante la
// transición (efecto Ken Burns ligero) que aporta movimiento sin distraer.

function PromoCarousel({ images }: { images: NonNullable<StorefrontStore['promo_images']> }) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const total = images.length;

  // Autoplay cada 5.5s, pausable al hover
  useEffect(() => {
    if (paused || total <= 1) return;
    const timer = setInterval(() => {
      setCurrent(c => (c + 1) % total);
    }, 5500);
    return () => clearInterval(timer);
  }, [paused, total]);

  if (!images || images.length === 0) return null;

  return (
    <section
      className="bg-stone-900"
      aria-label="Promociones"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="max-w-6xl mx-auto px-0 sm:px-6 sm:py-4">
        <div className="relative overflow-hidden sm:rounded-2xl aspect-[16/7] sm:aspect-[3/1] bg-stone-900">
          {/* Slides apiladas — crossfade suave */}
          {images.map((img, i) => {
            const isActive = i === current;
            const content = (
              <>
                <img
                  src={img.url}
                  alt={img.caption || `Promoción ${i + 1}`}
                  className={cn(
                    'w-full h-full object-cover transition-all duration-[1200ms] ease-in-out',
                    isActive ? 'opacity-100 scale-100' : 'opacity-0 scale-105'
                  )}
                  loading={i === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                />
                {img.caption && (
                  <div className={cn(
                    'absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent flex items-end p-4 sm:p-6 transition-opacity duration-1000',
                    isActive ? 'opacity-100' : 'opacity-0'
                  )}>
                    <p className="text-white font-black text-sm sm:text-lg uppercase tracking-tight drop-shadow-lg flex items-center gap-1.5">
                      {img.caption}
                      {img.link && <ExternalLink className="w-3.5 h-3.5 opacity-70" />}
                    </p>
                  </div>
                )}
              </>
            );

            // Cada slide es absolute inset-0 apilada — el crossfade cambia opacity
            return img.link ? (
              <a
                key={i}
                href={img.link}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute inset-0 group"
                aria-hidden={!isActive}
                tabIndex={isActive ? 0 : -1}
              >
                {content}
              </a>
            ) : (
              <div
                key={i}
                className="absolute inset-0"
                aria-hidden={!isActive}
              >
                {content}
              </div>
            );
          })}

          {/* Navigation arrows (solo si hay más de 1) */}
          {total > 1 && (
            <>
              <button
                onClick={() => setCurrent(c => (c - 1 + total) % total)}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors backdrop-blur-sm z-10"
                aria-label="Anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrent(c => (c + 1) % total)}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors backdrop-blur-sm z-10"
                aria-label="Siguiente"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {/* Dots indicator — con transición suave */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                {images.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrent(i)}
                    className={cn(
                      'rounded-full transition-all duration-500',
                      i === current
                        ? 'w-6 h-1.5 bg-white'
                        : 'w-1.5 h-1.5 bg-white/50 hover:bg-white/80'
                    )}
                    aria-label={`Ir a diapositiva ${i + 1}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
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
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(storeUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <footer className={cn(footerBg)}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {/* ── Bloque 1: Identidad + info de contacto ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
          {/* Identidad */}
          <div className="text-center sm:text-left">
            <p className={cn('font-black text-base sm:text-lg uppercase tracking-tighter', isConstruccion ? 'text-white' : 'text-stone-900')}>
              {store.name}
            </p>
            {store.store_tagline && (
              <p className={cn('text-xs font-medium mt-1', isConstruccion ? 'text-amber-300/80' : 'text-amber-700')}>
                {store.store_tagline}
              </p>
            )}
            <p className="text-[10px] font-bold uppercase tracking-widest mt-2 text-stone-500">
              {t('catalogViewOnly')}
            </p>
            {store.opening_hours && (
              <p className={cn('text-[11px] mt-3 flex items-center justify-center sm:justify-start gap-1.5', isConstruccion ? 'text-stone-400' : 'text-stone-600')}>
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                <span className="font-bold">{store.opening_hours}</span>
              </p>
            )}
          </div>

          {/* Contacto */}
          <div className={cn('text-center sm:text-right space-y-1.5', isConstruccion ? 'text-stone-300' : 'text-stone-700')}>
            {store.address && (
              <p className="text-xs flex items-center justify-center sm:justify-end gap-1.5">
                <MapPin className="w-3.5 h-3.5 shrink-0 opacity-70" />
                <span>{store.address}</span>
              </p>
            )}
            {store.phone && (
              <p className="text-xs flex items-center justify-center sm:justify-end gap-1.5">
                <Phone className="w-3.5 h-3.5 shrink-0 opacity-70" />
                <a
                  href={`tel:${store.phone}`}
                  className={cn('font-bold hover:underline', isConstruccion ? 'hover:text-amber-300' : 'hover:text-amber-700')}
                >
                  {store.phone}
                </a>
              </p>
            )}
            {store.email && (
              <p className="text-xs flex items-center justify-center sm:justify-end gap-1.5">
                <Mail className="w-3.5 h-3.5 shrink-0 opacity-70" />
                <a
                  href={`mailto:${store.email}`}
                  className={cn('font-bold hover:underline', isConstruccion ? 'hover:text-amber-300' : 'hover:text-amber-700')}
                >
                  {store.email}
                </a>
              </p>
            )}
          </div>
        </div>

        {/* ── Bloque 2: Botones de acción (siempre visibles, mobile-first) ── */}
        <div className={cn(
          'grid gap-2 sm:gap-3',
          'grid-cols-2 sm:flex sm:flex-wrap sm:justify-center'
        )}>
          {/* Compartir */}
          <div className="relative col-span-2 sm:col-auto">
            <button
              onClick={() => setShowShare(!showShare)}
              className={cn(
                'w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-3 sm:py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-colors min-h-[44px]',
                isConstruccion
                  ? 'border border-stone-700 hover:border-amber-500 text-white'
                  : 'border border-stone-200 hover:border-amber-400 text-stone-700'
              )}
              title={t('shareStore')}
              aria-expanded={showShare}
            >
              <Share2 className="w-4 h-4" />
              {t('share')}
            </button>
            {showShare && (
              <>
                {/* Backdrop para cerrar al hacer clic fuera */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowShare(false)}
                  aria-hidden="true"
                />
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 sm:left-auto sm:right-0 sm:translate-x-0 bg-white rounded-xl shadow-xl border border-stone-200 p-2 flex items-center gap-1.5 z-50">
                  <a
                    href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(storeUrl)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 transition-colors"
                    title={t('shareFacebook')}
                    onClick={() => setShowShare(false)}
                  >
                    <Facebook className="w-4 h-4" />
                  </a>
                  <a
                    href={`https://t.me/share/url?url=${encodeURIComponent(storeUrl)}&text=${shareText}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-10 h-10 rounded-lg bg-sky-500 text-white flex items-center justify-center hover:bg-sky-600 transition-colors"
                    title={t('shareTelegram')}
                    onClick={() => setShowShare(false)}
                  >
                    <Send className="w-4 h-4" />
                  </a>
                  <a
                    href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(storeUrl)}&text=${shareText}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-10 h-10 rounded-lg bg-stone-800 text-white flex items-center justify-center hover:bg-stone-900 transition-colors"
                    title={t('shareTwitter')}
                    onClick={() => setShowShare(false)}
                  >
                    <Twitter className="w-4 h-4" />
                  </a>
                  <button
                    onClick={handleCopy}
                    className="w-10 h-10 rounded-lg bg-stone-100 text-stone-600 flex items-center justify-center hover:bg-stone-200 transition-colors"
                    title={t('copyLink')}
                  >
                    {copied ? <span className="text-[9px] font-black">OK</span> : <span className="text-[9px] font-black">URL</span>}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* WhatsApp directo al teléfono (si existe) */}
          {store.phone && (
            <a
              href={`https://wa.me/${store.phone.replace(/[^0-9]/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-3 sm:py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-black uppercase tracking-widest transition-colors min-h-[44px]"
            >
              <MessageCircle className="w-4 h-4" />
              <span className="truncate">{t('whatsapp')}</span>
            </a>
          )}

          {/* Llamar (siempre visible si hay teléfono) */}
          {store.phone && (
            <a
              href={`tel:${store.phone}`}
              className={cn(
                'flex items-center justify-center gap-2 px-4 py-3 sm:py-2.5 rounded-xl border text-xs font-black uppercase tracking-widest transition-colors min-h-[44px]',
                isConstruccion
                  ? 'border-stone-700 hover:border-amber-500 text-white'
                  : 'border-stone-200 hover:border-amber-400 text-stone-700'
              )}
            >
              <Phone className="w-4 h-4" />
              <span className="truncate">{t('call')}</span>
            </a>
          )}

          {/* Grupo de WhatsApp configurable */}
          {store.whatsapp_group_url && (
            <a
              href={store.whatsapp_group_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-3 sm:py-2.5 rounded-xl bg-green-700 hover:bg-green-800 text-white text-xs font-black uppercase tracking-widest transition-colors min-h-[44px]"
            >
              <MessageCircle className="w-4 h-4" />
              <span className="truncate">Grupo</span>
            </a>
          )}

          {/* Telegram configurable */}
          {store.telegram_url && (
            <a
              href={store.telegram_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-3 sm:py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-black uppercase tracking-widest transition-colors min-h-[44px]"
            >
              <Send className="w-4 h-4" />
              <span className="truncate">Telegram</span>
            </a>
          )}
        </div>

        {/* ── Bloque 3: REEUP / NIT (info fiscal discreta) ── */}
        {store.reeup && (
          <div className="mt-6 pt-4 border-t border-stone-700/40 text-center">
            <p className="text-[10px] font-mono text-stone-500">
              REEUP: {store.reeup}
            </p>
          </div>
        )}
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

// ── WhatsApp Floating Action Button (FAB) ───────────────────────
// FIX-FAB (2026-07-04): CTA siempre accesible mientras el usuario navega
// la vitrina. Se prioriza whatsapp_group_url si existe (lleva al grupo),
// si no, wa.me con el teléfono de la tienda. Posición: esquina inferior
// derecha, encima del LiveSalesNotifications (que está abajo-izquierda).
// En mobile es 56x56 (touch target cómodo), en desktop 48x48.

function WhatsAppFAB({ store }: { store: StorefrontStore }) {
  const href = store.whatsapp_group_url
    || (store.phone ? `https://wa.me/${store.phone.replace(/[^0-9]/g, '')}` : null);

  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Consultar por WhatsApp"
      className="fixed bottom-6 right-6 z-40 sm:bottom-8 sm:right-8 w-14 h-14 sm:w-12 sm:h-12 rounded-full bg-green-600 hover:bg-green-500 text-white shadow-2xl shadow-green-600/30 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
    >
      {/* Pulse ring para llamar la atención sin ser invasivo */}
      <span className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-20" />
      <MessageCircle className="w-7 h-7 sm:w-6 sm:h-6 relative" />
      {/* Badge "1" estilo notificación para reforzar que es un chat */}
      <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center border-2 border-white">
        1
      </span>
    </a>
  );
}

// ── Sticky Mini-Stats (mobile only) ─────────────────────────────
// FIX-STICKY-STATS (2026-07-04): barra pegajosa en la parte superior de
// mobile que muestra conteo rápido de productos + disponibles. Aparece
// solo después de hacer scroll > 400px (cuando el header original ya
// salió de vista). Oculta en desktop (sm:hidden).

function StickyMiniStats({ total, available }: { total: number; available: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div
      className={cn(
        'sm:hidden fixed top-0 left-0 right-0 z-30 bg-stone-900/95 backdrop-blur-md border-b border-amber-500/20 transition-transform duration-300',
        visible ? 'translate-y-0' : '-translate-y-full'
      )}
    >
      <div className="px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-white">
          <span className="flex items-center gap-1 text-xs font-black">
            <Package className="w-3.5 h-3.5 text-amber-400" />
            {total}
          </span>
          <span className="text-stone-500">·</span>
          <span className="flex items-center gap-1 text-xs font-black">
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            {available}
          </span>
        </div>
        <span className="text-[10px] font-black uppercase tracking-widest text-amber-300/80">
          ENERVIDA
        </span>
      </div>
    </div>
  );
}

// ── Mobile Category Bottom-Sheet ────────────────────────────────
// FIX-MOBILE-CATEGORIES (2026-07-04): en mobile el filtro de categorías
// se abre como bottom-sheet (modal deslizante desde abajo) en vez de
// inline. Esto libera espacio vertical y sigue el patrón nativo de iOS/
// Android. En desktop sigue funcionando inline como antes.

function MobileCategorySheet({
  open,
  onClose,
  categories,
  selectedCategory,
  onSelect,
  totalProducts,
  categoryCounts,
}: {
  open: boolean;
  onClose: () => void;
  categories: string[];
  selectedCategory: string | null;
  onSelect: (cat: string | null) => void;
  totalProducts: number;
  categoryCounts: Record<string, number>;
}) {
  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'sm:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Filtrar por categoría"
        className={cn(
          'sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl transition-transform duration-300 ease-out max-h-[80vh] overflow-y-auto',
          open ? 'translate-y-0' : 'translate-y-full'
        )}
      >
        {/* Handle bar */}
        <div className="pt-3 pb-2 flex justify-center">
          <div className="w-12 h-1.5 rounded-full bg-stone-300" />
        </div>
        {/* Header */}
        <div className="px-5 pb-3 flex items-center justify-between border-b border-stone-100">
          <h3 className="text-sm font-black uppercase tracking-widest text-stone-900">
            Categorías
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 hover:bg-stone-200"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* Lista de categorías */}
        <div className="p-3 space-y-1.5">
          <button
            onClick={() => { onSelect(null); onClose(); }}
            className={cn(
              'w-full flex items-center justify-between px-4 py-3.5 rounded-xl text-sm font-black uppercase tracking-wider transition-all min-h-[48px]',
              !selectedCategory
                ? 'bg-amber-600 text-white'
                : 'bg-stone-50 text-stone-700 hover:bg-stone-100'
            )}
          >
            <span>Todas</span>
            <span className={cn('text-xs', !selectedCategory ? 'text-amber-100' : 'text-stone-400')}>
              {totalProducts}
            </span>
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => { onSelect(cat); onClose(); }}
              className={cn(
                'w-full flex items-center justify-between px-4 py-3.5 rounded-xl text-sm font-black uppercase tracking-wider transition-all min-h-[48px]',
                selectedCategory === cat
                  ? 'bg-amber-600 text-white'
                  : 'bg-stone-50 text-stone-700 hover:bg-stone-100'
              )}
            >
              <span className="truncate text-left">{cat}</span>
              <span className={cn('text-xs shrink-0 ml-2', selectedCategory === cat ? 'text-amber-100' : 'text-stone-400')}>
                {categoryCounts[cat] ?? 0}
              </span>
            </button>
          ))}
        </div>
        {/* Safe area padding */}
        <div className="h-4" />
      </div>
    </>
  );
}

// ── Low Stock Badge ("Solo quedan N") ───────────────────────────
// FIX-LOW-STOCK (2026-07-04): el storefront API solo envía inStock
// (boolean), no stock_current. Para no romper FIX-SEC-H6 (no exponer
// stock exacto), usamos un campo opcional `stock_level` que el API puede
// enviar como 'low' | 'medium' | 'high' | null. Si es 'low', mostramos
// "Solo quedan pocas unidades" — sensación de escasez sin exponer número.

function LowStockBadge({ stockLevel }: { stockLevel?: 'low' | 'medium' | 'high' | null }) {
  if (stockLevel !== 'low') return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-100 text-orange-700 text-[9px] font-black uppercase tracking-widest border border-orange-200 animate-pulse">
      <Zap className="w-2.5 h-2.5" />
      Solo quedan pocas
    </span>
  );
}

// ── Quick View Modal (vista rápida) ─────────────────────────────
// FIX-QUICK-VIEW (2026-07-04): al hacer hover sobre una tarjeta en
// desktop aparece un botón "Vista rápida" que abre un modal compacto
// con la info esencial (imagen, nombre, precio, descripción corta, CTA
// WhatsApp). En mobile el botón no aparece (se usa tap directo al modal
// completo). Esto evita tener que abrir el modal completo para cada
// producto que el usuario quiere ojear.

function QuickViewModal({
  product,
  image,
  onClose,
  onFullDetails,
  storePhone,
}: {
  product: StorefrontProduct;
  image: string | null;
  onClose: () => void;
  onFullDetails: () => void;
  storePhone?: string | null;
}) {
  const t = useTranslations('stores.storefront');
  const inStock = product.inStock;
  const isOnPromotion = product.on_promotion === true;
  const productText = encodeURIComponent(
    `${t('whatsappInquiryMessage', { name: product.name })}${product.sku ? t('whatsappInquirySku', { sku: product.sku }) : ''}${product.price != null ? t('whatsappInquiryPrice', { price: formatCurrency(product.price, (product as any).price_currency || "CUP") }) : ''}`
  );
  const whatsappUrl = storePhone
    ? `https://wa.me/${storePhone.replace(/[^0-9]/g, '')}?text=${productText}`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header con imagen */}
        <div className="relative aspect-[4/3] bg-stone-100 shrink-0">
          {image ? (
            <img src={image} alt={product.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="w-16 h-16 text-stone-200" />
            </div>
          )}
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
            aria-label={t('close')}
          >
            <X className="w-4 h-4" />
          </button>
          {/* Badge PROMO */}
          {isOnPromotion && (
            <span className="absolute top-3 left-3 px-2 py-0.5 rounded-md bg-amber-500 text-white text-[9px] font-black uppercase tracking-widest shadow-md flex items-center gap-1">
              <Zap className="w-3 h-3" />
              Promo
            </span>
          )}
          {/* Category */}
          {product.category && (
            <span className="absolute bottom-3 left-3 px-2 py-0.5 rounded-md bg-stone-900/80 text-[9px] font-black uppercase tracking-widest text-amber-400 backdrop-blur-md">
              {product.category}
            </span>
          )}
        </div>
        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div>
            <h3 className="font-black text-base uppercase tracking-tight text-stone-900 leading-tight">
              {product.name}
            </h3>
            {product.sku && (
              <p className="text-[10px] font-mono text-stone-400 mt-0.5">{t('sku')}: {product.sku}</p>
            )}
          </div>
          {product.description && (
            <p className="text-xs text-stone-600 leading-relaxed line-clamp-4">
              {product.description}
            </p>
          )}
          {/* Precio + stock */}
          <div className="flex items-end justify-between gap-2 pt-2 border-t border-stone-100">
            <div>
              <p className="text-[8px] font-black uppercase tracking-[0.15em] text-stone-400 mb-0.5">
                {t('price')}
              </p>
              {product.price != null ? (
                <PriceDisplay price={product.price} currency={(product as any).price_currency || 'CUP'} variant="modal" />
              ) : (
                <p className="text-lg font-black text-stone-400 italic">{t('priceOnRequest', { defaultValue: 'Consultar' })}</p>
              )}
            </div>
            {product.stock_visible !== false && (
              <span className={cn(
                'px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest',
                inStock ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
              )}>
                {inStock ? t('inStock') : t('soldOut')}
              </span>
            )}
          </div>
        </div>
        {/* Footer con CTAs */}
        <div className="p-4 border-t border-stone-100 grid grid-cols-2 gap-2 shrink-0">
          <button
            onClick={onFullDetails}
            className="px-3 py-2.5 min-h-[44px] rounded-xl border border-stone-300 text-stone-700 text-[10px] font-black uppercase tracking-widest hover:bg-stone-50 transition-colors"
          >
            Ver detalles
          </button>
          {whatsappUrl ? (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2.5 min-h-[44px] rounded-xl bg-green-600 hover:bg-green-700 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Consultar
            </a>
          ) : (
            <span className="px-3 py-2.5 min-h-[44px] rounded-xl bg-stone-100 text-stone-400 text-[10px] font-black uppercase tracking-widest flex items-center justify-center">
              Sin WhatsApp
            </span>
          )}
        </div>
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
  const [quickViewProduct, setQuickViewProduct] = useState<StorefrontProduct | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showBackTop, setShowBackTop] = useState(false);
  const [bannerLoaded, setBannerLoaded] = useState(false);
  const [showMobileCategories, setShowMobileCategories] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowBackTop(window.scrollY > 600);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Conteos por categoría para el bottom-sheet mobile
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    products.forEach((p) => {
      if (p.category) counts[p.category] = (counts[p.category] ?? 0) + 1;
    });
    return counts;
  }, [products]);

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

        {/* Banner background image — configurable via banner_url, fallback to default */}
        <div className="relative h-52 sm:h-64 md:h-80 lg:h-96">
          {/* Preload placeholder */}
          <div className="absolute inset-0 bg-gradient-to-br from-amber-900 via-stone-800 to-stone-900" />
          {/* Actual image — usa banner_url si está configurado, sino el default */}
          <img
            src={store.banner_url || "/storefront-construccion-banner.png"}
            alt=""
            className={cn(
              'absolute inset-0 w-full h-full object-cover transition-opacity duration-700',
              bannerLoaded ? 'opacity-100' : 'opacity-0'
            )}
            onLoad={() => setBannerLoaded(true)}
            loading="eager"
          />
          {/* Dark gradient overlay for text readability — FIX-MOBILE-LEGIBILITY:
              overlay más oscuro en mobile para garantizar contraste WCAG AA
              entre el texto y cualquier imagen de fondo */}
          <div className="absolute inset-0 bg-gradient-to-t from-stone-950/98 via-stone-950/85 to-stone-950/50" />
          {/* Warm amber glow at bottom */}
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-amber-600/25 to-transparent" />

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
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black uppercase tracking-tighter leading-[0.95] text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                  {store.name}
                </h1>
                {store.store_tagline && (
                  <p className="mt-2 text-sm sm:text-base font-bold text-amber-300 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] line-clamp-2">
                    {store.store_tagline}
                  </p>
                )}
                {/* FIX-MOBILE-LEGIBILITY (2026-07-04): en mobile ocultamos address/email
                    para reducir densidad; solo mostramos phone + horario que son los
                    críticos. En desktop se muestran todos. */}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs sm:text-sm text-white font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                  {store.address && (
                    <span className="hidden sm:flex items-center gap-1.5">
                      <MapPin className="w-3 h-3 text-amber-400" />
                      {store.address}
                    </span>
                  )}
                  {store.phone && (
                    <span className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-amber-400" />
                      {store.phone}
                    </span>
                  )}
                  {store.email && (
                    <span className="hidden sm:flex items-center gap-1.5">
                      <Mail className="w-3 h-3 text-amber-400" />
                      {store.email}
                    </span>
                  )}
                  {store.opening_hours && (
                    <span className="flex items-center gap-1.5 bg-stone-900/60 backdrop-blur-sm px-2 py-1 rounded-md border border-amber-500/20">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      {store.opening_hours}
                    </span>
                  )}
                </div>
                {/* FIX-BANNER-CTA (2026-07-04): CTA editable superpuesto al banner.
                    Tamaño grande en mobile (min-h-[52px] text-base) para touch target cómodo.
                    Si banner_cta_link está set, es un <a> externo. Si no, scroll a #productos. */}
                {store.banner_cta_text && (
                  store.banner_cta_link ? (
                    <a
                      href={store.banner_cta_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-5 inline-flex items-center gap-2 px-7 py-3.5 sm:px-5 sm:py-2.5 min-h-[52px] rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-900 text-base sm:text-xs font-black uppercase tracking-widest shadow-xl shadow-amber-500/40 transition-all hover:scale-105 active:scale-95"
                    >
                      {store.banner_cta_text}
                      <ChevronRight className="w-5 h-5 sm:w-3.5 sm:h-3.5" />
                    </a>
                  ) : (
                    <a
                      href="#productos"
                      className="mt-5 inline-flex items-center gap-2 px-7 py-3.5 sm:px-5 sm:py-2.5 min-h-[52px] rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-900 text-base sm:text-xs font-black uppercase tracking-widest shadow-xl shadow-amber-500/40 transition-all hover:scale-105 active:scale-95"
                    >
                      {store.banner_cta_text}
                      <ChevronRight className="w-5 h-5 sm:w-3.5 sm:h-3.5" />
                    </a>
                  )
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stats bar with glass effect — FIX-MOBILE-LEGIBILITY: textos más grandes
            y jerarquía clara para mobile, más padding vertical */}
        <div className="bg-stone-900/95 backdrop-blur-md border-t-2 border-amber-500/30">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-5 sm:gap-8">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 sm:w-9 sm:h-9 rounded-xl bg-amber-500/20 flex items-center justify-center">
                  <Package className="w-5 h-5 sm:w-4 sm:h-4 text-amber-400" />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-black text-white leading-none">{filter.totalProducts}</p>
                  <p className="text-[10px] sm:text-[9px] font-bold uppercase tracking-widest text-amber-300/80 mt-1">{t('productsLabel', { count: filter.totalProducts })}</p>
                </div>
              </div>
              <div className="w-px h-10 bg-stone-700/60" />
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 sm:w-9 sm:h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                  <Zap className="w-5 h-5 sm:w-4 sm:h-4 text-emerald-400" />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-black text-white leading-none">{filter.totalWithStock}</p>
                  <p className="text-[10px] sm:text-[9px] font-bold uppercase tracking-widest text-emerald-300/80 mt-1">{t('availableLabel', { count: filter.totalWithStock })}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {store.whatsapp_group_url && (
                <a
                  href={store.whatsapp_group_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl bg-green-700 hover:bg-green-600 text-white text-[11px] font-black uppercase tracking-widest transition-all hover:shadow-lg hover:shadow-green-600/20 active:scale-95"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Grupo
                </a>
              )}
              {store.telegram_url && (
                <a
                  href={store.telegram_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-black uppercase tracking-widest transition-all hover:shadow-lg hover:shadow-sky-500/20 active:scale-95"
                >
                  <Send className="w-3.5 h-3.5" />
                  Telegram
                </a>
              )}
              {store.phone && (
                <a
                  href={`https://wa.me/${store.phone.replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-[11px] font-black uppercase tracking-widest transition-all hover:shadow-lg hover:shadow-green-600/20 active:scale-95"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  {t('inquireNow')}
                </a>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Carrusel promocional configurable (hasta 5 imágenes) */}
      {store.promo_images && store.promo_images.length > 0 && (
        <PromoCarousel images={store.promo_images} />
      )}

      {/* Servicios configurables (hasta 6) */}
      {store.services && store.services.length > 0 && (
        <ServicesSection services={store.services} />
      )}

      {/* Trust bar — solo se muestra si NO hay servicios configurados (evita redundancia) */}
      {!store.services || store.services.length === 0 ? (
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
      ) : null}

      {/* Search + Filter + View Toggle Toolbar */}
      <div id="productos" className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200 shadow-sm scroll-mt-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className={cn(
                'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors',
                filter.isSearching ? 'text-amber-500 animate-pulse' : 'text-stone-400'
              )} />
              <input
                type="text"
                value={filter.searchTerm}
                onChange={(e) => filter.setSearchTerm(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className={cn(
                  'w-full pl-10 pr-4 py-2.5 rounded-xl border-2 bg-stone-50 text-sm font-bold focus:bg-white outline-none transition-all',
                  filter.isSearching
                    ? 'border-amber-400 bg-amber-50/30'
                    : 'border-stone-200 focus:border-amber-400'
                )}
                aria-label={t('searchProducts')}
              />
              {/* FIX-SEARCH-DEBOUNCE-VISUAL: indicador "Buscando…" mientras
                  el debounce corre. Aparece a la derecha del input. */}
              {filter.isSearching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-600">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span className="hidden sm:inline">Buscando…</span>
                </div>
              )}
              {!filter.isSearching && filter.searchTerm && (
                <button
                  onClick={() => filter.setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                  aria-label={t('clearSearch')}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {/* Category filter button — en mobile abre bottom-sheet, en desktop inline */}
            <button
              onClick={() => {
                if (typeof window !== 'undefined' && window.innerWidth < 640) {
                  setShowMobileCategories(true);
                } else {
                  filter.setShowFilters(!filter.showFilters);
                }
              }}
              aria-expanded={filter.showFilters || showMobileCategories}
              aria-controls="construccion-category-filters"
              className={cn(
                'flex items-center gap-1.5 px-3 py-2.5 rounded-xl border-2 text-[11px] font-black uppercase tracking-widest transition-all min-h-[44px]',
                (filter.showFilters || filter.selectedCategory)
                  ? 'border-amber-600 bg-amber-600 text-white'
                  : 'border-stone-200 bg-stone-50 text-stone-600 hover:border-amber-300'
              )}
            >
              <Filter className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('categories')}</span>
              {filter.selectedCategory && (
                <span className="sm:hidden ml-0.5 px-1.5 py-0.5 rounded-full bg-white/30 text-[9px]">
                  1
                </span>
              )}
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
                <ConstruccionCard key={p.id} product={p} image={filter.productImage(p)} onClick={() => setDetailProduct(p)} onQuickView={() => setQuickViewProduct(p)} />
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

      {/* Notificaciones de ventas en vivo (social proof) */}
      <LiveSalesNotifications products={products} />

      {/* WhatsApp FAB — CTA siempre accesible */}
      <WhatsAppFAB store={store} />

      {/* Sticky mini-stats en mobile (aparece al hacer scroll) */}
      <StickyMiniStats total={filter.totalProducts} available={filter.totalWithStock} />

      {/* Bottom-sheet de categorías para mobile */}
      <MobileCategorySheet
        open={showMobileCategories}
        onClose={() => setShowMobileCategories(false)}
        categories={filter.categories}
        selectedCategory={filter.selectedCategory}
        onSelect={filter.setSelectedCategory}
        totalProducts={filter.totalProducts}
        categoryCounts={categoryCounts}
      />

      <StorefrontFooter store={store} template="construccion" />
      {detailProduct && <ProductDetailModal product={detailProduct} onClose={() => setDetailProduct(null)} storePhone={store.phone} />}
      {quickViewProduct && (
        <QuickViewModal
          product={quickViewProduct}
          image={filter.productImage(quickViewProduct)}
          onClose={() => setQuickViewProduct(null)}
          onFullDetails={() => {
            const p = quickViewProduct;
            setQuickViewProduct(null);
            setDetailProduct(p);
          }}
          storePhone={store.phone}
        />
      )}
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

function ConstruccionCard({ product, image, onClick, onQuickView }: { product: StorefrontProduct; image: string | null; onClick: () => void; onQuickView?: () => void }) {
  const t = useTranslations('stores.storefront');
  const [expanded, setExpanded] = useState(false);
  const inStock = product.inStock;
  // FIX: Si está en promoción, mostrar como disponible (sin opacidad) aunque stock=0
  const showAsAvailable = inStock || product.on_promotion === true;
  const isOnPromotion = product.on_promotion === true;

  return (
    <div className={cn(
      'group rounded-2xl bg-white overflow-hidden transition-all duration-300 flex flex-col cursor-pointer shadow-sm',
      showAsAvailable
        ? 'hover:shadow-xl hover:shadow-amber-500/10 hover:-translate-y-1 border border-stone-200/80'
        : 'opacity-60 border border-stone-200/40',
      // FIX-PROMO-VISIBILITY: borde dorado + ring sutil para productos en promoción
      isOnPromotion && 'ring-1 ring-amber-400/40 border-amber-300/60',
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
        {/* FIX-PROMO-VISIBILITY: Badge PROMO siempre visible en esquina superior derecha */}
        {isOnPromotion && (
          <span className="absolute top-3 right-3 px-2 py-0.5 rounded-md bg-amber-500 text-white text-[9px] font-black uppercase tracking-widest shadow-md flex items-center gap-1 z-10">
            <Zap className="w-3 h-3" />
            Promo
          </span>
        )}
        {/* Badge de stock solo si stock_visible es true Y no está en promoción
            (si está en promoción, el badge PROMO ya indica disponibilidad) */}
        {product.stock_visible !== false && !isOnPromotion && <StockBadge inStock={inStock} />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
        {/* FIX-QUICK-VIEW: botón "Vista rápida" aparece en hover (desktop only) */}
        {onQuickView && (
          <button
            onClick={(e) => { e.stopPropagation(); onQuickView(); }}
            className="absolute bottom-3 right-3 px-3 py-1.5 rounded-lg bg-white/95 backdrop-blur-md text-stone-900 text-[10px] font-black uppercase tracking-widest shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 hover:bg-white hidden sm:flex items-center gap-1 z-10"
          >
            <Search className="w-3 h-3" />
            Vista rápida
          </button>
        )}
      </div>
      <div className="flex-1 p-4 flex flex-col gap-1.5">
        <div className="min-w-0">
          <h3 className="font-black text-sm uppercase tracking-tight truncate text-stone-900 group-hover:text-amber-800 transition-colors">{product.name}</h3>
          {product.sku && <p className="text-[10px] font-mono text-stone-400 mt-0.5">{t('sku')}: {product.sku}</p>}
        </div>
        {/* FIX-LOW-STOCK: badge "Solo quedan pocas" si stock_level === 'low' */}
        {(product as any).stock_level === 'low' && showAsAvailable && (
          <LowStockBadge stockLevel="low" />
        )}
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
                {v.name}{v.price !== product.price && <span className="ml-0.5 text-amber-600">{v.price != null ? formatCurrency(v.price) : "—"}</span>}
              </span>
            ))}
          </div>
        )}
        <div className="flex-1" />
        <div className="flex items-end justify-between pt-2.5 border-t border-stone-100">
          <div>
            <p className="text-[8px] font-black uppercase tracking-[0.15em] text-stone-400 mb-0.5">{t('price')}</p>
            {product.price != null ? (
              <PriceDisplay price={product.price} currency={(product as any).price_currency || 'CUP'} variant="card" />
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
  const showAsAvailable = inStock || product.on_promotion === true;
  const isOnPromotion = product.on_promotion === true;

  return (
    <div
      className={cn(
        'group flex gap-4 p-3 sm:p-4 rounded-xl bg-white border transition-all duration-200 cursor-pointer',
        showAsAvailable
          ? 'border-stone-200/80 hover:border-amber-400/50 hover:shadow-md hover:shadow-amber-500/5'
          : 'border-stone-200/40 opacity-60',
        // FIX-PROMO-VISIBILITY: borde dorado para productos en promoción
        isOnPromotion && 'border-amber-300/70 ring-1 ring-amber-400/30',
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
        {/* Stock dot — solo si no está en promoción (promoción usa badge dorado) */}
        {!isOnPromotion && (
          <span className={cn('absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full border-2 border-white', inStock ? 'bg-emerald-500' : 'bg-red-500')} />
        )}
        {/* Badge PROMO */}
        {isOnPromotion && (
          <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-amber-500 text-white text-[8px] font-black uppercase tracking-widest shadow flex items-center gap-0.5 z-10">
            <Zap className="w-2.5 h-2.5" />
            Promo
          </span>
        )}
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
              <PriceDisplay price={product.price} currency={(product as any).price_currency || 'CUP'} variant="list" className="justify-end" />
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
                <div className="mt-1 flex items-baseline gap-1.5">
                  {p.price != null ? (
                    <PriceDisplay price={p.price} currency={(p as any).price_currency || 'CUP'} variant="compact" />
                  ) : (
                    <span className="text-sm font-bold text-stone-400 italic">Consultar</span>
                  )}
                  <span className="text-stone-300 text-xs">/ {p.unit_of_measure || t('unit')}</span>
                </div>
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
              const showAsAvailable = inStock || p.on_promotion === true;
              const img = filter.productImage(p);
              return (
                <div key={p.id} className={cn('group rounded-2xl bg-white shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden flex flex-col cursor-pointer', !showAsAvailable && 'opacity-50')} onClick={() => setDetailProduct(p)}>
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
                      {p.price != null ? (
                        <PriceDisplay price={p.price} currency={(p as any).price_currency || 'CUP'} variant="card" />
                      ) : (
                        <p className="text-lg font-bold text-stone-400 italic">Consultar</p>
                      )}
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
                <div key={p.id} className={cn('flex gap-4 p-4 rounded-xl border border-amber-200/60 bg-white cursor-pointer hover:shadow-md transition-all', !(inStock || p.on_promotion === true) && 'opacity-50')} onClick={() => setDetailProduct(p)}>
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
                      {p.price != null ? (
                        <PriceDisplay price={p.price} currency={(p as any).price_currency || 'CUP'} variant="card" />
                      ) : (
                        <p className="text-lg font-bold text-stone-400 italic">Consultar</p>
                      )}
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
