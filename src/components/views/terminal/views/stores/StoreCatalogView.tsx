'use client';

/**
 * StoreCatalogView — CATÁLOGO / VITRINA DIGITAL (Gestión de Tiendas · tab 3)
 * (REPLANTEAMIENTO UX: fix/ux-inventario-vitrina · docs/ux/auditoria-inventario-vitrina.md)
 *
 * Concepción (módulo especial UX/UI):
 *   INVENTARIO (¿qué tengo?) → CATÁLOGO (¿qué muestro al cliente?) → VITRINA (¿cómo se ve?)
 *
 * Administra por producto, sobre la ÚNICA fuente de verdad (tabla products):
 *   - visible_en_tienda  → ¿aparece en la vitrina?
 *   - price_visible      → ¿el cliente ve el precio? (si no → "Consultar")
 *   - stock_visible      → ¿el cliente ve la disponibilidad?
 *   - on_promotion       → ¿participa en promoción?
 *
 * Reglas críticas (§19-21):
 *   - Mismos campos que Inventario → misma verdad; se comparten claves de
 *     invalidación (['products'], ['inventory']) para reflejar el cambio en
 *     ambas vistas sin estados visuales falsos.
 *   - Actualización confirmada por la DB (.select()): el estado se pinta solo
 *     cuando la persistencia real ocurrió; en error se revierte y se avisa.
 *   - Nunca se muestra "Guardado" si no se persistió.
 *
 * Incluye: búsqueda, filtros-chip con contadores, selección múltiple con
 * acciones masivas confirmadas (por fila, aisladas con allSettled), vista
 * previa con las reglas EXACTAS de StorefrontPage y acceso a la tienda pública.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store';
import { useQueryClient } from '@tanstack/react-query';
import { cn, formatCurrency, resolveProductImage } from '@/lib/utils';
import { toast } from 'sonner';
import {
    Store, ExternalLink, Eye, DollarSign, Package, Zap, CheckSquare, Square,
    Loader2, SearchX, RefreshCw, X, ImageOff, ShieldAlert,
} from 'lucide-react';
import SearchBar from '@/components/ui/SearchBar';
import { ProductImage } from '@/components/ui/atomic';
import { CostProLoader } from '@/components/ui/CostProLoader';
import { DestructiveConfirmModal } from '@/components/ui/DestructiveConfirmModal';
import {
    DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
    DropdownMenuCheckboxItem, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';

/* ───────────────────────────── Tipos ───────────────────────────── */

/** Subconjunto de Product relevante para el catálogo. */
interface CatalogProduct {
    id: string;
    name: string;
    sku: string | null;
    barcode: string | null;
    category: string | null;
    description: string | null;
    price: number | null;
    price_currency?: string | null;
    stock_current: number | null;
    unit_of_measure: string | null;
    image_url: string | null;
    public_image_url: string | null;
    is_active: boolean;
    visible_en_tienda: boolean | null;
    price_visible: boolean | null;
    stock_visible: boolean | null;
    on_promotion: boolean | null;
    store_id: string | null;
}

type CatalogField = 'visible_en_tienda' | 'price_visible' | 'stock_visible' | 'on_promotion';

type CatalogFilter = 'all' | 'visible' | 'hidden' | 'promo' | 'price_hidden' | 'stock_hidden';

const FILTERS: Array<{ id: CatalogFilter; label: string }> = [
    { id: 'all', label: 'Todos' },
    { id: 'visible', label: 'Visibles' },
    { id: 'hidden', label: 'Ocultos' },
    { id: 'promo', label: 'En promoción' },
    { id: 'price_hidden', label: 'Precio oculto' },
    { id: 'stock_hidden', label: 'Stock oculto' },
];

