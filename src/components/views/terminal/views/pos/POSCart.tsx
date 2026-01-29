'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ShoppingCart, X, Trash2, Minus, Plus, DollarSign, CreditCard, Loader2, Check } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import { PaymentMethod } from '@/types';
import { useIsMobile } from '@/hooks/ui/useMobile';

interface POSCartProps {
  items: any[];
  onRemoveItem: (productId: string, variantId: string | null) => void;
  onUpdateQuantity: (productId: string, variantId: string | null, quantity: number) => void;
  onClearCart: () => void;
  getTotal: () => number;
  isProcessing: boolean;
  onCheckout: (paymentMethod: PaymentMethod, discount?: { type: string, value: number } | null) => Promise<void>;
  onClose: () => void;
}

export const POSCart = ({
  items,
  onRemoveItem,
  onUpdateQuantity,
  onClearCart,
  getTotal,
  isProcessing,
  onCheckout,
  onClose
}: POSCartProps) => {
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>('cash');
  const [localDiscount, setLocalDiscount] = useState({ type: 'fixed', value: 0 });
  const isMobile = useIsMobile();

  const Container = isMobile ? 'div' : motion.div;
  const containerProps = isMobile ? {} : {
    initial: { x: 300, opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: 300, opacity: 0 }
  };

  return (
    <Container
      {...containerProps}
      className={cn(
        "w-full shrink-0 z-20",
        !isMobile && "lg:w-[400px] lg:sticky top-24 lg:order-last"
      )}
    >
      <div className={cn(
        "border border-primary/20 bg-card overflow-hidden transition-all duration-300 flex flex-col",
        isMobile ? "rounded-t-[2.5rem] h-[85vh] shadow-2xl" : "rounded-xl shadow-2xl lg:h-[calc(100vh-180px)]"
      )}>
        <div className="bg-primary p-6 flex items-center justify-between text-white shrink-0">
          <h3 className="font-black text-lg uppercase tracking-widest flex items-center gap-3">
            <ShoppingCart className="w-6 h-6" />
            Caja Registradora
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors active:scale-90">
            <X className="w-6 h-6" />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
            <ShoppingCart className="w-24 h-24 mx-auto mb-6 opacity-10 animate-pulse" />
            <p className="font-black uppercase tracking-widest text-sm">Carrito Vacío</p>
            <p className="text-[10px] font-bold mt-2 opacity-50">Agrega productos para comenzar</p>
          </div>
        ) : (
          <>
            <div className={cn(
              "p-4 sm:p-6 flex-1 overflow-y-auto no-scrollbar",
              isMobile && "pb-8"
            )}>
              <div className="space-y-4 pr-1">
                {items.map(item => (
                  <div key={`${item.product_id}-${item.variant_id}`} className="p-4 rounded-2xl border border-border bg-background/50 group relative hover:border-primary/30 transition-all">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1 min-w-0">
                        <div className="font-black text-sm uppercase tracking-tight truncate pr-8">{item.product.name}</div>
                        <div className="text-[10px] font-bold text-muted-foreground mt-1 flex items-center gap-1">
                          <span className="text-primary/70">{formatCurrency(item.price)}</span>
                          <span className="opacity-30">/</span>
                          <span>unidad</span>
                        </div>
                      </div>
                      <button
                        onClick={() => onRemoveItem(item.product_id, item.variant_id)}
                        className="absolute top-2 right-2 text-muted-foreground hover:text-destructive p-2.5 rounded-full hover:bg-destructive/5 transition-all active:scale-90"
                      >
                        <Trash2 className="w-4.5 h-4.5" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 bg-background rounded-xl p-1 border border-border shadow-sm">
                        <button
                          onClick={() => onUpdateQuantity(item.product_id, item.variant_id, item.quantity - 1)}
                          className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-primary/10 hover:text-primary transition-colors active:bg-primary/20"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-10 text-center font-black text-sm">{item.quantity}</span>
                        <button
                          onClick={() => onUpdateQuantity(item.product_id, item.variant_id, item.quantity + 1)}
                          className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-primary/10 hover:text-primary transition-colors active:bg-primary/20"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      <span className="font-black text-xl text-primary drop-shadow-sm">{formatCurrency(item.subtotal)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* STICKY FOOTER - MOBILE OPTIMIZED */}
            <div className={cn(
              "bg-card border-t border-primary/10 space-y-4 shrink-0 shadow-[0_-15px_30px_rgba(0,0,0,0,0.08)]",
              isMobile ? "p-4 pb-10" : "p-6"
            )}>
              <div className="space-y-4">
                <div className="space-y-2 px-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Descuento (%)</label>
                    <div className="flex gap-1.5">
                      {[0, 5, 10, 15].map(d => (
                        <button
                          key={d}
                          onClick={() => {
                            setLocalDiscount({ ...localDiscount, value: d });
                            if (d > 0) toast.success(`Descuento de ${d}% aplicado`);
                          }}
                          className={cn(
                            "px-3 py-1.5 rounded-lg border font-black text-[10px] uppercase transition-all active:scale-95",
                            localDiscount.value === d
                              ? "bg-primary text-white border-primary shadow-md shadow-primary/20"
                              : "bg-background text-muted-foreground border-border hover:bg-muted"
                          )}
                        >
                          {d === 0 ? 'Sin' : `${d}%`}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={localDiscount.value || ''}
                    onChange={(e) => setLocalDiscount({ ...localDiscount, value: parseInt(e.target.value) || 0 })}
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-[10px] placeholder:uppercase"
                    placeholder="Otro %"
                  />
                </div>

                <div className="flex justify-between items-end px-1">
                   <div className="flex flex-col">
                     <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest leading-none mb-2">Total a Pagar</span>
                     <button
                        onClick={() => {
                          if (confirm('¿Anular el carrito?')) {
                            onClearCart();
                            onClose();
                          }
                        }}
                        className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-widest hover:text-destructive transition-colors text-left"
                      >
                        Anular Carrito
                      </button>
                   </div>
                   <span className="text-4xl sm:text-5xl font-black text-primary tracking-tighter transition-all leading-none">
                     {formatCurrency(getTotal())}
                   </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                   <button
                    onClick={() => setSelectedPayment('cash')}
                    className={cn(
                      "h-14 rounded-2xl flex items-center justify-center gap-2 border-2 transition-all active:scale-[0.97]",
                      selectedPayment === 'cash'
                        ? "bg-primary/5 border-primary shadow-inner"
                        : "bg-background border-border text-muted-foreground"
                    )}
                   >
                     <DollarSign className={cn("w-5 h-5", selectedPayment === 'cash' ? "text-primary" : "text-muted-foreground/40")} />
                     <span className={cn("text-[10px] font-black uppercase tracking-widest", selectedPayment === 'cash' ? "text-primary" : "")}>Efectivo</span>
                   </button>
                   <button
                    onClick={() => setSelectedPayment('transfer')}
                    className={cn(
                      "h-14 rounded-2xl flex items-center justify-center gap-2 border-2 transition-all active:scale-[0.97]",
                      selectedPayment === 'transfer'
                        ? "bg-primary/5 border-primary shadow-inner"
                        : "bg-background border-border text-muted-foreground"
                    )}
                   >
                     <CreditCard className={cn("w-5 h-5", selectedPayment === 'transfer' ? "text-primary" : "text-muted-foreground/40")} />
                     <span className={cn("text-[10px] font-black uppercase tracking-widest", selectedPayment === 'transfer' ? "text-primary" : "")}>Transf.</span>
                   </button>
                </div>

                <button
                  onClick={() => onCheckout(selectedPayment, localDiscount.value > 0 ? localDiscount : null)}
                  disabled={isProcessing || items.length === 0}
                  className="w-full h-16 rounded-2xl bg-primary text-white font-black text-lg shadow-2xl shadow-primary/30 disabled:opacity-50 flex items-center justify-center gap-3 transition-all active:scale-[0.98] active:brightness-90"
                >
                  {isProcessing ? (
                    <Loader2 className="w-7 h-7 animate-spin" />
                  ) : (
                    <Check className="w-7 h-7" />
                  )}
                  {isProcessing ? 'PROCESANDO...' : 'FINALIZAR VENTA'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Container>
  );
};
