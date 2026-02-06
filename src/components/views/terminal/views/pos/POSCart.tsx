'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, X, Trash2, Minus, Plus, DollarSign, CreditCard, Check, AlertTriangle, ChevronDown, Percent } from 'lucide-react';
import { CostProLoader } from '@/components/ui/CostProLoader';
import { cn, formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import { PaymentMethod, TaxConfiguration } from '@/types';
import { useIsMobile } from '@/hooks/ui/useMobile';
import { useTaxes } from '@/hooks/api/useTaxes';
import { useAuthStore } from '@/store';
import { BaseModal } from '@/components/ui/BaseModal';
import { PrimaryButton, SecondaryButton } from '@/components/ui/atomic';

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
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
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
        isMobile ? "rounded-t-3xl h-[88vh] flex flex-col" : "rounded-xl shadow-2xl"
      )}>
        <div className="bg-primary p-6 pb-8 flex items-center justify-between text-white relative">
          <div className="flex flex-col gap-1">
            <h3 className="font-black text-lg uppercase tracking-widest flex items-center gap-3">
              <ShoppingCart className="w-6 h-6" />
              Caja
            </h3>
            <span className="text-[10px] font-bold opacity-70 uppercase tracking-widest">
              {items.length} {items.length === 1 ? 'Producto' : 'Productos'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-colors active:scale-90"
            aria-label="Cerrar carrito"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className={cn("flex-1 flex flex-col overflow-hidden -mt-6 rounded-t-3xl bg-card relative z-10")}>
          {items.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-muted-foreground">
              <ShoppingCart className="w-20 h-20 mx-auto mb-6 opacity-5" />
              <p className="font-black uppercase tracking-widest text-sm text-center">Carrito Vacío</p>
            </div>
          ) : (
            <>
              <div className="flex-1 relative overflow-hidden flex flex-col">
                <div className={cn(
                  "flex-1 overflow-y-auto p-4 no-scrollbar min-h-0",
                  !isMobile && "max-h-[45vh]"
                )}>
                  <div className="space-y-3 pb-20">
                    <AnimatePresence initial={false}>
                      {items.map(item => (
                        <motion.div
                          key={`${item.product_id}-${item.variant_id}`}
                          layout
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, x: -20 }}
                          className="p-4 rounded-2xl border border-border bg-background/40 hover:bg-background/80 transition-colors group relative shadow-sm"
                        >
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex-1 min-w-0 pr-12">
                              <div className="font-black text-sm uppercase tracking-tight truncate text-foreground">{item.product.name}</div>
                              <div className="text-[10px] font-bold text-muted-foreground mt-0.5">
                                {formatCurrency(item.price)} <span className="opacity-50 mx-1">/</span> unid.
                              </div>
                            </div>
                            <button
                              onClick={() => onRemoveItem(item.product_id, item.variant_id)}
                              className="absolute top-2 right-2 text-muted-foreground/40 hover:text-destructive p-3 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-destructive/10 transition-all active:scale-90"
                              aria-label="Eliminar producto"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-1 bg-muted/50 rounded-xl p-1 border border-border/50">
                              <button
                                onClick={() => onUpdateQuantity(item.product_id, item.variant_id, item.quantity - 1)}
                                className="w-12 h-12 flex items-center justify-center rounded-lg hover:bg-primary/10 hover:text-primary transition-all active:scale-90"
                                aria-label="Disminuir cantidad"
                              >
                                <Minus className="w-5 h-5" />
                              </button>
                              <span className="w-10 text-center font-black text-sm" aria-label={`Cantidad: ${item.quantity}`}>{item.quantity}</span>
                              <button
                                onClick={() => onUpdateQuantity(item.product_id, item.variant_id, item.quantity + 1)}
                                className="w-12 h-12 flex items-center justify-center rounded-lg hover:bg-primary/10 hover:text-primary transition-all active:scale-90"
                                aria-label="Aumentar cantidad"
                              >
                                <Plus className="w-5 h-5" />
                              </button>
                            </div>
                            <div className="text-right">
                              <div className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">Subtotal</div>
                              <div className="font-black text-lg text-primary leading-none">{formatCurrency(item.subtotal)}</div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
                {/* Scroll Indicator Gradient */}
                <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-card via-card/80 to-transparent pointer-events-none z-10" />
              </div>

              <div className={cn(
                "p-4 space-y-4 border-t border-border bg-card",
                isMobile && "pb-8 shadow-[0_-20px_40px_rgba(0,0,0,0.05)] rounded-t-3xl"
              )}>
                {/* Descuento Section Collapsible */}
                <div className="px-2">
                  <button
                    onClick={() => setShowDiscount(!showDiscount)}
                    className="w-full flex justify-between items-center py-2 group"
                  >
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "p-1.5 rounded-lg transition-colors",
                        (discount?.value || 0) > 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                      )}>
                        <Percent className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">
                        {(discount?.value || 0) > 0 ? `Descuento: ${discount?.type === 'percentage' ? `${discount.value}%` : formatCurrency(discount?.value || 0)}` : 'Aplicar Descuento'}
                      </span>
                    </div>
                    <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-300", showDiscount && "rotate-180")} />
                  </button>

                  <AnimatePresence>
                    {showDiscount && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="py-3 space-y-3">
                          <div className="flex justify-end">
                            <div className="flex gap-1 bg-muted p-0.5 rounded-lg border border-border">
                              <button
                                onClick={() => setDiscount({ type: 'percentage', value: discount?.value || 0 })}
                                className={cn(
                                  "px-2 py-0.5 rounded-md text-[9px] font-black uppercase transition-all",
                                  discount?.type === 'percentage' ? "bg-primary text-white" : "text-muted-foreground"
                                )}
                                aria-label="Descuento por porcentaje"
                              >
                                %
                              </button>
                              <button
                                onClick={() => setDiscount({ type: 'fixed', value: discount?.value || 0 })}
                                className={cn(
                                  "px-2 py-0.5 rounded-md text-[9px] font-black uppercase transition-all",
                                  discount?.type === 'fixed' ? "bg-primary text-white" : "text-muted-foreground"
                                )}
                                aria-label="Descuento por monto fijo"
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
                                  "flex-1 py-3 min-h-[44px] rounded-lg border font-black text-[10px] uppercase transition-all flex items-center justify-center",
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
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Resumen de Totales */}
                <div className="px-4 py-4 bg-muted/30 rounded-2xl border border-border/50 space-y-2">
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

                  <div className="flex justify-between items-center pt-3 border-t-2 border-primary/20">
                    <span className="text-[10px] font-black uppercase text-foreground tracking-widest">Total Final</span>
                    <span className="text-3xl font-black text-primary tracking-tighter leading-none">
                      {formatCurrency(Math.max(0, getSubtotal() - getDiscountAmount()))}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                   <button
                    onClick={() => setSelectedPayment('cash')}
                    className={cn(
                      "p-3 rounded-xl flex flex-col items-center gap-1 border-2 transition-all bg-background",
                      selectedPayment === 'cash' ? "border-primary shadow-lg shadow-primary/10" : "border-transparent"
                    )}
                   >
                     <DollarSign className={cn("w-5 h-5", selectedPayment === 'cash' ? "text-primary" : "text-muted-foreground")} />
                     <span className="text-[9px] font-black uppercase tracking-widest text-foreground">Efectivo</span>
                   </button>
                   <button
                    onClick={() => setSelectedPayment('transfer')}
                    className={cn(
                      "p-3 rounded-xl flex flex-col items-center gap-1 border-2 transition-all bg-background",
                      selectedPayment === 'transfer' ? "border-primary shadow-lg shadow-primary/10" : "border-transparent"
                    )}
                   >
                     <CreditCard className={cn("w-5 h-5", selectedPayment === 'transfer' ? "text-primary" : "text-muted-foreground")} />
                     <span className="text-[9px] font-black uppercase tracking-widest text-foreground">Transf.</span>
                   </button>
                </div>

                <button
                  onClick={() => onCheckout(selectedPayment, (discount && discount.value > 0) ? discount : null)}
                  disabled={isProcessing || items.length === 0}
                  className="w-full py-4 rounded-xl bg-primary text-white font-black text-lg shadow-2xl disabled:opacity-50 flex items-center justify-center gap-3 transition-transform active:scale-[0.98]"
                >
                  {isProcessing ? (
                    <CostProLoader size={24} showText={false} showSubtext={false} />
                  ) : (
                    <Check className="w-6 h-6" />
                  )}
                  {isProcessing ? 'PROCESANDO...' : 'FINALIZAR VENTA'}
                </button>

                <button
                  onClick={() => setShowClearConfirm(true)}
                  className="w-full py-2 text-[10px] font-black text-muted-foreground hover:text-destructive uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Anular Carrito
                </button>
              </div>
            </>
          )}
        </div>

        {/* Modal de confirmación para vaciar carrito */}
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
              <PrimaryButton
                label="Sí, Anular Todo"
                onClick={() => {
                  onClearCart();
                  onClose();
                  setShowClearConfirm(false);
                  toast.success('Carrito vaciado');
                }}
                className="flex-1 bg-destructive hover:bg-destructive/90 text-white shadow-destructive/20"
              />
            </>
          }
        >
          <div className="py-4 space-y-3">
            <p className="font-bold text-center">¿Estás seguro de que deseas anular todos los productos del carrito?</p>
            <p className="text-sm text-muted-foreground text-center">Esta acción no se puede deshacer y perderás la selección actual.</p>
          </div>
        </BaseModal>
      </div>
    </Container>
  );
};