/** Operaciones masivas disponibles (§17). */
const BULK_OPS: Array<{
    id: string; label: string; field: CatalogField; value: boolean;
    tone: 'success' | 'muted' | 'warning';
}> = [
    { id: 'publish', label: 'Publicar en tienda', field: 'visible_en_tienda', value: true, tone: 'success' },
    { id: 'hide', label: 'Ocultar de la tienda', field: 'visible_en_tienda', value: false, tone: 'muted' },
    { id: 'price_on', label: 'Mostrar precio', field: 'price_visible', value: true, tone: 'success' },
    { id: 'price_off', label: 'Ocultar precio', field: 'price_visible', value: false, tone: 'muted' },
    { id: 'stock_on', label: 'Mostrar stock', field: 'stock_visible', value: true, tone: 'success' },
    { id: 'stock_off', label: 'Ocultar stock', field: 'stock_visible', value: false, tone: 'muted' },
    { id: 'promo_on', label: 'Activar promoción', field: 'on_promotion', value: true, tone: 'warning' },
    { id: 'promo_off', label: 'Quitar promoción', field: 'on_promotion', value: false, tone: 'muted' },
];

const PRODUCT_COLUMNS = 'id, name, sku, barcode, category, description, price, price_currency, stock_current, unit_of_measure, image_url, public_image_url, is_active, visible_en_tienda, price_visible, stock_visible, on_promotion, store_id';

/* ─────────────────────── Indicadores de estado ─────────────────────── */

/** Fila de estado por producto (representación única — §6/§14). */
function StatusDot({ on, icon: Icon, label, tone = 'emerald' }: {
    on: boolean;
    icon: React.ElementType;
    label: string;
    tone?: 'emerald' | 'amber';
}) {
    return (
        <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-semibold', on ? 'text-foreground' : 'text-stone-400')}>
            <Icon className={cn('w-3.5 h-3.5 shrink-0', on ? (tone === 'amber' ? 'text-amber-500' : 'text-emerald-600') : 'text-stone-300')} />
            {label}
        </span>
    );
}

/* ─────────────────────── Vista previa (§18) ─────────────────────── */

/**
 * Réplica fiel de la tarjeta pública de StorefrontPage (grid card):
 *   - price_visible === false → "Consultar" (regla exacta de la vitrina)
 *   - stock badge solo si stock_visible !== false && !on_promotion
 *   - promo badge amber con Zap; atenuada si no disponible
 *   - si NO está publicado, la vitrina ni la muestra → aviso explícito.
 */
