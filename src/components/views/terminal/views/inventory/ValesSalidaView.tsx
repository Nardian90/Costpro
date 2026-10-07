'use client';

/**
 * ValesSalidaView — Centro documental de Vales de Salida (issue_slips).
 *
 * Arquitectura (FASE 23 del brief — "UI nueva → servicios existentes"):
 *   - LISTADO/DETALLE: lectura vía cliente Supabase RLS (issue_slips tiene
 *     SELECT para authenticated + policy store_isolation) — mismo patrón que
 *     InventoryAdjustmentsView. El aislamiento multi-tienda lo garantiza RLS
 *     (current_user_store_ids), NO el filtro del frontend.
 *   - CREACIÓN: NO se duplica el formulario. El botón "+ Crear Vale de Salida"
 *     activa el modo Vale en el carrito existente (setOperationType('issue_slip'))
 *     y navega a Vender — MISMO flujo, MISMA RPC, MISMA numeración VS-NNNNNN-YYYY.
 *   - DEVOLUCIÓN: único mecanismo existente — POST /api/vale-salida/[id]/reverse
 *     → RPC reverse_vale_salida (entrada compensatoria + restauración OT + audit).
 *
 * Matriz de acciones (modelo REAL de issue_slips — no existe Borrador):
 *   | Estado               | Ver | Devolver |
 *   | Completado (nace)    | ✅  | ✅       |
 *   | Devuelto (reversado) | ✅  | ❌       |
 *   | Anulado (defensivo)  | ✅  | ❌       |
 * Editar/Confirmar/Anular no existen para vales y NO se inventan aquí.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Plus, Search, Loader2, Eye, RefreshCcw, ChevronDown, ChevronUp,
  Package, Undo2, FileText, Factory, ArrowLeftRight,
} from 'lucide-react';
import { cn, formatCurrency, formatDate, touch } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore, useUIStore } from '@/store';
import { useCartStore } from '@/store/cart';
import { canViewStore } from '@/lib/roles';
import { toast } from 'sonner';
import { DocumentStatusBadge } from '@/components/ui/DocumentStatusBadge';
import { ValeSalidaReverseModal } from './ValeSalidaReverseModal';
import { useQuery, useQueryClient } from '@tanstack/react-query';

// ──────────────────────────────────────────────────────────────────────────
// Tipos (espejo del esquema real issue_slips / issue_slip_items)
// ──────────────────────────────────────────────────────────────────────────
type ValeStatus = 'completed' | 'voided' | 'reversed';

interface ValeSalidaItem {
  id: string;
  slip_id: string;
  product_id: string;
  variant_id: string | null;
  production_order_item_id: string | null;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  products?: { name: string; sku: string | null } | null;
}

interface ValeSalidaDoc {
  id: string;
  store_id: string;
  slip_number: string;
  status: ValeStatus;
  production_order_id: string | null;
  notes: string;
  total_cost: number;
  created_by: string;
  created_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  items?: ValeSalidaItem[];
  creator?: { full_name: string } | null;
  voider?: { full_name: string } | null;
  production_orders?: { order_number: string; order_type: string } | null;
}

type StatusFilter = 'all' | ValeStatus;

const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  all: 'Todos',
  completed: 'Completados',
  reversed: 'Devueltos',
  voided: 'Anulados',
};

/** Embeds con FK hints (dos FKs hacia profiles → desambiguación por constraint). */
const VALE_SELECT = [
  '*',
  'items:issue_slip_items(*, products(name, sku))',
  'creator:profiles!issue_slips_created_by_fkey(full_name)',
  'voider:profiles!issue_slips_voided_by_fkey(full_name)',
  'production_orders(order_number, order_type)',
].join(', ');

