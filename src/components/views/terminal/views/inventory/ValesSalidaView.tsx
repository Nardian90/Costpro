'use client';

/**
 * ValesSalidaView — Centro documental PROFESIONAL de Vales de Salida.
 *
 * Profesionalización (PR #1381 — brief "Vales de Salida, módulo propio"):
 *
 *   1. FLUJO DEDICADO: «Crear Vale de Salida» abre ValeSalidaCreateModal
 *      DENTRO de este módulo. NO reutiliza el carrito ni el checkout de
 *      Vender (que siguen existiendo como mecanismo operativo en Ventas).
 *      La emisión llama al MISMO endpoint /api/vale-salida → misma RPC
 *      create_vale_salida → cero duplicación de lógica de negocio.
 *
 *   2. «VER» = DOCUMENTO REAL: abre ValeSalidaDetalleModal con encabezado
 *      documental (VALE DE SALIDA · número · estado · responsable · almacén),
 *      tabla de productos con unidades, trazabilidad y los movimientos de
 *      inventario del vale (stock_movements.reference_id = issue_slips.id).
 *
 *   3. DOS MODOS DE VISUALIZACIÓN: tarjetas (mejorado) y TABLA profesional
 *      densa, ordenable y con persistencia del modo (localStorage).
 *
 *   4. LISTADO con paginación real «Cargar más» (useInfiniteQuery sobre la
 *      misma consulta RLS — antes limit(100) silencioso), unidades reales,
 *      contadores por estado y estados vacíos alineados con el módulo.
 *
 * Matriz de acciones (modelo REAL issue_slips — MISIÓN RES. 11 2026-10-31:
 * el vale puede nacer 'pending' (En Revisión) y confirmarse después):
 *   | Estado               | Ver | Confirmar | Anular | Devolver |
 *   | Pending (en revisión)| ✅  | ✅        | ✅     | ❌       |
 *   | Completado           | ✅  | ❌        | ❌     | ✅       |
 *   | Devuelto (reversado) | ✅  | ❌        | ❌     | ❌       |
 *   | Anulado (defensivo)  | ✅  | ❌        | ❌     | ❌       |
 *
 * FIX UI/UX (evidencia del usuario — 09/10/2026):
 *   - Breadcrumb DUPLICADO eliminado: el shell ya renderiza el
 *     NavigationBreadcrumb global (Inicio › Operación › Almacén › Vales de
 *     Salida); la copia interna «Ubicación actual» fue retirada (mismo
 *     patrón que ManagementHubView — F4/IA-F04).
 *   - Botones de acción ahora VISIBLES: «Ver» = botón relleno (secondary)
 *     con etiqueta e icono; «Devolver» = botón violeta de alto contraste
 *     con etiqueta e icono. Antes eran icon-only outline con opacidad 5%
 *     — prácticamente invisibles en modo oscuro (evidencia adjunta).
 *
 * Autorización: RLS acota las filas (current_user_store_ids); canViewStore
 * espeja la RPC de reversión. La base de datos sigue siendo la última barrera.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, Loader2, Eye, RefreshCcw, Package, Undo2, Ban,
  Factory, LayoutList, List, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { cn, formatCurrency, formatDate, touch } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store';
import { canViewStore } from '@/lib/roles';
import { DocumentStatusBadge } from '@/components/ui/DocumentStatusBadge';
import { Button } from '@/components/ui/button';
import { BaseModal } from '@/components/ui/BaseModal';
import { PrimaryButton, SecondaryButton } from '@/components/ui/atomic';
import { ValeSalidaReverseModal } from './ValeSalidaReverseModal';
import { ValeSalidaDetalleModal, type ValeSalidaDoc } from './ValeSalidaDetalleModal';
import { ValeSalidaCreateModal } from './ValeSalidaCreateModal';
import { toast } from 'sonner';
import { formatearCantidad } from '@/lib/inventory/kardexPeriod';

// ──────────────────────────────────────────────────────────────────────────
// Tipos (espejo del esquema real issue_slips / issue_slip_items)
// ──────────────────────────────────────────────────────────────────────────

type ValeStatus = 'pending' | 'completed' | 'voided' | 'reversed';
type StatusFilter = 'all' | ValeStatus;
type ViewMode = 'cards' | 'table';

const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  all: 'Todos',
  pending: 'En Revisión',
  completed: 'Completados',
  reversed: 'Devueltos',
  voided: 'Anulados',
};

const VIEW_MODE_KEY = 'vales_salida_view_mode';
const PAGE_SIZE = 50;

/** Embeds con FK hints (dos FKs hacia profiles → desambiguación por constraint). */
const VALE_SELECT = [
  '*',
  'items:issue_slip_items(*, products(name, sku, unit_of_measure))',
  'creator:profiles!issue_slips_created_by_fkey(full_name)',
  'voider:profiles!issue_slips_voided_by_fkey(full_name)',
  'confirmer:profiles!issue_slips_confirmed_by_fkey(full_name)',
  'production_orders(order_number, order_type)',
].join(', ');

