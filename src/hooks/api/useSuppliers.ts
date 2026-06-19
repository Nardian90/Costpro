"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { useAuthStore } from "@/store";
import { toast } from "sonner";

export interface Supplier {
  id: string;
  store_id: string;
  name: string;
  tax_id?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * REC-2 MM-R3: Hook para gestión de proveedores.
 *
 * - Lista proveedores de la tienda activa (cacheado con React Query)
 * - Crear nuevo proveedor (instantáneo desde el selector)
 * - Buscar por nombre (client-side, catálogo pequeño por tienda)
 */
export function useSuppliers(storeId?: string | null) {
  return useQuery({
    queryKey: ["suppliers", storeId],
    queryFn: async (): Promise<Supplier[]> => {
      if (!storeId) return [];
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .eq("store_id", storeId)
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data as Supplier[]) || [];
    },
    enabled: !!storeId,
    staleTime: 60_000, // 1 min
  });
}

export function useCreateSupplier() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: async (input: {
      name: string;
      tax_id?: string;
      phone?: string;
      email?: string;
      address?: string;
      notes?: string;
    }): Promise<Supplier> => {
      if (!user?.activeStoreId) throw new Error("No hay tienda activa");
      const { data, error } = await supabase
        .from("suppliers")
        .insert({
          store_id: user.activeStoreId,
          name: input.name.trim(),
          tax_id: input.tax_id?.trim() || null,
          phone: input.phone?.trim() || null,
          email: input.email?.trim() || null,
          address: input.address?.trim() || null,
          notes: input.notes?.trim() || null,
          is_active: true,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Supplier;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("Proveedor creado");
    },
    onError: (err: unknown) => {
      toast.error("Error al crear proveedor: " + (err instanceof Error ? err.message : "desconocido"));
    },
  });
}
