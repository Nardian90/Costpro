"use client";

/**
 * REC-2 MM-R3: Selector de proveedor con autocompletado — v2 (FASE 4 clasificador).
 *
 * MISIÓN CLASIFICADOR MAESTRO: el selector de proveedores de RECEPCIONES
 * consulta el CLASIFICADOR MAESTRO de la organización (RPC
 * search_master_parties, rol proveedor, solo activos) y entrega el SNAPSHOT
 * de identificación (código, NIT, teléfono, dirección) que se congela en la
 * recepción (receipts.supplier_code/address/phone/tax_id). Reglas:
 *  · Tienda NO conectada / offline → fallback transparente a la tabla
 *    `suppliers` por tienda (comportamiento previo intacto).
 *  · Alta al vuelo: con la tienda conectada el tercero se crea en el MAESTRO
 *    (create_master_party, rol proveedor) y queda compartido; sin conexión se
 *    crea local como antes (useCreateSupplier).
 *  · El snapshot viaja a la recepción por `onChange(name, detail)` — la
 *    relación histórica no depende de joins vivos con el maestro.
 */

import React, { useState, useRef, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Plus, X, Check, Building2, Share2, HardDrive } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSuppliers, useCreateSupplier, type Supplier } from "@/hooks/api/useSuppliers";
import { useCreateMasterParty, translateClassifierError } from "@/hooks/api/useClassifier";
import { useAuthStore } from "@/store";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

/** Snapshot de identificación entregado a la recepción (se congela en receipts). */
export interface SupplierSelection {
  /** Proveedor local (tabla suppliers de la tienda). */
  supplierId?: string | null;
  /** Tercero del clasificador maestro (metadato; el snapshot textual viaja aparte). */
  masterPartyId?: string | null;
  code?: string | null;
  tax_id?: string | null;
  phone?: string | null;
  address?: string | null;
  email?: string | null;
  source: "master" | "local" | "manual";
}

interface SupplierSelectorProps {
  value: string;
  onChange: (name: string, detail?: SupplierSelection | null) => void;
  className?: string;
}

interface PartyOption {
  id: string;
  name: string;
  code: string;
  tax_id: string | null;
  phone: string | null;
  address: string | null;
  email: string | null;
}

