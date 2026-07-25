'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Search, RotateCcw, Loader2, Users, X, Phone, Mail, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api-fetch';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';

const touch = 'min-h-[44px]';

export function CustomersView() {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId;
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const data = await apiFetch(`/api/customers?store_id=${storeId}&limit=50${search ? `&search=${encodeURIComponent(search)}` : ''}`);
      setCustomers(data.data || []);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [storeId, search]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-xl font-black uppercase tracking-tight">Clientes</h1>
          <p className="text-xs text-muted-foreground">Gestión de clientes CRM</p>
        </div>
        <button onClick={() => setShowCreate(true)} className={cn('flex items-center gap-2 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase hover:opacity-90', touch)}>
          <Plus className="w-4 h-4" /> Nuevo Cliente
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, CI, teléfono..."
            className={cn('w-full pl-10 pr-4 rounded-xl border border-border bg-background text-sm', touch)} />
        </div>
        <button onClick={load} className={cn('p-2 rounded-xl border border-border hover:bg-muted', touch)} aria-label="Recargar">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : customers.length === 0 ? (
        <div className="text-center py-20">
          <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-bold text-muted-foreground">No hay clientes registrados</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {customers.map(c => (
            <div key={c.id} className="p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-all">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-sm truncate">{c.name}</h3>
                  {c.ci && <p className="text-xs text-muted-foreground">CI: {c.ci}</p>}
                </div>
                {c.total_visits > 0 && (
                  <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                    {c.total_visits} visitas
                  </span>
                )}
              </div>
              <div className="space-y-1">
                {c.phone && <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" /> {c.phone}</p>}
                {c.email && <p className="text-xs text-muted-foreground flex items-center gap-1 truncate"><Mail className="w-3 h-3" /> {c.email}</p>}
                {c.address && <p className="text-xs text-muted-foreground flex items-center gap-1 truncate"><MapPin className="w-3 h-3" /> {c.address}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && <CreateCustomerModal onClose={() => setShowCreate(false)} onCreated={() => { load(); setShowCreate(false); }} storeId={storeId!} />}
    </div>
  );
}

function CreateCustomerModal({ onClose, onCreated, storeId }: { onClose: () => void; onCreated: () => void; storeId: string }) {
  const [form, setForm] = useState({ name: '', ci: '', phone: '', email: '', address: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!form.name.trim()) { toast.error('Nombre requerido'); return; }
    setSubmitting(true);
    try {
      await apiFetch('/api/customers', { method: 'POST', body: JSON.stringify({ store_id: storeId, ...form }) });
      toast.success('Cliente creado');
      onCreated();
    } catch (e: any) { toast.error(e.message); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black uppercase">Nuevo Cliente</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>
        {[
          { key: 'name', label: 'Nombre *', type: 'text' },
          { key: 'ci', label: 'Carnet de Identidad', type: 'text' },
          { key: 'phone', label: 'Teléfono', type: 'tel' },
          { key: 'email', label: 'Email', type: 'email' },
          { key: 'address', label: 'Dirección', type: 'text' },
        ].map(f => (
          <div key={f.key}>
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{f.label}</label>
            <input type={f.type} value={(form as any)[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
              className={cn('w-full mt-1 px-3 rounded-xl border border-border bg-background text-sm', touch)} />
          </div>
        ))}
        <button onClick={handleSubmit} disabled={submitting || !form.name.trim()}
          className={cn('w-full rounded-xl bg-primary text-primary-foreground text-sm font-black uppercase hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2', touch)}>
          {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</> : <><Plus className="w-4 h-4" /> Guardar Cliente</>}
        </button>
      </div>
    </div>
  );
}
