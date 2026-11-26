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
 * CP-AP-ACCOUNTING-INTEGRITY-AND-SUPPLIER-RECONCILIATION-001 §FASE 6.4 —
 * normalización de nombre para detección de duplicados: minúsculas, sin
 * diacríticos y sin separadores. «Tienda Pueblo» ≡ «TiendaPueblo» ≡
 * «TIENDA PUEBLO.» — la causa raíz del quirk auditado era una variante de
 * espaciado. NO impone unicidad (misión: «no imponer unicidad estricta
 * basada exclusivamente en el nombre»): solo habilita coincidencias para
 * ADVERTIR al usuario antes de crear.
 */
export function normalizeSupplierName(name: string | null | undefined): string {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * CP-AP-ACCOUNTING-INTEGRITY-001 §FASE 6.4 — coincidencias posibles de un
 * proveedor nuevo contra los existentes de la tienda: nombre normalizado,
 * identificación fiscal o teléfono. Devuelve los candidatos a ADVERTIR
 * (la decisión final sigue siendo del usuario).
 */
export function findSupplierMatches(
  candidates: Supplier[],
  input: { name: string; tax_id?: string | null; phone?: string | null },
): Supplier[] {
  const nn = normalizeSupplierName(input.name);
  const tax = (input.tax_id ?? "").trim();
  const phone = (input.phone ?? "").replace(/\D/g, "");
  if (!nn) return [];
  return candidates.filter(s => {
    if (normalizeSupplierName(s.name) === nn && nn.length > 0) return true;
    if (tax && (s.tax_id ?? "").trim().toUpperCase() === tax.toUpperCase()) return true;
    if (phone && (s.phone ?? "").replace(/\D/g, "") === phone && phone.length >= 6) return true;
    return false;
  });
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
      /** R-15 (CP-BRA-REMEDIATION-001): confirmación explícita de duplicado
       *  tras la advertencia de la UI — el guard server-side la exige. */
      confirmDuplicate?: boolean;
      duplicateReason?: string;
    }): Promise<Supplier> => {
      if (!user?.activeStoreId) {
        throw new Error("ERR_NO_ACTIVE_STORE");
      }
      const name = input.name.trim();
      if (!name) {
        throw new Error("ERR_SUPPLIER_NAME_REQUIRED");
      }

      // CP-BRA-REMEDIATION-001 (R-15): la alta local pasa por el RPC
      // autoritativo create_supplier_local — la advertencia de la UI
      // (SupplierSelector) ya existe, pero la última barrera es la BD
      // (SEC-001: la UI es conveniencia; la última barrera SIEMPRE es la DB).
      // El RPC conserva el contrato vigente del hook:
      //   · coincidencia EXACTA (case-insensitive, espaciado normalizado)
      //     → REUTILIZA el existente (status='reused');
      //   · sospechosos por nombre normalizado/NIT/teléfono → rechazo
      //     ERR_SUPPLIER_DUPLICATE_SUSPECTED con los candidatos, SALVO
      //     confirmación explícita (confirmDuplicate + duplicateReason)
      //     → crea y audita SUPPLIER_DUPLICATE_CONFIRMED (nunca silencioso);
      //   · sin coincidencias → alta normal.
      // (Unicidad NO estricta por decisión del propietario §8.4 CP-AP.)
      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        "create_supplier_local",
        {
          p_store_id: user.activeStoreId,
          p_name: name,
          p_tax_id: input.tax_id?.trim() || null,
          p_phone: input.phone?.trim() || null,
          p_email: input.email?.trim() || null,
          p_address: input.address?.trim() || null,
          p_notes: input.notes?.trim() || null,
          p_confirm_duplicate: input.confirmDuplicate ?? false,
          p_duplicate_reason: input.duplicateReason?.trim() || null,
        },
      );
      if (rpcError) {
        // El rechazo R-15 lleva los candidatos en el mensaje: se propaga
        // tal cual para que la UI pueda ofrecer la confirmación explícita.
        throw rpcError;
      }
      const supplier = (rpcResult as { status: string; supplier: Supplier })
        ?.supplier;
      if (!supplier?.id) {
        throw new Error("ERR_SUPPLIER_CREATE_UNEXPECTED_RESULT");
      }
      return supplier;
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
