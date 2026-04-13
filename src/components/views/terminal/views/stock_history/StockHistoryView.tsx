'use client';

import React from 'react';
import { History, ArrowUpRight, ArrowDownRight, ArrowUpDown, Calendar } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import SearchBar from '@/components/ui/SearchBar';
import ActionMenu from '@/components/ui/ActionMenu';
import { QueryInspector } from '@/components/ui/QueryInspector';

import { useState } from 'react';
import { toast } from 'sonner';
import { useStockMovements } from '@/hooks/api/useStockMovements';
import { useAuthStore } from '@/store';

export default function StockHistoryView() {
  const { user } = useAuthStore();
  const { data: movementsData, refetch } = useStockMovements(user?.storeId, user?.role === 'admin');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });

  const onRefresh = () => {
    refetch();
    toast.success('Historial de stock actualizado.');
  };

  const onSearchChange = (value: string) => setSearchTerm(value);
  const onDateRangeChange = (range: { from: string; to: string }) => setDateRange(range);

  const movements = (movementsData || []).filter(mov => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const productName = mov.product?.name?.toLowerCase() || '';
    const productSku = mov.product?.sku?.toLowerCase() || '';
    const refDoc = mov.reference_doc?.toLowerCase() || '';
    return productName.includes(term) || productSku.includes(term) || refDoc.includes(term);
  });
  const getMovementBadge = (type: string) => {
    switch (type) {
      case 'sale': return 'text-primary bg-primary/10 border-primary/20';
      case 'purchase': return 'text-green-600 bg-green-500/10 border-green-500/20';
      case 'adjustment': return 'text-amber-600 bg-amber-500/10 border-amber-500/20';
      default: return 'text-muted-foreground bg-muted/20 border-border';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
         <h2 className="text-[clamp(1.5rem,5vw,2.25rem)] font-black text-foreground tracking-tighter uppercase text-primary"> Historial de Stock </h2>
         <ActionMenu
            actions={[
              { id: 'refresh', label: 'Actualizar', icon: History, onClick: onRefresh, variant: 'primary' }
            ]}
            className="sm:w-auto"
         />
      </div>

      <QueryInspector />

      <SearchBar
        value={searchTerm}
        onChange={onSearchChange}
        placeholder="Filtrar por producto o SKU..."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
          <div className="space-y-1.5">
            <label className="text-xs font-black text-muted-foreground uppercase tracking-widest block ml-1">Desde</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                type="date"
                className="w-full p-2.5 pl-10 rounded-lg border border-border bg-background text-xs font-bold outline-none focus:ring-1 focus:ring-primary"
                value={dateRange.from}
                onChange={e => onDateRangeChange({ ...dateRange, from: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-black text-muted-foreground uppercase tracking-widest block ml-1">Hasta</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                type="date"
                className="w-full p-2.5 pl-10 rounded-lg border border-border bg-background text-xs font-bold outline-none focus:ring-1 focus:ring-primary"
                value={dateRange.to}
                onChange={e => onDateRangeChange({ ...dateRange, to: e.target.value })}
              />
            </div>
          </div>
        </div>
      </SearchBar>

      <div className="space-y-3">
        {movements.map(mov => (
          <div key={mov.id} className="p-4 rounded-xl border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-primary/30 transition-all group">
            <div className="flex items-center gap-4">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center border shadow-sm group-hover:scale-105 transition-transform", getMovementBadge(mov.movement_type))}>
                {mov.movement_type === 'sale' ? <ArrowUpRight className="w-6 h-6" /> :
                 mov.movement_type === 'purchase' ? <ArrowDownRight className="w-6 h-6" /> :
                 <ArrowUpDown className="w-6 h-6" />}
              </div>
              <div>
                <div className="font-black text-base uppercase tracking-tight leading-tight">{mov.product?.name}</div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="font-mono text-xs font-bold text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">{mov.product?.sku}</span>
                  <span className="text-xs font-black uppercase text-primary tracking-widest">
                    {mov.movement_type === 'sale' ? 'Venta' :
                     mov.movement_type === 'purchase' ? 'Compra' :
                     mov.movement_type === 'adjustment' ? 'Ajuste' : mov.movement_type}
                  </span>
                </div>
              </div>
            </div>
            <div className="text-left sm:text-right space-y-1">
              <div className={cn("text-xl font-black", mov.quantity_change > 0 ? 'text-green-600' : 'text-destructive')}>
                {mov.quantity_change > 0 ? '+' : ''}{mov.quantity_change}
                <span className="text-xs ml-1 font-bold">uds</span>
              </div>
              <div className="text-xs text-muted-foreground uppercase font-black tracking-widest">
                {formatDate(mov.created_at)}
              </div>
              <div className="text-xs font-mono text-muted-foreground/60 italic">
                REF: {mov.reference_doc || 'N/A'}
              </div>
            </div>
          </div>
        ))}
        {movements.length === 0 && (
          <div className="text-center py-24 rounded-xl border-2 border-dashed border-border bg-card/50">
            <History className="w-16 h-16 mx-auto mb-4 opacity-5" />
            <p className="font-black uppercase tracking-widest text-xs text-muted-foreground">Sin movimientos registrados</p>
          </div>
        )}
      </div>
    </div>
  );
}
