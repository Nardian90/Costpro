"use client";

import React, { useState, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  ShoppingCart,
  X,
  Trash2,
  Check,
  Settings,
  AlertTriangle,
  ChevronDown,
} from "lucide-react";
import ProductImage from "@/components/ui/ProductImage";
import { cn, formatCurrency } from "@/lib/utils";
import { useIsMobile } from "@/hooks/ui/useMobile";
import { useAuthStore } from "@/store";
import { useCartStore } from "@/store/cart";
import { useShallow } from "zustand/react/shallow";
import { BaseModal } from "@/components/ui/BaseModal";
import { SecondaryButton } from "@/components/ui/atomic";
import { CostProLoader } from "@/components/ui/CostProLoader";
import { toast } from "sonner";
import { POSCartItem } from "./POSCartItem";
import { POSCartSuccessView } from "./POSCartSuccessView";
import { usePOSCartExports } from "./usePOSCartExports";
import { CustomerSelector } from "./CustomerSelector";
import { POSCartCheckoutPanel } from "./POSCartCheckoutPanel";
import type { POSCartProps } from "./POSCart.types";

/**
 * POS-3a-2 / 3a-3 / 3a-4: POSCart rediseñado.
 *
 * Nuevo layout (3 zonas claras):
 * 1. Header (compacto): título + items count + lecturafácil + close
 * 2. CustomerSelector (colapsable en mobile)
 * 3. Mobile: tabs "🛒 Items (N)" | "💳 Cobrar". Desktop: todo vertical.
 * 4. Zona Items: scroll independiente, SIEMPRE visible (la queja #1 del usuario).
 * 5. Zona Cobrar: total + método + efectivo+vuelto + mixto + descuento + CONFIRMAR.
 *
 * Antes: Confirmar Venta arriba → items en medio enterrados → summary abajo.
 * Ahora: Items primero (zona principal) → Cobrar al final con CTA gigante.
 */
