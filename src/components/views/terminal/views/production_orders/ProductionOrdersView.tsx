'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Plus, Factory, Wrench, Eye, Ban, Play, Pause, CheckCircle2, Clock, DollarSign, Package, ArrowDownToLine, X, Edit3 } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
import type { ProductionOrder, ProductionOrderItem } from '@/types';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  draft:       { label: 'Borrador',     color: 'bg-muted text-muted-foreground border-border', icon: Clock },
  approved:    { label: 'Aprobada',     color: 'bg-primary/15 text-primary border-primary/30', icon: CheckCircle2 },
  in_progress: { label: 'En Progreso',  color: 'bg-blue-500/15 text-blue-500 border-blue-500/30', icon: Play },
  paused:      { label: 'Pausada',      color: 'bg-amber-500/15 text-amber-500 border-amber-500/30', icon: Pause },
  completed:   { label: 'Completada',   color: 'bg-success/15 text-success border-success/30', icon: CheckCircle2 },
  closed:      { label: 'Cerrada',      color: 'bg-muted text-muted-foreground border-border', icon: CheckCircle2 },
  voided:      { label: 'Anulada',      color: 'bg-destructive/15 text-destructive border-destructive/30', icon: Ban },
};

const PAYMENT_BADGE: Record<string, { label: string; color: string }> = {
  paid:    { label: '💰 Pagado',    color: 'bg-success/10 text-success' },
  partial: { label: '⚖️ Parcial',   color: 'bg-amber-500/10 text-amber-500' },
  unpaid:  { label: '⏳ Pendiente',  color: 'bg-destructive/10 text-destructive' },
};

