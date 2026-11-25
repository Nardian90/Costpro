"use client";

/**
 * POS-3b EM-1: Modo Cajero Express.
 *
 * MISIÓN VENDER-EXPRESS (2026-10-30) — paridad funcional con el carrito:
 * El carrito habitual (POSView) es la referencia funcional y técnica. Express
 * reutiliza SUS mismos servicios y reglas en lugar de duplicar lógica:
 *
 *  · Búsqueda en vivo: superficie de resultados única en línea (mismo
 *    criterio de coincidencia nombre/SKU/código y el MISMO predicado de
 *    visibilidad que el carrito).
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
 * CP-POS-REDESIGN-PER-ITEM-PAYMENTS-001 (2026-11-25) — rediseño integral:
 *  · LAYOUT: grid `auto + 1fr` con el carrito como COLUMNA DERECHA DE ALTURA
 *    COMPLETA (row-span-2) desde md — el carrito ya no vive en el remanente
 *    vertical de la búsqueda (causa raíz del «carrito comprimido abajo-derecha»:
 *    la reserva fija `max-h-[34vh]/[38vh]` + header consumían 55-70% del
 *    viewport y el aside compartía el resto con Frecuentes). La búsqueda y el
 *    catálogo scrollean de forma independiente en la columna izquierda.
 *  · LÍNEAS DEL CARRITO: imagen, nombre, SKU/variante/unidad, cantidad ±,
 *    precio, IMPORTE de línea y DISTRIBUCIÓN DE PAGO asignada (chips) con
 *    acción «Configurar pago» → POSExpressPaymentModal (MISMO editor de filas
 *    de pago del carrito clásico, extraído a PaymentRowsEditor).
 *  · PAGOS POR PRODUCTO: se ELIMINA la limitación del método global — el
 *    método de la venta se DERIVA de las distribuciones reales de las líneas
 *    (deriveCartPaymentMethod, el mismo contrato del panel clásico).
 *  · RESUMEN CONSOLIDADO: totales por método y moneda desde
 *    getConsolidatedPayments() + pendiente de asignar, con desglose por
 *    producto (qué líneas componen cada importe).
 *  · PESTAÑA «DATOS DE TRANSFERENCIA»: condicional (solo si alguna
 *    distribución incluye transferencia) en el modal de cobro — nombre del
 *    cliente, carné de identidad y UN número de operación POR fila de
 *    transferencia (cada pago conserva SU referencia; nunca una global) +
 *    notas de la venta (campo existente saleNotes). Sin transferencia la
 *    pestaña no existe y NO se exigen datos personales.
 *  · MÓVIL (<md): barra inferior fija con total + Cobrar + acceso evidente al
 *    carrito (panel a pantalla completa); tablet con dos columnas desde md.
 *
 * Layout full-screen (z-[45]: por ENCIMA del sidebar global (z-40) y por
 * DEBAJO de los diálogos Radix reutilizados (z-50) y de POSPortalModal
 * (z-[10000])). Objetivo: venta simple en <6 segundos, con las reglas del
 * carrito.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  PackageSearch,
  CreditCard,
  ClipboardList,
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
// CP-POS-REDESIGN-PER-ITEM-PAYMENTS-001: etiqueta canónica del método derivado.
import { getPaymentLabel } from "./PaymentMethodSelector";
// CP-POS-REDESIGN-PER-ITEM-PAYMENTS-001 (FASE 2): método derivado de las
// distribuciones reales por línea (mismo contrato que el panel clásico).
import { deriveCartPaymentMethod } from "@/lib/pos/derive-payment-method";
import { isExteriorMethod } from "@/lib/payments/methods";
// CP-UX-NAVIGATION-POS-REPAIR-001: POSAutocomplete retirado de Express —
// la superficie de resultados es única, en línea debajo del buscador.
import PriceSelectorModal from "./PriceSelectorModal";
import { POSCartItemEditModal } from "./POSCartItemEditModal";
import { POSCartDiscountModal } from "./POSCartDiscountModal";
import { POSCartSuccessView } from "./POSCartSuccessView";
import { usePOSCartExports } from "./usePOSCartExports";
import type { LastSale } from "./POSCart.types";
import { POSExpressPaymentModal } from "./POSExpressPaymentModal";

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
  /**
   * CP-UX-NAVIGATION-POS-REPAIR-001 (2026-11-24): estados diferenciados del
   * catálogo (§3.3 de la misión). La vista Vende ya posee la carga (useProducts
   * → RPC get_products_for_pos): Express NO repite consultas — solo recibe el
   * estado y un reintento para no crear consultas redundantes.
   */
  productsLoading?: boolean;
  productsError?: string | null;
  onRetryProducts?: () => void;
}

/** Máximo de resultados en la lista de coincidencias (en vivo / servidor). */
const MANUAL_RESULTS_LIMIT = 24;
/** CP-UX-NAVIGATION-POS-REPAIR-001: página inicial del catálogo bajo el buscador. */
const EXPRESS_CATALOG_PAGE = 24;
/** Longitud mínima de la query para filtrado en vivo (evita listas gigantes con 1 char). */
const LIVE_SEARCH_MIN_CHARS = 2;

const METHOD_SHORT_LABEL: Record<string, string> = {
  cash: "Efect.",
  transfer: "Transf.",
  external_transfer: "Ext.",
};

