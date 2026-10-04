'use client';

/**
 * AuditGlobalView — Auditoría (Inicio → Operación → Auditoría).
 *
 * DASHBOARD V3 (feat/dashboard-v3-audit-ux — FASE 7/8/13/14/17):
 *
 * ANTES: tabla técnica (acción cruda `UPDATE_STORE_CONFIG`, usuario 'sistema',
 * hash `bd247564...` como columna principal, JSON crudo al expandir).
 *
 * AHORA (principio: "La interfaz debe hablar el idioma del negocio; la
 * trazabilidad técnica debe seguir existiendo detrás"):
 *   - Columnas: Fecha/Hora · Evento (título de negocio) · Realizado por · Ver.
 *   - El hash (record_id) sale de la tabla principal → vive en
 *     "Detalles técnicos" del modal (FASE 7: no es información principal).
 *   - 'Ver' abre AuditEventDetailModal: explicación de negocio + detalles
 *     técnicos colapsados + documento asociado SOLO si existe relación real.
 *   - Filtros con etiquetas de negocio (FASE 13); la búsqueda libre conserva
 *     el filtrado técnico (código de acción, referencia, metadatos) para
 *     soporte.
 *   - Estados: loading (skeleton), error (toast + StateRenderer), vacío y
 *     sin resultados por filtros (FASE 14) — sin datos fabricados.
 *   - Virtualización y paginación intactas (rendimiento certificado).
 *   - Tokens semánticos únicamente — compatible Dark/Light/Performance
 *     (FASE 16), sin colores hardcodeados.
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Shield, Download, Search, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatDate, formatTime } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { useStores } from '@/hooks/api/useStores';
import { useAuditLogs, AuditLogEntry } from '@/hooks/api/useAuditLogs';
import { Skeleton } from '@/components/ui/skeleton';
import { StateRenderer } from '@/components/ui/StateRenderer';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  getAuditEventPresentation,
  getActorLabel,
  AUDIT_FILTER_OPTIONS,
  resolveAuditFilterActions,
} from '@/lib/audit/eventPresentation';
import { AuditEventDetailModal } from './AuditEventDetailModal';

function AuditRow({
  entry,
  storeName,
  onView,
}: {
  entry: AuditLogEntry;
  storeName?: string;
  onView: (entry: AuditLogEntry) => void;
}) {
  const presentation = getAuditEventPresentation(entry);
  const actor = getActorLabel(entry);

  const severityColor =
    presentation.severity === 'danger'
      ? 'text-destructive'
      : presentation.severity === 'warning'
      ? 'text-warning'
      : presentation.severity === 'success'
      ? 'text-success'
      : 'text-foreground';

  return (
    <tr className="border-b border-border hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
        <div>{formatDate(entry.created_at)}</div>
        <div className="text-[10px]">{formatTime(entry.created_at)}</div>
      </td>
      <td className="px-4 py-3 text-sm">
        <span className={cn('font-semibold leading-snug', severityColor)}>
          {presentation.title}
        </span>
        {storeName && (
          <span className="block text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wider">
            {storeName}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {actor}
      </td>
      <td className="px-4 py-3">
        <button type="button"
          onClick={() => onView(entry)}
          aria-label={`Ver detalles de: ${presentation.title}`}
          className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-primary hover:underline"
        >
          <Eye className="w-3 h-3" aria-hidden="true" />
          Ver
        </button>
      </td>
    </tr>
  );
}

export default function AuditGlobalView() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const isEncargado = user?.role === 'encargado' || user?.role === 'manager';

  const [actionFilter, setActionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [searchText, setSearchText] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);

  const { data: stores = [], error: storesError } = useStores(user?.id || '', isAdmin, isEncargado);
  const storeIds = useMemo(
    () => storeFilter ? [storeFilter] : stores.map(s => s.id),
    [stores, storeFilter]
  );

  const {
    data,
    isLoading,
    error: auditError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useAuditLogs({
    storeIds,
    // REMEDIACIÓN: la opción de filtro resuelve a su grupo de acciones
    // (p.ej. "Venta realizada" → CREATE_SALE_V2 + CREATE_SALE); opciones sin
    // grupo resuelven a su acción única — comportamiento previo intacto.
    action: actionFilter
      ? resolveAuditFilterActions(AUDIT_FILTER_OPTIONS.find(o => o.value === actionFilter)!)
      : undefined,
    dateFrom,
    dateTo,
  });

  // FIX-AUDIT-LOAD (2026-07-12): mostrar errores al usuario en vez de silenciarlos.
  useEffect(() => {
    if (storesError) {
      toast.error('Error al cargar tiendas: ' + (storesError.message || 'desconocido'));
    }
  }, [storesError]);

  useEffect(() => {
    if (auditError) {
      toast.error('Error al cargar Auditoría: ' + (auditError.message || 'desconocido'));
    }
  }, [auditError]);

  // Determinar si hay un error real para mostrar en el StateRenderer
  const displayError = storesError || auditError;

  const allLogs = useMemo(
    () => data?.pages.flatMap(p => p.logs) ?? [],
    [data]
  );

  const totalCount = data?.pages[0]?.total ?? 0;

  const storeNameById = useMemo(
    () => new Map(stores.map(s => [s.id, s.name])),
    [stores]
  );

  const filteredLogs = useMemo(() => {
    if (!searchText) return allLogs;
    const q = searchText.toLowerCase();
    return allLogs.filter(log =>
      log.action.includes(q) ||
      (log.record_id && log.record_id.toLowerCase().includes(q)) ||
      (log.profiles?.full_name && log.profiles.full_name.toLowerCase().includes(q)) ||
      JSON.stringify(log.metadata).toLowerCase().includes(q)
    );
  }, [allLogs, searchText]);

  const handleExportCSV = () => {
    const headers = ['Fecha', 'Hora', 'Evento', 'Realizado por', 'Referencia', 'Tienda'];
    const rows = filteredLogs.map(log => {
      const presentation = getAuditEventPresentation(log);
      return [
        formatDate(log.created_at),
        formatTime(log.created_at),
        presentation.title,
        getActorLabel(log),
        log.record_id,
        storeNameById.get(log.store_id) || log.store_id,
      ];
    });
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_log_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Virtual scrolling (intacto — rendimiento certificado)
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: filteredLogs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 5,
  });

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-black text-sm uppercase tracking-tight">Auditoría</h2>
            <p className="text-[10px] text-muted-foreground">
              {totalCount.toLocaleString()} evento{totalCount !== 1 ? 's' : ''} registrado{totalCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <button type="button"
          onClick={handleExportCSV}
          disabled={filteredLogs.length === 0}
          aria-label="Exportar registros de auditoría como CSV"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-xs font-black uppercase tracking-widest hover:bg-muted transition-colors disabled:opacity-40"
        >
          <Download className="w-4 h-4" />
          Exportar CSV
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-background flex-1 min-w-48">
          <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <input
            type="text"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="Buscar por usuario, acción o referencia…"
            aria-label="Buscar en el historial de auditoría"
            className="bg-transparent text-xs w-full outline-none placeholder:text-muted-foreground"
          />
        </div>

        <select
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          aria-label="Filtrar por tipo de evento"
          className="px-3 py-2 rounded-xl border border-border bg-background text-xs font-black uppercase tracking-tight outline-none"
        >
          <option value="">Todos los eventos</option>
          {AUDIT_FILTER_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        {stores.length > 1 && (
          <select
            value={storeFilter}
            onChange={e => setStoreFilter(e.target.value)}
            aria-label="Filtrar por tienda"
            className="px-3 py-2 rounded-xl border border-border bg-background text-xs font-black uppercase tracking-tight outline-none"
          >
            <option value="">Todas las tiendas</option>
            {stores.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}

        <input
          type="date"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          aria-label="Fecha desde"
          className="px-3 py-2 rounded-xl border border-border bg-background text-xs outline-none"
        />
        <input
          type="date"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          aria-label="Fecha hasta"
          className="px-3 py-2 rounded-xl border border-border bg-background text-xs outline-none"
        />
      </div>

      <StateRenderer
        isLoading={isLoading}
        error={displayError}
        loadingComponent={
          <div className="space-y-2">
            {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
          </div>
        }
        isEmpty={!isLoading && !displayError && filteredLogs.length === 0}
        emptyMessage="No se encontraron eventos con los filtros aplicados."
        data={filteredLogs}
      >
        {() => (
          <div className="rounded-2xl border border-border overflow-hidden">
            {/* Sticky header */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Historial de actividad de la operación">
                <thead className="bg-muted/40 sticky top-0 z-10">
                  <tr>
                    {['Fecha/Hora', 'Evento', 'Realizado por', ''].map(col => (
                      <th
                        key={col || 'actions'}
                        scope="col"
                        className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
              </table>
            </div>
            {/* Virtualized body */}
            <div ref={parentRef} className="overflow-auto" style={{ maxHeight: '500px' }}>
              <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const log = filteredLogs[virtualRow.index];
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
                      <table className="w-full text-sm">
                        <tbody>
                          <AuditRow
                            entry={log}
                            storeName={storeNameById.get(log.store_id)}
                            onView={setSelectedEntry}
                          />
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </StateRenderer>

      {hasNextPage && (
        <div className="flex justify-center pt-4">
          <button type="button"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            aria-label="Cargar más registros de auditoría"
            className="px-6 py-3 rounded-xl border border-border text-xs font-black uppercase tracking-widest hover:bg-muted transition-colors disabled:opacity-40"
          >
            {isFetchingNextPage ? 'Cargando...' : `Cargar más (${totalCount - filteredLogs.length} restantes)`}
          </button>
        </div>
      )}

      {/* Modal de detalle — explicación de negocio + trazabilidad técnica */}
      <AuditEventDetailModal
        entry={selectedEntry}
        storeName={selectedEntry ? storeNameById.get(selectedEntry.store_id) : undefined}
        isOpen={selectedEntry !== null}
        onClose={() => setSelectedEntry(null)}
      />
    </div>
  );
}
