'use client';

import React, { useState, useMemo } from 'react';
import { useProducts } from '@/hooks/api/useProducts';
import { useAuthStore } from '@/store';
import { Search, Plus, Filter, Tag, LayoutGrid, List, MoreVertical, Edit, Trash2 } from 'lucide-react';
import { ProductCard, CategoryChips, ViewSwitcher, IconButton, SearchInput } from '@/components/ui/atomic';
import { StateRenderer } from '@/components/ui/StateRenderer';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function CatalogView() {
  const { user } = useAuthStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [layoutMode, setLayoutMode] = useState<'grid' | 'table'>('grid');

  const { data: products = [], isLoading, error } = useProducts(user?.activeStoreId);

  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category).filter(Boolean));
    return Array.from(cats) as string[];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesCategory = !selectedCategory || p.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, selectedCategory]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-black uppercase tracking-tight text-primary">Catálogo de Productos</h2>
        <div className="flex items-center gap-2">
            <ViewSwitcher currentView={layoutMode} onViewChange={setLayoutMode} />
            <IconButton icon={Plus} label="Nuevo Producto" onClick={() => {}} variant="primary" />
        </div>
      </div>

      <div className="space-y-4">
        <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Buscar por nombre, SKU o marca..."
        />
        <CategoryChips
            categories={categories}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
        />
      </div>

      <StateRenderer
        isLoading={isLoading}
        error={error as Error}
        data={filteredProducts}
        loadingComponent={
            <div className={cn(layoutMode === 'grid' ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" : "space-y-3")}>
                {[...Array(8)].map((_, i) => <Skeleton key={i} className={cn("rounded-2xl", layoutMode === 'grid' ? "h-64" : "h-16")} />)}
            </div>
        }
      >
        {(data) => (
            layoutMode === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {data.map(product => (
                        <ProductCard key={product.id} product={product} />
                    ))}
                </div>
            ) : (
                <div className="rounded-2xl border border-border overflow-hidden bg-card">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-muted/50 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border">
                            <tr>
                                <th className="px-6 py-4">Producto</th>
                                <th className="px-6 py-4">SKU</th>
                                <th className="px-6 py-4 text-right">Precio</th>
                                <th className="px-6 py-4 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {data.map(product => (
                                <tr key={product.id} className="hover:bg-muted/30 transition-colors">
                                    <td className="px-6 py-4 font-bold">{product.name}</td>
                                    <td className="px-6 py-4 text-xs font-mono">{product.sku}</td>
                                    <td className="px-6 py-4 text-right font-black text-primary">{product.price}</td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-1">
                                            <IconButton icon={Edit} label="Editar" onClick={() => {}} />
                                            <IconButton icon={Trash2} label="Eliminar" onClick={() => {}} className="text-destructive" />
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )
        )}
      </StateRenderer>
    </div>
  );
}
