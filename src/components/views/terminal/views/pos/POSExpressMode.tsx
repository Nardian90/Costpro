"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
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
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { useCartStore } from "@/store/cart";
import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";
import type { Product } from "@/types";
import { useFrequentProducts } from "@/hooks/api/useFrequentProducts";
import { useActiveShift } from "@/hooks/api/useActiveShift";
import { useAuthStore } from "@/store";
import { useUIStore } from "@/store";
import { usePOSCheckout } from "./usePOSCheckout";
import { POSPortalModal } from "./POSPortalModal";
import ProductImage from "@/components/ui/ProductImage";

interface POSExpressModeProps {
  products: Product[];
  onExit: () => void;
}

/**
 * POS-3b EM-1: Modo Cajero Express.
 *
 * Layout full-screen optimizado para venta de alto volumen:
 * - Search bar gigante arriba con SKU* prefix + Enter para agregar
 * - Grid de favoritos (frecuentes del turno) como chips grandes
 * - Total gigante siempre visible
 * - 1-clic cobro: Enter = confirmar venta con método por defecto
 *
 * Objetivo: venta simple en <6 segundos.
 *
 * Activación: toggle en header del POSView (botón "Express" con icon Zap).
 */
export function POSExpressMode({ products, onExit }: POSExpressModeProps) {
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
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Audit-Fix: cerrar el sidebar al entrar al modo Express y restaurarlo al salir.
  // Antes el sidebar quedaba visible encima del overlay (z-40 vs z-[200]) porque
  // el motion.div padre crea un stacking context que atrapa el z-index.
  // Ahora: cerramos el sidebar al montar + usamos createPortal para escapar
  // del stacking context. Al desmontar, restauramos el sidebar a 'expanded'.
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
    getItemCount,
    selectedPayment,
    setSelectedPayment,
  } = useCartStore(
    useShallow((s) => ({
      items: s.items,
      addItem: s.addItem,
      removeItem: s.removeItem,
      updateQuantity: s.updateQuantity,
      clearCart: s.clearCart,
      getTotal: s.getTotal,
      getItemCount: s.getItemCount,
      selectedPayment: s.selectedPayment,
      setSelectedPayment: s.setSelectedPayment,
    })),
  );

  const { startCheckout, isProcessingSale } = usePOSCheckout();

  const total = getTotal();
  const itemCount = getItemCount();

  // Autofocus al search al montar
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Atajos: Enter = cobrar si hay items, sino intenta agregar por SKU*
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

    // SKU prefix mode
    if (raw.endsWith("*")) {
      const skuQuery = raw.slice(0, -1).trim().toLowerCase();
      if (!skuQuery) return;
      const skuMatch = products.find((p) => p.sku?.toLowerCase() === skuQuery);
      if (skuMatch) {
        addItem(skuMatch);
        setSearchQuery("");
        return;
      }
      const skuStartsWith = products.find((p) =>
        p.sku?.toLowerCase().startsWith(skuQuery),
      );
      if (skuStartsWith) {
        addItem(skuStartsWith);
        toast.info(`SKU "${skuQuery}" → ${skuStartsWith.name}`);
        setSearchQuery("");
        return;
      }
      toast.error(`SKU "${skuQuery}" no encontrado`);
      return;
    }

    // Match exacto SKU/barcode
    const q = raw.toLowerCase();
    const skuMatch = products.find((p) => p.sku?.toLowerCase() === q);
    if (skuMatch) {
      addItem(skuMatch);
      setSearchQuery("");
      return;
    }
    const barcodeMatch = products.find((p) => p.barcode?.toLowerCase() === q);
    if (barcodeMatch) {
      addItem(barcodeMatch);
      setSearchQuery("");
      return;
    }
    // Si no match exacto y hay 1 solo resultado fuzzy, agregarlo
    const fuzzy = products.filter((p) =>
      p.name.toLowerCase().includes(q),
    );
    if (fuzzy.length === 1) {
      addItem(fuzzy[0]);
      setSearchQuery("");
      return;
    }
    toast.error(`"${raw}" no coincide exactamente`);
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

  // Audit-Fix: usar createPortal para escapar del stacking context del motion.div
  // padre en TerminalShell. Sin esto, el z-[200] no puede cubrir el sidebar (z-40)
  // porque el motion.div crea un stacking context que atrapa los z-index hijos.
  if (typeof window === 'undefined') return null; // SSR guard
  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col">
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
          <select
            value={selectedPayment}
            onChange={(e) => setSelectedPayment(e.target.value as any)}
            className="bg-background border border-border rounded-lg px-2 py-1.5 text-xs font-black uppercase tracking-widest focus:ring-1 focus:ring-primary outline-none"
            aria-label="Seleccionar método de pago"
          >
            <option value="cash">Efectivo</option>
            <option value="card">Tarjeta</option>
            <option value="transfer">Transfer.</option>
            <option value="wallet">Billetera</option>
          </select>
        </div>
      </header>

      {/* ── SEARCH GIGANTE ── */}
      <div className="p-4 sm:p-6 border-b border-border shrink-0">
        <form onSubmit={handleSearchSubmit} className="max-w-3xl mx-auto">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-muted-foreground" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Escanea, escribe nombre, o 'SKU*' + Enter para agregar..."
              className="w-full pl-14 pr-4 py-4 sm:py-5 text-lg sm:text-xl font-bold rounded-2xl border-2 border-border bg-card focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none shadow-md"
              aria-label="Búsqueda Express"
              autoComplete="off"
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 text-center uppercase tracking-widest">
            Enter = agregar · F9 = cobrar · Esc = cancelar
          </p>
        </form>
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
              {frequentProducts.slice(0, 12).map((fp) => (
                <button
                  key={fp.product.id}
                  type="button"
                  onClick={() => addItem(fp.product)}
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
                  <p className="text-sm font-black text-primary tabular-nums mt-1">
                    {formatCurrency(fp.product.price || 0)}
                  </p>
                </button>
              ))}
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
                {items.map((item) => (
                  <motion.div
                    key={`${item.product_id}-${item.variant_id}`}
                    layout
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="flex items-center gap-2 p-2 rounded-lg border border-border bg-background"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">
                        {item.product?.name || "Producto"}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {formatCurrency(item.price)} c/u
                      </p>
                    </div>
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
                      <span className="w-8 text-center font-black tabular-nums">
                        {item.quantity}
                      </span>
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
                ))}
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
              disabled={isProcessingSale}
              className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {isProcessingSale ? "Procesando..." : "Confirmar"}
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
