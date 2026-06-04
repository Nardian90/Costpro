'use client';

import React, { useState, useCallback } from 'react';
import { Check, Trash2, Download, FileDown, Search, Table2, PlusCircle, BadgeCheck, FileCheck, LayoutGrid } from 'lucide-react';
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
import { CatalogExportModal } from './CatalogExportModal';
import { useCatalogExport } from '@/hooks/logic/useCatalogExport';
import { useAuthStore } from '@/store';
import { TEMPLATE_CONFIGS } from './catalog-templates/types';

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
  const { user } = useAuthStore();
  const [showCatalogExport, setShowCatalogExport] = useState(false);
  const { exportCatalog, organizedProducts } = useCatalogExport(catalog.products);

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

  // Dynamic action menu based on state
  const actions: Action[] = catalog.isReadOnly
    ? [
        {
          id: 'new-ipv',
          label: 'Nuevo',
          icon: PlusCircle,
          onClick: catalog.handleNewIPV,
          variant: 'success' as const,
        },
        {
          id: 'export-excel',
          label: 'Exportar Excel',
          icon: Download,
          onClick: catalog.handleExportExcel,
          variant: 'primary' as const,
          disabled: catalog.activeRows.length === 0,
        },
        {
          id: 'export-pdf',
          label: 'Exportar PDF',
          icon: FileCheck,
          onClick: catalog.handleExportPDF,
          variant: 'primary' as const,
          disabled: catalog.activeRows.length === 0,
        },
      ]
    : [
        {
          id: 'checkout',
          label: catalog.hasAnyDiscrepancy
            ? 'Vender — Discrepancias'
            : catalog.isProcessing
              ? 'Procesando...'
              : `Vender (${catalog.totals.itemCount})`,
          icon: Check,
          onClick: catalog.handleCheckout,
          variant: catalog.totals.itemCount > 0 && !catalog.hasAnyDiscrepancy ? 'success' : 'outline',
          disabled: catalog.isProcessing || catalog.totals.itemCount === 0 || catalog.hasAnyDiscrepancy,
          tooltip: catalog.hasAnyDiscrepancy ? (
            <div className="space-y-1">
              <p className="font-bold text-destructive">Pago ≠ Subtotal</p>
              <p className="text-xs">Verifica que el efectivo + transferencia coincida con el subtotal en cada producto con pago mixto.</p>
            </div>
          ) : undefined,
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
          id: 'export-catalog',
          label: 'Generar Catalogo',
          icon: LayoutGrid,
          onClick: () => setShowCatalogExport(true),
          variant: 'primary' as const,
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
          <div className={catalog.isReadOnly ? 'p-2 bg-emerald-500/10 rounded-xl' : 'p-2 bg-primary/10 rounded-xl'}>
            {catalog.isReadOnly
              ? <BadgeCheck className="w-6 h-6 text-emerald-600" />
              : <Table2 className="w-6 h-6 text-primary" />
            }
          </div>
          <div>
            <h2 className="text-[clamp(1.5rem,5vw,2.25rem)] font-black text-foreground tracking-tighter uppercase">
              Tabla IPV
            </h2>
            <p className="text-xs text-muted-foreground uppercase tracking-widest">
              {catalog.isReadOnly ? 'Venta confirmada — Solo lectura' : 'Punto de venta interactivo con precios, descuentos y formas de pago'}
            </p>
          </div>
        </div>
        <ActionMenu actions={actions} className="w-auto" position="top" />
      </div>

      {/* Confirmed Sale Banner */}
      {catalog.isReadOnly && (
        <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-2xl p-4 flex items-center gap-4">
          <div className="shrink-0 w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <BadgeCheck className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-emerald-700 text-sm">
              Venta Confirmada
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              ID: {catalog.confirmedSaleId} — {catalog.activeRows.length} producto{catalog.activeRows.length !== 1 ? 's' : ''} — Total: ${catalog.totals.subtotal.toFixed(2)}
            </p>
          </div>
        </div>
      )}

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
        disabled={catalog.isReadOnly}
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
              {catalog.isReadOnly ? 'Sin productos en esta venta' : 'No se encontraron productos'}
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
                isReadOnly={catalog.isReadOnly}
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
                onToggleVisible={!catalog.isReadOnly ? handleToggleVisible : undefined}
                togglingVisibleId={togglingVisibleId}
                isReadOnly={catalog.isReadOnly}
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

      {/* Catalog Export Modal */}
      <CatalogExportModal
        open={showCatalogExport}
        onOpenChange={setShowCatalogExport}
        templates={TEMPLATE_CONFIGS}
        organized={organizedProducts}
        isExporting={false}
        onExport={(templateId, themeColor, avatarPath) => exportCatalog(templateId, user?.memberships?.find(m => m.store_id === user.activeStoreId)?.store?.name || 'Mi Tienda', themeColor, avatarPath)}
      />

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
