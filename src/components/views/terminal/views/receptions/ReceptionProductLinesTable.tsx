'use client';

/**
 * MISIÓN RECEPCIONES — Pestaña "Productos" (2026-10-28)
 * =====================================================
 * Segunda perspectiva de la vista Recepciones: el detalle por productos.
 *
 * Cada fila es una LÍNEA de producto de un documento de recepción real
 * (receipt_items), con su documento, fecha, proveedor, cantidades, precios
 * e importes tal cual están almacenados. NO modifica documentos, inventario
 * ni contabilidad: es una vista de solo lectura.
 *
 * Principios respetados (misión §3-§6):
 *  - Misma fuente de datos y misma lógica de importe que ReceptionDetailsModal
 *    (quantity * unit_cost, moneda_recepcion con default CUP).
 *  - Trazabilidad: cada línea conserva su documento de origen y permite
 *    abrirlo reutilizando el modal de detalles existente y sus permisos.
 *  - Filtros combinables (AND): SKU/producto/documento/proveedor/factura +
 *    estado + rango de fechas — paridad con la pestaña Documentos.
 *  - Rendimiento: paginación client-side (50 filas/página) sobre un único
 *    fetch con joins embebidos (sin N+1).
 *  - Responsive: columnas secundarias ocultas en móvil (patrón de la vista).
 */

