"use client";

import { useState, useMemo, useTransition } from "react";
import { Product } from "@/types";

interface UsePOSProductFiltersOptions {
  products: Product[];
}

export function usePOSProductFilters({ products }: UsePOSProductFiltersOptions) {
  const [isPending, startTransition] = useTransition();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");

  const categories = useMemo(() => {
    const cats = new Set(products.map((p) => p.category).filter(Boolean));
    return Array.from(cats) as string[];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesCategory =
        !selectedCategory || p.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, selectedCategory]);

  const handleCategoryChange = (val: string) => {
    startTransition(() => {
      setSelectedCategory(val);
    });
  };

  return {
    isPending,
    searchTerm,
    setSearchTerm,
    selectedCategory,
    handleCategoryChange,
    categories,
    filteredProducts,
  };
}
