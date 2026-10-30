"use client";

/**
 * POS-3b EM-1: Modo Cajero Express.
 *
 * MISIÓN VENDER-EXPRESS (2026-10-30) — paridad funcional con el carrito:
 * El carrito habitual (POSView) es la referencia funcional y técnica. Express
 * reutiliza SUS mismos servicios y reglas en lugar de duplicar lógica:
 *
 *  · Búsqueda en vivo: POSAutocomplete (el MISMO dropdown del carrito —
 *    nombre/SKU/código de barras, navegable con teclado, badges de stock).
 *  · Alta de productos: se delega en onAddToCart/handleAddItem del POSView
 *    (pre-check de existencias + auditoría precio<costo + variantes).
 *  · Edición de línea: POSCartItemEditModal del carrito (cantidad decimal 4dp,
 *    precio de operación con gate de supervisor ≥15%, descuento por línea,
 *    cambio de unidad/variante). Cero aritmética propia.
 *  · Descuento global: POSCartDiscountModal del carrito (mismo gate).
 *  · Cobro: usePOSCheckout.startCheckout (create_sale_v2 vía /api/pos/checkout,
 *    validaciones de stock/tasas/incidencias idénticas al carrito).
 *  · Éxito: POSCartSuccessView + usePOSCartExports (PDF/WhatsApp/imagen/
 *    comprobante térmico) — el mismo comprobante del carrito.
 *  · Filtro «Solo con stock»: el MISMO estado (usePOSServerSearch) que el
 *    carrito, pasado por props — un solo criterio de visibilidad.
 *
 * Layout full-screen optimizado para venta de alto volumen (z-[45]: por
 * ENCIMA del sidebar global (z-40) y por DEBAJO de los diálogos Radix
 * reutilizados (z-50) y de POSPortalModal (z-[10000])).
 *
 * Objetivo: venta simple en <6 segundos, con las reglas del carrito.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  ShoppingCart,
  X,
  Check,
  Plus,
  Minus,
  Trash2,
  Zap,
  ArrowLeft,
  Eye,
  EyeOff,
} from "lucide-react";
import { cn, formatCurrency, getSupabaseUrl } from "@/lib/utils";
import { useCartStore, type CartItem } from "@/store/cart";
import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";
import type { Product, ProductVariant } from "@/types";
import { useFrequentProducts } from "@/hooks/api/useFrequentProducts";
import { useActiveShift } from "@/hooks/api/useActiveShift";
import { useAuthStore, useUIStore } from "@/store";
import { supabase } from "@/lib/supabaseClient";
import { validateRPCArrayResponse } from "@/lib/rpc-validator";
import {
  getProductsForPosParamsSchema,
  getProductsForPosResponseSchema,
} from "@/validation/schemas";
import { isPosProductVisible } from "@/hooks/api/usePOSServerSearch";
import { usePOSCheckout } from "./usePOSCheckout";
import { POSPortalModal } from "./POSPortalModal";
// MISIÓN FECHA OPERATIVA (2026-10-17): selector de fecha económica también en Express.
import { POSOperationDateSection, usePosSaleDate } from "./POSOperationDateSection";
import ProductImage from "@/components/ui/ProductImage";
import { PaymentMethodSelector } from "./PaymentMethodSelector";
import { POSAutocomplete } from "./POSAutocomplete";
import PriceSelectorModal from "./PriceSelectorModal";
import { POSCartItemEditModal } from "./POSCartItemEditModal";
import { POSCartDiscountModal } from "./POSCartDiscountModal";
import { POSCartSuccessView } from "./POSCartSuccessView";
import { usePOSCartExports } from "./usePOSCartExports";
import type { LastSale } from "./POSCart.types";

interface POSExpressModeProps {
  products: Product[];
  onExit: () => void;
  /**
   * MISIÓN VENDER-EXPRESS: ruta de alta del carrito (POSView.onAddToCart).
   * Incluye pre-check de existencias (servicios exentos), auditoría
   * precio<costo y derivación a variantes. Express NO reimplementa nada.
   */
  onAddToCart?: (product: Product) => void;
  /**
   * MISIÓN VENDER-EXPRESS: ruta de alta con variante del carrito
   * (POSView.handleAddItem) — usada por el PriceSelectorModal de Express.
   */
  onAddItemWithVariant?: (product: Product, variant: ProductVariant | null) => void;
  /**
   * MISIÓN VENDER-EXPRESS: venta confirmada (estado compartido del carrito).
   * Cuando el checkout tiene éxito, Express muestra la MISMA vista de éxito
   * (POSCartSuccessView) que el carrito, con comprobante imprimible.
   */
  lastSale?: LastSale | null;
  onClearLastSale?: () => void;
  /**
   * MISIÓN VENDER-EXPRESS: «Solo con stock» compartido con el carrito
   * (usePOSServerSearch.hideOutOfStock). Un único criterio de visibilidad.
   */
  hideOutOfStock?: boolean;
  onHideOutOfStockChange?: (value: boolean) => void;
}

