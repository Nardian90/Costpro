'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ShoppingCart, X, Trash2, Minus, Plus, DollarSign, CreditCard, Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PaymentMethod } from '@/types';
import { useIsMobile } from '@/hooks/use-mobile';

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
        "border border-primary/20 bg-card overflow-hidden",
        isMobile ? "rounded-t-2xl h-[80vh] flex flex-col" : "rounded-xl shadow-2xl"
      )}>
        <div className="bg-primary p-6 flex items-center justify-between text-white">
          <h3 className="font-black text-lg uppercase tracking-widest flex items-center gap-3">
            <ShoppingCart className="w-6 h-6" />
            Caja Registradora
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className={cn("p-6", isMobile && "flex-1 overflow-y-auto no-scrollbar")}>
          {items.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <ShoppingCart className="w-20 h-20 mx-auto mb-6 opacity-5" />
              <p className="font-black uppercase tracking-widest text-sm">Carrito Vacío</p>
            </div>
          ) : (
            <>
              <div className={cn("space-y-4 pr-2 mb-8 no-scrollbar", !isMobile && "max-h-[40vh] overflow-y-auto")}>
                {items.map(item => (
                  <div key={`${item.product_id}-${item.variant_id}`} className="p-4 rounded-lg border border-border bg-background/50 group relative">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1">
                        <div className="font-black text-sm uppercase tracking-tight truncate pr-6">{item.product.name}</div>
                        <div className="text-[10px] font-bold text-muted-foreground mt-1">${item.price.toFixed(2)} / unidad</div>
                      </div>
                      <button
                        onClick={() => onRemoveItem(item.product_id, item.variant_id)}
                        className="absolute top-2 right-2 text-muted-foreground hover:text-destructive p-2 rounded-full hover:bg-destructive/5 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 bg-background rounded-lg p-1 border border-border">
                        <button
                          onClick={() => onUpdateQuantity(item.product_id, item.variant_id, item.quantity - 1)}
                          className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-primary/10 hover:text-primary transition-colors"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-8 text-center font-black text-sm">{item.quantity}</span>
                        <button
                          onClick={() => onUpdateQuantity(item.product_id, item.variant_id, item.quantity + 1)}
                          className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-primary/10 hover:text-primary transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <span className="font-black text-lg text-primary">${item.subtotal.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-6 pt-6 border-t border-border">
                <div className="px-2 space-y-2">
                  <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest block">Descuento (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={localDiscount.value || ''}
                    onChange={(e) => setLocalDiscount({ ...localDiscount, value: parseInt(e.target.value) || 0 })}
                    className="w-full p-2 rounded-lg border border-border bg-background text-sm font-bold focus:ring-1 focus:ring-primary outline-none"
                    placeholder="0"
                  />
                </div>

                <div className="flex justify-between items-center px-2">
                   <span className="text-xs font-black uppercase text-muted-foreground tracking-widest">Total a Pagar</span>
                   <span className="text-4xl font-black text-primary tracking-tighter">${getTotal().toFixed(2)}</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <button
                    onClick={() => setSelectedPayment('cash')}
                    className={cn(
                      "p-4 rounded-xl flex flex-col items-center gap-2 border-2 transition-all bg-background",
                      selectedPayment === 'cash' ? "border-primary shadow-lg shadow-primary/10" : "border-transparent"
                    )}
                   >
                     <DollarSign className={cn("w-6 h-6", selectedPayment === 'cash' ? "text-primary" : "text-muted-foreground")} />
                     <span className="text-[10px] font-black uppercase tracking-widest">Efectivo</span>
                   </button>
                   <button
                    onClick={() => setSelectedPayment('transfer')}
                    className={cn(
                      "p-4 rounded-xl flex flex-col items-center gap-2 border-2 transition-all bg-background",
                      selectedPayment === 'transfer' ? "border-primary shadow-lg shadow-primary/10" : "border-transparent"
                    )}
                   >
                     <CreditCard className={cn("w-6 h-6", selectedPayment === 'transfer' ? "text-primary" : "text-muted-foreground")} />
                     <span className="text-[10px] font-black uppercase tracking-widest">Transf.</span>
                   </button>
                </div>

                <button
                  onClick={() => onCheckout(selectedPayment, localDiscount.value > 0 ? localDiscount : null)}
                  disabled={isProcessing || items.length === 0}
                  className="w-full py-5 rounded-xl bg-primary text-white font-black text-lg shadow-2xl disabled:opacity-50 flex items-center justify-center gap-3 transition-transform active:scale-[0.98]"
                >
                  {isProcessing ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <Check className="w-6 h-6" />
                  )}
                  {isProcessing ? 'PROCESANDO...' : 'FINALIZAR VENTA'}
                </button>

                <button
                  onClick={() => {
                    if (confirm('¿Anular el carrito?')) {
                      onClearCart();
                      onClose();
                    }
                  }}
                  className="w-full py-2 text-[10px] font-black text-muted-foreground uppercase tracking-widest hover:text-destructive transition-colors"
                >
                  Anular Carrito
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </Container>
  );
};
