import { useMemo, useState, useTransition } from 'react';
import { Product } from '@/types';

export function usePOSProducts(products: Product[], searchTerm: string) {
  const [isPending, startTransition] = useTransition();
  const [selectedCategory, setSelectedCategory] = useState('');

  const filteredProducts = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();
    return products.filter(p => {
      // Filter out inactive products.
      // We no longer filter out of stock products here to ensure they are visible in the catalog,
      // as they are handled during the "Add to Cart" action with a proper message.
      if (!p.is_active) return false;
      const matchesSearch = p.name.toLowerCase().includes(lowerSearch) ||
        (p.sku && p.sku.toLowerCase().includes(lowerSearch)) ||
        (p.category && p.category.toLowerCase().includes(lowerSearch));
      const matchesCategory = !selectedCategory || p.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, selectedCategory]);

  const categories = useMemo(() => {
    return Array.from(new Set(products.map(p => p.category)))
      .filter((c): c is string => Boolean(c));
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
    isPending
  };
}
