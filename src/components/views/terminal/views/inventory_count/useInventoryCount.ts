'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuthStore, useCartStore, useUIStore } from '@/store';
import { Product, ProductVariant } from '@/types';
import { toast } from 'sonner';

export interface ExtendedProduct extends Product {
  product_variants: ProductVariant[];
}

export interface DecomposedItem {
  variantId: string | null;
  name: string;
  quantity: number;
}

export interface Difference {
  productId: string;
  name: string;
  expected: number;
  counted: number;
  diff: number;
  variants: ProductVariant[];
  decomposition: DecomposedItem[];
}

export function useInventoryCount() {
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const addItem = useCartStore((state) => state.addItem);

  const [products, setProducts] = useState<ExtendedProduct[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [countedQuantities, setCountedQuantities] = useState<{ [key: string]: number }>({});
  const [loading, setLoading] = useState(true);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [differences, setDifferences] = useState<Difference[]>([]);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (user) {
      fetchProducts();
    }
  }, [user]); // FIX-RCT-130: fetchProducts reads token from auth store getState()

  const filteredProducts = useMemo(() => {
    const lowerTerm = searchTerm.toLowerCase();
    return products.filter(product =>
      product.name.toLowerCase().includes(lowerTerm) ||
      product.sku?.toLowerCase().includes(lowerTerm) ||
      product.category?.toLowerCase().includes(lowerTerm)
    );
  }, [searchTerm, products]);

  const isAdjustmentValid = useMemo(() => {
    const shortages = differences.filter(d => d.diff < 0);
    if (shortages.length === 0) return true;

    return shortages.every(shortage => {
      const totalDecomposed = shortage.decomposition.reduce((acc, dec) => {
        if (!dec.variantId) return acc + dec.quantity; // Base product counts as 1:1
        const variant = shortage.variants.find(v => v.id === dec.variantId);
        // FIX-BUG-UX-003: Guard against zero or negative conversion_factor
        if (!variant || !variant.conversion_factor || variant.conversion_factor <= 0) return acc + dec.quantity;
        const factor = variant.conversion_factor;
        return acc + (dec.quantity * factor);
      }, 0);
      return totalDecomposed === Math.abs(shortage.diff);
    });
  }, [differences]);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/inventory/products', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error al cargar productos');
      }
      const data = await response.json();
      setProducts(data);

      // Initialize counted quantities with current stock
      const initialCounted: { [key: string]: number } = {};
      data.forEach((p: ExtendedProduct) => {
        initialCounted[p.id] = p.stock_current;
      });
      setCountedQuantities(initialCounted);
    } catch (error: any) {
      console.error('Error fetching products:', error);
      toast.error(error.message || 'Error al cargar productos');
    } finally {
      setLoading(false);
    }
  };

  const handleQuantityChange = (productId: string, quantity: number) => {
    setCountedQuantities(prev => ({ ...prev, [productId]: quantity }));
  };

  const calculateOptimalDecomposition = (diff: number, variants: ProductVariant[], productName: string) => {
    let remaining = Math.abs(diff);
    // Sort variants by conversion factor (largest first), ignoring those with factor 1 for the initial pass
    const sortedVariants = [...variants]
      .filter(v => v.conversion_factor > 1)
      .sort((a, b) => b.conversion_factor - a.conversion_factor);

    const decomposition: DecomposedItem[] = [];

    for (const variant of sortedVariants) {
      // FIX-BUG-UX-003: Guard against zero or negative conversion_factor (defense in depth)
      if (!variant.conversion_factor || variant.conversion_factor <= 0) continue;
      if (remaining >= variant.conversion_factor) {
        const count = Math.floor(remaining / variant.conversion_factor);
        decomposition.push({
          variantId: variant.id,
          name: `${productName} (${variant.name})`,
          quantity: count
        });
        remaining -= count * variant.conversion_factor;
      }
    }

    if (remaining > 0) {
      decomposition.push({
        variantId: null,
        name: productName,
        quantity: remaining
      });
    }

    return decomposition;
  };

  const handleInitialSubmit = () => {
    const diffs: Difference[] = [];
    products.forEach(product => {
      const counted = countedQuantities[product.id] ?? product.stock_current;
      if (counted !== product.stock_current) {
        const diff = counted - product.stock_current;
        diffs.push({
          productId: product.id,
          name: product.name,
          expected: product.stock_current,
          counted: counted,
          diff: diff,
          variants: product.product_variants || [],
          decomposition: diff < 0 ? calculateOptimalDecomposition(diff, product.product_variants || [], product.name) : []
        });
      }
    });

    if (diffs.length === 0) {
      toast.info('No se han detectado diferencias en el inventario');
      return;
    }

    setDifferences(diffs);
    setIsModalOpen(true);
  };

  const handleFinalSubmit = async () => {
    if (!user) return;
    setProcessing(true);
    const toastId = toast.loading('Procesando ajustes de inventario...');

    try {
      const shortages = differences.filter(d => d.diff < 0);
      const surpluses = differences.filter(d => d.diff > 0);

      if (shortages.length > 0) {
        shortages.forEach(shortage => {
          const product = products.find(p => p.id === shortage.productId);
          if (!product) return;

          shortage.decomposition.forEach(dec => {
            const variant = product.product_variants?.find(v => v.id === dec.variantId);
            addItem({
              product_id: product.id, variant_id: dec.variantId, product: product,
              variant: (variant || null) as Record<string, unknown> | null,
              quantity: dec.quantity,
              price: variant ? variant.price : product.price,
              cost: product.cost_price,
              subtotal: (variant ? variant.price : product.price) * dec.quantity,
            });
          });
        });
        toast.success(`${shortages.length} productos con faltantes cargados al punto de venta`, { id: toastId });
      }

      if (surpluses.length > 0) {
        const itemsToSubmit = surpluses.map(d => ({
          product_id: d.productId,
          expected_quantity: d.expected,
          counted_quantity: d.counted,
          decomposition: []
        }));

        const response = await fetch('/api/inventory/adjustments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            storeId: user?.activeStoreId,
            items: itemsToSubmit
          }),
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.message || 'Error al procesar el ajuste de sobrantes');
        }
        toast.success('Sobrantes ajustados correctamente', { id: toastId });
      } else {
        toast.dismiss(toastId);
      }

      setIsModalOpen(false);

      if (shortages.length > 0) {
        useUIStore.getState().setCurrentView('pos');
      } else {
        fetchProducts();
      }

    } catch (error: any) {
      console.error('Error in final submit:', error);
      toast.error(error.message || 'Error al procesar el ajuste', { id: toastId });
    } finally {
      setProcessing(false);
    }
  };

  return {
    products,
    searchTerm,
    setSearchTerm,
    countedQuantities,
    loading,
    isModalOpen,
    setIsModalOpen,
    differences,
    processing,
    filteredProducts,
    isAdjustmentValid,
    handleQuantityChange,
    handleInitialSubmit,
    handleFinalSubmit,
    fetchProducts
  };
}
