'use client';

import React, { useState, useMemo, useRef } from 'react';
import { Shield, Filter, Download, ChevronDown, Search, Eye } from 'lucide-react';
import { cn, formatDate, formatTime } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { useStores } from '@/hooks/api/useStores';
import { useAuditLogs, AUDIT_ACTION_LABELS, AuditLogEntry } from '@/hooks/api/useAuditLogs';
import { Skeleton } from '@/components/ui/skeleton';
import { StateRenderer } from '@/components/ui/StateRenderer';
import { useVirtualizer } from '@tanstack/react-virtual';

function AuditRow({ entry }: { entry: AuditLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const actionLabel = AUDIT_ACTION_LABELS[entry.action] || entry.action;
  const severityColor = entry.action.includes('reset')
    ? 'text-destructive'
    : entry.action.includes('void') || entry.action.includes('cancelled')
    ? 'text-amber-600'
    : entry.action.includes('confirmed')
    ? 'text-green-600'
    : 'text-muted-foreground';

  return (
    <>
      <tr className="border-b border-border hover:bg-muted/30 transition-colors">
        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
          <div>{formatDate(entry.created_at)}</div>
          <div className="text-[10px]">{formatTime(entry.created_at)}</div>
        </td>
        <td className={cn('px-4 py-3 text-xs font-black uppercase tracking-tight', severityColor)}>
          {actionLabel}
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground">
          {entry.profiles?.full_name || entry.profiles?.email || entry.user_id.slice(0, 8) + '...'}
        </td>
        <td className="px-4 py-3">
          <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground">
            {entry.record_id?.slice(0, 8)}...
          </code>
        </td>
        <td className="px-4 py-3">
          <button
            onClick={() => setExpanded(p => !p)}
            aria-label={expanded ? 'Colapsar detalles' : 'Ver detalles del evento'}
            aria-expanded={expanded}
            className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-primary hover:underline"
          >
            <Eye className="w-3 h-3" />
            {expanded ? 'Ocultar' : 'Ver'}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border bg-muted/20" aria-label="Detalles expandidos del evento">
          <td colSpan={5} className="px-4 py-3">
            <pre className="text-[10px] font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap max-h-48">
              {JSON.stringify(entry.metadata, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
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

  const { data: stores = [] } = useStores(user?.id || '', isAdmin, isEncargado);
  const storeIds = useMemo(
    () => storeFilter ? [storeFilter] : stores.map(s => s.id),
    [stores, storeFilter]
  );

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useAuditLogs({ storeIds, action: actionFilter || undefined, dateFrom, dateTo });

  const allLogs = useMemo(
    () => data?.pages.flatMap(p => p.logs) ?? [],
    [data]
  );

  const totalCount = data?.pages[0]?.total ?? 0;

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
    const headers = ['Fecha', 'Hora', 'Acción', 'Usuario', 'Registro', 'Tienda'];
    const rows = filteredLogs.map(log => [
      formatDate(log.created_at),
      formatTime(log.created_at),
      AUDIT_ACTION_LABELS[log.action] || log.action,
      log.profiles?.full_name || log.user_id,
      log.record_id,
      log.store_id,
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_log_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Virtual scrolling
  const parentRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: filteredLogs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 52,
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
            <h2 className="font-black text-sm uppercase tracking-tight">Auditoría Global</h2>
            <p className="text-[10px] text-muted-foreground">
              {totalCount.toLocaleString()} registro{totalCount !== 1 ? 's' : ''} encontrado{totalCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <button
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
            placeholder="Buscar por usuario, registro..."
            aria-label="Buscar en el historial de auditoría"
            className="bg-transparent text-xs w-full outline-none placeholder:text-muted-foreground"
          />
        </div>

        <select
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          aria-label="Filtrar por tipo de acción"
          className="px-3 py-2 rounded-xl border border-border bg-background text-xs font-black uppercase tracking-tight outline-none"
        >
          <option value="">Todas las acciones</option>
          {Object.entries(AUDIT_ACTION_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
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
        loadingComponent={
          <div className="space-y-2">
            {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
          </div>
        }
        isEmpty={!isLoading && filteredLogs.length === 0}
        emptyMessage="No se encontraron registros de auditoría con los filtros aplicados."
        data={filteredLogs}
      >
        {() => (
          <div className="rounded-2xl border border-border overflow-hidden">
            {/* Sticky header */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Historial de auditoría">
                <thead className="bg-muted/40 sticky top-0 z-10">
                  <tr>
                    {['Fecha/Hora', 'Acción', 'Usuario', 'Registro ID', 'Detalles'].map(col => (
                      <th
                        key={col}
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
                          <AuditRow entry={log} />
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
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            aria-label="Cargar más registros de auditoría"
            className="px-6 py-3 rounded-xl border border-border text-xs font-black uppercase tracking-widest hover:bg-muted transition-colors disabled:opacity-40"
          >
            {isFetchingNextPage ? 'Cargando...' : `Cargar más (${totalCount - filteredLogs.length} restantes)`}
          </button>
        </div>
      )}
    </div>
  );
}
