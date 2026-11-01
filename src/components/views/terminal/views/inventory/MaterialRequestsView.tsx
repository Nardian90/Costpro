'use client';

/**
 * MaterialRequestsView — Solicitud de Materiales (Modelo SC-2-07, Res. 11/2007 MFP).
 *
 * MISIÓN RESOLUCIÓN 11 (2026-10-31). Vista documental con el estándar de
 * Ajustes Documentales y la experiencia de Vales de Salida:
 *
 *   - DOS MODOS DE VISUALIZACIÓN: tarjetas y tabla densa, con persistencia
 *     del modo (localStorage) — mismo comportamiento que Vales de Salida.
 *   - FLUJO DOCUMENTAL: Borrador → En Revisión → Confirmada, con anulación
 *     trazable (motivo obligatorio) y devolución a borrador para corrección.
 *     Transiciones via RPC SECURITY DEFINER (lock FOR UPDATE, autorización
 *     por tienda, auditoría por transición) — la UI es conveniencia, la DB
 *     es la última barrera.
 *   - Acciones según estado y permisos: la CONFIRMACIÓN (dato 7 del modelo:
 *     «funcionario que autoriza») requiere nivel admin/manager/encargado
 *     (canConfirmMaterialRequestInStore); crear/editar/enviar/anular queda
 *     abierto a cualquier miembro activo de la tienda.
 *
 * Aislamiento multitienda: la consulta usa el cliente Supabase del usuario
 * (RLS activa) acotada por la tienda activa — sin cruce entre tiendas.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, Loader2, Eye, RefreshCcw, ClipboardList, Ban,
  LayoutList, List, AlertTriangle, Send, CheckCircle2, Undo2, Pencil, Factory, Building2,
} from 'lucide-react';
import { cn, formatDate, touch } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store';
import { canViewStore, canConfirmMaterialRequestInStore } from '@/lib/roles';
import { DocumentStatusBadge } from '@/components/ui/DocumentStatusBadge';
import { Button } from '@/components/ui/button';
import { BaseModal } from '@/components/ui/BaseModal';
import { PrimaryButton, SecondaryButton } from '@/components/ui/atomic';
import { toast } from 'sonner';
import { formatearCantidad } from '@/lib/inventory/kardexPeriod';
import { MaterialRequestFormModal } from './MaterialRequestFormModal';
import { MaterialRequestDetailsModal } from './MaterialRequestDetailsModal';
import {
  MATERIAL_REQUEST_STATUS_FILTER_LABELS,
  type MaterialRequestDoc,
  type MaterialRequestStatusFilter,
} from './materialRequestsTypes';

// ──────────────────────────────────────────────────────────────────────────
// Constantes
// ──────────────────────────────────────────────────────────────────────────

type ViewMode = 'cards' | 'table';

const VIEW_MODE_KEY = 'solicitud_materiales_view_mode';
const PAGE_SIZE = 50;

/** Embeds con FK hints por constraint (4 FKs hacia profiles → desambiguación). */
const MR_SELECT = [
  '*',
  'items:material_request_items(*)',
  'creator:profiles!fk_mr_created_by(full_name)',
  'authorizer:profiles!fk_mr_authorized_by(full_name)',
  'receiver:profiles!fk_mr_received_by(full_name)',
  'voider:profiles!fk_mr_voided_by(full_name)',
  'production_orders(order_number, order_type)',
  'warehouses(name, code)',
].join(', ');

// ──────────────────────────────────────────────────────────────────────────
// Componente principal
// ──────────────────────────────────────────────────────────────────────────

