'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Plus, Truck, Package, Shield, Link2, Calculator, Eye, RefreshCw, Ban, FileText, Search, CheckCircle2 } from 'lucide-react';
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
  // FIX-PAYMENT-TRACKING (2026-07-12): campos de pago
  payment_status?: 'unpaid' | 'partial' | 'paid';
  payment_method?: 'cash' | 'transfer' | 'zelle' | null;
  paid_amount?: number;
  due_date?: string | null;
  paid_at?: string | null;
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
  // FIX-PAYMENT-TRACKING: estado para modal de detalle con tab de pagos
  const [detailService, setDetailService] = useState<ReceivedService | null>(null);

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
      const created = await res.json().catch(() => null);
      // v2.18.0: el RPC crea el servicio en estado 'draft' (documento completo,
      // vínculos incluidos). Se activa de inmediato para preservar el flujo
      // anterior (la fila aparece Activa). Si la activación falla, el servicio
      // queda en Borrador y puede activarse desde la tabla sin perder nada.
      const newId = created?.data?.id;
      if (newId) {
        const act = await fetch('/api/received-services', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ service_id: newId, status: 'active', reason: 'Activación tras creación' }),
        });
        if (!act.ok) {
          toast.warning('Servicio creado en Borrador. Actívalo desde la tabla (botón Activar).');
        } else {
          toast.success('Servicio creado correctamente');
        }
      } else {
        toast.success('Servicio creado correctamente');
      }
      setCreateModalOpen(false);
      fetchServices();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // v2.18.0: activar un servicio en Borrador (transición draft→active)
  const handleActivate = async (id: string) => {
    try {
      const res = await fetch('/api/received-services', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_id: id, status: 'active', reason: 'Activación desde la tabla' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al activar');
      }
      toast.success('Servicio activado');
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
                          svc.status === 'active' ? "bg-success/10 text-success" : svc.status === 'draft' ? "bg-amber-500/10 text-amber-500" : "bg-destructive/10 text-destructive"
                        )}>
                          {svc.status === 'active' ? 'Activo' : svc.status === 'draft' ? 'Borrador' : 'Anulado'}
                        </span>
                        {/* FIX-PAYMENT-TRACKING: badge de estado de pago */}
                        {svc.status === 'active' && svc.payment_status && (
                          <span className={cn(
                            "ml-1 px-2 py-1 rounded text-[10px] font-black uppercase",
                            svc.payment_status === 'paid' ? "bg-success/10 text-success"
                            : svc.payment_status === 'partial' ? "bg-amber-500/10 text-amber-500"
                            : "bg-destructive/10 text-destructive"
                          )}>
                            {svc.payment_status === 'paid' ? '💰 Pagado' : svc.payment_status === 'partial' ? '⚖️ Parcial' : '⏳ Pendiente'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          {/* FIX-PAYMENT-TRACKING: botón Ver detalle con tab de pagos */}
                          <button onClick={() => setDetailService(svc)} className="p-2 rounded-lg hover:bg-primary/10 text-primary transition-colors min-h-[44px] min-w-[44px]" aria-label="Ver detalle" title="Ver detalle y pagos">
                            <Eye className="w-4 h-4" />
                          </button>
                          {/* v2.18.0: activar borradores (transición draft→active) */}
                          {svc.status === 'draft' && (
                            <button onClick={() => handleActivate(svc.id)} className="p-2 rounded-lg hover:bg-success/10 text-success transition-colors min-h-[44px] min-w-[44px]" aria-label="Activar" title="Activar servicio">
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          )}
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

      {/* FIX-PAYMENT-TRACKING (2026-07-12): Modal de detalle con tab de pagos */}
      {detailService && (
        <ServiceDetailModal
          service={detailService}
          onClose={() => setDetailService(null)}
          onUpdate={() => { fetchServices(); }}
        />
      )}
    </div>
  );
}

// ============================================================================
// ServiceDetailModal — Modal de detalle con tabs: Info + Pagos
// ============================================================================
function ServiceDetailModal({
  service,
  onClose,
  onUpdate,
}: {
  service: ReceivedService;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'info' | 'payments'>('info');
  const [payments, setPayments] = useState<any[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'transfer' | 'zelle'>('cash');
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // v2.18.0: vínculos documentales (recepciones y OT)
  const [receiptLinks, setReceiptLinks] = useState<any[]>([]);
  const [otLinks, setOtLinks] = useState<any[]>([]);

  const fetchPayments = useCallback(async () => {
    setLoadingPayments(true);
    try {
      // FIX-AUD5-H1: store_id es OBLIGATORIO en GET /api/payments — sin él la
      // ruta responde 400 y la pestaña mostraba "Sin pagos" en silencio.
      const storeId = user?.activeStoreId || '';
      const res = await fetch(`/api/payments?ref_type=service&ref_id=${service.id}&store_id=${storeId}`);
      if (res.ok) setPayments(await res.json());
    } catch { /* ignore */ } finally { setLoadingPayments(false); }
  }, [service.id, user?.activeStoreId]);

  // v2.18.0: cargar vínculos documentales del servicio
  const fetchLinks = useCallback(async () => {
    if (!user?.activeStoreId) return;
    try {
      const [rcpt, ots] = await Promise.all([
        supabase.from('service_reception_links')
          .select('id, receipt_id, allocation_percentage, allocated_amount, receipt:receipts(reference_doc, supplier, status, created_at)')
          .eq('service_id', service.id),
        supabase.from('service_production_order_links')
          .select('id, production_order_id, production_order:production_orders(order_number, customer_name, status, order_date, order_type)')
          .eq('service_id', service.id),
      ]);
      if (!rcpt.error) setReceiptLinks(rcpt.data || []);
      if (!ots.error) setOtLinks(ots.data || []);
    } catch { /* best-effort */ }
  }, [service.id, user?.activeStoreId]);

  useEffect(() => { fetchPayments(); fetchLinks(); }, [fetchPayments, fetchLinks]);

  const totalPaid = payments.reduce((s, p) => s + Number(p.amount_cup || p.amount), 0);
  const balance = service.total_amount - totalPaid;
  const paymentStatus = balance <= 0 ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid';

  const handleSubmit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error('Monto inválido'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ref_type: 'service',
          ref_id: service.id,
          amount: amt,
          payment_method: method,
          currency: 'CUP',
          exchange_rate: 1.0,
          reference: reference || null,
        }),
      });
      if (res.ok) {
        toast.success('Pago registrado');
        setAmount(''); setReference(''); setShowForm(false);
        fetchPayments();
        onUpdate();
      } else { toast.error('Error al registrar pago'); }
    } catch { toast.error('Error de conexión'); }
    finally { setSubmitting(false); }
  };

  const statusBadge = {
    paid: { label: '💰 Pagado', color: 'bg-success/10 text-success border-success/30' },
    partial: { label: '⚖️ Parcial', color: 'bg-amber-500/10 text-amber-500 border-amber-500/30' },
    unpaid: { label: '⏳ Pendiente', color: 'bg-destructive/10 text-destructive border-destructive/30' },
  }[paymentStatus];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-card border border-border/50 rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-card border-b border-border/30 p-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest">{service.service_number}</h2>
              <p className="text-[10px] text-muted-foreground">{service.service_type_name} · {service.supplier || 'Sin proveedor'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted" aria-label="Cerrar">
            <span className="text-lg">✕</span>
          </button>
        </div>

        <div className="flex border-b border-border/30">
          <button onClick={() => setActiveTab('info')} className={cn("flex-1 py-3 text-xs font-black uppercase border-b-2 -mb-px", activeTab === 'info' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground')}>Info</button>
          <button onClick={() => setActiveTab('payments')} className={cn("flex-1 py-3 text-xs font-black uppercase border-b-2 -mb-px flex items-center justify-center gap-1", activeTab === 'payments' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground')}>
            Pagos {payments.length > 0 && <span className="bg-primary/10 px-1.5 rounded text-[9px]">{payments.length}</span>}
          </button>
        </div>

        {activeTab === 'info' && (
          <div className="p-4 space-y-2">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-muted-foreground">Fecha:</span> <span className="font-bold">{service.service_date}</span></div>
              <div><span className="text-muted-foreground">Moneda:</span> <span className="font-bold">{service.currency}</span></div>
              <div><span className="text-muted-foreground">Proveedor:</span> <span className="font-bold">{service.supplier || '—'}</span></div>
              <div><span className="text-muted-foreground">Ref:</span> <span className="font-bold">{service.reference_doc || '—'}</span></div>
              <div><span className="text-muted-foreground">Distribución:</span> <span className="font-bold">{service.distribution_method}</span></div>
              <div><span className="text-muted-foreground">Estado:</span> <span className="font-bold">{service.status === 'active' ? 'Activo' : service.status === 'draft' ? 'Borrador' : 'Anulado'}</span></div>
            </div>
            <div className="pt-2 border-t border-border/30">
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Total:</span>
                <span className="text-lg font-mono font-black">{formatCurrency(service.total_amount)} {service.currency}</span>
              </div>
              {service.due_date && (
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs text-muted-foreground">Vence:</span>
                  <span className={cn("text-xs font-bold", new Date(service.due_date) < new Date() && paymentStatus !== 'paid' ? "text-destructive" : "")}>{service.due_date}</span>
                </div>
              )}
            </div>
            {service.observations && (
              <div className="pt-2 border-t border-border/30">
                <p className="text-[10px] font-black uppercase text-muted-foreground mb-1">Observaciones</p>
                <p className="text-xs">{service.observations}</p>
              </div>
            )}
            {/* v2.18.0: vinculaciones documentales */}
            {(otLinks.length > 0 || receiptLinks.length > 0) && (
              <div className="pt-2 border-t border-border/30 space-y-1.5">
                <p className="text-[10px] font-black uppercase text-muted-foreground">Vinculación operativa</p>
                {otLinks.map((l: any) => (
                  <div key={l.id} className="flex items-center gap-1.5 text-xs">
                    <Link2 className="w-3 h-3 text-primary shrink-0" />
                    <span className="font-bold font-mono">{l.production_order?.order_number || l.production_order_id}</span>
                    <span className="text-muted-foreground">· OT {l.production_order?.order_type === 'production' ? 'Producción' : 'Trabajo'} {l.production_order?.customer_name ? `· ${l.production_order.customer_name}` : ''}</span>
                  </div>
                ))}
                {receiptLinks.map((l: any) => (
                  <div key={l.id} className="flex items-center gap-1.5 text-xs">
                    <Link2 className="w-3 h-3 text-primary shrink-0" />
                    <span className="font-bold">{l.receipt?.reference_doc || l.receipt_id.slice(0, 8)}</span>
                    <span className="text-muted-foreground">· Recepción {l.receipt?.supplier ? `· ${l.receipt.supplier}` : ''} · {Number(l.allocation_percentage).toFixed(1)}% ({formatCurrency(Number(l.allocated_amount))})</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'payments' && (
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-border/30 bg-muted/20 p-2 text-center">
                <p className="text-[9px] font-black uppercase text-muted-foreground">Total</p>
                <p className="text-sm font-mono font-black">{formatCurrency(service.total_amount)}</p>
              </div>
              <div className="rounded-xl border border-success/20 bg-success/5 p-2 text-center">
                <p className="text-[9px] font-black uppercase text-muted-foreground">Pagado</p>
                <p className="text-sm font-mono font-black text-success">{formatCurrency(totalPaid)}</p>
              </div>
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-2 text-center">
                <p className="text-[9px] font-black uppercase text-muted-foreground">Saldo</p>
                <p className="text-sm font-mono font-black text-primary">{formatCurrency(balance)}</p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className={cn("px-3 py-1 rounded-full text-[10px] font-black uppercase border", statusBadge.color)}>{statusBadge.label}</span>
              <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[10px] font-black uppercase hover:opacity-90 flex items-center gap-1">
                <Plus className="w-3 h-3" /> Registrar Pago
              </button>
            </div>

            {showForm && (
              <div className="rounded-xl border border-border/30 p-3 space-y-2 bg-muted/10">
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(balance.toFixed(2))} className="h-10 bg-background border border-border/50 rounded-lg px-3 text-sm font-bold tabular-nums" />
                  <select value={method} onChange={(e) => setMethod(e.target.value as any)} className="h-10 bg-background border border-border/50 rounded-lg px-3 text-sm font-bold">
                    <option value="cash">💵 Efectivo</option>
                    <option value="transfer">📱 Transferencia</option>
                    <option value="zelle">💳 Zelle</option>
                  </select>
                </div>
                <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Referencia (opcional)" className="w-full h-10 bg-background border border-border/50 rounded-lg px-3 text-sm" />
                <div className="flex gap-2">
                  <button onClick={() => setShowForm(false)} className="flex-1 h-10 rounded-lg border border-border/40 text-[10px] font-black uppercase hover:bg-muted">Cancelar</button>
                  <button onClick={handleSubmit} disabled={submitting} className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-[10px] font-black uppercase hover:opacity-90 disabled:opacity-50">{submitting ? '...' : 'Confirmar'}</button>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <h4 className="text-[10px] font-black uppercase text-muted-foreground">Historial</h4>
              {loadingPayments ? <p className="text-xs text-center py-2 text-muted-foreground">Cargando...</p>
              : payments.length === 0 ? <p className="text-xs text-center py-4 text-muted-foreground">Sin pagos</p>
              : payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-border/30 p-2.5 bg-muted/10">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{p.payment_method === 'cash' ? '💵' : p.payment_method === 'transfer' ? '📱' : '💳'}</span>
                    <div>
                      <p className="text-xs font-bold tabular-nums">{formatCurrency(Number(p.amount_cup || p.amount))} {p.currency}</p>
                      <p className="text-[10px] text-muted-foreground">{new Date(p.payment_date).toLocaleString()} · {p.reference || 'Sin ref'}</p>
                    </div>
                  </div>
                  <button onClick={async () => {
                    if (!confirm('¿Anular este pago?')) return;
                    const res = await fetch(`/api/payments/${p.id}`, { method: 'DELETE' });
                    if (res.ok) { toast.success('Pago anulado'); fetchPayments(); onUpdate(); }
                  }} className="p-1.5 rounded text-destructive hover:bg-destructive/10" title="Anular">
                    <Ban className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Modal de Creación Rápida ──
// v2.18.0: sección "Vinculación operativa" — asocia el servicio a Órdenes de
// Trabajo/Producción y/o Recepciones de almacén DESDE la creación. La relación
// es DOCUMENTAL (service_production_order_links / service_reception_links):
// no genera movimientos de inventario ni contabilidad; la DISTRIBUCIÓN de
// costos sigue siendo una operación separada (botón Recalcular).
function CreateServiceModal({ isOpen, onClose, onCreate }: { isOpen: boolean; onClose: () => void; onCreate: (data: any) => void }) {
  const { user } = useAuthStore();
  const [type, setType] = useState('Transporte');
  const [supplier, setSupplier] = useState('');
  const [amount, setAmount] = useState('');
  const [referenceDoc, setReferenceDoc] = useState('');
  const [method, setMethod] = useState<'amount' | 'quantity' | 'manual'>('amount');
  const [observations, setObservations] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ── Vinculación operativa ──
  const [otSearch, setOtSearch] = useState('');
  const [otResults, setOtResults] = useState<any[]>([]);
  const [otSelected, setOtSelected] = useState<any[]>([]);
  const [otSearching, setOtSearching] = useState(false);
  const [showOtList, setShowOtList] = useState(false);

  const [rcptSearch, setRcptSearch] = useState('');
  const [rcptResults, setRcptResults] = useState<any[]>([]);
  const [rcptSelected, setRcptSelected] = useState<any[]>([]);
  const [rcptSearching, setRcptSearching] = useState(false);
  const [showRcptList, setShowRcptList] = useState(false);

  const storeId = user?.activeStoreId;

  // Búsqueda de OT (producción/trabajo) de la tienda activa, no anuladas ni cerradas
  const searchOTs = useCallback(async (q: string) => {
    if (!storeId) return;
    setOtSearching(true);
    try {
      let query = supabase
        .from('production_orders')
        .select('id, order_number, order_type, status, customer_name, order_date, budget_total, budget_currency')
        .eq('store_id', storeId)
        .not('status', 'in', '("voided","closed")')
        .order('created_at', { ascending: false })
        .limit(20);
      if (q) query = query.or(`order_number.ilike.%${q}%,customer_name.ilike.%${q}%,description.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      setOtResults(data || []);
    } catch (e: any) {
      console.error('Error buscando OT:', e.message);
      setOtResults([]);
    } finally {
      setOtSearching(false);
    }
  }, [storeId]);

  // Búsqueda de recepciones activas de la tienda activa
  const searchReceipts = useCallback(async (q: string) => {
    if (!storeId) return;
    setRcptSearching(true);
    try {
      let query = supabase
        .from('receipts')
        .select('id, reference_doc, supplier, total_cost, status, created_at')
        .eq('store_id', storeId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(20);
      if (q) query = query.or(`reference_doc.ilike.%${q}%,supplier.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      setRcptResults(data || []);
    } catch (e: any) {
      console.error('Error buscando recepciones:', e.message);
      setRcptResults([]);
    } finally {
      setRcptSearching(false);
    }
  }, [storeId]);

  // Abrir la sección → primera carga
  useEffect(() => {
    if (isOpen) {
      searchOTs('');
      searchReceipts('');
    }
  }, [isOpen]);

  // Búsqueda con debounce
  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => searchOTs(otSearch), 350);
    return () => clearTimeout(t);
  }, [otSearch, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => searchReceipts(rcptSearch), 350);
    return () => clearTimeout(t);
  }, [rcptSearch, isOpen]);

  const toggleOT = (ot: any) => {
    setOtSelected(prev => prev.some(x => x.id === ot.id) ? prev.filter(x => x.id !== ot.id) : [...prev, ot]);
  };
  const toggleRcpt = (rc: any) => {
    setRcptSelected(prev => prev.some(x => x.id === rc.id) ? prev.filter(x => x.id !== rc.id) : [...prev, rc]);
  };

  const OT_STATUS_LABELS: Record<string, string> = {
    draft: 'Borrador', approved: 'Aprobada', in_progress: 'En curso',
    paused: 'Pausada', completed: 'Completada',
  };

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
      // v2.18.0 — Vinculación operativa (opcional, ambas pueden coexistir)
      receipt_ids: rcptSelected.map(r => r.id),
      production_order_ids: otSelected.map(o => o.id),
    });
    setSubmitting(false);
    // Reset
    setType('Transporte'); setSupplier(''); setAmount(''); setReferenceDoc(''); setObservations('');
    setOtSelected([]); setRcptSelected([]); setOtSearch(''); setRcptSearch('');
  };

  const quickTypes = ['Transporte', 'Manipulación', 'Seguro', 'Aduana', 'Estiba', 'Descarga', 'Otros'];

  return (
    <BaseModal open={isOpen} onOpenChange={(o) => !o && onClose()} title={<span className="flex items-center gap-2"><Plus className="w-5 h-5" /> Nuevo Servicio Recibido</span>} maxWidth="sm:max-w-2xl">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-black uppercase tracking-widest text-muted-foreground block mb-2">Importe total</label>
            <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm font-bold min-h-[44px]" placeholder="0.00" required />
          </div>
          <div>
            <label className="text-xs font-black uppercase tracking-widest text-muted-foreground block mb-2">Documento ref.</label>
            <input type="text" value={referenceDoc} onChange={e => setReferenceDoc(e.target.value)} className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm font-medium min-h-[44px]" placeholder="Factura N°" />
          </div>
        </div>

        {/* ─── v2.18.0: Vinculación operativa ─── */}
        <div className="rounded-xl border border-primary/25 bg-primary/[0.03] p-3 sm:p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-primary" />
            <span className="text-xs font-black uppercase tracking-widest text-foreground">Vinculación operativa</span>
            <span className="text-[10px] font-bold text-muted-foreground normal-case tracking-normal">(opcional)</span>
          </div>

          {/* Orden de Trabajo */}
          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground block">Orden de Trabajo / Producción (OT)</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                value={otSearch}
                onChange={e => { setOtSearch(e.target.value); setShowOtList(true); }}
                onFocus={() => setShowOtList(true)}
                placeholder="Buscar por número, cliente o descripción..."
                className="w-full h-10 pl-9 pr-3 rounded-lg border border-border bg-background text-sm min-h-[44px]"
              />
            </div>
            {showOtList && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border divide-y divide-border/50 bg-background">
                {otSearching ? (
                  <p className="text-xs text-muted-foreground text-center py-3">Buscando...</p>
                ) : otResults.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">Sin órdenes disponibles</p>
                ) : otResults.map(ot => {
                  const selected = otSelected.some(x => x.id === ot.id);
                  return (
                    <button
                      type="button"
                      key={ot.id}
                      onClick={() => toggleOT(ot)}
                      className={cn("w-full text-left px-3 py-2 hover:bg-primary/5 transition-colors flex items-center justify-between gap-2 min-h-[44px]", selected && "bg-primary/10")}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold font-mono truncate">{ot.order_number} <span className="text-muted-foreground font-sans font-medium">· {ot.customer_name || 'Sin cliente'}</span></p>
                        <p className="text-[10px] text-muted-foreground">{ot.order_type === 'production' ? 'Producción' : 'Trabajo'} · {OT_STATUS_LABELS[ot.status] || ot.status} · {ot.order_date}</p>
                      </div>
                      {selected && <span className="text-[10px] font-black uppercase text-primary shrink-0">✓ Vinculada</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {otSelected.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {otSelected.map(ot => (
                  <span key={ot.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-[10px] font-bold">
                    {ot.order_number}
                    <button type="button" onClick={() => toggleOT(ot)} className="hover:text-destructive" aria-label={`Quitar ${ot.order_number}`}>✕</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Recepción de almacén */}
          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground block">Recepción de almacén</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                value={rcptSearch}
                onChange={e => { setRcptSearch(e.target.value); setShowRcptList(true); }}
                onFocus={() => setShowRcptList(true)}
                placeholder="Buscar por factura o proveedor..."
                className="w-full h-10 pl-9 pr-3 rounded-lg border border-border bg-background text-sm min-h-[44px]"
              />
            </div>
            {showRcptList && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border divide-y divide-border/50 bg-background">
                {rcptSearching ? (
                  <p className="text-xs text-muted-foreground text-center py-3">Buscando...</p>
                ) : rcptResults.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">Sin recepciones activas</p>
                ) : rcptResults.map(rc => {
                  const selected = rcptSelected.some(x => x.id === rc.id);
                  return (
                    <button
                      type="button"
                      key={rc.id}
                      onClick={() => toggleRcpt(rc)}
                      className={cn("w-full text-left px-3 py-2 hover:bg-primary/5 transition-colors flex items-center justify-between gap-2 min-h-[44px]", selected && "bg-primary/10")}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate">{rc.reference_doc || 'Sin factura'} <span className="text-muted-foreground font-medium">· {rc.supplier || 'Sin proveedor'}</span></p>
                        <p className="text-[10px] text-muted-foreground">Activa · {String(rc.created_at).slice(0, 10)}</p>
                      </div>
                      {selected && <span className="text-[10px] font-black uppercase text-primary shrink-0">✓ Vinculada</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {rcptSelected.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {rcptSelected.map(rc => (
                  <span key={rc.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-[10px] font-bold">
                    {rc.reference_doc || rc.id.slice(0, 8)}
                    <button type="button" onClick={() => toggleRcpt(rc)} className="hover:text-destructive" aria-label="Quitar recepción">✕</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground leading-relaxed">
            La vinculación es <span className="font-bold">documental</span>: no genera movimientos de almacén ni contabilidad.
            La distribución del costo sobre la recepción se ejecuta después con «Recalcular» y el pago se registra en la pestaña Pagos del servicio.
          </p>
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
