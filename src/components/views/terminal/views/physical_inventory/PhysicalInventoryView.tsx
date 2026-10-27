'use client';

/**
 * PhysicalInventoryView — Módulo profesional de Inventario Físico.
 * Inicio → OPERACIÓN → Almacén → Inventario Físico
 *
 * Panel principal: tabla de inventarios con contadores DERIVADOS de los datos
 * (nunca manuales), filtros por estado/período/búsqueda y acción principal
 * «Nuevo inventario físico». Al abrir un inventario se accede al espacio de
 * trabajo: Conteo | Conciliación | Ajustes | Auditoría.
 *
 * Autorización: RLS en BD + roles en cada RPC (barrera final). Los botones
 * solo reflejan lo que el backend permite; no son la seguridad.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, Loader2, RefreshCcw, ClipboardCheck, EyeOff,
  AlertTriangle, PackageX, PackagePlus, Clock, ArrowRight, Eye,
} from 'lucide-react';
import { cn, formatDate, touch } from '@/lib/utils';
import { apiFetch } from '@/lib/api-fetch';
import { useAuthStore } from '@/store';
import { useAuthorizedStores } from '@/hooks/api/useAuthorizedStores';
import { PrimaryButton } from '@/components/ui/atomic';
import { CreatePhysicalInventoryModal } from './CreatePhysicalInventoryModal';
import { PhysicalInventoryDetail } from './PhysicalInventoryDetail';
import {
  PI_STATUS_META, PI_SCOPE_LABELS, PI_LIFECYCLE_META, PI_LIFECYCLE_FILTER_LABELS, piLifecycleOf,
  statusesOfLifecycle, type PILifecycleStage, type PIHeader,
} from './pi-types';

/** Filtro por estado del CICLO DE VIDA (misión §5): Borrador · En proceso · Terminado · Anulado. */
type StatusFilter = 'all' | PILifecycleStage;

