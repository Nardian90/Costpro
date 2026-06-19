'use client';

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Check, Trash2, Download, FileDown, Search, Table2,
  PlusCircle, BadgeCheck, FileCheck, LayoutGrid, Upload,
  Undo2, Loader2, AlertTriangle, MoreHorizontal,
  TableProperties, ChevronUp, ChevronDown, X, ChevronRight, FileSpreadsheet,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { StateRenderer } from '@/components/ui/StateRenderer';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { useIsMobile } from '@/hooks/ui/useMobile';
import { useSalesCatalog } from './useSalesCatalog';
import type { StockFilter } from './useSalesCatalog';
import SalesCatalogTable from './SalesCatalogTable';
import SalesCatalogCardGrid from './SalesCatalogCardGrid';
import SalesCatalogTotals from './SalesCatalogTotals';
import SalesCatalogCheckoutModal from './SalesCatalogCheckoutModal';
import { CatalogExportModal } from './CatalogExportModal';
import { useCatalogExport } from '@/hooks/logic/useCatalogExport';
import { useAuthStore } from '@/store';
import { TEMPLATE_CONFIGS } from './catalog-templates/types';
import { cn, formatCurrency } from '@/lib/utils';
import { BackToVentaButton } from '@/components/ui/BackToVentaButton';

// ── Constants ─────────────────────────────────────────────

const STOCK_FILTERS: { value: StockFilter; label: string; group?: 'stock' | 'quantity' }[] = [
  { value: 'all', label: 'Todos', group: 'stock' },
  { value: 'in_stock', label: 'Con Stock', group: 'stock' },
  { value: 'out_of_stock', label: 'Sin Stock', group: 'stock' },
  { value: 'with_movements', label: 'Movimientos', group: 'stock' },
  { value: 'with_quantity', label: 'Con Cantidad', group: 'quantity' },
  { value: 'without_quantity', label: 'Sin Cantidad', group: 'quantity' },
];

// ── Component ─────────────────────────────────────────────