/** Máximo de resultados en la lista manual (coincidencias múltiples / servidor). */
const MANUAL_RESULTS_LIMIT = 24;

export function POSExpressMode({
  products,
  onExit,
  onAddToCart,
  onAddItemWithVariant,
  lastSale = null,
  onClearLastSale,
  hideOutOfStock = true,
  onHideOutOfStockChange,
}: POSExpressModeProps) {
  const { user } = useAuthStore();
  const { setSidebarState } = useUIStore();
  const storeId = user?.activeStoreId;
  const { data: activeShift } = useActiveShift(storeId);
  const { data: frequentProducts } = useFrequentProducts(
    storeId,
    activeShift?.created_at,
    products,
    { enabled: !!activeShift },
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  // MISIÓN VENDER-EXPRESS: resultados para selección manual (nombre ambiguo
  // o búsqueda server-side) + selector de variante + editor de línea.
  const [manualResults, setManualResults] = useState<Product[]>([]);
  const [serverSearching, setServerSearching] = useState(false);
  const [variantProduct, setVariantProduct] = useState<Product | null>(null);
  const [editingItem, setEditingItem] = useState<CartItem | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Guarda la última consulta enviada al servidor para descartar respuestas obsoletas.
  const serverSearchSeq = useRef(0);

  // Audit-Fix: cerrar el sidebar al entrar al modo Express y restaurarlo al salir.
  useEffect(() => {
    const previousSidebarState = useUIStore.getState().sidebarState;
    setSidebarState('closed');
    return () => {
      // Restaurar el estado previo al salir del modo Express
      setSidebarState(previousSidebarState === 'closed' ? 'expanded' : previousSidebarState);
    };
  }, [setSidebarState]);

  const {
    items,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    getTotal,
    getSubtotal,
    getDiscountAmount,
    getItemCount,
    selectedPayment,
    setSelectedPayment,
    discount,
    setDiscount,
  } = useCartStore(
    useShallow((s) => ({
      items: s.items,
      addItem: s.addItem,
      removeItem: s.removeItem,
      updateQuantity: s.updateQuantity,
      clearCart: s.clearCart,
      getTotal: s.getTotal,
      getSubtotal: s.getSubtotal,
      getDiscountAmount: s.getDiscountAmount,
      getItemCount: s.getItemCount,
      selectedPayment: s.selectedPayment,
      setSelectedPayment: s.setSelectedPayment,
      discount: s.discount,
      setDiscount: s.setDiscount,
    })),
  );

  const { startCheckout, isProcessingSale } = usePOSCheckout();
  // MISIÓN FECHA OPERATIVA: mismo estado del carrito que el flujo normal;
  // el modal de confirmación muestra el selector y gatea el cobro.
  const { validation: saleDateValidation } = usePosSaleDate();

  // MISIÓN VENDER-EXPRESS: exportaciones del comprobante (mismo hook del carrito).
  const { generatePDF, shareWhatsApp, exportAsImage, printReceipt } = usePOSCartExports({ lastSale });

  const total = getTotal();
  const subtotal = getSubtotal();
  const discountAmount = getDiscountAmount();
  const itemCount = getItemCount();

  // ── Alta de productos (delegada en el carrito) ──────────────────────────

  /**
   * Ruta única de alta de Express. Los productos con variantes abren el
   * PriceSelectorModal (el mismo del carrito) y después delegan en
   * onAddItemWithVariant (handleAddItem del POSView). El resto delega en
   * onAddToCart (stock pre-check + auditoría precio<costo + toasts honestos).
   */
  const handleAddProduct = useCallback(
    (product: Product) => {
      if (product.product_variants && product.product_variants.length > 0) {
        setVariantProduct(product);
        return;
      }
      if (onAddToCart) {
        onAddToCart(product);
        return;
      }
      // Fallback (componente usado sin POSView): alta directa vía store,
      // que mantiene los guards de tienda/stock/decimales.
      const accepted = addItem({
        product_id: product.id, variant_id: null, variant: null,
        price: product.price, cost: product.cost_price || 0,
        quantity: 1, product, subtotal: product.price,
      });
      if (accepted) toast.success(`${product.name} añadido`);
    },
    [onAddToCart, addItem],
  );

  /** Selección de variante del PriceSelectorModal de Express. */
  const handleVariantSelected = useCallback(
    (variant: ProductVariant | null) => {
      const product = variantProduct;
      setVariantProduct(null);
      if (!product) return;
      if (onAddItemWithVariant) {
        onAddItemWithVariant(product, variant);
        return;
      }
      // Fallback (sin POSView): alta directa vía store.
      const accepted = addItem({
        product_id: product.id, variant_id: variant?.id ?? null, variant: variant ?? null,
        price: variant?.price ?? product.price, cost: product.cost_price || 0,
        quantity: 1, product, subtotal: variant?.price ?? product.price,
      });
      if (accepted) toast.success(`${product.name} añadido`);
    },
    [variantProduct, onAddItemWithVariant, addItem],
  );

  // ── Búsqueda server-side de respaldo (catálogos > límite cliente) ───────

  /**
   * MISIÓN VENDER-EXPRESS — Fase 2 «catálogos con muchos productos»:
   * si la búsqueda local no arroja ningún candidato (SKU/nombre/código), se
   * consulta el MISMO RPC autorizado que carga el catálogo del carrito
   * (get_products_for_pos con p_search_term). Respeta RLS, tienda activa y
   * resuelve el código de barras canónico del catálogo maestro (migración
   * CP-CATÁLOGO 2026-10-28). Sin privilegios elevados: el cliente Supabase
   * viaja con la sesión del usuario y el RPC valida has_store_access.
   */
  const runServerSearch = useCallback(
    async (term: string) => {
      if (!storeId) return;
      const seq = ++serverSearchSeq.current;
      setServerSearching(true);
      try {
        const params = getProductsForPosParamsSchema.parse({
          p_store_id: storeId,
          p_search_term: term,
        });
        const { data, error } = await supabase.rpc("get_products_for_pos", params);
        if (error) throw error;
        const validatedData = await validateRPCArrayResponse(
          data,
          getProductsForPosResponseSchema,
          "get_products_for_pos",
        );
        const mappedData = (validatedData || []).map((item) => ({
          ...item,
          public_image_url: getSupabaseUrl("product-images", item.image_url),
        }));
        if (seq !== serverSearchSeq.current) return; // respuesta obsoleta
        const visible = mappedData
          .filter((p) => isPosProductVisible(p, hideOutOfStock))
          .slice(0, MANUAL_RESULTS_LIMIT);
        setManualResults(visible);
        if (visible.length === 0) {
          toast.error(`"${term}" no coincide con ningún producto de la tienda`);
        } else {
          toast.info(`${visible.length} resultado${visible.length !== 1 ? "s" : ""} — elige de la lista`);
        }
      } catch (err) {
        if (seq === serverSearchSeq.current) {
          console.error("[Express] server search failed:", err);
          toast.error(`La búsqueda de "${term}" falló. Intenta de nuevo.`);
        }
      } finally {
        if (seq === serverSearchSeq.current) setServerSearching(false);
      }
    },
    [storeId, hideOutOfStock],
  );

  // ── Submit (Enter): misma semántica que el carrito ──────────────────────

  // Atajos: Enter = agregar por SKU*/match exacto o cobrar si está vacío.
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = searchQuery.trim();
    if (!raw) {
      // Si no hay query y hay items, abrir confirmación
      if (itemCount > 0) {
        setShowConfirm(true);
      }
      return;
    }

    // SKU prefix mode — idéntico al carrito (POSView.onSubmit / handleScan)
    if (raw.endsWith("*")) {
      const skuQuery = raw.slice(0, -1).trim().toLowerCase();
      if (!skuQuery) {
        toast.error("Escribe un SKU antes del *");
        return;
      }
      const skuMatch = products.find((p) => p.sku?.toLowerCase() === skuQuery);
      if (skuMatch) {
        handleAddProduct(skuMatch);
        setSearchQuery("");
        setManualResults([]);
        return;
      }
      const skuStartsWith = products.find((p) =>
        p.sku?.toLowerCase().startsWith(skuQuery),
      );
      if (skuStartsWith) {
        handleAddProduct(skuStartsWith);
        toast.info(`SKU "${skuQuery}" → ${skuStartsWith.name}`);
        setSearchQuery("");
        setManualResults([]);
        return;
      }
      toast.error(`No se encontró producto con SKU "${skuQuery}"`);
      return;
    }

    // Match exacto SKU/barcode (case-insensitive) — igual que el carrito
    const q = raw.toLowerCase();
    const skuMatch = products.find((p) => p.sku?.toLowerCase() === q);
    if (skuMatch) {
      handleAddProduct(skuMatch);
      setSearchQuery("");
      setManualResults([]);
      return;
    }
    const barcodeMatch = products.find((p) => p.barcode?.toLowerCase() === q);
    if (barcodeMatch) {
      handleAddProduct(barcodeMatch);
      setSearchQuery("");
      setManualResults([]);
      return;
    }

    // Coincidencia parcial — MISMO criterio que el carrito
    // (usePOSServerSearch/POSAutocomplete: name/SKU/código de barras includes).
    // Antes Express solo aceptaba nombre y descartaba SKU/barcode parciales
    // (causa raíz del reporte «el producto no aparece en Express»).
    const localMatches = products.filter((p) => {
      const name = p.name.toLowerCase();
      const sku = (p.sku || "").toLowerCase();
      const barcode = (p.barcode || "").toLowerCase();
      return name.includes(q) || sku.includes(q) || barcode.includes(q);
    });
    if (localMatches.length === 1) {
      handleAddProduct(localMatches[0]);
      setSearchQuery("");
      setManualResults([]);
      return;
    }
    if (localMatches.length > 1) {
      const visible = localMatches
        .filter((p) => isPosProductVisible(p, hideOutOfStock))
        .slice(0, MANUAL_RESULTS_LIMIT);
      setManualResults(visible);
      toast.info(
        `${localMatches.length} coincidencias de "${raw}" — elige de la lista`,
      );
      return;
    }

    // Sin coincidencias locales: respaldo server-side (catálogos grandes y
    // código de barras canónico del maestro). Limpio resultados viejos antes.
    setManualResults([]);
    void runServerSearch(raw);
  };

  // Limpiar resultados manuales al cambiar el texto (sin resultados antiguos).
  // serverSearchSeq++ invalida cualquier búsqueda server-side en vuelo: sus
  // respuestas se descartan y no pueden pintar resultados obsoletos.
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (manualResults.length > 0) setManualResults([]);
    if (serverSearching) {
      serverSearchSeq.current += 1;
      setServerSearching(false);
    }
  };

  // Atajo F9 / Ctrl+Enter = cobrar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F9" || ((e.ctrlKey || e.metaKey) && e.key === "Enter")) {
        e.preventDefault();
        if (itemCount > 0) setShowConfirm(true);
      } else if (e.key === "Escape" && showConfirm) {
        setShowConfirm(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [itemCount, showConfirm]);

  const handleConfirmSale = async () => {
    setShowConfirm(false);
    await startCheckout(selectedPayment, null);
  };

  // ── Render: vista de éxito (compartida con el carrito) ──────────────────

  // MISIÓN VENDER-EXPRESS: tras confirmar la venta, el carrito muestra
  // POSCartSuccessView; Express muestra LA MISMA vista con el mismo hook de
  // exportaciones (PDF/WhatsApp/imagen/térmico). Sin reglas nuevas.
  if (lastSale) {
    if (typeof window === "undefined") return null; // SSR guard
    return createPortal(
      <div className="fixed inset-0 z-[45] bg-background flex flex-col overflow-hidden">
        <header className="flex items-center justify-between p-4 border-b border-border bg-card shrink-0">
          <button
            type="button"
            onClick={onExit}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-xs font-black uppercase tracking-widest border border-primary/20 active:scale-95"
            aria-label="Salir del modo Express"
          >
            <ArrowLeft className="w-4 h-4" />
            Salir
          </button>
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            <h1 className="text-base sm:text-lg font-black uppercase tracking-widest text-foreground">
              Cajero Express
            </h1>
          </div>
          <div className="w-20" />
        </header>
        <POSCartSuccessView
          onGeneratePDF={generatePDF}
          onShareWhatsApp={shareWhatsApp}
          onExportAsImage={exportAsImage}
          onPrint={printReceipt}
          onClearLastSale={onClearLastSale}
          lastSale={lastSale}
        />
      </div>,
      document.body,
    );
  }

  // ── Render: modo Express ────────────────────────────────────────────────

  // Audit-Fix: usar createPortal para escapar del stacking context del motion.div
  // padre en TerminalShell. MISIÓN VENDER-EXPRESS: z-[45] — cubre el sidebar
  // (z-40) pero deja VISIBLES los diálogos Radix reutilizados del carrito
  // (POSCartItemEditModal / PriceSelectorModal — z-50) y a POSPortalModal
  // (z-[10000]). El z-[9999] anterior tapaba los modales Radix.
  if (typeof window === 'undefined') return null; // SSR guard
  return createPortal(
    <div className="fixed inset-0 z-[45] bg-background flex flex-col">
      {/* ── HEADER ── */}
      <header className="flex items-center justify-between p-4 border-b border-border bg-card shrink-0">
        <button
          type="button"
          onClick={onExit}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-xs font-black uppercase tracking-widest border border-primary/20 active:scale-95"
          aria-label="Salir del modo Express"
        >
          <ArrowLeft className="w-4 h-4" />
          Salir
        </button>
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          <h1 className="text-base sm:text-lg font-black uppercase tracking-widest text-foreground">
            Cajero Express
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hidden sm:inline">
            Método
          </span>
          <PaymentMethodSelector
            value={selectedPayment}
            onChange={setSelectedPayment}
            variant="compact"
          />
        </div>
      </header>

      {/* ── SEARCH GIGANTE (con resultados en vivo, como el carrito) ── */}
      <div className="p-4 sm:p-6 border-b border-border shrink-0">
        <form onSubmit={handleSearchSubmit} className="max-w-3xl mx-auto">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-muted-foreground pointer-events-none" />
            <input
              ref={searchInputRef}
              id="pos-express-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Escanea o escribe nombre, SKU o código de barras..."
              className="w-full pl-14 pr-4 py-4 sm:py-5 text-lg sm:text-xl font-bold rounded-2xl border-2 border-border bg-card focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none shadow-md"
              aria-label="Búsqueda Express"
              aria-controls="pos-express-results"
              aria-busy={serverSearching}
              autoComplete="off"
            />
          </div>
          {/* POS-3b EM-7: autocompletado EN VIVO — el MISMO componente del
              carrito (POSAutocomplete): sugerencias por nombre/SKU/código con
              imagen, precio, badges de stock y navegación por teclado. */}
          <POSAutocomplete
            products={products}
            query={searchQuery}
            inputId="pos-express-search-input"
            onSelectProduct={(p) => {
              handleAddProduct(p);
              setSearchQuery("");
              setManualResults([]);
            }}
            hideOutOfStock={hideOutOfStock}
          />
          <div className="flex items-center justify-center gap-3 mt-2">
            <p className="text-[10px] text-muted-foreground text-center uppercase tracking-widest">
              Enter = agregar · F9 = cobrar · Esc = cancelar
            </p>
            {/* MISIÓN VENDER-EXPRESS: el MISMO toggle «Solo con stock» del
                carrito (estado compartido vía props de POSView). */}
            {onHideOutOfStockChange && (
              <button
                type="button"
                onClick={() => onHideOutOfStockChange(!hideOutOfStock)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all active:scale-95",
                  hideOutOfStock
                    ? "bg-success/10 text-success border-success/30"
                    : "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
                )}
                title={hideOutOfStock
                  ? "Productos agotados ocultos (igual que el carrito). Clic para mostrar todos."
                  : "Mostrando todos los productos incluyendo agotados."}
                aria-label="Alternar visibilidad de productos agotados"
              >
                {hideOutOfStock ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                {hideOutOfStock ? "Solo con stock" : "Ver todo"}
              </button>
            )}
          </div>
        </form>

        {/* ── Resultados manuales (nombre ambiguo / búsqueda server-side) ── */}
        {manualResults.length > 0 && (
          <div
            id="pos-express-results"
            role="listbox"
            aria-label="Resultados de búsqueda Express"
            className="max-w-3xl mx-auto mt-4 rounded-2xl border-2 border-border bg-card overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                {manualResults.length} resultado{manualResults.length !== 1 ? "s" : ""}
              </span>
              <button
                type="button"
                onClick={() => setManualResults([])}
                className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground"
                aria-label="Limpiar resultados"
              >
                Cerrar
              </button>
            </div>
            <div className="max-h-[38vh] overflow-y-auto">
              {manualResults.map((product) => {
                const stock = product.stock_current ?? 0;
                const stockOut = !product.is_service && stock <= 0;
                return (
                  <button
                    key={product.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => {
                      handleAddProduct(product);
                      setSearchQuery("");
                      setManualResults([]);
                    }}
                    className={cn(
                      "w-full px-3 py-2.5 flex items-center gap-3 text-left border-b border-border/50 last:border-0 transition-colors hover:bg-primary/5",
                      stockOut && "opacity-60",
                    )}
                  >
                    <div className="w-11 h-11 rounded-lg overflow-hidden bg-muted/30 shrink-0">
                      <ProductImage
                        src={product.image_url || undefined}
                        name={product.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{product.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {product.sku && (
                          <span className="text-[10px] text-muted-foreground font-mono">SKU: {product.sku}</span>
                        )}
                        {stockOut ? (
                          <span className="text-[9px] font-bold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
                            Sin stock
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            Stock: {stock}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-black text-primary tabular-nums">
                        {formatCurrency(product.price || 0)}
                      </p>
                      <Plus className="w-4 h-4 text-primary ml-auto mt-1" aria-hidden="true" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {serverSearching && (
          <p
            role="status"
            aria-live="polite"
            className="max-w-3xl mx-auto mt-3 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground"
          >
            Buscando en el catálogo de la tienda...
          </p>
        )}
      </div>

      {/* ── BODY: dos columnas (favoritos + carrito) ── */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Favoritos / frecuentes */}
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
          <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">
            ⭐ Frecuentes del turno
          </h2>
          {frequentProducts && frequentProducts.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {frequentProducts.slice(0, 12).map((fp) => {
                const stock = fp.product.stock_current ?? 0;
                const stockOut = !fp.product.is_service && stock <= 0;
                return (
                  <button
                    key={fp.product.id}
                    type="button"
                    onClick={() => handleAddProduct(fp.product)}
                    className="p-3 rounded-xl border-2 border-border bg-card hover:border-primary hover:bg-primary/5 transition-all text-left group active:scale-95"
                    aria-label={`Agregar ${fp.product.name}`}
                  >
                    <div className="aspect-square w-full rounded-lg overflow-hidden bg-muted mb-2">
                      <ProductImage
                        src={fp.product.image_url || undefined}
                        name={fp.product.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <p className="text-xs font-bold text-foreground line-clamp-2 leading-tight">
                      {fp.product.name}
                    </p>
                    {fp.product.sku && (
                      <p className="text-[9px] text-muted-foreground font-mono mt-0.5 truncate">
                        {fp.product.sku}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-1 gap-1">
                      <p className="text-sm font-black text-primary tabular-nums">
                        {formatCurrency(fp.product.price || 0)}
                      </p>
                      {stockOut && (
                        <span className="text-[8px] font-bold text-destructive bg-destructive/10 px-1 py-0.5 rounded shrink-0">
                          Sin stock
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm font-bold uppercase tracking-widest">
                Sin frecuentes aún
              </p>
              <p className="text-xs mt-1">
                Los productos más vendidos del turno aparecerán aquí.
              </p>
            </div>
          )}
        </div>

        {/* Carrito lateral derecho */}
        <aside className="lg:w-[380px] xl:w-[420px] border-t lg:border-t-0 lg:border-l border-border bg-card flex flex-col">
          <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
            <h2 className="text-sm font-black uppercase tracking-widest text-foreground flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" />
              Carrito
              {itemCount > 0 && (
                <span className="bg-primary text-primary-foreground px-2 py-0.5 rounded-full text-[10px] tabular-nums">
                  {itemCount}
                </span>
              )}
            </h2>
            <div className="flex items-center gap-1">
              {/* MISIÓN VENDER-EXPRESS: descuento global con el MISMO modal del
                  carrito (POSCartDiscountModal — gate de supervisor ≥15%). */}
              {itemCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowDiscount((v) => !v)}
                  className={cn(
                    "px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-colors",
                    discount
                      ? "bg-primary/10 text-primary border-primary/30"
                      : "text-muted-foreground border-border hover:bg-muted",
                  )}
                  aria-expanded={showDiscount}
                  aria-label="Descuento de la venta"
                >
                  Descuento{discount ? `: -${formatCurrency(discountAmount)}` : ""}
                </button>
              )}
              {itemCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    clearCart();
                    toast.success("Carrito vaciado");
                  }}
                  className="text-destructive hover:bg-destructive/10 p-1.5 rounded-lg transition-colors"
                  aria-label="Vaciar carrito"
                  title="Vaciar carrito"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* MISIÓN VENDER-EXPRESS: descuento global — MISMO componente del
              carrito (mismas reglas, mismo gate de supervisor). */}
          {showDiscount && itemCount > 0 && (
            <div className="p-3 border-b border-border">
              <POSCartDiscountModal
                discount={discount}
                setDiscount={setDiscount}
                getTotal={getTotal}
              />
            </div>
          )}

          {/* Items scroll */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-8">
                <ShoppingCart className="w-12 h-12 opacity-20 mb-3" />
                <p className="text-xs font-bold uppercase tracking-widest">Vacío</p>
                <p className="text-[10px] mt-1">Escanea o busca para agregar</p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {items.map((item) => {
                  const stock = item.product?.stock_current ?? 0;
                  const isService = item.product?.is_service === true;
                  const stockOut = !isService && stock <= 0;
                  return (
                    <motion.div
                      key={`${item.product_id}-${item.variant_id}`}
                      layout
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="flex items-center gap-2 p-2 rounded-lg border border-border bg-background"
                    >
                      <button
                        type="button"
                        onClick={() => setEditingItem(item)}
                        className="flex-1 min-w-0 text-left group"
                        aria-label={`Editar ${item.product?.name || "producto"}`}
                        title="Editar cantidad, precio o descuento (mismo editor del carrito)"
                      >
                        <p className="text-sm font-bold text-foreground truncate">
                          {item.product?.name || "Producto"}
                        </p>
                        <p className="text-[10px] text-muted-foreground font-mono truncate">
                          {item.product?.sku ? `SKU: ${item.product.sku}` : ""}
                          {item.variant ? ` · ${item.variant.name}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {formatCurrency(item.price)} c/u
                          {item.discount_type && item.discount_value > 0
                            ? ` · −${item.discount_type === "percentage" ? `${item.discount_value}%` : formatCurrency(item.discount_value)}`
                            : ""}
                        </p>
                        {stockOut && (
                          <span className="text-[8px] font-bold text-destructive bg-destructive/10 px-1 py-0.5 rounded">
                            Sin stock
                          </span>
                        )}
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            updateQuantity(item.product_id, item.variant_id, item.quantity - 1)
                          }
                          className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg border border-border hover:bg-muted flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary/30"
                          aria-label="Reducir cantidad"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingItem(item)}
                          className="w-12 text-center font-black tabular-nums hover:bg-muted rounded-lg py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
                          aria-label="Editar cantidad decimal"
                          title="Editar cantidad (admite decimales, precio y descuento)"
                        >
                          {item.quantity}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateQuantity(item.product_id, item.variant_id, item.quantity + 1)
                          }
                          className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg border border-border hover:bg-muted flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary/30"
                          aria-label="Aumentar cantidad"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(item.product_id, item.variant_id)}
                        className="text-destructive hover:bg-destructive/10 p-1.5 rounded-lg transition-colors shrink-0"
                        aria-label="Quitar"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>

          {/* TOTAL + COBRAR */}
          <div className="p-4 border-t border-border bg-card shrink-0 space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                Total
              </span>
              <span className="text-[clamp(2rem,8vw,3rem)] font-black text-primary tabular-nums leading-none">
                {formatCurrency(total)}
              </span>
            </div>
            {(discountAmount > 0 || subtotal !== total) && (
              <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase tracking-widest">
                <span>Subtotal {formatCurrency(subtotal)}</span>
                {discountAmount > 0 && <span>Descuento −{formatCurrency(discountAmount)}</span>}
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowConfirm(true)}
              disabled={itemCount === 0 || isProcessingSale}
              className="w-full h-16 rounded-2xl bg-primary text-primary-foreground font-black text-base uppercase tracking-widest shadow-xl shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
              aria-label="Cobrar venta"
            >
              <Check className="w-6 h-6" />
              Cobrar
              {total > 0 && (
                <span className="bg-primary-foreground/20 px-2 py-1 rounded-md text-sm tabular-nums">
                  {formatCurrency(total)}
                </span>
              )}
            </button>
          </div>
        </aside>
      </div>

      {/* POS-3b audit P0.3: Modal accesible con focus trap + role=dialog */}
      <POSPortalModal
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        title="Confirmar Venta"
      >
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-3xl font-black text-primary tabular-nums">
              {formatCurrency(total)}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              {itemCount} {itemCount === 1 ? "producto" : "productos"} ·{" "}
              <strong className="text-foreground uppercase">
                {selectedPayment}
              </strong>
            </p>
            {discountAmount > 0 && (
              <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-widest">
                Subtotal {formatCurrency(subtotal)} · Descuento −{formatCurrency(discountAmount)}
              </p>
            )}
          </div>
          {/* MISIÓN FECHA OPERATIVA: fecha económica editable también en Express
              (misma del carrito). El servidor revalida al confirmar. */}
          <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
            <POSOperationDateSection inputId="pos-date-express" />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              className="flex-1 h-12 rounded-xl border border-border text-xs font-black uppercase tracking-widest hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmSale}
              disabled={isProcessingSale || !saleDateValidation.valid}
              title={!saleDateValidation.valid ? saleDateValidation.error : undefined}
              className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {isProcessingSale ? "Procesando..." : "Confirmar"}
            </button>
          </div>
        </div>
      </POSPortalModal>

      {/* MISIÓN VENDER-EXPRESS: selección de variante — el MISMO modal del
          carrito (PriceSelectorModal). La alta delega en handleAddItem. */}
      <PriceSelectorModal
        isOpen={!!variantProduct}
        onClose={() => setVariantProduct(null)}
        product={variantProduct}
        onSelect={handleVariantSelected}
      />

      {/* MISIÓN VENDER-EXPRESS: edición de línea — el MISMO modal del carrito
          (cantidad decimal 4dp, precio de operación con gate de supervisor,
          descuento por línea, cambio de unidad). Cero reglas duplicadas.
          Montaje condicional: el modal exige item definido en su render. */}
      {editingItem && (
        <POSCartItemEditModal
          item={editingItem}
          open
          isValeMode={false}
          onClose={() => setEditingItem(null)}
        />
      )}

      {/* Audit-Fix: botón flotante de cerrar (X) en esquina superior derecha.
          Visible siempre, incluso si el header scrolla fuera de vista. */}
      <button
        type="button"
        onClick={onExit}
        className="fixed top-4 right-4 z-[10000] w-12 h-12 rounded-full bg-destructive text-destructive-foreground shadow-2xl hover:bg-destructive/90 transition-all active:scale-90 flex items-center justify-center border-2 border-background"
        aria-label="Cerrar modo Express"
        title="Cerrar modo Express"
      >
        <X className="w-5 h-5" />
      </button>
    </div>,
    document.body
  );
}
