'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Plus, Truck, Package, Shield, Link2, Calculator, Eye, RefreshCw, Ban, FileText, Search } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';

/**
 * F2: Servicios Recibidos y Costos Asociados.
 * Vista principal del módulo Inventario → Servicios Recibidos.
 */

interface ReceivedService {
  id: string;
  service_number: string;
  service_date: string;
  service_type_name: string;
  supplier: string | null;
  reference_doc: string | null;
  total_amount: number;
  currency: string;
  status: string;
  distribution_method: string;
  observations: string | null;
}

const SERVICE_ICONS: Record<string, any> = {
  'Transporte': Truck,
  'Manipulación': Package,
  'Seguro': Shield,
  'default': FileText,
};

export default function ReceivedServicesView() {
  const t = useTranslations();
  const { user } = useAuthStore();
  const [services, setServices] = useState<ReceivedService[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'voided'>('all');
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const fetchServices = useCallback(async () => {
    if (!user?.activeStoreId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('received_services')
        .select('*')
        .eq('store_id', user.activeStoreId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setServices(data || []);
    } catch (e: any) {
      toast.error('Error al cargar servicios: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [user?.activeStoreId]);

  useEffect(() => { fetchServices(); }, [fetchServices]);

  const filtered = services.filter(s => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.service_number.toLowerCase().includes(q) ||
             s.service_type_name.toLowerCase().includes(q) ||
             (s.supplier || '').toLowerCase().includes(q) ||
             (s.reference_doc || '').toLowerCase().includes(q);
    }
    return true;
  });

  const handleCreate = async (data: any) => {
    try {
      const res = await fetch('/api/received-services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, store_id: user?.activeStoreId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.message || 'Error al crear servicio');
      }
      toast.success('Servicio creado correctamente');
      setCreateModalOpen(false);
      fetchServices();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleVoid = async (id: string) => {
    if (!confirm('¿Anular este servicio? Se eliminarán sus distribuciones.')) return;
    try {
      const res = await fetch('/api/received-services', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_id: id, action: 'void' }),
      });
      if (!res.ok) throw new Error('Error al anular');
      toast.success('Servicio anulado');
      fetchServices();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleRecalculate = async (id: string) => {
    try {
      const res = await fetch('/api/received-services/distribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_id: id }),
      });
      if (!res.ok) throw new Error('Error al recalcular');
      const data = await res.json();
      toast.success(`Distribución recalculada: ${data.distributed_rows} líneas`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-success flex items-center justify-center shrink-0">
            <Truck className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tighter text-foreground">
              Servicios Recibidos
            </h1>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
              Registro y distribución de costos asociados a recepciones
            </p>
          </div>
        </div>
        <Button
          onClick={() => setCreateModalOpen(true)}
          className="h-11 min-h-[44px] rounded-xl font-black uppercase tracking-widest text-xs gap-2"
        >
          <Plus className="w-4 h-4" />
          Nuevo Servicio
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por número, tipo, proveedor..."
            className="w-full h-11 pl-10 pr-3 rounded-xl border border-border bg-background text-sm font-medium min-h-[44px]"
          />
        </div>
        <div className="flex gap-1 bg-muted p-0.5 rounded-lg border border-border">
          {(['all', 'active', 'voided'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-4 py-2 rounded-md text-xs font-black uppercase tracking-widest transition-all min-h-[44px]",
                statusFilter === s ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {s === 'all' ? 'Todos' : s === 'active' ? 'Activos' : 'Anulados'}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <RefreshCw className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Cargando servicios...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Truck className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
            <p className="text-sm font-bold text-muted-foreground">No hay servicios registrados</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Crea tu primer servicio recibido</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-muted-foreground">Número</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-muted-foreground">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-muted-foreground">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-muted-foreground">Proveedor</th>
                  <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-widest text-muted-foreground">Importe</th>
                  <th className="px-4 py-3 text-center text-xs font-black uppercase tracking-widest text-muted-foreground">Estado</th>
                  <th className="px-4 py-3 text-center text-xs font-black uppercase tracking-widest text-muted-foreground">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filtered.map((svc, i) => {
                  const Icon = SERVICE_ICONS[svc.service_type_name] || SERVICE_ICONS.default;
                  return (
                    <motion.tr
                      key={svc.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="hover:bg-primary/5 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono font-bold text-xs">{svc.service_number}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{svc.service_date}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-primary/60" />
                          <span className="text-xs font-bold">{svc.service_type_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{svc.supplier || '—'}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-sm">{formatCurrency(svc.total_amount)} {svc.currency}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn(
                          "px-2 py-1 rounded text-xs font-black uppercase tracking-widest",
                          svc.status === 'active' ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                        )}>
                          {svc.status === 'active' ? 'Activo' : 'Anulado'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => handleRecalculate(svc.id)} className="p-2 rounded-lg hover:bg-primary/10 text-primary transition-colors min-h-[44px] min-w-[44px]" aria-label="Recalcular distribución" title="Recalcular">
                            <RefreshCw className="w-4 h-4" />
                          </button>
                          {svc.status === 'active' && (
                            <button onClick={() => handleVoid(svc.id)} className="p-2 rounded-lg hover:bg-destructive/10 text-destructive transition-colors min-h-[44px] min-w-[44px]" aria-label="Anular" title="Anular">
                              <Ban className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de creación */}
      <CreateServiceModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreate={handleCreate}
      />
    </div>
  );
}

// ── Modal de Creación Rápida ──
function CreateServiceModal({ isOpen, onClose, onCreate }: { isOpen: boolean; onClose: () => void; onCreate: (data: any) => void }) {
  const [type, setType] = useState('Transporte');
  const [supplier, setSupplier] = useState('');
  const [amount, setAmount] = useState('');
  const [referenceDoc, setReferenceDoc] = useState('');
  const [method, setMethod] = useState<'amount' | 'quantity' | 'manual'>('amount');
  const [observations, setObservations] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('El importe debe ser mayor a 0');
      return;
    }
    setSubmitting(true);
    onCreate({
      service_type_name: type,
      supplier: supplier || null,
      total_amount: parseFloat(amount),
      reference_doc: referenceDoc || null,
      distribution_method: method,
      observations: observations || null,
    });
    setSubmitting(false);
    // Reset
    setType('Transporte'); setSupplier(''); setAmount(''); setReferenceDoc(''); setObservations('');
  };

  const quickTypes = ['Transporte', 'Manipulación', 'Seguro', 'Aduana', 'Estiba', 'Descarga', 'Otros'];

  return (
    <BaseModal open={isOpen} onOpenChange={(o) => !o && onClose()} title={<span className="flex items-center gap-2"><Plus className="w-5 h-5" /> Nuevo Servicio Recibido</span>} maxWidth="sm:max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Tipo de servicio */}
        <div>
          <label className="text-xs font-black uppercase tracking-widest text-muted-foreground block mb-2">Tipo de servicio</label>
          <div className="flex flex-wrap gap-2">
            {quickTypes.map(t => (
              <button key={t} type="button" onClick={() => setType(t)}
                className={cn("px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all min-h-[44px]",
                  type === t ? "bg-primary text-primary-foreground shadow-lg" : "bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary")}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Proveedor */}
        <div>
          <label className="text-xs font-black uppercase tracking-widest text-muted-foreground block mb-2">Proveedor (opcional)</label>
          <input type="text" value={supplier} onChange={e => setSupplier(e.target.value)} className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm font-medium min-h-[44px]" placeholder="Ej: TransCaribe S.A." />
        </div>

        {/* Importe */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-black uppercase tracking-widest text-muted-foreground block mb-2">Importe total</label>
            <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm font-bold min-h-[44px]" placeholder="0.00" required />
          </div>
          <div>
            <label className="text-xs font-black uppercase tracking-widest text-muted-foreground block mb-2">Documento ref.</label>
            <input type="text" value={referenceDoc} onChange={e => setReferenceDoc(e.target.value)} className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm font-medium min-h-[44px]" placeholder="Factura N°" />
          </div>
        </div>

        {/* Método de distribución */}
        <div>
          <label className="text-xs font-black uppercase tracking-widest text-muted-foreground block mb-2">Método de distribución</label>
          <select value={method} onChange={e => setMethod(e.target.value as any)} className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm font-bold min-h-[44px]">
            <option value="amount">Por importe (proporcional al valor)</option>
            <option value="quantity">Por cantidad (proporcional a unidades)</option>
            <option value="manual">Manual (definir porcentajes)</option>
          </select>
        </div>

        {/* Observaciones */}
        <div>
          <label className="text-xs font-black uppercase tracking-widest text-muted-foreground block mb-2">Observaciones</label>
          <textarea value={observations} onChange={e => setObservations(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm min-h-[44px]" placeholder="Notas adicionales..." />
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1 h-11 min-h-[44px] rounded-xl font-black uppercase tracking-widest text-xs">Cancelar</Button>
          <Button type="submit" disabled={submitting} className="flex-1 h-11 min-h-[44px] rounded-xl font-black uppercase tracking-widest text-xs gap-2">
            {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Crear Servicio
          </Button>
        </div>
      </form>
    </BaseModal>
  );
}
