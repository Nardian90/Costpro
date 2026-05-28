'use client';

import React, { useState, useCallback } from 'react';
import { Check, Trash2, Download, FileDown, Search, Table2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { StateRenderer } from '@/components/ui/StateRenderer';
import { Skeleton } from '@/components/ui/skeleton';
import ActionMenu, { type Action } from '@/components/ui/ActionMenu';
import { useIsMobile } from '@/hooks/ui/useMobile';
import { useSalesCatalog } from './useSalesCatalog';
import SalesCatalogToolbar from './SalesCatalogToolbar';
import SalesCatalogTable from './SalesCatalogTable';
import SalesCatalogCardGrid from './SalesCatalogCardGrid';
import SalesCatalogTotals from './SalesCatalogTotals';
import SalesCatalogCheckoutModal from './SalesCatalogCheckoutModal';

export default function SalesCatalogView() {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [togglingVisibleId, setTogglingVisibleId] = useState<string | null>(null);

  const handleToggleVisible = useCallback(async (productId: string, visible: boolean) => {
    setTogglingVisibleId(productId);
    try {
      const { error } = await supabase
        .from('products')
        .update({ visible_en_tienda: visible })
        .eq('id', productId);
      if (error) throw error;
      toast.success(visible ? 'Producto visible en la tienda' : 'Producto oculto de la tienda');
      queryClient.invalidateQueries({ queryKey: ['products'] });
    } catch {
      toast.error('Error al cambiar visibilidad');
    } finally {
      setTogglingVisibleId(null);
    }
  }, [queryClient]);

  const catalog = useSalesCatalog();

  // Sync view mode to mobile
  const viewMode = isMobile ? 'card' : catalog.viewMode;

  // Build handlers object for table/card components
  const handlers = {
    handleSetQuantity: catalog.handleSetQuantity,
    handleSelectVariant: catalog.handleSelectVariant,
    handleSetDiscountType: catalog.handleSetDiscountType,
    handleSetDiscountValue: catalog.handleSetDiscountValue,
    handleSetPaymentMethod: catalog.handleSetPaymentMethod,
    handleSetCashPaid: catalog.handleSetCashPaid,
    handleSetTransferPaid: catalog.handleSetTransferPaid,
    updateRow: catalog.updateRow,
  };

  // Action menu items
  const actions: Action[] = [
    {
      id: 'checkout',
      label: catalog.isProcessing ? 'Procesando...' : `Vender (${catalog.totals.itemCount})`,
      icon: Check,
      onClick: catalog.handleCheckout,
      variant: catalog.totals.itemCount > 0 ? 'success' : 'outline',
      disabled: catalog.isProcessing || catalog.totals.itemCount === 0,
    },
    {
      id: 'export-excel',
      label: 'Exportar Excel',
      icon: Download,
      onClick: catalog.handleExportExcel,
      variant: catalog.activeRows.length > 0 ? 'primary' : 'outline',
      disabled: catalog.activeRows.length === 0,
    },
    {
      id: 'export-pdf',
      label: 'Exportar PDF',
      icon: FileDown,
      onClick: catalog.handleExportPDF,
      variant: catalog.activeRows.length > 0 ? 'primary' : 'outline',
      disabled: catalog.activeRows.length === 0,
    },
    {
      id: 'clear',
      label: 'Limpiar',
      icon: Trash2,
      onClick: catalog.handleClearAll,
      variant: 'danger',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-xl">
            <Table2 className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-[clamp(1.5rem,5vw,2.25rem)] font-black text-foreground tracking-tighter uppercase">
              Tabla IPV
            </h2>
            <p className="text-xs text-muted-foreground uppercase tracking-widest">
              Punto de venta interactivo con precios, descuentos y formas de pago
            </p>
          </div>
        </div>
        <ActionMenu actions={actions} className="w-auto" position="top" />
      </div>

      {/* Toolbar */}
      <SalesCatalogToolbar
        searchTerm={catalog.searchTerm}
        onSearchChange={catalog.setSearchTerm}
        stockFilter={catalog.stockFilter}
        onStockFilterChange={catalog.setStockFilter}
        viewMode={viewMode}
        onViewModeChange={catalog.setViewMode}
        filteredCount={catalog.filteredProducts.length}
        loadedCount={catalog.activeRows.length}
        sortConfig={catalog.sortConfig}
        onClearSort={catalog.clearSort}
      />

      {/* Content */}
      <StateRenderer
        isLoading={catalog.isLoading}
        error={catalog.error as Error}
        data={catalog.filteredProducts}
        loadingComponent={
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        }
        emptyComponent={
          <div className="py-24 text-center border-2 border-dashed border-border rounded-2xl bg-muted/5">
            <Search className="w-12 h-12 mx-auto mb-4 opacity-10" />
            <p className="font-black uppercase tracking-widest text-xs text-muted-foreground">
              No se encontraron productos
            </p>
          </div>
        }
      >
        {() => (
          <>
            {viewMode === 'card' ? (
              <SalesCatalogCardGrid
                products={catalog.filteredProducts}
                getOrCreateRow={catalog.getOrCreateRow}
                handlers={handlers}
                hasDiscrepancy={catalog.hasDiscrepancy}
                calcSubtotal={catalog.calcSubtotal}
              />
            ) : (
              <SalesCatalogTable
                products={catalog.filteredProducts}
                getOrCreateRow={catalog.getOrCreateRow}
                sortConfig={catalog.sortConfig}
                onSort={catalog.handleSort}
                showMixedColumns={catalog.showMixedColumns}
                handlers={handlers}
                hasDiscrepancy={catalog.hasDiscrepancy}
                calcSubtotal={catalog.calcSubtotal}
                onToggleVisible={handleToggleVisible}
                togglingVisibleId={togglingVisibleId}
              />
            )}

            {/* Totals Footer */}
            {catalog.activeRows.length > 0 && (
              <SalesCatalogTotals
                activeRowsCount={catalog.activeRows.length}
                itemCount={catalog.totals.itemCount}
                subtotal={catalog.totals.subtotal}
                cashTotal={catalog.totals.cashTotal}
                transferTotal={catalog.totals.transferTotal}
                showMixedColumns={catalog.showMixedColumns}
              />
            )}
          </>
        )}
      </StateRenderer>

      {/* Checkout Confirmation Modal */}
      <SalesCatalogCheckoutModal
        open={catalog.showCheckoutConfirm}
        onOpenChange={catalog.setShowCheckoutConfirm}
        activeRows={catalog.activeRows}
        isProcessing={catalog.isProcessing}
        onConfirm={catalog.confirmCheckout}
        subtotal={catalog.totals.subtotal}
        cashTotal={catalog.totals.cashTotal}
        transferTotal={catalog.totals.transferTotal}
        showMixedColumns={catalog.showMixedColumns}
      />
    </div>
  );
}