export default function ProductionOrdersView() {
  const { user } = useAuthStore();
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [detailOrder, setDetailOrder] = useState<ProductionOrder | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const fetchOrders = useCallback(async () => {
    if (!user?.activeStoreId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('production_orders')
        .select('*')
        .eq('store_id', user.activeStoreId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setOrders(data || []);
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [user?.activeStoreId]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const filtered = orders.filter(o => {
    if (filter !== 'all' && o.status !== filter) return false;
    if (typeFilter !== 'all' && o.order_type !== typeFilter) return false;
    return true;
  });

  const handleStatusChange = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/production-orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) { toast.success('Estado actualizado'); fetchOrders(); }
    } catch { toast.error('Error'); }
  };

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-tight">Órdenes de Producción y Trabajo</h2>
          <p className="text-xs text-muted-foreground mt-1">Gestión de obras, servicios y producción con presupuesto</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase hover:opacity-90"
        >
          <Plus className="w-4 h-4" /> Nueva Orden
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="h-9 bg-background border border-border/50 rounded-lg px-3 text-xs font-bold">
          <option value="all">Todos los tipos</option>
          <option value="production">🏭 Producción</option>
          <option value="service">🔧 Servicio</option>
          <option value="work">📦 Trabajo</option>
        </select>
        {['all', 'draft', 'approved', 'in_progress', 'paused', 'completed', 'closed', 'voided'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={cn("px-3 py-1.5 rounded-lg text-[10px] font-black uppercase border",
              filter === s ? "bg-primary text-primary-foreground border-primary" : "border-border/40 text-muted-foreground hover:bg-muted")}>
            {s === 'all' ? 'Todas' : STATUS_CONFIG[s]?.label || s}
          </button>
        ))}
      </div>

      {/* Tabla */}
      {loading ? (
        <p className="text-center py-8 text-muted-foreground">Cargando...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Factory className="w-8 h-8 mx-auto opacity-30 mb-2" />
          <p className="text-sm">Sin órdenes. Crea una nueva para comenzar.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/30">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr className="text-[10px] font-black uppercase text-muted-foreground">
                <th className="p-3 text-left">Orden</th>
                <th className="p-3 text-left">Tipo</th>
                <th className="p-3 text-left">Cliente</th>
                <th className="p-3 text-right">Presupuesto</th>
                <th className="p-3 text-center">Estado</th>
                <th className="p-3 text-center">Pago</th>
                <th className="p-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((order, i) => {
                const sc = STATUS_CONFIG[order.status] || STATUS_CONFIG.draft;
                const StatusIcon = sc.icon;
                const pc = PAYMENT_BADGE[order.payment_status] || PAYMENT_BADGE.unpaid;
                return (
                  <motion.tr key={order.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                    className="border-t border-border/20 hover:bg-muted/10">
                    <td className="p-3">
                      <p className="font-mono font-bold text-xs">{order.order_number}</p>
                      <p className="text-[10px] text-muted-foreground">{new Date(order.order_date).toLocaleDateString()}</p>
                    </td>
                    <td className="p-3 text-center">
                      <span className="text-lg">{order.order_type === 'production' ? '🏭' : order.order_type === 'work' ? '📦' : '🔧'}</span>
                    </td>
                    <td className="p-3">
                      <p className="text-xs font-bold">{order.customer_name || 'Sin cliente'}</p>
                      <p className="text-[10px] text-muted-foreground">{order.customer_phone || ''}</p>
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-sm">{formatCurrency(order.budget_total)} {order.budget_currency}</td>
                    <td className="p-3 text-center">
                      <span className={cn("inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-black uppercase border", sc.color)}>
                        <StatusIcon className="w-3 h-3" /> {sc.label}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <span className={cn("px-2 py-1 rounded text-[10px] font-black", pc.color)}>{pc.label}</span>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setDetailOrder(order)} className="p-2 rounded-lg hover:bg-primary/10 text-primary" title="Ver detalle">
                          <Eye className="w-4 h-4" />
                        </button>
                        {order.status === 'draft' && (
                          <button onClick={() => handleStatusChange(order.id, 'approved')} className="p-2 rounded-lg hover:bg-primary/10 text-primary" title="Aprobar">
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                        {order.status === 'approved' && (
                          <button onClick={() => handleStatusChange(order.id, 'in_progress')} className="p-2 rounded-lg hover:bg-blue-500/10 text-blue-500" title="Iniciar">
                            <Play className="w-4 h-4" />
                          </button>
                        )}
                        {order.status === 'in_progress' && (
                          <button onClick={() => handleStatusChange(order.id, 'paused')} className="p-2 rounded-lg hover:bg-amber-500/10 text-amber-500" title="Pausar">
                            <Pause className="w-4 h-4" />
                          </button>
                        )}
                        {order.status === 'paused' && (
                          <button onClick={() => handleStatusChange(order.id, 'in_progress')} className="p-2 rounded-lg hover:bg-blue-500/10 text-blue-500" title="Reanudar">
                            <Play className="w-4 h-4" />
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

      {/* Modal de detalle */}
      {detailOrder && (
        <OrderDetailModal
          order={detailOrder}
          onClose={() => setDetailOrder(null)}
          onUpdate={fetchOrders}
        />
      )}

      {/* Modal de creación */}
      {showCreate && (
        <CreateOrderModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchOrders(); }}
        />
      )}
    </div>
  );
}

// ============================================================================
// Modal de Creación
// ============================================================================
function CreateOrderModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { user } = useAuthStore();
  const [orderType, setOrderType] = useState<'production' | 'service' | 'work'>('service');
  const [customerName, setCustomerName] = useState('');
  const [customerCI, setCustomerCI] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [budgetTotal, setBudgetTotal] = useState('');
  const [budgetCurrency, setBudgetCurrency] = useState('CUP');
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceMethod, setAdvanceMethod] = useState<'cash' | 'transfer' | 'zelle'>('cash');
  const [advanceCurrency, setAdvanceCurrency] = useState('CUP');
  const [description, setDescription] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user?.activeStoreId || !search) return;
    const t = setTimeout(async () => {
      const { data } = await supabase.from('products')
        .select('id, name, sku, stock_current, price')
        .eq('store_id', user.activeStoreId)
        .ilike('name', `%${search}%`)
        .limit(10);
      setProducts(data || []);
    }, 300);
    return () => clearTimeout(t);
  }, [search, user?.activeStoreId]);

  const addItem = (product: any) => {
    setItems([...items, { product_id: product.id, name: product.name, budgeted_qty: 1, budgeted_unit_cost: product.price || 0 }]);
    setSearch('');
    setProducts([]);
  };

  const handleSubmit = async () => {
    if (!budgetTotal || parseFloat(budgetTotal) <= 0) { toast.error('Presupuesto requerido'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/production-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_type: orderType,
          customer_name: customerName || null,
          customer_ci: customerCI || null,
          customer_phone: customerPhone || null,
          customer_address: customerAddress || null,
          budget_total: parseFloat(budgetTotal),
          budget_currency: budgetCurrency,
          advance_amount: parseFloat(advanceAmount) || 0,
          advance_method: parseFloat(advanceAmount) > 0 ? advanceMethod : undefined,
          advance_currency: advanceCurrency,
          description: description || null,
          items: items.map(i => ({ product_id: i.product_id, budgeted_qty: i.budgeted_qty, budgeted_unit_cost: i.budgeted_unit_cost })),
        }),
      });
      if (res.ok) { toast.success('Orden creada'); onCreated(); }
      else { const err = await res.json(); toast.error(err.error || 'Error'); }
    } catch { toast.error('Error de conexión'); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-card border border-border/50 rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-card border-b border-border/30 p-4 flex items-center justify-between z-10">
          <h2 className="text-sm font-black uppercase tracking-widest">Nueva Orden</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          {/* Tipo */}
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => setOrderType('service')} className={cn("py-3 rounded-xl border-2 text-xs font-black uppercase flex flex-col items-center gap-1", orderType === 'service' ? "border-primary bg-primary/5 text-primary" : "border-border/30 text-muted-foreground")}>
              <Wrench className="w-5 h-5" /> Servicio
            </button>
            <button onClick={() => setOrderType('work')} className={cn("py-3 rounded-xl border-2 text-xs font-black uppercase flex flex-col items-center gap-1", orderType === 'work' ? "border-primary bg-primary/5 text-primary" : "border-border/30 text-muted-foreground")}>
              <Package className="w-5 h-5" /> Trabajo
            </button>
            <button onClick={() => setOrderType('production')} className={cn("py-3 rounded-xl border-2 text-xs font-black uppercase flex flex-col items-center gap-1", orderType === 'production' ? "border-primary bg-primary/5 text-primary" : "border-border/30 text-muted-foreground")}>
              <Factory className="w-5 h-5" /> Producción
            </button>
          </div>

          {/* Cliente */}
          <div className="grid grid-cols-2 gap-2">
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nombre" className="h-10 bg-background border border-border/50 rounded-lg px-3 text-sm" />
            <input value={customerCI} onChange={(e) => setCustomerCI(e.target.value)} placeholder="CI" className="h-10 bg-background border border-border/50 rounded-lg px-3 text-sm" />
            <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Teléfono" className="h-10 bg-background border border-border/50 rounded-lg px-3 text-sm" />
            <input value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} placeholder="Dirección" className="h-10 bg-background border border-border/50 rounded-lg px-3 text-sm" />
          </div>

          {/* Presupuesto */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-black uppercase text-muted-foreground block mb-1">Presupuesto</label>
              <input type="number" value={budgetTotal} onChange={(e) => setBudgetTotal(e.target.value)} placeholder="0.00" className="w-full h-10 bg-background border border-border/50 rounded-lg px-3 text-sm font-bold tabular-nums" />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-muted-foreground block mb-1">Moneda</label>
              <select value={budgetCurrency} onChange={(e) => setBudgetCurrency(e.target.value)} className="w-full h-10 bg-background border border-border/50 rounded-lg px-3 text-sm font-bold">
                <option value="CUP">CUP</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="MLC">MLC</option>
              </select>
            </div>
          </div>

          {/* Anticipo */}
          <div className="rounded-xl border border-border/30 p-3 space-y-2 bg-muted/10">
            <p className="text-[10px] font-black uppercase text-muted-foreground">Anticipo (opcional)</p>
            <div className="grid grid-cols-3 gap-2">
              <input type="number" value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} placeholder="0.00" className="h-9 bg-background border border-border/50 rounded-lg px-3 text-sm font-bold tabular-nums" />
              <select value={advanceMethod} onChange={(e) => setAdvanceMethod(e.target.value as any)} className="h-9 bg-background border border-border/50 rounded-lg px-2 text-xs font-bold">
                <option value="cash">💵 Efectivo</option><option value="transfer">📱 Transfer</option><option value="zelle">💳 Zelle</option>
              </select>
              <select value={advanceCurrency} onChange={(e) => setAdvanceCurrency(e.target.value)} className="h-9 bg-background border border-border/50 rounded-lg px-2 text-xs font-bold">
                <option value="CUP">CUP</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="MLC">MLC</option>
              </select>
            </div>
          </div>

          {/* Items del presupuesto */}
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase text-muted-foreground">Materiales presupuestados</p>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto..." className="w-full h-9 bg-background border border-border/50 rounded-lg px-3 text-sm" />
            {products.length > 0 && (
              <div className="border border-border/30 rounded-lg max-h-32 overflow-y-auto">
                {products.map(p => (
                  <button key={p.id} onClick={() => addItem(p)} className="w-full text-left p-2 hover:bg-muted/30 border-b border-border/20 last:border-0">
                    <span className="text-xs font-bold">{p.name}</span>
                    <span className="text-[10px] text-muted-foreground ml-2">Stock: {p.stock_current}</span>
                  </button>
                ))}
              </div>
            )}
            {items.map((item, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded-lg border border-border/30 bg-muted/10">
                <span className="flex-1 text-xs font-bold">{item.name}</span>
                <input type="number" value={item.budgeted_qty} onChange={(e) => { const n = [...items]; n[i].budgeted_qty = parseFloat(e.target.value) || 0; setItems(n); }} className="w-16 h-8 bg-background border border-border/50 rounded px-2 text-xs font-bold text-center" />
                <span className="text-[10px] text-muted-foreground">×{item.budgeted_unit_cost}</span>
                <button onClick={() => setItems(items.filter((_, idx) => idx !== i))} className="text-destructive hover:bg-destructive/10 p-1 rounded"><X className="w-3 h-3" /></button>
              </div>
            ))}
          </div>

          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción (opcional)" className="w-full h-10 bg-background border border-border/50 rounded-lg px-3 text-sm" />

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 h-10 rounded-lg border border-border/40 text-xs font-black uppercase hover:bg-muted">Cancelar</button>
            <button onClick={handleSubmit} disabled={submitting} className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-xs font-black uppercase hover:opacity-90 disabled:opacity-50">{submitting ? '...' : 'Crear Orden'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Modal de Detalle