export function SupplierSelector({ value, onChange, className }: SupplierSelectorProps) {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId;
  const { data: suppliers = [], isLoading } = useSuppliers(storeId);
  const createSupplier = useCreateSupplier();
  const createMasterParty = useCreateMasterParty(storeId ?? null);

  const [isOpen, setIsOpen] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierPhone, setNewSupplierPhone] = useState("");
  const [newSupplierTaxId, setNewSupplierTaxId] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Fuente primaria: Clasificador Maestro (solo proveedores activos) ──
  const masterQuery = useQuery({
    queryKey: ["classifier-parties-lite-supplier", storeId, value.trim()],
    queryFn: async (): Promise<PartyOption[]> => {
      if (!storeId) return [];
      const { data, error } = await supabase.rpc("search_master_parties", {
        p_store_id: storeId,
        p_search: value.trim(),
        p_kind: "supplier",
        p_status: "active",
        p_limit: 8,
        p_offset: 0,
      });
      if (error) throw error;
      return ((data ?? []) as Array<Record<string, unknown>>).map((p) => ({
        id: String(p.id),
        name: String(p.name ?? ""),
        code: String(p.code ?? ""),
        tax_id: (p.tax_id as string | null) ?? null,
        phone: (p.phone as string | null) ?? null,
        address: (p.address as string | null) ?? null,
        email: (p.email as string | null) ?? null,
      }));
    },
    enabled: isOpen && !!storeId,
    staleTime: 30_000,
    retry: false,
  });
  const masterParties: PartyOption[] = masterQuery.data ?? [];
  const masterConnected = !masterQuery.isError;

  const localMatches = useMemo(() => {
    const q = value.trim().toLowerCase();
    let list = suppliers;
    if (q) list = list.filter((s) => s.name.toLowerCase().includes(q));
    return list.slice(0, 8);
  }, [suppliers, value]);

  // Filas del listado: maestro primero + locales (evitando duplicar por nombre)
  const rows = useMemo(() => {
    const masterNames = new Set(masterParties.map((p) => p.name.toLowerCase()));
    const localRows = localMatches
      .filter((s) => !masterNames.has(s.name.toLowerCase()))
      .map((s) => ({
        key: `local-${s.id}`,
        kind: "local" as const,
        id: s.id,
        name: s.name,
        code: null as string | null,
        tax_id: s.tax_id ?? null,
        phone: s.phone ?? null,
        address: s.address ?? null,
        email: s.email ?? null,
      }));
    const masterRows = masterParties.map((p) => ({
      key: `master-${p.id}`,
      kind: "master" as const,
      id: p.id,
      name: p.name,
      code: p.code,
      tax_id: p.tax_id,
      phone: p.phone,
      address: p.address,
      email: p.email,
    }));
    return [...masterRows, ...localRows].slice(0, 12);
  }, [masterParties, localMatches]);

  // Cerrar al clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowCreateForm(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (row: (typeof rows)[number]) => {
    onChange(row.name, {
      supplierId: row.kind === "local" ? row.id : null,
      masterPartyId: row.kind === "master" ? row.id : null,
      code: row.code,
      tax_id: row.tax_id,
      phone: row.phone,
      address: row.address,
      email: row.email,
      source: row.kind,
    });
    setIsOpen(false);
    setShowCreateForm(false);
  };

  const handleCreateNew = async () => {
    const name = newSupplierName.trim();
    if (!name) {
      return;
    }
    // Alta al vuelo — CP-PROVEEDORES-001: try/catch (ver comentario original).
    try {
      if (masterConnected && storeId) {
        // MISIÓN CLASIFICADOR MAESTRO: el proveedor se crea en el MAESTRO y
        // queda compartido con las tiendas conectadas (además se crea/vincula
        // la fila local de esta tienda dentro de la misma RPC).
        const created = await createMasterParty.mutateAsync({
          name,
          phone: newSupplierPhone.trim() || undefined,
          tax_id: newSupplierTaxId.trim() || undefined,
          is_client: false,
          is_supplier: true,
          party_type: newSupplierTaxId.trim() ? 'juridica' : 'natural',
        });
        if (created.source === 'master' && created.master_party_id) {
          toast.success('Proveedor creado en el Clasificador Maestro (compartido)');
          onChange(name, {
            masterPartyId: created.master_party_id,
            supplierId: created.supplier_id ?? null,
            code: null,
            tax_id: newSupplierTaxId.trim() || null,
            phone: newSupplierPhone.trim() || null,
            address: null,
            email: null,
            source: "master",
          });
        } else {
          // Tienda sin conexión: la RPC creó filas locales
          onChange(name, { supplierId: created.supplier_id ?? null, source: "local" });
        }
        setNewSupplierName("");
        setNewSupplierPhone("");
        setNewSupplierTaxId("");
        setShowCreateForm(false);
        setIsOpen(false);
      } else {
        // Fallback legacy: alta local en la tabla suppliers de la tienda.
        const created = await createSupplier.mutateAsync({
          name,
          phone: newSupplierPhone.trim() || undefined,
          tax_id: newSupplierTaxId.trim() || undefined,
        });
        handleSelect({
          key: `local-${created.id}`,
          kind: "local",
          id: created.id,
          name: created.name,
          code: null,
          tax_id: created.tax_id ?? null,
          phone: created.phone ?? null,
          address: created.address ?? null,
          email: created.email ?? null,
        });
        setNewSupplierName("");
        setNewSupplierPhone("");
        setNewSupplierTaxId("");
      }
    } catch (e) {
      // La causa ya se mostró vía onError del hook correspondiente (toast
      // estructurado). Mantener el formulario abierto permite corregir sin
      // reescribir todo — sin riesgo de doble alta (los hooks reutilizan el
      // proveedor existente si ya está en la tienda / el maestro falla con
      // ERR_PARTY_* traducido).
      if (createMasterParty.isError) toast.error(translateClassifierError(e));
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value, null);
            setIsOpen(true);
            setShowCreateForm(false);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Buscar o crear proveedor..."
          className="neu-input w-full font-bold pl-10"
          aria-label="Proveedor"
          aria-expanded={isOpen}
          aria-controls="supplier-listbox"
          aria-autocomplete="list"
          role="combobox"
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange("", null);
              inputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-destructive"
            aria-label="Limpiar"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {isOpen && !showCreateForm && (
        <div id="supplier-listbox" className="absolute z-50 mt-1 w-full bg-card border-2 border-border rounded-xl shadow-2xl overflow-hidden max-h-72 flex flex-col" role="listbox">
          {isLoading && masterQuery.isLoading ? (
            <div className="p-3 text-xs text-muted-foreground text-center">Cargando proveedores...</div>
          ) : rows.length === 0 ? (
            <div className="p-3 text-center space-y-2">
              <p className="text-xs text-muted-foreground">
                {value ? `No hay proveedores que coincidan con "${value}"` : "Sin proveedores registrados"}
              </p>
              <button
                type="button"
                onClick={() => {
                  setNewSupplierName(value);
                  setShowCreateForm(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-black uppercase tracking-widest hover:bg-primary/20"
              >
                <Plus className="w-3 h-3" />
                Crear nuevo
              </button>
            </div>
          ) : (
            <>
              <div className="overflow-y-auto">
                {rows.map((row) => (
                  <button
                    key={row.key}
                    type="button"
                    onClick={() => handleSelect(row)}
                    className="w-full px-3 py-2 text-left hover:bg-primary/5 transition-colors border-b border-border/50 last:border-0 flex items-center gap-2"
                  >
                    <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{row.name}</p>
                      {(row.phone || row.tax_id || row.code) && (
                        <p className="text-[10px] text-muted-foreground">
                          {row.code && <span>{row.code}</span>}
                          {row.code && (row.phone || row.tax_id) && <span> · </span>}
                          {row.phone && <span>{row.phone}</span>}
                          {row.phone && row.tax_id && <span> · </span>}
                          {row.tax_id && <span>NIT: {row.tax_id}</span>}
                        </p>
                      )}
                    </div>
                    {row.kind === "master" ? (
                      <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-1 py-0.5 rounded bg-primary/10 text-primary shrink-0">
                        <Share2 className="w-2.5 h-2.5" /> Maestro
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-1 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                        <HardDrive className="w-2.5 h-2.5" /> Local
                      </span>
                    )}
                    {value === row.name && <Check className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  setNewSupplierName(value);
                  setShowCreateForm(true);
                }}
                className="w-full p-2 border-t border-border text-xs font-black uppercase tracking-widest text-primary hover:bg-primary/5 flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3 h-3" />
                Crear nuevo proveedor
              </button>
            </>
          )}
        </div>
      )}

      {showCreateForm && (
        <div className="absolute z-50 mt-1 w-full bg-card border-2 border-primary/30 rounded-xl shadow-2xl p-3 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Nuevo proveedor {masterConnected ? "(en el clasificador maestro)" : "(local de la tienda)"}
          </p>
          <input
            type="text"
            value={newSupplierName}
            onChange={(e) => setNewSupplierName(e.target.value)}
            placeholder="Nombre *"
            className="neu-input w-full text-sm"
            autoFocus
            aria-label="Nombre del proveedor"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="tel"
              value={newSupplierPhone}
              onChange={(e) => setNewSupplierPhone(e.target.value)}
              placeholder="Teléfono"
              className="neu-input w-full text-xs"
              aria-label="Teléfono"
            />
            <input
              type="text"
              value={newSupplierTaxId}
              onChange={(e) => setNewSupplierTaxId(e.target.value)}
              placeholder="NIT/Tax ID"
              className="neu-input w-full text-xs"
              aria-label="NIT o Tax ID"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="flex-1 h-9 rounded-lg border border-border text-xs font-black uppercase hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleCreateNew}
              disabled={!newSupplierName.trim() || createSupplier.isPending || createMasterParty.isPending}
              className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-xs font-black uppercase hover:opacity-90 disabled:opacity-50"
            >
              {createSupplier.isPending || createMasterParty.isPending ? "Creando..." : "Crear"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
