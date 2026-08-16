"use client";

/**
 * useValeSalidaCheckout — Hook para emitir un Vale de Salida.
 *
 * Diferencias clave con usePOSCheckout (venta comercial):
 *   1. NO limpia el carrito en error — solo en éxito.
 *      Motivo: si el RPC falla por stock insuficiente o sobreconsumo de OT,
 *      el usuario quiere ver los items para corregir y reintentar.
 *   2. Idempotency key ESTABLE — se genera con useRef al montar el hook,
 *      NO se regenera en cada intento. Solo se regenera después de un éxito
 *      o cuando el usuario cambia el contenido del carrito (addItem/removeItem).
 *   3. NO procesa pagos — el vale no tiene pago comercial.
 *   4. Costo: el servidor lo calcula (products.cost_average); el cliente
 *      solo muestra una estimación de preview leyendo item.cost.
 */

import { useState, useCallback, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";
import { useCartStore } from "@/store/cart";
import { useAuthStore } from "@/store";

export interface ValeSalidaResult {
  slip_id: string;
  slip_number: string;
  total_cost: number;
  status: string;
}

export interface UseValeSalidaCheckoutReturn {
  isProcessing: boolean;
  lastVale: ValeSalidaResult | null;
  processValeCheckout: () => Promise<ValeSalidaResult | null>;
  resetIdempotencyKey: () => void;
}

function generateIdempotencyKey(): string {
  // Formato: vale_<timestamp>_<random>
  // Mínimo 8 chars (validación Zod en el backend).
  return `vale_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function useValeSalidaCheckout(): UseValeSalidaCheckoutReturn {
  const { user } = useAuthStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastVale, setLastVale] = useState<ValeSalidaResult | null>(null);

  // Idempotency key ESTABLE — se mantiene entre reintentos.
  // Solo se regenera explícitamente vía resetIdempotencyKey() tras éxito
  // o cuando el usuario modifica el carrito.
  const idempotencyKeyRef = useRef<string>(generateIdempotencyKey());

  const { items, clearCart, clearValeState, productionOrderId, valeNotes, productionOrderItemIds } =
    useCartStore(
      useShallow((state) => ({
        items: state.items,
        clearCart: state.clearCart,
        clearValeState: state.clearValeState,
        productionOrderId: state.productionOrderId,
        valeNotes: state.valeNotes,
        productionOrderItemIds: state.productionOrderItemIds,
      })),
    );

  const resetIdempotencyKey = useCallback(() => {
    idempotencyKeyRef.current = generateIdempotencyKey();
  }, []);

  const processValeCheckout = useCallback(async (): Promise<ValeSalidaResult | null> => {
    if (!user?.id) {
      toast.error("Usuario no autenticado");
      return null;
    }

    if (items.length === 0) {
      toast.error("El carrito está vacío");
      return null;
    }

    if (!valeNotes || valeNotes.trim().length === 0) {
      toast.error("Las notas son obligatorias para emitir un vale");
      return null;
    }

    setIsProcessing(true);

    try {
      // Construir payload de items — la RPC recibe jsonb.
      // Cada item mapea product_id + variant_id (null-safe) + quantity.
      // production_order_item_id se asocia desde el mapa del store usando
      // la clave `${product_id}|${variant_id ?? 'null'}`.
      const itemsPayload = items.map((item) => {
        const key = `${item.product_id}|${item.variant_id ?? 'null'}`;
        const poItemId = productionOrderItemIds[key] ?? null;
        return {
          product_id: item.product_id,
          variant_id: item.variant_id ?? null,
          quantity: item.quantity,
          production_order_item_id: poItemId,
        };
      });

      const payload = {
        items: itemsPayload,
        production_order_id: productionOrderId ?? null,
        notes: valeNotes.trim(),
        idempotency_key: idempotencyKeyRef.current,
      };

      // Llamada al endpoint /api/vale-salida (NO directamente a Supabase).
      // El endpoint deriva store_id de profiles.active_store_id y user_id del JWT.
      // withAuth requiere header Authorization: Bearer <token> — lo obtenemos
      // del auth store (set por useAuthStore.login()).
      const { token } = useAuthStore.getState();
      const response = await fetch('/api/vale-salida', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        // Mapear errores del backend a mensajes user-friendly
        const errorMsg = data?.error || 'Error desconocido';
        if (response.status === 409) {
          toast.error('Este vale ya fue procesado (idempotencia). Recarga la página.');
        } else if (errorMsg.includes('Stock insuficiente') || errorMsg.includes('Stock negativo')) {
          toast.error('Stock insuficiente para uno o más productos');
        } else if (errorMsg.includes('Sobreconsumo')) {
          toast.error('La cantidad excede el presupuesto de la OT');
        } else if (errorMsg.includes('Item de OT sin orden')) {
          toast.error('Hay items asociados a una OT pero no se seleccionó orden de producción');
        } else if (errorMsg.includes('Variante no pertenece')) {
          toast.error('Una variante no pertenece al producto indicado');
        } else if (errorMsg.includes('Producto no encontrado')) {
          toast.error('Uno o más productos ya no existen');
        } else if (response.status === 403) {
          toast.error('Sin acceso a la tienda activa');
        } else {
          toast.error(errorMsg);
        }
        return null;
      }

      // Éxito
      const result = data as ValeSalidaResult;
      setLastVale(result);

      // Limpiar carrito + estado Vale (pero preservar operationType='sale' como default)
      clearCart();
      clearValeState();
      // Regenerar idempotency key para el próximo vale
      resetIdempotencyKey();

      toast.success(`Vale ${result.slip_number} emitido correctamente`);

      return result;
    } catch (error: unknown) {
      // Errores de red / fetch
      const message = error instanceof Error ? error.message : 'Error de conexión';
      toast.error(`No se pudo emitir el vale: ${message}`);
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, [user, items, valeNotes, productionOrderId, productionOrderItemIds, clearCart, clearValeState, resetIdempotencyKey]);

  return {
    isProcessing,
    lastVale,
    processValeCheckout,
    resetIdempotencyKey,
  };
}
