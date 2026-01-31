'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, X, Trash2, Minus, Plus, DollarSign, CreditCard, Loader2, Check } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { PaymentMethod, TaxConfiguration } from '@/types';
import { useIsMobile } from '@/hooks/ui/useMobile';
import { useTaxes } from '@/hooks/api/useTaxes';
import { useAuthStore } from '@/store';

interface POSCartProps {
  items: any[];
  onRemoveItem: (productId: string, variantId: string | null) => void;
  onUpdateQuantity: (productId: string, variantId: string | null, quantity: number) => void;
  onClearCart: () => void;
  getSubtotal: () => number;
  getDiscountAmount: () => number;
  getTaxAmount: () => number;
  getTotal: () => number;
  discount: { type: 'fixed' | 'percentage', value: number } | null;
  setDiscount: (discount: { type: 'fixed' | 'percentage', value: number } | null) => void;
  appliedTaxes: TaxConfiguration[];
  toggleTax: (tax: TaxConfiguration) => void;
  isProcessing: boolean;
  onCheckout: (paymentMethod: PaymentMethod, discount?: { type: 'fixed' | 'percentage', value: number } | null) => Promise<void>;
  onClose: () => void;
}

export const POSCart = ({
  items,
  onRemoveItem,
  onUpdateQuantity,
  onClearCart,
  getSubtotal,
  getDiscountAmount,
  getTaxAmount,
  getTotal,
  discount,
  setDiscount,
  appliedTaxes,
  toggleTax,
  isProcessing,
  onCheckout,
  onClose
}: POSCartProps) => {
  const { user } = useAuthStore();
  const { data: taxes = [] } = useTaxes(user?.activeStoreId);
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>('cash');
  const isMobile = useIsMobile();

  const Container = isMobile ? 'div' : motion.div;
  const containerProps = isMobile ? {} : {
    initial: { x: 300, opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: 300, opacity: 0 }
  };

  const cartTotal = Math.max(0, getSubtotal() - getDiscountAmount());

  return (
    <Container
      {...containerProps}
      className={cn(
        "w-full shrink-0 z-20",
        !isMobile && "lg:w-[400px] lg:sticky top-24 lg:order-last"
      )}
    >
      <div className={cn(
        "border border-primary/20 bg-card overflow-hidden flex flex-col",
        isMobile ? "rounded-t-3xl h-[85vh] shadow-2xl" : "rounded-xl shadow-2xl"
      )}>
        {/* Header - Fixed */}
        <div className="bg-primary p-4 sm:p-6 flex items-center justify-between text-white shrink-0">
          <h3 className="font-black text-base sm:text-lg uppercase tracking-widest flex items-center gap-3">
            <ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6" />
            Caja Registradora
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors active:scale-90"
            aria-label="Cerrar carrito"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-muted-foreground">
            <ShoppingCart className="w-20 h-20 mx-auto mb-6 opacity-10" />
            <p className="font-black uppercase tracking-widest text-sm text-center">Carrito Vacío</p>
            <p className="text-xs mt-2 opacity-60">Agregue productos para comenzar</p>
          </div>
        ) : (
          <>
            {/* Scrollable Content */}
            <div className={cn(
              "flex-1 overflow-y-auto no-scrollbar",
              isMobile ? "p-4" : "p-6"
            )}>
              <div className={cn("space-y-3 no-scrollbar", !isMobile && "max-h-[40vh] overflow-y-auto")}>
                <AnimatePresence mode="popLayout">
                  {items.map(item => (
                    <motion.div
                      key={`${item.product_id}-${item.variant_id}`}
                      initial={{ opacity: 0, scale: 0.95, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, x: -20 }}
                      layout
                      className="p-3 sm:p-4 rounded-xl border border-border bg-background/50 group relative hover:border-primary/30 transition-colors"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-black text-xs sm:text-sm uppercase tracking-tight truncate pr-8">{item.product.name}</div>
                          <div className="text-[10px] font-bold text-muted-foreground mt-0.5">{formatCurrency(item.price)} / unidad</div>
                        </div>
                        <button
                          onClick={() => onRemoveItem(item.product_id, item.variant_id)}
                          className="absolute top-2 right-2 text-muted-foreground hover:text-destructive p-2 rounded-full hover:bg-destructive/5 transition-all active:scale-90"
                          aria-label="Eliminar producto"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 bg-background rounded-lg p-0.5 border border-border">
                          <button
                            onClick={() => onUpdateQuantity(item.product_id, item.variant_id, item.quantity - 1)}
                            className="w-10 h-10 flex items-center justify-center rounded-md hover:bg-primary/10 hover:text-primary transition-colors active:bg-primary/20"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="w-8 text-center font-black text-sm">{item.quantity}</span>
                          <button
                            onClick={() => onUpdateQuantity(item.product_id, item.variant_id, item.quantity + 1)}
                            className="w-10 h-10 flex items-center justify-center rounded-md hover:bg-primary/10 hover:text-primary transition-colors active:bg-primary/20"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        <span className="font-black text-base sm:text-lg text-primary">{formatCurrency(item.subtotal)}</span>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {/* Descuento Section (Still in scrollable for mobile to save space in sticky footer) */}
              <div className="mt-6 space-y-4 pt-6 border-t border-border/50">
                <div className="px-1 space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest block">Descuento</label>
                    <div className="flex gap-1 bg-muted p-0.5 rounded-lg border border-border">
                      <button
                        onClick={() => setDiscount({ type: 'percentage', value: discount?.value || 0 })}
                        className={cn(
                          "px-3 py-1 rounded-md text-[10px] font-black uppercase transition-all",
                          discount?.type === 'percentage' ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        %
                      </button>
                      <button
                        onClick={() => setDiscount({ type: 'fixed', value: discount?.value || 0 })}
                        className={cn(
                          "px-3 py-1 rounded-md text-[10px] font-black uppercase transition-all",
                          discount?.type === 'fixed' ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        $
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {[0, 5, 10, 15].map(d => (
                      <button
                        key={d}
                        onClick={() => {
                          setDiscount({ type: discount?.type || 'percentage', value: d });
                        }}
                        className={cn(
                          "flex-1 py-2.5 rounded-xl border font-black text-[10px] uppercase transition-all active:scale-95",
                          discount?.value === d && discount?.type === 'percentage' ? "bg-primary text-white border-primary shadow-md shadow-primary/20" : "bg-background text-muted-foreground border-border hover:border-primary/30"
                        )}
                      >
                        {d === 0 ? 'Sin' : `${d}%`}
                      </button>
                    ))}
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-black text-xs">
                      {discount?.type === 'percentage' ? '%' : '$'}
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={discount?.value || ''}
                      onChange={(e) => setDiscount({ type: discount?.type || 'percentage', value: parseFloat(e.target.value) || 0 })}
                      className="neu-input w-full !pl-8 text-sm font-bold h-11"
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Sticky Footer - Always visible on mobile */}
            <div className={cn(
              "shrink-0 bg-background/95 backdrop-blur-md border-t border-border/50",
              isMobile ? "p-4 pb-8 space-y-4 shadow-[0_-10px_30px_rgba(0,0,0,0.1)]" : "p-6 space-y-6"
            )}>
              {/* Resumen de Totales */}
              <div className="px-4 py-4 sm:py-6 bg-muted/30 rounded-2xl border border-border/50 space-y-2 sm:space-y-3">
                <div className="flex justify-between items-center text-[10px] font-black uppercase text-muted-foreground tracking-widest">
                  <span>Subtotal</span>
                  <span className="text-foreground">{formatCurrency(getSubtotal())}</span>
                </div>

                {getDiscountAmount() > 0 && (
                  <div className="flex justify-between items-center text-[10px] font-black uppercase text-destructive tracking-widest">
                    <span>Descuento ({discount?.type === 'percentage' ? `${discount.value}%` : 'Monto'})</span>
                    <span>-{formatCurrency(getDiscountAmount())}</span>
                  </div>
                )}

                <div className="flex justify-between items-center pt-3 sm:pt-4 border-t border-primary/10">
                  <span className="text-[10px] sm:text-xs font-black uppercase text-foreground tracking-widest">Total Final</span>
                  <span className="text-2xl sm:text-4xl font-black text-primary tracking-tighter">
                    {formatCurrency(cartTotal)}
                  </span>
                </div>
              </div>

              {/* Payment Methods */}
              <div className="grid grid-cols-2 gap-3">
                 <button
                  onClick={() => setSelectedPayment('cash')}
                  disabled={isProcessing}
                  className={cn(
                    "p-3 sm:p-4 rounded-xl flex flex-col items-center gap-1 sm:gap-2 border-2 transition-all bg-background min-h-[70px] active:scale-95 disabled:opacity-50",
                    selectedPayment === 'cash' ? "border-primary shadow-lg shadow-primary/10" : "border-transparent opacity-60 hover:opacity-100"
                  )}
                 >
                   <DollarSign className={cn("w-5 h-5 sm:w-6 sm:h-6", selectedPayment === 'cash' ? "text-primary" : "text-muted-foreground")} />
                   <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-foreground">Efectivo</span>
                 </button>
                 <button
                  onClick={() => setSelectedPayment('transfer')}
                  disabled={isProcessing}
                  className={cn(
                    "p-3 sm:p-4 rounded-xl flex flex-col items-center gap-1 sm:gap-2 border-2 transition-all bg-background min-h-[70px] active:scale-95 disabled:opacity-50",
                    selectedPayment === 'transfer' ? "border-primary shadow-lg shadow-primary/10" : "border-transparent opacity-60 hover:opacity-100"
                  )}
                 >
                   <CreditCard className={cn("w-5 h-5 sm:w-6 sm:h-6", selectedPayment === 'transfer' ? "text-primary" : "text-muted-foreground")} />
                   <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-foreground">Transf.</span>
                 </button>
              </div>

              {/* Main Action */}
              <button
                onClick={() => onCheckout(selectedPayment, (discount && discount.value > 0) ? discount : null)}
                disabled={isProcessing || items.length === 0}
                className="w-full h-16 sm:h-20 rounded-2xl bg-primary text-white font-black text-lg sm:text-xl shadow-2xl shadow-primary/30 disabled:opacity-50 flex items-center justify-center gap-3 transition-all active:scale-[0.98] hover:brightness-110"
              >
                {isProcessing ? (
                  <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin" />
                ) : (
                  <Check className="w-6 h-6 sm:w-8 sm:h-8" />
                )}
                {isProcessing ? 'PROCESANDO...' : 'FINALIZAR VENTA'}
              </button>

              <button
                onClick={() => {
                  if (window.confirm('¿Desea anular todos los productos del carrito?')) {
                    onClearCart();
                    onClose();
                  }
                }}
                className="w-full py-2 text-[10px] font-black text-muted-foreground uppercase tracking-widest hover:text-destructive transition-colors active:scale-95"
              >
                Anular Carrito
              </button>
            </div>
          </>
        )}
      </div>
    </Container>
  );
};
