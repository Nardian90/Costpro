"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { useAuthStore } from "@/store";
import { apiFetch } from "@/lib/api-fetch";
import { toast } from "sonner";
import type { PurchaseOrder, PurchaseOrderItem } from "@/types";

/**
 * EM-R5: Hook para gestión de Órdenes de Compra.
 *
 * FIX: Migrado de Supabase directo → API route /api/purchase-orders
 * con withStoreAccess, Zod, auditoría server-side y transaccionalidad.
 */

export function usePurchaseOrders(storeId?: string | null, statusFilter?: string) {
  const { user } = useAuthStore();
  return useQuery({
    queryKey: ["purchase-orders", storeId, statusFilter],
    queryFn: async (): Promise<PurchaseOrder[]> => {
      if (!storeId) return [];
      const params = new URLSearchParams({ store_id: storeId });
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      const data = await apiFetch<{ orders: PurchaseOrder[] }>(`/api/purchase-orders?${params}`);
      return data.orders || [];
    },
    enabled: !!storeId && !!user,
    staleTime: 30_000,
  });
}

export function usePurchaseOrderDetails(poId?: string | null) {
  return useQuery({
    queryKey: ["purchase-order", poId],
    queryFn: async (): Promise<{ order: PurchaseOrder | null; items: PurchaseOrderItem[] }> => {
      if (!poId) return { order: null, items: [] };
      const data = await apiFetch<{ order: PurchaseOrder; items: PurchaseOrderItem[] }>(`/api/purchase-orders/${poId}`);
      return { order: data.order, items: data.items || [] };
    },
    enabled: !!poId,
  });
}

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      supplier_name: string;
      supplier_id?: string | null;
      po_number?: string;
      notes?: string;
      expected_date?: string;
      items: Array<{
        product_id?: string | null;
        product_name: string;
        sku?: string;
        quantity_ordered: number;
        unit_cost: number;
        unit_of_measure: string;
      }>;
    }): Promise<string> => {
      const { user } = useAuthStore.getState();
      if (!user?.activeStoreId) throw new Error("No hay tienda activa");
      if (!input.items || input.items.length === 0) {
        throw new Error("Debe agregar al menos un item a la orden de compra");
      }
      // FIX: usar API route en lugar de Supabase directo (transaccional + auditoría)
      const data = await apiFetch<{ order_id: string }>("/api/purchase-orders", {
        method: "POST",
        body: JSON.stringify({
          store_id: user.activeStoreId,
          supplier_name: input.supplier_name,
          supplier_id: input.supplier_id || null,
          po_number: input.po_number || null,
          notes: input.notes || null,
          expected_date: input.expected_date || null,
          items: input.items,
        }),
      });
      return data.order_id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast.success("Orden de compra creada");
    },
    onError: (err: unknown) => {
      toast.error("Error al crear OC: " + (err instanceof Error ? err.message : "desconocido"));
    },
  });
}

export function useUpdatePOStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ poId, status }: { poId: string; status: PurchaseOrder["status"] }) => {
      // FIX: usar API route con state machine validation
      await apiFetch(`/api/purchase-orders/${poId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-order"] });
    },
    onError: (err: unknown) => {
      toast.error("Error al actualizar OC: " + (err instanceof Error ? err.message : "desconocido"));
    },
  });
}

/**
 * FIX: Recibir contra OC — ahora atómico vía API route (sin race conditions).
 */
export function useReceiveAgainstPO() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      poId: string;
      receivedItems: Array<{ poItemId: string; quantityReceived: number }>;
    }): Promise<{ status: string }> => {
      const data = await apiFetch<{ status: string }>(`/api/purchase-orders/${input.poId}`, {
        method: "POST",
        body: JSON.stringify({ receivedItems: input.receivedItems }),
      });
      return { status: data.status };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-order", variables.poId] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (err: unknown) => {
      toast.error("Error al recibir OC: " + (err instanceof Error ? err.message : "desconocido"));
    },
  });
}
