'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Loader2, Warehouse, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api-fetch';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
const touch = 'min-h-[44px]';

export function WarehousesView() {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId;
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [stock, setStock] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [tab, setTab] = useState<'warehouses' | 'stock'>('warehouses');

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const [wh, st] = await Promise.all([
        apiFetch(`/api/warehouses?store_id=${storeId}`),
        apiFetch(`/api/warehouses?store_id=${storeId}&stock=true`),
      ]);
      setWarehouses(wh.data || []);
      setStock(st.data || []);
    } catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  }, [storeId]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div><h1 className="text-xl font-black uppercase tracking-tight">Almacenes</h1><p className="text-xs text-muted-foreground">Multi-almacén por tienda</p></div>
        <button onClick={() => setShowCreate(true)} className={cn('flex items-center gap-2 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase hover:opacity-90', touch)}><Plus className="w-4 h-4" /> Nuevo Almacén</button>
      </div>
      <div className="flex gap-2">
        <button onClick={() => setTab('warehouses')} className={cn('px-4 rounded-xl text-xs font-black uppercase', tab === 'warehouses' ? 'bg-primary text-primary-foreground' : 'border border-border', touch)}>Almacenes</button>
        <button onClick={() => setTab('stock')} className={cn('px-4 rounded-xl text-xs font-black uppercase', tab === 'stock' ? 'bg-primary text-primary-foreground' : 'border border-border', touch)}>Stock</button>
      </div>
      {loading ? <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      : tab === 'warehouses' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {warehouses.map(w => (
            <div key={w.id} className="p-4 rounded-xl border border-border bg-card">
              <div className="flex items-center gap-2 mb-1"><Warehouse className="w-4 h-4 text-primary" /><h3 className="font-black text-sm">{w.name}</h3>{w.is_default && <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-primary/10 text-primary">Principal</span>}</div>
              {w.code && <p className="text-xs text-muted-foreground">Código: {w.code}</p>}
              {w.location && <p className="text-xs text-muted-foreground">{w.location}</p>}
            </div>
          ))}
          {warehouses.length === 0 && <div className="text-center py-12"><Warehouse className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" /><p className="text-sm font-bold text-muted-foreground">No hay almacenes configurados</p></div>}
        </div>
      ) : (
        <div className="grid gap-2">
          {stock.map(s => (
            <div key={s.id} className="p-3 rounded-xl border border-border bg-card flex items-center justify-between">
              <div><p className="text-sm font-bold">{s.products?.name || 'Producto'}</p><p className="text-xs text-muted-foreground">{s.warehouses?.name || 'Almacén'}</p></div>
              <div className="text-right"><p className="font-mono font-black text-sm">{s.quantity}</p>{s.quantity <= s.min_stock && <p className="text-[10px] text-destructive font-bold uppercase">Stock bajo</p>}</div>
            </div>
          ))}
          {stock.length === 0 && <div className="text-center py-12"><p className="text-sm font-bold text-muted-foreground">Sin stock registrado</p></div>}
        </div>
      )}
      {showCreate && <CreateWhModal onClose={() => setShowCreate(false)} onCreated={() => { load(); setShowCreate(false); }} storeId={storeId!} />}
    </div>
  );
}
function CreateWhModal({ onClose, onCreated, storeId }: { onClose: () => void; onCreated: () => void; storeId: string }) {
  const [form, setForm] = useState({ name: '', code: '', location: '', is_default: false });
  const [submitting, setSubmitting] = useState(false);
  async function handleSubmit() {
    if (!form.name.trim()) { toast.error('Nombre requerido'); return; }
    setSubmitting(true);
    try { await apiFetch('/api/warehouses', { method: 'POST', body: JSON.stringify({ store_id: storeId, ...form }) }); toast.success('Almacén creado'); onCreated(); }
    catch (e: any) { toast.error(e.message); } finally { setSubmitting(false); }
  }
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="text-lg font-black uppercase">Nuevo Almacén</h2><button onClick={onClose} className="p-2 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button></div>
        {[{ k: 'name', l: 'Nombre *' }, { k: 'code', l: 'Código' }, { k: 'location', l: 'Ubicación' }].map(f => (
          <div key={f.k}><label className="text-xs font-bold uppercase text-muted-foreground">{f.l}</label><input value={(form as any)[f.k]} onChange={e => setForm(prev => ({ ...prev, [f.k]: e.target.value }))} className={cn('w-full mt-1 px-3 rounded-xl border border-border bg-background text-sm', touch)} /></div>
        ))}
        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.is_default} onChange={e => setForm(prev => ({ ...prev, is_default: e.target.checked }))} className="w-5 h-5 accent-primary" /><span className="text-sm font-bold">Almacén principal</span></label>
        <button onClick={handleSubmit} disabled={submitting || !form.name.trim()} className={cn('w-full rounded-xl bg-primary text-primary-foreground text-sm font-black uppercase hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2', touch)}>{submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Creando...</> : <><Plus className="w-4 h-4" /> Crear</>}</button>
      </div>
    </div>
  );
}