import React, { useMemo, useState } from 'react';
import { Calendar, Building2, FileText, Package, Eye, Download, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { cn, formatCurrency, formatDate, formatTime } from '@/lib/utils';
import SearchBar from '@/components/ui/SearchBar';
import { StateRenderer } from '@/components/ui/StateRenderer';
import { Skeleton } from '@/components/ui/skeleton';
import { DocumentStatusBadge } from '@/components/ui/DocumentStatusBadge';
import { toast } from 'sonner';
import { useReceptionProductLines } from '@/hooks/api/useReceptions';
import {
  computeLineMoney,
  filterProductLines,
  paginateProductLines,
  toProductLinesExcelRows,
  PRODUCT_LINES_PAGE_SIZE,
  type ReceptionProductLine,
} from '@/lib/receptions/product-lines';

interface ReceptionProductLinesTableProps {
  storeId?: string | null;
  /** Abre el documento de origen reutilizando el modal de detalles (y sus permisos). */
  onViewDocument: (receiptId: string) => void;
}

const ProductLinesLoadingSkeleton = () => (
  <div className="space-y-4">
    {[...Array(8)].map((_, i) => (
      <Skeleton key={i} className="h-12 w-full rounded-xl" />
    ))}
  </div>
);

export default function ReceptionProductLinesTable({ storeId, onViewDocument }: ReceptionProductLinesTableProps) {
  // ── Filtros propios de la pestaña (independientes de Documentos) ──
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const { data: lines = [], isLoading, error, refetch } = useReceptionProductLines(storeId);

  const hasActiveFilters = !!(searchTerm || selectedStatus || dateFrom || dateTo);

  const filteredLines = useMemo(() => {
    return filterProductLines(lines as ReceptionProductLine[], {
      search: searchTerm,
      status: selectedStatus,
      dateFrom,
      dateTo,
    });
  }, [lines, searchTerm, selectedStatus, dateFrom, dateTo]);

  const { rows, total, totalPages, page: safePage } = useMemo(
    () => paginateProductLines(filteredLines, page),
    [filteredLines, page]
  );

  // ── Resumen (sin mezclar monedas: totales por moneda) ──
  const summary = useMemo(() => {
    const docs = new Set<string>();
    const perCurrency = new Map<string, number>();
    for (const line of filteredLines) {
      docs.add(line.receipt_id);
      const money = computeLineMoney(line);
      perCurrency.set(money.currency, (perCurrency.get(money.currency) || 0) + money.lineAmount);
    }
    return { docCount: docs.size, perCurrency: [...perCurrency.entries()] };
  }, [filteredLines]);

  const handleFilterChange = <T,>(setter: (v: T) => void) => (value: T) => {
    setter(value);
    setPage(1); // cualquier cambio de filtro reinicia la paginación
  };

  const handleExportExcel = async () => {
    if (filteredLines.length === 0) {
      toast.error('No hay líneas para exportar');
      return;
    }
    try {
      const toastId = toast.loading('Preparando Excel de productos recibidos...');
      const XLSX = await import('@e965/xlsx');
      const worksheet = XLSX.utils.json_to_sheet(toProductLinesExcelRows(filteredLines));
      worksheet['!cols'] = [
        { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 24 }, { wch: 11 },
        { wch: 16 }, { wch: 32 }, { wch: 10 }, { wch: 8 }, { wch: 14 },
        { wch: 14 }, { wch: 14 }, { wch: 10 },
      ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Productos');
      XLSX.writeFile(workbook, `recepciones-productos-${Date.now()}.xlsx`);
      toast.success('Productos exportados a Excel', { id: toastId });
    } catch (error) {
      toast.error('Error al exportar a Excel');
    }
  };

  return (
    <div className="space-y-4">
      {/* Búsqueda + filtros avanzados (mismo patrón que Documentos) */}
      <SearchBar
        value={searchTerm}
        onChange={handleFilterChange(setSearchTerm)}
        placeholder="Buscar por SKU, producto, documento, proveedor o factura..."
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
          <div>
            <label htmlFor="product-line-status" className="text-xs font-black text-muted-foreground uppercase mb-1 block ml-1">Estado del documento</label>
            <select
              id="product-line-status"
              value={selectedStatus}
              onChange={(e) => handleFilterChange(setSelectedStatus)(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-border bg-background text-xs font-bold uppercase focus:ring-1 focus:ring-primary outline-none"
            >
              <option value="">Todos</option>
              <option value="active">Confirmada</option>
              <option value="voided">Anulada</option>
              <option value="pending">Pendiente</option>
              <option value="partial">Parcial</option>
              <option value="reversed">Revertida</option>
            </select>
          </div>
          <div>
            <label htmlFor="product-line-from" className="text-xs font-black text-muted-foreground uppercase mb-1 block ml-1">Desde</label>
            <input
              id="product-line-from"
              type="date"
              aria-label="Fecha desde"
              value={dateFrom}
              onChange={(e) => handleFilterChange(setDateFrom)(e.target.value)}
              className="w-full p-2 rounded-lg border border-border bg-background text-xs font-bold uppercase focus:ring-1 focus:ring-primary outline-none"
            />
          </div>
          <div>
            <label htmlFor="product-line-to" className="text-xs font-black text-muted-foreground uppercase mb-1 block ml-1">Hasta</label>
            <input
              id="product-line-to"
              type="date"
              aria-label="Fecha hasta"
              value={dateTo}
              onChange={(e) => handleFilterChange(setDateTo)(e.target.value)}
              className="w-full p-2 rounded-lg border border-border bg-background text-xs font-bold uppercase focus:ring-1 focus:ring-primary outline-none"
            />
          </div>
        </div>
      </SearchBar>

      {/* Resumen de la consulta — trazabilidad sin mezclar monedas */}
      {total > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-muted-foreground" data-testid="product-lines-summary">
          <span className="px-2.5 py-1 rounded-lg bg-muted/40 border border-border">
            {total} línea{total === 1 ? '' : 's'}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-muted/40 border border-border">
            {summary.docCount} documento{summary.docCount === 1 ? '' : 's'}
          </span>
          {summary.perCurrency.map(([currency, amount]) => (
            <span key={currency} className="px-2.5 py-1 rounded-lg bg-primary/5 border border-primary/20 text-primary">
              Σ {currency}: {formatCurrency(amount, currency)}
            </span>
          ))}
          <button
            type="button"
            onClick={handleExportExcel}
            className="ml-auto inline-flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground font-black text-xs uppercase tracking-widest transition-all active:scale-95"
            aria-label="Exportar productos filtrados a Excel"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Exportar</span>
          </button>
        </div>
      )}

      <div className="table-scroll-wrapper">
        <StateRenderer
          isLoading={isLoading}
          error={error ?? null}
          onRetry={() => refetch()}
          data={lines}
          loadingComponent={<ProductLinesLoadingSkeleton />}
          emptyComponent={
            <div className="text-center py-16 space-y-3">
              <Package className="w-10 h-10 mx-auto text-muted-foreground/30" aria-hidden="true" />
              <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                {hasActiveFilters ? 'Sin resultados' : 'Sin líneas de productos'}
              </p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                {hasActiveFilters
                  ? 'No se encontraron líneas de producto con los filtros seleccionados. Intenta ajustar los criterios.'
                  : 'Cuando registres recepciones (o confirmes las pendientes), sus productos aparecerán aquí automáticamente.'}
              </p>
              {hasActiveFilters && (
                <button type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedStatus('');
                    setDateFrom('');
                    setDateTo('');
                    setPage(1);
                  }}
                  className="mt-3 px-4 py-2 text-xs font-bold uppercase border border-border rounded-lg hover:bg-muted transition-all"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          }
        >
          {() => (
            <table className="data-table sticky-column-1 w-full text-sm" data-testid="product-lines-table">
              <thead>
                <tr className="bg-muted/30 text-muted-foreground font-black uppercase text-xs tracking-widest border-b border-border">
                  <th className="p-4 text-left">Documento</th>
                  <th className="p-4 text-left">Fecha</th>
                  <th className="p-4 text-left hidden sm:table-cell">Proveedor</th>
                  <th className="p-4 text-left">SKU / Producto</th>
                  <th className="p-4 text-right">Cantidad</th>
                  <th className="p-4 text-right hidden sm:table-cell">Precio unit.</th>
                  <th className="p-4 text-right">Importe</th>
                  <th className="p-4 text-center priority-low hidden sm:table-cell">Estado</th>
                  <th className="p-4 text-center">Acción</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((line) => {
                  const money = computeLineMoney(line);
                  return (
                    <tr
                      key={line.id}
                      className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                      data-testid={`product-line-row-${line.id.slice(0, 8)}`}
                    >
                      {/* Documento de origen — trazabilidad 1:1 con la pestaña Documentos */}
                      <td className="p-4">
                        <button
                          type="button"
                          onClick={() => onViewDocument(line.receipt_id)}
                          className="font-bold text-xs text-primary hover:underline text-left"
                          title={`Abrir documento de recepción`}
                        >
                          {line.receipt_id.split('-')[0]}
                        </button>
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <FileText className="w-3 h-3" />
                          <span className="truncate max-w-[110px]">{line.receipts.reference_doc || 'S/N'}</span>
                        </div>
                      </td>
                      {/* Fecha del documento (misma que muestra Documentos) */}
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3 h-3 text-muted-foreground" />
                          <div className="font-bold text-xs">{formatDate(line.receipts.reception_date || line.receipts.created_at)}</div>
                        </div>
                        <div className="text-xs text-muted-foreground ml-5">{formatTime(line.receipts.created_at)}</div>
                      </td>
                      {/* Proveedor del documento */}
                      <td className="p-4 hidden sm:table-cell">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs font-bold uppercase truncate max-w-[130px]">{line.receipts.supplier || 'S/N'}</span>
                        </div>
                      </td>
                      {/* SKU + producto — sin perder legibilidad */}
                      <td className="p-4">
                        <div className="font-bold text-xs truncate max-w-[220px]">{line.products?.name || 'Producto'}</div>
                        <div className="text-xs font-mono text-muted-foreground">{line.products?.sku || '—'}</div>
                      </td>
                      {/* Cantidad — valor almacenado, sin redondeo */}
                      <td className="p-4 text-right font-black tabular-nums text-xs">{line.quantity}</td>
                      {/* Precio unitario en la moneda almacenada de la línea */}
                      <td className="p-4 text-right hidden sm:table-cell">
                        <div className="text-xs font-bold text-muted-foreground tabular-nums">
                          {formatCurrency(money.unitPrice, money.currency)}
                        </div>
                        {money.tasa !== null && (
                          <div className="text-[10px] text-muted-foreground/70 tabular-nums">tasa {money.tasa}</div>
                        )}
                      </td>
                      {/* Importe = quantity * unit_cost (lógica del modal de detalles).
                          Para moneda extranjera con tasa real se añade el equivalente CUP
                          (misma fórmula del total del documento) como sub-línea informativa. */}
                      <td className="p-4 text-right">
                        <div className="text-sm font-black text-primary tabular-nums">
                          {formatCurrency(money.lineAmount, money.currency)}
                        </div>
                        {money.cupEquivalent !== null && (
                          <div className="text-[10px] text-muted-foreground tabular-nums">
                            ≈ {formatCurrency(money.cupEquivalent, 'CUP')}
                          </div>
                        )}
                      </td>
                      {/* Estado del documento de origen — coherencia entre pestañas */}
                      <td className="p-4 text-center priority-low hidden sm:table-cell">
                        <DocumentStatusBadge type="receipt" status={line.receipts.status} />
                      </td>
                      {/* Abrir documento de origen (mismos permisos que Documentos) */}
                      <td className="p-4 text-center">
                        <button type="button"
                          onClick={() => onViewDocument(line.receipt_id)}
                          className="w-11 h-11 inline-flex items-center justify-center rounded-lg border border-border hover:bg-primary hover:text-foreground transition-all active:scale-95"
                          title="Ver documento de recepción"
                          aria-label={`Ver documento ${line.receipt_id.split('-')[0]}`}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </StateRenderer>
      </div>

      {/* Paginación client-side — rendimiento estable con muchas líneas */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 pt-1" data-testid="product-lines-pagination">
          <span className="text-xs font-bold text-muted-foreground tabular-nums">
            Página {safePage} de {totalPages} · {total} líneas
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="w-11 h-11 inline-flex items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-40 disabled:pointer-events-none transition-all active:scale-95"
              aria-label="Página anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="w-11 h-11 inline-flex items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-40 disabled:pointer-events-none transition-all active:scale-95"
              aria-label="Página siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