export default function ValesSalidaView() {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId;
  const setCurrentView = useUIStore((s) => s.setCurrentView);
  const queryClient = useQueryClient();

  // Espejo de la autorización real de la RPC (has_store_access_as = membresía
  // activa en la tienda o admin global). La DB sigue siendo la última barrera.
  const canActInStore = canViewStore(user, storeId ?? '');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [reverseTarget, setReverseTarget] = useState<ValeSalidaDoc | null>(null);

  // T3: TanStack Query — mismo patrón que InventoryAdjustmentsView.
  // RLS acota a current_user_store_ids(); el eq(store_id) es solo orden/claridad.
  const { data: docs = [], isLoading, error: queryError, refetch } = useQuery({
    queryKey: ['vales-salida', storeId],
    queryFn: async () => {
      if (!storeId) return [] as ValeSalidaDoc[];
      const { data, error } = await supabase
        .from('issue_slips')
        .select(VALE_SELECT)
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as unknown as ValeSalidaDoc[];
    },
    enabled: !!storeId,
    staleTime: 30_000,
  });

  // Búsqueda: número, notas, creador y productos de las líneas (FASE 14 —
  // solo campos realmente disponibles; volumen acotado por limit(100)).
  const filtered = useMemo(() => {
    return docs.filter(d => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (!search.trim()) return true;
      const term = search.trim().toLowerCase();
      const inItems = d.items?.some(i => i.products?.name?.toLowerCase().includes(term)) ?? false;
      return (
        d.slip_number?.toLowerCase().includes(term) ||
        d.notes?.toLowerCase().includes(term) ||
        d.creator?.full_name?.toLowerCase().includes(term) ||
        d.production_orders?.order_number?.toLowerCase().includes(term) ||
        inItems
      );
    });
  }, [docs, search, statusFilter]);

  // FASE 8 — Crear: abre EL MISMO flujo existente (Vender → Carrito → Vale).
  // setOperationType('issue_slip') limpia pagos/cliente del carrito (store)
  // y POSCart renderiza ValeSalidaPanel. Cero formularios duplicados.
  const handleCreate = useCallback(() => {
    useCartStore.getState().setOperationType('issue_slip');
    setCurrentView('pos');
    toast.info('Modo Vale de Salida activado', {
      description: 'Agrega productos al carrito, escribe las notas y emite el vale desde Vender.',
    });
  }, [setCurrentView]);

  const handleReversed = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['vales-salida'] });
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
    queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
  }, [queryClient]);

  const totalItems = filtered.reduce((s, d) => s + (d.items?.length ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* ── Header (FASE 4) ── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tight">Vales de Salida</h2>
          <p className="text-xs text-muted-foreground">
            Salidas de inventario sin venta comercial — consulta, trazabilidad y devolución
          </p>
        </div>
        <button
          onClick={handleCreate}
          className={cn('flex items-center gap-2 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase hover:opacity-90 transition-all active:scale-95', touch)}
          aria-label="Crear Vale de Salida (abre el carrito en modo Vale)"
        >
          <Plus className="w-4 h-4" /> Crear Vale de Salida
        </button>
      </div>

      {/* ── Search + Filtro por estado (FASE 14) ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por número, notas, producto, OT o usuario..."
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
            <option key={k} value={k}>{STATUS_FILTER_LABELS[k]}</option>
          ))}
        </select>
        <button
          onClick={() => refetch()}
          className={cn('p-2 rounded-xl border border-border hover:bg-muted', touch)}
          aria-label="Recargar vales"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
        </button>
      </div>

      {/* ── Contador contextual ── */}
      {!isLoading && (
        <p className="text-[11px] text-muted-foreground font-medium">
          {filtered.length} vale(s) · {totalItems} línea(s) de producto
          {storeId ? '' : ' · Selecciona una tienda activa para ver sus vales'}
        </p>
      )}

      {/* ── Listado documental (FASE 5/6) ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20" role="status" aria-label="Cargando vales">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : queryError ? (
        <div className="text-center py-20">
          <p className="text-sm font-bold text-destructive">No se pudieron cargar los vales</p>
          <p className="text-xs text-muted-foreground mt-1">{String(queryError.message || queryError)}</p>
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
            {docs.length === 0 ? 'No hay Vales de Salida en esta tienda' : 'Ningún vale coincide con la búsqueda'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {docs.length === 0
              ? 'Emitidos desde Vender → Carrito → Vale de Salida, aparecerán aquí automáticamente'
              : 'Prueba con otro término o cambia el filtro de estado'}
          </p>
        </div>
      ) : (
        <div className="grid gap-2">
          {filtered.map(d => {
            const itemCount = d.items?.length ?? 0;
            return (
              <div
                key={d.id}
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
                    <p className="text-sm font-bold truncate">{d.notes || '—'}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(d.created_at)} • {d.creator?.full_name || '—'}
                      {itemCount > 0 && ` • ${itemCount} producto(s)`}
                      {d.total_cost > 0 && ` • ${formatCurrency(d.total_cost)}`}
                    </p>
                    {itemCount > 0 && (
                      <button
                        onClick={() => setExpandedDoc(expandedDoc === d.id ? null : d.id)}
                        className="text-xs text-primary font-bold mt-1 flex items-center gap-1"
                        aria-expanded={expandedDoc === d.id}
                        aria-controls={`vale-detail-${d.id}`}
                      >
                        Ver detalle
                        {expandedDoc === d.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {itemCount > 0 && (
                      <button
                        onClick={() => setExpandedDoc(expandedDoc === d.id ? null : d.id)}
                        className="w-10 h-10 inline-flex items-center justify-center rounded-lg border border-border hover:bg-primary hover:text-foreground transition-all active:scale-95"
                        title="Ver items del vale"
                        aria-label={`Ver items del vale ${d.slip_number}`}
                        aria-expanded={expandedDoc === d.id}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    )}
                    {/* Matriz de acciones: solo estado 'completed' admite devolución
                        (espejo de canReverse('issue_slip') + RPC reverse_vale_salida). */}
                    {d.status === 'completed' && canActInStore && (
                      <button
                        onClick={() => setReverseTarget(d)}
                        className="w-10 h-10 inline-flex items-center justify-center rounded-lg border border-purple-500/40 bg-purple-500/5 text-purple-500 dark:text-purple-400 hover:bg-purple-500 hover:text-white dark:hover:text-black transition-all active:scale-95"
                        title="Devolver vale (reversión: devuelve el stock descontado)"
                        aria-label={`Devolver vale ${d.slip_number}`}
                      >
                        <Undo2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Detalle expandible (FASE 13): items + trazabilidad ── */}
                {expandedDoc === d.id && d.items && (
                  <div id={`vale-detail-${d.id}`} className="mt-3 pt-3 border-t border-border/50 space-y-3">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                        <Package className="w-3 h-3" /> Productos
                      </p>
                      {d.items.map(item => (
                        <div key={item.id} className="flex items-center justify-between text-xs gap-2">
                          <span className="font-bold flex-1 truncate">
                            {item.products?.name || 'Producto eliminado'}
                            {item.products?.sku && (
                              <span className="ml-1.5 text-muted-foreground font-mono text-[10px]">{item.products.sku}</span>
                            )}
                          </span>
                          <span className="font-mono text-muted-foreground whitespace-nowrap tabular-nums">
                            ×{item.quantity}
                          </span>
                          <span className="font-mono text-muted-foreground whitespace-nowrap tabular-nums">
                            {formatCurrency(item.total_cost)}
                          </span>
                        </div>
                      ))}
                      {d.total_cost > 0 && (
                        <div className="flex items-center justify-between text-xs pt-1 border-t border-border/40">
                          <span className="font-black uppercase text-[10px] tracking-widest text-muted-foreground">Costo total</span>
                          <span className="font-mono font-black tabular-nums">{formatCurrency(d.total_cost)}</span>
                        </div>
                      )}
                    </div>

                    {/* Trazabilidad documental — solo campos existentes */}
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                        <FileText className="w-3 h-3" /> Trazabilidad
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <p className="text-muted-foreground">
                          Emitido por: <span className="font-bold text-foreground">{d.creator?.full_name || '—'}</span>
                        </p>
                        <p className="text-muted-foreground">
                          Fecha de emisión: <span className="font-bold text-foreground">{formatDate(d.created_at)}</span>
                        </p>
                        {d.production_orders && (
                          <p className="text-muted-foreground">
                            Documento relacionado:{' '}
                            <span className="font-bold text-foreground">
                              OT {d.production_orders.order_number} ({d.production_orders.order_type})
                            </span>
                          </p>
                        )}
                        {d.status === 'reversed' && (
                          <>
                            <p className="text-muted-foreground">
                              Devuelto por: <span className="font-bold text-foreground">{d.voider?.full_name || '—'}</span>
                            </p>
                            <p className="text-muted-foreground">
                              Fecha de devolución: <span className="font-bold text-foreground">{formatDate(d.voided_at)}</span>
                            </p>
                            {d.void_reason && (
                              <p className="text-muted-foreground sm:col-span-2">
                                Motivo: <span className="font-bold text-foreground">{d.void_reason}</span>
                              </p>
                            )}
                          </>
                        )}
                        {d.status === 'voided' && (
                          <p className="text-muted-foreground sm:col-span-2">
                            Anulado: <span className="font-bold text-foreground">{formatDate(d.voided_at)}</span>
                            {d.voider?.full_name && ` • ${d.voider.full_name}`}
                            {d.void_reason && ` • ${d.void_reason}`}
                          </p>
                        )}
                      </div>
                      {d.status === 'completed' && (
                        <p className="text-[10px] text-muted-foreground italic flex items-center gap-1 pt-1">
                          <ArrowLeftRight className="w-3 h-3" aria-hidden="true" />
                          El stock ya fue descontado. La devolución genera la entrada compensatoria.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Devolución (FASE 12): endpoint existente /api/vale-salida/[id]/reverse ── */}
      <ValeSalidaReverseModal
        isOpen={!!reverseTarget}
        onClose={() => setReverseTarget(null)}
        slipId={reverseTarget?.id ?? ''}
        docLabel={reverseTarget ? `Vale ${reverseTarget.slip_number} • ${reverseTarget.notes || ''}` : undefined}
        onReversed={handleReversed}
      />
    </div>
  );
}
