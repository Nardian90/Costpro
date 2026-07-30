'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Plus, Search, Ban, Undo2, Copy, X, Loader2, Eye, RefreshCcw, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
import { DocumentStatusBadge, canReverse } from '@/components/ui/DocumentStatusBadge';
import { ReverseDocumentModal } from '@/components/ui/ReverseDocumentModal';
import { DuplicateDocumentModal } from '@/components/ui/DuplicateDocumentModal';
import { DestructiveConfirmModal } from '@/components/ui/DestructiveConfirmModal';
import { BaseModal } from '@/components/ui/BaseModal';
import { PrimaryButton, SecondaryButton } from '@/components/ui/atomic';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '@/hooks/ui/useDebounce';

import { Button } from "@/components/ui/button";
// ──────────────────────────────────────────────────────────────────────────
// Tipos (T1: sin `any`)
// ──────────────────────────────────────────────────────────────────────────
interface AdjustmentDoc {
  id: string;
  store_id: string;
  status: 'pending' | 'confirmed' | 'reversed' | 'voided';
  reason: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
  reversed_at: string | null;
  reversal_reason: string | null;
  items?: AdjustmentItem[];
  creator?: { full_name: string } | null;
}

interface AdjustmentItem {
  id: string;
  adjustment_id: string;
  product_id: string;
  expected_quantity: number;
  counted_quantity: number;
  products?: { name: string; sku: string | null } | null;
}

interface ProductSearchResult {
  id: string;
  name: string;
  sku: string | null;
  stock_current: number;
  cost_average: number;
}

const touch = 'min-h-[44px]';

// ──────────────────────────────────────────────────────────────────────────
// Helper: mapear texto libre a enum de reason (T4)
// ──────────────────────────────────────────────────────────────────────────
function mapReasonToEnum(text: string): 'STOCKTAKE_SHRINKAGE' | 'STOCKTAKE_SURPLUS' | 'DAMAGED_GOODS' | 'OTHER' {
  const lower = text.toLowerCase();
  if (lower.includes('dañ') || lower.includes('roto') || lower.includes('deterioro')) return 'DAMAGED_GOODS';
  if (lower.includes('merma') || lower.includes('falta') || lower.includes('perdid')) return 'STOCKTAKE_SHRINKAGE';
  if (lower.includes('sobra') || lower.includes('exceso') || lower.includes('superavit')) return 'STOCKTAKE_SURPLUS';
  return 'OTHER';
}

