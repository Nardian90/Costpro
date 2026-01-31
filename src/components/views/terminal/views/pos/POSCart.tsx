'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ShoppingCart, X, Trash2, Minus, Plus, DollarSign, CreditCard, Loader2, Check } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
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
                        <div className="text-[10px] font-bold text-muted-foreground mt-1">{formatCurrency(item.price)} / unidad</div>
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
                          className="w-11 h-11 flex items-center justify-center rounded-md hover:bg-primary/10 hover:text-primary transition-colors"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-8 text-center font-black text-sm">{item.quantity}</span>
                        <button
                          onClick={() => onUpdateQuantity(item.product_id, item.variant_id, item.quantity + 1)}
                          className="w-11 h-11 flex items-center justify-center rounded-md hover:bg-primary/10 hover:text-primary transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      <span className="font-black text-lg text-primary">{formatCurrency(item.subtotal)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-6 pt-6 border-t border-border">
                {/* Descuento Section */}
                <div className="px-2 space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest block">Descuento</label>
                    <div className="flex gap-1 bg-muted p-0.5 rounded-lg border border-border">
                      <button
                        onClick={() => setDiscount({ type: 'percentage', value: discount?.value || 0 })}
                        className={cn(
                          "px-2 py-0.5 rounded-md text-[9px] font-black uppercase transition-all",
                          discount?.type === 'percentage' ? "bg-primary text-white" : "text-muted-foreground"
                        )}
                      >
                        %
                      </button>
                      <button
                        onClick={() => setDiscount({ type: 'fixed', value: discount?.value || 0 })}
                        className={cn(
                          "px-2 py-0.5 rounded-md text-[9px] font-black uppercase transition-all",
                          discount?.type === 'fixed' ? "bg-primary text-white" : "text-muted-foreground"
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
                          "flex-1 py-2 rounded-lg border font-black text-[10px] uppercase transition-all",
                          discount?.value === d && discount?.type === 'percentage' ? "bg-primary text-white border-primary" : "bg-background text-muted-foreground border-border"
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
                      className="w-full pl-8 p-2 rounded-lg border border-border bg-background text-sm font-bold focus:ring-1 focus:ring-primary outline-none"
                      placeholder="0"
                    />
                  </div>
                </div>

                {/* Impuestos Section */}
                {taxes.length > 0 && (
                  <div className="px-2 space-y-2">
                    <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest block">Impuestos Aplicables</label>
                    <div className="grid grid-cols-1 gap-2">
                      {taxes.map(tax => (
                        <button
                          key={tax.id}
                          onClick={() => toggleTax(tax)}
                          className={cn(
                            "flex items-center justify-between p-3 rounded-xl border transition-all text-left",
                            appliedTaxes.some(t => t.id === tax.id)
                              ? "bg-primary/5 border-primary shadow-sm"
                              : "bg-background border-border"
                          )}
                        >
                          <div>
                            <div className={cn(
                              "text-[10px] font-black uppercase tracking-tight",
                              appliedTaxes.some(t => t.id === tax.id) ? "text-primary" : "text-foreground"
                            )}>
                              {tax.name}
                            </div>
                            <div className="text-[9px] font-bold text-muted-foreground uppercase">
                              {tax.type === 'percentage' ? `${tax.value}%` : formatCurrency(tax.value)}
                              {tax.min_exempt ? ` (Mín. Exento: ${tax.min_exempt})` : ''}
                            </div>
                          </div>
                          <div className={cn(
                            "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                            appliedTaxes.some(t => t.id === tax.id) ? "bg-primary border-primary" : "border-border"
                          )}>
                            {appliedTaxes.some(t => t.id === tax.id) && <Check className="w-3 h-3 text-white" />}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Resumen de Totales */}
                <div className="px-4 py-6 bg-muted/30 rounded-2xl border border-border/50 space-y-3">
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

                  <div className="flex justify-between items-center pt-2 border-t border-border/50">
                    <span className="text-[10px] font-black uppercase text-primary tracking-widest">Valor a Cobrar (Base)</span>
                    <span className="text-sm font-black text-primary">{formatCurrency(Math.max(0, getSubtotal() - getDiscountAmount()))}</span>
                  </div>

                  {getTaxAmount() > 0 && (
                    <div className="flex justify-between items-center text-[10px] font-black uppercase text-amber-600 tracking-widest">
                      <span>Impuestos</span>
                      <span>+{formatCurrency(getTaxAmount())}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-4 border-t-2 border-primary/20">
                    <span className="text-xs font-black uppercase text-foreground tracking-widest">Total Final</span>
                    <span className="text-4xl font-black text-primary tracking-tighter">
                      {formatCurrency(getTotal())}
                    </span>
                  </div>
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
                     <span className="text-[10px] font-black uppercase tracking-widest text-foreground">Efectivo</span>
                   </button>
                   <button
                    onClick={() => setSelectedPayment('transfer')}
                    className={cn(
                      "p-4 rounded-xl flex flex-col items-center gap-2 border-2 transition-all bg-background",
                      selectedPayment === 'transfer' ? "border-primary shadow-lg shadow-primary/10" : "border-transparent"
                    )}
                   >
                     <CreditCard className={cn("w-6 h-6", selectedPayment === 'transfer' ? "text-primary" : "text-muted-foreground")} />
                     <span className="text-[10px] font-black uppercase tracking-widest text-foreground">Transf.</span>
                   </button>
                </div>

                <button
                  onClick={() => onCheckout(selectedPayment, (discount && discount.value > 0) ? discount : null)}
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
                  className="w-full py-2 text-[10px] font-black text-foreground uppercase tracking-widest hover:text-destructive transition-colors"
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