export default function MaterialRequestsView() {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId;
  const queryClient = useQueryClient();

  const canActInStore = canViewStore(user, storeId ?? '');
  // Dato 7 del SC-2-07: la confirmación la realiza el funcionario que autoriza
  // (nivel admin/manager/encargado — la RPC revalida el acceso a la tienda).
  const canConfirm = canConfirmMaterialRequestInStore(user, storeId ?? '');

  const storeName = useMemo(() => {
    const m = user?.memberships?.find(mem => mem.store_id === storeId);
    return (m?.store as { name?: string } | null | undefined)?.name ?? null;
  }, [user, storeId]);

  // ── Modo de visualización persistido (requisito: alternancia tarjetas/tabla) ──
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'cards';
    const saved = window.localStorage.getItem(VIEW_MODE_KEY);
    return saved === 'table' ? 'table' : 'cards';
  });
  useEffect(() => {
    try { window.localStorage.setItem(VIEW_MODE_KEY, viewMode); } catch { /* SSR/private */ }
  }, [viewMode]);

  // ── Filtros ──
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<MaterialRequestStatusFilter>('all');

  // ── Orden (modo tabla) ──
  const [sortKey, setSortKey] = useState<'created_at' | 'fecha_emision'>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const alternarOrden = useCallback((key: 'created_at' | 'fecha_emision') => {
    if (sortKey === key) {
      setSortDir(d => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }, [sortKey]);

  // ── Modales ──
  const [formOpen, setFormOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<MaterialRequestDoc | null>(null);
  const [detalleDoc, setDetalleDoc] = useState<MaterialRequestDoc | null>(null);
  const [submitTarget, setSubmitTarget] = useState<MaterialRequestDoc | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<MaterialRequestDoc | null>(null);
  const [reopenTarget, setReopenTarget] = useState<MaterialRequestDoc | null>(null);
  const [voidTarget, setVoidTarget] = useState<MaterialRequestDoc | null>(null);

  // ── Consulta RLS paginada (misma fuente de verdad, «Cargar más» real) ──
  const query = useInfiniteQuery({
    queryKey: ['material-requests', storeId],
    queryFn: async ({ pageParam }) => {
      if (!storeId) return { docs: [] as MaterialRequestDoc[], hasMore: false };
      const from = pageParam * PAGE_SIZE;
      const { data, error } = await supabase
        .from('material_requests')
        .select(MR_SELECT)
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      const docs = (data || []) as unknown as MaterialRequestDoc[];
      return { docs, hasMore: docs.length === PAGE_SIZE };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => (lastPage.hasMore ? allPages.length : undefined),
    enabled: !!storeId,
    staleTime: 30_000,
  });

  const docs = useMemo(
    () => query.data?.pages.flatMap(p => p.docs) ?? [],
    [query.data]
  );

  // ── Búsqueda/filtro (client-side sobre páginas cargadas — mismo aviso honesto que Vales) ──
  const filtered = useMemo(() => {
    const base = docs.filter(d => statusFilter === 'all' || d.status === statusFilter);
    const term = search.trim().toLowerCase();
    if (!term) return base;
    return base.filter(d => {
      const inItems = d.items?.some(i =>
        i.descripcion?.toLowerCase().includes(term) || i.sku?.toLowerCase().includes(term)
      ) ?? false;
      return (
        d.request_number?.toLowerCase().includes(term) ||
        d.area_nombre?.toLowerCase().includes(term) ||
        d.almacen_nombre?.toLowerCase().includes(term) ||
        d.notes?.toLowerCase().includes(term) ||
        d.creator?.full_name?.toLowerCase().includes(term) ||
        d.production_orders?.order_number?.toLowerCase().includes(term) ||
        inItems
      );
    });
  }, [docs, search, statusFilter]);

  const ordenados = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const va = sortKey === 'fecha_emision'
        ? Date.parse(a.fecha_emision || '')
        : Date.parse(a.created_at || '');
      const vb = sortKey === 'fecha_emision'
        ? Date.parse(b.fecha_emision || '')
        : Date.parse(b.created_at || '');
      return sortDir === 'desc' ? vb - va : va - vb;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  // Contadores por estado (sobre el conjunto que ve el usuario)
  const conteoEstados = useMemo(() => {
    const term = search.trim().toLowerCase();
    const base = docs.filter(d => {
      if (!term) return true;
      const inItems = d.items?.some(i => i.descripcion?.toLowerCase().includes(term)) ?? false;
      return (
        d.request_number?.toLowerCase().includes(term) ||
        d.area_nombre?.toLowerCase().includes(term) ||
        d.notes?.toLowerCase().includes(term) ||
        d.creator?.full_name?.toLowerCase().includes(term) ||
        d.production_orders?.order_number?.toLowerCase().includes(term) ||
        inItems
      );
    });
    return {
      all: base.length,
      draft: base.filter(d => d.status === 'draft').length,
      in_review: base.filter(d => d.status === 'in_review').length,
      confirmed: base.filter(d => d.status === 'confirmed').length,
      voided: base.filter(d => d.status === 'voided').length,
    } satisfies Record<MaterialRequestStatusFilter, number>;
  }, [docs, search]);

  const totalLineas = useMemo(
    () => filtered.reduce((s, d) => s + (d.items?.length ?? 0), 0),
    [filtered]
  );

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['material-requests'] });
  }, [queryClient]);

  // ── Acciones del flujo documental (todas via RPC; la DB revalida) ──
  const [actionPending, setActionPending] = useState<string | null>(null);

  const ejecutarRpc = useCallback(async (
    nombre: 'submit_material_request' | 'confirm_material_request' | 'reopen_material_request' | 'void_material_request',
    args: Record<string, unknown>,
    exito: string,
  ) => {
    setActionPending(nombre);
    try {
      const { error } = await supabase.rpc(nombre, args);
      if (error) throw error;
      toast.success(exito);
      invalidate();
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error('Error: ' + msg, { duration: 8000 });
      return false;
    } finally {
      setActionPending(null);
    }
  }, [invalidate]);

  const abrirCrear = useCallback(() => {
    setEditDoc(null);
    setFormOpen(true);
  }, []);

  const abrirEditar = useCallback((d: MaterialRequestDoc) => {
    // La RPC revalida el estado (solo borradores); la UI solo lo intenta en draft.
    setEditDoc(d);
    setFormOpen(true);
  }, []);

  const handleSaved = useCallback((r: { mode: 'create' | 'edit'; request_number?: string }) => {
    setFormOpen(false);
    setEditDoc(null);
    invalidate();
    toast.success(
      r.mode === 'create'
        ? `Solicitud ${r.request_number || ''} guardada en borrador`
        : 'Cambios guardados',
      { description: r.mode === 'create'
        ? 'Revísala y envíala a revisión cuando esté completa.'
        : undefined },
    );
  }, [invalidate]);

  const handleSubmitReview = useCallback(async (d: MaterialRequestDoc) => {
    await ejecutarRpc('submit_material_request',
      { p_request_id: d.id, p_user_id: null },
      `Solicitud ${d.request_number} enviada a revisión`);
    setSubmitTarget(null);
  }, [ejecutarRpc]);

  const handleConfirm = useCallback(async (d: MaterialRequestDoc) => {
    const ok = await ejecutarRpc('confirm_material_request',
      { p_request_id: d.id, p_user_id: null },
      `Solicitud ${d.request_number} confirmada`);
    setConfirmTarget(null);
    if (ok) {
      // Refresca el detalle si está abierto con el documento confirmado.
      if (detalleDoc?.id === d.id) setDetalleDoc(null);
    }
  }, [ejecutarRpc, detalleDoc]);

  const isLoading = query.isLoading;
  const queryError = query.error;
  const hasMore = query.hasNextPage;

  // Props compartidas por Tarjeta/Fila
  const accionesDoc = (d: MaterialRequestDoc) => ({
    onVer: () => setDetalleDoc(d),
    onEditar: d.status === 'draft' ? () => abrirEditar(d) : null,
    onEnviar: d.status === 'draft' && canActInStore ? () => setSubmitTarget(d) : null,
    onConfirmar: d.status === 'in_review' && canConfirm ? () => setConfirmTarget(d) : null,
    onDevolver: d.status === 'in_review' && canActInStore ? () => setReopenTarget(d) : null,
    onAnular: (d.status === 'draft' || d.status === 'in_review') && canActInStore ? () => setVoidTarget(d) : null,
  });

  return (
    <div className="space-y-4">
      {/* ── Header documental ── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tight">Solicitud de Materiales</h2>
          <p className="text-xs text-muted-foreground">
            Modelo SC-2-07 «Solicitud de Entrega» · Res. 11/2007 MFP{storeName ? ` · ${storeName}` : ''}
          </p>
        </div>
        <Button
          type="button"
          onClick={abrirCrear}
          disabled={!storeId}
          className="h-10 px-4 rounded-xl text-xs font-black uppercase tracking-wide"
          aria-label="Nueva Solicitud de Materiales"
        >
          <Plus className="w-4 h-4" /> Nueva Solicitud
        </Button>
      </div>

      {/* ── Búsqueda + filtro de estado + modo de vista ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por número, área, producto, OT o usuario…"
            aria-label="Buscar solicitudes de materiales"
            className={cn('w-full pl-10 pr-4 rounded-xl border border-border bg-background text-sm', touch)}
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as MaterialRequestStatusFilter)}
          className={cn('px-3 rounded-xl border border-border bg-background text-xs font-bold uppercase', touch)}
          aria-label="Filtrar por estado"
        >
          {(Object.keys(MATERIAL_REQUEST_STATUS_FILTER_LABELS) as MaterialRequestStatusFilter[]).map(k => (
            <option key={k} value={k}>
              {MATERIAL_REQUEST_STATUS_FILTER_LABELS[k]}{k !== 'all' ? ` (${conteoEstados[k]})` : ''}
            </option>
          ))}
        </select>

        {/* Toggle de modo de visualización (mismo comportamiento que Vales de Salida) */}
        <div className="flex items-center rounded-xl border border-border overflow-hidden" role="group" aria-label="Modo de visualización">
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            aria-pressed={viewMode === 'cards'}
            title="Ver como tarjetas"
            aria-label="Modo tarjetas"
            className={cn('px-3 py-2 inline-flex items-center gap-1.5 text-xs font-black uppercase transition-colors', viewMode === 'cards' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
          >
            <LayoutList className="w-4 h-4" aria-hidden="true" />
            <span className="hidden md:inline">Tarjetas</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            aria-pressed={viewMode === 'table'}
            title="Ver como tabla"
            aria-label="Modo tabla"
            className={cn('px-3 py-2 inline-flex items-center gap-1.5 text-xs font-black uppercase transition-colors border-l border-border', viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
          >
            <List className="w-4 h-4" aria-hidden="true" />
            <span className="hidden md:inline">Tabla</span>
          </button>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => query.refetch()}
          className="h-10 w-10 p-2 rounded-xl"
          aria-label="Recargar solicitudes"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
        </Button>
      </div>

      {/* ── Contador contextual ── */}
      {!isLoading && (
        <p className="text-[11px] text-muted-foreground font-medium">
          {filtered.length} solicitud(es) · {totalLineas} línea(s) de producto
          {hasMore && !search && ' · cargando más disponible'}
          {(hasMore && search) && ' · la búsqueda cubre las solicitudes ya cargadas — usa «Cargar más» para buscar en más historial'}
          {storeId ? '' : ' · Selecciona una tienda activa para ver sus solicitudes'}
        </p>
      )}

      {/* ── Contenido ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20" role="status" aria-label="Cargando solicitudes">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : queryError ? (
        <div className="text-center py-20">
          <AlertTriangle className="w-10 h-10 text-destructive/60 mx-auto mb-3" aria-hidden="true" />
          <p className="text-sm font-bold text-destructive">No se pudieron cargar las solicitudes</p>
          <p className="text-xs text-muted-foreground mt-1">{String((queryError as Error)?.message || queryError)}</p>
          <Button type="button" variant="outline" className="mt-4" onClick={() => query.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : !storeId ? (
        <div className="text-center py-20">
          <ClipboardList className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-bold text-muted-foreground">Sin tienda activa</p>
          <p className="text-xs text-muted-foreground mt-1">
            Selecciona una tienda para consultar sus Solicitudes de Materiales
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <ClipboardList className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-bold text-muted-foreground">
            {docs.length === 0 ? 'Aún no hay Solicitudes de Materiales en esta tienda' : 'Ninguna solicitud coincide con la búsqueda'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {docs.length === 0
              ? 'Usa «Nueva Solicitud» para formalizar el primer pedido de productos (SC-2-07)'
              : 'Prueba con otro término o cambia el filtro de estado'}
          </p>
        </div>
      ) : viewMode === 'table' ? (
        <TablaSolicitudes
          solicitudes={ordenados}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={alternarOrden}
          accionesDoc={accionesDoc}
        />
      ) : (
        <div className="grid gap-2">
          {ordenados.map(d => (
            <TarjetaSolicitud key={d.id} doc={d} {...accionesDoc(d)} />
          ))}
        </div>
      )}

      {/* ── Paginación «Cargar más» ── */}
      {hasMore && !isLoading && !queryError && storeId && (
        <div className="flex flex-col items-center gap-1 py-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
            className="h-auto rounded-full px-5 py-2 text-xs font-black uppercase tracking-wide"
          >
            {query.isFetchingNextPage ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" aria-hidden="true" />
                Cargando…
              </>
            ) : (
              'Cargar más solicitudes'
            )}
          </Button>
          <span className="text-[10px] font-bold text-muted-foreground">
            Mostrando {docs.length} documento(s)
          </span>
        </div>
      )}

      {/* ── Formulario (crear/editar) ── */}
      <MaterialRequestFormModal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditDoc(null); }}
        storeId={storeId ?? null}
        storeName={storeName}
        editDoc={editDoc}
        onSaved={handleSaved}
      />

      {/* ── Documento real ── */}
      <MaterialRequestDetailsModal
        open={!!detalleDoc}
        onClose={() => setDetalleDoc(null)}
        doc={detalleDoc}
        storeName={storeName}
      />

      {/* ── Enviar a revisión ── */}
      <BaseModal
        open={!!submitTarget}
        onOpenChange={o => { if (!o) setSubmitTarget(null); }}
        aria-label="Enviar a revisión"
        maxWidth="sm:max-w-md"
        title={
          <span className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
            <Send className="w-5 h-5 text-warning" aria-hidden="true" />
            Enviar a revisión
          </span>
        }
        footer={
          <>
            <SecondaryButton label="Cancelar" onClick={() => setSubmitTarget(null)} className="flex-1" />
            <PrimaryButton
              label={actionPending === 'submit_material_request' ? 'Enviando…' : 'Enviar'}
              onClick={() => submitTarget && handleSubmitReview(submitTarget)}
              disabled={!!actionPending}
              className="flex-1 !bg-warning hover:!bg-warning/90"
            />
          </>
        }
      >
        <div className="py-4 space-y-3">
          <p className="font-bold text-center text-sm">
            ¿Enviar la solicitud {submitTarget?.request_number} a revisión?
          </p>
          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            La solicitud quedará <span className="font-bold text-warning">En Revisión</span> y no podrá
            editarse (podrá confirmarse, devolverse a borrador o anularse). La fecha de envío queda
            registrada como fecha de la Solicitud (dato 6 del modelo).
          </p>
          {submitTarget?.items && submitTarget.items.length > 0 && (
            <div className="rounded-xl bg-muted/50 border border-border p-3 space-y-1">
              <p className="text-xs font-black uppercase text-muted-foreground mb-1">
                {submitTarget.items.length} producto(s) solicitado(s)
              </p>
              {submitTarget.items.map(it => (
                <div key={it.id} className="flex items-center justify-between text-xs">
                  <span className="font-bold truncate flex-1">{it.descripcion}</span>
                  <span className="font-mono font-black">{formatearCantidad(Number(it.quantity))} {it.unit_of_measure}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </BaseModal>

      {/* ── Confirmación (dato 7: funcionario que autoriza) ── */}
      <BaseModal
        open={!!confirmTarget}
        onOpenChange={o => { if (!o) setConfirmTarget(null); }}
        aria-label="Confirmar solicitud"
        maxWidth="sm:max-w-md"
        title={
          <span className="text-lg font-black uppercase tracking-tight flex items-center gap-2 text-success">
            <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
            Confirmar Solicitud
          </span>
        }
        footer={
          <>
            <SecondaryButton label="Cancelar" onClick={() => setConfirmTarget(null)} className="flex-1" />
            <PrimaryButton
              label={actionPending === 'confirm_material_request' ? 'Confirmando…' : 'Confirmar y Autorizar'}
              onClick={() => confirmTarget && handleConfirm(confirmTarget)}
              disabled={!!actionPending}
              className="flex-1 !bg-success hover:!bg-success/90"
            />
          </>
        }
      >
        <div className="py-4 space-y-3">
          <p className="font-bold text-center text-sm">
            ¿Confirmar la solicitud {confirmTarget?.request_number}?
          </p>
          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            Al confirmar, tú quedas registrado como <span className="font-bold">funcionario que
            autoriza la Solicitud</span> (dato 7) y como <span className="font-bold">empleado del
            almacén que la recibe</span> (dato 8), con sus fechas. El documento queda
            <span className="font-bold text-success"> Confirmado</span> y ya no admite cambios.
          </p>
          {confirmTarget?.items && confirmTarget.items.length > 0 && (
            <div className="rounded-xl bg-muted/50 border border-border p-3 space-y-1">
              <p className="text-xs font-black uppercase text-muted-foreground mb-1">
                {confirmTarget.items.length} producto(s) a autorizar
              </p>
              {confirmTarget.items.map(it => (
                <div key={it.id} className="flex items-center justify-between text-xs">
                  <span className="font-bold truncate flex-1">{it.descripcion}</span>
                  <span className="font-mono font-black">{formatearCantidad(Number(it.quantity))} {it.unit_of_measure}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </BaseModal>

      {/* ── Devolver a borrador ── */}
      <ReopenModal
        target={reopenTarget}
        pending={actionPending === 'reopen_material_request'}
        onCancel={() => setReopenTarget(null)}
        onConfirm={async (motivo) => {
          if (!reopenTarget) return;
          const ok = await ejecutarRpc('reopen_material_request',
            { p_request_id: reopenTarget.id, p_reason: motivo, p_user_id: null },
            `Solicitud ${reopenTarget.request_number} devuelta a borrador`);
          setReopenTarget(null);
          if (ok) setDetalleDoc(null);
        }}
      />

      {/* ── Anulación ── */}
      <VoidModal
        target={voidTarget}
        pending={actionPending === 'void_material_request'}
        onCancel={() => setVoidTarget(null)}
        onConfirm={async (motivo) => {
          if (!voidTarget) return;
          const ok = await ejecutarRpc('void_material_request',
            { p_request_id: voidTarget.id, p_reason: motivo, p_user_id: null },
            `Solicitud ${voidTarget.request_number} anulada`);
          setVoidTarget(null);
          if (ok) setDetalleDoc(null);
        }}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Tarjeta (modo tarjetas)
// ──────────────────────────────────────────────────────────────────────────

interface AccionesSolicitud {
  onVer: () => void;
  onEditar: (() => void) | null;
  onEnviar: (() => void) | null;
  onConfirmar: (() => void) | null;
  onDevolver: (() => void) | null;
  onAnular: (() => void) | null;
}

function TarjetaSolicitud({ doc: d, onVer, onEditar, onEnviar, onConfirmar, onDevolver, onAnular }: {
  doc: MaterialRequestDoc;
} & AccionesSolicitud) {
  const itemCount = d.items?.length ?? 0;
  return (
    <div
      data-material-request-id={d.id}
      className="p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-mono text-xs font-black text-primary">{d.request_number}</span>
            <DocumentStatusBadge type="material_request" status={d.status} size="xs" />
            {d.production_orders?.order_number && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground bg-muted/60 rounded px-1.5 py-0.5">
                <Factory className="w-3 h-3" aria-hidden="true" />
                OT {d.production_orders.order_number}
              </span>
            )}
          </div>
          <p className="text-sm font-bold truncate flex items-center gap-1.5" title={d.area_nombre}>
            <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
            {d.area_nombre}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {formatDate(d.fecha_emision)} · Almacén: {d.almacen_nombre}
            {itemCount > 0 && ` · ${itemCount} producto(s)`}
          </p>
          <p className="text-xs text-muted-foreground">
            Solicitante: {d.creator?.full_name || '—'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 justify-end shrink-0 max-w-[55%]">
          <Button
            type="button"
            variant="outline"
            onClick={onVer}
            className="h-9 px-3 rounded-lg gap-1.5 text-xs font-bold"
            title="Ver solicitud"
            aria-label={`Ver solicitud ${d.request_number}`}
          >
            <Eye className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">Ver</span>
          </Button>
          {onEditar && (
            <Button
              type="button"
              variant="outline"
              onClick={onEditar}
              className="h-9 px-3 rounded-lg gap-1.5 text-xs font-bold"
              title="Editar borrador"
              aria-label={`Editar solicitud ${d.request_number}`}
            >
              <Pencil className="w-4 h-4" aria-hidden="true" />
              <span className="hidden lg:inline">Editar</span>
            </Button>
          )}
          {onEnviar && (
            <Button
              type="button"
              variant="outline"
              onClick={onEnviar}
              className="h-9 px-3 rounded-lg gap-1.5 text-xs font-bold border-warning/70! bg-warning/15! text-warning hover:bg-warning! hover:text-white!"
              title="Enviar a revisión"
              aria-label={`Enviar solicitud ${d.request_number} a revisión`}
            >
              <Send className="w-4 h-4" aria-hidden="true" />
              <span className="hidden lg:inline">Enviar</span>
            </Button>
          )}
          {onConfirmar && (
            <Button
              type="button"
              variant="outline"
              onClick={onConfirmar}
              className="h-9 px-3 rounded-lg gap-1.5 text-xs font-bold border-success/70! bg-success/15! text-success hover:bg-success! hover:text-white!"
              title="Confirmar y autorizar (funcionario que autoriza — dato 7)"
              aria-label={`Confirmar solicitud ${d.request_number}`}
            >
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">Confirmar</span>
            </Button>
          )}
          {onDevolver && (
            <Button
              type="button"
              variant="outline"
              onClick={onDevolver}
              className="w-9 h-9 p-0 rounded-lg"
              title="Devolver a borrador para corrección"
              aria-label={`Devolver solicitud ${d.request_number} a borrador`}
            >
              <Undo2 className="w-4 h-4" aria-hidden="true" />
            </Button>
          )}
          {onAnular && (
            <Button
              type="button"
              variant="outline"
              onClick={onAnular}
              className="w-9 h-9 p-0 rounded-lg border-destructive/50! text-destructive hover:bg-destructive! hover:text-white!"
              title="Anular solicitud"
              aria-label={`Anular solicitud ${d.request_number}`}
            >
              <Ban className="w-4 h-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Tabla profesional (modo tabla)
// ──────────────────────────────────────────────────────────────────────────

function TablaSolicitudes({
  solicitudes,
  sortKey,
  sortDir,
  onSort,
  accionesDoc,
}: {
  solicitudes: MaterialRequestDoc[];
  sortKey: 'created_at' | 'fecha_emision';
  sortDir: 'asc' | 'desc';
  onSort: (key: 'created_at' | 'fecha_emision') => void;
  accionesDoc: (d: MaterialRequestDoc) => AccionesSolicitud;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 border-b border-border">
          <tr>
            <th className="p-3 text-left font-black uppercase text-[10px] tracking-widest text-muted-foreground">Documento</th>
            <ThOrdenable label="F. emisión" activo={sortKey === 'fecha_emision'} dir={sortDir} onClick={() => onSort('fecha_emision')} />
            <th className="p-3 text-left font-black uppercase text-[10px] tracking-widest text-muted-foreground">Área solicitante</th>
            <th className="p-3 text-left font-black uppercase text-[10px] tracking-widest text-muted-foreground hidden md:table-cell">Almacén</th>
            <th className="p-3 text-right font-black uppercase text-[10px] tracking-widest text-muted-foreground">Líneas</th>
            <th className="p-3 text-left font-black uppercase text-[10px] tracking-widest text-muted-foreground">Estado</th>
            <th className="p-3 text-left font-black uppercase text-[10px] tracking-widest text-muted-foreground hidden lg:table-cell">Solicitante</th>
            <th className="p-3 text-left font-black uppercase text-[10px] tracking-widest text-muted-foreground hidden xl:table-cell">OT</th>
            <th className="p-3 text-right font-black uppercase text-[10px] tracking-widest text-muted-foreground">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {solicitudes.map(d => {
            const a = accionesDoc(d);
            return (
              <tr key={d.id} data-material-request-id={d.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                <td className="p-3 font-mono font-black text-primary whitespace-nowrap">{d.request_number}</td>
                <td className="p-3 text-muted-foreground whitespace-nowrap">{formatDate(d.fecha_emision)}</td>
                <td className="p-3 font-bold max-w-[220px] truncate" title={d.area_nombre}>{d.area_nombre}</td>
                <td className="p-3 text-muted-foreground hidden md:table-cell max-w-[160px] truncate" title={d.almacen_nombre}>{d.almacen_nombre}</td>
                <td className="p-3 text-right tabular-nums font-bold">{d.items?.length ?? 0}</td>
                <td className="p-3">
                  <DocumentStatusBadge type="material_request" status={d.status} size="xs" />
                </td>
                <td className="p-3 text-muted-foreground hidden lg:table-cell max-w-[140px] truncate" title={d.creator?.full_name || undefined}>
                  {d.creator?.full_name || '—'}
                </td>
                <td className="p-3 text-muted-foreground hidden xl:table-cell whitespace-nowrap">
                  {d.production_orders ? (
                    <span className="inline-flex items-center gap-1">
                      <Factory className="w-3 h-3" aria-hidden="true" />
                      {d.production_orders.order_number}
                    </span>
                  ) : '—'}
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  <div className="inline-flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={a.onVer}
                      className="w-8 h-8 p-0 rounded-lg"
                      title="Ver solicitud"
                      aria-label={`Ver solicitud ${d.request_number}`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                    {a.onEditar && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={a.onEditar}
                        className="w-8 h-8 p-0 rounded-lg"
                        title="Editar borrador"
                        aria-label={`Editar solicitud ${d.request_number}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {a.onEnviar && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={a.onEnviar}
                        className="h-8 px-2.5 rounded-lg gap-1 text-[10px] font-black uppercase border-warning/70! bg-warning/15! text-warning hover:bg-warning! hover:text-white!"
                        title="Enviar a revisión"
                        aria-label={`Enviar solicitud ${d.request_number} a revisión`}
                      >
                        <Send className="w-3.5 h-3.5" aria-hidden="true" />
                        <span className="hidden lg:inline">Enviar</span>
                      </Button>
                    )}
                    {a.onConfirmar && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={a.onConfirmar}
                        className="h-8 px-2.5 rounded-lg gap-1 text-[10px] font-black uppercase border-success/70! bg-success/15! text-success hover:bg-success! hover:text-white!"
                        title="Confirmar y autorizar"
                        aria-label={`Confirmar solicitud ${d.request_number}`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span className="hidden lg:inline">Confirmar</span>
                      </Button>
                    )}
                    {a.onDevolver && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={a.onDevolver}
                        className="w-8 h-8 p-0 rounded-lg"
                        title="Devolver a borrador para corrección"
                        aria-label={`Devolver solicitud ${d.request_number} a borrador`}
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {a.onAnular && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={a.onAnular}
                        className="w-8 h-8 p-0 rounded-lg border-destructive/50! text-destructive hover:bg-destructive! hover:text-white!"
                        title="Anular solicitud"
                        aria-label={`Anular solicitud ${d.request_number}`}
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ThOrdenable({
  label,
  activo,
  dir,
  onClick,
}: {
  label: string;
  activo: boolean;
  dir: 'asc' | 'desc';
  onClick: () => void;
}) {
  return (
    <th className="p-3 text-left" aria-sort={activo ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'inline-flex items-center gap-1 font-black uppercase text-[10px] tracking-widest hover:text-foreground transition-colors',
          activo ? 'text-foreground' : 'text-muted-foreground'
        )}
        aria-label={`Ordenar por ${label}`}
      >
        {label}
        <span aria-hidden="true" className="text-[9px]">{activo ? (dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Modales con motivo (devolver / anular)
// ──────────────────────────────────────────────────────────────────────────

function MotivoModal({
  open, title, icon: Icon, iconClass, descripcion, confirmLabel, confirmClass,
  motivo, setMotivo, onCancel, onConfirm, pending, requiereMotivo,
}: {
  open: boolean;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  descripcion: string;
  confirmLabel: string;
  confirmClass?: string;
  motivo: string;
  setMotivo: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
  requiereMotivo: boolean;
}) {
  const valido = !requiereMotivo || motivo.trim().length > 0;
  return (
    <BaseModal
      open={open}
      onOpenChange={o => { if (!o && !pending) onCancel(); }}
      aria-label={title}
      maxWidth="sm:max-w-md"
      title={
        <span className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
          <Icon className={cn('w-5 h-5', iconClass)} aria-hidden="true" />
          {title}
        </span>
      }
      footer={
        <>
          <SecondaryButton label="Cancelar" onClick={onCancel} disabled={pending} className="flex-1" />
          <PrimaryButton
            label={pending ? 'Procesando…' : confirmLabel}
            onClick={onConfirm}
            disabled={pending || !valido}
            className={cn('flex-1', confirmClass)}
          />
        </>
      }
    >
      <div className="py-4 space-y-3">
        <p className="text-xs text-muted-foreground text-center leading-relaxed">{descripcion}</p>
        <div>
          <label htmlFor="sm-motivo" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Motivo <span className="text-destructive">*</span>
          </label>
          <textarea
            id="sm-motivo"
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            rows={2}
            placeholder="Motivo de la acción (quedará en la auditoría del documento)…"
            className={cn('w-full mt-1 px-3 rounded-xl border border-border bg-background text-sm resize-none', touch)}
          />
        </div>
      </div>
    </BaseModal>
  );
}

function ReopenModal({ target, pending, onCancel, onConfirm }: {
  target: MaterialRequestDoc | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState('');
  useEffect(() => { if (target) setMotivo(''); }, [target]);
  return (
    <MotivoModal
      open={!!target}
      title="Devolver a Borrador"
      icon={Undo2}
      iconClass="text-primary"
      descripcion={`La solicitud ${target?.request_number || ''} volverá a estado Borrador para corregir su información (área, almacén, productos o cantidades). El motivo y el número de devoluciones quedan en la auditoría.`}
      confirmLabel="Devolver"
      motivo={motivo}
      setMotivo={setMotivo}
      onCancel={onCancel}
      onConfirm={() => onConfirm(motivo.trim())}
      pending={pending}
      requiereMotivo
    />
  );
}

function VoidModal({ target, pending, onCancel, onConfirm }: {
  target: MaterialRequestDoc | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState('');
  useEffect(() => { if (target) setMotivo(''); }, [target]);
  return (
    <MotivoModal
      open={!!target}
      title="Anular Solicitud"
      icon={Ban}
      iconClass="text-destructive"
      descripcion={`La solicitud ${target?.request_number || ''} quedará Anulada de forma definitiva (el documento y su numeración se conservan para trazabilidad; no se borra nada). Motivo obligatorio para la auditoría.`}
      confirmLabel="Anular definitivamente"
      confirmClass="!bg-destructive hover:!bg-destructive/90"
      motivo={motivo}
      setMotivo={setMotivo}
      onCancel={onCancel}
      onConfirm={() => onConfirm(motivo.trim())}
      pending={pending}
      requiereMotivo
    />
  );
}
