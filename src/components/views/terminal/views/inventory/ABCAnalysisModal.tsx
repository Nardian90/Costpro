'use client';

import React, { useMemo, useState } from 'react';
import { BarChart3, X } from 'lucide-react';
import { useIsMobile } from '@/hooks/ui/useMobile';
import { Product } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { BaseModal } from '@/components/ui/BaseModal';
import { SecondaryButton } from '@/components/ui/atomic';
import { cn } from '@/lib/utils';

interface ABCAnalysisProps {
  products: Product[];
  isOpen: boolean;
  onClose: () => void;
}

type ABCCategory = 'A' | 'B' | 'C';

interface ABCItem {
  product: Product;
  value: number;
  percentage: number;
  category: ABCCategory;
}

export default function ABCAnalysisModal({ products, isOpen, onClose }: ABCAnalysisProps) {
  const [sortBy, setSortBy] = useState<'value' | 'stock'>('value');
  const isMobile = useIsMobile();

  const analysis = useMemo(() => {
    if (products.length === 0) return { items: [], summary: { A: 0, B: 0, C: 0, totalValue: 0 } };

    // Calculate individual product values
    const withValue: ABCItem[] = products.map(p => {
      const value = sortBy === 'value'
        ? (p.stock_current || 0) * (p.cost_average || p.cost_price || 0)
        : (p.stock_current || 0) * (p.price || 0);
      return { product: p, value, percentage: 0, category: 'C' as ABCCategory };
    });

    // Sort descending by value
    withValue.sort((a, b) => b.value - a.value);

    // Calculate cumulative percentages
    const totalValue = withValue.reduce((s, i) => s + i.value, 0);
    let cumulative = 0;

    for (const item of withValue) {
      cumulative += item.value;
      item.percentage = totalValue > 0 ? (item.value / totalValue) * 100 : 0;
      item.category = cumulative <= totalValue * 0.8 ? 'A' :
                      cumulative <= totalValue * 0.95 ? 'B' : 'C';
    }

    const summary = {
      A: withValue.filter(i => i.category === 'A').length,
      B: withValue.filter(i => i.category === 'B').length,
      C: withValue.filter(i => i.category === 'C').length,
      totalValue,
    };

    return { items: withValue, summary };
  }, [products, sortBy]);

  const categoryColors: Record<ABCCategory, string> = {
    A: 'bg-success/10 text-success border-success/20',
    B: 'bg-warning/10 text-warning border-warning/20',
    C: 'bg-muted/50 text-muted-foreground border-border',
  };

  return (
    <BaseModal
      open={isOpen}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={
        <div className="flex items-center gap-3">
          <BarChart3 className="w-5 h-5 text-primary" />
          <span className="text-base">Análisis ABC</span>
        </div>
      }
      maxWidth={isMobile ? undefined : 'sm:max-w-4xl'}
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex gap-2">
            <SecondaryButton
              label={sortBy === 'value' ? 'Valor Inventario' : 'Precio Venta'}
              onClick={() => setSortBy(s => s === 'value' ? 'stock' : 'value')}
              className="text-xs"
            />
          </div>
          <SecondaryButton onClick={onClose} label="Cerrar" />
        </div>
      }
    >
      <div className="space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-success/10 border border-success/20 text-center">
            <div className="text-2xl font-black text-success">{analysis.summary.A}</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">A (80% valor)</div>
          </div>
          <div className="p-3 rounded-xl bg-warning/10 border border-warning/20 text-center">
            <div className="text-2xl font-black text-warning">{analysis.summary.B}</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">B (15% valor)</div>
          </div>
          <div className="p-3 rounded-xl bg-muted/50 border border-border text-center">
            <div className="text-2xl font-black">{analysis.summary.C}</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">C (5% valor)</div>
          </div>
          <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 text-center">
            <div className="text-sm font-black text-primary">{formatCurrency(analysis.summary.totalValue)}</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Valor Total</div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
        <div className="rounded-xl border border-border overflow-hidden max-h-[400px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Categoría</th>
                <th className="px-3 py-2 text-left">Producto</th>
                <th className="px-3 py-2 text-right">Stock</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2 text-right">% del Total</th>
                <th className="px-3 py-2 text-right">% Acumulado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {analysis.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-12 text-center text-muted-foreground font-bold">
                    No hay productos para analizar
                  </td>
                </tr>
              ) : (
                analysis.items.map((item, idx) => {
                  const cumulativePct = analysis.items.slice(0, idx + 1)
                    .reduce((s, i) => s + i.percentage, 0);
                  return (
                    <tr key={item.product.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2 text-muted-foreground font-mono">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <span className={cn('text-[10px] font-black px-2 py-0.5 rounded-full border', categoryColors[item.category])}>
                          {item.category}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-bold max-w-[200px] truncate">{item.product.name}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{item.product.stock_current || 0}</td>
                      <td className="px-3 py-2 text-right font-bold text-success tabular-nums">{formatCurrency(item.value)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{item.percentage.toFixed(1)}%</td>
                      <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">{cumulativePct.toFixed(1)}%</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        </div>
      </div>
    </BaseModal>
  );
}
