"use client";

/**
 * POS-2 MM-7 · Selector de cliente con autocompletado — v2 (FASE 4 clasificador).
 *
 * MISIÓN CLASIFICADOR MAESTRO: el selector de clientes de VENTAS consulta el
 * CLASIFICADOR MAESTRO de la organización (RPC search_master_parties, filtro
 * role cliente/ambos, solo activos) y arrastra el SNAPSHOT del comprador
 * (Nombre, Dirección, Código) que se congela en la venta para la Factura
 * SC-2-12. Reglas de la misión:
 *  · Clientes eventuales soportados: «Walk-in» y «Manual» siguen funcionando
 *    sin registro previo (create_sale_v2 acepta customer_name sin id).
 *  · OFFLINE / tienda sin conexión al clasificador → fallback transparente al
 *    catálogo local Dexie (IPV), comportamiento previo intacto.
 *  · Históricos: la venta guarda el snapshot (transactions.customer_address /
 *    customer_code); NUNCA se resuelve dinámicamente desde el maestro.
 *
 * Diseño:
 * - Input de búsqueda con debounce (250 ms).
 * - Fuente primaria: clasificador maestro (fuente «Maestro»); fuente local:
 *   tabla `customers` de Dexie (fuente «Local»). Se fusionan en un listado.
 * - Botón "Walk-in" (cliente eventual) — default. Botón "Manual" para cliente
 *   efímero (sin persistir).
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useQuery } from "@tanstack/react-query";
import { Search, X, User, UserPlus, Check, Share2, HardDrive } from "lucide-react";
import { cn } from "@/lib/utils";
import { db, type Customer as DexieCustomer } from "@/lib/dexie";
import { useCartStore } from "@/store/cart";
import { useAuthStore } from "@/store";
import { useShallow } from "zustand/react/shallow";
import { supabase } from "@/lib/supabaseClient";

interface PartyOption {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  source: "master" | "local";
}

export function CustomerSelector({ className }: { className?: string }) {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId || null;
  const { customerId, customerName, customerCode, setCustomer } = useCartStore(
    useShallow((s) => ({
      customerId: s.customerId,
      customerName: s.customerName,
      customerCode: s.customerCode,
      setCustomer: s.setCustomer,
    })),
  );

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce de la búsqueda (RPC + Dexie)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  // Cerrar dropdown al clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowManualForm(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── Fuente primaria: Clasificador Maestro (solo clientes activos) ──
  const masterQuery = useQuery({
    queryKey: ["classifier-parties-lite", storeId, debounced],
    queryFn: async (): Promise<PartyOption[]> => {
      if (!storeId) return [];
      const { data, error } = await supabase.rpc("search_master_parties", {
        p_store_id: storeId,
        p_search: debounced,
        p_kind: "client",
        p_status: "active",
        p_limit: 8,
        p_offset: 0,
      });
      if (error) throw error;
      return ((data ?? []) as Array<Record<string, unknown>>).map((p) => ({
        id: String(p.id),
        name: String(p.name ?? ""),
        code: String(p.code ?? ""),
        address: (p.address as string | null) ?? null,
        phone: (p.phone as string | null) ?? null,
        source: "master" as const,
      }));
    },
    enabled: isOpen && !!storeId,
    staleTime: 30_000,
    retry: false,
  });
  // OFFLINE / tienda no conectada → degradación silenciosa a Dexie (misión).
  const masterParties: PartyOption[] = masterQuery.data ?? [];

  const allDexieCustomers = useLiveQuery(() => db.customers.limit(500).toArray()) || [];

  const dexieMatches: PartyOption[] = useMemo(() => {
    const q = debounced.toLowerCase();
    let list = allDexieCustomers;
    if (q) {
      list = list.filter((c) => {
        const name = (c.nombre || "").toLowerCase();
        const ci = (c.ci || "").toLowerCase();
        const phone = (c.phone || "").toLowerCase();
        return name.includes(q) || ci.includes(q) || phone.includes(q);
      });
    }
    return list.slice(0, 8).map((c: DexieCustomer) => ({
      id: c.ci,
      name: c.nombre,
      code: c.ci,
      address: null,
      phone: c.phone ?? null,
      source: "local" as const,
    }));
  }, [allDexieCustomers, debounced]);

  const options = useMemo(
    () => [...masterParties, ...dexieMatches].slice(0, 12),
    [masterParties, dexieMatches],
  );

  const handleSelect = (o: PartyOption) => {
    if (o.source === "master") {
      // Snapshot completo del comprador (Nombre/Dirección/Código → SC-2-12).
      // El id UUID del maestro viaja como customer_id (metadato sin FK).
      setCustomer(o.id, o.name, o.address, o.code);
    } else {
      // Catálogo local Dexie: comportamiento previo intacto (id = CI).
      setCustomer(o.id, o.name);
    }
    setQuery("");
    setIsOpen(false);
  };

  const handleWalkIn = () => {
    setCustomer(null, null);
    setQuery("");
    setIsOpen(false);
    setShowManualForm(false);
  };

  const handleManualSave = () => {
    const name = manualName.trim();
    if (!name) return;
    // ID pseudo-único para clientes manuales no persistidos
    setCustomer(`manual-${Date.now()}`, name);
    setManualName("");
    setManualPhone("");
    setShowManualForm(false);
    setIsOpen(false);
  };

  const hasCustomer = !!customerId;
  const masterUnavailable = isOpen && masterQuery.isError;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Trigger button — muestra cliente actual o "Walk-in" */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 rounded-xl border-2 transition-all text-sm",
          hasCustomer
            ? "border-primary/30 bg-primary/5 text-foreground"
            : "border-border bg-background text-muted-foreground hover:border-primary/40",
        )}
        aria-label={hasCustomer ? `Cliente: ${customerName}` : "Seleccionar cliente (walk-in)"}
        aria-expanded={isOpen}
      >
        <User
          className={cn("w-4 h-4 shrink-0", hasCustomer ? "text-primary" : "text-muted-foreground")}
          aria-hidden="true"
        />
        <span className="flex-1 text-left font-bold truncate">
          {hasCustomer ? customerName : "Cliente eventual (walk-in)"}
        </span>
        {hasCustomer && customerCode && (
          <span className="text-[10px] font-mono text-muted-foreground shrink-0">{customerCode}</span>
        )}
        {hasCustomer && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              handleWalkIn();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                handleWalkIn();
              }
            }}
            className="p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
            aria-label="Quitar cliente"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-card border-2 border-border rounded-xl shadow-xl overflow-hidden">
          {!showManualForm ? (
            <>
              {/* Search input */}
              <div className="p-2 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar por nombre, código, NIT/CI o teléfono..."
                    className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-border bg-background focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
                    aria-label="Buscar cliente"
                  />
                </div>
              </div>

              {/* Results list */}
              <div className="max-h-64 overflow-y-auto">
                {masterQuery.isLoading ? (
                  <p className="px-3 py-4 text-xs text-muted-foreground text-center">Buscando en el clasificador...</p>
                ) : options.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                    {query
                      ? "Sin coincidencias. Usa \"Capturar manual\"."
                      : "No hay clientes del clasificador ni locales."}
                  </p>
                ) : (
                  options.map((o) => (
                    <button
                      key={`${o.source}-${o.id}`}
                      type="button"
                      onClick={() => handleSelect(o)}
                      className="w-full px-3 py-2 text-left hover:bg-primary/5 transition-colors flex items-center gap-2 border-b border-border/50 last:border-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-foreground truncate">{o.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {o.code}{o.phone ? ` · ${o.phone}` : ""}
                        </p>
                      </div>
                      {o.source === "master" ? (
                        <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-1 py-0.5 rounded bg-primary/10 text-primary shrink-0">
                          <Share2 className="w-2.5 h-2.5" /> Maestro
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-1 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                          <HardDrive className="w-2.5 h-2.5" /> Local
                        </span>
                      )}
                      {customerId === o.id && (
                        <Check className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                      )}
                    </button>
                  ))
                )}
              </div>

              {masterUnavailable && (
                <p className="px-3 py-1.5 text-[10px] text-amber-600 bg-amber-500/5 border-t border-border/50">
                  Clasificador no disponible (offline o tienda sin conectar) — mostrando catálogo local.
                </p>
              )}

              {/* Footer actions */}
              <div className="border-t border-border p-2 flex gap-2">
                <button
                  type="button"
                  onClick={handleWalkIn}
                  className={cn(
                    "flex-1 px-2 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg border transition-colors",
                    !hasCustomer
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  Walk-in
                </button>
                <button
                  type="button"
                  onClick={() => setShowManualForm(true)}
                  className="flex-1 px-2 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex items-center justify-center gap-1"
                >
                  <UserPlus className="w-3 h-3" />
                  Manual
                </button>
              </div>
            </>
          ) : (
            /* Manual capture form */
            <div className="p-3 space-y-2">
              <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                Capturar cliente manual
              </p>
              <input
                type="text"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="Nombre del cliente"
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
                autoFocus
              />
              <input
                type="tel"
                value={manualPhone}
                onChange={(e) => setManualPhone(e.target.value)}
                placeholder="Teléfono (opcional)"
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
              />
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowManualForm(false)}
                  className="flex-1 px-2 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleManualSave}
                  disabled={!manualName.trim()}
                  className="flex-1 px-2 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  Guardar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
