'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Search, RotateCcw, Loader2, FileText, X, RefreshCcw, Copy } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { apiFetch } from '@/lib/api-fetch';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
import { DocumentStatusBadge, canReverse } from '@/components/ui/DocumentStatusBadge';
import { ReverseDocumentModal } from '@/components/ui/ReverseDocumentModal';
import { useDuplicateDocumentV2 } from '@/hooks/api/useDuplicateDocumentV2';

const touch = 'min-h-[44px]';

export function DevolutionsView() {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId;
  const [devolutions, setDevolutions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  // V2.2: modal de reversión
  const [reverseTarget, setReverseTarget] = useState<{ id: string; label: string } | null>(null);
  // V2.4: hook de duplicación
  const duplicateMutation = useDuplicateDocumentV2();

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const data = await apiFetch(`/api/devolutions?store_id=${storeId}&limit=50`);
      setDevolutions(data.data || []);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const filtered = devolutions.filter(d =>
    !search || d.devolution_number?.toLowerCase().includes(search.toLowerCase()) ||
    d.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
    d.reason?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-xl font-black uppercase tracking-tight">Devoluciones</h1>
          <p className="text-xs text-muted-foreground">Notas de crédito y devoluciones de productos</p>
        </div>
        <button onClick={() => setShowCreate(true)} className={cn('flex items-center gap-2 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase hover:opacity-90', touch)}>
          <Plus className="w-4 h-4" /> Nueva Devolución
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por número, cliente, motivo..."
            className={cn('w-full pl-10 pr-4 rounded-xl border border-border bg-background text-sm', touch)} />
        </div>
        <button onClick={load} className={cn('p-2 rounded-xl border border-border hover:bg-muted', touch)} aria-label="Recargar">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <RotateCcw className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-bold text-muted-foreground">No hay devoluciones registradas</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {filtered.map(d => (
            <div key={d.id} className="p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-all">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs font-black text-primary">{d.devolution_number}</span>
                    <DocumentStatusBadge type="devolution" status={d.status} size="xs" />
                  </div>
                  <p className="text-sm font-bold truncate">{d.reason}</p>
                  {d.customer_name && <p className="text-xs text-muted-foreground">Cliente: {d.customer_name}</p>}
                  <p className="text-xs text-muted-foreground">{new Date(d.processed_at).toLocaleString('es-CU')}</p>
                </div>
                <div className="text-right shrink-0 flex flex-col items-end gap-2">
                  <div>
                    <p className="font-mono font-black text-sm">{formatCurrency(Number(d.total_amount))}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">{d.payment_method}</p>
                  </div>
                  {/* V2.2: botón Revertir devolución completada */}
                  {canReverse('devolution', d.status) && (
                    <button
                      type="button"
                      onClick={() => setReverseTarget({
                        id: d.id,
                        label: `Devolución ${d.devolution_number} • ${formatCurrency(Number(d.total_amount))}`,
                      })}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-purple-500/40 bg-purple-500/5 text-purple-500 dark:text-purple-400 hover:bg-purple-500 hover:text-white dark:hover:text-black transition-all active:scale-95 text-[10px] font-black uppercase tracking-widest"
                      title="Revertir devolución (descuenta stock restaurado)"
                      aria-label="Revertir devolución"
                    >
                      <RefreshCcw className="w-3 h-3" />
                      Revertir
                    </button>
                  )}
                  {/* V2.4: botón Duplicar */}
                  <button
                    type="button"
                    onClick={() => duplicateMutation.mutate({ type: 'devolution', id: d.id, storeId: storeId! })}
                    disabled={duplicateMutation.isPending}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-blue-500/40 bg-blue-500/5 text-blue-500 hover:bg-blue-500 hover:text-white transition-all active:scale-95 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                    title="Duplicar devolución (crea nueva con mismos items)"
                    aria-label="Duplicar devolución"
                  >
                    <Copy className="w-3 h-3" />
                    Duplicar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && <CreateDevolutionModal onClose={() => setShowCreate(false)} onCreated={() => { load(); setShowCreate(false); }} storeId={storeId!} />}

      {/* V2.2: Modal de Reversión Contable */}
      <ReverseDocumentModal
        isOpen={!!reverseTarget}
        onClose={() => setReverseTarget(null)}
        type="devolution"
        docId={reverseTarget?.id || ''}
        docLabel={reverseTarget?.label}
      />
    </div>
  );
}

