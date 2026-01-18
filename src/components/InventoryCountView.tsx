'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore, useCartStore, useUIStore } from '@/store';
import {
  Package,
  Search,
  Check,
  X,
  Plus,
  Minus,
  Trash2,
  AlertTriangle,
  ArrowRight,
  Save,
} from 'lucide-react';
import { Product, ProductVariant } from '@/types';
import { toast } from 'sonner';

interface ExtendedProduct extends Product {
  product_variants: ProductVariant[];
}

interface Difference {
  productId: string;
  name: string;
  expected: number;
  counted: number;
  diff: number;
  variants: ProductVariant[];
  decomposition: { variantId: string; name: string; quantity: number }[];
}

export default function InventoryCountView() {
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
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
  }, [user]);

  const filteredProducts = useMemo(() => {
    const lowerTerm = searchTerm.toLowerCase();
    return products.filter(product =>
      product.name.toLowerCase().includes(lowerTerm) ||
      product.sku?.toLowerCase().includes(lowerTerm)
    );
  }, [searchTerm, products]);

  const isAdjustmentValid = useMemo(() => {
    const shortages = differences.filter(d => d.diff < 0);
    if (shortages.length === 0) return true;

    return shortages.every(shortage => {
      const totalDecomposed = shortage.decomposition.reduce((acc, dec) => {
        const variant = shortage.variants.find(v => v.id === dec.variantId);
        const factor = variant?.conversion_factor || 1;
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

  const calculateOptimalDecomposition = (diff: number, variants: ProductVariant[]) => {
    let remaining = Math.abs(diff);
    // Sort variants by conversion factor descending
    const sortedVariants = [...variants].sort((a, b) => b.conversion_factor - a.conversion_factor);
    const decomposition: { variantId: string; name: string; quantity: number }[] = [];

    for (const variant of sortedVariants) {
      if (variant.conversion_factor > 0 && remaining >= variant.conversion_factor) {
        const count = Math.floor(remaining / variant.conversion_factor);
        decomposition.push({
          variantId: variant.id,
          name: variant.name,
          quantity: count
        });
        remaining %= variant.conversion_factor;
      }
    }

    // If there is still a remainder, we could add it as units if a 'unit' variant exists
    // or just leave it. The user can manually adjust.

    return decomposition;
  };

  const handleInitialSubmit = () => {
    const diffs: Difference[] = products
      .map((p) => {
        const counted = countedQuantities[p.id] ?? p.stock_current;
        const diff = counted - p.stock_current;
        return {
          productId: p.id,
          name: p.name,
          expected: p.stock_current,
          counted: counted,
          diff: diff,
          variants: p.product_variants || [],
          decomposition: diff < 0 ? calculateOptimalDecomposition(diff, p.product_variants || []) : []
        };
      })
      .filter((d) => d.diff !== 0);

    if (diffs.length === 0) {
      toast.info('No hay diferencias registradas');
      return;
    }

    setDifferences(diffs);
    setIsModalOpen(true);
  };

  const updateDecompositionItem = (productIndex: number, variantIndex: number, quantity: number) => {
    const newDiffs = [...differences];
    newDiffs[productIndex].decomposition[variantIndex].quantity = Math.max(0, quantity);
    setDifferences(newDiffs);
  };

  const removeDecompositionItem = (productIndex: number, variantIndex: number) => {
    const newDiffs = [...differences];
    newDiffs[productIndex].decomposition.splice(variantIndex, 1);
    setDifferences(newDiffs);
  };

  const addVariantToDecomposition = (productIndex: number, variantId: string) => {
    const newDiffs = [...differences];
    const product = newDiffs[productIndex];
    const variant = product.variants.find(v => v.id === variantId);

    if (!variant) return;

    // Check if variant already exists in decomposition
    const existingIndex = product.decomposition.findIndex(d => d.variantId === variantId);
    if (existingIndex >= 0) {
      product.decomposition[existingIndex].quantity += 1;
    } else {
      product.decomposition.push({
        variantId: variant.id,
        name: variant.name,
        quantity: 1
      });
    }
    setDifferences(newDiffs);
  };

  const handleFinalSubmit = async () => {
    if (!user?.store_id) {
      toast.error('Sesión inválida');
      return;
    }

    setProcessing(true);
    const toastId = toast.loading('Procesando ajuste...');

    try {
      // 1. Separate shortages and surpluses
      const shortages = differences.filter(d => d.diff < 0);
      const surpluses = differences.filter(d => d.diff > 0);

      // 2. Handle shortages: Add to cart
      if (shortages.length > 0) {
        shortages.forEach(d => {
          // Find the full product object
          const product = products.find(p => p.id === d.productId);
          if (!product) return;

          d.decomposition.forEach(dec => {
            if (dec.quantity <= 0) return;

            const variant = (product.product_variants || []).find(v => v.id === dec.variantId);

            useCartStore.getState().addItem({
              product_id: product.id,
              variant_id: dec.variantId,
              product: product,
              variant: variant || null,
              quantity: dec.quantity,
              price: variant ? variant.price : product.price,
              cost: product.cost_price,
              subtotal: (variant ? variant.price : product.price) * dec.quantity,
            });
          });
        });

        toast.info(`${shortages.length} productos faltantes agregados al carrito`);
      }

      // 3. Handle surpluses: Process as adjustments
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
            storeId: user.store_id,
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
        fetchProducts(); // Refresh list if no redirect
      }

    } catch (error: any) {
      console.error('Error in final submit:', error);
      toast.error(error.message || 'Error al procesar el ajuste', { id: toastId });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Conteo de Inventario</h2>
        <button
          onClick={handleInitialSubmit}
          className="neu-btn neu-btn-primary flex items-center gap-2"
          disabled={loading}
        >
          <Check className="w-5 h-5" />
          <span>Confirmar Conteo</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="neu-raised-sm p-2 sm:p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="neu-input w-full pl-10"
            placeholder="Buscar productos..."
          />
        </div>
      </div>

      {/* Product Table */}
      <div className="table-to-cards">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="p-4 text-left">Producto</th>
              <th className="p-4 text-left">SKU</th>
              <th className="p-4 text-right">Stock Sistema</th>
              <th className="p-4 text-center">Stock Físico (Contado)</th>
              <th className="p-4 text-right">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="p-8 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  <p className="mt-2 text-muted-foreground">Cargando catálogo...</p>
                </td>
              </tr>
            ) : filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-muted-foreground">
                  No se encontraron productos
                </td>
              </tr>
            ) : (
              filteredProducts.map(product => {
                const counted = countedQuantities[product.id] ?? product.stock_current;
                const diff = counted - product.stock_current;

                return (
                  <tr key={product.id}>
                    <td data-label="Producto" className="p-4 font-medium">{product.name}</td>
                    <td data-label="SKU" className="p-4 text-muted-foreground">{product.sku || '-'}</td>
                    <td data-label="Stock Sistema" className="p-4 text-right font-bold">{product.stock_current}</td>
                    <td data-label="Stock Físico" className="p-4">
                      <div className="flex justify-center">
                        <input
                          type="number"
                          value={counted}
                          onChange={(e) => handleQuantityChange(product.id, parseInt(e.target.value) || 0)}
                          className="neu-input w-24 text-center font-bold"
                        />
                      </div>
                    </td>
                    <td data-label="Diferencia" className="p-4 text-right">
                      <span className={`font-bold ${diff === 0 ? '' : diff > 0 ? 'text-success' : 'text-danger'}`}>
                        {diff > 0 ? `+${diff}` : diff}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Confirmation Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="neu-card w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden p-0">
            <div className="p-6 border-b border-border flex justify-between items-center bg-muted/30">
              <h3 className="text-xl font-bold flex items-center gap-2 text-foreground">
                <AlertTriangle className="w-6 h-6 text-warning" />
                Confirmar Diferencias de Inventario
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="hover:text-danger transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-foreground">
              <p className="text-muted-foreground">
                Se han detectado las siguientes diferencias. Los faltantes se registrarán como una venta para ajustar el inventario.
              </p>

              {differences.map((d, pIdx) => (
                <div key={d.productId} className="neu-raised-sm p-4 rounded-xl border border-border bg-card">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h4 className="font-bold text-lg">{d.name}</h4>
                      <div className="text-sm text-muted-foreground flex gap-4">
                        <span>Sistema: <strong>{d.expected}</strong></span>
                        <span>Contado: <strong>{d.counted}</strong></span>
                      </div>
                    </div>
                    <div className={`text-xl font-black ${d.diff > 0 ? 'text-success' : 'text-danger'}`}>
                      {d.diff > 0 ? `+${d.diff}` : d.diff}
                    </div>
                  </div>

                  {d.diff < 0 && (
                    <div className="mt-4 p-4 rounded-lg bg-warning/10 border border-warning/20">
                      <div className="flex items-center justify-between mb-3">
                        <h5 className="text-sm font-bold text-warning-dark flex items-center gap-2">
                          <Package className="w-4 h-4" />
                          DESCOMPOSICIÓN PARA TICKET DE VENTA
                        </h5>

                        {/* Variant Selector */}
                        <div className="flex items-center gap-2">
                          <select
                            className="neu-input py-1 px-2 text-xs"
                            onChange={(e) => {
                              if (e.target.value) {
                                addVariantToDecomposition(pIdx, e.target.value);
                                e.target.value = '';
                              }
                            }}
                          >
                            <option value="">+ Agregar variante...</option>
                            {d.variants.map(v => (
                              <option key={v.id} value={v.id}>{v.name} (x{v.conversion_factor})</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {d.decomposition.map((item, vIdx) => (
                          <div key={item.variantId} className="flex items-center gap-3 bg-background p-2 rounded-md shadow-sm">
                            <span className="flex-1 text-sm font-medium">{item.name}</span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => updateDecompositionItem(pIdx, vIdx, item.quantity - 1)}
                                className="w-6 h-6 flex items-center justify-center rounded bg-muted hover:bg-muted/80"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => updateDecompositionItem(pIdx, vIdx, parseInt(e.target.value) || 0)}
                                className="w-12 text-center text-sm font-bold border-none bg-transparent text-foreground"
                              />
                              <button
                                onClick={() => updateDecompositionItem(pIdx, vIdx, item.quantity + 1)}
                                className="w-6 h-6 flex items-center justify-center rounded bg-muted hover:bg-muted/80"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                            <button
                              onClick={() => removeDecompositionItem(pIdx, vIdx)}
                              className="text-danger hover:scale-110 transition-transform p-1"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}

                        {d.decomposition.length === 0 && (
                          <div className="text-center py-4 text-xs text-warning italic">
                            No hay variantes seleccionadas para este faltante.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {d.diff > 0 && (
                    <div className="mt-2 text-xs text-success font-medium flex items-center gap-1">
                      <Plus className="w-3 h-3" />
                      Se registrará como un ajuste de entrada (Sobrante).
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="p-6 border-t border-border bg-muted/30 flex gap-4">
              <button
                onClick={() => setIsModalOpen(false)}
                className="neu-btn flex-1"
                disabled={processing}
              >
                Cancelar
              </button>
              <button
                onClick={handleFinalSubmit}
                className="neu-btn neu-btn-success flex-1 flex items-center justify-center gap-2"
                disabled={processing || !isAdjustmentValid}
              >
                {processing ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    Confirmar Ajuste Final
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