export default function InventoryAdjustmentsView() {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'reversed' | 'voided'>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [reverseTarget, setReverseTarget] = useState<{ id: string; label: string } | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<{ id: string; label: string; itemCount?: number } | null>(null);
  const [voidTarget, setVoidTarget] = useState<AdjustmentDoc | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<AdjustmentDoc | null>(null);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);

  // T3: TanStack Query en vez de useState manual
  const { data: docs = [], isLoading, refetch } = useQuery({
    queryKey: ['inventory-adjustments', storeId],
    queryFn: async () => {
      if (!storeId) return [] as AdjustmentDoc[];
      const { data, error } = await supabase
        .from('inventory_adjustments')
        .select('*, items:inventory_adjustment_items(*, products(name, sku)), creator:profiles(full_name)')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as unknown as AdjustmentDoc[];
    },
    enabled: !!storeId,
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    return docs.filter(d => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (!search) return true;
      const term = search.toLowerCase();
      return d.reason?.toLowerCase().includes(term) || d.notes?.toLowerCase().includes(term);
    });
  }, [docs, search, statusFilter]);

  // Fase 1 C3: usar RPC con autorización (no UPDATE directo)
  const handleVoid = useCallback(async (doc: AdjustmentDoc) => {
    try {
      const { error } = await supabase.rpc('void_inventory_adjustment', {
        p_adjustment_id: doc.id,
        p_user_id: user?.id,
      });
      if (error) throw error;
      toast.success('Ajuste anulado');
      queryClient.invalidateQueries({ queryKey: ['inventory-adjustments'] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error('Error: ' + msg);
    }
  }, [user?.id, queryClient]);

  // Fase 1 C1+C2: usar RPC correcta (no apply_physical_count)
  const handleConfirm = useCallback(async (doc: AdjustmentDoc) => {
    try {
      const { data, error } = await supabase.rpc('confirm_inventory_adjustment', {
        p_adjustment_id: doc.id,
        p_user_id: user?.id,
      });
      if (error) throw error;
      toast.success(`Ajuste confirmado: ${data?.items_applied || 0} producto(s) aplicado(s) al inventario`);
      queryClient.invalidateQueries({ queryKey: ['inventory-adjustments'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error('Error: ' + msg);
    }
  }, [user?.id, queryClient]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tight">Ajustes Documentales</h2>
          <p className="text-xs text-muted-foreground">Documentos de ajuste de inventario (+/- stock y costo)</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className={cn('flex items-center gap-2 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase hover:opacity-90', touch)}>
          <Plus className="w-4 h-4" /> Nuevo Ajuste
        </Button>
      </div>

      {/* Search + Filtro por estado (S1) */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por motivo o nota..."
            className={cn('w-full pl-10 pr-4 rounded-xl border border-border bg-background text-sm', touch)} />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
          className={cn('px-3 rounded-xl border border-border bg-background text-xs font-bold uppercase', touch)}
          aria-label="Filtrar por estado"
        >
          <option value="all">Todos</option>
          <option value="pending">En Proceso</option>
          <option value="confirmed">Confirmados</option>
          <option value="reversed">Revertidos</option>
          <option value="voided">Anulados</option>
        </select>
        <Button onClick={() => refetch()} className={cn('p-2 rounded-xl border border-border hover:bg-muted', touch)} aria-label="Recargar">
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <RefreshCcw className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-bold text-muted-foreground">No hay ajustes documentales</p>
          <p className="text-xs text-muted-foreground mt-1">Crea un nuevo ajuste con el botón de arriba</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {filtered.map(d => {
            const diff = d.items?.reduce((s, i) => s + (i.counted_quantity - i.expected_quantity), 0) ?? 0;
            const valueDiff = d.items?.reduce((s, i) => {
              // S5: mostrar diferencia de valor por item en el expandible
              return s + (i.counted_quantity - i.expected_quantity);
            }, 0) ?? 0;
            return (
            <div key={d.id} className="p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-all">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs font-black text-primary">{d.id.slice(0, 8)}</span>
                    <DocumentStatusBadge type="adjustment" status={d.status} size="xs" />
                    {diff !== 0 && (
                      <span className={cn('text-[10px] font-black', diff > 0 ? 'text-success' : 'text-destructive')}>
                        {diff > 0 ? '+' : ''}{diff} uds
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-bold truncate">{d.notes || d.reason}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(d.created_at)} • {d.creator?.full_name || '—'}</p>
                  {d.items && d.items.length > 0 && (
                    <Button
                      onClick={() => setExpandedDoc(expandedDoc === d.id ? null : d.id)}
                      className="text-xs text-primary font-bold mt-1 flex items-center gap-1"
                    >
                      {d.items.length} producto(s)
                      {expandedDoc === d.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {d.items && d.items.length > 0 && (
                    <Button
                      onClick={() => setExpandedDoc(expandedDoc === d.id ? null : d.id)}
                      className="w-10 h-10 inline-flex items-center justify-center rounded-lg border border-border hover:bg-primary hover:text-foreground transition-all active:scale-95"
                      title="Ver items"
                      aria-label="Ver items del ajuste"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  )}
                  {d.status === 'pending' && (
                    <>
                      <Button
                        onClick={() => setVoidTarget(d)}
                        className="w-10 h-10 inline-flex items-center justify-center rounded-lg border border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive hover:text-white transition-all active:scale-95"
                        title="Anular ajuste (sin efecto en stock)"
                        aria-label="Anular ajuste"
                      >
                        <Ban className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={() => setConfirmTarget(d)}
                        className="w-10 h-10 inline-flex items-center justify-center rounded-lg border border-success/40 bg-success/5 text-success hover:bg-success hover:text-white transition-all active:scale-95"
                        title="Confirmar ajuste (aplica al inventario)"
                        aria-label="Confirmar ajuste"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                  {canReverse('adjustment', d.status) && (
                    <Button
                      onClick={() => setReverseTarget({
                        id: d.id,
                        label: `Ajuste ${d.id.slice(0, 8)} • ${d.notes || d.reason}`,
                      })}
                      className="w-10 h-10 inline-flex items-center justify-center rounded-lg border border-purple-500/40 bg-purple-500/5 text-purple-500 dark:text-purple-400 hover:bg-purple-500 hover:text-white dark:hover:text-black transition-all active:scale-95"
                      title="Revertir ajuste (invierte stock + kardex)"
                      aria-label="Revertir ajuste"
                    >
                      <Undo2 className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    onClick={() => setDuplicateTarget({
                      id: d.id,
                      label: `Ajuste ${d.id.slice(0, 8)} • ${d.notes || d.reason}`,
                      itemCount: d.items?.length,
                    })}
                    className="w-10 h-10 inline-flex items-center justify-center rounded-lg border border-blue-500/40 bg-blue-500/5 text-blue-500 hover:bg-blue-500 hover:text-white transition-all active:scale-95"
                    title="Duplicar ajuste"
                    aria-label="Duplicar ajuste"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {expandedDoc === d.id && d.items && (
                <div className="mt-3 pt-3 border-t border-border/50 space-y-1">
                  {d.items.map(item => {
                    const itemDiff = item.counted_quantity - item.expected_quantity;
                    return (
                    <div key={item.id} className="flex items-center justify-between text-xs gap-2">
                      <span className="font-bold flex-1 truncate">{item.products?.name || '—'}</span>
                      <span className="font-mono text-muted-foreground whitespace-nowrap">
                        {item.expected_quantity} → {item.counted_quantity}
                        <span className={cn('ml-2 font-black', itemDiff > 0 ? 'text-success' : itemDiff < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                          ({itemDiff > 0 ? '+' : ''}{itemDiff})
                        </span>
                      </span>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}

      {/* Fase 2 C4: Modales customizados en vez de confirm() nativo */}
      <DestructiveConfirmModal
        isOpen={!!voidTarget}
        onClose={() => setVoidTarget(null)}
        title="Anular Ajuste"
        description="¿Confirmas que deseas anular este ajuste?"
        confirmName={voidTarget?.notes || voidTarget?.reason || ''}
        confirmNameLabel="Motivo del ajuste"
        warningText="El ajuste será marcado como anulado. Sin efecto en stock (los pendientes no movieron stock)."
        confirmLabel="Anular"
        onConfirm={async () => { if (voidTarget) await handleVoid(voidTarget); setVoidTarget(null); }}
        isSubmitting={false}
      />

      <BaseModal
        open={!!confirmTarget}
        onOpenChange={(open) => { if (!open) setConfirmTarget(null); }}
        title={<div className="flex items-center gap-2 text-success"><CheckCircle2 className="w-6 h-6" /><span>Confirmar Ajuste</span></div>}
        footer={
          <>
            <SecondaryButton label="Cancelar" onClick={() => setConfirmTarget(null)} className="flex-1" />
            <PrimaryButton label="Confirmar y Aplicar" onClick={async () => { if (confirmTarget) await handleConfirm(confirmTarget); setConfirmTarget(null); }} className="flex-1 !bg-success hover:!bg-success/90" />
          </>
        }
      >
        <div className="py-4 space-y-3">
          <p className="font-bold text-center text-sm">¿Confirmar el ajuste "{confirmTarget?.notes || confirmTarget?.reason}"?</p>
          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            Esto aplicará los cambios al inventario inmediatamente. Los productos se actualizarán al stock contado y se registrarán movimientos en el kardex.
          </p>
          {confirmTarget?.items && (
            <div className="rounded-xl bg-muted/50 border border-border p-3 space-y-1">
              <p className="text-xs font-black uppercase text-muted-foreground mb-1">Resumen de cambios</p>
              {confirmTarget.items.map(item => {
                const itemDiff = item.counted_quantity - item.expected_quantity;
                return (
                <div key={item.id} className="flex items-center justify-between text-xs">
                  <span className="font-bold truncate flex-1">{item.products?.name || '—'}</span>
                  <span className={cn('font-mono font-black', itemDiff > 0 ? 'text-success' : itemDiff < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                    {item.expected_quantity} → {item.counted_quantity} ({itemDiff > 0 ? '+' : ''}{itemDiff})
                  </span>
                </div>
                );
              })}
            </div>
          )}
        </div>
      </BaseModal>

      {showCreate && storeId && (
        <CreateAdjustmentModal
          storeId={storeId}
          userId={user?.id || ''}
          onClose={() => setShowCreate(false)}
          onCreated={() => { queryClient.invalidateQueries({ queryKey: ['inventory-adjustments'] }); setShowCreate(false); }}
        />
      )}

      <ReverseDocumentModal
        isOpen={!!reverseTarget}
        onClose={() => setReverseTarget(null)}
        type="adjustment"
        docId={reverseTarget?.id || ''}
        docLabel={reverseTarget?.label}
      />

      <DuplicateDocumentModal
        isOpen={!!duplicateTarget}
        onClose={() => setDuplicateTarget(null)}
        type="adjustment"
        docId={duplicateTarget?.id || ''}
        docInfo={{ docLabel: duplicateTarget?.label, itemCount: duplicateTarget?.itemCount }}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Modal de Creación (Fase 3+4+5: tipado, debounce, validación)
// ═══════════════════════════════════════════════════════════════════════

function CreateAdjustmentModal({ storeId, userId, onClose, onCreated }: {
  storeId: string;
  userId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<Array<{
    product_id: string;
    name: string;
    expected: number;
    counted: number;
    unitCost: number;
  }>>([]);
  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const debouncedSearch = useDebounce(productSearch, 300);

  // S4: debounce en búsqueda de productos
  useEffect(() => {
    if (debouncedSearch.length < 2) { setSearchResults([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('products')
          .select('id, name, sku, stock_current, cost_average')
          .eq('store_id', storeId)
          .or(`name.ilike.%${debouncedSearch}%,sku.ilike.%${debouncedSearch}%`)
          .limit(5);
        if (!cancelled) setSearchResults((data || []) as ProductSearchResult[]);
      } catch { if (!cancelled) setSearchResults([]); }
    })();
    return () => { cancelled = true; };
  }, [debouncedSearch, storeId]);

  function addProduct(p: ProductSearchResult) {
    // S3: validar que no se duplique
    if (items.some(i => i.product_id === p.id)) {
      toast.error('Este producto ya está en el ajuste');
      return;
    }
    setItems(prev => [...prev, {
      product_id: p.id,
      name: p.name,
      expected: p.stock_current,
      counted: p.stock_current,
      unitCost: p.cost_average || 0,
    }]);
    setProductSearch('');
    setSearchResults([]);
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  function updateCounted(idx: number, value: number) {
    // S3: validar counted >= 0
    const safeValue = Math.max(0, value);
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, counted: safeValue } : item));
  }

  const totalDiff = items.reduce((s, i) => s + (i.counted - i.expected), 0);
  const totalValueDiff = items.reduce((s, i) => s + (i.counted - i.expected) * i.unitCost, 0);

  async function handleSubmit() {
    if (!reason.trim()) { toast.error('El motivo es obligatorio'); return; }
    if (items.length === 0) { toast.error('Añade al menos 1 producto'); return; }
    setSubmitting(true);
    try {
      // T4: mapear motivo a enum
      const reasonEnum = mapReasonToEnum(reason);
      const fullNotes = `${reason}${notes ? ' — ' + notes : ''}`;

      const { data: adj, error: e1 } = await supabase
        .from('inventory_adjustments')
        .insert({
          store_id: storeId,
          created_by: userId,
          status: 'pending',
          reason: reasonEnum,
          notes: fullNotes,
        })
        .select()
        .single();
      if (e1) throw e1;

      const itemsToInsert = items.map(i => ({
        adjustment_id: adj.id,
        product_id: i.product_id,
        expected_quantity: i.expected,
        counted_quantity: i.counted,
      }));
      const { error: e2 } = await supabase
        .from('inventory_adjustment_items')
        .insert(itemsToInsert);
      if (e2) throw e2;

      toast.success('Ajuste creado en estado "en proceso"');
      onCreated();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error('Error: ' + msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black uppercase">Nuevo Ajuste Documental</h2>
          <Button onClick={onClose} className="p-2 rounded-lg hover:bg-muted" aria-label="Cerrar"><X className="w-4 h-4" /></Button>
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Motivo <span className="text-destructive">*</span></label>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Ej: Conteo físico, corrección de inventario..."
            className={cn('w-full mt-1 px-3 rounded-xl border border-border bg-background text-sm', touch)} autoFocus />
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Notas (opcional)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Detalles adicionales..." rows={2}
            className={cn('w-full mt-1 px-3 rounded-xl border border-border bg-background text-sm resize-none', touch)} />
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Buscar producto</label>
          <div className="relative mt-1">
            <input value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Nombre o SKU..."
              className={cn('w-full px-3 rounded-xl border border-border bg-background text-sm', touch)} />
            {searchResults.length > 0 && (
              <div className="absolute z-10 w-full mt-1 rounded-xl border border-border bg-card shadow-lg max-h-48 overflow-y-auto">
                {searchResults.map(p => (
                  <Button key={p.id} onClick={() => addProduct(p)} className="w-full text-left p-2 hover:bg-muted text-sm border-b border-border/30 last:border-0">
                    <span className="font-bold">{p.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">{p.sku} • Stock: {p.stock_current}</span>
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>

        {items.length > 0 && (
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Productos del ajuste</label>
            {items.map((item, idx) => {
              const diff = item.counted - item.expected;
              return (
                <div key={idx} className="p-3 rounded-lg border border-border bg-muted/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold flex-1 truncate">{item.name}</span>
                    <Button onClick={() => removeItem(idx)} className="text-destructive hover:bg-destructive/10 p-1 rounded"><X className="w-3 h-3" /></Button>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div>
                      <label className="text-muted-foreground">Esperado</label>
                      <p className="font-mono font-bold">{item.expected}</p>
                    </div>
                    <div>
                      <label className="text-muted-foreground">Contado</label>
                      <input
                        type="number"
                        min="0"
                        value={item.counted}
                        onChange={e => updateCounted(idx, parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1 rounded border border-border bg-background font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-muted-foreground">Diferencia</label>
                      <p className={cn('font-mono font-black', diff > 0 ? 'text-success' : diff < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                        {diff > 0 ? '+' : ''}{diff}
                      </p>
                    </div>
                    {/* S5: mostrar valor de diferencia por item */}
                    <div>
                      <label className="text-muted-foreground">Valor diff</label>
                      <p className={cn('font-mono font-bold text-[10px]', diff * item.unitCost > 0 ? 'text-success' : diff * item.unitCost < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                        {formatCurrency(diff * item.unitCost)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="flex items-center justify-between p-2 rounded-lg bg-primary/5 border border-primary/20 text-xs font-bold">
              <span>Total: <span className={cn(totalDiff > 0 ? 'text-success' : totalDiff < 0 ? 'text-destructive' : '')}>{totalDiff > 0 ? '+' : ''}{totalDiff} uds</span></span>
              <span>Valor: <span className={cn(totalValueDiff > 0 ? 'text-success' : totalValueDiff < 0 ? 'text-destructive' : '')}>{formatCurrency(totalValueDiff)}</span></span>
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button onClick={onClose} className={cn('flex-1 px-4 rounded-xl border border-border font-black text-xs uppercase hover:bg-muted', touch)}>Cancelar</Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !reason.trim() || items.length === 0}
            className={cn('flex-1 px-4 rounded-xl bg-primary text-primary-foreground font-black text-xs uppercase hover:opacity-90 disabled:opacity-40', touch)}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Crear Ajuste'}
          </Button>
        </div>
      </div>
    </div>
  );
}
