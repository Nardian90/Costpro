"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Package, X, Check, Plus, Minus, Trash2, Zap, ArrowLeft,
  Building2, Calendar, FileText,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { useCartStore } from "@/store/cart";
import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";
import type { Product } from "@/types";
import { useAuthStore } from "@/store";
import { useUIStore } from "@/store";
import { useReceptionProductSearch } from "@/hooks/api/useReceptionProductSearch";
import { useRegisterReception } from "@/hooks/api/useInventory";
import { supabase } from "@/lib/supabaseClient";
import { auditService } from "@/services/audit-service";
import { POSPortalModal } from "@/components/views/terminal/views/pos/POSPortalModal";
import { useReceptionShortcuts } from "./useReceptionShortcuts";
// CP-LOG-UNIFICATION-001 (§4): mismo selector de proveedores del formulario
// manual y de Servicios Recibidos (Clasificador Maestro + suppliers local +
// alta al vuelo) — el Express dejaba de capturar la identidad del proveedor
// (texto libre sin código/NIT/teléfono, sin snapshot en la recepción).
import { SupplierSelector, type SupplierSelection } from "./SupplierSelector";
// CP-LOG-RECEPTIONS-SERVICES-POS-UNIFICATION-001 (§3): liquidación al
// confirmar — MISMO editor unificado y MISMO canal que el formulario manual
// y que Servicios Recibidos (PaymentRowsEditor + /api/payments batch).
import PaymentRowsEditor, {
  newPaymentRow, rowsToPayload, rowsAreValid, rowsCupTotal, payRowsFingerprint,
  type PaymentEditorRow,
} from "@/components/payments/PaymentRowsEditor";
import { useStoreRates } from "@/hooks/useStoreRates";
import { formatOperationDateForRPC } from "@/components/ui/OperationDatePicker";
import { todayBusinessDay } from "@/lib/cash-report/period-attribution";

interface ReceptionExpressItem {
  product_id: string;
  sku: string;
  name: string;
  quantity: number;
  unit_cost: number;
  unit_of_measure: string;
  sale_price: number | null;
  is_new: boolean;
  update_price: boolean;
  local_id: string;
  variant_id: string | null;
  variant_name: string | null;
  conversion_factor: number | null;
  // FIX-P1.1: moneda y tasa para costeo multi-moneda
  moneda_recepcion: string;
  tasa_cambio_recepcion: number;
}

interface ReceptionExpressModeProps {
  onExit: () => void;
}

/**
 * EM-R1: Modo Recepción Express.
 *
 * Layout full-screen optimizado para recepción de alto volumen:
 * - Search gigante arriba (Enter = agregar por SKU/barcode/nombre)
 * - Grid de productos buscados (click = agregar)
 * - Carrito lateral derecho con items, total gigante, 1-clic confirmar
 * - F9 = registrar, Esc = salir
 *
 * Objetivo: recepción de 10 productos en <60s.
 */
