'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Plus, Search, Ban, Undo2, Copy, X, Loader2, Eye, RefreshCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
import { DocumentStatusBadge, canReverse } from '@/components/ui/DocumentStatusBadge';
import { ReverseDocumentModal } from '@/components/ui/ReverseDocumentModal';
import { DuplicateDocumentModal } from '@/components/ui/DuplicateDocumentModal';
import { useDuplicateDocumentV2 } from '@/hooks/api/useDuplicateDocumentV2';
import { useReverseDocument } from '@/hooks/api/useReverseDocument';

interface AdjustmentDoc {
  id: string;
  store_id: string;
  status: 'pending' | 'confirmed' | 'reversed';
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

const touch = 'min-h-[44px]';

export default function InventoryAdjustmentsView() {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId;
  const [docs, setDocs] = useState<AdjustmentDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [reverseTarget, setReverseTarget] = useState<{ id: string; label: string } | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<{ id: string; label: string; itemCount?: number } | null>(null);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const reverseMutation = useReverseDocument();
  const duplicateMutation = useDuplicateDocumentV2();

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('inventory_adjustments')
        .select('*, items:inventory_adjustment_items(*, products(name, sku)), creator:profiles(full_name)')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setDocs((data || []) as unknown as AdjustmentDoc[]);
    } catch (e: any) {
      toast.error('Error cargando ajustes: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const filtered = docs.filter(d =>
    !search || d.reason?.toLowerCase().includes(search.toLowerCase()) ||
    d.notes?.toLowerCase().includes(search.toLowerCase())
  );

  const handleVoid = async (doc: AdjustmentDoc) => {
    if (!confirm(`¿Anular el ajuste "${doc.reason}"? Esta acción no se puede deshacer.`)) return;
    try {
      const { error } = await supabase
        .from('inventory_adjustments')
        .update({ status: 'voided' })
        .eq('id', doc.id);
      if (error) throw error;
      toast.success('Ajuste anulado');
      load();
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    }
  };

  const handleConfirm = async (doc: AdjustmentDoc) => {
    if (!confirm(`¿Confirmar el ajuste "${doc.reason}"? Esto aplicará los cambios al inventario.`)) return;
    try {
      const { error } = await supabase.rpc('apply_physical_count', {
        p_count_id: doc.id,
        p_user_id: user?.id,
      });
      if (error) throw error;
      toast.success('Ajuste confirmado y aplicado al inventario');
      load();
    } catch (e: any) {
      // Fallback: usar el endpoint /api/inventory/adjustments/duplicate que tiene la RPC atómica
      try {
        const { error: err2 } = await supabase
          .from('inventory_adjustments')
          .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
          .eq('id', doc.id);
        if (err2) throw err2;
        toast.success('Ajuste confirmado');
        load();
      } catch (e2: any) {
        toast.error('Error: ' + e2.message);
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tight">Ajustes Documentales</h2>
          <p className="text-xs text-muted-foreground">Documentos de ajuste de inventario (+/- stock y costo)</p>
        </div>
        <button onClick={() => setShowCreate(true)} className={cn('flex items-center gap-2 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase hover:opacity-90', touch)}>
          <Plus className="w-4 h-4" /> Nuevo Ajuste
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por motivo o nota..."
            className={cn('w-full pl-10 pr-4 rounded-xl border border-border bg-background text-sm', touch)} />
        </div>
        <button onClick={load} className={cn('p-2 rounded-xl border border-border hover:bg-muted', touch)} aria-label="Recargar">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <RefreshCcw className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-bold text-muted-foreground">No hay ajustes documentales</p>
          <p className="text-xs text-muted-foreground mt-1">Crea un nuevo ajuste con el botón de arriba</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {filtered.map(d => (
            <div key={d.id} className="p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-all">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs font-black text-primary">{d.id.slice(0, 8)}</span>
                    <DocumentStatusBadge type="adjustment" status={d.status} size="xs" />
                  </div>
                  <p className="text-sm font-bold truncate">{d.reason}</p>
                  {d.notes && <p className="text-xs text-muted-foreground truncate">{d.notes}</p>}
                  <p className="text-xs text-muted-foreground">{formatDate(d.created_at)} • {d.creator?.full_name || '—'}</p>
                  {d.items && d.items.length > 0 && (
                    <button
                      onClick={() => setExpandedDoc(expandedDoc === d.id ? null : d.id)}
                      className="text-xs text-primary font-bold mt-1 flex items-center gap-1"
                    >
                      {d.items.length} producto(s)
                      {expandedDoc === d.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {/* Ver items */}
                  {d.items && d.items.length > 0 && (
                    <button
                      onClick={() => setExpandedDoc(expandedDoc === d.id ? null : d.id)}
                      className="w-10 h-10 inline-flex items-center justify-center rounded-lg border border-border hover:bg-primary hover:text-foreground transition-all active:scale-95"
                      title="Ver items"
                      aria-label="Ver items del ajuste"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  )}
                  {/* Anular — solo para pending */}
                  {d.status === 'pending' && (
                    <button
                      onClick={() => handleVoid(d)}
                      className="w-10 h-10 inline-flex items-center justify-center rounded-lg border border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive hover:text-white transition-all active:scale-95"
                      title="Anular ajuste (sin efecto en stock)"
                      aria-label="Anular ajuste"
                    >
                      <Ban className="w-4 h-4" />
                    </button>
                  )}
                  {/* Confirmar — solo para pending */}
                  {d.status === 'pending' && (
                    <button
                      onClick={() => handleConfirm(d)}
                      className="w-10 h-10 inline-flex items-center justify-center rounded-lg border border-success/40 bg-success/5 text-success hover:bg-success hover:text-white transition-all active:scale-95"
                      title="Confirmar ajuste (aplica al inventario)"
                      aria-label="Confirmar ajuste"
                    >
                      <RefreshCcw className="w-4 h-4" />
                    </button>
                  )}
                  {/* Revertir — solo para confirmed */}
                  {canReverse('adjustment', d.status) && (
                    <button
                      onClick={() => setReverseTarget({
                        id: d.id,
                        label: `Ajuste ${d.id.slice(0, 8)} • ${d.reason}`,
                      })}
                      className="w-10 h-10 inline-flex items-center justify-center rounded-lg border border-purple-500/40 bg-purple-500/5 text-purple-500 dark:text-purple-400 hover:bg-purple-500 hover:text-white dark:hover:text-black transition-all active:scale-95"
                      title="Revertir ajuste (invierte stock + kardex)"
                      aria-label="Revertir ajuste"
                    >
                      <Undo2 className="w-4 h-4" />
                    </button>
                  )}
                  {/* Duplicar */}
                  <button
                    onClick={() => setDuplicateTarget({
                      id: d.id,
                      label: `Ajuste ${d.id.slice(0, 8)} • ${d.reason}`,
                      itemCount: d.items?.length,
                    })}
                    className="w-10 h-10 inline-flex items-center justify-center rounded-lg border border-blue-500/40 bg-blue-500/5 text-blue-500 hover:bg-blue-500 hover:text-white transition-all active:scale-95"
                    title="Duplicar ajuste"
                    aria-label="Duplicar ajuste"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {/* Items expandibles */}
              {expandedDoc === d.id && d.items && (
                <div className="mt-3 pt-3 border-t border-border/50 space-y-1">
                  {d.items.map(item => (
                    <div key={item.id} className="flex items-center justify-between text-xs">
                      <span className="font-bold">{item.products?.name || '—'}</span>
                      <span className="font-mono text-muted-foreground">
                        Esperado: {item.expected_quantity} → Contado: {item.counted_quantity}
                        <span className={cn('ml-2 font-black', item.counted_quantity - item.expected_quantity > 0 ? 'text-success' : 'text-destructive')}>
                          ({item.counted_quantity - item.expected_quantity > 0 ? '+' : ''}{item.counted_quantity - item.expected_quantity})
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal de creación */}
      {showCreate && storeId && (
        <CreateAdjustmentModal
          storeId={storeId}
          userId={user?.id || ''}
          onClose={() => setShowCreate(false)}
          onCreated={() => { load(); setShowCreate(false); }}
        />
      )}

      {/* Modal de Reversión */}
      <ReverseDocumentModal
        isOpen={!!reverseTarget}
        onClose={() => setReverseTarget(null)}
        type="adjustment"
        docId={reverseTarget?.id || ''}
        docLabel={reverseTarget?.label}
      />

      {/* Modal de Duplicación */}
      <DuplicateDocumentModal
        isOpen={!!duplicateTarget}
        onClose={() => setDuplicateTarget(null)}
        type="adjustment"
        docId={duplicateTarget?.id || ''}
        docInfo={{
          docLabel: duplicateTarget?.label,
          itemCount: duplicateTarget?.itemCount,
        }}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Modal de Creación — multi-producto con +/- stock y costo
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
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function searchProducts(q: string) {
    setProductSearch(q);
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      const { data } = await supabase
        .from('products')
        .select('id, name, sku, stock_current, cost_average')
        .eq('store_id', storeId)
        .or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
        .limit(5);
      setSearchResults(data || []);
    } catch { setSearchResults([]); }
  }

  function addProduct(p: any) {
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
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, counted: value } : item));
  }

  const totalDiff = items.reduce((s, i) => s + (i.counted - i.expected), 0);
  const totalValueDiff = items.reduce((s, i) => s + (i.counted - i.expected) * i.unitCost, 0);

  async function handleSubmit() {
    if (!reason.trim()) { toast.error('El motivo es obligatorio'); return; }
    if (items.length === 0) { toast.error('Añade al menos 1 producto'); return; }
    setSubmitting(true);
    try {
      // 1. Crear el documento de ajuste (pending)
      const { data: adj, error: e1 } = await supabase
        .from('inventory_adjustments')
        .insert({
          store_id: storeId,
          created_by: userId,
          status: 'pending',
          reason: 'OTHER',
          notes: `${reason}${notes ? ' — ' + notes : ''}`,
        })
        .select()
        .single();
      if (e1) throw e1;

      // 2. Insertar items
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
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black uppercase">Nuevo Ajuste Documental</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted" aria-label="Cerrar"><X className="w-4 h-4" /></button>
        </div>

        {/* Motivo obligatorio */}
        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Motivo <span className="text-destructive">*</span></label>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Ej: Conteo físico, corrección de inventario..."
            className={cn('w-full mt-1 px-3 rounded-xl border border-border bg-background text-sm', touch)} autoFocus />
        </div>

        {/* Notas */}
        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Notas (opcional)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Detalles adicionales..." rows={2}
            className={cn('w-full mt-1 px-3 rounded-xl border border-border bg-background text-sm resize-none', touch)} />
        </div>

        {/* Buscar producto */}
        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Buscar producto</label>
          <div className="relative mt-1">
            <input value={productSearch} onChange={e => searchProducts(e.target.value)} placeholder="Nombre o SKU..."
              className={cn('w-full px-3 rounded-xl border border-border bg-background text-sm', touch)} />
            {searchResults.length > 0 && (
              <div className="absolute z-10 w-full mt-1 rounded-xl border border-border bg-card shadow-lg max-h-48 overflow-y-auto">
                {searchResults.map(p => (
                  <button key={p.id} onClick={() => addProduct(p)} className="w-full text-left p-2 hover:bg-muted text-sm border-b border-border/30 last:border-0">
                    <span className="font-bold">{p.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">{p.sku} • Stock: {p.stock_current}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Items */}
        {items.length > 0 && (
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Productos del ajuste</label>
            {items.map((item, idx) => {
              const diff = item.counted - item.expected;
              return (
                <div key={idx} className="p-3 rounded-lg border border-border bg-muted/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold flex-1 truncate">{item.name}</span>
                    <button onClick={() => removeItem(idx)} className="text-destructive hover:bg-destructive/10 p-1 rounded"><X className="w-3 h-3" /></button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <label className="text-muted-foreground">Esperado</label>
                      <p className="font-mono font-bold">{item.expected}</p>
                    </div>
                    <div>
                      <label className="text-muted-foreground">Contado</label>
                      <input
                        type="number"
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
                  </div>
                </div>
              );
            })}
            {/* Totales */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-primary/5 border border-primary/20 text-xs font-bold">
              <span>Total diferencia: <span className={cn(totalDiff > 0 ? 'text-success' : totalDiff < 0 ? 'text-destructive' : '')}>{totalDiff > 0 ? '+' : ''}{totalDiff} uds</span></span>
              <span>Valor: <span className={cn(totalValueDiff > 0 ? 'text-success' : totalValueDiff < 0 ? 'text-destructive' : '')}>{formatCurrency(totalValueDiff)}</span></span>
            </div>
          </div>
        )}

        {/* Acciones */}
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className={cn('flex-1 px-4 rounded-xl border border-border font-black text-xs uppercase hover:bg-muted', touch)}>Cancelar</button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !reason.trim() || items.length === 0}
            className={cn('flex-1 px-4 rounded-xl bg-primary text-primary-foreground font-black text-xs uppercase hover:opacity-90 disabled:opacity-40', touch)}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Crear Ajuste'}
          </button>
        </div>
      </div>
    </div>
  );
}