export function POSExpressMode({
  products,
  onExit,
  onAddToCart,
  onAddItemWithVariant,
  lastSale = null,
  onClearLastSale,
  hideOutOfStock = true,
  onHideOutOfStockChange,
  productsLoading = false,
  productsError = null,
  onRetryProducts,
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
  // CP-POS-REDESIGN-PER-ITEM-PAYMENTS-001: pestaña del modal de cobro
  // («resumen» de la venta | «datos» de transferencia — solo con transferencia).
  const [payTab, setPayTab] = useState<'resumen' | 'datos'>('resumen');
  // CP-POS-REDESIGN-PER-ITEM-PAYMENTS-001: nota de la venta (campo existente
  // del proceso de cobro — viaja como saleNotes al RPC transactions.notes).
  const [saleNotes, setSaleNotes] = useState("");
  // CP-POS-REDESIGN-PER-ITEM-PAYMENTS-001: línea con «Configurar pago» abierto.
  // `payingItem` conserva la IDENTIDAD de la línea al abrir (snapshot).
  // FIX CP-POS-SMOKE-PRODUCTION-001 (cert E2E): el modal debe reflejar el
  // estado VIVO de la fila de pago — el snapshot congelaba select/validación/
  // campo de referencia (el cajero no veía lo que seleccionaba y «Agregar
  // Pago» no mostraba la fila nueva). El item renderizado se resuelve del
  // store con suscripción reactiva: cada cambio (método/moneda/importe/
  // referencia/filas) re-renderiza el modal con los valores reales.
  const [payingItem, setPayingItem] = useState<CartItem | null>(null);
  const livePayingItem = useCartStore((s) =>
    payingItem
      ? s.items.find(
          (i) =>
            i.product_id === payingItem.product_id
            && (i.variant_id ?? null) === (payingItem.variant_id ?? null),
        ) ?? null
      : null,
  );
  // CP-POS-REDESIGN-PER-ITEM-PAYMENTS-001: carrito a pantalla completa en móvil.
  const [cartOpenMobile, setCartOpenMobile] = useState(false);
  // CP-POS-REDESIGN-PER-ITEM-PAYMENTS-001: resumen de pagos desplegable.
  const [showPaySummary, setShowPaySummary] = useState(false);
  // CP-UX-NAVIGATION-POS-REPAIR-001 (2026-11-24): la lista de resultados ahora
  // es DERIVADA (useMemo) — se muestra en vivo mientras se escribe, sin exigir
  // Enter ni depender de un dropdown overlay que se cerraba con un clic fuera.
  // El estado manualResults SOLO conserva el respaldo server-side (búsqueda
  // RPC con 0 coincidencias locales: catálogos grandes / código de barras
  // canónico del maestro).
  const [serverResults, setServerResults] = useState<Product[]>([]);
  const [serverSearching, setServerSearching] = useState(false);
  const [variantProduct, setVariantProduct] = useState<Product | null>(null);
  const [editingItem, setEditingItem] = useState<CartItem | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Guarda la última consulta enviada al servidor para descartar respuestas obsoletas.
  const serverSearchSeq = useRef(0);
  // CP-UX-NAVIGATION-POS-REPAIR-001: paginación del catálogo inicial («Ver más»).
  const [catalogLimit, setCatalogLimit] = useState(EXPRESS_CATALOG_PAGE);
  // CP-POS-REDESIGN-PER-ITEM-PAYMENTS-001 (§1.3): el producto recién agregado
  // debe quedar VISIBLE sin desplazamientos — auto-scroll al final de la lista
  // solo cuando el NÚMERO DE LÍNEAS crece (no en cada re-render de importes).
  const itemsEndRef = useRef<HTMLDivElement | null>(null);
  const prevLineCountRef = useRef(0);

  // Audit-Fix: liberar área de trabajo al entrar al modo Express y restaurar al salir.
  // CP-SIDEBAR-RESTORATION-001: en desktop el menú JAMÁS se oculta (dos estados)
  // — Express lo CONTRAE a rail (sigue visible y accesible). En móvil cierra el
  // drawer temporal como siempre.
  useEffect(() => {
    const previousSidebarState = useUIStore.getState().sidebarState;
    const isMobileViewport = typeof window !== 'undefined' && window.innerWidth < 768;
    setSidebarState(isMobileViewport ? 'closed' : 'rail');
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
    discount,
    setDiscount,
    getConsolidatedPayments,
    setCustomer,
    setCustomerCi,
    customerName,
    customerCi,
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
      discount: s.discount,
      setDiscount: s.setDiscount,
      getConsolidatedPayments: s.getConsolidatedPayments,
      setCustomer: s.setCustomer,
      setCustomerCi: s.setCustomerCi,
      customerName: s.customerName,
      customerCi: s.customerCi,
    })),
  );

  const {
    startCheckout, isProcessingSale,
    // CP-UX-NAVIGATION-POS-REPAIR-001 (2026-11-24): Express posee su PROPIA
    // instancia de usePOSCheckout (useState local). El éxito de una venta
    // cobrada EN Express vive en esta instancia — el prop `lastSale` solo
    // cubre la venta cobrada en el carrito antes de entrar a Express.
    // Antes la vista de éxito jamás aparecía tras cobrar aquí (prop siempre
    // null): el effectiveLastSale unifica ambas vías sin cambiar el hook.
    lastSale: expressOwnLastSale,
    setLastSale: setExpressOwnLastSale,
  } = usePOSCheckout();
  // MISIÓN FECHA OPERATIVA: mismo estado del carrito que el flujo normal;
  // el modal de confirmación muestra el selector y gatea el cobro.
  const { validation: saleDateValidation } = usePosSaleDate();

  // MISIÓN VENDER-EXPRESS: exportaciones del comprobante (mismo hook del carrito).
  const effectiveLastSale = expressOwnLastSale ?? lastSale;
  const { generatePDF, shareWhatsApp, exportAsImage, printReceipt } = usePOSCartExports({ lastSale: effectiveLastSale });

  /** «Nueva venta»: limpia AMBAS instancias (la propia de Express y la del carrito). */
  const handleExpressClearLastSale = useCallback(() => {
    setExpressOwnLastSale(null);
    onClearLastSale?.();
  }, [setExpressOwnLastSale, onClearLastSale]);

  const total = getTotal();
  const subtotal = getSubtotal();
  const discountAmount = getDiscountAmount();
  const itemCount = getItemCount();

  // ── CP-POS-REDESIGN-PER-ITEM-PAYMENTS-001: pagos por producto ────────────

  /** Método de la venta DERIVADO de las distribuciones reales de las líneas. */
  const derivedPaymentMethod = useMemo(
    () => deriveCartPaymentMethod(items),
    [items],
  );

  /** Filas de transferencia con importe > 0 (por línea) — activan la pestaña. */
  const transferRows = useMemo(() => {
    const out: Array<{ item: CartItem; rowId: string; method: 'transfer' | 'external_transfer'; amount: number; currency: string }> = [];
    for (const item of items) {
      for (const p of item.payments || []) {
        if ((p.method === 'transfer' || isExteriorMethod(p.method)) && (p.amount || 0) > 0) {
          out.push({
            item,
            rowId: p.id,
            method: p.method === 'transfer' ? 'transfer' : 'external_transfer',
            amount: p.amount,
            currency: p.currency || 'CUP',
          });
        }
      }
    }
    return out;
  }, [items]);

  /** ¿La venta incluye al menos una distribución por transferencia? */
  const hasTransfer = transferRows.length > 0;

  /** Datos de transferencia completos (cliente + CI + referencia por fila). */
  const transferDataOk = useMemo(() => {
    if (!hasTransfer) return true;
    if (!(customerName || '').trim()) return false;
    if (!(customerCi || '').trim()) return false;
    return transferRows.every(({ item, rowId }) => {
      const row = (item.payments || []).find(p => p.id === rowId);
      return !!(row?.reference || '').trim();
    });
  }, [hasTransfer, customerName, customerCi, transferRows]);

  /**
   * Resumen consolidado de la venta (misión §2.4) — SOLO agregaciones de los
   * getters existentes del store (cero aritmética monetaria nueva):
   *  · por método y moneda: getConsolidatedPayments()
   *  · asignado en CUP: Σ getItemPaidCup(item)
   *  · pendiente: getExpectedTotalCup() + impuestos − asignado (≥ 0)
   */
  const paymentSummary = useMemo(() => {
    const cartState = useCartStore.getState();
    const consolidated = getConsolidatedPayments();
    const rowsByMethod: Record<'cash' | 'transfer' | 'external_transfer', Array<{ currency: string; amount: number }>> = {
      cash: [], transfer: [], external_transfer: [],
    };
    for (const [currency, buckets] of Object.entries(consolidated)) {
      if (buckets.cash > 0) rowsByMethod.cash.push({ currency, amount: buckets.cash });
      if (buckets.transfer > 0) rowsByMethod.transfer.push({ currency, amount: buckets.transfer });
      if (buckets.zelle > 0) rowsByMethod.external_transfer.push({ currency, amount: buckets.zelle });
    }
    const paidCup = items.reduce((s, i) => s + cartState.getItemPaidCup(i), 0);
    const expectedCup = cartState.getExpectedTotalCup();
    const taxCup = cartState.getTaxAmount();
    const pendingCup = Math.max(0, Math.round((expectedCup + taxCup - paidCup) * 100) / 100);
    return { rowsByMethod, paidCup, pendingCup };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, getConsolidatedPayments]);

  // ── Área dinámica bajo el buscador (CP-UX-NAVIGATION-POS-REPAIR-001) ─────

  const trimmedQuery = searchQuery.trim();
  const normalizedQuery = trimmedQuery.toLowerCase();

  /**
   * Catálogo inicial (§3.2 de la misión): productos de la tienda activa que el
   * cajero puede vender AHORA — mismos datos del RPC get_products_for_pos ya
   * cargados por POSView (cero consultas nuevas) y el MISMO predicado de
   * visibilidad del carrito (isPosProductVisible): con «Solo con stock» activo
   * no aparecen agotados; los servicios conservan su excepción.
   */
  const visibleCatalog = useMemo(
    () => products.filter((p) => isPosProductVisible(p, hideOutOfStock)),
    [products, hideOutOfStock],
  );

  /**
   * Resultados EN VIVO (§3.2): filtrado por nombre/SKU/código de barras con
   * normalización (minúsculas + trim, coincidencia parcial — sin exigir match
   * exacto). null = query demasiado corta para filtrar.
   */
  const liveMatches = useMemo(() => {
    if (normalizedQuery.length < LIVE_SEARCH_MIN_CHARS || normalizedQuery.endsWith("*")) return null;
    return products
      .filter((p) => isPosProductVisible(p, hideOutOfStock))
      .filter((p) => {
        const name = p.name.toLowerCase();
        const sku = (p.sku || "").toLowerCase();
        const barcode = (p.barcode || "").toLowerCase();
        return (
          name.includes(normalizedQuery) ||
          sku.includes(normalizedQuery) ||
          barcode.includes(normalizedQuery)
        );
      });
  }, [products, normalizedQuery, hideOutOfStock]);

  /** Lista mostrada con query activa: en vivo primero; si no, respaldo RPC. */
  const searchResults = useMemo(() => {
    if (liveMatches && liveMatches.length > 0) {
      return liveMatches.slice(0, MANUAL_RESULTS_LIMIT);
    }
    return serverResults;
  }, [liveMatches, serverResults]);

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
        setServerResults(visible);
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
        setServerResults([]);
        return;
      }
      const skuStartsWith = products.find((p) =>
        p.sku?.toLowerCase().startsWith(skuQuery),
      );
      if (skuStartsWith) {
        handleAddProduct(skuStartsWith);
        toast.info(`SKU "${skuQuery}" → ${skuStartsWith.name}`);
        setSearchQuery("");
        setServerResults([]);
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
      setServerResults([]);
      return;
    }
    const barcodeMatch = products.find((p) => p.barcode?.toLowerCase() === q);
    if (barcodeMatch) {
      handleAddProduct(barcodeMatch);
      setSearchQuery("");
      setServerResults([]);
      return;
    }

    // Coincidencia parcial — MISMO criterio que el carrito
    // (usePOSServerSearch/POSAutocomplete: name/SKU/código de barras includes).
    // Antes Express solo aceptaba nombre y descartaba SKU/barcode parciales
    // (causa raíz del reporte «el producto no aparece en Express»).
    // CP-UX-NAVIGATION-POS-REPAIR-001: la lista ya es visible en vivo; Enter
    // añade SOLO cuando el match es inequívoco (1 coincidencia visible).
    const localMatches = products.filter((p) => {
      const name = p.name.toLowerCase();
      const sku = (p.sku || "").toLowerCase();
      const barcode = (p.barcode || "").toLowerCase();
      return name.includes(q) || sku.includes(q) || barcode.includes(q);
    });
    const visibleMatches = localMatches
      .filter((p) => isPosProductVisible(p, hideOutOfStock));
    if (visibleMatches.length === 1) {
      handleAddProduct(visibleMatches[0]);
      setSearchQuery("");
      setServerResults([]);
      return;
    }
    if (visibleMatches.length > 1) {
      toast.info(
        `${visibleMatches.length} coincidencias de "${raw}" — elige de la lista debajo del buscador`,
      );
      return;
    }

    // Sin coincidencias locales: respaldo server-side (catálogos grandes y
    // código de barras canónico del maestro). Limpio resultados viejos antes.
    setServerResults([]);
    void runServerSearch(raw);
  };

  // Limpiar resultados del servidor al cambiar el texto (sin resultados
  // antiguos). serverSearchSeq++ invalida cualquier búsqueda en vuelo: sus
  // respuestas se descartan y no pueden pintar resultados obsoletos.
  // CP-UX-NAVIGATION-POS-REPAIR-001: al borrar el texto, la lista derivada
  // vuelve automáticamente al catálogo inicial (§3.2 de la misión).
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (serverResults.length > 0) setServerResults([]);
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

  // CP-POS-REDESIGN-PER-ITEM-PAYMENTS-001 (§1.3): auto-scroll a la línea
  // recién agregada (los items se agregan al final del array del store).
  useEffect(() => {
    const lineCount = items.length;
    if (lineCount > prevLineCountRef.current) {
      // Espera al commit del layout (AnimatePresence/motion) antes de scrollear.
      // Guard de método: el temporizador es DIFERIDO y puede disparar después
      // del teardown de un test — jsdom no implementa scrollIntoView y un
      // TypeError en un timer suelto se reporta como error no manejado que
      // falla el job de CI aunque los tests pasen. En el navegador el método
      // siempre existe: el guard no altera el comportamiento real.
      const t = setTimeout(() => {
        const endEl = itemsEndRef.current;
        if (endEl && typeof endEl.scrollIntoView === 'function') {
          endEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 80);
      prevLineCountRef.current = lineCount;
      return () => clearTimeout(t);
    }
    prevLineCountRef.current = lineCount;
  }, [items.length]);

  const handleConfirmSale = async () => {
    // CP-POS-REDESIGN-PER-ITEM-PAYMENTS-001 (FASE 3.3): con transferencia,
    // exigir los datos de la operación ANTES del POST (fail-closed en
    // cliente; el RPC revalida). Sin transferencia no se exige nada personal.
    if (hasTransfer && !transferDataOk) {
      setPayTab('datos');
      toast.error(
        'Completa los datos de transferencia: cliente, carné de identidad y el número de cada operación.',
        { duration: 6000 },
      );
      return;
    }
    setShowConfirm(false);
    setPayTab('resumen');
    // CP-POS-REDESIGN-PER-ITEM-PAYMENTS-001 (FASE 2): método DERIVADO de las
    // distribuciones reales por línea (ya no hay método global que obligue a
    // toda la venta a una sola forma de pago). Las notas de la venta viajan
    // por el mismo camino del carrito (paymentContext.saleNotes → notes).
    await startCheckout(derivedPaymentMethod, null, {
      saleNotes: saleNotes.trim() || null,
    });
  };

  // ── Render: vista de éxito (compartida con el carrito) ──────────────────

  // MISIÓN VENDER-EXPRESS: tras confirmar la venta, el carrito muestra
  // POSCartSuccessView; Express muestra LA MISMA vista con el mismo hook de
  // exportaciones (PDF/WhatsApp/imagen/térmico). Sin reglas nuevas.
  if (effectiveLastSale) {
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
          onClearLastSale={handleExpressClearLastSale}
          lastSale={effectiveLastSale}
        />
      </div>,
      document.body,
    );
  }

  // ── Chips de distribución de pago de UNA línea (§1.3.7) ─────────────────
  // Agregación SOLO para presentación (misma clave método|moneda que
  // getConsolidatedPayments): dos filas cash CUP se muestran como una chip
  // con la suma. Sin aritmética nueva: sumas de presentación.

  const renderPaymentChips = (item: CartItem): React.ReactNode => {
    const rows = (item.payments || []).filter((p) => (p.amount || 0) > 0);
    if (rows.length === 0) {
      return (
        <span className="text-[9px] font-bold text-amber-500 uppercase tracking-wider">
          Sin pago asignado
        </span>
      );
    }
    const acc = new Map<string, number>();
    for (const p of rows) {
      const m = isExteriorMethod(p.method) ? 'external_transfer' : p.method;
      const key = `${m}|${p.currency || 'CUP'}`;
      acc.set(key, Math.round(((acc.get(key) || 0) + p.amount) * 100) / 100);
    }
    return [...acc.entries()].map(([key, amt]) => {
      const [m, cur] = key.split('|');
      return (
        <span
          key={key}
          className="inline-flex items-center rounded px-1 py-0.5 bg-background border border-border/40 text-[9px] font-bold tabular-nums text-foreground"
        >
          <span className="text-muted-foreground mr-0.5">{METHOD_SHORT_LABEL[m] || m}</span>
          {formatCurrency(amt)} {cur}
        </span>
      );
    });
  };

  // ── Render: modo Express ────────────────────────────────────────────────

  // Audit-Fix: usar createPortal para escapar del stacking context del motion.div
  // padre en TerminalShell. MISIÓN VENDER-EXPRESS: z-[45] — cubre el sidebar
  // (z-40) pero deja VISIBLES los diálogos Radix reutilizados del carrito
  // (POSCartItemEditModal / PriceSelectorModal — z-50) y a POSPortalModal
  // (z-[10000]). El z-[9999] anterior tapaba los modales Radix.
  if (typeof window === 'undefined') return null; // SSR guard

  /**
   * Panel de carrito compartido: desktop/tablet = columna derecha de ALTURA
   * COMPLETA (row-span-2 del grid, siempre visible); móvil = panel a pantalla
   * completa UNA SOLA CABECERA (la X de cierre vive en el propio panel vía
   * onCloseMobile — sin cabecera duplicada del overlay). Un solo markup.
   */
  const cartPanel = (mobile: boolean, onCloseMobile?: () => void) => (
    <div
      className={cn(
        "flex flex-col min-h-0 bg-card",
        mobile
          ? "flex-1"
          : "hidden md:flex md:col-start-2 md:row-start-1 md:row-span-2 border-l border-border",
      )}
      data-testid={mobile ? "express-cart-mobile" : "express-cart-desktop"}
    >
      {/* Header del carrito (en móvil es TAMBIÉN la cabecera del overlay) */}
      <div className="p-3 border-b border-border flex items-center justify-between shrink-0">
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
          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="w-11 h-11 mr-1 rounded-xl border border-border hover:bg-muted flex items-center justify-center"
              aria-label="Cerrar carrito"
            >
              <X className="w-5 h-5" />
            </button>
          )}
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

      {/* Líneas del carrito — scroll propio con altura útil garantizada */}
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
                  className={cn(
                    "rounded-xl border p-2 bg-background space-y-1.5",
                    stockOut ? "border-destructive/40" : "border-border",
                  )}
                >
                  {/* Fila 1: imagen + nombre/SKU/unidad + quitar */}
                  <div className="flex items-start gap-2">
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted/30 shrink-0">
                      <ProductImage
                        src={item.product?.image_url || undefined}
                        name={item.product?.name || "Producto"}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingItem(item)}
                      className="flex-1 min-w-0 text-left group"
                      aria-label={`Editar ${item.product?.name || "producto"}`}
                      title="Editar cantidad, precio o descuento (mismo editor del carrito)"
                    >
                      <p className="text-sm font-bold text-foreground truncate leading-tight">
                        {item.product?.name || "Producto"}
                      </p>
                      <p className="text-[10px] text-muted-foreground font-mono truncate">
                        {item.product?.sku ? `SKU: ${item.product.sku}` : ""}
                        {item.variant ? ` · ${item.variant.name}` : ""}
                        {!item.variant && item.product?.unit_of_measure ? ` · ${item.product.unit_of_measure}` : ""}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(item.product_id, item.variant_id)}
                      className="text-destructive hover:bg-destructive/10 p-1.5 rounded-lg transition-colors shrink-0"
                      aria-label="Quitar"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Fila 2: cantidad ± / precio c/u / importe de línea */}
                  <div className="flex items-center justify-between gap-2">
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
                    <div className="text-right min-w-0">
                      <p className="text-sm font-black text-foreground tabular-nums leading-tight">
                        {formatCurrency(item.subtotal)}
                        <span className="text-[9px] text-muted-foreground font-bold ml-1">
                          {item.currency || "CUP"}
                        </span>
                      </p>
                      <p className="text-[9px] text-muted-foreground tabular-nums truncate">
                        {formatCurrency(item.price)} c/u
                        {item.discount_type && item.discount_value > 0
                          ? ` · −${item.discount_type === "percentage" ? `${item.discount_value}%` : formatCurrency(item.discount_value)}`
                          : ""}
                      </p>
                    </div>
                  </div>

                  {/* Fila 3: distribución de pago asignada + Configurar pago */}
                  <button
                    type="button"
                    onClick={() => setPayingItem(item)}
                    className="w-full flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-2 py-1.5 hover:border-primary/40 hover:bg-primary/5 transition-colors text-left"
                    aria-label={`Configurar pago de ${item.product?.name || "producto"}`}
                    data-testid={`express-pay-config-${item.product_id}`}
                  >
                    <span className="flex flex-wrap items-center gap-1 min-w-0">
                      {renderPaymentChips(item)}
                    </span>
                    <span className="text-[9px] font-black uppercase tracking-widest text-primary shrink-0 flex items-center gap-1">
                      <CreditCard className="w-3 h-3" />
                      Configurar pago
                    </span>
                  </button>

                  {stockOut && (
                    <span className="inline-block text-[8px] font-bold text-destructive bg-destructive/10 px-1 py-0.5 rounded">
                      Sin stock
                    </span>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
        {/* Ancla de auto-scroll (§1.3: el recién agregado queda visible) */}
        <div ref={itemsEndRef} aria-hidden="true" />
      </div>

      {/* Resumen consolidado de pagos (§2.4) — agregaciones del store */}
      {itemCount > 0 && (
        <div
          className="px-3 pt-2 pb-1 border-t border-border shrink-0"
          data-testid="express-payment-summary"
        >
          <button
            type="button"
            onClick={() => setShowPaySummary((v) => !v)}
            className="w-full flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
            aria-expanded={showPaySummary}
            aria-label="Resumen de pagos de la venta"
          >
            <span className="flex items-center gap-1">
              <ClipboardList className="w-3 h-3" />
              Resumen de pagos
            </span>
            <span className="flex items-center gap-2">
              {paymentSummary.pendingCup > 0 && (
                <span className="text-amber-500">
                  Pendiente {formatCurrency(paymentSummary.pendingCup)} CUP
                </span>
              )}
              <span>{showPaySummary ? "−" : "+"}</span>
            </span>
          </button>
          {showPaySummary && (
            <div className="mt-1.5 space-y-1">
              {(['cash', 'transfer', 'external_transfer'] as const).map((m) => {
                const entries = paymentSummary.rowsByMethod[m];
                if (!entries || entries.length === 0) return null;
                return (
                  <div key={m} className="flex items-center justify-between text-[10px]">
                    <span className="font-black uppercase tracking-wider text-muted-foreground">
                      {m === 'cash' ? 'Efectivo' : m === 'transfer' ? 'Transferencia' : 'Transf. Exterior'}
                    </span>
                    <span className="font-bold tabular-nums text-foreground">
                      {entries.map((e, i) => (
                        <span key={`${m}-${e.currency}`}>
                          {i > 0 ? ' + ' : ''}{formatCurrency(e.amount)} {e.currency}
                        </span>
                      ))}
                    </span>
                  </div>
                );
              })}
              {/* Desglose por producto: qué líneas componen cada importe */}
              <div className="pt-1 mt-1 border-t border-border/40 space-y-0.5">
                {items.map((i) => {
                  const rows = (i.payments || []).filter((p) => (p.amount || 0) > 0);
                  if (rows.length === 0) return null;
                  return (
                    <div key={`${i.product_id}-${i.variant_id}`} className="flex items-center justify-between gap-2 text-[9px]">
                      <span className="truncate text-muted-foreground">
                        {i.product?.name || "Producto"}
                      </span>
                      <span className="flex items-center gap-1 shrink-0 tabular-nums text-foreground font-bold">
                        {renderPaymentChips(i)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TOTAL + COBRAR */}
      <div className="p-3 border-t border-border bg-card shrink-0 space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">
            Total
          </span>
          <span className="text-[clamp(1.6rem,6vw,2.5rem)] font-black text-primary tabular-nums leading-none">
            {formatCurrency(total)}
          </span>
        </div>
        {(discountAmount > 0 || subtotal !== total) && (
          <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase tracking-widest">
            <span>Subtotal {formatCurrency(subtotal)}</span>
            {discountAmount > 0 && <span>Descuento −{formatCurrency(discountAmount)}</span>}
          </div>
        )}
        {itemCount > 0 && (
          <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>Método</span>
            <span className="font-black text-foreground normal-case tracking-normal text-xs">
              {getPaymentLabel(derivedPaymentMethod)}
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          disabled={itemCount === 0 || isProcessingSale}
          className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-black text-base uppercase tracking-widest shadow-xl shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
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
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[45] bg-background flex flex-col">
      {/* ── HEADER compacto — CP-UX-POLISH-002 (§2.1): zonas exclusivas SIN
          superposición. Fila única: [Salir · título · X]. El selector GLOBAL
          de método de pago se RETIRA (CP-POS-REDESIGN-PER-ITEM-PAYMENTS-001
          §2.1: ninguna selección única obliga a todos los productos a la misma
          forma de pago) — el método se DERIVA por línea y se muestra en el
          carrito y en la confirmación. Durante el POST ambas salidas se
          deshabilitan (§2.4). */}
      <header className="border-b border-border bg-card shrink-0 px-3 sm:px-4 py-2">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onExit}
            disabled={isProcessingSale}
            className="inline-flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-xs font-black uppercase tracking-widest border border-primary/20 active:scale-95 disabled:opacity-50 disabled:pointer-events-none min-h-[44px] shrink-0"
            aria-label="Salir del modo Express"
            title={isProcessingSale ? "Procesando venta… espera a la confirmación" : "Salir del modo Express"}
          >
            <ArrowLeft className="w-4 h-4" />
            Salir
          </button>
          <div className="flex-1 min-w-0 flex items-center justify-center gap-2">
            <Zap className="w-5 h-5 text-primary shrink-0" />
            <h1 className="text-base sm:text-lg font-black uppercase tracking-widest text-foreground truncate">
              Cajero Express
            </h1>
          </div>
          {/* Zona exclusiva del cierre: separada por estructura flex (no por
              coordenadas absolutas). Área táctil 44px (WCAG 2.5.8). */}
          <button
            type="button"
            onClick={onExit}
            disabled={isProcessingSale}
            className="shrink-0 w-11 h-11 rounded-xl bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive hover:text-destructive-foreground transition-all active:scale-95 flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-destructive/50 disabled:opacity-50 disabled:pointer-events-none"
            aria-label="Cerrar modo Express"
            title={isProcessingSale ? "Procesando venta… espera a la confirmación" : "Cerrar modo Express"}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* ── GRID PRINCIPAL (CP-POS-REDESIGN-PER-ITEM-PAYMENTS-001 §1.2):
          fila 1 = buscador compacto (col izquierda), fila 2 = catálogo/
          resultados con scroll PROPIO, columna derecha = CARRITO DE ALTURA
          COMPLETA (row-span-2, siempre visible ≥768px). Sin reservas fijas
          de altura (las max-h-[34vh]/[38vh] eran la causa del carrito
          comprimido): cada columna distribuye el viewport real. */}
      <div className="flex-1 min-h-0 grid grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_340px] lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_460px] 2xl:grid-cols-[minmax(0,1fr)_520px]">
        {/* Fila 1 · col 1: SEARCH compacto (colocación EXPLÍCITA — el
            auto-placement llenaba la fila 1 de izquierda a derecha y
            desplazaba el catálogo a la col 2 y el carrito abajo-izquierda) */}
        <div className="col-start-1 row-start-1 border-b border-border px-3 sm:px-6 pt-3 pb-2 shrink-0">
          <form onSubmit={handleSearchSubmit} className="max-w-3xl mx-auto">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
              <input
                ref={searchInputRef}
                id="pos-express-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Escanea o escribe nombre, SKU o código de barras..."
                className="w-full pl-12 pr-12 py-3 sm:py-3.5 text-base sm:text-lg font-bold rounded-2xl border-2 border-border bg-card focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none shadow-sm"
                aria-label="Búsqueda Express"
                aria-controls="pos-express-results"
                aria-busy={serverSearching}
                autoComplete="off"
              />
              {/* CP-UX-NAVIGATION-POS-REPAIR-001: botón de limpiar búsqueda —
                  al borrar el texto se recupera el catálogo inicial (§3.2). */}
              {searchQuery.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    handleSearchChange("");
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground flex items-center justify-center transition-colors"
                  aria-label="Limpiar búsqueda y volver al catálogo"
                  title="Limpiar búsqueda"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {/* CP-UX-NAVIGATION-POS-REPAIR-001: el dropdown overlay POSAutocomplete
                se RETIRA de Express — la superficie de resultados es ÚNICA y vive
                debajo del buscador (el overlay se cerraba con un clic fuera y
                dejaba la pantalla sin resultados visibles). Mismo criterio de
                coincidencia (nombre/SKU/código) y el MISMO predicado de
                visibilidad que el carrito. */}
            <div className="flex items-center justify-center gap-3 mt-1.5">
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
        </div>

        {/* Fila 2 · col 1: ÁREA DINÁMICA con scroll PROPIO (CP-UX-NAVIGATION-
            POS-REPAIR-001 + §1.2 de la misión actual). Estados diferenciados:
            error / carga / catálogo / resultados / sin coincidencias. SIN
            max-h fijos: la grid asigna el resto real del viewport. */}
        <div
          id="pos-express-results"
          className="col-start-1 row-start-2 min-h-0 overflow-y-auto px-3 sm:px-6 py-3"
        >
          {productsError ? (
            <div
              role="alert"
              className="rounded-2xl border-2 border-destructive/30 bg-destructive/5 p-5 text-center"
            >
              <p className="text-xs font-black uppercase tracking-widest text-destructive">
                Error al recuperar productos
              </p>
              <p className="text-xs text-muted-foreground mt-1 break-words">{productsError}</p>
              {onRetryProducts && (
                <button
                  type="button"
                  onClick={onRetryProducts}
                  className="mt-3 px-5 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-[10px] font-black uppercase tracking-widest hover:bg-destructive/90 transition-colors min-h-[44px]"
                >
                  Reintentar
                </button>
              )}
            </div>
          ) : trimmedQuery.length === 0 ? (
            /* ── SIN TEXTO → CATÁLOGO INICIAL ── */
            productsLoading ? (
              <div
                role="status"
                aria-label="Cargando productos de la tienda"
                className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3"
              >
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="p-3 rounded-xl border border-border bg-card animate-pulse">
                    <div className="aspect-square w-full rounded-lg bg-muted mb-2" />
                    <div className="h-3 bg-muted rounded w-3/4 mb-1.5" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : visibleCatalog.length === 0 ? (
              products.length === 0 ? (
                <ExpressInfoState
                  title="Sin productos en la tienda"
                  hint="Agrega productos en Catálogo o recíbelos en Recepciones para venderlos aquí."
                />
              ) : (
                <ExpressInfoState
                  title="Sin productos con existencias"
                  tone="warn"
                  hint={
                    hideOutOfStock
                      ? "Todos los productos físicos están agotados (o los hay agotados ocultos por «Solo con stock»). Desactiva el filtro para verlos."
                      : "Todos los productos físicos están agotados."
                  }
                />
              )
            ) : (
              <>
                <div className="flex items-center justify-between px-1 py-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Catálogo disponible · {visibleCatalog.length} producto{visibleCatalog.length !== 1 ? "s" : ""}
                  </span>
                  <span className="text-[9px] text-muted-foreground/70 uppercase tracking-wider">
                    clic = agregar
                  </span>
                </div>
                <div className="rounded-2xl border-2 border-border bg-muted/10 p-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                    {visibleCatalog.slice(0, catalogLimit).map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => {
                          handleAddProduct(product);
                          setSearchQuery("");
                          setServerResults([]);
                        }}
                        className="p-3 rounded-xl border-2 border-border bg-card hover:border-primary hover:bg-primary/5 transition-all text-left group active:scale-95"
                        aria-label={`Agregar ${product.name}`}
                      >
                        <div className="aspect-square w-full rounded-lg overflow-hidden bg-muted mb-2">
                          <ProductImage
                            src={product.image_url || undefined}
                            name={product.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <p className="text-xs font-bold text-foreground line-clamp-2 leading-tight">
                          {product.name}
                        </p>
                        {product.sku && (
                          <p className="text-[9px] text-muted-foreground font-mono mt-0.5 truncate">
                            {product.sku}
                          </p>
                        )}
                        <div className="flex items-center justify-between mt-1 gap-1">
                          <p className="text-sm font-black text-primary tabular-nums">
                            {formatCurrency(product.price || 0)}
                          </p>
                          <span className="text-[8px] font-bold text-muted-foreground bg-muted px-1 py-0.5 rounded shrink-0">
                            {product.is_service
                              ? "Servicio"
                              : `Stock: ${product.stock_current ?? 0}`}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                  {catalogLimit < visibleCatalog.length && (
                    <button
                      type="button"
                      onClick={() => setCatalogLimit((l) => l + EXPRESS_CATALOG_PAGE)}
                      className="mt-3 w-full py-2.5 rounded-xl border border-border bg-card text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                    >
                      Ver más ({visibleCatalog.length - catalogLimit} restantes)
                    </button>
                  )}
                </div>
                {/* Frecuentes del turno — integrados al flujo de la columna
                    izquierda (scrollean con el catálogo; el carrito conserva su
                    altura completa sin compartir viewport). */}
                <section className="mt-4" aria-label="Frecuentes del turno">
                  <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">
                    ⭐ Frecuentes del turno
                  </h2>
                  {frequentProducts && frequentProducts.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                      {frequentProducts.slice(0, 8).map((fp) => {
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
                    <p className="text-[10px] text-muted-foreground px-1 py-2">
                      Los productos más vendidos del turno aparecerán aquí.
                    </p>
                  )}
                </section>
              </>
            )
          ) : trimmedQuery.length < LIVE_SEARCH_MIN_CHARS ? (
            /* ── QUERY CORTA (1 carácter) ── */
            <ExpressInfoState
              title={`Escribe al menos ${LIVE_SEARCH_MIN_CHARS} caracteres`}
              hint="O pulsa Enter para añadir por SKU exacto (o SKU* para prefijos)."
            />
          ) : serverSearching ? (
            /* ── BUSCANDO EN EL SERVIDOR (respaldo RPC) ── */
            <p
              role="status"
              aria-live="polite"
              className="text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground py-4"
            >
              Buscando en el catálogo de la tienda...
            </p>
          ) : searchResults.length > 0 ? (
            /* ── RESULTADOS ENCONTRADOS (en vivo / respaldo RPC) ── */
            <div
              role="listbox"
              aria-label="Resultados de búsqueda Express"
              className="rounded-2xl border-2 border-border bg-card overflow-hidden"
            >
              <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  {liveMatches && liveMatches.length > searchResults.length
                    ? `${liveMatches.length} coincidencias — primeras ${searchResults.length}`
                    : `${searchResults.length} resultado${searchResults.length !== 1 ? "s" : ""}`}
                </span>
                <span className="text-[9px] text-muted-foreground/70 uppercase tracking-wider">
                  clic = agregar
                </span>
              </div>
              <div>
                {searchResults.map((product) => {
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
                        setServerResults([]);
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
                              {product.is_service ? "Servicio" : `Stock: ${stock}`}
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
          ) : (
            /* ── SIN COINCIDENCIAS ── */
            <ExpressInfoState
              title={`Sin coincidencias para «${trimmedQuery}»`}
              hint="Prueba con nombre, SKU o código de barras. El filtro «Solo con stock» oculta agotados — pulsa Enter para buscar también en el catálogo de la organización."
            />
          )}
        </div>

        {/* Col 2 · filas 1-2: CARRITO de altura completa (≥md) — §1.2:
            presencia visual suficiente y siempre visible. */}
        {cartPanel(false)}
      </div>

      {/* ── MÓVIL (<md): barra inferior fija — acceso EVIDENTE al carrito y
          al importe pendiente (§1.4), sin tapar el catálogo (pb del grid no
          necesario: la barra es overlay del portal, el scroll del catálogo
          termina sobre ella con padding inferior propio). */}
      <div
        className="md:hidden fixed bottom-0 left-0 right-0 z-[46] border-t border-border bg-card px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]"
        data-testid="express-mobile-bar"
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCartOpenMobile(true)}
            className="relative h-12 px-3 rounded-xl border-2 border-border bg-background flex items-center gap-2 text-xs font-black uppercase tracking-widest text-foreground active:scale-95 transition-all"
            aria-label={`Ver carrito, ${itemCount} productos`}
          >
            <ShoppingCart className="w-4 h-4" />
            <span className="hidden min-[420px]:inline">Carrito</span>
            {itemCount > 0 && (
              <span className="bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full text-[10px] tabular-nums">
                {itemCount}
              </span>
            )}
          </button>
          <div className="flex-1 text-right min-w-0">
            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground leading-none">
              Total
            </p>
            <p className="text-lg font-black text-primary tabular-nums leading-tight truncate">
              {formatCurrency(total)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            disabled={itemCount === 0 || isProcessingSale}
            className="h-12 px-4 rounded-xl bg-primary text-primary-foreground font-black text-xs uppercase tracking-widest disabled:opacity-50 flex items-center gap-2 active:scale-[0.98] transition-all shrink-0"
            aria-label="Cobrar venta"
          >
            <Check className="w-4 h-4" />
            Cobrar
          </button>
        </div>
      </div>

      {/* ── MÓVIL: carrito a pantalla completa (el MISMO panel compartido —
          una sola cabecera: la X de cierre vive dentro del panel). */}
      {cartOpenMobile && (
        <div
          className="md:hidden fixed inset-0 z-[47] bg-background flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label="Carrito de la venta"
        >
          {cartPanel(true, () => setCartOpenMobile(false))}
        </div>
      )}

      {/* POS-3b audit P0.3: Modal accesible con focus trap + role=dialog.
          CP-POS-REDESIGN-PER-ITEM-PAYMENTS-001 (FASE 3): confirmación con
          PESTAÑAS — «Resumen» (venta completa) y «Datos de transferencia»
          (SOLO si alguna distribución incluye transferencia). Cambiar de
          pestaña NO pierde estado: todo vive en el store/componente. */}
      <POSPortalModal
        open={showConfirm}
        onClose={() => { setShowConfirm(false); setPayTab('resumen'); }}
        title="Confirmar Venta"
      >
        <div className="space-y-3">
          {/* Tabs del cobro */}
          <div
            role="tablist"
            aria-label="Pasos del cobro"
            className="flex rounded-xl border border-border p-1 gap-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={payTab === 'resumen'}
              onClick={() => setPayTab('resumen')}
              className={cn(
                "flex-1 h-9 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                payTab === 'resumen'
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              Resumen
            </button>
            {hasTransfer && (
              <button
                type="button"
                role="tab"
                aria-selected={payTab === 'datos'}
                onClick={() => setPayTab('datos')}
                data-testid="tab-datos-transferencia"
                className={cn(
                  "flex-1 h-9 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 flex items-center justify-center gap-1",
                  payTab === 'datos'
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted",
                  hasTransfer && !transferDataOk && payTab !== 'datos' && "text-amber-500",
                )}
              >
                Datos de transferencia
                {hasTransfer && !transferDataOk && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" aria-label="Datos incompletos" />
                )}
              </button>
            )}
          </div>

          {payTab === 'resumen' ? (
            <>
              <div className="text-center">
                <p className="text-3xl font-black text-primary tabular-nums">
                  {formatCurrency(total)}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  {itemCount} {itemCount === 1 ? "producto" : "productos"} ·{" "}
                  <strong className="text-foreground uppercase">
                    {getPaymentLabel(derivedPaymentMethod)}
                  </strong>
                </p>
                {discountAmount > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-widest">
                    Subtotal {formatCurrency(subtotal)} · Descuento −{formatCurrency(discountAmount)}
                  </p>
                )}
                {/* Resumen consolidado por método (§2.4) — misma fuente que el carrito */}
                <div className="mt-2 rounded-xl border border-border/60 bg-muted/10 p-2 text-left" data-testid="express-confirm-summary">
                  {(['cash', 'transfer', 'external_transfer'] as const).map((m) => {
                    const entries = paymentSummary.rowsByMethod[m];
                    if (!entries || entries.length === 0) return null;
                    return (
                      <div key={m} className="flex items-center justify-between text-[10px] py-0.5">
                        <span className="font-black uppercase tracking-wider text-muted-foreground">
                          {m === 'cash' ? 'Efectivo' : m === 'transfer' ? 'Transferencia' : 'Transf. Exterior'}
                        </span>
                        <span className="font-bold tabular-nums text-foreground">
                          {entries.map((e, i) => (
                            <span key={`${m}-${e.currency}`}>
                              {i > 0 ? ' + ' : ''}{formatCurrency(e.amount)} {e.currency}
                            </span>
                          ))}
                        </span>
                      </div>
                    );
                  })}
                  {paymentSummary.pendingCup > 0 && (
                    <div className="flex items-center justify-between text-[10px] py-0.5 border-t border-border/40 mt-1 pt-1">
                      <span className="font-black uppercase tracking-wider text-amber-500">
                        Pendiente de asignar
                      </span>
                      <span className="font-bold tabular-nums text-amber-500">
                        {formatCurrency(paymentSummary.pendingCup)} CUP
                      </span>
                    </div>
                  )}
                  {paymentSummary.pendingCup > 0 && (
                    <p className="text-[9px] text-muted-foreground mt-1">
                      La venta se registrará con incidencia de pago (política vigente).
                    </p>
                  )}
                </div>
              </div>
              {/* MISIÓN FECHA OPERATIVA: fecha económica editable también en Express
                  (misma del carrito). El servidor revalida al confirmar. */}
              <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
                <POSOperationDateSection inputId="pos-date-express" />
              </div>
              {/* Notas de la venta — campo EXISTENTE del proceso de cobro
                  (saleNotes → transactions.notes). Conservado y ampliado a Express. */}
              <div>
                <label
                  htmlFor="pos-express-sale-notes"
                  className="text-[10px] font-black uppercase tracking-widest text-muted-foreground"
                >
                  Notas de la venta
                </label>
                <textarea
                  id="pos-express-sale-notes"
                  value={saleNotes}
                  onChange={(e) => setSaleNotes(e.target.value.slice(0, 1000))}
                  rows={2}
                  maxLength={1000}
                  placeholder="Observaciones de la operación (opcional)"
                  className="w-full mt-1 rounded-xl border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  aria-label="Notas de la venta"
                />
                <p className="text-[9px] text-muted-foreground text-right mt-0.5">
                  {saleNotes.length}/1000 · Se guarda con la venta
                </p>
              </div>
              {hasTransfer && !transferDataOk && (
                <p className="text-[10px] font-bold text-amber-500" role="alert">
                  La venta incluye transferencia: completa la pestaña «Datos de transferencia»
                  antes de confirmar.
                </p>
              )}
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
                  {isProcessingSale ? "Procesando..." : hasTransfer && !transferDataOk ? "Completar datos" : "Confirmar"}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* ── PESTAÑA «DATOS DE TRANSFERENCIA» (FASE 3) ──
                  Nombre del cliente + carné de identidad + UN número de
                  operación POR fila de transferencia (cada pago bancario
                  conserva SU referencia — payment_transactions.reference;
                  nunca una referencia global) + notas compartidas. */}
              <div className="space-y-2" data-testid="datos-transferencia-panel">
                <p className="text-[10px] text-muted-foreground">
                  Identifica la operación bancaria de esta venta. Estos datos
                  quedan asociados a la venta y a cada pago por transferencia.
                </p>
                <div>
                  <label
                    htmlFor="pos-express-transfer-name"
                    className="text-[10px] font-black uppercase tracking-widest text-muted-foreground"
                  >
                    Nombre y apellidos del cliente <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="pos-express-transfer-name"
                    type="text"
                    value={customerName || ''}
                    onChange={(e) => setCustomer(null, e.target.value || null)}
                    maxLength={200}
                    autoComplete="off"
                    className={cn(
                      "w-full mt-1 rounded-xl border bg-background px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20",
                      !(customerName || '').trim() ? "border-amber-500/60" : "border-border focus:border-primary",
                    )}
                    aria-label="Nombre y apellidos del cliente (requerido con transferencia)"
                    aria-required="true"
                  />
                </div>
                <div>
                  <label
                    htmlFor="pos-express-transfer-ci"
                    className="text-[10px] font-black uppercase tracking-widest text-muted-foreground"
                  >
                    Carné de identidad <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="pos-express-transfer-ci"
                    type="text"
                    value={customerCi || ''}
                    onChange={(e) => setCustomerCi(e.target.value || null)}
                    maxLength={20}
                    autoComplete="off"
                    className={cn(
                      "w-full mt-1 rounded-xl border bg-background px-3 py-2.5 text-sm font-bold font-mono focus:outline-none focus:ring-2 focus:ring-primary/20",
                      !(customerCi || '').trim() ? "border-amber-500/60" : "border-border focus:border-primary",
                    )}
                    aria-label="Carné de identidad del cliente (requerido con transferencia)"
                    aria-required="true"
                    data-testid="pos-express-transfer-ci"
                  />
                  {/* COSTPRO no define una regla canónica de CI (decisión
                      documentada en el diagnóstico): pista de formato 11
                      dígitos sin bloquear identidades con letras. */}
                  {!!(customerCi || '').trim() && !/^\d{11}$/.test(customerCi || '') && (
                    <p className="text-[9px] text-amber-500 mt-0.5">
                      Formato habitual: 11 dígitos (se aceptan CI con letras).
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Números de transferencia <span className="text-destructive">*</span>
                  </p>
                  <p className="text-[9px] text-muted-foreground">
                    Una referencia POR operación bancaria: si la venta tiene
                    varias transferencias, cada una lleva su número.
                  </p>
                  {transferRows.map(({ item, rowId, method, amount, currency }) => {
                    const row = (item.payments || []).find((p) => p.id === rowId);
                    const missing = !(row?.reference || '').trim();
                    return (
                      <div
                        key={`${item.product_id}-${item.variant_id ?? 'null'}-${rowId}`}
                        className="rounded-xl border border-border/60 bg-muted/10 p-2"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-[10px] font-bold text-foreground truncate">
                            {item.product?.name || "Producto"}
                            {item.variant ? ` · ${item.variant.name}` : ""}
                          </span>
                          <span className="text-[10px] font-black tabular-nums text-primary shrink-0">
                            {formatCurrency(amount)} {currency}
                            <span className="ml-1 text-muted-foreground font-bold">
                              {method === 'transfer' ? 'Transf.' : 'Ext.'}
                            </span>
                          </span>
                        </div>
                        <input
                          type="text"
                          value={row?.reference || ''}
                          onChange={(e) =>
                            useCartStore.getState().updateItemPaymentRow(
                              item.product_id, item.variant_id, rowId,
                              { reference: e.target.value || null },
                            )
                          }
                          maxLength={400}
                          className={cn(
                            "w-full rounded-lg border bg-background px-2 py-2 text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-primary/20",
                            missing ? "border-amber-500/60" : "border-border focus:border-primary",
                          )}
                          placeholder="N.º de transferencia (obligatorio)"
                          aria-label={`Número de transferencia para ${item.product?.name || "producto"}`}
                          data-testid={`transfer-ref-${item.product_id}`}
                        />
                      </div>
                    );
                  })}
                </div>
                <p className="text-[9px] text-muted-foreground">
                  Las notas generales se editan en la pestaña Resumen y viajan
                  con la venta.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPayTab('resumen')}
                  className="flex-1 h-12 rounded-xl border border-border text-xs font-black uppercase tracking-widest hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  Volver al resumen
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSale}
                  disabled={isProcessingSale || !saleDateValidation.valid || !transferDataOk}
                  title={
                    !transferDataOk
                      ? "Completa cliente, carné de identidad y los números de transferencia"
                      : !saleDateValidation.valid
                        ? saleDateValidation.error
                        : undefined
                  }
                  className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {isProcessingSale ? "Procesando..." : "Confirmar"}
                </button>
              </div>
            </>
          )}
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

      {/* CP-POS-REDESIGN-PER-ITEM-PAYMENTS-001 (FASE 2): «Configurar pago»
          de una línea — el MISMO editor de filas de pago del carrito clásico.
          FIX CP-POS-SMOKE-PRODUCTION-001: item VIVO del store (ver arriba). */}
      <POSExpressPaymentModal
        item={livePayingItem}
        onClose={() => setPayingItem(null)}
      />

      {/* CP-UX-POLISH-002 (§2.1): el botón flotante fixed top-4 right-4 se RETIRA.
          Era la causa raíz de la superposición con el método de pago (misma
          coordenada right-16px que el grupo de controles del header, en TODAS
          las resoluciones). El cierre vive ahora DENTRO del header — zona
          exclusiva, sin posicionamiento absoluto (misión §2.1). */}
    </div>,
    document.body
  );
}

// ── Estado informativo del área dinámica (§3.3 de la misión) ───────────────
// Un único componente para «sin coincidencias», «sin existencias», «sin
// productos» y «query corta»: nunca dejar espacio vacío sin explicación.
function ExpressInfoState({
  title,
  hint,
  tone = "muted",
}: {
  title: string;
  hint?: string;
  tone?: "muted" | "warn";
}) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-2xl border-2 border-dashed p-6 text-center",
        tone === "warn" ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-muted/20",
      )}
    >
      <PackageSearch className="w-8 h-8 mx-auto text-muted-foreground/60" aria-hidden="true" />
      <p className="text-sm font-black uppercase tracking-widest text-foreground mt-2">{title}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">{hint}</p>}
    </div>
  );
}