export default function SalesCatalogView() {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [togglingVisibleId, setTogglingVisibleId] = useState<string | null>(null);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showWarningsExpanded, setShowWarningsExpanded] = useState(true);

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
  const importRef = React.useRef<HTMLInputElement>(null);

  const handleImportClick = useCallback(() => {
    importRef.current?.click();
  }, []);

  const handleImportFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        catalog.handleImportRequest(file);
      }
      e.target.value = '';
    },
    [catalog],
  );

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

  const hasActiveItems = catalog.totals.itemCount > 0;

  // ── Render ──
  return (
    <div className="space-y-4">
      {/* ── Compact Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {/* QW-1 (IA Audit): botón "← Volver a Venta" para wayfinding contextual.
              SalesCatalogView (Tabla IPV) es alcanzada desde el hub de Venta. */}
          <BackToVentaButton compact />
          <div className={cn(
            'p-1.5 rounded-lg transition-colors',
            catalog.isReadOnly ? 'bg-success/10' : 'bg-primary/10',
          )}>
            {catalog.isReadOnly
              ? <BadgeCheck className="w-5 h-5 text-success" />
              : <Table2 className="w-5 h-5 text-primary" />
            }
          </div>
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-black text-foreground tracking-tight uppercase leading-tight">
              Tabla IPV
            </h2>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest leading-tight">
              {catalog.isReadOnly
                ? 'Venta confirmada — Solo lectura'
                : `${catalog.filteredProducts.length} producto${catalog.filteredProducts.length !== 1 ? 's' : ''}`
              }
            </p>
          </div>
        </div>

        {/* Confirmed sale badge */}
        {catalog.isReadOnly && (
          <div className="hidden sm:flex items-center gap-2 bg-success/5 border border-success/20 rounded-lg px-3 py-1.5">
            <BadgeCheck className="w-3.5 h-3.5 text-success" />
            <span className="text-xs font-bold text-success">
              {catalog.confirmedSaleId}
            </span>
            <span className="text-xs font-black text-success tabular-nums">
              {formatCurrency(catalog.totals.subtotal)}
            </span>
          </div>
        )}
      </div>

      {/* ── Confirmed Sale Banner (mobile) ── */}
      {catalog.isReadOnly && isMobile && (
        <div className="bg-success/5 border border-success/20 rounded-xl p-3 flex items-center gap-3">
          <BadgeCheck className="w-4 h-4 text-success shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-success text-xs">{catalog.confirmedSaleId}</p>
            <p className="text-[10px] text-muted-foreground">
              {catalog.activeRows.length} producto{catalog.activeRows.length !== 1 ? 's' : ''} — {formatCurrency(catalog.totals.subtotal)}
            </p>
          </div>
        </div>
      )}

      {/* ── COMMAND BAR (Option B) ── */}
      <div className={cn(
        'sticky top-[60px] sm:top-[56px] z-40 -mx-4 px-4',
      )}>
        <div className={cn(
          'bg-card/95 backdrop-blur-xl border border-border rounded-2xl shadow-lg shadow-black/5',
          'p-2 flex items-center gap-2',
          catalog.isReadOnly && 'opacity-60 pointer-events-none',
        )}>
          {/* ── Search (desktop: ~50%, mobile: hidden by default) ── */}
          {!isMobile && (
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
              <input
                type="text"
                value={catalog.searchTerm}
                onChange={(e) => catalog.setSearchTerm(e.target.value)}
                placeholder="Buscar productos..."
                className="w-full h-10 pl-9 pr-3 rounded-xl bg-muted/50 border border-border/30 text-sm font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:bg-background transition-all"
                aria-label="Buscar productos por nombre o SKU"
              />
              {catalog.searchTerm && (
                <button
                  type="button"
                  onClick={() => catalog.setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* ── Mobile: search toggle + filter pills ── */}
          {isMobile && (
            <>
              <button
                type="button"
                onClick={() => setShowMobileFilters(!showMobileFilters)}
                className="shrink-0 flex items-center gap-1.5 h-10 px-3 rounded-xl bg-muted/50 border border-border/30 text-xs font-bold text-muted-foreground"
              >
                <Search className="w-4 h-4" />
                {showMobileFilters ? 'Cerrar' : 'Filtros'}
              </button>
              <span className="shrink-0 text-[10px] font-black text-muted-foreground tabular-nums">
                {catalog.filteredProducts.length}
              </span>
            </>
          )}

          {/* ── Filter Pills (desktop) ── */}
          {!isMobile && (
            <div className="flex items-center gap-1">
              {/* Stock filters */}
              <div className="flex items-center gap-0.5 bg-muted/40 rounded-xl p-0.5 border border-border/30">
                <button
                  type="button"
                  onClick={() => catalog.setStockFilter(catalog.stockFilter === 'in_stock' ? 'all' : 'in_stock')}
                  className={cn(
                    'px-3 h-9 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all',
                    catalog.stockFilter === 'in_stock'
                      ? 'bg-success text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                  )}
                  title="Alternar: Con Stock / Todos"
                >
                  Con Stock
                </button>
                <button
                  type="button"
                  onClick={() => catalog.setStockFilter(catalog.stockFilter === 'out_of_stock' ? 'all' : 'out_of_stock')}
                  className={cn(
                    'px-3 h-9 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all',
                    catalog.stockFilter === 'out_of_stock'
                      ? 'bg-destructive text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                  )}
                  title="Alternar: Sin Stock / Todos"
                >
                  Sin Stock
                </button>
              </div>
              {/* Divider */}
              <div className="w-px h-6 bg-border/50" />
              {/* Quantity filters */}
              <div className="flex items-center gap-0.5 bg-muted/40 rounded-xl p-0.5 border border-border/30">
                <button
                  type="button"
                  onClick={() => catalog.setStockFilter(catalog.stockFilter === 'with_quantity' ? 'all' : 'with_quantity')}
                  className={cn(
                    'px-3 h-9 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all',
                    catalog.stockFilter === 'with_quantity'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                  )}
                  title="Alternar: Con Cantidad / Todos"
                >
                  Con Cant.
                </button>
                <button
                  type="button"
                  onClick={() => catalog.setStockFilter(catalog.stockFilter === 'without_quantity' ? 'all' : 'without_quantity')}
                  className={cn(
                    'px-3 h-9 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all',
                    catalog.stockFilter === 'without_quantity'
                      ? 'bg-warning text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                  )}
                  title="Alternar: Sin Cantidad / Todos"
                >
                  Sin Cant.
                </button>
              </div>
              {/* Movimientos */}
              <button
                type="button"
                onClick={() => catalog.setStockFilter(catalog.stockFilter === 'with_movements' ? 'all' : 'with_movements')}
                className={cn(
                  'shrink-0 flex items-center gap-1 px-2.5 h-9 rounded-lg border border-border/30 text-[10px] font-bold uppercase tracking-wider transition-all',
                  catalog.stockFilter === 'with_movements'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/60',
                )}
              >
                Mov.
              </button>
            </div>
          )}

          {/* ── Sort chip (desktop) ── */}
          {!isMobile && catalog.sortConfig && (
            <button
              type="button"
              onClick={catalog.clearSort}
              className="shrink-0 flex items-center gap-1 h-9 px-2.5 rounded-lg bg-muted/40 border border-border/30 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            >
              {catalog.sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {catalog.sortConfig.key}
              <X className="w-2.5 h-2.5 text-destructive/60 ml-0.5" />
            </button>
          )}

          {/* ── Spacer ── */}
          <div className="flex-1" />

          {/* ── Read-only: New + Export buttons ── */}
          {catalog.isReadOnly && (
            <>
              <button
                type="button"
                onClick={catalog.handleNewIPV}
                className="shrink-0 flex items-center gap-1.5 h-10 px-4 rounded-xl bg-success/10 border border-success/20 text-xs font-bold text-success hover:bg-success/20 transition-colors"
              >
                <PlusCircle className="w-4 h-4" />
                <span className="hidden sm:inline">Nuevo</span>
              </button>
              <button
                type="button"
                onClick={catalog.handleExportExcel}
                className="shrink-0 flex items-center gap-1.5 h-10 px-4 rounded-xl bg-muted/50 border border-border/30 text-xs font-bold text-foreground hover:bg-muted transition-colors"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Excel</span>
              </button>
              <button
                type="button"
                onClick={catalog.handleExportPDF}
                disabled={catalog.activeRows.length === 0}
                className="shrink-0 flex items-center gap-1.5 h-10 px-4 rounded-xl bg-muted/50 border border-border/30 text-xs font-bold text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <FileCheck className="w-4 h-4" />
                <span className="hidden sm:inline">PDF</span>
              </button>
            </>
          )}

          {/* ── Edit mode: Vender + Kebab ── */}
          {!catalog.isReadOnly && (
            <>
              {/* Primary: Vender */}
              <button
                type="button"
                onClick={catalog.handleCheckout}
                disabled={catalog.isProcessing || !hasActiveItems || catalog.hasAnyDiscrepancy}
                className={cn(
                  'shrink-0 flex items-center gap-2 h-10 px-5 rounded-xl text-sm font-black uppercase tracking-wide transition-all active:scale-95',
                  hasActiveItems && !catalog.hasAnyDiscrepancy
                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25 hover:bg-primary/90'
                    : 'bg-muted/50 border border-border/30 text-muted-foreground cursor-not-allowed',
                  catalog.isProcessing && 'animate-pulse',
                )}
                title={catalog.hasAnyDiscrepancy ? 'Hay discrepancias en los pagos' : undefined}
              >
                <Check className="w-4 h-4" />
                {catalog.isProcessing ? 'Procesando...' : `Vender`}
                {hasActiveItems && (
                  <span className={cn(
                    'ml-1 px-1.5 py-0.5 rounded-md text-[10px] font-black',
                    hasActiveItems && !catalog.hasAnyDiscrepancy
                      ? 'bg-primary-foreground/20'
                      : 'bg-muted-foreground/20',
                  )}>
                    {catalog.totals.itemCount}
                  </span>
                )}
              </button>

              {/* Kebab: secondary actions */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="shrink-0 w-10 h-10 rounded-xl bg-muted/50 border border-border/30 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    aria-label="Más acciones"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 rounded-xl p-1">
                  <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-2 py-1.5">
                    Exportar
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={catalog.handleExportExcel}
                    className="cursor-pointer rounded-lg"
                  >
                    <Download className="w-4 h-4 mr-2 text-success" />
                    <span className="font-medium">Exportar Excel</span>
                    <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">{catalog.products.length} producto(s)</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={catalog.handleExportPDF}
                    disabled={catalog.activeRows.length === 0}
                    className="cursor-pointer rounded-lg disabled:opacity-40"
                  >
                    <FileDown className="w-4 h-4 mr-2 text-primary" />
                    <span className="font-medium">Exportar PDF</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="my-1" />
                  <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-2 py-1.5">
                    Importar
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={handleImportClick}
                    disabled={catalog.isImporting}
                    className="cursor-pointer rounded-lg disabled:opacity-40"
                  >
                    <Upload className="w-4 h-4 mr-2 text-warning" />
                    <span className="font-medium">Importar Excel</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={catalog.handleUndoImport}
                    disabled={!catalog.prevRows}
                    className="cursor-pointer rounded-lg disabled:opacity-40"
                  >
                    <Undo2 className="w-4 h-4 mr-2 text-warning" />
                    <span className="font-medium">Deshacer Importación</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="my-1" />
                  <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-2 py-1.5">
                    Herramientas
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => setShowCatalogExport(true)}
                    className="cursor-pointer rounded-lg"
                  >
                    <LayoutGrid className="w-4 h-4 mr-2 text-primary" />
                    <span className="font-medium">Generar Catálogo</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => catalog.setViewMode(viewMode === 'table' ? 'card' : 'table')}
                    className="cursor-pointer rounded-lg"
                  >
                    {viewMode === 'table' ? (
                      <><TableProperties className="w-4 h-4 mr-2 text-muted-foreground" /><span className="font-medium">Vista Tarjetas</span></>
                    ) : (
                      <><Table2 className="w-4 h-4 mr-2 text-muted-foreground" /><span className="font-medium">Vista Tabla</span></>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="my-1" />
                  <DropdownMenuItem
                    onClick={catalog.handleClearAll}
                    className="cursor-pointer rounded-lg text-destructive focus:text-destructive focus:bg-destructive/10"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    <span className="font-medium">Limpiar Todo</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>

        {/* ── Mobile: Expanded filters panel ── */}
        {isMobile && showMobileFilters && (
          <div className="mt-2 p-3 bg-card/95 backdrop-blur-xl border border-border rounded-xl shadow-lg space-y-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
              <input
                type="text"
                value={catalog.searchTerm}
                onChange={(e) => catalog.setSearchTerm(e.target.value)}
                placeholder="Buscar productos por nombre o SKU..."
                className="w-full h-10 pl-9 pr-3 rounded-xl bg-muted/50 border border-border/30 text-sm font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                aria-label="Buscar productos"
              />
            </div>
            {/* Filter pills — mobile: toggle style */}
            <div className="flex items-center gap-1 flex-wrap">
              {STOCK_FILTERS.filter(f => f.group === 'stock').map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => catalog.setStockFilter(catalog.stockFilter === opt.value ? 'all' : opt.value)}
                  className={cn(
                    'px-3 h-9 min-h-[44px] rounded-lg text-xs font-bold uppercase tracking-wider transition-all',
                    catalog.stockFilter === opt.value
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground bg-muted/50 border border-border/30',
                  )}
                >
                  {opt.label}
                </button>
              ))}
              <div className="w-px h-6 bg-border/50" />
              {STOCK_FILTERS.filter(f => f.group === 'quantity').map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => catalog.setStockFilter(catalog.stockFilter === opt.value ? 'all' : opt.value)}
                  className={cn(
                    'px-3 h-9 min-h-[44px] rounded-lg text-xs font-bold uppercase tracking-wider transition-all',
                    catalog.stockFilter === opt.value
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground bg-muted/50 border border-border/30',
                  )}
                >
                  {opt.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => catalog.setStockFilter(catalog.stockFilter === 'with_movements' ? 'all' : 'with_movements')}
                className={cn(
                  'px-3 h-9 min-h-[44px] rounded-lg text-xs font-bold uppercase tracking-wider transition-all',
                  catalog.stockFilter === 'with_movements'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground bg-muted/50 border border-border/30',
                )}
              >
                Mov.
              </button>
            </div>
            {/* View mode + sort */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5 bg-muted/40 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => catalog.setViewMode('table')}
                  className={cn(
                    'p-2.5 rounded-md transition-all',
                    viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                  )}
                >
                  <Table2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => catalog.setViewMode('card')}
                  className={cn(
                    'p-2.5 rounded-md transition-all',
                    viewMode === 'card' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                  )}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
              </div>
              {catalog.sortConfig && (
                <button
                  type="button"
                  onClick={catalog.clearSort}
                  className="flex items-center gap-1 px-2.5 h-9 rounded-lg bg-muted/40 border border-border/30 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                >
                  {catalog.sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {catalog.sortConfig.key}
                  <X className="w-2.5 h-2.5 text-destructive/60" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Content ── */}
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

      {/* ── Import Warnings Panel ── */}
      {catalog.importWarnings.length > 0 && (
        <div className="rounded-2xl border border-warning/30 bg-warning/5 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
          <div
            className="flex items-center justify-between p-3 cursor-pointer select-none hover:bg-warning/10 transition-colors"
            onClick={() => setShowWarningsExpanded((prev) => !prev)}
            role="button"
            aria-expanded={showWarningsExpanded}
            aria-controls="import-warnings-list"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
              <span className="text-xs font-black uppercase tracking-widest text-warning">
                {catalog.importWarnings.length} Advertencia{catalog.importWarnings.length !== 1 ? 's' : ''} de Importación
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); catalog.clearImportWarnings(); }}
                className="p-1 rounded-md text-warning/60 hover:text-warning hover:bg-warning/10 transition-colors"
                title="Descartar advertencias"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <ChevronRight className={cn('w-4 h-4 text-warning/60 transition-transform', showWarningsExpanded && 'rotate-90')} />
            </div>
          </div>
          {showWarningsExpanded && (
            <div id="import-warnings-list" className="border-t border-warning/20 max-h-60 overflow-y-auto">
              <ul className="divide-y divide-warning/10">
                {catalog.importWarnings.map((w, i) => (
                  <li key={i} className="px-3 py-2 text-[11px] font-medium text-warning/80 leading-relaxed">
                    <span className="text-warning/60 mr-1.5 font-mono">{i + 1}.</span>
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── Import loading overlay ── */}
      {catalog.isImporting && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-card rounded-2xl p-8 shadow-2xl border border-border flex flex-col items-center gap-4 min-w-[240px]">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="font-black text-sm text-foreground uppercase tracking-widest">Importando Excel</p>
            <p className="text-xs text-muted-foreground">Procesando productos...</p>
          </div>
        </div>
      )}

      {/* ── Import confirmation modal ── */}
      {catalog.showImportConfirm && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl p-6 shadow-2xl border border-border max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="font-bold text-sm text-foreground">Confirmar Importación</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Los datos actuales serán reemplazados por los del archivo Excel.
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-xl p-3">
              Podrás deshacer esta acción con &quot;Deshacer Importación&quot;.
            </p>
            {/* Sheet selector for multi-sheet files */}
            {catalog.importSheetNames.length > 1 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                    Seleccionar Hoja ({catalog.importSheetNames.length} hojas)
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 max-h-40 overflow-y-auto rounded-xl border border-border/50 p-1.5 bg-muted/30">
                  {catalog.importSheetNames.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => catalog.setSelectedSheetName(name)}
                      className={cn(
                        'px-2.5 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all text-left truncate',
                        catalog.selectedSheetName === name
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'bg-background text-muted-foreground hover:bg-muted/60 border border-border/50',
                      )}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground/70">
                  Hoja seleccionada: <span className="font-bold text-foreground">{catalog.selectedSheetName || catalog.importSheetNames[0]}</span>
                </p>
              </div>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={catalog.handleImportCancel}
                className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-bold text-muted-foreground hover:bg-muted/50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={catalog.handleImportConfirm}
                className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors"
              >
                Importar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Hidden file input ── */}
      <input
        ref={importRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleImportFileChange}
        aria-label="Importar archivo Excel de IPV"
      />

      {/* ── Catalog Export Modal ── */}
      <CatalogExportModal
        open={showCatalogExport}
        onOpenChange={setShowCatalogExport}
        templates={TEMPLATE_CONFIGS}
        organized={organizedProducts}
        isExporting={false}
        onExport={(templateId, themeColor, avatarPath) => exportCatalog(templateId, user?.memberships?.find(m => m.store_id === user.activeStoreId)?.store?.name || 'Mi Tienda', themeColor, avatarPath)}
      />

      {/* ── Checkout Confirmation Modal ── */}
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
