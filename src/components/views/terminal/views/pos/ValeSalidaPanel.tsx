"use client";

/**
 * ValeSalidaPanel — Panel de checkout para Vale de Salida (issue slip).
 *
 * Renderiza:
 *   1. Selector de Orden de Producción (opcional)
 *   2. Por cada item del carrito: dropdown para asociar a una línea de OT
 *      (filtra items de OT que coincidan en product_id + variant_id)
 *   3. Notas (textarea, REQUERIDAS — el RPC create_vale_salida las exige)
 *   4. Preview de costo total (read-only, calculado con item.cost del catálogo;
 *      el servidor usa products.cost_average que puede diferir)
 *   5. Botón "Emitir Vale" que dispara useValeSalidaCheckout
 *
 * Distinción visual del POSCartCheckoutPanel:
 *   - Tema amber (en vez de primary)
 *   - Icono Package (en vez de CreditCard)
 *   - Sin métodos de pago, sin descuento, sin impuestos
 */

import React, { useState, useEffect, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Package,
  AlertCircle,
  Loader2,
  FileText,
  ChevronDown,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { useCartStore, type CartItem } from "@/store/cart";
import { useAuthStore } from "@/store";
import { supabase } from "@/lib/supabaseClient";
import { useValeSalidaCheckout } from "./useValeSalidaCheckout";
import { toast } from "sonner";

interface ProductionOrder {
  id: string;
  order_number: string;
  order_type: string;
  status: string;
  customer_name?: string | null;
}

interface ProductionOrderItem {
  id: string;
  order_id: string;
  product_id: string;
  variant_id: string | null;
  budgeted_qty: number;
  actual_qty: number;
}

interface ValeSalidaPanelProps {
  items: CartItem[];
  isProcessing: boolean;
  onClearCart: () => void;
  isMobile: boolean;
}

/** Clave null-safe para el mapa item→OT-line */
function itemKey(productId: string, variantId: string | null): string {
  return `${productId}|${variantId ?? 'null'}`;
}

export function ValeSalidaPanel({
  items,
  isProcessing: externalIsProcessing,
  onClearCart,
  isMobile,
}: ValeSalidaPanelProps) {
  const { user } = useAuthStore();
  const {
    productionOrderId,
    setProductionOrderId,
    valeNotes,
    setValeNotes,
    productionOrderItemIds,
    setItemProductionOrderLine,
  } = useCartStore(
    useShallow((s) => ({
      productionOrderId: s.productionOrderId,
      setProductionOrderId: s.setProductionOrderId,
      valeNotes: s.valeNotes,
      setValeNotes: s.setValeNotes,
      productionOrderItemIds: s.productionOrderItemIds,
      setItemProductionOrderLine: s.setItemProductionOrderLine,
    })),
  );

  const { isProcessing: hookIsProcessing, processValeCheckout } = useValeSalidaCheckout();
  const isProcessing = externalIsProcessing || hookIsProcessing;

  const [productionOrders, setProductionOrders] = useState<ProductionOrder[]>([]);
  const [poItems, setPoItems] = useState<ProductionOrderItem[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Cargar lista de OTs activas de la tienda
  const fetchProductionOrders = useCallback(async () => {
    if (!user?.activeStoreId) return;
    setLoadingOrders(true);
    try {
      const { data, error } = await supabase
        .from('production_orders')
        .select('id, order_number, order_type, status, customer_name')
        .eq('store_id', user.activeStoreId)
        .in('status', ['approved', 'in_progress', 'paused'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      setProductionOrders(data || []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error desconocido';
      toast.error(`Error al cargar órdenes: ${msg}`);
    } finally {
      setLoadingOrders(false);
    }
  }, [user?.activeStoreId]);

  // Cargar items de la OT seleccionada
  useEffect(() => {
    if (!productionOrderId) {
      setPoItems([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('production_order_items')
          .select('id, order_id, product_id, variant_id, budgeted_qty, actual_qty')
          .eq('order_id', productionOrderId);
        if (error) throw error;
        if (!cancelled) setPoItems(data || []);
      } catch {
        if (!cancelled) setPoItems([]);
      }
    })();
    return () => { cancelled = true; };
  }, [productionOrderId]);

  // Cargar OTs al montar
  useEffect(() => {
    fetchProductionOrders();
  }, [fetchProductionOrders]);

  // Cuando cambia el productionOrderId, limpiar asociaciones stale
  // (items del carrito que apuntaban a líneas de la OT anterior)
  useEffect(() => {
    if (!productionOrderId) {
      // Sin OT: limpiar todas las asociaciones
      for (const item of items) {
        const k = itemKey(item.product_id, item.variant_id);
        if (productionOrderItemIds[k]) {
          setItemProductionOrderLine(item.product_id, item.variant_id, null);
        }
      }
      return;
    }
    // Con OT: limpiar asociaciones que ya no existen en poItems
    for (const item of items) {
      const k = itemKey(item.product_id, item.variant_id);
      const currentPoItemId = productionOrderItemIds[k];
      if (currentPoItemId && !poItems.some(pi => pi.id === currentPoItemId)) {
        setItemProductionOrderLine(item.product_id, item.variant_id, null);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productionOrderId, poItems]);

  // Preview de costo (read-only) — suma item.cost * qty
  // El servidor usa products.cost_average que puede ser ligeramente distinto.
  const totalCostPreview = items.reduce((sum, item) => {
    const cost = typeof item.cost === 'number' ? item.cost : 0;
    return sum + cost * (item.quantity || 0);
  }, 0);

  // Para cada item del carrito, encontrar items de OT que coincidan
  // (mismo product_id Y variant_id null-safe)
  const getMatchingPoItems = (item: CartItem): ProductionOrderItem[] => {
    if (!productionOrderId) return [];
    return poItems.filter(pi =>
      pi.product_id === item.product_id &&
      (pi.variant_id ?? null) === (item.variant_id ?? null)
    );
  };

  const handleSubmit = async () => {
    if (!valeNotes.trim()) {
      toast.error('Las notas son obligatorias');
      return;
    }
    await processValeCheckout();
  };

  return (
    <div className="p-3 sm:p-4 space-y-4">
      {/* ── Banner informativo ── */}
      <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-amber-900">
        <div className="flex items-start gap-2">
          <Package className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="text-xs">
            <p className="font-bold uppercase tracking-wider mb-1">Vale de Salida</p>
            <p className="opacity-90">
              Descuenta productos del inventario <strong>sin generar venta comercial</strong>.
              El costo se calcula automáticamente desde el costo promedio del producto.
            </p>
          </div>
        </div>
      </div>

      {/* ── Selector de Orden de Producción (opcional) ── */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
          <FileText className="w-3 h-3" />
          Orden de Producción (opcional)
        </label>
        <div className="relative">
          <select
            value={productionOrderId ?? ''}
            onChange={(e) => setProductionOrderId(e.target.value || null)}
            disabled={isProcessing || loadingOrders}
            className="w-full h-11 min-h-[44px] appearance-none rounded-lg border border-border bg-background px-3 pr-9 text-xs font-bold disabled:opacity-50"
          >
            <option value="">— Sin OT (solo descuenta stock) —</option>
            {productionOrders.map((po) => (
              <option key={po.id} value={po.id}>
                {po.order_number} · {po.order_type} · {po.status}
                {po.customer_name ? ` · ${po.customer_name}` : ''}
              </option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
        </div>
        {loadingOrders && (
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Cargando órdenes...
          </p>
        )}
        {productionOrderId && (
          <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            Se descontará <code className="font-bold">actual_qty</code> en las líneas de OT asociadas.
          </p>
        )}
      </div>

      {/* ── Asociación item → OT-line ── */}
      {productionOrderId && items.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Asociar items a líneas de OT
          </p>
          {items.map((item) => {
            const matchingPoItems = getMatchingPoItems(item);
            const key = itemKey(item.product_id, item.variant_id);
            const currentValue = productionOrderItemIds[key] ?? '';

            return (
              <div key={key} className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <p className="text-xs font-bold truncate flex-1">
                    {item.product?.name || item.product_id}
                  </p>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    ×{item.quantity}
                  </span>
                </div>
                {matchingPoItems.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground italic">
                    No hay línea de OT con este producto
                  </p>
                ) : (
                  <div className="relative">
                    <select
                      value={currentValue}
                      onChange={(e) => setItemProductionOrderLine(
                        item.product_id,
                        item.variant_id,
                        e.target.value || null,
                      )}
                      disabled={isProcessing}
                      className="w-full h-9 appearance-none rounded-md border border-border bg-background px-2 pr-7 text-[11px] font-medium disabled:opacity-50"
                    >
                      <option value="">— No asociar —</option>
                      {matchingPoItems.map((pi) => (
                        <option key={pi.id} value={pi.id}>
                          Presup: {pi.budgeted_qty} · Actual: {pi.actual_qty}
                          {' '}(queda {Math.max(0, Number(pi.budgeted_qty) - Number(pi.actual_qty))})
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Notas (REQUERIDAS) ── */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
          <FileText className="w-3 h-3" />
          Notas <span className="text-destructive">*</span>
        </label>
        <textarea
          value={valeNotes}
          onChange={(e) => setValeNotes(e.target.value)}
          disabled={isProcessing}
          rows={3}
          maxLength={2000}
          placeholder="Describe el motivo del vale: consumo interno, merma, traslado, desperdicio, etc."
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium resize-none disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
        />
        <p className="text-[10px] text-muted-foreground text-right">
          {valeNotes.length}/2000
        </p>
      </div>

      {/* ── Preview de costo (read-only) ── */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-widest text-amber-800">
            Costo estimado
          </span>
          <span className="text-base font-black tabular-nums text-amber-900">
            {formatCurrency(totalCostPreview)}
          </span>
        </div>
        <p className="text-[9px] text-amber-700/80 italic">
          El servidor usará el costo promedio actual del producto (puede diferir levemente).
        </p>
      </div>

      {/* ── Validación de notas ── */}
      {items.length > 0 && !valeNotes.trim() && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 text-destructive shrink-0" />
          <p className="text-[10px] text-destructive font-medium">
            Las notas son obligatorias para emitir un vale.
          </p>
        </div>
      )}

      {/* ── Botón "Emitir Vale" (id=pos-checkout-cta para que POSCart lo dispare) ── */}
      <button
        id="pos-checkout-cta"
        type="button"
        onClick={handleSubmit}
        disabled={isProcessing || items.length === 0 || !valeNotes.trim()}
        className={cn(
          "w-full h-14 rounded-xl bg-amber-600 text-white font-black text-sm uppercase tracking-widest shadow-lg shadow-amber-600/20",
          "flex items-center justify-center gap-2 transition-all active:scale-[0.98]",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Emitiendo...
          </>
        ) : (
          <>
            <Package className="w-5 h-5" />
            Emitir Vale
          </>
        )}
      </button>
    </div>
  );
}
