"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { useAuthStore } from "@/store";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

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
 * CP-PROVEEDORES-001: mensaje comprensible para el usuario final a partir
 * del error crudo de Supabase/PostgREST. El objeto PostgrestError NO es
 * instanceof Error (es un objeto plano), por lo que el flujo anterior
 * imprimía «desconocido» aunque el error traía message — ocultando la
 * causa real (p. ej. 42501 RLS, 23505 duplicado, red caída).
 *
 * El detalle técnico queda en el log del servidor (con contexto), nunca
 * expuesto al usuario.
 */
export function describeSupplierError(err: unknown): string {
  const e = err as { message?: string; code?: string; status?: number } | null;
  const message = typeof e?.message === "string" ? e.message : "";
  const code = typeof e?.code === "string" ? e.code : "";
  const status = typeof e?.status === "number" ? e.status : 0;

  if (code === "23505" || /duplicate key|unique constraint/i.test(message)) {
    return "Ya existe un proveedor con ese nombre en esta tienda.";
  }
  if (code === "42501" || status === 403 || /row-level security/i.test(message)) {
    return "No tienes autorización para gestionar proveedores en esta tienda.";
  }
  if (code === "23503" || /violates foreign key/i.test(message)) {
    return "La tienda indicada no es válida. Selecciona una tienda e inténtalo de nuevo.";
  }
  if (code === "23502" || /not-null violation/i.test(message)) {
    return "Falta información obligatoria del proveedor (nombre).";
  }
  if ((status === 0 && !!message) || /fetch|network|Failed to fetch/i.test(message)) {
    return "Problema de conexión. Revisa tu red e inténtalo de nuevo.";
  }
  if (status >= 500) {
    return "Error temporal del servidor. Inténtalo de nuevo en unos momentos.";
  }
  return "No se pudo crear el proveedor. Inténtalo de nuevo.";
}

/** ¿El error es de unicidad? (para que la UI pueda seleccionar el existente) */
export function isSupplierDuplicateError(err: unknown): boolean {
  const e = err as { message?: string; code?: string } | null;
  return e?.code === "23505" || /duplicate key|unique constraint/i.test(e?.message ?? "");
}

/**
 * REC-2 MM-R3 / CP-PROVEEDORES-001: Hook para gestión de proveedores.
 *
 * - Lista proveedores de la tienda activa (cacheado con React Query)
 * - Crear nuevo proveedor (instantáneo desde el selector de la recepción)
 * - Buscar por nombre (client-side, catálogo pequeño por tienda)
 *
 * Modelo de visibilidad: los proveedores son recursos operativos COMPARTIDOS
 * de la tienda (suppliers.store_id) — no registros privados del usuario que
 * los creó. El RLS del backend (migración 20261101120000) autoriza a todos
 * los usuarios con membresía activa de la tienda y al nivel administrativo
 * (admin|superadmin); este hook solo consulta.
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
      if (!user?.activeStoreId) {
        throw new Error("ERR_NO_ACTIVE_STORE");
      }
      const name = input.name.trim();
      if (!name) {
        throw new Error("ERR_SUPPLIER_NAME_REQUIRED");
      }

      // CP-PROVEEDORES-001 — anti-duplicado por reintento: si ya existe un
      // proveedor ACTIVO con el mismo nombre en la tienda activa, se
      // REUTILIZA en vez de insertar (comparación exacta case-insensitive;
      // el patrón ilike se escapa para que nombres con % o _ no actúen de
      // comodines). La unicidad real de la BD no cambia (no existe
      // constraint único sobre suppliers; añadirla exigiría auditar datos
      // históricos y está fuera del alcance mínimo de este fix).
      const likeEscaped = name.replace(/[\\%_]/g, (c) => `\\${c}`);
      const { data: candidates, error: lookupError } = await supabase
        .from("suppliers")
        .select("*")
        .eq("store_id", user.activeStoreId)
        .eq("is_active", true)
        .ilike("name", likeEscaped)
        .limit(5);
      if (lookupError) throw lookupError;
      const exact = (candidates ?? []).find(
        (row) => (row as Supplier).name.trim().toLowerCase() === name.toLowerCase()
      );
      if (exact) {
        return exact as Supplier;
      }

      const { data, error } = await supabase
        .from("suppliers")
        .insert({
          store_id: user.activeStoreId,
          name,
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
    onSuccess: (created) => {
      // Refresco del listado ANTES del toast: si esto fallara, no debe
      // interpretarse como fallo de la creación (la fila ya existe) — por
      // eso el invalidateQueries va en onSuccess y el toast es explícito.
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success(`Proveedor «${created.name}» creado`);
    },
    onError: (err: unknown) => {
      // CP-PROVEEDORES-001: mensajería estructurada — el detalle técnico
      // (código/message crudos) se registra en el log con contexto y al
      // usuario se le muestra una causa comprensible, no «desconocido».
      if (err instanceof Error && err.message === "ERR_NO_ACTIVE_STORE") {
        toast.error("No hay tienda activa. Selecciona una tienda antes de crear proveedores.");
        logger.warn("DATABASE", "CREATE_SUPPLIER_NO_ACTIVE_STORE", { userId: user?.id });
        return;
      }
      if (err instanceof Error && err.message === "ERR_SUPPLIER_NAME_REQUIRED") {
        toast.error("El nombre del proveedor es obligatorio.");
        return;
      }
      const e = err as { message?: string; code?: string; status?: number } | null;
      logger.error("DATABASE", "CREATE_SUPPLIER_FAILED", {
        userId: user?.id,
        activeStoreId: user?.activeStoreId,
        code: e?.code,
        status: e?.status,
        message: e?.message,
      });
      toast.error(describeSupplierError(err));
    },
  });
}
