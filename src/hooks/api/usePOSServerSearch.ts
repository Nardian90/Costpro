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

export function usePOSServerSearch({
  products,
  initialPageSize = 60,
  debounceMs = 200,
}: UsePOSServerSearchParams) {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [visibleCount, setVisibleCount] = useState(initialPageSize);
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
      // Search
      if (!q) return true;
      const name = p.name.toLowerCase();
      const sku = (p.sku || "").toLowerCase();
      const barcode = (p.barcode || "").toLowerCase();
      return name.includes(q) || sku.includes(q) || barcode.includes(q);
    });
  }, [products, debouncedSearch, selectedCategory]);

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
  };
}