// ──────────────────────────────────────────────────────────────────────────
// Componente principal
// ──────────────────────────────────────────────────────────────────────────

export default function ValesSalidaView() {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId;
  const queryClient = useQueryClient();

  // Espejo de la autorización real de la RPC (has_store_access_as). La DB
  // sigue siendo la última barrera.
  const canActInStore = canViewStore(user, storeId ?? '');

  // Nombre del almacén activo (para encabezados documentales del módulo).
  const storeName = useMemo(() => {
    const m = user?.memberships?.find(mem => mem.store_id === storeId);
    return (m?.store as { name?: string } | null | undefined)?.name ?? null;
  }, [user, storeId]);

  // ── Modo de visualización persistido (requisito 5: dos modos) ──
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // ── Orden (modo tabla, client-side sobre documentos cargados) ──
  const [sortKey, setSortKey] = useState<'created_at' | 'total_cost'>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const alternarOrden = useCallback((key: 'created_at' | 'total_cost') => {
    if (sortKey === key) {
      setSortDir(d => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }, [sortKey]);

  // ── Modales ──
  const [createOpen, setCreateOpen] = useState(false);
  const [detalleDoc, setDetalleDoc] = useState<ValeSalidaDoc | null>(null);
  const [reverseTarget, setReverseTarget] = useState<ValeSalidaDoc | null>(null);
  // MISIÓN RES. 11 (2026-10-31): confirmación/anulación de vales En Revisión.
  const [confirmTarget, setConfirmTarget] = useState<ValeSalidaDoc | null>(null);
  const [voidTarget, setVoidTarget] = useState<ValeSalidaDoc | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);

  // ── Consulta RLS paginada (misma fuente de verdad, «Cargar más» real) ──
  const query = useInfiniteQuery({
    queryKey: ['vales-salida', storeId],
    queryFn: async ({ pageParam }) => {
      if (!storeId) return { docs: [] as ValeSalidaDoc[], hasMore: false };
      const from = pageParam * PAGE_SIZE;
      const { data, error } = await supabase
        .from('issue_slips')
        .select(VALE_SELECT)
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      const docs = (data || []) as unknown as ValeSalidaDoc[];
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

  // ── Búsqueda/filtro (client-side sobre páginas cargadas, con aviso honesto) ──
  const filtered = useMemo(() => {
    const base = docs.filter(d => statusFilter === 'all' || d.status === statusFilter);
    const term = search.trim().toLowerCase();
    if (!term) return base;
    return base.filter(d => {
      const inItems = d.items?.some(i =>
        i.products?.name?.toLowerCase().includes(term) || i.products?.sku?.toLowerCase().includes(term)
      ) ?? false;
      return (
        d.slip_number?.toLowerCase().includes(term) ||
        d.notes?.toLowerCase().includes(term) ||
        d.creator?.full_name?.toLowerCase().includes(term) ||
        d.production_orders?.order_number?.toLowerCase().includes(term) ||
        inItems
      );
    });
  }, [docs, search, statusFilter]);

  // Orden client-side para modo tabla (fecha o costo).
  const ordenados = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const va = sortKey === 'total_cost' ? Number(a.total_cost ?? 0) : Date.parse(a.created_at || '');
      const vb = sortKey === 'total_cost' ? Number(b.total_cost ?? 0) : Date.parse(b.created_at || '');
      return sortDir === 'desc' ? vb - va : va - vb;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  // Contadores por estado SOLO sobre el conjunto filtrado por búsqueda
  // (los contadores reflejan lo que el usuario está viendo).
  const conteoEstados = useMemo(() => {
    const term = search.trim().toLowerCase();
    const base = docs.filter(d => {
      if (!term) return true;
      const inItems = d.items?.some(i => i.products?.name?.toLowerCase().includes(term)) ?? false;
      return (
        d.slip_number?.toLowerCase().includes(term) ||
        d.notes?.toLowerCase().includes(term) ||
        d.creator?.full_name?.toLowerCase().includes(term) ||
        d.production_orders?.order_number?.toLowerCase().includes(term) ||
        inItems
      );
    });
    return {
      all: base.length,
      pending: base.filter(d => d.status === 'pending').length,
      completed: base.filter(d => d.status === 'completed').length,
      reversed: base.filter(d => d.status === 'reversed').length,
      voided: base.filter(d => d.status === 'voided').length,
    };
  }, [docs, search]);

  const totalLineas = useMemo(
    () => filtered.reduce((s, d) => s + (d.items?.length ?? 0), 0),
    [filtered]
  );

  // ── Acciones ──
  // Requisito 1: el botón Crear abre el flujo DEDICADO del módulo. Ya NO
  // navega a Vender ni toca el carrito (la venta conserva su propio acceso).
  const handleCreate = useCallback(() => {
    setCreateOpen(true);
  }, []);

  const handleEmitido = useCallback((resultado: { vale_status?: string; slip_number?: string }) => {
    queryClient.invalidateQueries({ queryKey: ['vales-salida'] });
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
    queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
    queryClient.invalidateQueries({ queryKey: ['kardex'] });
    queryClient.invalidateQueries({ queryKey: ['product-kardex'] });
    if (resultado?.vale_status === 'pending') {
      toast.success(`Vale ${resultado.slip_number || ''} guardado en revisión`, {
        description: 'El stock NO se ha descontado: revisa el documento y confírmalo cuando estés seguro.',
      });
    } else {
      toast.success('Vale de Salida emitido', {
        description: 'El stock fue descontado y el documento ya aparece en el listado.',
      });
    }
  }, [queryClient]);

  const handleReversed = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['vales-salida'] });
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
    queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
    // CP-INV-009: la reversión genera movimientos issue_slip_reverse que deben
    // verse en el Kardex de inmediato (criterio de aceptación de la tarea).
    queryClient.invalidateQueries({ queryKey: ['kardex'] });
    queryClient.invalidateQueries({ queryKey: ['product-kardex'] });
  }, [queryClient]);

  // ── Confirmación de vale En Revisión (misión Res. 11, 2026-10-31) ──
  // Acción EXPLÍCITA con validaciones de servidor: la RPC confirm_vale_salida
  // valida el estado con lock FOR UPDATE (evita dobles confirmaciones),
  // aplica los movimientos issue_slip_out y registra confirmed_at/confirmed_by.
  const [voidMotivo, setVoidMotivo] = useState('');
  useEffect(() => { if (voidTarget) setVoidMotivo(''); }, [voidTarget]);

  const handleConfirmPending = useCallback(async (d: ValeSalidaDoc) => {
    setActionPending('confirm');
    try {
      const { error } = await supabase.rpc('confirm_vale_salida', {
        p_slip_id: d.id,
        p_user_id: null,
      });
      if (error) throw error;
      toast.success(`Vale ${d.slip_number} confirmado`, {
        description: 'El stock fue descontado y los movimientos quedaron registrados en el kardex.',
      });
      queryClient.invalidateQueries({ queryKey: ['vales-salida'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['kardex'] });
      queryClient.invalidateQueries({ queryKey: ['product-kardex'] });
      if (detalleDoc?.id === d.id) setDetalleDoc(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error('No se pudo confirmar el vale: ' + msg, { duration: 9000 });
    } finally {
      setActionPending(null);
      setConfirmTarget(null);
    }
  }, [queryClient, detalleDoc]);

  const handleVoidPending = useCallback(async (d: ValeSalidaDoc, motivo: string) => {
    setActionPending('void');
    try {
      const { error } = await supabase.rpc('void_vale_salida', {
        p_slip_id: d.id,
        p_reason: motivo,
        p_user_id: null,
      });
      if (error) throw error;
      toast.success(`Vale ${d.slip_number} anulado`, {
        description: 'El vale estaba en revisión: ningún efecto en inventario. La anulación queda en la auditoría.',
      });
      queryClient.invalidateQueries({ queryKey: ['vales-salida'] });
      if (detalleDoc?.id === d.id) setDetalleDoc(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error('No se pudo anular el vale: ' + msg, { duration: 9000 });
    } finally {
      setActionPending(null);
      setVoidTarget(null);
    }
  }, [queryClient, detalleDoc]);

  const isLoading = query.isLoading;
  const queryError = query.error;
  const hasMore = query.hasNextPage;

  return (
    <div className="space-y-4">
      {/* ── Header documental ── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tight">Vales de Salida</h2>
          <p className="text-xs text-muted-foreground">
            Documentos de salida de almacén sin venta comercial{storeName ? ` · ${storeName}` : ''}
          </p>
        </div>
        <Button
          type="button"
          onClick={handleCreate}
          className="h-10 px-4 rounded-xl text-xs font-black uppercase tracking-wide"
          aria-label="Crear Vale de Salida (flujo dedicado del módulo)"
        >
          <Plus className="w-4 h-4" /> Crear Vale de Salida
        </Button>
      </div>

      {/* ── Búsqueda + filtro de estado + modo de vista ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por número, concepto, producto, código, OT o usuario…"
            aria-label="Buscar vales de salida"
            className={cn('w-full pl-10 pr-4 rounded-xl border border-border bg-background text-sm', touch)}
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as StatusFilter)}
          className={cn('px-3 rounded-xl border border-border bg-background text-xs font-bold uppercase', touch)}
          aria-label="Filtrar por estado"
        >
          {(Object.keys(STATUS_FILTER_LABELS) as StatusFilter[]).map(k => (
            <option key={k} value={k}>
              {STATUS_FILTER_LABELS[k]}{k !== 'all' ? ` (${conteoEstados[k]})` : ''}
            </option>
          ))}
        </select>

        {/* Toggle de modo de visualización (requisito 5) */}
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
          aria-label="Recargar vales"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
        </Button>
      </div>

      {/* ── Contador contextual (respeta búsqueda; conteo por estado) ── */}
      {!isLoading && (
        <p className="text-[11px] text-muted-foreground font-medium">
          {filtered.length} vale(s) · {totalLineas} línea(s) de producto
          {hasMore && !search && ' · cargando más disponible'}
          {(hasMore && search) && ' · la búsqueda cubre los vales ya cargados — usa «Cargar más» para buscar en más historial'}
          {storeId ? '' : ' · Selecciona una tienda activa para ver sus vales'}
        </p>
      )}

      {/* ── Contenido: estados + dos modos ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20" role="status" aria-label="Cargando vales">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : queryError ? (
        <div className="text-center py-20">
          <AlertTriangle className="w-10 h-10 text-destructive/60 mx-auto mb-3" aria-hidden="true" />
          <p className="text-sm font-bold text-destructive">No se pudieron cargar los vales</p>
          <p className="text-xs text-muted-foreground mt-1">{String((queryError as Error)?.message || queryError)}</p>
          <Button type="button" variant="outline" className="mt-4" onClick={() => query.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : !storeId ? (
        <div className="text-center py-20">
          <Package className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-bold text-muted-foreground">Sin tienda activa</p>
          <p className="text-xs text-muted-foreground mt-1">
            Selecciona una tienda para consultar sus Vales de Salida
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Package className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-bold text-muted-foreground">
            {docs.length === 0 ? 'Aún no hay Vales de Salida en esta tienda' : 'Ningún vale coincide con la búsqueda'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {docs.length === 0
              ? 'Usa «Crear Vale de Salida» para emitir el primer documento desde este módulo'
              : 'Prueba con otro término o cambia el filtro de estado'}
          </p>
        </div>
      ) : viewMode === 'table' ? (
        <TablaVales
          vales={ordenados}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={alternarOrden}
          canActInStore={canActInStore}
          onVer={setDetalleDoc}
          onDevolver={setReverseTarget}
          onConfirmar={setConfirmTarget}
          onAnular={setVoidTarget}
        />
      ) : (
        <div className="grid gap-2">
          {ordenados.map(d => (
            <TarjetaVale
              key={d.id}
              vale={d}
              canActInStore={canActInStore}
              onVer={setDetalleDoc}
              onDevolver={setReverseTarget}
              onConfirmar={setConfirmTarget}
              onAnular={setVoidTarget}
            />
          ))}
        </div>
      )}

      {/* ── Paginación «Cargar más» (misma consulta RLS) ── */}
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
              'Cargar más vales'
            )}
          </Button>
          <span className="text-[10px] font-bold text-muted-foreground">
            Mostrando {docs.length} documento(s)
          </span>
        </div>
      )}

      {/* ── Flujo dedicado de creación (requisito 1/3) ── */}
      <ValeSalidaCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        storeId={storeId ?? null}
        storeName={storeName}
        onEmitido={handleEmitido}
      />

      {/* ── Documento real (requisito 7/8) ── */}
      <ValeSalidaDetalleModal
        open={!!detalleDoc}
        onClose={() => setDetalleDoc(null)}
        vale={detalleDoc}
        storeName={storeName}
        canReverse={canActInStore}
        onReverse={v => { setDetalleDoc(null); setReverseTarget(v); }}
      />

      {/* ── Devolución (endpoint existente /api/vale-salida/[id]/reverse) ── */}
      <ValeSalidaReverseModal
        isOpen={!!reverseTarget}
        onClose={() => setReverseTarget(null)}
        slipId={reverseTarget?.id ?? ''}
        docLabel={reverseTarget ? `Vale ${reverseTarget.slip_number} • ${reverseTarget.notes || ''}` : undefined}
        onReversed={handleReversed}
      />

      {/* ── Confirmación de vale En Revisión (misión Res. 11, 2026-10-31) ── */}
      <BaseModal
        open={!!confirmTarget}
        onOpenChange={o => { if (!o) setConfirmTarget(null); }}
        aria-label="Confirmar vale"
        maxWidth="sm:max-w-md"
        title={
          <span className="text-lg font-black uppercase tracking-tight flex items-center gap-2 text-success">
            <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
            Confirmar Vale
          </span>
        }
        footer={
          <>
            <SecondaryButton label="Cancelar" onClick={() => setConfirmTarget(null)} disabled={!!actionPending} className="flex-1" />
            <PrimaryButton
              label={actionPending === 'confirm' ? 'Confirmando…' : 'Confirmar y descontar stock'}
              onClick={() => confirmTarget && handleConfirmPending(confirmTarget)}
              disabled={!!actionPending}
              className="flex-1 !bg-success hover:!bg-success/90"
            />
          </>
        }
      >
        <div className="py-4 space-y-3">
          <p className="font-bold text-center text-sm">
            ¿Confirmar el vale {confirmTarget?.slip_number}?
          </p>
          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            Esto descontará el stock de los productos listados, registrará los movimientos en el kardex
            (y el consumo de OT si aplica) y marcará el documento como <span className="font-bold text-success">Completado</span>.
            El costo se calculará servidor con el costo promedio vigente. La acción no puede deshacerse
            (la corrección posterior es la Devolución/Reversión).
          </p>
          {confirmTarget?.items && confirmTarget.items.length > 0 && (
            <div className="rounded-xl bg-muted/50 border border-border p-3 space-y-1">
              <p className="text-xs font-black uppercase text-muted-foreground mb-1">
                {confirmTarget.items.length} salida(s) a aplicar
              </p>
              {confirmTarget.items.map(it => (
                <div key={it.id} className="flex items-center justify-between text-xs gap-2">
                  <span className="font-bold truncate flex-1">{it.products?.name || '—'}</span>
                  <span className="font-mono font-black text-destructive whitespace-nowrap">
                    −{formatearCantidad(Number(it.quantity))} {it.products?.unit_of_measure || ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </BaseModal>

      {/* ── Anulación de vale En Revisión ── */}
      <BaseModal
        open={!!voidTarget}
        onOpenChange={o => { if (!o && !actionPending) setVoidTarget(null); }}
        aria-label="Anular vale en revisión"
        maxWidth="sm:max-w-md"
        title={
          <span className="text-lg font-black uppercase tracking-tight flex items-center gap-2 text-destructive">
            <Ban className="w-5 h-5" aria-hidden="true" />
            Anular Vale en Revisión
          </span>
        }
        footer={
          <>
            <SecondaryButton label="Cancelar" onClick={() => setVoidTarget(null)} disabled={!!actionPending} className="flex-1" />
            <PrimaryButton
              label={actionPending === 'void' ? 'Anulando…' : 'Anular definitivamente'}
              onClick={() => voidTarget && handleVoidPending(voidTarget, voidMotivo.trim())}
              disabled={!!actionPending || voidMotivo.trim().length === 0}
              className="flex-1 !bg-destructive hover:!bg-destructive/90"
            />
          </>
        }
      >
        <div className="py-4 space-y-3">
          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            El vale {voidTarget?.slip_number || ''} está <span className="font-bold">En Revisión</span>:
            nunca descontó stock, por lo que la anulación no tiene efecto en inventario. El documento y su
            numeración se conservan para trazabilidad (no se borra nada). Motivo obligatorio para la auditoría.
          </p>
          <div>
            <label htmlFor="vale-anular-motivo" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Motivo <span className="text-destructive">*</span>
            </label>
            <textarea
              id="vale-anular-motivo"
              value={voidMotivo}
              onChange={e => setVoidMotivo(e.target.value)}
              rows={2}
              placeholder="Motivo de la anulación…"
              className={cn('w-full mt-1 px-3 rounded-xl border border-border bg-background text-sm resize-none', touch)}
            />
          </div>
        </div>
      </BaseModal>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Tarjeta de vale (modo tarjetas — mejorado)
// ──────────────────────────────────────────────────────────────────────────

function TarjetaVale({
  vale: d,
  canActInStore,
  onVer,
  onDevolver,
  onConfirmar,
  onAnular,
}: {
  vale: ValeSalidaDoc;
  canActInStore: boolean;
  onVer: (d: ValeSalidaDoc) => void;
  onDevolver: (d: ValeSalidaDoc) => void;
  onConfirmar: (d: ValeSalidaDoc) => void;
  onAnular: (d: ValeSalidaDoc) => void;
}) {
  const itemCount = d.items?.length ?? 0;
  return (
    <div
      data-vale-id={d.id}
      className="p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-mono text-xs font-black text-primary">{d.slip_number}</span>
            <DocumentStatusBadge type="issue_slip" status={d.status} size="xs" />
            {d.production_orders && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground bg-muted/60 rounded px-1.5 py-0.5">
                <Factory className="w-3 h-3" aria-hidden="true" />
                OT {d.production_orders.order_number}
              </span>
            )}
          </div>
          <p className="text-sm font-bold truncate" title={d.notes || undefined}>
            {d.notes || <span className="text-muted-foreground font-normal">Sin concepto registrado</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDate(d.created_at)} • {d.creator?.full_name || '—'}
            {itemCount > 0 && ` • ${itemCount} producto(s)`}
            {d.total_cost > 0 && ` • ${formatCurrency(d.total_cost)}`}
            {d.status === 'pending' && ' • el stock NO se ha descontado'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Historial de visibilidad: icon-only outline (invisible en dark)
              → secondary relleno (etiqueta, #1384) → OUTLINE del design system
              con etiqueta (E2E-AUDIT 2026-10-09: contraste + coherencia verde). */}
          <Button
            type="button"
            variant="outline"
            onClick={() => onVer(d)}
            className="h-10 px-3.5 rounded-lg gap-1.5 text-xs font-bold"
            title="Ver Vale de Salida"
            aria-label={`Ver vale ${d.slip_number}`}
          >
            <Eye className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">Ver</span>
          </Button>
          {/* MISIÓN RES. 11 (2026-10-31) — vale En Revisión: Confirmar (acción
              explícita que descuenta stock) y Anular (sin efectos en stock). */}
          {d.status === 'pending' && canActInStore && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onAnular(d)}
                className="h-10 px-3.5 rounded-lg gap-1.5 text-xs font-bold border-destructive/50! text-destructive hover:bg-destructive! hover:text-white!"
                title="Anular el vale en revisión (sin efecto en stock)"
                aria-label={`Anular vale en revisión ${d.slip_number}`}
              >
                <Ban className="w-4 h-4" aria-hidden="true" />
                <span className="hidden xl:inline">Anular</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => onConfirmar(d)}
                className="h-10 px-3.5 rounded-lg gap-1.5 text-xs font-bold border-success/70! bg-success/15! text-success hover:bg-success! hover:text-white!"
                title="Confirmar el vale: descuenta el stock y lo marca Completado"
                aria-label={`Confirmar vale ${d.slip_number}`}
              >
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline">Confirmar</span>
              </Button>
            </>
          )}
          {/* Matriz de acciones: solo 'completed' admite devolución
              (espejo de canReverse('issue_slip') + RPC reverse_vale_salida). */}
          {d.status === 'completed' && canActInStore && (
            <Button
              type="button"
              variant="outline"
              onClick={() => onDevolver(d)}
              className="h-10 px-3.5 rounded-lg gap-1.5 text-xs font-bold border-purple-500/70! bg-purple-500/20! text-purple-700 dark:text-purple-300 hover:bg-purple-500! hover:text-white! dark:hover:bg-purple-500! dark:hover:text-white!"
              title="Devolver vale (reversión: devuelve el stock descontado)"
              aria-label={`Devolver vale ${d.slip_number}`}
            >
              <Undo2 className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">Devolver</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Tabla profesional (modo tabla — requisito 5/6)
// ──────────────────────────────────────────────────────────────────────────

function TablaVales({
  vales,
  sortKey,
  sortDir,
  onSort,
  canActInStore,
  onVer,
  onDevolver,
  onConfirmar,
  onAnular,
}: {
  vales: ValeSalidaDoc[];
  sortKey: 'created_at' | 'total_cost';
  sortDir: 'asc' | 'desc';
  onSort: (key: 'created_at' | 'total_cost') => void;
  canActInStore: boolean;
  onVer: (d: ValeSalidaDoc) => void;
  onDevolver: (d: ValeSalidaDoc) => void;
  onConfirmar: (d: ValeSalidaDoc) => void;
  onAnular: (d: ValeSalidaDoc) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 border-b border-border">
          <tr>
            <th className="p-3 text-left font-black uppercase text-[10px] tracking-widest text-muted-foreground">Documento</th>
            <ThOrdenable label="Fecha" activo={sortKey === 'created_at'} dir={sortDir} onClick={() => onSort('created_at')} />
            <th className="p-3 text-left font-black uppercase text-[10px] tracking-widest text-muted-foreground">Concepto</th>
            <th className="p-3 text-right font-black uppercase text-[10px] tracking-widest text-muted-foreground">Líneas</th>
            <ThOrdenable label="Costo" activo={sortKey === 'total_cost'} dir={sortDir} onClick={() => onSort('total_cost')} align="right" />
            <th className="p-3 text-left font-black uppercase text-[10px] tracking-widest text-muted-foreground">Estado</th>
            <th className="p-3 text-left font-black uppercase text-[10px] tracking-widest text-muted-foreground hidden lg:table-cell">Responsable</th>
            <th className="p-3 text-left font-black uppercase text-[10px] tracking-widest text-muted-foreground hidden xl:table-cell">OT</th>
            <th className="p-3 text-right font-black uppercase text-[10px] tracking-widest text-muted-foreground">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {vales.map(d => (
            <tr key={d.id} data-vale-id={d.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
              <td className="p-3 font-mono font-black text-primary whitespace-nowrap">{d.slip_number}</td>
              <td className="p-3 text-muted-foreground whitespace-nowrap">{formatDate(d.created_at)}</td>
              <td className="p-3 font-bold max-w-[260px] truncate" title={d.notes || undefined}>
                {d.notes || <span className="text-muted-foreground font-normal">—</span>}
              </td>
              <td className="p-3 text-right tabular-nums font-bold">{d.items?.length ?? 0}</td>
              <td className="p-3 text-right tabular-nums font-bold whitespace-nowrap">
                {d.total_cost > 0 ? formatCurrency(d.total_cost) : <span className="text-muted-foreground">—</span>}
              </td>
              <td className="p-3">
                <DocumentStatusBadge type="issue_slip" status={d.status} size="xs" />
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
                <div className="inline-flex items-center gap-1.5">
                  {/* FIX visibilidad (tabla): relleno secondary + etiqueta en
                      Devolver — antes icon-only outline de bajo contraste. */}
                  {/* E2E-AUDIT FIX (2026-10-09): outline (design system) en
                      lugar de secondary — coherente con la acción Devolver. */}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onVer(d)}
                    className="w-8 h-8 p-0 rounded-lg"
                    title="Ver Vale de Salida"
                    aria-label={`Ver vale ${d.slip_number}`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                  {d.status === 'pending' && canActInStore && (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => onAnular(d)}
                        className="w-8 h-8 p-0 rounded-lg border-destructive/50! text-destructive hover:bg-destructive! hover:text-white!"
                        title="Anular el vale en revisión (sin efecto en stock)"
                        aria-label={`Anular vale en revisión ${d.slip_number}`}
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => onConfirmar(d)}
                        className="h-8 px-2.5 rounded-lg gap-1 text-[10px] font-black uppercase border-success/70! bg-success/15! text-success hover:bg-success! hover:text-white!"
                        title="Confirmar el vale: descuenta el stock y lo marca Completado"
                        aria-label={`Confirmar vale ${d.slip_number}`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span className="hidden lg:inline">Confirmar</span>
                      </Button>
                    </>
                  )}
                  {d.status === 'completed' && canActInStore && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onDevolver(d)}
                      className="h-8 px-2.5 rounded-lg gap-1 text-[10px] font-black uppercase border-purple-500/70! bg-purple-500/20! text-purple-700 dark:text-purple-300 hover:bg-purple-500! hover:text-white! dark:hover:bg-purple-500! dark:hover:text-white!"
                      title="Devolver vale (reversión: devuelve el stock descontado)"
                      aria-label={`Devolver vale ${d.slip_number}`}
                    >
                      <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span className="hidden lg:inline">Devolver</span>
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
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
  align = 'left',
}: {
  label: string;
  activo: boolean;
  dir: 'asc' | 'desc';
  onClick: () => void;
  align?: 'left' | 'right';
}) {
  return (
    <th className={cn('p-3', align === 'right' ? 'text-right' : 'text-left')} aria-sort={activo ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
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