function StorefrontPreviewModal({ product, onClose }: { product: CatalogProduct; onClose: () => void }) {
    const inStock = (product.stock_current ?? 0) > 0;
    const isOnPromotion = product.on_promotion === true;
    const showAsAvailable = inStock || isOnPromotion;
    const priceShown = product.price_visible !== false ? product.price : null;
    const imageUrl = resolveProductImage(product as never);

    // Accesibilidad: cierre con Escape (parity con el resto de modales de la app).
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Vista previa de ${product.name}`}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
                {/* Encabezado */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-stone-100 border-b border-stone-200">
                    <span className="text-[10px] font-black uppercase tracking-widest text-stone-500 flex items-center gap-1.5">
                        <Store className="w-3.5 h-3.5" /> Vista previa — Vitrina
                    </span>
                    <button type="button" onClick={onClose} className="w-8 h-8 rounded-full bg-stone-200 text-stone-600 flex items-center justify-center hover:bg-stone-300 transition-colors" aria-label="Cerrar vista previa">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-4 space-y-3">
                    {/* Imagen */}
                    <div className="relative aspect-[4/3] bg-stone-100 rounded-xl overflow-hidden">
                        {imageUrl ? (
                            <ProductImage src={imageUrl} alt={product.name} name={product.name} className="w-full h-full" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                <ImageOff className="w-10 h-10 text-stone-300" />
                            </div>
                        )}
                        {isOnPromotion && (
                            <span className="absolute top-3 left-3 px-2 py-0.5 rounded-md bg-amber-500 text-white text-[9px] font-black uppercase tracking-widest shadow-md flex items-center gap-1">
                                <Zap className="w-3 h-3" /> Promo
                            </span>
                        )}
                        {product.category && (
                            <span className="absolute bottom-3 left-3 px-2 py-0.5 rounded-md bg-stone-900/80 text-[9px] font-black uppercase tracking-widest text-amber-400 backdrop-blur-md">
                                {product.category}
                            </span>
                        )}
                    </div>

                    {/* Nombre + SKU */}
                    <div>
                        <h3 className="font-black text-base uppercase tracking-tight text-stone-900 leading-tight">{product.name}</h3>
                        {product.sku && <p className="text-[10px] font-mono text-stone-400 mt-0.5">SKU: {product.sku}</p>}
                    </div>

                    {/* Precio + stock — MISMAS reglas que StorefrontPage */}
                    <div className="flex items-end justify-between gap-2 pt-2 border-t border-stone-100">
                        <div>
                            <p className="text-[8px] font-black uppercase tracking-[0.15em] text-stone-400 mb-0.5">Precio</p>
                            {priceShown != null ? (
                                <p className="text-xl font-black text-stone-900">{formatCurrency(priceShown, product.price_currency || 'CUP')}</p>
                            ) : (
                                <p className="text-lg font-black text-stone-400 italic">Consultar</p>
                            )}
                        </div>
                        {product.stock_visible !== false && !isOnPromotion && (
                            <span className={cn(
                                'px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest',
                                inStock ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
                            )}>
                                {inStock ? 'Disponible' : 'Agotado'}
                            </span>
                        )}
                    </div>

                    {/* Aviso de no publicado (la vitrina no lo muestra) */}
                    {!product.visible_en_tienda && (
                        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200">
                            <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                            <p className="text-[11px] text-red-700 font-semibold leading-snug">
                                Este producto NO está publicado: la vitrina no lo muestra a los clientes.
                            </p>
                        </div>
                    )}
                    {product.visible_en_tienda && !showAsAvailable && (
                        <p className="text-[11px] text-stone-500">
                            En la vitrina aparecerá atenuado (agotado y sin promoción).
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ───────────────────────────── Vista ───────────────────────────── */

export default function StoreCatalogView() {
    const { user } = useAuthStore();
    const queryClient = useQueryClient();
    const activeStoreId = user?.activeStoreId;

    /* Datos */
    const [products, setProducts] = useState<CatalogProduct[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [storeSlug, setStoreSlug] = useState<string | null>(null);
    const [reloadTick, setReloadTick] = useState(0);

    /* UI */
    const [searchTerm, setSearchTerm] = useState('');
    const [filter, setFilter] = useState<CatalogFilter>('all');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    /** Operaciones en vuelo: `${productId}:${field}` → spinner/deshabilitado. */
    const [busy, setBusy] = useState<Set<string>>(new Set());
    const [bulkConfirm, setBulkConfirm] = useState<{ op: typeof BULK_OPS[number] } | null>(null);
    const [isBulkRunning, setIsBulkRunning] = useState(false);
    const [previewProduct, setPreviewProduct] = useState<CatalogProduct | null>(null);

    /* Carga: productos de la tienda activa + slug para "Ver tienda". */
    useEffect(() => {
        if (!activeStoreId) { setIsLoading(false); return; }
        let cancelled = false;
        (async () => {
            setIsLoading(true);
            setError(null);
            try {
                const [productsRes, storeRes] = await Promise.all([
                    supabase
                        .from('products')
                        .select(PRODUCT_COLUMNS)
                        .eq('store_id', activeStoreId)
                        .eq('is_active', true)
                        .order('name'),
                    supabase.from('stores').select('slug').eq('id', activeStoreId).single(),
                ]);
                if (cancelled) return;
                if (productsRes.error) throw productsRes.error;
                setProducts((productsRes.data || []) as CatalogProduct[]);
                if (!storeRes.error && storeRes.data?.slug) setStoreSlug(storeRes.data.slug);
            } catch (err) {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Error al cargar el catálogo');
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [activeStoreId, reloadTick]);

    /* Mutación de un campo sobre UN producto (misma fuente de verdad §20).
       Optimistic + confirmación por .select() + revertir en error (§21). */
    const updateField = useCallback(async (product: CatalogProduct, field: CatalogField, value: boolean) => {
        if (!activeStoreId) return;
        const key = `${product.id}:${field}`;
        setBusy(prev => new Set(prev).add(key));
        const previous = products;
        // Optimistic: reflejar de inmediato…
        setProducts(prev => prev.map(p => (p.id === product.id ? { ...p, [field]: value } : p)));
        try {
            const { data, error } = await supabase
                .from('products')
                .update({ [field]: value })
                .eq('id', product.id)
                .select(PRODUCT_COLUMNS)
                .single();
            if (error) throw error;
            // …y confirmar con la fila REAL devuelta por la DB (sin estados falsos).
            setProducts(prev => prev.map(p => (p.id === product.id ? (data as CatalogProduct) : p)));
            // Coherencia con las demás vistas (Inventario, POS, export de catálogo):
            // mismas claves que usan los toggles de InventoryView → única verdad §20.
            queryClient.invalidateQueries({ queryKey: ['products'] });
            queryClient.invalidateQueries({ queryKey: ['inventory'] });
            toast.success(field === 'visible_en_tienda'
                ? (value ? `"${product.name}" publicado en la vitrina` : `"${product.name}" oculto de la vitrina`)
                : field === 'price_visible'
                    ? (value ? `Precio de "${product.name}" visible` : `Precio de "${product.name}" oculto (mostrará "Consultar")`)
                    : field === 'stock_visible'
                        ? (value ? `Stock de "${product.name}" visible` : `Stock de "${product.name}" oculto`)
                        : (value ? `"${product.name}" en promoción` : `"${product.name}" fuera de promoción`)
            );
        } catch (err) {
            setProducts(previous); // revertir visualmente (§21.6)
            toast.error('No se pudo guardar el cambio: ' + (err instanceof Error ? err.message : 'error desconocido'));
        } finally {
            setBusy(prev => { const next = new Set(prev); next.delete(key); return next; });
        }
    }, [activeStoreId, products]);

    /* Acción masiva: por fila con allSettled → integridad por fila (§17). */
    const runBulk = useCallback(async (op: typeof BULK_OPS[number]) => {
        if (!activeStoreId || selected.size === 0) return;
        setIsBulkRunning(true);
        const ids = Array.from(selected);
        let ok = 0, failed = 0;
        const results = await Promise.allSettled(
            ids.map(id =>
                supabase
                    .from('products')
                    .update({ [op.field]: op.value })
                    .eq('id', id)
                    .select('id')
                    .single()
            )
        );
        const failedIds = new Set<string>();
        results.forEach((r, i) => {
            if (r.status === 'fulfilled' && !r.value.error) { ok++; }
            else { failed++; failedIds.add(ids[i]); }
        });
        // Reflejar el resultado REAL (solo las filas confirmadas) + coherencia
        // con las demás vistas que leen los mismos campos (única verdad §20).
        if (ok > 0) {
            setProducts(prev => prev.map(p => (!failedIds.has(p.id) && selected.has(p.id) ? { ...p, [op.field]: op.value } : p)));
            queryClient.invalidateQueries({ queryKey: ['products'] });
            queryClient.invalidateQueries({ queryKey: ['inventory'] });
        }
        if (failed > 0) {
            toast.error(`Acción masiva incompleta: ${ok} aplicados, ${failed} fallaron. Los fallados conservan su estado anterior.`);
        } else {
            toast.success(`${op.label}: ${ok} producto${ok === 1 ? '' : 's'} actualizado${ok === 1 ? '' : 's'} correctamente.`);
        }
        setSelected(new Set());
        setIsBulkRunning(false);
        setBulkConfirm(null);
    }, [activeStoreId, selected, queryClient]);

    /* Selección (por id) */
    const toggleSelect = useCallback((id: string) => {
        setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    }, []);

    /* Derivados */
    const filtered = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        return products.filter(p => {
            if (term && !(`${p.name} ${p.sku ?? ''} ${p.barcode ?? ''} ${p.category ?? ''}`.toLowerCase().includes(term))) return false;
            switch (filter) {
                case 'visible': return !!p.visible_en_tienda;
                case 'hidden': return !p.visible_en_tienda;
                case 'promo': return !!p.on_promotion;
                case 'price_hidden': return !p.price_visible;
                case 'stock_hidden': return !p.stock_visible;
                default: return true;
            }
        });
    }, [products, searchTerm, filter]);

    const counts = useMemo(() => ({
        total: products.length,
        visible: products.filter(p => p.visible_en_tienda).length,
        hidden: products.filter(p => !p.visible_en_tienda).length,
        promo: products.filter(p => p.on_promotion).length,
        priceHidden: products.filter(p => !p.price_visible).length,
        stockHidden: products.filter(p => !p.stock_visible).length,
    }), [products]);

    const allSelected = filtered.length > 0 && selected.size === filtered.length;

    /* Selección (todos los filtrados) — declarada tras `filtered` (orden TDZ). */
    const toggleSelectAll = useCallback(() => {
        setSelected(prev => (prev.size === filtered.length ? new Set() : new Set(filtered.map(p => p.id))));
    }, [filtered]);

    /* ── Estados del contenedor ── */
    if (!activeStoreId) {
        return (
            <div className="text-center py-16 text-muted-foreground">
                <Store className="w-12 h-12 mx-auto mb-3 opacity-30" aria-hidden="true" />
                <p className="font-black uppercase tracking-widest text-sm">No hay tienda activa</p>
                <p className="text-sm mt-1">Selecciona una tienda para administrar su catálogo.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Encabezado del catálogo */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="text-base sm:text-lg font-black tracking-tight uppercase">Catálogo de la vitrina</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {counts.total} productos · {counts.visible} publicados · {counts.hidden} ocultos · {counts.promo} en promoción
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {storeSlug && (
                        <a
                            href={`/tienda/${storeSlug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border border-border bg-card text-xs font-black uppercase tracking-widest hover:bg-muted transition-colors"
                            title="Abrir la vitrina pública en una pestaña nueva"
                        >
                            <ExternalLink className="w-4 h-4" /> Ver tienda
                        </a>
                    )}
                    <button
                        type="button"
                        onClick={() => setReloadTick(t => t + 1)}
                        className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border border-border bg-card text-xs font-black uppercase tracking-widest hover:bg-muted transition-colors"
                        title="Recargar catálogo"
                    >
                        <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} /> Recargar
                    </button>
                </div>
            </div>

            {/* Búsqueda + filtros (chips táctiles; en móvil scroll horizontal — §16/§23) */}
            <div className="space-y-3">
                <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder="Buscar producto por nombre, código o categoría..." />
                <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="group" aria-label="Filtros del catálogo">
                    {FILTERS.map(f => (
                        <button
                            key={f.id}
                            type="button"
                            onClick={() => setFilter(f.id)}
                            aria-pressed={filter === f.id}
                            className={cn(
                                'inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-full border whitespace-nowrap text-[11px] font-black uppercase tracking-widest transition-all active:scale-95',
                                filter === f.id
                                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                    : 'bg-card text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                            )}
                        >
                            {f.label}
                            <span className={cn(
                                'px-1.5 rounded-full text-[10px] font-black',
                                filter === f.id ? 'bg-primary-foreground/20' : 'bg-muted'
                            )}>
                                {f.id === 'all' ? counts.total
                                    : f.id === 'visible' ? counts.visible
                                    : f.id === 'hidden' ? counts.hidden
                                    : f.id === 'promo' ? counts.promo
                                    : f.id === 'price_hidden' ? counts.priceHidden
                                    : counts.stockHidden}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Barra de selección múltiple (§17) */}
            {filtered.length > 0 && (
                <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-border bg-muted/30">
                    <button
                        type="button"
                        onClick={toggleSelectAll}
                        className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors min-h-[44px]"
                        aria-pressed={allSelected}
                    >
                        {allSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                        {allSelected ? 'Deseleccionar todo' : 'Seleccionar todo'}
                    </button>
                    <span className="text-xs text-muted-foreground font-semibold">{selected.size} seleccionado{selected.size === 1 ? '' : 's'}</span>
                </div>
            )}

            {/* Estados de carga / error / vacío */}
            {isLoading && (
                <div className="flex justify-center py-16">
                    <CostProLoader size={120} text="CARGANDO" subtext="Obteniendo catálogo de la vitrina..." />
                </div>
            )}
            {!isLoading && error && (
                <div className="text-center py-12 text-muted-foreground">
                    <ShieldAlert className="w-12 h-12 mx-auto mb-3 text-destructive/40" aria-hidden="true" />
                    <p className="font-black uppercase tracking-widest text-sm text-destructive">Error al cargar</p>
                    <p className="text-sm mt-1">{error}</p>
                    <button type="button" onClick={() => setReloadTick(t => t + 1)} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest">
                        <RefreshCw className="w-4 h-4" /> Reintentar
                    </button>
                </div>
            )}
            {!isLoading && !error && products.length === 0 && (
                <div className="text-center py-16 text-muted-foreground">
                    <Store className="w-12 h-12 mx-auto mb-3 opacity-20" aria-hidden="true" />
                    <p className="font-black uppercase tracking-widest text-sm">No hay productos activos en esta tienda</p>
                    <p className="text-sm mt-1">Los productos se administran desde Inventario → Stock actual.</p>
                </div>
            )}
            {!isLoading && !error && products.length > 0 && filtered.length === 0 && (
                <div className="text-center py-16 text-muted-foreground">
                    <SearchX className="w-12 h-12 mx-auto mb-3 opacity-20" aria-hidden="true" />
                    <p className="font-black uppercase tracking-widest text-sm">Sin resultados</p>
                    <p className="text-sm mt-1">Ajusta la búsqueda o los filtros.</p>
                </div>
            )}

            {/* Grid de tarjetas de catálogo */}
            {!isLoading && !error && filtered.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" role="list" aria-label="Catálogo de la vitrina">
                    {filtered.map(product => {
                        const imageUrl = resolveProductImage(product as never);
                        const isSelected = selected.has(product.id);
                        const busyVisible = busy.has(`${product.id}:visible_en_tienda`);
                        const busyPrice = busy.has(`${product.id}:price_visible`);
                        const busyStock = busy.has(`${product.id}:stock_visible`);
                        const busyPromo = busy.has(`${product.id}:on_promotion`);
                        return (
                            <div
                                key={product.id}
                                role="listitem"
                                className={cn(
                                    'relative rounded-2xl border bg-card overflow-hidden transition-all',
                                    isSelected ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:shadow-md',
                                    !product.visible_en_tienda && 'opacity-90'
                                )}
                            >
                                {/* Selección masiva */}
                                <button
                                    type="button"
                                    onClick={() => toggleSelect(product.id)}
                                    className="absolute top-3 left-3 z-10 w-9 h-9 rounded-lg bg-card/90 border border-border flex items-center justify-center shadow-sm backdrop-blur-sm hover:bg-muted transition-all active:scale-90"
                                    aria-label={isSelected ? `Deseleccionar ${product.name}` : `Seleccionar ${product.name}`}
                                    aria-pressed={isSelected}
                                >
                                    {isSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4 text-muted-foreground" />}
                                </button>

                                {/* Imagen */}
                                <div className={cn('m-3 mb-0 rounded-xl overflow-hidden bg-muted flex items-center justify-center', imageUrl ? 'aspect-video' : 'h-10 w-10')}>
                                    {imageUrl ? (
                                        <ProductImage src={imageUrl} alt={product.name} name={product.name} className="w-full h-full" />
                                    ) : (
                                        <ImageOff className="w-4 h-4 text-muted-foreground" />
                                    )}
                                </div>

                                {/* Identificación */}
                                <div className="px-3.5 pt-2.5">
                                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block leading-tight">
                                        {product.category || 'General'}
                                    </span>
                                    <h4 className="font-black text-sm uppercase tracking-tight truncate mt-0.5" title={product.name}>{product.name}</h4>
                                    {(product.sku || product.barcode) && (
                                        <span className="text-[11px] text-muted-foreground font-medium tabular-nums">
                                            Código: {product.sku || product.barcode}
                                        </span>
                                    )}
                                </div>

                                {/* Estados de publicación (§14) */}
                                <div className="px-3.5 pt-2.5 flex flex-col gap-1">
                                    <StatusDot on={!!product.visible_en_tienda} icon={busyVisible ? Loader2 : Eye} label={product.visible_en_tienda ? 'Visible en tienda' : 'Oculto de la tienda'} />
                                    <StatusDot on={!!product.price_visible} icon={busyPrice ? Loader2 : DollarSign} label={product.price_visible ? 'Precio visible' : 'Precio oculto'} />
                                    <StatusDot on={!!product.stock_visible} icon={busyStock ? Loader2 : Package} label={product.stock_visible ? 'Stock visible' : 'Stock oculto'} />
                                    <StatusDot on={!!product.on_promotion} icon={busyPromo ? Loader2 : Zap} label={product.on_promotion ? 'En promoción' : 'Sin promoción'} tone="amber" />
                                </div>

                                {/* Acciones */}
                                <div className="flex items-center gap-2 p-3 pt-2.5">
                                    <button
                                        type="button"
                                        onClick={() => setPreviewProduct(product)}
                                        className="flex-1 py-2.5 rounded-xl border border-border bg-background text-xs font-medium text-foreground hover:bg-muted transition-all active:scale-95 min-h-[40px]"
                                    >
                                        Vista previa
                                    </button>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <button
                                                type="button"
                                                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium flex items-center justify-center gap-2 active:scale-95 transition-all min-h-[40px]"
                                                aria-label={`Configurar publicación de ${product.name}`}
                                            >
                                                <Store className="w-3.5 h-3.5" /> Configurar
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" sideOffset={6} className="w-60">
                                            <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                                Publicación en vitrina
                                            </DropdownMenuLabel>
                                            <DropdownMenuCheckboxItem
                                                checked={!!product.visible_en_tienda}
                                                onSelect={(e) => e.preventDefault()}
                                                onCheckedChange={(v) => updateField(product, 'visible_en_tienda', !!v)}
                                                disabled={busyVisible}
                                                className="gap-2.5 py-2.5 cursor-pointer"
                                            >
                                                <Eye className={cn('w-4 h-4 shrink-0', product.visible_en_tienda ? 'text-success' : 'text-muted-foreground/50')} />
                                                <span className="font-semibold flex-1">Visible en tienda</span>
                                                {busyVisible && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                            </DropdownMenuCheckboxItem>
                                            <DropdownMenuCheckboxItem
                                                checked={!!product.price_visible}
                                                onSelect={(e) => e.preventDefault()}
                                                onCheckedChange={(v) => updateField(product, 'price_visible', !!v)}
                                                disabled={busyPrice}
                                                className="gap-2.5 py-2.5 cursor-pointer"
                                            >
                                                <DollarSign className={cn('w-4 h-4 shrink-0', product.price_visible ? 'text-success' : 'text-muted-foreground/50')} />
                                                <span className="font-semibold flex-1">Precio visible</span>
                                                {busyPrice && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                            </DropdownMenuCheckboxItem>
                                            <DropdownMenuCheckboxItem
                                                checked={!!product.stock_visible}
                                                onSelect={(e) => e.preventDefault()}
                                                onCheckedChange={(v) => updateField(product, 'stock_visible', !!v)}
                                                disabled={busyStock}
                                                className="gap-2.5 py-2.5 cursor-pointer"
                                            >
                                                <Package className={cn('w-4 h-4 shrink-0', product.stock_visible ? 'text-success' : 'text-muted-foreground/50')} />
                                                <span className="font-semibold flex-1">Stock visible</span>
                                                {busyStock && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                            </DropdownMenuCheckboxItem>
                                            <DropdownMenuCheckboxItem
                                                checked={!!product.on_promotion}
                                                onSelect={(e) => e.preventDefault()}
                                                onCheckedChange={(v) => updateField(product, 'on_promotion', !!v)}
                                                disabled={busyPromo}
                                                className="gap-2.5 py-2.5 cursor-pointer"
                                            >
                                                <Zap className={cn('w-4 h-4 shrink-0', product.on_promotion ? 'text-warning' : 'text-muted-foreground/50')} />
                                                <span className="font-semibold flex-1">En promoción</span>
                                                {busyPromo && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                            </DropdownMenuCheckboxItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Barra flotante de acciones masivas (§17) — confirmación previa (§22).
                fixed: visible sin depender del scroll (el shell usa contenedores
                de scroll propios donde sticky no es fiable). bottom-20 en móvil
                para no tapar la barra de navegación inferior. */}
            {selected.size > 0 && (
                <div className="fixed bottom-20 sm:bottom-4 right-4 left-4 sm:left-auto z-40 flex justify-end pointer-events-none">
                    <div className="pointer-events-auto max-w-3xl w-full sm:w-auto rounded-2xl border border-border bg-card/95 backdrop-blur-md shadow-xl p-3 flex flex-wrap items-center justify-center gap-2 max-h-[45vh] overflow-y-auto">
                        <span className="text-xs font-black uppercase tracking-widest text-foreground px-2">
                            {selected.size} seleccionado{selected.size === 1 ? '' : 's'}
                        </span>
                        {BULK_OPS.map(op => (
                            <button
                                key={op.id}
                                type="button"
                                disabled={isBulkRunning}
                                onClick={() => setBulkConfirm({ op })}
                                className={cn(
                                    'px-3 py-2 min-h-[40px] rounded-xl border text-[11px] font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50',
                                    op.tone === 'success' && 'bg-success/10 text-success border-success/20 hover:bg-success/20',
                                    op.tone === 'warning' && 'bg-warning/10 text-warning border-warning/20 hover:bg-warning/20',
                                    op.tone === 'muted' && 'bg-muted text-muted-foreground border-border hover:bg-muted/70'
                                )}
                            >
                                {op.label}
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={() => setSelected(new Set())}
                            disabled={isBulkRunning}
                            className="px-3 py-2 min-h-[40px] rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground transition-all disabled:opacity-50"
                            aria-label="Cancelar selección"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Confirmación de acción masiva — afecta la vitrina pública (§22) */}
            {bulkConfirm && (
                <DestructiveConfirmModal
                    isOpen={!!bulkConfirm}
                    onClose={() => !isBulkRunning && setBulkConfirm(null)}
                    title={`${bulkConfirm.op.label} — ${selected.size} producto${selected.size === 1 ? '' : 's'}`}
                    description={
                        bulkConfirm.op.field === 'visible_en_tienda'
                            ? `Esta acción cambia INMEDIATAMENTE qué productos ve el cliente en la vitrina pública. ${bulkConfirm.op.value ? 'Los productos aparecerán publicados.' : 'Los productos dejarán de ser visibles.'}`
                            : `Esta acción cambia la configuración comercial de ${selected.size} producto${selected.size === 1 ? '' : 's'} y se refleja en la vitrina al instante.`
                    }
                    confirmLabel={isBulkRunning ? 'Aplicando…' : `Sí, ${bulkConfirm.op.label.toLowerCase()}`}
                    onConfirm={() => runBulk(bulkConfirm.op)}
                />
            )}

            {/* Vista previa con las reglas reales de la vitrina (§18) */}
            {previewProduct && (
                <StorefrontPreviewModal product={previewProduct} onClose={() => setPreviewProduct(null)} />
            )}
        </div>
    );
}
