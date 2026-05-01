"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShoppingCart,
  X,
} from "lucide-react";
import ProductImage from "@/components/ui/ProductImage";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/ui/useMobile";
import { useTaxes } from "@/hooks/api/useTaxes";
import { useAuthStore } from "@/store";
import { BaseModal } from "@/components/ui/BaseModal";
import { SecondaryButton } from "@/components/ui/atomic";
import { POSCartItem } from "./POSCartItem";
import { POSCartSummary } from "./POSCartSummary";
import { POSCartActions } from "./POSCartActions";
import { SuccessView } from "./POSCartSuccessView";
import { usePOSCartExports } from "./usePOSCartExports";
import type { POSCartProps } from "./POSCart.types";
import type { PaymentMethod } from "@/types";

// ── Main POSCart Orchestrator ──────────────────────────────

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
}: POSCartProps) => {
  const { user } = useAuthStore();
  const { data: taxes = [] } = useTaxes(user?.activeStoreId);
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>("cash");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [isEasyReading, setIsEasyReading] = useState(false);
  const [viewingImage, setViewingImage] = useState<{
    url: string;
    name: string;
  } | null>(null);
  const isMobileHook = useIsMobile();
  const isMobile = isMobileProp ?? isMobileHook;

  const { generatePDF, shareWhatsApp, exportAsImage } = usePOSCartExports({
    lastSale,
  });

  const Container = motion.div;
  const containerProps = {
    initial: isMobile ? { y: "100%" } : { x: 300, opacity: 0 },
    animate: isMobile ? { y: 0 } : { x: 0, opacity: 1 },
    exit: isMobile ? { y: "100%" } : { x: 300, opacity: 0 },
    transition: { type: "spring", damping: 25, stiffness: 200 } as const,
  };

  return (
    <Container
      {...containerProps}
      className={cn(
        isMobile
          ? "fixed inset-0 z-[100] bg-background flex flex-col overflow-hidden"
          : "w-full lg:w-[450px] sticky top-[100px] h-[calc(100vh-160px)] flex flex-col overflow-hidden rounded-[2.5rem] border border-border bg-card shadow-2xl relative z-20",
        isEasyReading && "text-xl",
      )}
    >
      <div
        className={cn(
          "flex-1 flex flex-col w-full bg-card overflow-hidden",
          isMobile ? "max-w-5xl mx-auto" : "rounded-[2.5rem]",
        )}
      >
        {/* Header */}
        <div className="bg-primary p-4 sm:p-6 sm:pb-10 flex items-center justify-between text-primary-foreground relative shrink-0">
          <div className="flex flex-col gap-0.5 sm:gap-1">
            <h3
              className={cn(
                "font-black uppercase tracking-widest flex items-center gap-2 sm:gap-3",
                isEasyReading ? "text-2xl" : "text-base sm:text-lg",
              )}
            >
              <ShoppingCart
                className={cn(
                  isEasyReading
                    ? "w-7 h-7 sm:w-8 sm:h-8"
                    : "w-5 h-5 sm:w-6 sm:h-6",
                )}
              />
              Caja Registradora
            </h3>
            <span
              className={cn(
                "font-bold opacity-70 uppercase tracking-widest",
                isEasyReading ? "text-xs sm:text-sm" : "text-xs sm:text-xs",
              )}
            >
              {items.length} {items.length === 1 ? "Producto" : "Productos"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setIsEasyReading(!isEasyReading)}
              className={cn(
                "p-2.5 sm:p-3 min-h-[44px] rounded-lg sm:rounded-xl transition-all active:scale-90 flex items-center gap-2 font-black uppercase tracking-widest text-xs sm:text-xs",
                isEasyReading
                  ? "bg-background text-primary"
                  : "bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground",
              )}
            >
              <div className="w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center border-2 border-current rounded text-xs sm:text-xs">
                A
              </div>
              <span className="hidden sm:inline">Lectura Fácil</span>
            </button>
            <button
              onClick={onClose}
              className="p-2.5 sm:p-3 bg-primary-foreground/10 hover:bg-primary-foreground/20 rounded-lg sm:rounded-xl transition-colors active:scale-90"
              aria-label="Cerrar carrito"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col overflow-hidden -mt-4 sm:-mt-6 rounded-t-2xl sm:rounded-t-3xl bg-card relative z-10">
          {lastSale ? (
            <SuccessView
              onGeneratePDF={generatePDF}
              onShareWhatsApp={shareWhatsApp}
              onExportAsImage={exportAsImage}
              onClearLastSale={onClearLastSale}
            />
          ) : items.length === 0 ? (
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
              <SecondaryButton
                label="Ir al Catálogo"
                onClick={onClose}
                className="mt-4"
              />
            </div>
          ) : (
            <>
              <POSCartActions
                isProcessing={isProcessing}
                itemCount={items.length}
                selectedPayment={selectedPayment}
                onSetSelectedPayment={setSelectedPayment}
                onCheckout={onCheckout}
                discount={discount}
                setDiscount={setDiscount}
                showClearConfirm={showClearConfirm}
                onSetShowClearConfirm={setShowClearConfirm}
                onClearCart={onClearCart}
                onClose={onClose}
                showOptions={showOptions}
                onSetShowOptions={setShowOptions}
              />

              <div className="flex-1 relative overflow-hidden flex flex-col">
                <div className={cn("flex-1 overflow-y-auto p-4 sm:p-8 min-h-0")}>
                  <div className="space-y-4 pb-8">
                    <AnimatePresence initial={false}>
                      {items.map((item) => (
                        <POSCartItem
                          key={`${item.product_id}-${item.variant_id}`}
                          item={item}
                          isEasyReading={isEasyReading}
                          onUpdateQuantity={onUpdateQuantity}
                          onRemoveItem={onRemoveItem}
                          onViewImage={(url, name) =>
                            setViewingImage({ url, name })
                          }
                          updateItemDiscount={updateItemDiscount}
                          updateItemPayment={updateItemPayment}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-card via-card/80 to-transparent pointer-events-none z-10" />
              </div>

              <POSCartSummary
                items={items}
                getSubtotal={getSubtotal}
                getDiscountAmount={getDiscountAmount}
                getTotal={getTotal}
                discount={discount}
                prorateGlobalPayment={prorateGlobalPayment}
                selectedPayment={selectedPayment}
                onSetSelectedPayment={setSelectedPayment}
                isMobile={isMobile}
              />
            </>
          )}
        </div>

        {/* Image viewer modal */}
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