// ============================================================================
function OrderDetailModal({ order, onClose, onUpdate }: { order: ProductionOrder; onClose: () => void; onUpdate: () => void }) {
  const [activeTab, setActiveTab] = useState<'info' | 'items' | 'payments'>('info');
  const [items, setItems] = useState<ProductionOrderItem[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [finalAmount, setFinalAmount] = useState('');
  const [finalMethod, setFinalMethod] = useState<'cash' | 'transfer' | 'zelle'>('cash');
  const [finalCurrency, setFinalCurrency] = useState('CUP');
  const [outputProductId, setOutputProductId] = useState('');
  const [outputQty, setOutputQty] = useState('');
  const [products, setProducts] = useState<any[]>([]);

  // Fase 3: edición en borrador
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    customer_name: order.customer_name || '',
    customer_ci: order.customer_ci || '',
    customer_phone: order.customer_phone || '',
    customer_address: order.customer_address || '',
    description: order.description || '',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Fase 3: añadir material
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [materialSearch, setMaterialSearch] = useState('');
  const [materialResults, setMaterialResults] = useState<any[]>([]);
  const [newMaterialQty, setNewMaterialQty] = useState('1');
  const [addingMaterial, setAddingMaterial] = useState(false);

  // Fase 4: anular
  const [voiding, setVoiding] = useState(false);

  const canEdit = order.status !== 'closed' && order.status !== 'voided';
  const sc = STATUS_CONFIG[order.status] || STATUS_CONFIG.draft;

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/production-orders/${order.id}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        setPayments(data.payments || []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [order.id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  // Búsqueda de materiales para añadir
  useEffect(() => {
    if (!showAddMaterial || !materialSearch) { setMaterialResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('products')
        .select('id, name, sku, price, stock_current, unit_of_measure')
        .eq('store_id', order.store_id)
        .or(`name.ilike.%${materialSearch}%,sku.ilike.%${materialSearch}%`)
        .limit(10);
      setMaterialResults(data || []);
    }, 300);
    return () => clearTimeout(t);
  }, [materialSearch, showAddMaterial, order.store_id]);

  const totalPaid = payments.reduce((s, p) => s + Number(p.amount_cup || p.amount), 0);
  const balance = order.budget_total - order.paid_amount;

  const handleWithdraw = async (item: ProductionOrderItem) => {
    const qty = prompt(`Cantidad a dar salida de "${item.products?.name}":`, String(item.budgeted_qty - item.actual_qty));
    if (!qty) return;
    try {
      const res = await fetch(`/api/production-orders/${order.id}/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: item.id, qty: parseFloat(qty), unit_cost: item.budgeted_unit_cost }),
      });
      if (res.ok) { toast.success('Salida registrada'); fetchDetail(); }
    } catch { toast.error('Error'); }
  };

  const handleClose = async () => {
    try {
      const res = await fetch(`/api/production-orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'close',
          final_amount: parseFloat(finalAmount) || 0,
          final_method: finalMethod,
          final_currency: finalCurrency,
          output_product_id: order.order_type === 'production' && outputProductId ? outputProductId : undefined,
          output_quantity: order.order_type === 'production' && outputQty ? parseFloat(outputQty) : undefined,
        }),
      });
      if (res.ok) { toast.success('Orden cerrada'); onUpdate(); onClose(); }
      else { const err = await res.json(); toast.error(err.error || 'Error'); }
    } catch { toast.error('Error'); }
  };

  // Fase 3: guardar edición
  const handleSaveEdit = async () => {
    setSavingEdit(true);
    try {
      const { token } = useAuthStore.getState();
      const res = await fetch(`/api/production-orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        toast.success('Cambios guardados');
        setIsEditing(false);
        onUpdate();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Error');
      }
    } catch (e: any) { toast.error('Error: ' + e.message); }
    finally { setSavingEdit(false); }
  };

  // Fase 3: añadir material
  const handleAddMaterial = async (productId: string, productName: string) => {
    setAddingMaterial(true);
    try {
      const { token } = useAuthStore.getState();
      const res = await fetch(`/api/production-orders/${order.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          product_id: productId,
          budgeted_qty: parseFloat(newMaterialQty) || 1,
        }),
      });
      if (res.ok) {
        toast.success(`"${productName}" añadido`);
        setMaterialSearch('');
        setMaterialResults([]);
        setNewMaterialQty('1');
        fetchDetail();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Error');
      }
    } catch (e: any) { toast.error('Error: ' + e.message); }
    finally { setAddingMaterial(false); }
  };

  // Fase 3: eliminar material
  const handleDeleteItem = async (itemId: string, itemName: string) => {
    if (!confirm(`¿Eliminar "${itemName}" de los materiales?`)) return;
    try {
      const { token } = useAuthStore.getState();
      const res = await fetch(`/api/production-orders/${order.id}/items?item_id=${itemId}`, {
        method: 'DELETE',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (res.ok) { toast.success('Material eliminado'); fetchDetail(); }
      else { const err = await res.json(); toast.error(err.error || 'Error'); }
    } catch { toast.error('Error'); }
  };

  // Fase 4: anular orden
  const handleVoid = async () => {
    const reason = prompt('Motivo de anulación:', 'Anulación manual');
    if (!reason) return;
    setVoiding(true);
    try {
      const { token } = useAuthStore.getState();
      const res = await fetch(`/api/production-orders/${order.id}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'Orden anulada');
        onUpdate();
        onClose();
      } else {
        toast.error(data.error || 'Error');
      }
    } catch (e: any) { toast.error('Error: ' + e.message); }
    finally { setVoiding(false); }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center sm:p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl h-[95vh] sm:h-auto sm:max-h-[90vh] overflow-y-auto bg-card rounded-t-2xl sm:rounded-2xl border border-border/50 shadow-2xl" onClick={e => e.stopPropagation()}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border/30 p-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-2xl shrink-0">{order.order_type === 'production' ? '🏭' : order.order_type === 'work' ? '📦' : '🔧'}</span>
            <div className="min-w-0">
              <h2 className="text-sm font-black uppercase tracking-widest truncate">{order.order_number}</h2>
              <p className="text-[10px] text-muted-foreground truncate">{order.customer_name || 'Sin cliente'} · {sc.label}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {/* Fase 4: botón Anular */}
            {canEdit && (
              <button
                onClick={handleVoid}
                disabled={voiding}
                className="px-2 py-2 rounded-lg bg-destructive/10 text-destructive border border-destructive/30 text-[10px] font-black uppercase hover:bg-destructive/20 min-h-[44px] flex items-center gap-1"
                title="Anular orden"
                aria-label="Anular orden"
              >
                <Ban className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Anular</span>
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Cerrar">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border/30 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          <button onClick={() => setActiveTab('info')} className={cn("flex-1 py-3 px-4 text-xs font-black uppercase border-b-2 -mb-px whitespace-nowrap min-h-[44px]", activeTab === 'info' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground')}>Info</button>
          <button onClick={() => setActiveTab('items')} className={cn("flex-1 py-3 px-4 text-xs font-black uppercase border-b-2 -mb-px whitespace-nowrap min-h-[44px]", activeTab === 'items' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground')}>Materiales ({items.length})</button>
          <button onClick={() => setActiveTab('payments')} className={cn("flex-1 py-3 px-4 text-xs font-black uppercase border-b-2 -mb-px whitespace-nowrap min-h-[44px]", activeTab === 'payments' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground')}>Pagos ({payments.length})</button>
        </div>

        {/* Tab Info */}
        {activeTab === 'info' && (
          <div className="p-4 space-y-3">
            {/* Fase 3: edición en borrador */}
            {canEdit && !isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="w-full px-3 py-2 rounded-lg border border-border text-xs font-black uppercase hover:bg-muted min-h-[44px] flex items-center justify-center gap-2"
              >
                <Edit3 className="w-3.5 h-3.5" /> Editar información
              </button>
            )}

            {isEditing ? (
              /* Modo edición */
              <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-black uppercase text-muted-foreground block mb-1">Cliente</label>
                    <input value={editForm.customer_name} onChange={(e) => setEditForm({ ...editForm, customer_name: e.target.value })} className="w-full h-11 px-3 rounded-lg border-2 border-border bg-background text-sm font-bold min-h-[44px]" placeholder="Nombre del cliente" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-muted-foreground block mb-1">CI</label>
                    <input value={editForm.customer_ci} onChange={(e) => setEditForm({ ...editForm, customer_ci: e.target.value })} className="w-full h-11 px-3 rounded-lg border-2 border-border bg-background text-sm font-bold min-h-[44px]" placeholder="Carné de identidad" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-muted-foreground block mb-1">Teléfono</label>
                    <input value={editForm.customer_phone} onChange={(e) => setEditForm({ ...editForm, customer_phone: e.target.value })} className="w-full h-11 px-3 rounded-lg border-2 border-border bg-background text-sm font-bold min-h-[44px]" placeholder="Teléfono" inputMode="tel" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-muted-foreground block mb-1">Dirección</label>
                    <input value={editForm.customer_address} onChange={(e) => setEditForm({ ...editForm, customer_address: e.target.value })} className="w-full h-11 px-3 rounded-lg border-2 border-border bg-background text-sm font-bold min-h-[44px]" placeholder="Dirección" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-muted-foreground block mb-1">Descripción</label>
                  <textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={2} className="w-full px-3 py-2 rounded-lg border-2 border-border bg-background text-sm min-h-[44px]" placeholder="Descripción del trabajo" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setIsEditing(false)} className="flex-1 h-11 rounded-lg border border-border text-xs font-black uppercase hover:bg-muted min-h-[44px]">Cancelar</button>
                  <button onClick={handleSaveEdit} disabled={savingEdit} className="flex-1 h-11 rounded-lg bg-primary text-primary-foreground text-xs font-black uppercase hover:bg-primary/90 disabled:opacity-50 min-h-[44px]">
                    {savingEdit ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </div>
            ) : (
              /* Modo lectura */
              <>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Tipo:</span> <span className="font-bold">{order.order_type === 'production' ? '🏭 Producción' : order.order_type === 'work' ? '📦 Trabajo' : '🔧 Servicio'}</span></div>
                  <div><span className="text-muted-foreground">Fecha:</span> <span className="font-bold">{new Date(order.order_date).toLocaleDateString()}</span></div>
                  <div><span className="text-muted-foreground">Cliente:</span> <span className="font-bold">{order.customer_name || '—'}</span></div>
                  <div><span className="text-muted-foreground">CI:</span> <span className="font-bold">{order.customer_ci || '—'}</span></div>
                  <div><span className="text-muted-foreground">Teléfono:</span> <span className="font-bold">{order.customer_phone || '—'}</span></div>
                  <div><span className="text-muted-foreground">Dirección:</span> <span className="font-bold">{order.customer_address || '—'}</span></div>
                </div>
                <div className="pt-2 border-t border-border/30 grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-border/30 bg-muted/20 p-2 text-center">
                    <p className="text-[9px] font-black uppercase text-muted-foreground">Presupuesto</p>
                    <p className="text-sm font-mono font-black">{formatCurrency(order.budget_total)} {order.budget_currency}</p>
                  </div>
                  <div className="rounded-lg border border-success/20 bg-success/5 p-2 text-center">
                    <p className="text-[9px] font-black uppercase text-muted-foreground">Pagado</p>
                    <p className="text-sm font-mono font-black text-success">{formatCurrency(order.paid_amount)}</p>
                  </div>
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-2 text-center">
                    <p className="text-[9px] font-black uppercase text-muted-foreground">Saldo</p>
                    <p className="text-sm font-mono font-black text-primary">{formatCurrency(balance)}</p>
                  </div>
                </div>
                {order.description && <p className="text-xs pt-2 border-t border-border/30">{order.description}</p>}
              </>
            )}

            {/* Botón de cerrar orden */}
            {canEdit && !isEditing && (
              <div className="pt-2 border-t border-border/30">
                {!showCloseForm ? (
                  <button onClick={() => setShowCloseForm(true)} className="w-full h-11 rounded-lg bg-success text-white text-xs font-black uppercase hover:opacity-90 flex items-center justify-center gap-2 min-h-[44px]">
                    <CheckCircle2 className="w-4 h-4" /> Cerrar Orden
                  </button>
                ) : (
                  <div className="space-y-2 p-3 rounded-xl border border-success/30 bg-success/5">
                    <p className="text-[10px] font-black uppercase text-muted-foreground">Pago al cerrar</p>
                    <div className="grid grid-cols-3 gap-2">
                      <input type="number" inputMode="decimal" value={finalAmount} onChange={(e) => setFinalAmount(e.target.value)} placeholder={String(balance.toFixed(2))} className="h-11 bg-background border border-border/50 rounded-lg px-3 text-sm font-bold tabular-nums min-h-[44px]" />
                      <select value={finalMethod} onChange={(e) => setFinalMethod(e.target.value as any)} className="h-11 bg-background border border-border/50 rounded-lg px-2 text-xs font-bold min-h-[44px]">
                        <option value="cash">💵 Efectivo</option><option value="transfer">📱 Transfer</option><option value="zelle">💳 Zelle</option>
                      </select>
                      <select value={finalCurrency} onChange={(e) => setFinalCurrency(e.target.value)} className="h-11 bg-background border border-border/50 rounded-lg px-2 text-xs font-bold min-h-[44px]">
                        <option value="CUP">CUP</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="MLC">MLC</option>
                      </select>
                    </div>
                    {order.order_type === 'production' && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-black uppercase text-muted-foreground">Producto terminado (entra al almacén)</p>
                        <ProductSearchInput value={outputProductId} onChange={setOutputProductId} storeId={order.store_id} />
                        <input type="number" inputMode="decimal" value={outputQty} onChange={(e) => setOutputQty(e.target.value)} placeholder="Cantidad producida" className="w-full h-11 bg-background border border-border/50 rounded-lg px-3 text-sm font-bold min-h-[44px]" />
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button onClick={() => setShowCloseForm(false)} className="flex-1 h-11 rounded-lg border border-border/40 text-[10px] font-black uppercase min-h-[44px]">Cancelar</button>
                      <button onClick={handleClose} className="flex-1 h-11 rounded-lg bg-success text-white text-[10px] font-black uppercase min-h-[44px]">Confirmar Cierre</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab Items — Fase 3: añadir/eliminar materiales */}
        {activeTab === 'items' && (
          <div className="p-4 space-y-2">
            {/* Botón añadir material */}
            {canEdit && !showAddMaterial && (
              <button
                onClick={() => setShowAddMaterial(true)}
                className="w-full px-3 py-2 rounded-lg border border-border text-xs font-black uppercase hover:bg-muted min-h-[44px] flex items-center justify-center gap-2"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar material
              </button>
            )}

            {/* Formulario añadir material */}
            {showAddMaterial && canEdit && (
              <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-3 space-y-2">
                <div className="relative">
                  <input
                    type="text"
                    value={materialSearch}
                    onChange={(e) => setMaterialSearch(e.target.value)}
                    placeholder="Buscar producto por nombre o SKU..."
                    className="w-full h-11 px-3 rounded-lg border-2 border-border bg-background text-sm font-bold min-h-[44px]"
                    autoFocus
                  />
                </div>
                {materialResults.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-border/30 bg-background">
                    {materialResults.map(p => (
                      <button
                        key={p.id}
                        onClick={() => handleAddMaterial(p.id, p.name)}
                        disabled={addingMaterial}
                        className="w-full text-left px-3 py-2 hover:bg-muted/30 border-b border-border/20 last:border-0 min-h-[44px] flex items-center justify-between"
                      >
                        <div>
                          <p className="text-xs font-bold">{p.name}</p>
                          <p className="text-[10px] text-muted-foreground">{p.sku || '—'} · Stock: {p.stock_current} · {formatCurrency(p.price)}</p>
                        </div>
                        <Plus className="w-3 h-3 text-primary shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-black uppercase text-muted-foreground shrink-0">Cant:</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    value={newMaterialQty}
                    onChange={(e) => setNewMaterialQty(e.target.value)}
                    className="w-20 h-11 px-2 rounded-lg border-2 border-border bg-background text-sm font-mono font-bold min-h-[44px]"
                  />
                  <button onClick={() => setShowAddMaterial(false)} className="flex-1 h-11 rounded-lg border border-border text-xs font-bold uppercase hover:bg-muted min-h-[44px]">Cerrar</button>
                </div>
              </div>
            )}

            {/* Lista de items */}
            {loading ? <p className="text-center text-muted-foreground py-4">Cargando...</p>
            : items.length === 0 ? <p className="text-center text-muted-foreground py-4">Sin materiales</p>
            : items.map(item => (
              <div key={item.id} className="rounded-lg border border-border/30 p-3 bg-muted/10">
                <div className="flex items-center justify-between mb-1">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold truncate">{item.products?.name || 'Producto'}</p>
                    <p className="text-[10px] text-muted-foreground">Stock actual: {item.products?.stock_current ?? '—'}</p>
                  </div>
                  <span className={cn("px-2 py-1 rounded text-[10px] font-black uppercase shrink-0 ml-2",
                    item.status === 'completed' ? "bg-success/10 text-success" : item.status === 'partial' ? "bg-amber-500/10 text-amber-500" : "bg-muted text-muted-foreground")}>
                    {item.status}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[10px] font-bold">
                  <div className="text-center"><span className="text-muted-foreground">Presup.</span><br />{item.budgeted_qty} × {formatCurrency(item.budgeted_unit_cost)}</div>
                  <div className="text-center"><span className="text-muted-foreground">Real</span><br />{item.actual_qty} × {formatCurrency(item.actual_unit_cost)}</div>
                  <div className="text-center"><span className="text-muted-foreground">Desviación</span><br />{item.actual_qty - item.budgeted_qty > 0 ? '+' : ''}{(item.actual_qty - item.budgeted_qty).toFixed(2)}</div>
                </div>
                <div className="flex gap-1 mt-2">
                  {order.status === 'in_progress' && item.status !== 'completed' && (
                    <button onClick={() => handleWithdraw(item)} className="flex-1 h-9 rounded-lg bg-primary/10 text-primary text-[10px] font-black uppercase hover:bg-primary/20 flex items-center justify-center gap-1 min-h-[36px]">
                      <ArrowDownToLine className="w-3 h-3" /> Dar Salida
                    </button>
                  )}
                  {/* Fase 3: eliminar material si no tiene salida */}
                  {canEdit && Number(item.actual_qty) === 0 && (
                    <button onClick={() => handleDeleteItem(item.id, item.products?.name || 'Producto')} className="px-2 h-9 rounded-lg bg-destructive/10 text-destructive text-[10px] font-black uppercase hover:bg-destructive/20 flex items-center justify-center min-h-[36px]" aria-label="Eliminar material">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab Pagos */}
        {activeTab === 'payments' && (
          <PaymentsTab
            order={order}
            payments={payments}
            loading={loading}
            onRefresh={fetchDetail}
          />
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Fase 2: Tab Pagos — formulario de registro + lista + balance CUP
// ════════════════════════════════════════════════════════════════════
function PaymentsTab({ order, payments, loading, onRefresh }: {
  order: ProductionOrder;
  payments: any[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    amount: '',
    payment_method: 'cash' as 'cash' | 'transfer' | 'zelle',
    currency: 'CUP',
    exchange_rate: '1',
    payment_type: 'partial' as 'advance' | 'partial' | 'settlement',
    reference: '',
    notes: '',
  });

  const canPay = order.status !== 'closed' && order.status !== 'voided';

  // Calcular totales en CUP
  const totalPaidCup = payments.reduce((s, p) => s + Number(p.amount_cup || 0), 0);
  const budgetCup = order.budget_currency === 'CUP'
    ? Number(order.budget_total)
    : Number(order.budget_total) * (parseFloat(form.exchange_rate) || 1);
  const balanceCup = Math.max(0, budgetCup - totalPaidCup);

  const methodIcon = (m: string) => m === 'cash' ? '💵' : m === 'transfer' ? '📱' : '💳';
  const methodLabel = (m: string) => m === 'cash' ? 'Efectivo' : m === 'transfer' ? 'Transferencia' : 'Zelle';

  const typeBadge: Record<string, { label: string; color: string }> = {
    advance: { label: 'Anticipo', color: 'bg-blue-500/15 text-blue-500 border-blue-500/30' },
    partial: { label: 'Parcial', color: 'bg-amber-500/15 text-amber-500 border-amber-500/30' },
    settlement: { label: 'Liquidación', color: 'bg-success/15 text-success border-success/30' },
  };

  const handleSave = async () => {
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) {
      toast.error('Ingresa un monto válido');
      return;
    }
    setSaving(true);
    try {
      const { token } = useAuthStore.getState();
      const res = await fetch(`/api/production-orders/${order.id}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          amount,
          payment_method: form.payment_method,
          currency: form.currency,
          exchange_rate: parseFloat(form.exchange_rate) || 1,
          payment_type: form.payment_type,
          reference: form.reference || undefined,
          notes: form.notes || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'Pago registrado');
        setForm({ ...form, amount: '', reference: '', notes: '' });
        setShowForm(false);
        onRefresh();
      } else {
        toast.error(data.error || 'Error al registrar pago');
      }
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-4 text-center text-muted-foreground">Cargando pagos...</div>;
  }

  return (
    <div className="p-4 space-y-3">
      {/* Resumen financiero */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-border/40 bg-muted/20 p-2 text-center">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Presupuesto</p>
          <p className="text-sm font-mono font-black text-foreground">
            {formatCurrency(Number(order.budget_total))}
          </p>
          <p className="text-[10px] text-muted-foreground">{order.budget_currency}</p>
        </div>
        <div className="rounded-lg border border-success/30 bg-success/5 p-2 text-center">
          <p className="text-[10px] font-black uppercase tracking-widest text-success">Pagado</p>
          <p className="text-sm font-mono font-black text-success">
            {formatCurrency(totalPaidCup)}
          </p>
          <p className="text-[10px] text-muted-foreground">CUP</p>
        </div>
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-2 text-center">
          <p className="text-[10px] font-black uppercase tracking-widest text-warning">Saldo</p>
          <p className="text-sm font-mono font-black text-warning">
            {formatCurrency(balanceCup)}
          </p>
          <p className="text-[10px] text-muted-foreground">CUP</p>
        </div>
      </div>

      {/* Botón registrar pago */}
      {canPay && (
        <button
          onClick={() => setShowForm(!showForm)}
          className="w-full px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-black uppercase tracking-widest hover:bg-primary/90 min-h-[44px] flex items-center justify-center gap-2"
        >
          <DollarSign className="w-4 h-4" />
          {showForm ? 'Cancelar' : 'Registrar pago'}
        </button>
      )}

      {/* Formulario de registro */}
      {showForm && canPay && (
        <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-3 space-y-2">
          {/* Tipo de pago */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Tipo de pago</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['advance', 'partial', 'settlement'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm({ ...form, payment_type: t })}
                  className={cn(
                    'px-2 py-2 rounded-lg border-2 text-[10px] font-black uppercase tracking-wider min-h-[44px] transition-colors',
                    form.payment_type === t
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted/30'
                  )}
                >
                  {typeBadge[t].label}
                </button>
              ))}
            </div>
          </div>

          {/* Monto + moneda */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Monto</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder={balanceCup > 0 ? balanceCup.toFixed(2) : '0.00'}
                className="w-full h-11 px-3 rounded-lg border-2 border-border bg-background text-sm font-mono font-bold min-h-[44px] text-foreground focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Moneda</label>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value, exchange_rate: e.target.value === 'CUP' ? '1' : form.exchange_rate })}
                className="w-full h-11 px-2 rounded-lg border-2 border-border bg-background text-sm font-bold min-h-[44px] text-foreground"
              >
                <option value="CUP">CUP</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="MLC">MLC</option>
              </select>
            </div>
          </div>

          {/* Método + tasa */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Método</label>
              <select
                value={form.payment_method}
                onChange={(e) => setForm({ ...form, payment_method: e.target.value as any })}
                className="w-full h-11 px-2 rounded-lg border-2 border-border bg-background text-sm font-bold min-h-[44px] text-foreground"
              >
                <option value="cash">💵 Efectivo</option>
                <option value="transfer">📱 Transferencia</option>
                <option value="zelle">💳 Zelle</option>
              </select>
            </div>
            {form.currency !== 'CUP' && (
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Tasa a CUP</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={form.exchange_rate}
                  onChange={(e) => setForm({ ...form, exchange_rate: e.target.value })}
                  placeholder="680"
                  className="w-full h-11 px-3 rounded-lg border-2 border-border bg-background text-sm font-mono font-bold min-h-[44px] text-foreground focus:border-primary focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Referencia */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Referencia (opcional)</label>
            <input
              type="text"
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
              placeholder="Ej: # Transferencia 12345"
              className="w-full h-11 px-3 rounded-lg border-2 border-border bg-background text-sm font-bold min-h-[44px] text-foreground focus:border-primary focus:outline-none"
            />
          </div>

          {/* Botón guardar */}
          <button
            onClick={handleSave}
            disabled={saving || !form.amount}
            className="w-full px-4 py-2.5 rounded-xl bg-success text-success-foreground text-sm font-black uppercase tracking-widest hover:bg-success/90 disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-2"
          >
            {saving ? <Clock className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {saving ? 'Guardando...' : 'Confirmar pago'}
          </button>
        </div>
      )}

      {/* Lista de pagos */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          Historial de pagos ({payments.length})
        </p>
        {payments.length === 0 ? (
          <p className="text-center text-muted-foreground py-4 text-sm">Sin pagos registrados</p>
        ) : payments.map((p, i) => {
          // Inferir tipo de pago: primer pago = advance, último si balance 0 = settlement, resto = partial
          const inferredType = i === 0 ? 'advance' : (i === payments.length - 1 && totalPaidCup >= budgetCup - 1 ? 'settlement' : 'partial');
          const badge = typeBadge[inferredType] || typeBadge.partial;
          return (
            <div key={p.id} className="flex items-center justify-between rounded-lg border border-border/30 p-3 bg-muted/10 gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-lg shrink-0">{methodIcon(p.payment_method)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-xs font-bold tabular-nums text-foreground">
                      {formatCurrency(Number(p.amount))} {p.currency}
                    </p>
                    <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-black uppercase border', badge.color)}>
                      {badge.label}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {methodLabel(p.payment_method)} · {new Date(p.payment_date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {p.reference && <p className="text-[10px] text-muted-foreground truncate">Ref: {p.reference}</p>}
                </div>
              </div>
              {p.amount_cup && p.currency !== 'CUP' && (
                <div className="text-right shrink-0">
                  <p className="text-[10px] font-mono font-bold text-muted-foreground">{formatCurrency(Number(p.amount_cup))}</p>
                  <p className="text-[9px] text-muted-foreground">CUP</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Helper: Product search input para output product
function ProductSearchInput({ value, onChange, storeId }: { value: string; onChange: (id: string) => void; storeId: string }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  useEffect(() => {
    if (!storeId || !search) { setResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('products').select('id, name').eq('store_id', storeId).ilike('name', `%${search}%`).limit(5);
      setResults(data || []);
    }, 300);
    return () => clearTimeout(t);
  }, [search, storeId]);
  return (
    <div className="relative">
      <input value={search} onChange={(e) => { setSearch(e.target.value); onChange(''); }} placeholder="Buscar producto terminado..." className="w-full h-9 bg-background border border-border/50 rounded-lg px-3 text-sm" />
      {results.length > 0 && !value && (
        <div className="absolute z-10 w-full mt-1 border border-border/30 rounded-lg bg-card shadow-lg max-h-32 overflow-y-auto">
          {results.map(p => (
            <button key={p.id} onClick={() => { onChange(p.id); setSearch(p.name); setResults([]); }} className="w-full text-left p-2 hover:bg-muted/30 text-xs font-bold border-b border-border/20 last:border-0">{p.name}</button>
          ))}
        </div>
      )}
    </div>
  );
}
