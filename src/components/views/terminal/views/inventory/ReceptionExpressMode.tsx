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
    isLoading, isFetchingMore,
  } = useReceptionProductSearch(storeId, "", 24);

  const [items, setItems] = useState<ReceptionExpressItem[]>([]);
  const [supplier, setSupplier] = useState("");
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

  const addItem = useCallback((product: Product) => {
    setItems((prev) => {
      const existing = prev.find((it) => it.product_id === product.id);
      if (existing) {
        return prev.map((it) =>
          it.local_id === existing.local_id
            ? { ...it, quantity: it.quantity + 1 }
            : it,
        );
      }
      return [...prev, {
        product_id: product.id,
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
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchTerm.trim().toLowerCase();
    if (!q) return;

    // Match exacto por SKU
    const skuMatch = products.find((p) => p.sku?.toLowerCase() === q);
    if (skuMatch) {
      addItem(skuMatch);
      setSearchTerm("");
      toast.success(`"${skuMatch.name}" agregado`);
      return;
    }

    // Match exacto por barcode
    const barcodeMatch = products.find((p) => p.barcode?.toLowerCase() === q);
    if (barcodeMatch) {
      addItem(barcodeMatch);
      setSearchTerm("");
      toast.success(`"${barcodeMatch.name}" agregado (barcode)`);
      return;
    }

    // Si solo hay 1 resultado fuzzy, agregarlo
    const fuzzy = products.filter((p) =>
      p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q),
    );
    if (fuzzy.length === 1) {
      addItem(fuzzy[0]);
      setSearchTerm("");
      toast.success(`"${fuzzy[0].name}" agregado`);
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
        })),
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

      toast.success(`Recepción registrada: ${items.length} productos, ${formatCurrency(totalCost)}`);
      setItems([]);
      setSupplier("");
      setInvoiceNumber("");
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
          <input
            type="text"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="Proveedor"
            className="neu-input w-32 sm:w-40 text-xs"
            aria-label="Proveedor"
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
          ) : products.length === 0 && searchTerm ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm font-bold uppercase tracking-widest">Sin resultados</p>
              <p className="text-xs mt-1">No se encontraron productos con "{searchTerm}"</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {products.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addItem(product)}
                    className="p-3 rounded-xl border-2 border-border bg-card hover:border-primary hover:bg-primary/5 transition-all text-left group active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    aria-label={`Agregar ${product.name}`}
                  >
                    <p className="text-xs font-bold text-foreground line-clamp-2 leading-tight">
                      {product.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono mt-1">
                      {product.sku || "—"}
                    </p>
                    <p className="text-sm font-black text-primary tabular-nums mt-1">
                      {formatCurrency(product.cost_price || 0)}
                    </p>
                    <p className="text-[9px] text-muted-foreground mt-0.5">
                      Stock: {product.stock_current ?? 0}
                    </p>
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
              disabled={isSubmitting}
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