export function ReceptionExpressMode({ onExit }: ReceptionExpressModeProps) {
  const { user } = useAuthStore();
  const { setSidebarState } = useUIStore();
  const storeId = user?.activeStoreId;

  // Server-side search (EM-R2)
  const {
    searchTerm, setSearchTerm, products, hasMore, loadMore,
    isLoading, isFetchingMore, error: searchError, refetch: refetchProducts,
  } = useReceptionProductSearch(storeId, "", 24);

  const [items, setItems] = useState<ReceptionExpressItem[]>([]);
  const [supplier, setSupplier] = useState("");
  // CP-LOG-UNIFICATION-001 (§4): snapshot de identidad del proveedor (código/
  // NIT/teléfono/dirección + fuente) del selector compartido — viaja a
  // register_reception congelado en la recepción (paridad con el flujo manual).
  const [supplierDetail, setSupplierDetail] = useState<SupplierSelection | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  // FIX-P1.1: moneda global para toda la recepción express
  const [moneda, setMoneda] = useState('CUP');
  const [tasa, setTasa] = useState(1.0);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const registerReception = useRegisterReception();

  // Autofocus al search al montar
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Audit-Fix: cerrar el sidebar al entrar al modo Express y restaurarlo al salir.
  // Antes el sidebar quedaba visible encima del overlay (z-40 vs z-[9999]) porque
  // el motion.div padre en TerminalShell crea un stacking context que atrapa el z-index.
  // Ahora: cerramos el sidebar al montar + usamos createPortal para escapar
  // del stacking context. Al desmontar, restauramos el sidebar a su estado previo.
  useEffect(() => {
    const previousSidebarState = useUIStore.getState().sidebarState;
    setSidebarState('closed');
    return () => {
      setSidebarState(previousSidebarState === 'closed' ? 'expanded' : previousSidebarState);
    };
  }, [setSidebarState]);

  // FIX-G6: totalCost en CUP convirtiendo cada item con su tasa de cambio
  const totalCost = useMemo(
    () => items.reduce((s, i) => s + i.quantity * i.unit_cost * (i.tasa_cambio_recepcion || 1.0), 0),
    [items],
  );

  // CP-LOG-UNIFICATION-001 (§3): liquidación al confirmar (paridad con el
  // formulario manual y con Servicios Recibidos — ADN-008).
  const { rates: storeRates } = useStoreRates();
  const authToken = useAuthStore((s) => s.token);
  const [liquidarAhora, setLiquidarAhora] = useState(false);
  const [liquidarRows, setLiquidarRows] = useState<PaymentEditorRow[]>([newPaymentRow({})]);
  // Prefill: Efectivo + total exacto al activar (lote «virgen»).
  useEffect(() => {
    if (liquidarAhora && totalCost > 0) {
      setLiquidarRows(prev => {
        const virgen = prev.length === 1 && prev[0].method === "cash"
          && prev[0].currency === "CUP" && !(prev[0].amount > 0.005);
        if (virgen) return [{ ...prev[0], amount: Math.round(totalCost * 100) / 100 }];
        return prev;
      });
    }
  }, [liquidarAhora, totalCost]);
  // Idempotencia estable por fingerprint (helper compartida).
  const liquidarFingerprint = useMemo(() => payRowsFingerprint(liquidarRows), [liquidarRows]);
  const liquidarKeyRef = useRef<string>("");
  useEffect(() => {
    liquidarKeyRef.current = crypto.randomUUID();
  }, [liquidarFingerprint, liquidarAhora]);
  const liquidarValido = !liquidarAhora
    || (rowsAreValid(liquidarRows)
        && rowsCupTotal(liquidarRows) > 0.005
        && rowsCupTotal(liquidarRows) <= totalCost + 0.005);
  const liquidarError = liquidarAhora && !liquidarValido
    ? `El pago (${rowsCupTotal(liquidarRows).toFixed(2)} CUP) debe ser > 0 y no exceder el total (${totalCost.toFixed(2)} CUP)`
    : null;

  // CP-LOG-RECEPTIONS-SERVICES-POS-UNIFICATION-001 (§2.1): activación de un
  // producto SOLO-MAESTRO (tienda conectada al Catálogo Maestro, sin fila
  // local) por el MISMO camino del importador Excel —
  // resolve_reception_import_rows con una fila. Crea/activa la fila local
  // vinculada al maestro con la identidad canónica; la recepción registra
  // después sobre un product_id LOCAL real.
  const [resolvingMaster, setResolvingMaster] = useState(false);
  const activateMaster = useCallback(async (product: Product): Promise<string | null> => {
    if (!storeId) return null;
    setResolvingMaster(true);
    try {
      const { data, error } = await supabase.rpc('resolve_reception_import_rows', {
        p_store_id: storeId,
        p_rows: [{
          name: product.name,
          sku: product.sku || '',
          barcode: product.barcode || '',
          unit_of_measure: product.unit_of_measure || '',
          // El clasificador exige cantidad >= 1 (ERR_INVALID_QUANTITY): la
          // activación es de la IDENTIDAD; la cantidad real la registra la
          // recepción con su costo real.
          quantity: 1,
        }],
        p_confirm_reactivation: [],
      });
      if (error) throw error;
      const first = (data?.results || [])[0];
      if (!first?.product_id) {
        const reasons = (first?.reasons || []).join(' · ') || 'sin detalle';
        toast.error(`No se pudo activar "${product.name}" del catálogo maestro (${first?.status || 'error'}): ${reasons}`, { duration: 9000 });
        return null;
      }
      return first.product_id as string;
    } catch (e: any) {
      console.error('[reception-express] activación de maestro falló:', e);
      toast.error(`Error al activar "${product.name}": ${e?.message || 'desconocido'}`);
      return null;
    } finally {
      setResolvingMaster(false);
    }
  }, [storeId]);

  const addItem = useCallback(async (product: Product) => {
    // Fila solo-maestro → activar ANTES de agregar (flujo idéntico al modal
    // manual de recepción; el toast informa el resultado).
    let productId = product.id;
    if (product.source === 'master') {
      const localId = await activateMaster(product);
      if (!localId) return;
      productId = localId;
      toast.info(`"${product.name}" activado del catálogo maestro de la organización`);
    }
    setItems((prev) => {
      const existing = prev.find((it) => it.product_id === productId);
      if (existing) {
        return prev.map((it) =>
          it.local_id === existing.local_id
            ? { ...it, quantity: it.quantity + 1 }
            : it,
        );
      }
      return [...prev, {
        product_id: productId,
        sku: product.sku || "",
        name: product.name,
        quantity: 1,
        unit_cost: product.cost_price || 0,
        unit_of_measure: product.unit_of_measure || "unidad",
        sale_price: product.price || null,
        is_new: false,
        update_price: false,
        local_id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        variant_id: null,
        variant_name: null,
        conversion_factor: null,
        // FIX-P1.1: heredar moneda/tasa global
        moneda_recepcion: moneda,
        tasa_cambio_recepcion: tasa,
      }];
    });
  }, [activateMaster, moneda, tasa]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchTerm.trim().toLowerCase();
    if (!q) return;

    // Match exacto por SKU
    const skuMatch = products.find((p) => p.sku?.toLowerCase() === q);
    if (skuMatch) {
      void addItem(skuMatch);
      setSearchTerm("");
      return;
    }

    // Match exacto por barcode
    const barcodeMatch = products.find((p) => p.barcode?.toLowerCase() === q);
    if (barcodeMatch) {
      void addItem(barcodeMatch);
      setSearchTerm("");
      return;
    }

    // Si solo hay 1 resultado fuzzy, agregarlo
    const fuzzy = products.filter((p) =>
      p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q),
    );
    if (fuzzy.length === 1) {
      void addItem(fuzzy[0]);
      setSearchTerm("");
      return;
    }

    if (fuzzy.length === 0) {
      toast.error(`No se encontró producto con "${searchTerm}"`);
    }
  };

  // Atajos
  useReceptionShortcuts({
    onSubmit: () => {
      if (items.length > 0 && !isSubmitting && supplier && invoiceNumber) {
        setShowConfirm(true);
      } else if (!supplier) {
        toast.error("Completa el proveedor primero");
      } else if (!invoiceNumber) {
        toast.error("Completa el número de factura");
      }
    },
    onEscape: () => {
      if (showConfirm) setShowConfirm(false);
      else onExit();
    },
    onFocusSearch: () => searchInputRef.current?.focus(),
  });

  const handleConfirmSale = async () => {
    if (!user?.activeStoreId || !user?.id) return;
    // CP-LOG-UNIFICATION-001 (§3.1): validar el lote de liquidación ANTES de
    // registrar (la obligación nacería con la recepción; el pago debe ser
    // admisible desde el inicio).
    if (liquidarAhora && !liquidarValido) {
      toast.error(liquidarError || 'Revisa la liquidación: importes > 0, tasa > 1 para divisa y sin exceder el total.');
      return;
    }
    setShowConfirm(false);
    setIsSubmitting(true);

    try {
      const receiptId = await registerReception.mutateAsync({
        p_store_id: user.activeStoreId,
        p_supplier: supplier.trim(),
        p_reception_date: new Date().toISOString(),
        p_invoice_number: invoiceNumber.trim(),
        p_items: items.map((i) => ({
          product_id: i.product_id,
          sku: i.sku || null,
          quantity: i.quantity,
          unit_cost: i.unit_cost,
          unit_of_measure: i.unit_of_measure,
          sale_price: i.sale_price ?? undefined,
          variant_id: i.variant_id,
          // FIX-P1.1: enviar moneda y tasa al RPC
          moneda_recepcion: i.moneda_recepcion,
          tasa_cambio_recepcion: i.tasa_cambio_recepcion,
          // FIX-G11: enviar price_currency
          price_currency: i.moneda_recepcion,
        })),
        // PR-2 C6: enviar los 7 args explícitos a la firma C (register_reception 7-param TIMESTAMPTZ).
        // p_user_id se envía explícitamente. p_po_id=null porque este flujo no viene de OC.
        p_user_id: user.id,
        p_po_id: null,
        // CP-LOG-UNIFICATION-001 (§4): snapshot de identidad del proveedor del
        // selector compartido (paridad con el formulario manual — el RPC lo
        // congela en la recepción; sin detalle → NULL y el RPC usa la fuente
        // que corresponda).
        p_supplier_code: supplierDetail?.code || null,
        p_supplier_tax_id: supplierDetail?.tax_id || null,
        p_supplier_phone: supplierDetail?.phone || null,
        p_supplier_address: supplierDetail?.address || null,
      });

      // Audit
      try {
        await auditService.logReceptionCreated({
          userId: user.id,
          receiptId: receiptId as string,
          storeId: user.activeStoreId,
          supplier: supplier.trim(),
          invoiceNumber: invoiceNumber.trim(),
          itemCount: items.length,
          totalCost,
          autoCreatedSkus: [],
          priceUpdatedSkus: [],
        });
      } catch { /* non-blocking */ }

      // CP-LOG-UNIFICATION-001 (§3.1 paso 10): registrar la LIQUIDACIÓN solo
      // tras el éxito del registro (mismo canal atómico que el formulario
      // manual y Servicios Recibidos). Si falla, la recepción queda
      // registrada con su obligación pendiente — sin estados inconsistentes.
      let liquidadaMsg = '';
      if (liquidarAhora && liquidarValido) {
        const payloadRows = rowsToPayload(liquidarRows);
        if (payloadRows.length > 0) {
          try {
            const payRes = await fetch('/api/payments', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
              },
              body: JSON.stringify({
                ref_type: 'receipt',
                ref_id: receiptId,
                payments: payloadRows,
                payment_date: formatOperationDateForRPC(todayBusinessDay()),
                idempotency_key: liquidarKeyRef.current,
              }),
            });
            if (payRes.ok) {
              liquidadaMsg = ' · obligación liquidada';
            } else {
              const payErr = await payRes.json().catch(() => ({}));
              console.error('[reception-express] liquidación falló:', payErr);
              toast.error(
                `La recepción quedó registrada pero la liquidación falló: ${payErr?.error || payErr?.message || 'error desconocido'}. ` +
                'Puedes liquidarla desde el detalle de la recepción (pestaña Pagos).',
                { duration: 9000 },
              );
            }
          } catch (payEx: any) {
            console.error('[reception-express] liquidación falló (red):', payEx);
            toast.error(
              'La recepción quedó registrada pero la liquidación no se pudo confirmar (error de red). ' +
              'Verifica el estado del pago en el detalle de la recepción antes de reintentar.',
              { duration: 9000 },
            );
          }
        }
      }

      toast.success(`Recepción registrada: ${items.length} productos, ${formatCurrency(totalCost)}${liquidadaMsg}`);
      setItems([]);
      setSupplier("");
      setSupplierDetail(null);
      setInvoiceNumber("");
      // CP-LOG-UNIFICATION-001: reset de la liquidación (nueva operación).
      setLiquidarAhora(false);
      setLiquidarRows([newPaymentRow({})]);
      onExit();
    } catch (err: any) {
      toast.error(err?.message || "Error al registrar la recepción");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Audit-Fix: usar createPortal para escapar del stacking context del motion.div
  // padre en TerminalShell. Sin esto, el z-[9999] no puede cubrir el sidebar (z-40)
  // porque el motion.div crea un stacking context que atrapa los z-index hijos.
  if (typeof window === 'undefined') return null; // SSR guard
  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-border bg-card shrink-0 gap-4">
        <button
          type="button"
          onClick={onExit}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-xs font-black uppercase tracking-widest border border-primary/20 active:scale-95 shrink-0"
          aria-label="Salir del modo Express"
        >
          <ArrowLeft className="w-4 h-4" />
          Salir
        </button>
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          <h1 className="text-base sm:text-lg font-black uppercase tracking-widest text-foreground">
            Recepción Express
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {/* CP-LOG-UNIFICATION-001 (§4): selector de proveedores COMPARTIDO
              (mismo que manual y Servicios Recibidos) — identidad real del
              Clasificador Maestro + alta al vuelo, no texto libre. */}
          <SupplierSelector
            value={supplier}
            onChange={(name, detail) => { setSupplier(name); setSupplierDetail(detail ?? null); }}
            className="w-40 sm:w-56"
          />
          <input
            type="text"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            placeholder="Factura"
            className="neu-input w-24 sm:w-32 text-xs"
            aria-label="Número de factura"
          />
          {/* FIX-P1.1: selector de moneda + tasa para recepción multi-moneda */}
          <select
            value={moneda}
            onChange={async (e) => {
              setMoneda(e.target.value);
              if (e.target.value === 'CUP') {
                setTasa(1.0);
              } else {
                try {
                  const res = await fetch(`/api/exchange-rates?currency=${e.target.value}&source=BCC&segment=3&days=1`);
                  if (res.ok) {
                    const data = await res.json();
                    const rates = Array.isArray(data) ? data : (data?.rates || []);
                    if (Array.isArray(rates) && rates.length > 0) {
                      const sorted = rates.sort((a: any, b: any) =>
                        new Date(b.rate_date || 0).getTime() - new Date(a.rate_date || 0).getTime()
                      );
                      if (sorted[0]?.rate > 0) setTasa(sorted[0].rate);
                    }
                  }
                } catch {}
              }
              // Actualizar items existentes con la nueva moneda/tasa
              setItems(prev => prev.map(it => ({ ...it, moneda_recepcion: e.target.value, tasa_cambio_recepcion: e.target.value === 'CUP' ? 1.0 : tasa })));
            }}
            className="neu-input w-16 text-xs"
            aria-label="Moneda"
          >
            <option value="CUP">CUP</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="MLC">MLC</option>
          </select>
          {moneda !== 'CUP' && (
            <input
              type="number"
              step="0.01"
              value={tasa}
              onChange={(e) => {
                const v = parseFloat(e.target.value) || 1.0;
                setTasa(v);
                setItems(prev => prev.map(it => ({ ...it, tasa_cambio_recepcion: v })));
              }}
              className="neu-input w-20 text-xs"
              aria-label="Tasa de cambio"
              placeholder="Tasa"
            />
          )}
        </div>
      </header>

      {/* Search gigante */}
      <div className="p-4 sm:p-6 border-b border-border shrink-0">
        <form onSubmit={handleSearchSubmit} className="max-w-3xl mx-auto">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-muted-foreground" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Escanea o escribe nombre/SKU... Enter = agregar"
              className="w-full pl-14 pr-4 py-4 sm:py-5 text-lg sm:text-xl font-bold rounded-2xl border-2 border-border bg-card focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none shadow-md"
              aria-label="Búsqueda Express"
              autoComplete="off"
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 text-center uppercase tracking-widest">
            Enter = agregar · F9 = registrar · Esc = salir
          </p>
        </form>
      </div>

      {/* Body: grid productos + carrito lateral */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Grid de productos */}
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">Cargando productos...</p>
            </div>
          ) : searchError ? (
            /* CP-LOG-UNIFICATION-001: la RPC de búsqueda puede fallar (RLS,
               membresía, red) — antes el error se tragaba y el grid quedaba
               vacío sin explicación. Estado accionable con reintento. */
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm font-bold uppercase tracking-widest text-destructive">No se pudo cargar el catálogo</p>
              <p className="text-xs mt-1 max-w-md mx-auto">
                {(searchError as any)?.message || 'Error de consulta'} — comprueba tu acceso a la tienda activa.
              </p>
              <button
                type="button"
                onClick={() => refetchProducts()}
                className="mt-4 px-4 py-2 rounded-xl border-2 border-primary/40 text-primary text-xs font-black uppercase tracking-widest hover:bg-primary/5"
              >
                Reintentar
              </button>
            </div>
          ) : products.length === 0 && searchTerm ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm font-bold uppercase tracking-widest">Sin resultados</p>
              <p className="text-xs mt-1">No se encontraron productos con "{searchTerm}"</p>
            </div>
          ) : products.length === 0 && !searchTerm ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="w-10 h-10 opacity-20 mx-auto mb-3" />
              <p className="text-sm font-bold uppercase tracking-widest">Catálogo vacío</p>
              <p className="text-xs mt-1">Esta tienda no tiene productos activos. Agrega productos desde una recepción.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {products.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => void addItem(product)}
                    disabled={resolvingMaster}
                    className={cn(
                      "p-3 rounded-xl border-2 border-border bg-card hover:border-primary hover:bg-primary/5 transition-all text-left group active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary/30",
                      product.source === 'master' && "border-amber-300/60 dark:border-amber-700/50",
                      resolvingMaster && "opacity-60",
                    )}
                    aria-label={`Agregar ${product.name}`}
                  >
                    <p className="text-xs font-bold text-foreground line-clamp-2 leading-tight">
                      {product.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono mt-1">
                      {product.sku || "—"}
                    </p>
                    {product.source === 'master' ? (
                      /* CP-LOG-UNIFICATION-001: fila del catálogo organizacional
                         sin fila local — al agregar se activa automáticamente. */
                      <span className="inline-block mt-1 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                        Catálogo
                      </span>
                    ) : (
                      <p className="text-sm font-black text-primary tabular-nums mt-1">
                        {formatCurrency(product.cost_price || 0)}
                      </p>
                    )}
                    {product.source !== 'master' && (
                      <p className="text-[9px] text-muted-foreground mt-0.5">
                        Stock: {product.stock_current ?? 0}
                      </p>
                    )}
                  </button>
                ))}
              </div>
              {hasMore && (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={isFetchingMore}
                  className="w-full mt-4 py-3 rounded-xl border-2 border-dashed border-primary/30 text-primary text-xs font-black uppercase tracking-widest hover:bg-primary/5 disabled:opacity-50"
                >
                  {isFetchingMore ? "Cargando..." : "Cargar más productos"}
                </button>
              )}
            </>
          )}
        </div>

        {/* Carrito lateral */}
        <aside className="lg:w-[380px] xl:w-[420px] border-t lg:border-t-0 lg:border-l border-border bg-card flex flex-col">
          <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
            <h2 className="text-sm font-black uppercase tracking-widest text-foreground flex items-center gap-2">
              <Package className="w-4 h-4" />
              Items
              {items.length > 0 && (
                <span className="bg-primary text-primary-foreground px-2 py-0.5 rounded-full text-[10px] tabular-nums">
                  {items.length}
                </span>
              )}
            </h2>
            {items.length > 0 && (
              <button
                type="button"
                onClick={() => setItems([])}
                className="text-destructive hover:bg-destructive/10 p-1.5 rounded-lg transition-colors"
                aria-label="Vaciar items"
                title="Vaciar items"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Items scroll */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-8">
                <Package className="w-12 h-12 opacity-20 mb-3" />
                <p className="text-xs font-bold uppercase tracking-widest">Vacío</p>
                <p className="text-[10px] mt-1">Escanea o busca para agregar</p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {items.map((item) => (
                  <motion.div
                    key={item.local_id}
                    layout
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="flex items-center gap-2 p-2 rounded-lg border border-border bg-background"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">
                        {item.name}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {formatCurrency(item.unit_cost)} c/u
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setItems((prev) => prev.map((it) =>
                            it.local_id === item.local_id
                              ? { ...it, quantity: Math.max(0.01, it.quantity - 1) }
                              : it,
                          ))
                        }
                        className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg border border-border hover:bg-muted flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary/30"
                        aria-label="Reducir cantidad"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-8 text-center font-black tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setItems((prev) => prev.map((it) =>
                            it.local_id === item.local_id
                              ? { ...it, quantity: it.quantity + 1 }
                              : it,
                          ))
                        }
                        className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg border border-border hover:bg-muted flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary/30"
                        aria-label="Aumentar cantidad"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setItems((prev) => prev.filter((it) => it.local_id !== item.local_id))}
                      className="text-destructive hover:bg-destructive/10 p-1.5 rounded-lg transition-colors shrink-0"
                      aria-label="Quitar"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>

          {/* Total + CTA */}
          <div className="p-4 border-t border-border bg-card shrink-0 space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                Total
              </span>
              <span className="text-[clamp(2rem,8vw,3rem)] font-black text-primary tabular-nums leading-none">
                {formatCurrency(totalCost)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowConfirm(true)}
              disabled={items.length === 0 || isSubmitting || !supplier || !invoiceNumber}
              className="w-full h-16 rounded-2xl bg-primary text-primary-foreground font-black text-base uppercase tracking-widest shadow-xl shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
              aria-label="Registrar recepción"
            >
              <Check className="w-6 h-6" />
              Registrar
              {totalCost > 0 && (
                <span className="bg-primary-foreground/20 px-2 py-1 rounded-md text-sm tabular-nums">
                  {formatCurrency(totalCost)}
                </span>
              )}
            </button>
            {(!supplier || !invoiceNumber) && (
              <p className="text-[10px] text-warning text-center">
                Completa proveedor y factura para registrar
              </p>
            )}
          </div>
        </aside>
      </div>

      {/* Modal confirmación */}
      <POSPortalModal
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        title="Confirmar Recepción"
      >
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-3xl font-black text-primary tabular-nums">
              {formatCurrency(totalCost)}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              {items.length} productos · {supplier} · {invoiceNumber}
            </p>
          </div>

          {/* CP-LOG-UNIFICATION-001 (§3): liquidación al confirmar — mismo
              editor unificado que el formulario manual y Servicios Recibidos. */}
          <div className="rounded-xl border border-border bg-card/50 p-3 space-y-2">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={liquidarAhora}
                onChange={(e) => setLiquidarAhora(e.target.checked)}
                className="w-5 h-5 rounded border-border text-primary focus:ring-primary/30"
                aria-label="Liquidar al confirmar"
              />
              <span className="text-xs font-black uppercase tracking-widest">Liquidar al confirmar</span>
            </label>
            {liquidarAhora && (
              <div className="space-y-2">
                <PaymentRowsEditor
                  rows={liquidarRows}
                  onChange={setLiquidarRows}
                  storeRates={storeRates}
                  maxCupTotal={totalCost}
                />
                {liquidarError ? (
                  <p className="text-xs text-destructive font-bold" role="alert">{liquidarError}</p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Efectivo por el total exacto por defecto — cambia medio, moneda o importe si fue distinto.
                  </p>
                )}
              </div>
            )}
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
              disabled={isSubmitting || (liquidarAhora && !liquidarValido)}
              className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {isSubmitting ? "Procesando..." : "Confirmar"}
            </button>
          </div>
        </div>
      </POSPortalModal>

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