function CreateDevolutionModal({ onClose, onCreated, storeId }: { onClose: () => void; onCreated: () => void; storeId: string }) {
  const [reason, setReason] = useState('');
  const [items, setItems] = useState<Array<{ product_id: string; name: string; quantity: number; unit_price: number }>>([]);
  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function searchProducts(q: string) {
    setProductSearch(q);
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      const data = await apiFetch(`/api/inventory/products?storeId=${storeId}&search=${encodeURIComponent(q)}&limit=5`);
      setSearchResults(data.data || data.products || []);
    } catch { setSearchResults([]); }
  }

  function addProduct(p: any) {
    setItems(prev => [...prev, { product_id: p.id, name: p.name, quantity: 1, unit_price: Number(p.price) }]);
    setProductSearch(''); setSearchResults([]);
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);

  async function handleSubmit() {
    if (!reason.trim() || items.length === 0) { toast.error('Motivo y al menos 1 producto requeridos'); return; }
    setSubmitting(true);
    try {
      await apiFetch('/api/devolutions', {
        method: 'POST',
        body: JSON.stringify({ store_id: storeId, reason, items: items.map(i => ({ product_id: i.product_id, quantity: i.quantity, unit_price: i.unit_price })) }),
      });
      toast.success('Devolución creada');
      onCreated();
    } catch (e: any) { toast.error(e.message); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black uppercase">Nueva Devolución</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted" aria-label="Cerrar"><X className="w-4 h-4" /></button>
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Motivo</label>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Ej: Producto defectuoso"
            className={cn('w-full mt-1 px-3 rounded-xl border border-border bg-background text-sm', touch)} />
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Buscar producto</label>
          <div className="relative mt-1">
            <input value={productSearch} onChange={e => searchProducts(e.target.value)} placeholder="Nombre del producto..."
              className={cn('w-full px-3 rounded-xl border border-border bg-background text-sm', touch)} />
            {searchResults.length > 0 && (
              <div className="absolute z-10 w-full mt-1 rounded-xl border border-border bg-card shadow-lg max-h-48 overflow-y-auto">
                {searchResults.map(p => (
                  <button key={p.id} onClick={() => addProduct(p)} className="w-full text-left p-2 hover:bg-muted text-sm border-b border-border/30 last:border-0">
                    <span className="font-bold">{p.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">${p.price}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {items.length > 0 && (
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 p-2 rounded-lg border border-border">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{item.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <input type="number" min="1" value={item.quantity} onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: Number(e.target.value) } : it))}
                      className="w-16 px-2 py-1 rounded border border-border text-xs" />
                    <span className="text-xs text-muted-foreground">×</span>
                    <span className="text-xs font-mono">${item.unit_price}</span>
                    <span className="text-xs text-muted-foreground">=</span>
                    <span className="text-xs font-mono font-bold">{formatCurrency(item.quantity * item.unit_price)}</span>
                  </div>
                </div>
                <button onClick={() => removeItem(idx)} className="p-1 rounded hover:bg-destructive/10 text-destructive"><X className="w-3 h-3" /></button>
              </div>
            ))}
            <div className="flex justify-between p-2 rounded-lg bg-muted/30">
              <span className="text-sm font-black uppercase">Total</span>
              <span className="font-mono font-black">{formatCurrency(total)}</span>
            </div>
          </div>
        )}

        <button onClick={handleSubmit} disabled={submitting || !reason.trim() || items.length === 0}
          className={cn('w-full rounded-xl bg-primary text-primary-foreground text-sm font-black uppercase hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2', touch)}>
          {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Creando...</> : <><RotateCcw className="w-4 h-4" /> Crear Devolución</>}
        </button>
      </div>
    </div>
  );
}
