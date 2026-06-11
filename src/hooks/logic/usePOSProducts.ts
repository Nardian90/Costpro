import { useMemo, useState, useTransition, useDeferredValue } from 'react';
import { Product } from '@/types';

export function usePOSProducts(products: Product[] = [], searchTerm: string) {
  const [isPending, startTransition] = useTransition();
  const [selectedCategory, setSelectedCategory] = useState('');
  const deferredSearch = useDeferredValue(searchTerm);

  const filteredProducts = useMemo(() => {
    const lowerSearch = deferredSearch.toLowerCase();
    const safeProducts = Array.isArray(products) ? products : [];

    const result = safeProducts.filter(p => {
      // Filter out inactive products.
      if (!p.is_active) return false;
      const matchesSearch = p.name.toLowerCase().includes(lowerSearch) ||
        (p.sku && p.sku.toLowerCase().includes(lowerSearch)) ||
        (p.category && p.category.toLowerCase().includes(lowerSearch));
      const matchesCategory = !selectedCategory || p.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
    return result;
  }, [products, deferredSearch, selectedCategory]);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(products.map(p => p.category)))
      .filter((c): c is string => Boolean(c));
    return cats;
  }, [products]);

  const handleCategoryChange = (value: string) => {
    startTransition(() => {
      setSelectedCategory(value);
    });
  };

  return {
    filteredProducts,
    categories,
    selectedCategory,
    handleCategoryChange,
    isPending: isPending || deferredSearch !== searchTerm
  };
}
