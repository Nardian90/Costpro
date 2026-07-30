'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  FileText,
  Plus,
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useOfertasList,
  useDeleteOferta,
} from '@/hooks/api/useOfertas';
import { STATUS_CONFIG } from './constants';
import type { Oferta, OfertaStatus } from '@/types/oferta';

interface OfertaListPanelProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  statusFilter: OfertaStatus | 'all';
  onStatusFilterChange: (status: OfertaStatus | 'all') => void;
  selectedOfertaId: string | null;
  onSelectOferta: (oferta: Oferta) => void;
  onNewOferta: () => void;
  onDeleteOferta: (id: string) => void;
  currentPage: number;
  onPageChange: (page: number) => void;
}

export default function OfertaListPanel({
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  selectedOfertaId,
  onSelectOferta,
  onNewOferta,
  onDeleteOferta,
  currentPage,
  onPageChange,
}: OfertaListPanelProps) {
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; numero: string } | null>(null);
  const deleteMutation = useDeleteOferta();

  const { data: listData, isLoading: listLoading, error: listError, refetch: refetchList } = useOfertasList({
    status: statusFilter === 'all' ? undefined : statusFilter,
    search: searchTerm || undefined,
    page: currentPage,
    pageSize: 20,
  });

  const ofertas = listData?.data || [];
  const pagination = listData?.pagination;

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // Error handled by mutation onError
    }
  }, [deleteTarget, deleteMutation]);

  return (
    <div className="w-full lg:w-80 xl:w-96 shrink-0 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-black tracking-tighter uppercase text-primary">
          Ofertas
        </h2>
        <Button onClick={onNewOferta} size="sm" className="gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          Nueva
        </Button>
      </div>

      {/* Search + Filter — search is now server-side */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Buscar oferta..."
            className="pl-8 h-8 text-xs"
            aria-label="Buscar ofertas"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Limpiar búsqueda"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <Select
          value={statusFilter}
          onValueChange={v => onStatusFilterChange(v as OfertaStatus | 'all')}
        >
          <SelectTrigger className="w-28 h-8 text-xs" aria-label="Filtrar por estado">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="draft">Borrador</SelectItem>
            <SelectItem value="sent">Enviada</SelectItem>
            <SelectItem value="accepted">Aceptada</SelectItem>
            <SelectItem value="rejected">Rechazada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto max-h-[calc(100vh-260px)] space-y-2 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
        {listLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary/40" />
          </div>
        )}

        {listError && !listLoading && (
          <div className="text-center py-8 px-4">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 text-destructive/50" />
            <p className="font-bold text-xs text-destructive/70">
              Error al cargar ofertas
            </p>
            <p className="text-[10px] text-muted-foreground/50 mt-1">
              {listError.message || 'Verifique la conexión e intente de nuevo'}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 h-7 text-[10px] gap-1.5"
              onClick={() => refetchList()}
            >
              <Loader2 className="w-3 h-3" />
              Reintentar
            </Button>
          </div>
        )}

        {!listLoading && !listError && ofertas.length === 0 && (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-10" />
            <p className="font-black text-xs uppercase tracking-widest text-muted-foreground">
              {searchTerm ? 'Sin resultados' : 'No hay ofertas'}
            </p>
            <p className="text-[10px] text-muted-foreground/50 mt-1">
              {searchTerm ? 'Intenta con otro término de búsqueda' : 'Crea tu primera oferta comercial'}
            </p>
          </div>
        )}

        {ofertas.map(oferta => {
          const sc = STATUS_CONFIG[oferta.status] || STATUS_CONFIG.draft;
          const isSelected = selectedOfertaId === oferta.id;
          const displayTotal = oferta.total || oferta.subtotal || 0;
          const displayCurrency = oferta.moneda || 'CUP';
          return (
            <div
              key={oferta.id}
              className={cn(
                'w-full text-left p-3 rounded-xl border transition-all group relative',
                isSelected
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border hover:border-primary/30 hover:bg-muted/30'
              )}
            >
              <button
                type="button"
                onClick={() => onSelectOferta(oferta)}
                className="w-full text-left"
                aria-label={`Oferta ${oferta.numero}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-xs truncate">
                      {oferta.numero}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                      {oferta.objeto}
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                      {oferta.cliente?.empresa || 'Sin cliente'}
                    </p>
                  </div>
                  <Badge
                    className={cn('text-[9px] px-1.5 py-0.5 shrink-0', sc.badgeClass)}
                    variant="secondary"
                  >
                    {sc.label}
                  </Badge>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] text-muted-foreground/60">
                    {oferta.fecha}
                  </span>
                  <span className="font-bold text-xs text-primary tabular-nums">
                    {displayTotal.toLocaleString('es-CU', { minimumFractionDigits: 2 })} {displayCurrency}
                  </span>
                </div>
              </button>

              {/* Delete button — visible on hover or always on mobile */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget({ id: oferta.id, numero: oferta.numero });
                }}
                className={cn(
                  'absolute top-2 right-2 w-6 h-6 rounded-md flex items-center justify-center transition-all',
                  'opacity-0 group-hover:opacity-100 focus:opacity-100',
                  'hover:bg-destructive/10 text-muted-foreground hover:text-destructive',
                  'lg:opacity-0 focus:opacity-100'
                )}
                aria-label={`Eliminar oferta ${oferta.numero}`}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          );
        })}

        {/* Pagination controls */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-1 pt-2 pb-1">
            <span className="text-[10px] text-muted-foreground">
              {pagination.total} oferta{pagination.total !== 1 ? 's' : ''} · Pág. {currentPage}/{pagination.totalPages}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-6 w-6"
                disabled={currentPage <= 1}
                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              >
                <ChevronLeft className="w-3 h-3" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-6 w-6"
                disabled={currentPage >= pagination.totalPages}
                onClick={() => onPageChange(currentPage + 1)}
              >
                <ChevronRight className="w-3 h-3" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation mini-dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px]" onClick={() => setDeleteTarget(null)}>
          <div
            className="bg-background border border-border rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-full bg-destructive/10">
                <Trash2 className="w-5 h-5 text-destructive" />
              </div>
              <h4 className="font-bold text-sm">Eliminar Oferta</h4>
            </div>
            <p className="text-xs text-muted-foreground mb-5 leading-relaxed">
              ¿Está seguro de eliminar la oferta <strong>{deleteTarget.numero}</strong>? Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" className="text-xs" onClick={() => setDeleteTarget(null)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="text-xs"
                onClick={handleConfirmDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
