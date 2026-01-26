'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuthStore, useCartStore, useUIStore } from '@/store';
import {
  Package,
  Check,
  X,
  Plus,
  Minus,
  Trash2,
  AlertTriangle,
  Save,
  Search,
  ClipboardList,
} from 'lucide-react';
import { Product, ProductVariant } from '@/types';
import { toast } from 'sonner';
import ActionMenu from '@/components/ui/ActionMenu';
import SearchBar from '@/components/ui/SearchBar';
import { cn } from '@/lib/utils';

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
      product.sku?.toLowerCase().includes(lowerTerm) ||
      product.category?.toLowerCase().includes(lowerTerm)
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
      toast.info('No hay diferencias registradas respecto al stock actual');
      return;
    }

    setDifferences(diffs);
    setIsModalOpen(true);
  };

  const handleFinalSubmit = async () => {
      if (!user?.storeId) {
      toast.error('Sesión inválida');
      return;
    }

    setProcessing(true);
    const toastId = toast.loading('Sincronizando inventario...');

    try {
      const shortages = differences.filter(d => d.diff < 0);
      const surpluses = differences.filter(d => d.diff > 0);

      if (shortages.length > 0) {
        shortages.forEach(d => {
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
        toast.info(`${shortages.length} productos con faltantes cargados al punto de venta`);
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
            storeId: user.storeId,
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

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
            <ClipboardList className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-2xl font-black text-foreground tracking-tighter uppercase leading-tight">Auditoría de Stock</h2>
        </div>
        <ActionMenu
          actions={[
            { id: 'submit', label: 'Finalizar Conteo', icon: Check, onClick: handleInitialSubmit, variant: 'primary', disabled: loading }
          ]}
          className="sm:w-auto"
        />
      </div>

      <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder="Buscar por producto, SKU o categoría..." />

      <div className="overflow-x-auto table-to-cards rounded-2xl shadow-xl border border-white/5 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-muted/50 text-muted-foreground font-black uppercase text-[10px] tracking-widest">
              <th className="p-4 text-left">Producto / SKU</th>
              <th className="p-4 text-right">Stock Teórico</th>
              <th className="p-4 text-center">Stock Físico (Contado)</th>
              <th className="p-4 text-right">Desviación</th>
            </tr>
          </thead>
          <tbody className="bg-background/30 backdrop-blur-sm">
            {loading ? (
              <tr>
                <td colSpan={4} className="p-20 text-center">
                  <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Cargando catálogo...</p>
                </td>
              </tr>
            ) : filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-20 text-center">
                  <Package className="w-16 h-16 mx-auto mb-4 opacity-5" />
                  <p className="font-black uppercase text-muted-foreground text-sm tracking-widest">No se encontraron productos</p>
                </td>
              </tr>
            ) : (
              filteredProducts.map(product => {
                const counted = countedQuantities[product.id] ?? product.stock_current;
                const diff = counted - product.stock_current;

                return (
                  <tr key={product.id} className="border-b border-white/5 hover:bg-primary/5 transition-colors group">
                    <td data-label="Producto" className="p-4">
                      <div className="font-black text-sm uppercase tracking-tight">{product.name}</div>
                      <div className="text-[9px] font-mono text-muted-foreground mt-1">{product.sku || '-'} • {product.category || 'General'}</div>
                    </td>
                    <td data-label="Teórico" className="p-4 text-right font-black text-lg text-muted-foreground">{product.stock_current}</td>
                    <td data-label="Contado" className="p-4">
                      <div className="flex justify-center">
                        <input
                          type="number"
                          value={counted}
                          onChange={(e) => handleQuantityChange(product.id, parseInt(e.target.value) || 0)}
                          className="neu-input w-28 text-center font-black text-xl text-primary bg-primary/5 border-primary/20"
                        />
                      </div>
                    </td>
                    <td data-label="Diferencia" className="p-4 text-right">
                      <span className={cn(
                        "text-lg font-black",
                        diff === 0 ? "text-muted-foreground/30" :
                        diff > 0 ? "text-success" : "text-danger"
                      )}>
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
        <div className="fixed inset-0 bg-background/90 backdrop-blur-xl flex items-center justify-center z-50 p-4">
          <div className="neu-card max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden !p-0 border-primary/20 shadow-2xl">
            <div className="p-8 border-b border-white/5 bg-primary/5 flex justify-between items-center">
              <h3 className="text-2xl font-black text-foreground uppercase tracking-tighter flex items-center gap-3">
                <AlertTriangle className="w-8 h-8 text-warning" />
                Resumen de Discrepancias
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-danger/10 text-muted-foreground hover:text-danger rounded-full transition-colors">
                <X className="w-8 h-8" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Se han detectado las siguientes diferencias. Confirma las acciones de ajuste para proceder:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {differences.map((d, pIdx) => (
                  <div key={d.productId} className="neu-raised-sm !p-6 border border-white/5 bg-background/50 relative overflow-hidden group">
                    <div className={cn("absolute top-0 left-0 w-1 h-full", d.diff > 0 ? "bg-success" : "bg-danger")} />

                    <div className="flex justify-between items-start mb-6">
                      <div className="flex-1 overflow-hidden">
                        <h4 className="font-black text-sm uppercase tracking-tight truncate pr-4">{d.name}</h4>
                        <div className="text-[9px] font-bold text-muted-foreground uppercase mt-1 tracking-widest flex gap-4">
                          <span>Sistema: <strong className="text-foreground">{d.expected}</strong></span>
                          <span>Contado: <strong className="text-foreground">{d.counted}</strong></span>
                        </div>
                      </div>
                      <div className={cn("text-2xl font-black tracking-tighter", d.diff > 0 ? "text-success" : "text-danger")}>
                        {d.diff > 0 ? `+${d.diff}` : d.diff}
                      </div>
                    </div>

                    {d.diff < 0 && (
                      <div className="space-y-4 pt-4 border-t border-white/5">
                        <h5 className="text-[8px] font-black text-warning uppercase tracking-[0.3em]">Resolución de Faltante (Venta)</h5>
                        <div className="space-y-2">
                           {d.decomposition.map((item, vIdx) => (
                             <div key={item.variantId} className="flex items-center justify-between p-3 neu-inset-sm bg-background border border-white/5">
                                <span className="text-[10px] font-black uppercase tracking-tight">{item.name}</span>
                                <span className="font-black text-primary text-sm">x{item.quantity}</span>
                             </div>
                           ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="p-8 border-t border-white/5 bg-muted/10 flex gap-4">
              <button
                onClick={() => setIsModalOpen(false)}
                className="neu-btn flex-1 !py-4 font-black uppercase text-xs tracking-[0.2em]"
                disabled={processing}
              >
                Cancelar
              </button>
              <button
                onClick={handleFinalSubmit}
                className="neu-btn-primary flex-1 flex items-center justify-center gap-3 font-black uppercase text-xs tracking-[0.2em] shadow-xl shadow-primary/20"
                disabled={processing || !isAdjustmentValid}
              >
                {processing ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    Ejecutar Ajustes
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
