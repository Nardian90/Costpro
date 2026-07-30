"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { Search, Plus, X, Check, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSuppliers, useCreateSupplier, type Supplier } from "@/hooks/api/useSuppliers";
import { useAuthStore } from "@/store";

interface SupplierSelectorProps {
  value: string;
  onChange: (name: string, supplierId?: string | null) => void;
  className?: string;
}

/**
 * REC-2 MM-R3: Selector de proveedor con autocompletado.
 *
 * Combobox con:
 * - Buscador client-side sobre suppliers de la tienda
 * - Crear nuevo proveedor al vuelo (campos: nombre + teléfono + tax_id opcional)
 * - Si el usuario escribe un nombre que no existe y Enter, lo crea y selecciona
 * - Mantiene compatibilidad con el flujo anterior (texto libre) si no hay suppliers
 *
 * El componente retorna el `name` del proveedor (para compatibilidad con el
 * esquema actual de receipts) y opcionalmente el `supplierId` para futuras FK.
 */
export function SupplierSelector({ value, onChange, className }: SupplierSelectorProps) {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId;
  const { data: suppliers = [], isLoading } = useSuppliers(storeId);
  const createSupplier = useCreateSupplier();

  const [isOpen, setIsOpen] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierPhone, setNewSupplierPhone] = useState("");
  const [newSupplierTaxId, setNewSupplierTaxId] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filtrar proveedores por texto
  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return suppliers.slice(0, 8);
    return suppliers
      .filter((s) => s.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [suppliers, value]);

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

  const handleSelect = (supplier: Supplier) => {
    onChange(supplier.name, supplier.id);
    setIsOpen(false);
    setShowCreateForm(false);
  };

  const handleCreateNew = async () => {
    const name = newSupplierName.trim();
    if (!name) {
      return;
    }
    const created = await createSupplier.mutateAsync({
      name,
      phone: newSupplierPhone.trim() || undefined,
      tax_id: newSupplierTaxId.trim() || undefined,
    });
    handleSelect(created);
    setNewSupplierName("");
    setNewSupplierPhone("");
    setNewSupplierTaxId("");
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
          {isLoading ? (
            <div className="p-3 text-xs text-muted-foreground text-center">Cargando proveedores...</div>
          ) : filtered.length === 0 ? (
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
                {filtered.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSelect(s)}
                    className="w-full px-3 py-2 text-left hover:bg-primary/5 transition-colors border-b border-border/50 last:border-0 flex items-center gap-2"
                  >
                    <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{s.name}</p>
                      {(s.phone || s.tax_id) && (
                        <p className="text-[10px] text-muted-foreground">
                          {s.phone && <span>{s.phone}</span>}
                          {s.phone && s.tax_id && <span> · </span>}
                          {s.tax_id && <span>Tax: {s.tax_id}</span>}
                        </p>
                      )}
                    </div>
                    {value === s.name && <Check className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />}
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
            Nuevo proveedor
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
              disabled={!newSupplierName.trim() || createSupplier.isPending}
              className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-xs font-black uppercase hover:opacity-90 disabled:opacity-50"
            >
              {createSupplier.isPending ? "Creando..." : "Crear"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
