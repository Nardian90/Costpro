"use client";

import { useState, useMemo, useCallback, useEffect, useRef, useTransition } from "react";
import type { Product } from "@/types";

/**
 * POS-3b EM-2: Server-side search paginado.
 *
 * Problema previo: usePOSProductFilters carga TODOS los productos del store
 * y filtra client-side. Con >2000 productos, esto degrada el search.
 *
 * Solución híbrida (sin requerir nueva RPC en BD):
 * 1. Recibe la lista completa de productos (cargada por useProducts).
 * 2. Aplica paginación client-side: solo devuelve los primeros N resultados
 *    que coincidan con la query (default 60).
 * 3. Carga más resultados "load more" cuando el usuario scrollea o pide más.
 *
 * Esto reduce el renderizado DOM de 2000+ a 60 productos iniciales.
 *
 * Para una implementación server-side pura (RPC paginated), ver docs/EM-2-RPC.md
 * donde se documenta el SQL necesario para crear get_products_for_pos_paginated.
 */

interface UsePOSServerSearchParams {
  products: Product[];
  initialPageSize?: number;
  debounceMs?: number;
}

/**
 * MISIÓN POS FILTRO REAL DE STOCK (2026-10-26) — Función C.
 *
 * ÚNICA definición de «vendible/visible» para TODOS los resultados que ve el
 * cajero (cuadrícula, vista en tabla, sugerencias del autocompletado, paginación
 * y «Ver más»). La exportan aquí para que el autocompletado y cualquier otro
 * consumidor apliquen EXACTAMENTE el mismo criterio que la lista principal —
 * sin una segunda fuente de stock en el cliente (usa el `stock_current` e
 * `is_service` que ya viajan en el producto de `get_products_for_pos`).
 *
 * Regla (idéntica a la que aplicaba la lista principal):
 *  · Filtro DESACTIVADO → todo es visible (disponibles y agotados, con sus
 *    etiquetas actuales de disponibilidad).
 *  · Filtro ACTIVADO → solo productos físicos con stock POSITIVO; los
 *    servicios (is_service === true) conservan su excepción del modelo — no
 *    tienen existencias propias y el servidor ya los exime del check de stock.
 *
 * NOTA: es un filtro de VISIBILIDAD. NO sustituye a las validaciones de
 * disponibilidad de onAddToCart/handleAddItem/cart store/backend — esas
 * siguen vigentes como defensa adicional (un item puede agotarse entre la
 * consulta y el clic).
 */
export function isPosProductVisible(product: Product, hideOutOfStock: boolean): boolean {
  if (!hideOutOfStock) return true;
  // MISIÓN TIPO-DE-ARTÍCULO (2026-10-19): los servicios NO se ocultan —
  // no tienen existencias propias y siempre son vendibles.
  if (product.is_service === true) return true;
  return (product.stock_current ?? 0) > 0;
}

export function usePOSServerSearch({
  products,
  initialPageSize = 60,
  debounceMs = 200,
}: UsePOSServerSearchParams) {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [visibleCount, setVisibleCount] = useState(initialPageSize);
  // Default true: oculta productos sin stock para no hacer ruido visual en el POS.
  // El cajero solo debe ver lo que puede vender AHORA. Si necesita ver agotados,
  // puede desactivar el toggle.
  const [hideOutOfStock, setHideOutOfStock] = useState(true);
  const [isPending, startTransition] = useTransition();
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce del search term
  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setVisibleCount(initialPageSize); // Reset pagination on new search
    }, debounceMs);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [searchTerm, debounceMs, initialPageSize]);

  // Categorías disponibles
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set).sort();
  }, [products]);

  // Filtrado completo (server-side eventualmente, client por ahora)
  const filteredProducts = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return products.filter((p) => {
      // Categoría
      if (selectedCategory && p.category !== selectedCategory) return false;
      // Stock: ocultar agotados por default (no hacer ruido visual en POS).
      // MISIÓN POS FILTRO REAL DE STOCK: usa el predicado compartido — la
      // MISMA regla que el autocompletado y cualquier resultado visible.
      if (!isPosProductVisible(p, hideOutOfStock)) return false;
      // Search
      if (!q) return true;
      const name = p.name.toLowerCase();
      const sku = (p.sku || "").toLowerCase();
      const barcode = (p.barcode || "").toLowerCase();
      return name.includes(q) || sku.includes(q) || barcode.includes(q);
    });
  }, [products, debouncedSearch, selectedCategory, hideOutOfStock]);

  // Solo los visibles (paginación)
  const visibleProducts = useMemo(() => {
    return filteredProducts.slice(0, visibleCount);
  }, [filteredProducts, visibleCount]);

  const hasMore = visibleCount < filteredProducts.length;
  const remainingCount = filteredProducts.length - visibleCount;

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => prev + initialPageSize);
  }, [initialPageSize]);

  const handleCategoryChange = useCallback((cat: string) => {
    startTransition(() => {
      setSelectedCategory(cat);
      setVisibleCount(initialPageSize);
    });
  }, [initialPageSize, startTransition]);

  return {
    searchTerm,
    setSearchTerm,
    debouncedSearch,
    selectedCategory,
    handleCategoryChange,
    categories,
    // Para compatibilidad con usePOSProductFilters:
    filteredProducts: visibleProducts,
    allFilteredCount: filteredProducts.length,
    isPending,
    // Nuevas capacidades EM-2:
    hasMore,
    remainingCount,
    loadMore,
    visibleCount,
    // Filtro de stock: default oculta agotados (cajero solo ve lo vendible)
    hideOutOfStock,
    setHideOutOfStock,
  };
}
