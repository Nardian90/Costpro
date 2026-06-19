"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Search, Package, Hash, Barcode, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn, formatCurrency } from "@/lib/utils";
import ProductImage from "@/components/ui/ProductImage";
import type { Product } from "@/types";

interface POSAutocompleteProps {
  /** Lista completa de productos para sugerencias (cargada en POSView). */
  products: Product[];
  /** Query actual del search bar (controlado por parent). */
  query: string;
  /** Callback cuando el usuario selecciona un producto del dropdown. */
  onSelectProduct: (product: Product) => void;
  /** Marcador de posición del input (ya pasado al SearchBar, no se usa aquí). */
  inputId?: string;
  /** Si el POS está procesando algo (loading state). */
  disabled?: boolean;
}

/**
 * POS-3b EM-7: Autocompletado tipo Shopify sobre el search input.
 *
 * Muestra un dropdown con sugerencias visuales (imagen + nombre + SKU + precio)
 * mientras el cajero escribe. Soporta navegación por teclado:
 *   - ↑/↓ para mover selección
 *   - Enter para seleccionar
 *   - Esc para cerrar
 *
 * Diseño:
 * - Hasta 6 resultados visibles (resto scrollable).
 * - Ícono diferenciador: SKU (Hash), Barcode (Barcode), Nombre (Package).
 * - Stock badge si < 5 unidades.
 * - Categoría visible en texto muted.
 *
 * Integración: se renderiza como overlay absoluto debajo del #pos-search-input.
 * El SearchBar sigue siendo el input controlado; este componente lee la query
 * vía props y muestra sugerencias sin tomar foco.
 */