export default function PhysicalInventoryView() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const activeStoreId = user?.activeStoreId;

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [openPiId, setOpenPiId] = useState<string | null>(null);

  // Tiendas autorizadas del usuario (filtro de tienda) — MISIÓN PI-SUPERADMIN
  // (2026-10-26): fuente única compartida con el modal de creación (hook
  // useAuthorizedStores). El nivel administrativo (admin|superadmin) consulta
  // las tiendas activas de su alcance (RLS decide); los roles operativos,
  // solo sus membresías. Antes esta vista duplicaba la consulta y el modal
  // quedaba sin la rama administrativa.
  const { data: authorizedStores = [] } = useAuthorizedStores();

  const [storeFilter, setStoreFilter] = useState<string>('');

  const effectiveStore = storeFilter || activeStoreId || (authorizedStores[0]?.id ?? '');

  const { data: inventories = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['physical-inventories', effectiveStore, statusFilter, dateFrom, dateTo, search],
    queryFn: async () => {
      const params = new URLSearchParams({ storeId: effectiveStore });
      if (statusFilter !== 'all') params.set('status', statusesOfLifecycle(statusFilter).join(','));
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);
      if (search.trim()) params.set('search', search.trim());
      const res = await apiFetch<{ inventories: PIHeader[] }>(`/api/physical-inventory?${params.toString()}`);
      return res.inventories;
    },
    enabled: !!effectiveStore,
    staleTime: 30_000,
  });

  // Contadores por ciclo de vida (etiqueta EXACTA de la misión)
  const countsByLifecycle = useMemo(() => {
    const c: Record<string, number> = { all: inventories.length };
    for (const pi of inventories) {
      const stage = piLifecycleOf(pi.status);
      c[stage] = (c[stage] || 0) + 1;
    }
    return c;
  }, [inventories]);

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['physical-inventories'] });
  }, [queryClient]);

  // ── Espacio de trabajo de un inventario ────────────────────────────────
  if (openPiId) {
    return (
      <PhysicalInventoryDetail
        piId={openPiId}
        onBack={() => { setOpenPiId(null); refresh(); }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black uppercase tracking-tight">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            Inventario Físico
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Gestione conteos físicos por tienda y fecha de corte, concilie diferencias y genere ajustes documentales autorizados.
          </p>
        </div>
        <PrimaryButton onClick={() => setCreateOpen(true)} className="touch">
          <Plus className="h-4 w-4" />
          Nuevo inventario físico
        </PrimaryButton>
      </div>

      {/* Filtros */}
      <div className="flex flex-col lg:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            className="w-full min-h-[44px] rounded-xl border border-border bg-card pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Buscar por número, descripción o responsable…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 lg:flex gap-2">
          <select
            aria-label="Filtrar por tienda"
            className={cn(touch, 'rounded-xl border border-border bg-card px-3 text-xs font-bold text-muted-foreground')}
            value={effectiveStore}
            onChange={(e) => setStoreFilter(e.target.value)}
          >
            {(authorizedStores).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select
            aria-label="Filtrar por estado del ciclo de vida"
            className={cn(touch, 'rounded-xl border border-border bg-card px-3 text-xs font-bold text-muted-foreground')}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            {Object.entries(PI_LIFECYCLE_FILTER_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}{countsByLifecycle[k] ? ` (${countsByLifecycle[k]})` : ''}
              </option>
            ))}
          </select>
          <input
            type="date"
            aria-label="Corte desde"
            className={cn(touch, 'rounded-xl border border-border bg-card px-3 text-xs text-muted-foreground')}
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <input
            type="date"
            aria-label="Corte hasta"
            className={cn(touch, 'rounded-xl border border-border bg-card px-3 text-xs text-muted-foreground')}
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
          <button
            onClick={() => refetch()}
            className={cn(touch, 'rounded-xl border border-border bg-card px-3 text-muted-foreground hover:bg-muted')}
            aria-label="Actualizar"
          >
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Tabla de inventarios */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/40" />
        </div>
      ) : inventories.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <ClipboardCheck className="h-12 w-12 text-muted-foreground/25" />
          <p className="text-sm font-bold text-muted-foreground">No hay inventarios físicos</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Cree el primero con «Nuevo inventario físico»: elija tienda, fecha de corte y alcance. Luego prepare el conteo,
            genere la hoja PDF, registre las cantidades y concilie las diferencias.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 border-b">
              <tr>
                {[
                  ['Nº', 'w-28'], ['Estado', 'w-36'], ['Fecha corte', 'w-32'], ['Creado', 'w-32'],
                  ['Responsable', 'w-36'], ['Productos', 'w-24'], ['Contados', 'w-20'],
                  ['Faltantes', 'w-16'], ['Sobrantes', 'w-16'], ['Pendientes', 'w-16'], ['', 'w-12'],
                ].map(([label, w]) => (
                  <th key={label} className={cn('p-3 text-left font-black uppercase text-[10px] tracking-widest text-muted-foreground', w)}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inventories.map((pi) => {
                const meta = PI_STATUS_META[pi.status];
                const lifecycle = PI_LIFECYCLE_META[piLifecycleOf(pi.status)];
                const progress = pi.total_items > 0 ? Math.round((pi.counted_items / pi.total_items) * 100) : 0;
                return (
                  <tr
                    key={pi.id}
                    className="border-b border-border/50 last:border-0 hover:bg-muted/20 cursor-pointer"
                    onClick={() => setOpenPiId(pi.id)}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        {pi.blind_mode && (
                          <span title="Conteo ciego"><EyeOff className="h-3.5 w-3.5 text-muted-foreground" /></span>
                        )}
                        <span className="font-mono font-black text-primary">{pi.pi_number}</span>
                      </div>
                      {pi.description && (
                        <p className="mt-0.5 max-w-[180px] truncate text-[10px] text-muted-foreground">{pi.description}</p>
                      )}
                    </td>
                    <td className="p-3">
                      {/* Ciclo de vida (etiqueta EXACTA) + fase interna */}
                      <span
                        data-testid={`pi-row-lifecycle-${piLifecycleOf(pi.status)}`}
                        className={cn('inline-flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-black uppercase tracking-wider', lifecycle.className)}
                      >
                        <span className={cn('h-1.5 w-1.5 rounded-full', lifecycle.dot)} />
                        {lifecycle.label}
                      </span>
                      <p className="mt-1 text-[10px] text-muted-foreground">{meta.label}</p>
                    </td>
                    <td className="p-3 font-mono tabular-nums text-muted-foreground">{formatDate(pi.cutoff_date)}</td>
                    <td className="p-3 font-mono tabular-nums text-muted-foreground">{formatDate(pi.created_at)}</td>
                    <td className="p-3">
                      <span className="font-bold">{pi.responsible_name || '—'}</span>
                      {pi.creator?.full_name && (
                        <p className="text-[10px] text-muted-foreground">creó: {pi.creator.full_name}</p>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-col gap-1">
                        <span className="font-mono tabular-nums font-bold">{pi.total_items}</span>
                        <div className="h-1 w-16 overflow-hidden rounded-full bg-muted">
                          <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground">{progress}% · {PI_SCOPE_LABELS[pi.scope_type]}</span>
                      </div>
                    </td>
                    <td className="p-3 font-mono tabular-nums font-bold text-primary">{pi.counted_items}</td>
                    <td className="p-3">
                      {pi.shortfall_items > 0 ? (
                        <span className="inline-flex items-center gap-1 font-mono tabular-nums font-black text-destructive">
                          <PackageX className="h-3.5 w-3.5" />{pi.shortfall_items}
                        </span>
                      ) : <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="p-3">
                      {pi.surplus_items > 0 ? (
                        <span className="inline-flex items-center gap-1 font-mono tabular-nums font-black text-success">
                          <PackagePlus className="h-3.5 w-3.5" />{pi.surplus_items}
                        </span>
                      ) : <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="p-3">
                      {pi.pending_items > 0 ? (
                        <span className="inline-flex items-center gap-1 font-mono tabular-nums font-black text-warning">
                          <Clock className="h-3.5 w-3.5" />{pi.pending_items}
                        </span>
                      ) : <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="p-3">
                      <Eye className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {inventories.length > 0 && (
        <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
          <AlertTriangle className="h-3 w-3" />
          Ninguna diferencia se convierte en movimiento de inventario sin pasar por las validaciones y autorizaciones correspondientes.
        </p>
      )}

      <CreatePhysicalInventoryModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => {
          refresh();
          setOpenPiId(id);
        }}
      />
    </div>
  );
}
