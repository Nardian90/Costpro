// src/components/views/terminal/views/transfers/TransferenciasView.tsx
'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useAuthStore } from '@/store';
import {
  ArrowLeftRight,
  ArrowUpRight,
  ArrowDownLeft,
  Plus,
  RefreshCcw,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  Download,
} from 'lucide-react';
import {
  useIncomingTransfers,
  useOutgoingTransfers,
} from '@/hooks/api/useTransfers';
import ActionMenu, { Action } from '@/components/ui/ActionMenu';
import { StateRenderer } from '@/components/ui/StateRenderer';
import { cn } from '@/lib/utils';
import { format, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { Transfer, TransferStatus } from '@/types';
import CreateTransferModal from './CreateTransferModal';
import TransferDetailsModal from './TransferDetailsModal';
import { useDebounce } from '@/hooks/ui/useDebounce';
import { toast } from 'sonner';
import { useCallback } from 'react';

const STATUS_OPTIONS: { value: TransferStatus | 'TODOS'; label: string; icon: typeof Clock }[] = [
  { value: 'TODOS', label: 'Todos', icon: ArrowLeftRight },
  { value: 'PENDIENTE', label: 'Pendiente', icon: Clock },
  { value: 'CONFIRMADA', label: 'Confirmada', icon: CheckCircle2 },
  { value: 'CANCELADA', label: 'Cancelada', icon: XCircle },
];

export default function TransferenciasView() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'outgoing' | 'incoming'>('outgoing');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTransferId, setSelectedTransferId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeStatus, setActiveStatus] = useState<TransferStatus | 'TODOS'>('TODOS');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const fetchNextRef = useRef<() => void>(() => {});
  const hasNextRef = useRef(false);
  const isFetchingNextRef = useRef(false);

  const statusFilter = activeStatus !== 'TODOS' ? activeStatus : null;

  const incomingQuery = useIncomingTransfers(user?.activeStoreId, statusFilter);
  const outgoingQuery = useOutgoingTransfers(user?.activeStoreId, statusFilter);
  const currentQuery = activeTab === 'incoming' ? incomingQuery : outgoingQuery;

  // Mantener refs sincronizados para IntersectionObserver sin recrearlo
  fetchNextRef.current = currentQuery.fetchNextPage;
  hasNextRef.current = currentQuery.hasNextPage ?? false;
  isFetchingNextRef.current = currentQuery.isFetchingNextPage ?? false;

  // Aplanar páginas del InfiniteQuery
  const allTransfers = useMemo((): Transfer[] => {
    if (!currentQuery.data?.pages) return [];
    return currentQuery.data.pages.flatMap((p) => p.transfers);
  }, [currentQuery.data]);

  // Búsqueda client-side (por tienda, solicitante, notas, ID)
  const filteredTransfers = useMemo(() => {
    if (!debouncedSearchTerm) return allTransfers;
    const term = debouncedSearchTerm.toLowerCase();
    return allTransfers.filter(
      (t) =>
        t.origin_store?.name?.toLowerCase().includes(term) ||
        t.destination_store?.name?.toLowerCase().includes(term) ||
        t.creator?.full_name?.toLowerCase().includes(term) ||
        t.notes?.toLowerCase().includes(term) ||
        t.id.toLowerCase().includes(term)
    );
  }, [allTransfers, debouncedSearchTerm]);

  // Infinite scroll con IntersectionObserver
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextRef.current && !isFetchingNextRef.current) {
          fetchNextRef.current();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ---- Excel Export ----
  const handleExportExcel = useCallback(async () => {
    if (filteredTransfers.length === 0) {
      toast.error('No hay transferencias para exportar');
      return;
    }
    try {
      const toastId = toast.loading('Preparando Excel de transferencias...');
      const XLSX = await import('@e965/xlsx');
      const data = filteredTransfers.map(t => ({
        'ID': t.id.split('-')[0],
        'Dirección': activeTab === 'outgoing' ? 'Saliente' : 'Entrante',
        'Origen': t.origin_store?.name || '',
        'Destino': t.destination_store?.name || '',
        'Solicitante': t.creator?.full_name || '',
        'Estado': t.status,
        'Productos': t.items?.length || 0,
        'Notas': t.notes || '',
        'Fecha': t.created_at ? new Date(t.created_at).toLocaleDateString('es-CU') : '',
      }));
      const worksheet = XLSX.utils.json_to_sheet(data);
      worksheet['!cols'] = [
        { wch: 12 }, { wch: 12 }, { wch: 25 }, { wch: 25 }, { wch: 25 },
        { wch: 14 }, { wch: 12 }, { wch: 30 }, { wch: 16 },
      ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Transferencias');
      XLSX.writeFile(workbook, `transferencias-${activeTab}-${Date.now()}.xlsx`);
      toast.success('Transferencias exportadas a Excel', { id: toastId });
    } catch (error) {
      console.error('Error al exportar Excel:', error);
      toast.error('Error al exportar a Excel');
    }
  }, [filteredTransfers, activeTab]);

  const actions: Action[] = [
    {
      id: 'refresh',
      label: 'Actualizar',
      icon: RefreshCcw,
      onClick: () => currentQuery.refetch(),
    },
    {
      id: 'export',
      label: 'Exportar Excel',
      icon: Download,
      onClick: handleExportExcel,
    },
    {
      id: 'create',
      label: 'Nueva Transferencia',
      icon: Plus,
      onClick: () => setIsCreateModalOpen(true),
      variant: 'primary',
    },
  ];

  const tabs = [
    { id: 'outgoing' as const, label: 'Salientes', icon: ArrowUpRight },
    { id: 'incoming' as const, label: 'Entrantes', icon: ArrowDownLeft },
  ];

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const tabIds = tabs.map((t) => t.id);
    const currentIndex = tabIds.indexOf(activeTab);
    if (e.key === 'ArrowRight') {
      const next = (currentIndex + 1) % tabIds.length;
      setActiveTab(tabIds[next]);
      document.getElementById(`tab-${tabIds[next]}`)?.focus();
      e.preventDefault();
    }
    if (e.key === 'ArrowLeft') {
      const prev = (currentIndex - 1 + tabIds.length) % tabIds.length;
      setActiveTab(tabIds[prev]);
      document.getElementById(`tab-${tabIds[prev]}`)?.focus();
      e.preventDefault();
    }
    if (e.key === 'Home') {
      setActiveTab(tabIds[0]);
      document.getElementById(`tab-${tabIds[0]}`)?.focus();
      e.preventDefault();
    }
    if (e.key === 'End') {
      setActiveTab(tabIds[tabIds.length - 1]);
      document.getElementById(`tab-${tabIds[tabIds.length - 1]}`)?.focus();
      e.preventDefault();
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDIENTE':
        return (
          <span className="flex items-center gap-1 text-warning bg-warning/10 px-2 py-0.5 rounded-full text-xs font-black uppercase tracking-widest">
            <Clock className="w-3 h-3" /> Pendiente
          </span>
        );
      case 'CONFIRMADA':
        return (
          <span className="flex items-center gap-1 text-success bg-success/10 px-2 py-0.5 rounded-full text-xs font-black uppercase tracking-widest">
            <CheckCircle2 className="w-3 h-3" /> Confirmada
          </span>
        );
      case 'CANCELADA':
        return (
          <span className="flex items-center gap-1 text-destructive bg-destructive/10 px-2 py-0.5 rounded-full text-xs font-black uppercase tracking-widest">
            <XCircle className="w-3 h-3" /> Cancelada
          </span>
        );
      default:
        return <span className="text-xs">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-[clamp(1.25rem,4vw,1.75rem)] font-black border-l-4 border-primary pl-4 uppercase tracking-tighter flex items-center gap-3 text-primary">
          <ArrowLeftRight className="w-8 h-8 text-primary" />
          Transferencias entre Almacenes
        </h2>
        <ActionMenu actions={actions} />
      </div>

      {/* Barra de búsqueda */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar por tienda, solicitante, notas o ID..."
          aria-label="Buscar transferencias"
          className="neu-input w-full !pl-10 text-sm"
        />
      </div>

      {/* Tabs dirección + Chips de estado */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div
          role="tablist"
          tabIndex={0}
          aria-label="Filtrar transferencias por dirección"
          className="flex gap-2 p-1 bg-white/5 rounded-2xl w-fit"
          onKeyDown={handleTabKeyDown}
        >
          {tabs.map((tab) => (
            <button
              type="button"
              key={tab.id}
              id={`tab-${tab.id}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              aria-label={`Transferencias ${tab.label.toLowerCase()}`}
              className={cn(
                'flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all',
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground shadow-lg scale-105'
                  : 'hover:bg-white/5 text-muted-foreground'
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Filtro por estado */}
        <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="Filtrar por estado">
          {STATUS_OPTIONS.map((s) => (
            <button
              type="button"
              key={s.value}
              role="radio"
              aria-checked={activeStatus === s.value}
              onClick={() => setActiveStatus(s.value)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all border',
                activeStatus === s.value
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'border-white/5 text-muted-foreground hover:bg-white/5'
              )}
            >
              <s.icon className="w-3 h-3" />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contador de resultados */}
      {!currentQuery.isLoading && allTransfers.length > 0 && (
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
          {filteredTransfers.length === allTransfers.length
            ? `${allTransfers.length} transferencia${allTransfers.length !== 1 ? 's' : ''}`
            : `${filteredTransfers.length} de ${allTransfers.length} transferencia${allTransfers.length !== 1 ? 's' : ''}`}
        </p>
      )}

      {/* Contenido */}
      <div
        role="tabpanel"
        id={`panel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        tabIndex={0}
      >
        <StateRenderer
          isLoading={currentQuery.isLoading}
          error={currentQuery.error as Error}
          data={allTransfers}
          emptyComponent={
            <div className="py-24 text-center neu-card bg-white/2 space-y-4">
              <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto">
                <ArrowLeftRight className="w-10 h-10 text-muted-foreground opacity-20" />
              </div>
              <div>
                <p className="text-xs font-black uppercase text-primary/70 tracking-[0.2em]">
                  No hay transferencias
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  {activeTab === 'incoming'
                    ? 'No tienes solicitudes de transferencia pendientes por recibir.'
                    : 'No has realizado ninguna solicitud de transferencia recientemente.'}
                </p>
              </div>
            </div>
          }
        >
          {() => {
            // Estado vacío por búsqueda
            if (debouncedSearchTerm && filteredTransfers.length === 0) {
              return (
                <div className="py-16 text-center space-y-3">
                  <Search className="w-10 h-10 mx-auto text-muted-foreground opacity-20" />
                  <div>
                    <p className="text-xs font-black uppercase text-primary/70 tracking-[0.2em]">
                      Sin resultados
                    </p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      No se encontraron transferencias para &quot;{debouncedSearchTerm}&quot;
                    </p>
                  </div>
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 gap-4">
                {filteredTransfers.map((t) => (
                  <div
                    key={t.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedTransferId(t.id)}
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedTransferId(t.id)}
                    aria-label={`Ver detalles de transferencia ${activeTab === 'outgoing' ? 'hacia' : 'desde'} ${activeTab === 'outgoing' ? t.destination_store?.name : t.origin_store?.name}. Estado: ${t.status}`}
                    className="neu-card hover:border-primary/30 transition-all cursor-pointer group !p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={cn(
                          'w-12 h-12 rounded-2xl flex items-center justify-center shrink-0',
                          activeTab === 'outgoing' ? 'bg-warning/10' : 'bg-success/10'
                        )}
                      >
                        {activeTab === 'outgoing' ? (
                          <ArrowUpRight className="w-6 h-6 text-warning" />
                        ) : (
                          <ArrowDownLeft className="w-6 h-6 text-success" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black uppercase tracking-tight">
                            {activeTab === 'outgoing'
                              ? `Hacia: ${t.destination_store?.name ?? '—'}`
                              : `Desde: ${t.origin_store?.name ?? '—'}`}
                          </span>
                          {getStatusBadge(t.status)}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground font-medium uppercase tracking-wider">
                          <span>ID: {t.id.split('-')[0]}</span>
                          <span>•</span>
                          <span>Solicitado por: {t.creator?.full_name ?? '—'}</span>
                          <span>•</span>
                          <span>
                            {isValid(new Date(t.created_at))
                              ? format(new Date(t.created_at), 'PPPp', { locale: es })
                              : '—'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-xs font-black uppercase text-muted-foreground tracking-widest">
                          Productos
                        </p>
                        <p className="text-sm font-black text-primary group-hover:scale-110 transition-transform origin-right">
                          VER DETALLE
                        </p>
                      </div>
                      <ArrowLeftRight className="w-5 h-5 text-muted-foreground hidden sm:flex sm:opacity-0 sm:group-hover:opacity-100 opacity-100 transition-opacity" />
                    </div>
                  </div>
                ))}

                {/* Sentinel para infinite scroll */}
                <div ref={sentinelRef} className="h-4" />

                {/* Indicador "cargando más" */}
                {currentQuery.isFetchingNextPage && (
                  <div className="text-center py-4 text-xs font-bold animate-pulse text-muted-foreground">
                    Cargando más transferencias...
                  </div>
                )}
              </div>
            );
          }}
        </StateRenderer>
      </div>

      <CreateTransferModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />

      <TransferDetailsModal
        transferId={selectedTransferId}
        onClose={() => setSelectedTransferId(null)}
      />
    </div>
  );
}
