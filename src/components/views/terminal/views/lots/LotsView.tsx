'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Search, RotateCcw, Loader2, Package, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api-fetch';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
const touch = 'min-h-[44px]';

export function LotsView() {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId;
  const [lots, setLots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try { const data = await apiFetch(`/api/lots?store_id=${storeId}`); setLots(data.data || []); }
    catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  }, [storeId]);
  useEffect(() => { load(); }, [load]);

  const filtered = lots.filter(l => !search || l.lot_number?.toLowerCase().includes(search.toLowerCase()) || l.products?.name?.toLowerCase().includes(search.toLowerCase()));
  const expiringSoon = lots.filter(l => l.status === 'active' && l.expiration_date && new Date(l.expiration_date) <= new Date(Date.now() + 30 * 86400000));

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-xl font-black uppercase tracking-tight">Lotes y Vencimientos</h1>
          <p className="text-xs text-muted-foreground">Control de lotes, series y fechas de vencimiento</p>
        </div>
        <button onClick={() => setShowCreate(true)} className={cn('flex items-center gap-2 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase hover:opacity-90', touch)}>
          <Plus className="w-4 h-4" /> Nuevo Lote
        </button>
      </div>
      {expiringSoon.length > 0 && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 dark:bg-amber-950/30 dark:border-amber-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-400"><strong>{expiringSoon.length} lote(s)</strong> vencen en los próximos 30 días</p>
        </div>
      )}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por lote o producto..." className={cn('w-full pl-10 pr-4 rounded-xl border border-border bg-background text-sm', touch)} />
        </div>
        <button onClick={load} className={cn('p-2 rounded-xl border border-border hover:bg-muted', touch)}>{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}</button>
      </div>
      {loading ? <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      : filtered.length === 0 ? <div className="text-center py-20"><Package className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" /><p className="text-sm font-bold text-muted-foreground">No hay lotes registrados</p></div>
      : <div className="grid gap-2">{filtered.map(l => (
          <div key={l.id} className="p-4 rounded-xl border border-border bg-card">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs font-black text-primary">{l.lot_number}</span>
                  <span className={cn('text-[10px] font-black uppercase px-1.5 py-0.5 rounded', l.status === 'active' ? 'bg-success/10 text-success' : l.status === 'expired' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground')}>{l.status}</span>
                </div>
                <p className="text-sm font-bold truncate">{l.products?.name || 'Producto'}</p>
                <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                  <span>Recibido: {l.quantity_received}</span>
                  <span>Restante: <strong className={l.quantity_remaining <= 0 ? 'text-destructive' : ''}>{l.quantity_remaining}</strong></span>
                  {l.expiration_date && <span className={new Date(l.expiration_date) < new Date() ? 'text-destructive font-bold' : ''}>Vence: {new Date(l.expiration_date).toLocaleDateString('es-CU')}</span>}
                  {l.supplier && <span>Prov: {l.supplier}</span>}
                </div>
              </div>
            </div>
          </div>
        ))}</div>}
      {showCreate && <CreateLotModal onClose={() => setShowCreate(false)} onCreated={() => { load(); setShowCreate(false); }} storeId={storeId!} />}
    </div>
  );
}

function CreateLotModal({ onClose, onCreated, storeId }: { onClose: () => void; onCreated: () => void; storeId: string }) {
  const [form, setForm] = useState({ product_id: '', lot_number: '', expiration_date: '', quantity_received: 1, unit_cost: 0, supplier: '', notes: '' });
  const [products, setProducts] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => { apiFetch(`/api/inventory/products?storeId=${storeId}&limit=100`).then(d => setProducts(d.data || d.products || [])).catch(() => {}); }, [storeId]);
  async function handleSubmit() {
    if (!form.product_id || !form.lot_number) { toast.error('Producto y número de lote requeridos'); return; }
    setSubmitting(true);
    try { await apiFetch('/api/lots', { method: 'POST', body: JSON.stringify({ store_id: storeId, ...form, quantity_received: Number(form.quantity_received), unit_cost: Number(form.unit_cost) }) }); toast.success('Lote creado'); onCreated(); }
    catch (e: any) { toast.error(e.message); } finally { setSubmitting(false); }
  }
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="text-lg font-black uppercase">Nuevo Lote</h2><button onClick={onClose} className="p-2 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button></div>
        <div><label className="text-xs font-bold uppercase text-muted-foreground">Producto *</label><select value={form.product_id} onChange={e => setForm(prev => ({ ...prev, product_id: e.target.value }))} className={cn('w-full mt-1 px-3 rounded-xl border border-border bg-background text-sm', touch)}><option value="">Seleccionar...</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div><label className="text-xs font-bold uppercase text-muted-foreground">Número de Lote *</label><input value={form.lot_number} onChange={e => setForm(prev => ({ ...prev, lot_number: e.target.value }))} className={cn('w-full mt-1 px-3 rounded-xl border border-border bg-background text-sm', touch)} /></div>
        <div><label className="text-xs font-bold uppercase text-muted-foreground">Fecha Vencimiento</label><input type="date" value={form.expiration_date} onChange={e => setForm(prev => ({ ...prev, expiration_date: e.target.value }))} className={cn('w-full mt-1 px-3 rounded-xl border border-border bg-background text-sm', touch)} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-xs font-bold uppercase text-muted-foreground">Cantidad</label><input type="number" min="1" value={form.quantity_received} onChange={e => setForm(prev => ({ ...prev, quantity_received: Number(e.target.value) }))} className={cn('w-full mt-1 px-3 rounded-xl border border-border bg-background text-sm', touch)} /></div>
          <div><label className="text-xs font-bold uppercase text-muted-foreground">Costo Unit.</label><input type="number" min="0" value={form.unit_cost} onChange={e => setForm(prev => ({ ...prev, unit_cost: Number(e.target.value) }))} className={cn('w-full mt-1 px-3 rounded-xl border border-border bg-background text-sm', touch)} /></div>
        </div>
        <div><label className="text-xs font-bold uppercase text-muted-foreground">Proveedor</label><input value={form.supplier} onChange={e => setForm(prev => ({ ...prev, supplier: e.target.value }))} className={cn('w-full mt-1 px-3 rounded-xl border border-border bg-background text-sm', touch)} /></div>
        <button onClick={handleSubmit} disabled={submitting || !form.product_id || !form.lot_number} className={cn('w-full rounded-xl bg-primary text-primary-foreground text-sm font-black uppercase hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2', touch)}>{submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Creando...</> : <><Plus className="w-4 h-4" /> Crear Lote</>}</button>
      </div>
    </div>
  );
}