export const POSCart = ({
  items,
  onRemoveItem,
  onUpdateQuantity,
  onClearCart,
  getSubtotal,
  getDiscountAmount,
  getTotal,
  discount,
  setDiscount,
  isMobile: isMobileProp,
  isProcessing,
  onCheckout,
  onClose,
  lastSale,
  onClearLastSale,
  updateItemDiscount,
  updateItemPayment,
  prorateGlobalPayment,
  getTaxAmount,
}: POSCartProps) => {
  const { user } = useAuthStore();
  const { selectedPayment, setSelectedPayment } = useCartStore(useShallow((s) => ({
    selectedPayment: s.selectedPayment,
    setSelectedPayment: s.setSelectedPayment,
  })));
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isEasyReading, setIsEasyReading] = useState(false);
  const [activeTab, setActiveTab] = useState<"items" | "checkout">("items");
  const touchStartY = useRef(0);
  const [viewingImage, setViewingImage] = useState<{ url: string; name: string } | null>(null);

  const isMobileHook = useIsMobile();
  const isMobile = isMobileProp ?? isMobileHook;
  const prefersReducedMotion = useReducedMotion();

  const { generatePDF, shareWhatsApp, exportAsImage } = usePOSCartExports({ lastSale });

  const Container = motion.div;
  const containerProps = {
    initial: isMobile ? { y: "100%" } : { x: 300, opacity: 0 },
    animate: prefersReducedMotion ? {} : (isMobile ? { y: 0 } : { x: 0, opacity: 1 }),
    exit: prefersReducedMotion ? {} : (isMobile ? { y: "100%" } : { x: 300, opacity: 0 }),
    transition: { type: "spring", damping: 25, stiffness: 200 } as const,
  };

  const itemCount = items.length;
  // FIX-CONSISTENCY (2026-07-10): el CTA y el header del carrito deben mostrar el total
  // esperado (con recargos/descuentos por método) para coincidir con el tab Pago.
  // Antes usaban getTotal() que restaba un descuento global fantasma y causaba
  // discrepancia: header/CTA mostraban $1,590 pero Pago tab mostraba $1,680.
  const expectedTotal = useCartStore.getState().getExpectedTotalCup();

  return (
    <Container
      {...containerProps}
      className={cn(
        isMobile
          // POS-3a mobile: full-screen overlay con safe-area para notch iOS.
          // Antes: fixed inset-0 — pero el header podía quedar bajo el notch.
          // Ahora: padding-top con env(safe-area-inset-top) para notch.
          ? "fixed inset-0 z-[100] bg-background flex flex-col overflow-hidden"
          // POS-3a: Carrito como sidebar derecha fija, full-height top→bottom,
          // espejo del sidebar izquierdo. Sin rounded, sin margen, sin sticky.
          // Antes: sticky top-[80px] h-[calc(100vh-120px)] rounded-[2.5rem] shadow-2xl.
          // Ahora: fixed right-0 top-0 h-screen, border-l para separar del contenido.
          // POS-3a-v3 Fix: z-50 (no z-30) para que el modal de cobro dentro del sidebar
          // se vea por encima del sticky search bar (z-40) del POSView.
          : "hidden lg:flex fixed right-0 top-0 h-screen w-[440px] xl:w-[480px] 2xl:w-[520px] flex-col overflow-hidden border-l border-border bg-card z-50",
        isEasyReading && "text-xl",
      )}
    >
      <div
        className={cn(
          "flex-1 flex flex-col w-full bg-card overflow-hidden",
          isMobile ? "max-w-5xl mx-auto" : "",
        )}
        style={isMobile ? { paddingTop: "env(safe-area-inset-top, 0px)" } : undefined}
      >
        {/* ── HEADER (compacto) ─────────────────────────────────────── */}
        <div className="bg-primary p-3 sm:p-4 flex items-center justify-between text-primary-foreground shrink-0">
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            <h3
              className={cn(
                "font-black uppercase tracking-widest flex items-center gap-2 sm:gap-3 truncate",
                isEasyReading ? "text-2xl" : "text-base sm:text-lg",
              )}
            >
              <ShoppingCart className={cn(isEasyReading ? "w-7 h-7" : "w-5 h-5")} />
              Caja
              <span className="bg-primary-foreground/20 px-2 py-0.5 rounded-full text-[10px] sm:text-xs tabular-nums">
                {itemCount}
              </span>
            </h3>
            <span className="font-bold opacity-70 uppercase tracking-widest text-[10px] sm:text-xs truncate">
              {itemCount === 0 ? "Vacío" : `${itemCount} ${itemCount === 1 ? "producto" : "productos"}`}
              {itemCount > 0 && ` · ${formatCurrency(expectedTotal)}`}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsEasyReading(!isEasyReading)}
              className={cn(
                "p-2 sm:p-2.5 min-h-[44px] rounded-lg sm:rounded-xl transition-all active:scale-90 flex items-center gap-2 font-black uppercase tracking-widest text-[10px] sm:text-xs",
                isEasyReading
                  ? "bg-background text-primary"
                  : "bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground",
              )}
              aria-label={isEasyReading ? "Desactivar lectura fácil" : "Activar lectura fácil"}
              title="Lectura fácil"
            >
              <div className="w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center border-2 border-current rounded">
                A
              </div>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 sm:p-2.5 min-h-[44px] min-w-[44px] bg-primary-foreground/10 hover:bg-primary-foreground/20 rounded-lg sm:rounded-xl transition-colors active:scale-90 flex items-center justify-center"
              aria-label="Cerrar carrito"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>
        </div>

        {/* ── BODY ──────────────────────────────────────────────────── */}
        <div
          className="flex-1 flex flex-col overflow-hidden bg-card"
          onTouchStart={(e) => { touchStartY.current = e.touches[0].clientY; }}
          onTouchEnd={(e) => {
            const diff = e.changedTouches[0].clientY - touchStartY.current;
            if (diff > 120) onClose();
          }}
        >
          {lastSale ? (
            <POSCartSuccessView
              onGeneratePDF={generatePDF}
              onShareWhatsApp={shareWhatsApp}
              onExportAsImage={exportAsImage}
              onClearLastSale={onClearLastSale}
              lastSale={lastSale ?? undefined}
            />
          ) : itemCount === 0 ? (
            /* ── EMPTY STATE ── */
            <div className="flex-1 flex flex-col items-center justify-start pt-12 p-6 text-center space-y-4">
              <div className="w-32 h-32 bg-muted rounded-full flex items-center justify-center mb-4">
                <ShoppingCart className="w-16 h-16 opacity-10" />
              </div>
              <p className="font-black uppercase tracking-widest text-xl text-foreground">
                Carrito Vacío
              </p>
              <p className="text-muted-foreground max-w-xs mx-auto">
                Agrega productos del catálogo para comenzar una nueva venta.
              </p>
              <SecondaryButton label="Ir al Catálogo" onClick={onClose} className="mt-4" />
            </div>
          ) : (
            <>
              {/* ── CustomerSelector (siempre arriba, compacto) ── */}
              <div className="px-3 sm:px-4 pt-3 pb-2 border-b border-border/50 bg-muted/20 shrink-0">
                <CustomerSelector />
              </div>

              {/* ── TABS (mobile + desktop, mismo patrón) ──
                  POS-3a-v3: Antes en desktop ambas zonas se renderizaban juntas
                  causando overflow y superposición. Ahora tabs funcionan igual
                  en mobile y desktop: solo una zona visible a la vez. */}
              <div className="flex border-b border-border bg-card shrink-0" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "items"}
                  aria-controls="pos-cart-items-zone"
                  onClick={() => setActiveTab("items")}
                  className={cn(
                    "flex-1 py-3 text-xs font-black uppercase tracking-widest transition-colors border-b-2 -mb-px flex items-center justify-center gap-1.5",
                    activeTab === "items"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  🛒 Items
                  {itemCount > 0 && (
                    <span className={cn(
                      "px-1.5 py-0.5 rounded-full text-[9px] tabular-nums",
                      activeTab === "items" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}>
                      {itemCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "checkout"}
                  aria-controls="pos-cart-checkout-zone"
                  onClick={() => setActiveTab("checkout")}
                  className={cn(
                    "flex-1 py-3 text-xs font-black uppercase tracking-widest transition-colors border-b-2 -mb-px flex items-center justify-center gap-1.5",
                    activeTab === "checkout"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  💳 Pago
                  {expectedTotal > 0 && (
                    <span className={cn(
                      "text-[10px] tabular-nums",
                      activeTab === "checkout" ? "text-primary" : "text-muted-foreground"
                    )}>
                      {formatCurrency(expectedTotal)}
                    </span>
                  )}
                </button>
              </div>

              {/* ── ZONA 1: ITEMS (scroll independiente, solo visible cuando tab=items) ── */}
              <div
                id="pos-cart-items-zone"
                role="tabpanel"
                className={cn(
                  "flex-1 overflow-y-auto min-h-0 p-3 sm:p-4",
                  activeTab !== "items" && "hidden",
                )}
              >
                <div className="space-y-3 pb-4">
                  <AnimatePresence initial={false}>
                    {items.map((item) => (
                      <POSCartItem
                        key={`${item.product_id}-${item.variant_id}`}
                        item={item}
                        isEasyReading={isEasyReading}
                        onUpdateQuantity={onUpdateQuantity}
                        onRemoveItem={onRemoveItem}
                        onViewImage={(url, name) => setViewingImage({ url, name })}
                        updateItemDiscount={updateItemDiscount}
                        updateItemPayment={updateItemPayment}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </div>

              {/* ── ZONA 2: CHECKOUT PANEL (solo visible cuando tab=checkout) ── */}
              <div
                id="pos-cart-checkout-zone"
                role="tabpanel"
                className={cn(
                  "flex-1 overflow-y-auto min-h-0",
                  activeTab !== "checkout" && "hidden",
                )}
              >
                <POSCartCheckoutPanel
                  items={items}
                  getSubtotal={getSubtotal}
                  getDiscountAmount={getDiscountAmount}
                  getTotal={getTotal}
                  getTaxAmount={getTaxAmount}
                  discount={discount}
                  setDiscount={setDiscount}
                  prorateGlobalPayment={prorateGlobalPayment}
                  selectedPayment={selectedPayment}
                  onSetSelectedPayment={setSelectedPayment}
                  isProcessing={isProcessing}
                  itemCount={itemCount}
                  onCheckout={onCheckout}
                  onClearCart={() => setShowClearConfirm(true)}
                  isMobile={isMobile}
                />
              </div>

              {/* ── CTA FIJO ABAJO (siempre visible, sin importar el tab) ──
                  POS-3a-v3: El botón COBRAR nunca debe quedar oculto por scroll.
                  Sticky bottom dentro del sidebar, sin border-t-2 que rompía visual. */}
              <div className="shrink-0 border-t border-border bg-card p-3 sm:p-4">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      // Si está en tab items, cambiar a checkout primero;
                      // si ya está en checkout, disparar cobro.
                      if (activeTab !== "checkout") {
                        setActiveTab("checkout");
                      } else {
                        // Trigger del modal de confirmación dentro del panel
                        const btn = document.querySelector<HTMLButtonElement>('#pos-checkout-cta');
                        btn?.click();
                      }
                    }}
                    disabled={isProcessing || itemCount === 0}
                    className="flex-1 h-14 sm:h-16 rounded-xl sm:rounded-2xl bg-primary text-primary-foreground font-black text-sm sm:text-base shadow-xl shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
                    aria-label={`Cobrar ${itemCount} productos por ${formatCurrency(expectedTotal)}`}
                  >
                    <Check className="w-6 h-6" />
                    <span className="uppercase tracking-widest">Cobrar</span>
                    {expectedTotal > 0 && (
                      <span className="bg-primary-foreground/20 px-2 py-1 rounded-md text-xs sm:text-sm tabular-nums">
                        {formatCurrency(expectedTotal)}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowClearConfirm(true)}
                    className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-destructive/10 text-destructive border-2 border-destructive/20 hover:bg-destructive/20 transition-all flex items-center justify-center active:scale-95 shrink-0"
                    title="Anular Carrito"
                    aria-label="Anular carrito completo"
                  >
                    <Trash2 className="w-5 h-5 sm:w-6 sm:h-6" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Modal: confirmación para vaciar carrito ── */}
        <BaseModal
          open={showClearConfirm}
          onOpenChange={setShowClearConfirm}
          title={
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-6 h-6" />
              <span>Confirmar Anulación</span>
            </div>
          }
          footer={
            <>
              <SecondaryButton
                label="No, Volver"
                onClick={() => setShowClearConfirm(false)}
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => {
                  onClearCart();
                  onClose();
                  setShowClearConfirm(false);
                  toast.success("Carrito vaciado");
                }}
                className="flex-1 h-11 rounded-xl bg-destructive text-primary-foreground text-xs font-black uppercase tracking-widest hover:bg-destructive/90 transition-colors"
              >
                Sí, Anular Todo
              </button>
            </>
          }
        >
          <div className="py-4 space-y-3">
            <p className="font-bold text-center">
              ¿Estás seguro de que deseas anular todos los productos del carrito?
            </p>
            <p className="text-sm text-muted-foreground text-center">
              Esta acción no se puede deshacer y perderás la selección actual.
            </p>
          </div>
        </BaseModal>

        {/* ── Modal: visor de imagen ── */}
        <BaseModal
          open={!!viewingImage}
          onOpenChange={() => setViewingImage(null)}
          title={viewingImage?.name}
        >
          <div className="aspect-square w-full rounded-2xl overflow-hidden bg-muted">
            {viewingImage && (
              <ProductImage
                src={viewingImage.url}
                name={viewingImage.name}
                className="w-full h-full object-contain"
                forceShow
              />
            )}
          </div>
          <div className="mt-4">
            <SecondaryButton
              label="Cerrar"
              onClick={() => setViewingImage(null)}
              className="w-full"
            />
          </div>
        </BaseModal>
      </div>
    </Container>
  );
};
