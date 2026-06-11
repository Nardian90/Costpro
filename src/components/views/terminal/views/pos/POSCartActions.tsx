"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  Trash2,
  DollarSign,
  CreditCard,
  Settings,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CostProLoader } from "@/components/ui/CostProLoader";
import { BaseModal } from "@/components/ui/BaseModal";
import { PrimaryButton, SecondaryButton } from "@/components/ui/atomic";
import { POSCartDiscountModal } from "./POSCartDiscountModal";
import type { POSCartActionsProps } from "./POSCart.types";

export const POSCartActions = ({
  isProcessing,
  itemCount,
  selectedPayment,
  onSetSelectedPayment,
  onCheckout,
  discount,
  setDiscount,
  showClearConfirm,
  onSetShowClearConfirm,
  onClearCart,
  onClose,
  showOptions,
  onSetShowOptions,
}: POSCartActionsProps) => (
  <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border p-3 sm:p-4 space-y-3 shadow-md">
    <div className="flex gap-3">
      <button
        type="button"
        onClick={() =>
          onCheckout(
            selectedPayment,
            discount && discount.value > 0 ? discount : null,
          )
        }
        disabled={isProcessing || itemCount === 0}
        className="flex-1 h-12 sm:h-14 rounded-xl sm:rounded-2xl bg-primary text-primary-foreground font-black text-xs sm:text-sm shadow-xl shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
        aria-label={`Confirmar venta${itemCount === 0 ? ' — carrito vacío' : ` con ${itemCount} productos`}`}
      >
        {isProcessing ? (
          <CostProLoader
            size={20}
            showText={false}
            showSubtext={false}
          />
        ) : (
          <Check className="w-5 h-5 sm:w-6 sm:h-6" />
        )}
        {isProcessing ? "PROCESANDO..." : "CONFIRMAR VENTA"}
      </button>
      <button
        type="button"
        onClick={() => onSetShowClearConfirm(true)}
        className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-destructive/10 text-destructive border-2 border-destructive/20 hover:bg-destructive/20 transition-all flex items-center justify-center active:scale-[0.95]"
        title="Anular Carrito"
        aria-label="Anular carrito completo"
      >
        <Trash2 className="w-5 h-5 sm:w-6 sm:h-6" />
      </button>
    </div>

    {/* Accordion Toggle for Options */}
    <button
      type="button"
      onClick={() => onSetShowOptions(!showOptions)}
      className="w-full flex items-center justify-center gap-2 py-1 min-h-[44px] text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors"
      aria-expanded={showOptions}
      aria-controls="pos-cart-options"
    >
      <Settings
        className={cn(
          "w-3.5 h-3.5 transition-transform duration-500",
          showOptions && "rotate-180",
        )}
        aria-hidden="true"
      />
      {showOptions ? "Ocultar Opciones" : "Pago y Descuento"}
    </button>

    <AnimatePresence>
      {showOptions && (
        <motion.div
          id="pos-cart-options"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden space-y-4 pt-1 pb-2"
        >
          {/* Payment Method Selection */}
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Seleccionar método de pago">
            <button
              type="button"
              onClick={() => onSetSelectedPayment("cash")}
              className={cn(
                "p-3 min-h-[44px] rounded-xl flex items-center justify-center gap-2 border-2 transition-all bg-background",
                selectedPayment === "cash"
                  ? "border-primary shadow-lg shadow-primary/10 text-primary"
                  : "border-border text-muted-foreground",
              )}
              role="radio"
              aria-checked={selectedPayment === "cash"}
              aria-label="Pagar en efectivo"
            >
              <DollarSign className="w-4 h-4" aria-hidden="true" />
              <span className="text-xs font-black uppercase tracking-widest">
                Efectivo
              </span>
            </button>
            <button
              type="button"
              onClick={() => onSetSelectedPayment("transfer")}
              className={cn(
                "p-3 min-h-[44px] rounded-xl flex items-center justify-center gap-2 border-2 transition-all bg-background",
                selectedPayment === "transfer"
                  ? "border-primary shadow-lg shadow-primary/10 text-primary"
                  : "border-border text-muted-foreground",
              )}
              role="radio"
              aria-checked={selectedPayment === "transfer"}
              aria-label="Pagar por transferencia"
            >
              <CreditCard className="w-4 h-4" aria-hidden="true" />
              <span className="text-xs font-black uppercase tracking-widest">
                Transf.
              </span>
            </button>
          </div>

          {/* Discount Selection */}
          <POSCartDiscountModal discount={discount} setDiscount={setDiscount} />
        </motion.div>
      )}
    </AnimatePresence>

    {/* Modal de confirmación para vaciar carrito */}
    <BaseModal
      open={showClearConfirm}
      onOpenChange={onSetShowClearConfirm}
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
            onClick={() => onSetShowClearConfirm(false)}
            className="flex-1"
          />
          <PrimaryButton
            label="Sí, Anular Todo"
            onClick={() => {
              onClearCart();
              onClose();
              onSetShowClearConfirm(false);
              toast.success("Carrito vaciado");
            }}
            className="flex-1 bg-destructive hover:bg-destructive/90 text-primary-foreground shadow-destructive/20"
          />
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
  </div>
);
