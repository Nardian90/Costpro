'use client';

import React, { useRef } from 'react';
import { useIsMobile } from '@/hooks/ui/useMobile';
import { DollarSign, CreditCard, Eye, RefreshCcw, Copy, Calculator, CheckSquare, Square, AlertTriangle, ShoppingCart, Download, ChevronLeft, ChevronRight, X, Filter, Wallet, ArrowLeftRight } from 'lucide-react';
import { cn, formatCurrency, formatDate, formatTime } from '@/lib/utils';
import SearchBar from '@/components/ui/SearchBar';
import { StateRenderer } from '@/components/ui/StateRenderer';
import { Skeleton } from '@/components/ui/skeleton';
import { BaseModal } from '@/components/ui/BaseModal';
import { PrimaryButton, SecondaryButton } from '@/components/ui/atomic';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useSalesHistoryView } from './useSalesHistoryView';
import { TransactionDetailsModal } from './TransactionDetailsModal';

// Helper para icono y etiqueta del método de pago
function getPaymentMethodInfo(method: string | null | undefined): { icon: React.ElementType; label: string; color: string } {
    switch ((method || '').toLowerCase()) {
        case 'cash': return { icon: DollarSign, label: 'Efectivo', color: 'text-success' };
        case 'card': return { icon: CreditCard, label: 'Tarjeta', color: 'text-primary' };
        case 'transfer': return { icon: ArrowLeftRight, label: 'Transferencia', color: 'text-primary' };
        case 'mixed': return { icon: Wallet, label: 'Mixto', color: 'text-warning' };
        case 'wallet': return { icon: Wallet, label: 'Billetera', color: 'text-warning' };
        case 'other': return { icon: CreditCard, label: 'Otro', color: 'text-muted-foreground' };
        default: return { icon: CreditCard, label: 'Sin especificar', color: 'text-muted-foreground' };
    }
}
import { TaxCalculationModal } from './TaxCalculationModal';

const SalesLoadingSkeleton = () => (
  <div className="space-y-4">
    {[...Array(8)].map((_, i) => (
      <Skeleton key={i} className="h-16 w-full rounded-xl" />
    ))}
  </div>
);

// ── Stats Bar ──
const StatsBar = ({ stats }: { stats: { total: number; completed: number; voided: number; totalSales: number } }) => (
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
    <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 text-center">
      <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Total Ventas</div>
      <div className="text-lg font-black text-primary tabular-nums">{stats.total}</div>
    </div>
    <div className="p-3 rounded-xl bg-success/5 border border-success/10 text-center">
      <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Completadas</div>
      <div className="text-lg font-black text-success tabular-nums">{stats.completed}</div>
    </div>
    <div className="p-3 rounded-xl bg-destructive/5 border border-destructive/10 text-center">
      <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Anuladas</div>
      <div className="text-lg font-black text-destructive">{stats.voided}</div>
    </div>
    <div className="p-3 rounded-xl bg-warning/5 border border-warning/10 text-center">
      <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Ingresos</div>
      <div className="text-lg font-black text-warning tabular-nums">{formatCurrency(stats.totalSales)}</div>
    </div>
  </div>
);

// ── Pagination Footer ──
const PaginationFooter = ({ page, totalPages, totalItems, onPageChange }: { page: number; totalPages: number; totalItems: number; onPageChange: (p: number) => void }) => {
    if (totalPages <= 1 && totalItems <= 50) {
        return (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20 text-xs text-muted-foreground">
                <span className="font-bold">{totalItems} {totalItems === 1 ? 'venta' : 'ventas'}</span>
            </div>
        );
    }

    const from = (page - 1) * 50 + 1;
    const to = Math.min(page * 50, totalItems);

    return (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
            <span className="text-xs font-bold text-muted-foreground">
                Mostrando {from}–{to} de {totalItems}
            </span>
            <div className="flex items-center gap-1">
                <button type="button"
                    onClick={() => onPageChange(page - 1)}
                    disabled={page <= 1}
                    className="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    aria-label="Pagina anterior"
                >
                    <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-1 px-2">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum: number;
                        if (totalPages <= 5) {
                            pageNum = i + 1;
                        } else if (page <= 3) {
                            pageNum = i + 1;
                        } else if (page >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                        } else {
                            pageNum = page - 2 + i;
                        }
                        return (
                            <button type="button"
                                key={pageNum}
                                onClick={() => onPageChange(pageNum)}
                                className={cn(
                                    "w-8 h-8 rounded-lg text-xs font-black transition-all",
                                    page === pageNum
                                        ? "bg-primary text-foreground shadow-sm"
                                        : "hover:bg-muted text-muted-foreground"
                                )}
                            >
                                {pageNum}
                            </button>
                        );
                    })}
                </div>
                <button type="button"
                    onClick={() => onPageChange(page + 1)}
                    disabled={page >= totalPages}
                    className="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    aria-label="Pagina siguiente"
                >
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};

