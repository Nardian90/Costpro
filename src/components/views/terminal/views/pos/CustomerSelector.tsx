"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Search, X, User, UserPlus, Check } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { db, type Customer as DexieCustomer } from "@/lib/dexie";
import { useCartStore } from "@/store/cart";
import { useShallow } from "zustand/react/shallow";

/**
 * POS-2 MM-7: Selector de cliente con autocompletado.
 *
 * Diseño:
 * - Input de búsqueda con debounce visual (sin delay artificial — Dexie es local).
 * - Busca por nombre, CI o teléfono en la tabla `customers` de Dexie (IPV).
 * - Dropdown con resultados, clic para seleccionar.
 * - Botón "Walk-in" (cliente eventual) — default.
 * - Botón "Manual" para capturar un cliente nuevo (sin persistirlo en Dexie).
 *
 * El cliente seleccionado se persiste en `cart.customerId` + `cart.customerName`
 * (MM-10 ya añadió estos campos al store).
 */
export function CustomerSelector({ className }: { className?: string }) {
  const { customerId, customerName, setCustomer } = useCartStore(
    useShallow((s) => ({
      customerId: s.customerId,
      customerName: s.customerName,
      setCustomer: s.setCustomer,
    })),
  );

  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const allCustomers = useLiveQuery(() => db.customers.limit(500).toArray()) || [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allCustomers.slice(0, 8);
    return allCustomers
      .filter((c) => {
        const name = (c.nombre || "").toLowerCase();
        const ci = (c.ci || "").toLowerCase();
        const phone = (c.phone || "").toLowerCase();
        return name.includes(q) || ci.includes(q) || phone.includes(q);
      })
      .slice(0, 8);
  }, [allCustomers, query]);

  const handleSelect = (c: DexieCustomer) => {
    setCustomer(c.ci, c.nombre);
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
                    placeholder="Buscar por nombre, CI o teléfono..."
                    className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-border bg-background focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
                    aria-label="Buscar cliente"
                  />
                </div>
              </div>

              {/* Results list */}
              <div className="max-h-64 overflow-y-auto">
                {filtered.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                    {query
                      ? "Sin coincidencias. Usa \"Capturar manual\"."
                      : "No hay clientes cargados."}
                  </p>
                ) : (
                  filtered.map((c) => (
                    <button
                      key={c.ci}
                      type="button"
                      onClick={() => handleSelect(c)}
                      className="w-full px-3 py-2 text-left hover:bg-primary/5 transition-colors flex items-center gap-2 border-b border-border/50 last:border-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-foreground truncate">{c.nombre}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {c.ci}{c.phone ? ` · ${c.phone}` : ""}
                        </p>
                      </div>
                      {customerId === c.ci && (
                        <Check className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                      )}
                    </button>
                  ))
                )}
              </div>

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
