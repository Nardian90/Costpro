'use client';

import React, { useState } from 'react';
import { History, ArrowUpRight, ArrowDownRight, ArrowUpDown, Calendar, RefreshCcw, Search } from 'lucide-react';
import { cn, formatDate, formatTime } from '@/lib/utils';
import SearchBar from '@/components/ui/SearchBar';
import ActionMenu from '@/components/ui/ActionMenu';
import { QueryInspector } from '@/components/ui/QueryInspector';
import { useStockMovements } from '@/hooks/api/useStockMovements';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';

export default function InventoryAdjustmentsView() {
  const { user } = useAuthStore();
  const { data: movementsData, isLoading, refetch } = useStockMovements(user?.storeId, user?.role === 'admin');
  const [searchTerm, setSearchTerm] = useState('');

  const onRefresh = () => {
    refetch();
    toast.success('Historial de ajustes actualizado.');
  };

  // Filtramos solo aquellos movimientos que provienen de inversiones
  // Asumimos que el motivo o el tipo contienen 'INVERSION' o son ajustes manuales específicos
  const adjustments = (movementsData || []).filter(mov => {
    // Aquí filtramos por la lógica solicitada: solo ajustes de ventas o recepciones (inversiones)
    // Buscamos en reference_doc o movement_type si el RPC los marca ahí
    const isInversion =
      (mov.reference_doc && mov.reference_doc.includes('INVERSION')) ||
      (mov.movement_type === 'SALE_INVERSION' || mov.movement_type === 'RECEPTION_INVERSION');

    if (!isInversion) return false;

    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const productName = mov.product?.name?.toLowerCase() || '';
    const productSku = mov.product?.sku?.toLowerCase() || '';
    const refDoc = mov.reference_doc?.toLowerCase() || '';
    return productName.includes(term) || productSku.includes(term) || refDoc.includes(term);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
         <div>
            <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase text-primary"> Ajustes de Documentos </h2>
            <p className="text-muted-foreground text-xs font-bold uppercase tracking-widest mt-1">Inversiones de Ventas y Recepciones</p>
         </div>
         <ActionMenu
            actions={[
              { id: 'refresh', label: 'Actualizar', icon: RefreshCcw, onClick: onRefresh, variant: 'primary' }
            ]}
         />
      </div>

      <QueryInspector />

      <SearchBar
        value={searchTerm}
        onChange={setSearchTerm}
        placeholder="Buscar por producto, SKU o referencia..."
      />

      <div className="grid grid-cols-1 gap-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Cargando Ajustes...</p>
          </div>
        ) : adjustments.length > 0 ? (
          adjustments.map(mov => (
            <div key={mov.id} className="p-4 rounded-2xl border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-primary/40 transition-all group relative overflow-hidden">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center border shadow-sm transition-transform group-hover:scale-110",
                  mov.quantity_change > 0 ? "text-green-600 bg-green-500/10 border-green-500/20" : "text-destructive bg-destructive/10 border-destructive/20"
                )}>
                  {mov.quantity_change > 0 ? <ArrowUpRight className="w-6 h-6" /> : <ArrowDownRight className="w-6 h-6" />}
                </div>
                <div>
                  <div className="font-black text-base uppercase tracking-tight leading-tight">{mov.product?.name || 'Producto Desconocido'}</div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="font-mono text-[10px] font-bold text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">{mov.product?.sku || 'S/SKU'}</span>
                    <span className={cn(
                      "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full",
                      mov.quantity_change > 0 ? "text-green-600 bg-green-500/10" : "text-destructive bg-destructive/10"
                    )}>
                      {mov.quantity_change > 0 ? 'Aumento (Venta Inv.)' : 'Disminución (Recep. Inv.)'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:items-end gap-1">
                <div className={cn("text-2xl font-black", mov.quantity_change > 0 ? 'text-green-600' : 'text-destructive')}>
                  {mov.quantity_change > 0 ? '+' : ''}{mov.quantity_change}
                  <span className="text-xs ml-1 font-bold">uds</span>
                </div>
                <div className="flex flex-col sm:items-end text-[10px] font-black uppercase tracking-tighter text-muted-foreground">
                  <span>{formatDate(mov.created_at)} - {formatTime(mov.created_at)}</span>
                  <span className="text-primary/70 mt-0.5">REF: {mov.reference_doc || 'SIN REFERENCIA'}</span>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-24 rounded-2xl border-2 border-dashed border-border bg-muted/5">
            <History className="w-16 h-16 mx-auto mb-4 opacity-5" />
            <p className="font-black uppercase tracking-widest text-xs text-muted-foreground">No se encontraron ajustes de inversiones</p>
          </div>
        )}
      </div>
    </div>
  );
}