export default function SalesHistoryView() {
  const {
    searchTerm,
    setSearchTerm,
    selectedStatus,
    setSelectedStatus,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    hasActiveFilters,
    handleClearFilters,
    selectedTransaction,
    transactions,
    totalFilteredCount,
    isLoading,
    stats,
    page,
    setPage,
    totalPages,
    handleViewDetails,
    handleCloseDetails,
    transactionItems,
    loadingDetails,
    selectedIds,
    toggleSelection,
    toggleAll,
    selectedTransactions,
    isTaxModalOpen,
    setIsTaxModalOpen,
    handleRequestVoid,
    handleConfirmVoid,
    handleCancelVoid,
    voidTarget,
    handleDuplicate,
    handleExportCSV,
    isInverting,
    canVoid
  } = useSalesHistoryView();

  const isMobile = useIsMobile();

  const allIds = transactions.map(t => t.id);
  const isAllSelected = allIds.length > 0 && selectedIds.size === allIds.length;

  // Virtual scrolling
  const parentRef = useRef<HTMLDivElement>(null);
   
  const rowVirtualizer = useVirtualizer({
    count: transactions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 5,
  });

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-[clamp(1.5rem,5vw,2.25rem)] font-black text-foreground tracking-tighter uppercase">Ventas</h2>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Export CSV */}
            <button type="button"
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-4 h-11 border border-border rounded-xl font-black text-xs uppercase tracking-widest hover:bg-muted transition-all active:scale-95"
              title="Exportar a CSV"
              aria-label="Exportar ventas a CSV"
            >
              <Download className="w-4 h-4" />
              {isMobile ? 'CSV' : 'Exportar CSV'}
            </button>
            {/* Tax Calc */}
            {selectedIds.size > 0 && (
              <button type="button"
                onClick={() => setIsTaxModalOpen(true)}
                className="flex items-center gap-2 px-4 h-11 bg-primary text-foreground rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-105 transition-all active:scale-95"
              >
                <Calculator className="w-4 h-4" />
                Impuestos ({selectedIds.size})
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        {!isLoading && totalFilteredCount > 0 && <StatsBar stats={stats} />}

        {/* Search & Filters */}
        <SearchBar
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Buscar por ID, monto o metodo..."
        >
           <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
              {/* Status filter */}
              <div>
                <label htmlFor="sales-status" className="text-xs font-black text-muted-foreground uppercase mb-1 block ml-1">Estado</label>
                <select
                  id="sales-status"
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-border bg-background text-xs font-bold uppercase focus:ring-1 focus:ring-primary outline-none min-h-[44px]"
                >
                  <option value="">Todos</option>
                  <option value="completed">Completada</option>
                  <option value="pending">Pendiente</option>
                  <option value="voided">Anulada</option>
                </select>
              </div>
              {/* Date from */}
              <div>
                <label htmlFor="date-from" className="text-xs font-black text-muted-foreground uppercase mb-1 block ml-1">Desde</label>
                <input
                  id="date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                  className="w-full p-2.5 rounded-lg border border-border bg-background text-xs font-bold focus:ring-1 focus:ring-primary outline-none min-h-[44px]"
                />
              </div>
              {/* Date to */}
              <div>
                <label htmlFor="date-to" className="text-xs font-black text-muted-foreground uppercase mb-1 block ml-1">Hasta</label>
                <input
                  id="date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                  className="w-full p-2.5 rounded-lg border border-border bg-background text-xs font-bold focus:ring-1 focus:ring-primary outline-none min-h-[44px]"
                />
              </div>
           </div>

           {/* Active filters indicator + clear */}
           {hasActiveFilters && (
             <div className="flex items-center justify-between mt-3 px-1">
               <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
                 <Filter className="w-3 h-3" />
                 <span>Filtros activos — {totalFilteredCount} resultado{totalFilteredCount !== 1 ? 's' : ''}</span>
               </div>
               <button type="button"
                 onClick={handleClearFilters}
                 className="flex items-center gap-1 text-xs font-bold text-destructive hover:underline"
               >
                 <X className="w-3 h-3" />
                 Limpiar filtros
               </button>
             </div>
           )}
        </SearchBar>

        <StateRenderer
          isLoading={isLoading}
          error={null}
          data={transactions}
          loadingComponent={<SalesLoadingSkeleton />}
          emptyComponent={
            <div className="text-center py-16 space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-muted">
                <ShoppingCart className="w-8 h-8 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                  {hasActiveFilters ? 'Sin resultados' : 'Sin ventas registradas'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {hasActiveFilters
                    ? 'No se encontraron ventas con los filtros seleccionados. Intenta ajustar los criterios.'
                    : 'Las ventas apareceran aqui despues de confirmar transacciones en el Punto de Venta.'
                  }
                </p>
                {hasActiveFilters && (
                  <button type="button"
                    onClick={handleClearFilters}
                    className="mt-3 text-xs font-black text-primary hover:underline"
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>
            </div>
          }
        >
          {() => (
            <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
              <div className="table-scroll-wrapper">
              {/* Sticky header table */}
              <table className="data-table sticky-column-1 w-full text-sm">
                <thead className="sticky top-0 z-10 bg-background">
                  <tr className="bg-muted/30 text-muted-foreground font-black uppercase text-xs tracking-widest border-b border-border">
                    <th className="p-4 text-center w-10">
                      <div className="inline-flex min-w-[44px] min-h-[44px] items-center justify-center">
                      <button type="button"
                        onClick={() => toggleAll(allIds)}
                        className="text-primary hover:scale-110 transition-transform"
                        aria-label={isAllSelected ? 'Deseleccionar todas' : 'Seleccionar todas'}
                      >
                        {isAllSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                      </button>
                      </div>
                    </th>
                    <th className="p-4 text-left">Ref</th>
                    <th className="p-4 text-left">Fecha</th>
                    <th className="p-4 text-left priority-low hidden sm:table-cell">Metodo</th>
                    <th className="p-4 text-right">Total</th>
                    <th className="p-4 text-center priority-low hidden sm:table-cell">Estado</th>
                    <th className="p-4 text-center">Acciones</th>
                  </tr>
                </thead>
              </table>

              {/* Virtualized body */}
              <div ref={parentRef} className="overflow-auto" style={{ maxHeight: 'calc(100vh - 420px)' }}>
                <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const txn = transactions[virtualRow.index];
                    const isVoided = txn.status === 'voided';
                    return (
                      <div
                        key={virtualRow.key}
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        <table className="data-table sticky-column-1 w-full text-sm">
                          <tbody>
                            <tr className={cn(
                                "border-b border-border/50 hover:bg-muted/20 transition-colors",
                                selectedIds.has(txn.id) && "bg-primary/5",
                                isVoided && "opacity-60"
                            )}>
                              <td className="p-4 text-center">
                                <div className="inline-flex min-w-[44px] min-h-[44px] items-center justify-center">
                                <button type="button"
                                  onClick={() => toggleSelection(txn.id)}
                                  className={cn(
                                    "transition-all",
                                    selectedIds.has(txn.id) ? "text-primary scale-110" : "text-muted-foreground/30"
                                  )}
                                  aria-label={selectedIds.has(txn.id) ? 'Deseleccionar venta' : 'Seleccionar venta'}
                                >
                                  {selectedIds.has(txn.id) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                                </button>
                                </div>
                              </td>
                              <td className="p-4 font-bold text-xs text-primary">{(txn.id as string).split('-')[0]}</td>
                              <td className="p-4">
                                <div className="font-bold text-xs">{formatDate(txn.created_at as any)}</div>
                                <div className="text-xs text-muted-foreground">{formatTime(txn.created_at as any)}</div>
                              </td>
                              <td className="p-4 priority-low hidden sm:table-cell">
                                <div className="flex items-center gap-2">
                                  {(() => {
                                    const pm = getPaymentMethodInfo(txn.payment_method as any);
                                    const PmIcon = pm.icon;
                                    return <PmIcon className={cn("w-3 h-3", pm.color)} />;
                                  })()}
                                  <span className="text-xs font-bold uppercase">
                                    {getPaymentMethodInfo(txn.payment_method as any).label}
                                  </span>
                                </div>
                              </td>
                              <td className="p-4 text-right">
                                <span className={cn(
                                  "text-base font-black tabular-nums",
                                  isVoided ? "line-through text-muted-foreground" : ""
                                )}>{formatCurrency(txn.total_amount as any)}</span>
                              </td>
                              <td className="p-4 text-center priority-low hidden sm:table-cell">
                                <span className={cn(
                                  "inline-flex items-center px-2 py-0.5 rounded text-xs font-black uppercase",
                                  txn.status === 'completed' ? "bg-success/10 text-success" :
                                  txn.status === 'pending' ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive"
                                )}>
                                  {txn.status === 'completed' ? 'Completada' :
                                   txn.status === 'pending' ? 'Pendiente' : 'Anulada'}
                                </span>
                              </td>
                              <td className="p-4 text-center" aria-label="Acciones de la venta">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button type="button"
                                    onClick={() => handleViewDetails(txn as any)}
                                    className="w-11 h-11 inline-flex items-center justify-center rounded-lg border border-border hover:bg-primary hover:text-foreground transition-all active:scale-95"
                                    title="Ver detalles"
                                    aria-label="Ver detalles de la venta"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>

                                  {canVoid && (
                                    <button type="button"
                                      onClick={() => handleRequestVoid(txn as any)}
                                      disabled={isVoided || isInverting}
                                      className={cn(
                                        "w-11 h-11 inline-flex items-center justify-center rounded-lg border transition-all active:scale-95",
                                        isVoided
                                          ? "border-border opacity-30 cursor-not-allowed"
                                          : "border-border hover:bg-destructive hover:text-foreground"
                                      )}
                                      title={isVoided ? "Venta ya anulada" : "Anular Venta"}
                                      aria-label={isVoided ? "Venta ya anulada" : "Anular venta"}
                                    >
                                      <RefreshCcw className={cn("w-4 h-4", isInverting && "animate-spin")} />
                                    </button>
                                  )}

                                  <button type="button"
                                    onClick={() => handleDuplicate(txn as any)}
                                    className="w-11 h-11 inline-flex items-center justify-center rounded-lg border border-border hover:bg-warning hover:text-foreground transition-all active:scale-95"
                                    title="Duplicar Venta"
                                    aria-label="Duplicar venta"
                                  >
                                    <Copy className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Pagination Footer */}
              <PaginationFooter
                page={page}
                totalPages={totalPages}
                totalItems={totalFilteredCount}
                onPageChange={setPage}
              />
            </div>
            </div>
          )}
        </StateRenderer>
      </div>

      {/* Transaction Details Modal */}
      <TransactionDetailsModal
        transaction={selectedTransaction as any}
        isOpen={!!selectedTransaction}
        onClose={handleCloseDetails}
        items={transactionItems as any}
        isLoading={loadingDetails}
      />

      {/* Void Confirmation Modal */}
      <BaseModal
        open={!!voidTarget}
        onOpenChange={(open) => { if (!open) handleCancelVoid(); }}
        title={
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-6 h-6" />
            <span>Confirmar Anulacion</span>
          </div>
        }
        footer={
          <>
            <SecondaryButton
              label="No, Volver"
              onClick={handleCancelVoid}
              className="flex-1"
            />
            <PrimaryButton
              label="Si, Anular Venta"
              onClick={handleConfirmVoid}
              disabled={isInverting}
              className="flex-1 !bg-destructive hover:!bg-destructive/90 text-white shadow-destructive/20"
            />
          </>
        }
      >
        <div className="py-4 space-y-4">
          <p className="font-bold text-center text-sm">
            Estas seguro de que deseas <span className="text-destructive uppercase">anular</span> esta venta?
          </p>
          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            Esta accion es <span className="font-bold text-foreground">irreversible</span>. La venta sera marcada como anulada,
            los productos seran devueltos al inventario y se registrara un movimiento de stock.
          </p>

          {voidTarget && (
            <div className="rounded-xl bg-muted/50 border border-border p-4 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-muted-foreground uppercase">Referencia</span>
                <span className="text-xs font-black text-primary">{voidTarget.id.split('-')[0]}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-muted-foreground uppercase">Fecha</span>
                <span className="text-xs font-black">{formatDate(voidTarget.created_at)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-muted-foreground uppercase">Metodo</span>
                <span className="text-xs font-black uppercase">
                  {getPaymentMethodInfo(voidTarget.payment_method).label}
                </span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-border">
                <span className="text-xs font-black uppercase">Total</span>
                <span className="text-lg font-black text-primary tabular-nums">{formatCurrency(voidTarget.total_amount)}</span>
              </div>
            </div>
          )}
        </div>
      </BaseModal>

      {/* Tax Calculation Modal */}
      <TaxCalculationModal
        isOpen={isTaxModalOpen}
        onClose={() => setIsTaxModalOpen(false)}
        selectedTransactions={selectedTransactions as any}
      />
    </>
  );
}
