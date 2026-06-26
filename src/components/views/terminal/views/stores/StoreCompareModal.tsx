'use client';

import React, { useState, useMemo } from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Store } from '@/types';
import { useStoreComparison } from '@/hooks/api/useStoreComparison';
import { ResponsiveTable, type ResponsiveColumn } from '@/components/ui/ResponsiveTable'; // B2
import { Loader2, GitCompare, TrendingUp, Package, FileText, Heart, DollarSign, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

/**
 * F6-T01: Vista comparativa entre tiendas (dashboard side-by-side).
 *
 * Permite al admin seleccionar 2-4 tiendas y comparar KPIs:
 * - Ventas (30 días)
 * - Valor de stock
 * - FCs pendientes
 * - N° de productos
 * - Health score
 *
 * Muestra tabla comparativa con KPIs sincronizados por columna +
 * gráficos de barras horizontales para comparación visual.
 */

interface StoreCompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  stores: Store[];
  preselectedIds?: string[];
}

function formatCurrency(n: number): string {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function StoreCompareModal({ isOpen, onClose, stores, preselectedIds = [] }: StoreCompareModalProps) {
  const t = useTranslations('stores');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(preselectedIds));
  const [search, setSearch] = useState('');

  React.useEffect(() => {
    if (isOpen) {
      setSelectedIds(new Set(preselectedIds));
      setSearch('');
    }
  }, [isOpen, preselectedIds]);

  const { data: comparison, isLoading } = useStoreComparison(stores, Array.from(selectedIds));

  const filteredStores = useMemo(() => {
    if (!search.trim()) return stores;
    const q = search.toLowerCase().trim();
    return stores.filter(s => s.name.toLowerCase().includes(q));
  }, [stores, search]);

  const toggleStore = (storeId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(storeId)) {
        next.delete(storeId);
      } else {
        if (next.size >= 4) {
          toast.warning('Máximo 4 tiendas para comparar');
          return prev;
        }
        next.add(storeId);
      }
      return next;
    });
  };

  const canCompare = selectedIds.size >= 2 && selectedIds.size <= 4;
  const showComparison = canCompare && comparison && comparison.length > 0;

  // Encontrar el valor máximo para normalizar barras
  const maxSales = Math.max(...(comparison?.map(c => c.sales) || [0]), 1);
  const maxStock = Math.max(...(comparison?.map(c => c.stockValue) || [0]), 1);
  const maxProducts = Math.max(...(comparison?.map(c => c.productsCount) || [0]), 1);

  return (
    <BaseModal
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      aria-label={t('compare.ariaLabel')}
      title={
        <span className="text-[clamp(1.25rem,4vw,1.5rem)] font-black uppercase tracking-tighter text-primary flex items-center gap-2">
          <GitCompare className="w-5 h-5" />
          Comparar Tiendas
        </span>
      }
      description={
        <span className="text-sm font-bold uppercase tracking-widest text-muted-foreground/70">
          Selecciona 2-4 tiendas para comparar KPIs
        </span>
      }
      footer={
        <Button type="button" variant="outline" onClick={onClose} className="w-full sm:w-auto h-11">
          Cerrar
        </Button>
      }
    >
      <div className="py-4 space-y-4">
        {/* Selector de tiendas */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar tienda..."
              className="w-full pl-10 pr-3 py-2.5 h-11 rounded-lg bg-muted/30 border border-border text-sm outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="max-h-40 overflow-y-auto rounded-xl border border-border divide-y divide-border">
            {filteredStores.map(store => (
              <label
                key={store.id}
                className={cn(
                  "flex items-center gap-3 p-2.5 cursor-pointer transition-colors hover:bg-muted/30",
                  selectedIds.has(store.id) && "bg-primary/5"
                )}
              >
                <Checkbox
                  checked={selectedIds.has(store.id)}
                  onCheckedChange={() => toggleStore(store.id)}
                  disabled={!selectedIds.has(store.id) && selectedIds.size >= 4}
                />
                <span className="font-bold text-sm truncate">{store.name}</span>
                {selectedIds.has(store.id) && (
                  <span className="ml-auto text-sm font-black uppercase text-primary">
                    {Array.from(selectedIds).indexOf(store.id) + 1}
                  </span>
                )}
              </label>
            ))}
          </div>
          <p className="text-sm text-muted-foreground/60">
            {selectedIds.size}/4 tiendas seleccionadas · mínimo 2 para comparar
          </p>
        </div>

        {/* Tabla comparativa */}
        {isLoading && (
          <div className="py-12 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
            <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">Comparando...</p>
          </div>
        )}

        {showComparison && !isLoading && (
          <div className="space-y-4">
            {/* Tabla de KPIs comparativa — responsive con overflow-x-auto */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-2 py-2 text-sm font-black uppercase tracking-widest text-muted-foreground">KPI</th>
                    {comparison!.map(c => (
                      <th key={c.storeId} className="text-right px-2 py-2 text-sm font-black uppercase tracking-widest text-primary">
                        {c.storeName.length > 15 ? c.storeName.slice(0, 13) + '...' : c.storeName}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  <ComparisonRow
                    icon={DollarSign}
                    label="Ventas 30d"
                    values={comparison!.map(c => formatCurrency(c.sales))}
                    highlight={comparison!.map(c => c.sales === maxSales)}
                  />
                  <ComparisonRow
                    icon={Package}
                    label="Valor Stock"
                    values={comparison!.map(c => formatCurrency(c.stockValue))}
                    highlight={comparison!.map(c => c.stockValue === maxStock)}
                  />
                  <ComparisonRow
                    icon={TrendingUp}
                    label={t('compare.productsLabel')}
                    values={comparison!.map(c => String(c.productsCount))}
                    highlight={comparison!.map(c => c.productsCount === maxProducts)}
                  />
                  <ComparisonRow
                    icon={FileText}
                    label="FCs Pend."
                    values={comparison!.map(c => String(c.fcsPending))}
                    highlight={comparison!.map(c => c.fcsPending === Math.max(...comparison!.map(x => x.fcsPending)))}
                    invertHighlight
                  />
                  <ComparisonRow
                    icon={Heart}
                    label={t('compare.healthLabel')}
                    values={comparison!.map(c => `${c.healthScore}%`)}
                    highlight={comparison!.map(c => c.healthScore === Math.max(...comparison!.map(x => x.healthScore)))}
                  />
                </tbody>
              </table>
            </div>

            {/* B2: ResponsiveTable con detalle por tienda — en mobile colapsa columnas low priority */}
            <div className="pt-2 border-t border-border">
              <p className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-2">Detalle por tienda</p>
              <ResponsiveTable
                columns={[
                  { key: 'name', header: 'Tienda', priority: 'high', render: (row) => <strong className="text-sm">{row.storeName}</strong> },
                  { key: 'sales', header: 'Ventas', priority: 'high', render: (row) => formatCurrency(row.sales) },
                  { key: 'stock', header: 'Stock', priority: 'medium', render: (row) => formatCurrency(row.stockValue) },
                  { key: 'products', header: 'Productos', priority: 'medium', render: (row) => String(row.productsCount) },
                  { key: 'fcs', header: 'FCs Pend.', priority: 'low', render: (row) => String(row.fcsPending) },
                  { key: 'health', header: 'Health', priority: 'low', render: (row) => `${row.healthScore}%` },
                ] as ResponsiveColumn<typeof comparison[number]>[]}
                data={comparison!}
                rowKey={(row) => row.storeId}
                emptyMessage={t('compare.emptyMessage')}
              />
            </div>

            {/* Gráfico de barras: Ventas */}
            <div className="space-y-2">
              <p className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                <DollarSign className="w-3 h-3" /> Ventas (30 días)
              </p>
              {comparison!.map(c => (
                <div key={c.storeId} className="flex items-center gap-2">
                  <span className="text-sm font-bold w-20 truncate">{c.storeName}</span>
                  <div className="flex-1 h-6 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-500 flex items-center justify-end pr-2"
                      style={{ width: `${(c.sales / maxSales) * 100}%` }}
                    >
                      <span className="text-sm font-black text-primary-foreground">{formatCurrency(c.sales)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Gráfico de barras: Health Score */}
            <div className="space-y-2">
              <p className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                <Heart className="w-3 h-3" /> Health Score
              </p>
              {comparison!.map(c => (
                <div key={c.storeId} className="flex items-center gap-2">
                  <span className="text-sm font-bold w-20 truncate">{c.storeName}</span>
                  <div className="flex-1 h-6 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full transition-all duration-500 flex items-center justify-end pr-2",
                        c.healthScore >= 80 ? 'bg-success' : c.healthScore >= 40 ? 'bg-amber-500' : 'bg-destructive'
                      )}
                      style={{ width: `${c.healthScore}%` }}
                    >
                      <span className="text-sm font-black text-white">{c.healthScore}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!canCompare && !isLoading && (
          <div className="py-8 text-center border-2 border-dashed border-border rounded-xl">
            <GitCompare className="w-10 h-10 text-muted-foreground/70 mx-auto mb-2" />
            <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              Selecciona al menos 2 tiendas
            </p>
          </div>
        )}
      </div>
    </BaseModal>
  );
}

function ComparisonRow({
  icon: Icon,
  label,
  values,
  highlight,
  invertHighlight = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  values: string[];
  highlight: boolean[];
  invertHighlight?: boolean;
}) {
  return (
    <tr>
      <td className="px-2 py-2.5 flex items-center gap-1.5 text-muted-foreground">
        <Icon className="w-3 h-3 shrink-0" />
        <span className="text-sm font-black uppercase tracking-widest">{label}</span>
      </td>
      {values.map((v, i) => (
        <td
          key={i}
          className={cn(
            "px-2 py-2.5 text-right font-bold",
            invertHighlight
              ? (highlight[i] ? 'text-destructive' : 'text-foreground')
              : (highlight[i] ? 'text-success font-black' : 'text-foreground')
          )}
        >
          {v}
        </td>
      ))}
    </tr>
  );
}
