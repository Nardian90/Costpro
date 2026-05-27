'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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

  const [allProducts, setAllProducts] = useState<ExtendedProduct[]>([]);
  const [countedProductIds, setCountedProductIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [countedQuantities, setCountedQuantities] = useState<{ [key: string]: number }>({});
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [differences, setDifferences] = useState<Difference[]>([]);
  const [processing, setProcessing] = useState(false);

  // Products currently in the count (subset of allProducts)
  const products = useMemo(() => {
    if (countedProductIds.size === 0) return allProducts;
    return allProducts.filter(p => countedProductIds.has(p.id));
  }, [allProducts, countedProductIds]);

  // Sample percentage
  const samplePercentage = useMemo(() => {
    if (allProducts.length === 0) return 0;
    return Number(((products.length / allProducts.length) * 100).toFixed(1));
  }, [products.length, allProducts.length]);

  // Add a product to the count
  const addToCount = useCallback((productId: string) => {
    setCountedProductIds(prev => {
      // If set is empty (all products mode), first populate with all current products
      // then add the new one (so we get: all existing + the new one)
      if (prev.size === 0) {
        const next = new Set(allProducts.map(p => p.id));
        next.add(productId);
        return next;
      }
      const next = new Set(prev);
      next.add(productId);
      return next;
    });
    // Initialize counted quantity with theoretical stock
    const product = allProducts.find(p => p.id === productId);
    if (product && countedQuantities[productId] === undefined) {
      setCountedQuantities(prev => ({ ...prev, [productId]: product.stock_current }));
    }
  }, [allProducts, countedQuantities]);

  // Remove a product from the count
  const removeFromCount = useCallback((productId: string) => {
    setCountedProductIds(prev => {
      // If set is empty (all products mode), populate with ALL product IDs
      // EXCEPT the one being removed
      if (prev.size === 0) {
        const next = new Set(allProducts.map(p => p.id));
        next.delete(productId);
        return next;
      }
      const next = new Set(prev);
      next.delete(productId);
      // If set becomes empty after deletion, keep it non-empty (avoid reverting to "all" mode
      // which would re-include the just-removed product)
      if (next.size === 0) {
        // At least one product must remain, so we restore it minus the deleted one
        // This edge case shouldn't happen in practice but we guard against it
        return prev;
      }
      return next;
    });
    setCountedQuantities(prev => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  }, [allProducts]);

  // Reset count to include all products
  const resetCountToAll = useCallback(() => {
    setCountedProductIds(new Set());
    const initialCounted: { [key: string]: number } = {};
    allProducts.forEach((p: ExtendedProduct) => {
      initialCounted[p.id] = p.stock_current;
    });
    setCountedQuantities(initialCounted);
  }, [allProducts]);

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
      setAllProducts(data);

      // Initialize counted quantities with current stock
      const initialCounted: { [key: string]: number } = {};
      data.forEach((p: ExtendedProduct) => {
        initialCounted[p.id] = p.stock_current;
      });
      setCountedQuantities(initialCounted);
      setCountedProductIds(new Set());
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

  // ---- Excel Export ----
  const handleExportExcel = useCallback(async () => {
    const exportData = products.map(p => {
      const counted = countedQuantities[p.id] ?? p.stock_current;
      const diff = counted - p.stock_current;
      return {
        'SKU': p.sku || '',
        'Nombre': p.name || '',
        'Categoría': p.category || '',
        'Stock Teórico': p.stock_current || 0,
        'Stock Físico (Contado)': counted,
        'Desviación': diff,
        '% Muestra': allProducts.length > 0 ? Number(((products.length / allProducts.length) * 100).toFixed(1)) : 0,
      };
    });

    try {
      const toastId = toast.loading('Preparando Excel...');
      const XLSX = await import('xlsx');

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      worksheet['!cols'] = [
        { wch: 18 }, { wch: 35 }, { wch: 20 }, { wch: 16 }, { wch: 24 }, { wch: 14 }, { wch: 14 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Conteo');

      // Add summary sheet
      const totalExpected = products.reduce((sum, p) => sum + (p.stock_current || 0), 0);
      const totalCounted = products.reduce((sum, p) => sum + (countedQuantities[p.id] ?? p.stock_current), 0);
      const totalDiff = totalCounted - totalExpected;
      const surpluses = products.filter(p => (countedQuantities[p.id] ?? p.stock_current) > p.stock_current).length;
      const shortages = products.filter(p => (countedQuantities[p.id] ?? p.stock_current) < p.stock_current).length;
      const unchanged = products.length - surpluses - shortages;

      const summaryData = [
        { 'Concepto': 'Total productos en catálogo', 'Valor': allProducts.length },
        { 'Concepto': 'Productos en conteo', 'Valor': products.length },
        { 'Concepto': '% de la muestra', 'Valor': `${samplePercentage}%` },
        { 'Concepto': 'Stock teórico total', 'Valor': totalExpected },
        { 'Concepto': 'Stock contado total', 'Valor': totalCounted },
        { 'Concepto': 'Diferencia total', 'Valor': totalDiff },
        { 'Concepto': 'Productos con sobrante', 'Valor': surpluses },
        { 'Concepto': 'Productos con faltante', 'Valor': shortages },
        { 'Concepto': 'Productos sin cambios', 'Valor': unchanged },
      ];
      const summarySheet = XLSX.utils.json_to_sheet(summaryData);
      summarySheet['!cols'] = [{ wch: 35 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen');

      XLSX.writeFile(workbook, `conteo-inventario-${Date.now()}.xlsx`);
      toast.success('Conteo exportado a Excel', { id: toastId });
    } catch (error) {
      console.error('Error al exportar Excel:', error);
      toast.error('Error al exportar a Excel');
    }
  }, [products, countedQuantities, allProducts, samplePercentage]);

  // ---- Excel Import ----
  const handleImportExcel = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.match(/\.xlsx?$/i)) {
      toast.error('Por favor selecciona un archivo Excel (.xlsx o .xls)');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    try {
      const toastId = toast.loading('Importando conteo desde Excel...');
      const XLSX = await import('xlsx');
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });

      const sheetName = workbook.SheetNames.includes('Conteo') ? 'Conteo' : workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet);

      if (rows.length === 0) {
        toast.error('El archivo Excel no contiene datos', { id: toastId });
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      let updatedCount = 0;
      let notFoundCount = 0;
      const newQuantities = { ...countedQuantities };
      const newCountedIds = new Set(countedProductIds);

      for (const row of rows) {
        const sku = String(row['SKU'] || row['sku'] || '').trim();
        const name = String(row['Nombre'] || row['nombre'] || row['Producto'] || row['producto'] || '').trim();
        const counted = Number(row['Stock Físico (Contado)'] || row['Contado'] || row['stock_fisico'] || row['Cantidad'] || 0);

        if (!name && !sku) continue;

        const matchedProduct = allProducts.find(p =>
          (sku && p.sku === sku) ||
          (name && p.name.toLowerCase() === name.toLowerCase())
        );

        if (matchedProduct) {
          newQuantities[matchedProduct.id] = Math.max(0, Math.round(counted));
          if (!newCountedIds.has(matchedProduct.id)) {
            newCountedIds.add(matchedProduct.id);
          }
          updatedCount++;
        } else {
          notFoundCount++;
        }
      }

      setCountedQuantities(newQuantities);
      setCountedProductIds(newCountedIds);

      const msg = notFoundCount > 0
        ? `Se importaron ${updatedCount} productos (${notFoundCount} no encontrados)`
        : `Se importaron ${updatedCount} productos correctamente`;
      toast.success(msg, { id: toastId });
    } catch (error) {
      console.error('Error al importar Excel:', error);
      toast.error('Error al importar el archivo Excel');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [allProducts, countedQuantities, countedProductIds]);

  const handleInitialSubmit = () => {
    const activeProducts = products;
    const diffs: Difference[] = [];
    activeProducts.forEach(product => {
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
    allProducts,
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
    fetchProducts,
    // New: count management
    addToCount,
    removeFromCount,
    resetCountToAll,
    samplePercentage,
    countedProductIds,
    // New: Excel
    handleExportExcel,
    handleImportExcel,
    fileInputRef,
  };
}
