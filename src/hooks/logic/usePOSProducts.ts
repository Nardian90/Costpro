import { useMemo, useState, useTransition } from 'react';
import { Product } from '@/types';

export function usePOSProducts(products: Product[] = [], searchTerm: string) {
  const [isPending, startTransition] = useTransition();
  const [selectedCategory, setSelectedCategory] = useState('');

  const filteredProducts = useMemo(() => {
    console.log('[usePOSProducts] Filtering products. Count:', products?.length || 0, 'Search:', searchTerm, 'Category:', selectedCategory);
    const lowerSearch = searchTerm.toLowerCase();
    const safeProducts = Array.isArray(products) ? products : [];

    const result = safeProducts.filter(p => {
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
    console.log('[usePOSProducts] Filter result count:', result.length);
    return result;
  }, [products, searchTerm, selectedCategory]);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(products.map(p => p.category)))
      .filter((c): c is string => Boolean(c));
    console.log('[usePOSProducts] Extracted categories:', cats);
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
    isPending
  };
}