export function POSAutocomplete({
  products,
  query,
  onSelectProduct,
  inputId = "pos-search-input",
  disabled = false,
}: POSAutocompleteProps) {
  // POS-3b audit fix: isOpen se deriva del query+suggestions, no es useState.
  // userClosed permite al usuario cerrar manualmente (Esc o clic fuera).
  const [userClosed, setUserClosed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  // Track de la última query para saber cuándo resetear activeIndex.
  // Se compara con la query actual; si difiere, se actualiza en el próximo setState.
  const [lastQuery, setLastQuery] = useState(query);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputElRef = useRef<HTMLInputElement | null>(null);

  // Sugerencias filtradas (máximo 8 para performance)
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || q.length < 2 || q.endsWith("*")) return [];
    return products
      .filter((p) => {
        const name = p.name.toLowerCase();
        const sku = (p.sku || "").toLowerCase();
        const barcode = (p.barcode || "").toLowerCase();
        return name.includes(q) || sku.includes(q) || barcode.includes(q);
      })
      .slice(0, 8);
  }, [products, query]);

  // POS-3b audit fix: derived state durante el render (sin useEffect con setState).
  // isOpen se deriva del query y suggestions; userClosed permite al usuario cerrar manualmente.
  const shouldShow = suggestions.length > 0 && query.length >= 2 && !query.endsWith("*");
  const isOpen = shouldShow && !userClosed;

  // Reset activeIndex cuando cambia la query (patrón "track previous value" con useState).
  // Comparación segura: si la query cambió, programar reseteo de activeIndex y userClosed.
  if (lastQuery !== query) {
    setLastQuery(query);
    setActiveIndex(0);
    setUserClosed(false);
  }

  const closeDropdown = useCallback(() => {
    setUserClosed(true);
  }, []);

  const openDropdown = useCallback(() => {
    setUserClosed(false);
  }, []);

  // Lookup del input del SearchBar por ID
  useEffect(() => {
    inputElRef.current = document.getElementById(inputId) as HTMLInputElement | null;
  }, [inputId]);

  // Listener de teclado en el input (ArrowUp/Down/Enter/Esc)
  useEffect(() => {
    const input = inputElRef.current;
    if (!input) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen || suggestions.length === 0) {
        // Si hay query y el usuario presiona ↓, abrir dropdown
        if (e.key === "ArrowDown" && suggestions.length > 0) {
          openDropdown();
          setActiveIndex(0);
          e.preventDefault();
        }
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Tab" && suggestions[activeIndex]) {
        e.preventDefault();
        onSelectProduct(suggestions[activeIndex]);
        closeDropdown();
      } else if (e.key === "Escape") {
        closeDropdown();
      }
    };

    input.addEventListener("keydown", handleKeyDown);
    return () => input.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, suggestions, activeIndex, onSelectProduct, openDropdown, closeDropdown]);

  // Cerrar al clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        // No cerrar si el clic fue en el input (porque abre el dropdown)
        if (e.target !== inputElRef.current) {
          closeDropdown();
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [closeDropdown]);

  const handleSelect = (product: Product) => {
    onSelectProduct(product);
    closeDropdown();
  };

  if (!isOpen || suggestions.length === 0 || disabled) return null;

  return (
    <AnimatePresence>
      <motion.div
        ref={dropdownRef}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.12 }}
        className="absolute left-0 right-0 top-full mt-2 z-[60] bg-card border-2 border-border rounded-2xl shadow-2xl overflow-hidden max-h-[70vh] flex flex-col"
        role="listbox"
        aria-label="Sugerencias de productos"
      >
        <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            {suggestions.length} resultado{suggestions.length !== 1 ? "s" : ""}
          </span>
          <span className="text-[9px] text-muted-foreground/70 uppercase tracking-wider">
            ↑↓ navegar · Tab seleccionar · Esc cerrar
          </span>
        </div>

        <div className="overflow-y-auto scrollbar-thin">
          {suggestions.map((product, idx) => {
            const isActive = idx === activeIndex;
            const stock = product.stock_current ?? 0;
            const stockLow = stock > 0 && stock < 5;
            const stockOut = stock <= 0;
            const matchType = getMatchType(product, query);

            return (
              <button
                key={product.id}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => handleSelect(product)}
                onMouseEnter={() => setActiveIndex(idx)}
                className={cn(
                  "w-full px-3 py-2.5 flex items-center gap-3 text-left border-b border-border/50 last:border-0 transition-colors",
                  isActive ? "bg-primary/10" : "hover:bg-muted/50",
                  stockOut && "opacity-50",
                )}
              >
                {/* Imagen */}
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted/30 shrink-0">
                  <ProductImage
                    src={product.image_url || undefined}
                    name={product.name}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {matchType === "sku" && <Hash className="w-3 h-3 text-primary shrink-0" aria-hidden="true" />}
                    {matchType === "barcode" && <Barcode className="w-3 h-3 text-primary shrink-0" aria-hidden="true" />}
                    {matchType === "name" && <Package className="w-3 h-3 text-muted-foreground shrink-0" aria-hidden="true" />}
                    <p className="text-sm font-bold text-foreground truncate">
                      {highlightMatch(product.name, query)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {product.sku && (
                      <span className="text-[10px] text-muted-foreground font-mono">
                        SKU: {product.sku}
                      </span>
                    )}
                    {product.category && (
                      <span className="text-[10px] text-muted-foreground/70">
                        · {product.category}
                      </span>
                    )}
                    {stockLow && (
                      <span className="text-[9px] font-bold text-warning bg-warning/10 px-1.5 py-0.5 rounded">
                        Stock bajo ({stock})
                      </span>
                    )}
                    {stockOut && (
                      <span className="text-[9px] font-bold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
                        Sin stock
                      </span>
                    )}
                  </div>
                </div>

                {/* Precio */}
                <div className="text-right shrink-0">
                  <p className="text-sm font-black text-primary tabular-nums">
                    {formatCurrency(product.price || 0)}
                  </p>
                  {isActive && (
                    <ArrowRight className="w-3 h-3 text-primary ml-auto mt-1" aria-hidden="true" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Helpers ──────────────────────────────────────────────────

function getMatchType(product: Product, query: string): "sku" | "barcode" | "name" {
  const q = query.trim().toLowerCase();
  if (product.sku?.toLowerCase().includes(q)) return "sku";
  if (product.barcode?.toLowerCase().includes(q)) return "barcode";
  return "name";
}

function highlightMatch(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-primary/20 text-primary px-0.5 rounded">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}
