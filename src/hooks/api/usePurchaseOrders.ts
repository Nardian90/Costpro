"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { useAuthStore } from "@/store";
import { toast } from "sonner";
import type { PurchaseOrder, PurchaseOrderItem } from "@/types";

/**
 * EM-R5: Hook para gestión de Órdenes de Compra.
 *
 * - Lista OCs de la tienda activa con filtros (status, supplier)
 * - Crear nueva OC con items
 * - Ver detalle con items
 * - Recibir contra OC (parcial/total)
 * - Cancelar OC
 */
export function usePurchaseOrders(storeId?: string | null, statusFilter?: string) {
  return useQuery({
    queryKey: ["purchase-orders", storeId, statusFilter],
    queryFn: async (): Promise<PurchaseOrder[]> => {
      if (!storeId) return [];
      let query = supabase
        .from("purchase_orders")
        .select("*")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false });
      if (statusFilter && statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data as PurchaseOrder[]) || [];
    },
    enabled: !!storeId,
    staleTime: 30_000,
  });
}

export function usePurchaseOrderDetails(poId?: string | null) {
  return useQuery({
    queryKey: ["purchase-order", poId],
    queryFn: async (): Promise<{ order: PurchaseOrder | null; items: PurchaseOrderItem[] }> => {
      if (!poId) return { order: null, items: [] };
      const { data: order, error: orderErr } = await supabase
        .from("purchase_orders")
        .select("*")
        .eq("id", poId)
        .single();
      if (orderErr) throw orderErr;
      const { data: items, error: itemsErr } = await supabase
        .from("purchase_order_items")
        .select("*")
        .eq("po_id", poId)
        .order("created_at", { ascending: true });
      if (itemsErr) throw itemsErr;
      return {
        order: order as PurchaseOrder,
        items: (items as PurchaseOrderItem[]) || [],
      };
    },
    enabled: !!poId,
  });
}

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
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
      if (!user?.activeStoreId) throw new Error("No hay tienda activa");
      if (!input.items || input.items.length === 0) {
        throw new Error("Debe agregar al menos un item a la orden de compra");
      }
      const total = input.items.reduce(
        (s, i) => s + i.quantity_ordered * i.unit_cost,
        0,
      );
      const { data: order, error: orderErr } = await supabase
        .from("purchase_orders")
        .insert({
          store_id: user.activeStoreId,
          supplier_name: input.supplier_name,
          supplier_id: input.supplier_id || null,
          po_number: input.po_number || null,
          status: "sent",
          total_amount: total,
          notes: input.notes || null,
          expected_date: input.expected_date || null,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (orderErr) throw orderErr;
      const poId = order.id;
      const itemsData = input.items.map((i) => ({
        po_id: poId,
        product_id: i.product_id || null,
        product_name: i.product_name,
        sku: i.sku || null,
        quantity_ordered: i.quantity_ordered,
        quantity_received: 0,
        unit_cost: i.unit_cost,
        unit_of_measure: i.unit_of_measure,
      }));
      const { error: itemsErr } = await supabase
        .from("purchase_order_items")
        .insert(itemsData);
      if (itemsErr) throw itemsErr;
      return poId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast.success("Orden de compra creada");
    },
    onError: (err: unknown) => {
      toast.error(
        "Error al crear OC: " +
          (err instanceof Error ? err.message : "desconocido"),
      );
    },
  });
}

export function useUpdatePOStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      poId,
      status,
    }: {
      poId: string;
      status: PurchaseOrder["status"];
    }) => {
      const { error } = await supabase
        .from("purchase_orders")
        .update({ status })
        .eq("id", poId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-order"] });
    },
    onError: (err: unknown) => {
      toast.error(
        "Error al actualizar OC: " +
          (err instanceof Error ? err.message : "desconocido"),
      );
    },
  });
}

/**
 * EM-R5: Recibir contra OC — actualiza quantity_received de cada item,
 * recalcula el status global (received/partial/sent) y devuelve el nuevo status.
 */
export function useReceiveAgainstPO() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      poId: string;
      receivedItems: Array<{ poItemId: string; quantityReceived: number }>;
    }): Promise<{ status: string }> => {
      for (const item of input.receivedItems) {
        const { error } = await supabase
          .from("purchase_order_items")
          .update({ quantity_received: item.quantityReceived })
          .eq("id", item.poItemId);
        if (error) throw error;
      }
      const { data: allItems } = await supabase
        .from("purchase_order_items")
        .select("quantity_ordered, quantity_received")
        .eq("po_id", input.poId);
      const allReceived = (allItems || []).every(
        (it: any) => Number(it.quantity_received) >= Number(it.quantity_ordered),
      );
      const anyReceived = (allItems || []).some(
        (it: any) => Number(it.quantity_received) > 0,
      );
      const newStatus = allReceived
        ? "received"
        : anyReceived
          ? "partial"
          : "sent";
      const { error: poErr } = await supabase
        .from("purchase_orders")
        .update({ status: newStatus })
        .eq("id", input.poId);
      if (poErr) throw poErr;
      return { status: newStatus };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-order"] });
    },
  });
}
