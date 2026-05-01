'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, Save, AlertTriangle, Calculator, Package, TrendingDown, TrendingUp, Minus, Plus } from 'lucide-react';
import { Product } from '@/types';
import { calcularAjusteInventario } from '@/lib/inventory-logic';
import { cn, formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/ui/useMobile';
import { useFocusTrap } from '@/hooks/ui/useFocusTrap';
import {
  Drawer,
  DrawerContent,
} from '@/components/ui/drawer';

interface InventoryAdjustmentModalProps {
  product: Product;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (adjustmentData: {
    quantityDelta: number;
    unitCostAdjustment: number | null;
    reason: string;
  }) => Promise<void>;
}

export default function InventoryAdjustmentModal({
  product,
  isOpen,
  onClose,
  onConfirm
}: InventoryAdjustmentModalProps) {
  const [ajusteUnidades, setAjusteUnidades] = useState<number>(0);
  const [ajusteValorUnitario, setAjusteValorUnitario] = useState<number | ''>('');
  const [reason, setReason] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Valores iniciales
  const stockActual = product.stock_current || 0;
  const costoPromedioActual = product.cost_average || product.cost_price || 0;
  const costoTotalActual = stockActual * costoPromedioActual;

  // Sincronizar ajusteValorUnitario cuando cambian las unidades para mostrar el "Costo Sugerido"
  // Solo se sincroniza si el usuario no ha ingresado un valor manual (o si lo borró)
  useEffect(() => {
    if (ajusteUnidades < 0) {
      // Para reducciones, el costo sugerido es el promedio actual
      if (ajusteValorUnitario === '') {
          // Si está vacío, los resultados ya usan el promedio por defecto en la lógica
      }
    } else if (ajusteUnidades > 0) {
      // Para incrementos, el costo sugerido es 0 (dilución) a menos que se especifique
    }
  }, [ajusteUnidades]);

  const resultados = useMemo(() => {
    return calcularAjusteInventario({
      stock_actual: stockActual,
      costo_total_actual: costoTotalActual,
      ajuste_unidades: ajusteUnidades,
      ajuste_valor_unitario: ajusteValorUnitario === '' ? undefined : ajusteValorUnitario
    });
  }, [stockActual, costoTotalActual, ajusteUnidades, ajusteValorUnitario]);

  const isMobile = useIsMobile();
  const modalRef = useFocusTrap(!isMobile && isOpen);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (ajusteUnidades === 0 && ajusteValorUnitario === '') {
      toast.error('Debe ingresar un cambio en unidades o un ajuste de valor');
      return;
    }

    if (!reason) {
        toast.error('Debe ingresar un motivo para el ajuste');
        return;
    }

    setIsProcessing(true);
    try {
      await onConfirm({
        quantityDelta: ajusteUnidades,
        unitCostAdjustment: ajusteValorUnitario === '' ? null : ajusteValorUnitario,
        reason: reason
      });
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Error al procesar el ajuste');
    } finally {
      setIsProcessing(false);
    }
  };

  const isReduction = ajusteUnidades < 0;
  const isIncrease = ajusteUnidades > 0;

  const ModalContent = (
    <div className={cn(
      "flex flex-col overflow-hidden !p-0",
      isMobile ? "h-full" : "neu-card max-w-2xl w-full border-primary/20 shadow-2xl"
    )}>
      {/* Header */}
      <div className="p-6 border-b border-white/5 bg-primary/5 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
            <Calculator className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="text-[clamp(1.125rem,5vw,1.25rem)] font-black text-foreground uppercase tracking-tighter">
              Ajuste de Inventario
            </h3>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
              {product.name} • {product.sku}
            </p>
          </div>
        </div>
        {!isMobile && (
          <button
            onClick={onClose}
            className="p-2 hover:bg-danger/10 text-muted-foreground hover:text-danger rounded-full transition-colors"
            type="button"
            aria-label="Cerrar ajuste de inventario"
          >
            <X className="w-6 h-6" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className={cn(
        "space-y-8 overflow-y-auto no-scrollbar",
        isMobile ? "p-6 pb-32" : "p-8"
      )}>
        {/* Current Status Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="neu-inset-sm p-4 text-center">
            <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-1">Stock Actual</p>
            <p className="text-[clamp(1rem,5vw,1.25rem)] font-black">{stockActual}</p>
          </div>
          <div className="neu-inset-sm p-4 text-center">
            <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-1">Costo Promedio</p>
            <p className="text-[clamp(1rem,5vw,1.25rem)] font-black text-primary">{formatCurrency(costoPromedioActual)}</p>
          </div>
          <div className="neu-inset-sm p-4 text-center">
            <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-1">Valor Total</p>
            <p className="text-[clamp(1rem,5vw,1.25rem)] font-black">{formatCurrency(costoTotalActual)}</p>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label htmlFor="ajusteUnidades" className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">
                Ajuste Unidades (+ / -)
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    id="ajusteUnidades"
                    type="number"
                    value={ajusteUnidades}
                    onChange={(e) => setAjusteUnidades(parseInt(e.target.value) || 0)}
                    aria-label="Ajuste de unidades"
                    className="neu-input w-full !pl-14 !pr-4 font-black text-lg h-12"
                    placeholder="Ej: -5, 10..."
                  />
                  <div className="absolute left-4 top-1/2 -translate-y-1/2">
                    {ajusteUnidades === 0 ? <Package className="w-5 h-5 text-muted-foreground" /> :
                     ajusteUnidades > 0 ? <TrendingUp className="w-5 h-5 text-success" /> :
                     <TrendingDown className="w-5 h-5 text-danger" />}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => setAjusteUnidades(prev => prev - 1)}
                    className="w-12 h-12 flex items-center justify-center rounded-xl bg-muted border border-border active:scale-90 transition-transform"
                    type="button"
                  >
                    <Minus className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setAjusteUnidades(prev => prev + 1)}
                    className="w-12 h-12 flex items-center justify-center rounded-xl bg-muted border border-border active:scale-90 transition-transform"
                    type="button"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center ml-1">
                <label htmlFor="ajusteValor" className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">
                  Costo Unitario Ajuste
                </label>
                {ajusteValorUnitario !== '' && (
                  <button
                    onClick={() => setAjusteValorUnitario('')}
                    className="text-xs font-bold text-primary hover:underline uppercase"
                    type="button"
                    aria-label="Usar costo sugerido"
                  >
                    Usar sugerido
                  </button>
                )}
              </div>
              <div className="relative">
                <span className="absolute left-6 top-1/2 -translate-y-1/2 font-black text-muted-foreground">$</span>
                <input
                  id="ajusteValor"
                  type="number"
                  step="0.01"
                  value={ajusteValorUnitario}
                  onChange={(e) => setAjusteValorUnitario(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  aria-label="Costo unitario del ajuste"
                  className={cn(
                      "neu-input w-full !pl-14 !pr-4 font-black text-lg h-12",
                      ajusteValorUnitario === '' ? "text-muted-foreground" : "text-primary"
                  )}
                  placeholder={ajusteUnidades < 0 ? costoPromedioActual.toFixed(2).toString() : "0.00"}
                />
              </div>
              <p className="text-xs text-muted-foreground italic px-1">
                {ajusteValorUnitario === '' ? (
                  isReduction ? `Usando costo promedio actual: ${formatCurrency(costoPromedioActual)}` :
                  isIncrease ? "Usando costo de entrada: $0.00 (Dilución)" :
                  "Ingresa un valor para re-valuar el stock actual."
                ) : (
                  <span className="text-primary font-bold">Valor manual ingresado.</span>
                )}
              </p>
            </div>
          </div>

          <div className="space-y-3">
              <label htmlFor="reason" className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">
                Motivo del Ajuste
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {['Merma', 'Error Conteo', 'Venta Omitida', 'Ajuste Manual'].map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    aria-pressed={reason === r}
                    aria-label={`Motivo: ${r}`}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-bold uppercase border transition-all active:scale-95",
                      reason === r ? "bg-primary text-foreground border-primary" : "bg-muted text-muted-foreground border-border"
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <textarea
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="neu-input w-full min-h-[80px] text-sm resize-none p-4"
                  placeholder="Ej: Merma por daño, corrección de inventario, etc..."
                  aria-label="Motivo del ajuste"
              />
          </div>
        </div>

        {/* Results Summary */}
        <div className="p-6 bg-muted/30 rounded-2xl border border-white/5 space-y-4">
          <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning" />
            Vista Previa del Resultado
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
             <div className="text-center">
                <p className="text-xs font-bold text-muted-foreground uppercase mb-1">Nuevo Stock</p>
                <p className={cn("text-[clamp(1rem,5vw,1.25rem)] font-black", resultados.nuevo_stock !== stockActual && "text-primary")}>
                  {resultados.nuevo_stock}
                </p>
             </div>
             <div className="text-center border-x border-white/5">
                <p className="text-xs font-bold text-muted-foreground uppercase mb-1">Nuevo Valor Total</p>
                <p className={cn("text-[clamp(1rem,5vw,1.25rem)] font-black", resultados.nuevo_costo_total !== costoTotalActual && "text-primary")}>
                  {formatCurrency(resultados.nuevo_costo_total)}
                </p>
             </div>
             <div className="text-center">
                <p className="text-xs font-bold text-muted-foreground uppercase mb-1">Nuevo C. Promedio</p>
                <p className={cn("text-[clamp(1rem,5vw,1.25rem)] font-black", resultados.nuevo_costo_unitario !== costoPromedioActual && "text-primary")}>
                  {formatCurrency(resultados.nuevo_costo_unitario)}
                </p>
             </div>
          </div>

          {resultados.nuevo_costo_unitario !== costoPromedioActual && (
              <div className="pt-2 text-center">
                  <span className={cn(
                      "text-xs font-bold px-2 py-0.5 rounded-full",
                      resultados.nuevo_costo_unitario > costoPromedioActual ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                  )}>
                      Variación de Costo: {((resultados.nuevo_costo_unitario / costoPromedioActual - 1) * 100).toFixed(2)}%
                  </span>
              </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className={cn(
        "p-6 border-t border-white/5 bg-muted/10 flex gap-4",
        isMobile && "fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-md z-10"
      )}>
        <button
          onClick={onClose}
          className="neu-btn flex-1 !py-3 min-h-[44px] font-black uppercase text-xs tracking-widest"
          disabled={isProcessing}
          type="button"
          aria-label="Cancelar ajuste de inventario"
        >
          Cancelar
        </button>
        <button
          onClick={handleConfirm}
          className="neu-btn-primary flex-1 flex items-center justify-center gap-2 !py-3 min-h-[44px] font-black uppercase text-xs tracking-widest"
          disabled={isProcessing}
          type="button"
          aria-label="Confirmar ajuste de inventario"
        >
          {isProcessing ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <>
              <Save className="w-4 h-4" aria-hidden="true" />
              Confirmar
            </>
          )}
        </button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DrawerContent className="max-h-[92vh] border-none bg-background">
          <div className="overflow-hidden h-full">
            {ModalContent}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <div ref={modalRef} role="dialog" aria-modal="true" aria-label="Ajuste de inventario" className="fixed inset-0 bg-background/90 backdrop-blur-xl flex items-center justify-center z-50 p-4 overflow-y-auto">
      {ModalContent}
    </div>
  );
}
