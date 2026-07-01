'use client';

import React, { useMemo, useState } from 'react';
import {
  ClipboardList,
  Plus,
  Eye,
  XCircle,
  Clock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Trash2,
  Search,
  X,
  Sparkles,
  Crown,
  Zap,
  Wallet,
} from 'lucide-react';
import { BaseModal } from '@/components/ui/BaseModal';
import { PrimaryButton, SecondaryButton } from '@/components/ui/atomic';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/store';
import { useSuppliers } from '@/hooks/api/useSuppliers';
import { useStoreAnalytics } from '@/hooks/api/useStoreAnalytics';
import {
  usePurchaseOrders,
  usePurchaseOrderDetails,
  useCreatePurchaseOrder,
  useUpdatePOStatus,
} from '@/hooks/api/usePurchaseOrders';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { toast } from 'sonner';
import type {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
} from '@/types';

// ────────────────────────────────────────────────────────────
// Constants & helpers
// ────────────────────────────────────────────────────────────

type FilterStatus = 'all' | PurchaseOrderStatus;

const STATUS_FILTERS: { value: FilterStatus; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'sent', label: 'Pendiente' },
  { value: 'partial', label: 'Parcial' },
  { value: 'received', label: 'Recibida' },
  { value: 'cancelled', label: 'Cancelada' },
];

const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  draft: 'Borrador',
  sent: 'Pendiente',
  partial: 'Parcial',
  received: 'Recibida',
  cancelled: 'Cancelada',
};

function StatusBadge({ status }: { status: PurchaseOrderStatus }) {
  const cfg: Record<
    PurchaseOrderStatus,
    { cls: string; Icon: React.ComponentType<{ className?: string }> }
  > = {
    draft: { cls: 'bg-muted text-muted-foreground border-border', Icon: Clock },
    sent: { cls: 'bg-info/10 text-info border-info/20', Icon: Clock },
    partial: { cls: 'bg-warning/10 text-warning border-warning/20', Icon: AlertCircle },
    received: { cls: 'bg-success/10 text-success border-success/20', Icon: CheckCircle2 },
    cancelled: { cls: 'bg-destructive/10 text-destructive border-destructive/20', Icon: XCircle },
  };
  const { cls, Icon } = cfg[status] ?? cfg.sent;
  return (
    <Badge variant="outline" className={cn('gap-1 font-black uppercase tracking-widest text-[10px]', cls)}>
      <Icon className="w-3 h-3" />
      {STATUS_LABEL[status]}
    </Badge>
  );
}

// ────────────────────────────────────────────────────────────
// Form types
// ────────────────────────────────────────────────────────────

interface FormItem {
  product_name: string;
  sku: string;
  quantity_ordered: number;
  unit_cost: number;
  unit_of_measure: string;
}

const UNIT_OF_MEASURE_OPTIONS = [
  'unidad', 'kg', 'g', 'L', 'ml', 'caja', 'paquete', 'saco',
  'docena', 'metro', 'metro²', 'rollo',
] as const;

const emptyItem = (): FormItem => ({
  product_name: '',
  sku: '',
  quantity_ordered: 1,
  unit_cost: 0,
  unit_of_measure: 'unidad',
});

// ────────────────────────────────────────────────────────────
// Main view
// ────────────────────────────────────────────────────────────

export default function PurchaseOrdersView() {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId ?? null;

  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: orders = [], isLoading } = usePurchaseOrders(storeId, statusFilter);
  const { data: suppliers = [] } = useSuppliers(storeId);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(
      (o) =>
        (o.po_number || '').toLowerCase().includes(q) ||
        (o.supplier_name || '').toLowerCase().includes(q),
    );
  }, [orders, search]);

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <ClipboardList className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tight text-primary">
              Órdenes de Compra
            </h2>
            <p className="text-xs text-muted-foreground">
              Gestiona y recibe mercancía contra órdenes emitidas a proveedores.
            </p>
          </div>
        </div>
        <PrimaryButton
          label="Nueva OC"
          icon={Plus}
          onClick={() => setShowCreate(true)}
          className="sm:w-auto"
        />
      </div>

      {/* Filters + search */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                'px-4 py-2 min-h-[44px] rounded-full text-xs font-black uppercase tracking-widest border transition-all',
                statusFilter === f.value
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-background text-muted-foreground border-border hover:bg-muted',
              )}
              aria-pressed={statusFilter === f.value}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por N° OC o proveedor..."
            aria-label="Buscar órdenes de compra"
            className="w-full bg-muted/20 border border-border rounded-xl pl-10 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Limpiar búsqueda"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="text-xs font-black uppercase tracking-widest">Cargando órdenes...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3 text-muted-foreground text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center">
              <ClipboardList className="w-8 h-8 opacity-30" />
            </div>
            <div>
              <p className="font-black text-sm uppercase tracking-widest">Sin órdenes de compra</p>
              <p className="text-xs mt-1">
                {search || statusFilter !== 'all'
                  ? 'No hay resultados con los filtros aplicados.'
                  : 'Crea tu primera orden de compra con el botón "Nueva OC".'}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Desktop header */}
            <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-3 bg-muted/30 border-b border-border text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              <div className="col-span-2">N° OC</div>
              <div className="col-span-3">Proveedor</div>
              <div className="col-span-2">Fecha</div>
              <div className="col-span-2 text-right">Total</div>
              <div className="col-span-2">Estado</div>
              <div className="col-span-1 text-right">Acciones</div>
            </div>
            <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
              {filteredOrders.map((o) => (
                <OrderRow
                  key={o.id}
                  order={o}
                  onView={() => setDetailId(o.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreatePOModal
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* Detail modal */}
      {detailId && (
        <DetailModal poId={detailId} onClose={() => setDetailId(null)} />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// OrderRow
// ────────────────────────────────────────────────────────────

function OrderRow({ order, onView }: { order: PurchaseOrder; onView: () => void }) {
  const updateStatus = useUpdatePOStatus();

  const canCancel = order.status === 'sent' || order.status === 'partial';

  const handleCancel = async () => {
    if (!window.confirm(`¿Cancelar la OC ${order.po_number || order.id.slice(0, 8)}?`)) return;
    try {
      await updateStatus.mutateAsync({ poId: order.id, status: 'cancelled' });
      toast.success('OC cancelada');
    } catch {
      /* onError toast already in hook */
    }
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-12 gap-3 px-4 py-3 items-center hover:bg-muted/30 transition-colors">
      <div className="md:col-span-2">
        <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground md:hidden">N° OC</div>
        <p className="font-mono text-sm font-bold">
          {order.po_number || <span className="text-muted-foreground">—</span>}
        </p>
        <p className="text-[10px] text-muted-foreground md:hidden">
          {formatDate(order.created_at)}
        </p>
      </div>
      <div className="md:col-span-3 min-w-0">
        <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground md:hidden">Proveedor</div>
        <p className="font-bold text-sm truncate">{order.supplier_name || '—'}</p>
      </div>
      <div className="hidden md:block md:col-span-2">
        <p className="text-sm">{formatDate(order.created_at)}</p>
        {order.expected_date && (
          <p className="text-[10px] text-muted-foreground">
            Esperada: {formatDate(order.expected_date)}
          </p>
        )}
      </div>
      <div className="md:col-span-2 md:text-right">
        <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground md:hidden">Total</div>
        <p className="font-black text-sm text-primary tabular-nums">
          {formatCurrency(order.total_amount)}
        </p>
      </div>
      <div className="md:col-span-2">
        <StatusBadge status={order.status} />
      </div>
      <div className="md:col-span-1 flex md:justify-end gap-1">
        <button
          type="button"
          onClick={onView}
          className="p-2 min-w-[44px] min-h-[44px] rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
          aria-label={`Ver detalle de OC ${order.po_number || order.id.slice(0, 8)}`}
          title="Ver detalle"
        >
          <Eye className="w-4 h-4" />
        </button>
        {canCancel && (
          <button
            type="button"
            onClick={handleCancel}
            disabled={updateStatus.isPending}
            className="p-2 min-w-[44px] min-h-[44px] rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
            aria-label={`Cancelar OC ${order.po_number || order.id.slice(0, 8)}`}
            title="Cancelar OC"
          >
            <XCircle className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Create Modal
// ────────────────────────────────────────────────────────────

interface CreatePOModalProps {
  suppliers: Array<{ id: string; name: string }>;
  onClose: () => void;
}

function CreatePOModal({ suppliers, onClose }: CreatePOModalProps) {
  const createPO = useCreatePurchaseOrder();
  const { user } = useAuthStore();
  const { data: analytics } = useStoreAnalytics(user?.activeStoreId, 30);

  const [supplierName, setSupplierName] = useState('');
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [poNumber, setPoNumber] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<FormItem[]>([emptyItem()]);
  // Presupuesto de compra (opcional) — si se define, las sugerencias se ajustan
  const [budget, setBudget] = useState<string>('');
  const [isSuggesting, setIsSuggesting] = useState(false);

  const budgetNum = parseFloat(budget) || 0;

  const total = useMemo(
    () => items.reduce((s, i) => s + (i.quantity_ordered || 0) * (i.unit_cost || 0), 0),
    [items],
  );

  // Sugerir OC inteligente: analiza productos con alta rotación + stock bajo
  const handleSuggest = () => {
    if (!analytics) {
      toast.error('No hay datos de analítica disponibles para sugerir');
      return;
    }
    setIsSuggesting(true);
    try {
      const periodDays = Math.max(1, analytics.period_days);
      // Cruzar top_products_revenue (ventas) con low_stock/slow_movers/overstock (stock_current)
      const stockMap = new Map<string, number>();
      const costMap = new Map<string, number>();
      for (const ls of analytics.low_stock) {
        stockMap.set(ls.product_id, ls.stock_current);
      }
      for (const sm of analytics.slow_movers) {
        if (!stockMap.has(sm.product_id)) stockMap.set(sm.product_id, sm.stock_current);
      }
      for (const os of analytics.overstock) {
        if (!stockMap.has(os.product_id)) stockMap.set(os.product_id, os.stock_current);
      }

      // Construir sugerencias
      interface Suggestion {
        product_id: string;
        name: string;
        sku: string | null;
        avg_daily: number;
        stock_current: number;
        stock_needed_30d: number;
        recommended_qty: number;
        unit_cost: number;
        total_cost: number;
        days_until_out: number | null;
        urgency: 'critical' | 'warning' | 'normal';
      }
      const allSuggestions: Suggestion[] = analytics.top_products_revenue
        .map((p) => {
          const avgDaily = p.quantity / periodDays;
          const stockCurrent = stockMap.get(p.product_id) ?? 0;
          const stockNeeded30d = Math.ceil(avgDaily * 30);
          const recommendedQty = Math.max(0, stockNeeded30d - stockCurrent);
          const daysUntilOut = avgDaily > 0 ? Math.round(stockCurrent / avgDaily) : null;
          const unitCost = p.cost > 0 ? p.cost / p.quantity : 0; // costo unitario aproximado
          const totalCost = recommendedQty * unitCost;
          let urgency: 'critical' | 'warning' | 'normal' = 'normal';
          if (daysUntilOut !== null && daysUntilOut <= 7) urgency = 'critical';
          else if (daysUntilOut !== null && daysUntilOut <= 14) urgency = 'warning';
          return {
            product_id: p.product_id,
            name: p.name,
            sku: p.sku,
            avg_daily: avgDaily,
            stock_current: stockCurrent,
            stock_needed_30d: stockNeeded30d,
            recommended_qty: recommendedQty,
            unit_cost: unitCost,
            total_cost: totalCost,
            days_until_out: daysUntilOut,
            urgency,
          };
        })
        .filter((s) => s.avg_daily > 0 && s.recommended_qty > 0)
        .sort((a, b) => {
          const urgencyOrder = { critical: 0, warning: 1, normal: 2 };
          if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
            return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
          }
          return b.total_cost - a.total_cost;
        });

      if (allSuggestions.length === 0) {
        toast.info('No hay productos que requieran reposición. Todo el stock cubre 30+ días.');
        setIsSuggesting(false);
        return;
      }

      // Si hay presupuesto, ajustar cantidades para no excederlo
      let finalSuggestions = allSuggestions;
      let budgetNote = '';
      if (budgetNum > 0) {
        let accumulated = 0;
        const adjusted: Suggestion[] = [];
        for (const s of allSuggestions) {
          if (accumulated + s.total_cost <= budgetNum) {
            // Cabe completo
            adjusted.push(s);
            accumulated += s.total_cost;
          } else {
            // Cabe parcialmente — reducir cantidad proporcionalmente
            const remaining = budgetNum - accumulated;
            if (remaining > 0 && s.unit_cost > 0) {
              const partialQty = Math.floor(remaining / s.unit_cost);
              if (partialQty > 0) {
                adjusted.push({
                  ...s,
                  recommended_qty: partialQty,
                  total_cost: partialQty * s.unit_cost,
                });
                accumulated += partialQty * s.unit_cost;
              }
            }
            break; // presupuest agotado
          }
        }
        finalSuggestions = adjusted;
        budgetNote = ` (ajustado a presupuesto $${budgetNum.toLocaleString()})`;
        if (finalSuggestions.length === 0) {
          toast.warning(`El presupuesto ($${budgetNum.toLocaleString()}) es insuficiente para cualquier producto crítico.`);
          setIsSuggesting(false);
          return;
        }
      }

      // Convertir sugerencias a items del formulario
      const newItems: FormItem[] = finalSuggestions.map((s) => ({
        product_name: s.name,
        sku: s.sku || '',
        quantity_ordered: s.recommended_qty,
        unit_cost: s.unit_cost,
        unit_of_measure: 'unidad',
      }));

      setItems(newItems);
      toast.success(`${newItems.length} productos sugeridos${budgetNote}. Revisa y ajusta antes de crear la OC.`);
    } catch {
      toast.error('Error al generar sugerencias');
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleSupplierChange = (name: string) => {
    setSupplierName(name);
    const match = suppliers.find((s) => s.name === name);
    setSupplierId(match ? match.id : null);
  };

  const updateItem = (idx: number, patch: Partial<FormItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const addItem = () => setItems((prev) => [...prev, emptyItem()]);

  const handleSubmit = async () => {
    if (!supplierName.trim()) {
      toast.error('Indica el proveedor');
      return;
    }
    const cleanItems = items
      .filter((i) => i.product_name.trim() !== '')
      .map((i) => ({
        product_name: i.product_name.trim(),
        sku: i.sku.trim() || undefined,
        quantity_ordered: Number(i.quantity_ordered) || 0,
        unit_cost: Number(i.unit_cost) || 0,
        unit_of_measure: i.unit_of_measure,
      }));
    if (cleanItems.length === 0) {
      toast.error('Agrega al menos un item');
      return;
    }
    try {
      await createPO.mutateAsync({
        supplier_name: supplierName.trim(),
        supplier_id: supplierId,
        po_number: poNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        expected_date: expectedDate || undefined,
        items: cleanItems,
      });
      onClose();
    } catch {
      /* onError toast already in hook */
    }
  };

  return (
    <BaseModal
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="Nueva Orden de Compra"
      description="Crea una OC con items para enviar al proveedor."
      maxWidth="sm:max-w-3xl"
      footer={
        <div className="flex items-center justify-between w-full gap-3">
          <div className="text-xs text-muted-foreground">
            Total: <span className="font-black text-primary text-sm">{formatCurrency(total)}</span>
          </div>
          <div className="flex gap-2">
            <SecondaryButton label="Cancelar" onClick={onClose} />
            <PrimaryButton
              label={createPO.isPending ? 'Guardando...' : 'Crear OC (Borrador)'}
              onClick={handleSubmit}
              disabled={createPO.isPending}
              icon={createPO.isPending ? Loader2 : undefined}
            />
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Top fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="po-supplier" className="text-xs font-black uppercase tracking-widest ml-1">
              Proveedor
            </label>
            <input
              id="po-supplier"
              type="text"
              list="po-supplier-list"
              value={supplierName}
              onChange={(e) => handleSupplierChange(e.target.value)}
              placeholder="Selecciona o escribe un proveedor..."
              className="neu-input w-full font-bold"
              aria-label="Proveedor"
            />
            <datalist id="po-supplier-list">
              {suppliers.map((s) => (
                <option key={s.id} value={s.name} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="po-number" className="text-xs font-black uppercase tracking-widest ml-1">
              N° OC <span className="text-muted-foreground font-normal normal-case tracking-normal">(opcional)</span>
            </label>
            <input
              id="po-number"
              type="text"
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
              placeholder="OC-001"
              className="neu-input w-full font-bold"
              aria-label="Número de orden de compra"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="po-expected" className="text-xs font-black uppercase tracking-widest ml-1">
              Fecha esperada <span className="text-muted-foreground font-normal normal-case tracking-normal">(opcional)</span>
            </label>
            <input
              id="po-expected"
              type="date"
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
              className="neu-input w-full font-bold"
              aria-label="Fecha esperada de recepción"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="po-notes" className="text-xs font-black uppercase tracking-widest ml-1">
              Notas <span className="text-muted-foreground font-normal normal-case tracking-normal">(opcional)</span>
            </label>
            <input
              id="po-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaciones generales"
              className="neu-input w-full font-bold"
              aria-label="Notas"
            />
          </div>
        </div>

        {/* Sugerir OC Inteligente + Presupuesto */}
        <div className="rounded-2xl border-2 border-primary/20 bg-gradient-to-r from-primary/5 via-primary/3 to-transparent p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-primary-foreground" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-sm uppercase tracking-tight text-foreground">Sugerir OC Inteligente</h3>
                  <span className="text-[9px] font-black uppercase tracking-widest bg-gradient-to-r from-primary to-primary/70 text-primary-foreground px-1.5 py-0.5 rounded-full border border-primary/50 flex items-center gap-0.5">
                    <Crown className="w-2 h-2" />
                    Premium
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Analiza rotación + stock y sugiere qué comprar para 30 días</p>
              </div>
            </div>
            {/* Presupuesto opcional */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-background">
                <Wallet className="w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="Presupuesto (opcional)"
                  className="w-32 text-sm font-bold bg-transparent outline-none placeholder:text-muted-foreground/50"
                  aria-label="Presupuesto máximo de compra"
                />
              </div>
              <button
                type="button"
                onClick={handleSuggest}
                disabled={isSuggesting || !analytics}
                className="px-4 py-2.5 min-h-[44px] rounded-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-black text-xs uppercase tracking-widest hover:shadow-lg hover:shadow-primary/25 active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Generar sugerencia inteligente de OC"
                title={analytics ? 'Generar sugerencia basada en análisis de ventas' : 'Cargando datos de analítica...'}
              >
                {isSuggesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                Sugerir
              </button>
            </div>
          </div>
          {budgetNum > 0 && (
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary/70 flex items-center gap-1">
              <Wallet className="w-2.5 h-2.5" />
              Presupuesto: {formatCurrency(budgetNum)} — las cantidades se ajustarán para no excederlo
            </p>
          )}
        </div>

        {/* Items */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">
              Items ({items.length})
            </h3>
            <SecondaryButton label="Agregar Item" icon={Plus} onClick={addItem} />
          </div>

          {items.map((it, idx) => (
            <div
              key={idx}
              className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end p-3 rounded-xl border border-border bg-muted/10"
            >
              <div className="sm:col-span-4 space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nombre</label>
                <input
                  type="text"
                  value={it.product_name}
                  onChange={(e) => updateItem(idx, { product_name: e.target.value })}
                  placeholder="Nombre del producto"
                  className="neu-input w-full text-sm"
                  aria-label={`Nombre del item ${idx + 1}`}
                />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">SKU</label>
                <input
                  type="text"
                  value={it.sku}
                  onChange={(e) => updateItem(idx, { sku: e.target.value })}
                  placeholder="SKU"
                  className="neu-input w-full text-sm"
                  aria-label={`SKU del item ${idx + 1}`}
                />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Cantidad</label>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={it.quantity_ordered}
                  onChange={(e) => updateItem(idx, { quantity_ordered: parseFloat(e.target.value) || 0 })}
                  className="neu-input w-full text-sm"
                  aria-label={`Cantidad del item ${idx + 1}`}
                />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Costo</label>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={it.unit_cost}
                  onChange={(e) => updateItem(idx, { unit_cost: parseFloat(e.target.value) || 0 })}
                  className="neu-input w-full text-sm"
                  aria-label={`Costo unitario del item ${idx + 1}`}
                />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">UM</label>
                <div className="flex gap-1">
                  <select
                    value={it.unit_of_measure}
                    onChange={(e) => updateItem(idx, { unit_of_measure: e.target.value })}
                    className="neu-input w-full text-sm"
                    aria-label={`Unidad de medida del item ${idx + 1}`}
                  >
                    {UNIT_OF_MEASURE_OPTIONS.map((um) => (
                      <option key={um} value={um}>{um}</option>
                    ))}
                  </select>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="p-2 rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
                      aria-label={`Eliminar item ${idx + 1}`}
                      title="Eliminar item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </BaseModal>
  );
}

// ────────────────────────────────────────────────────────────
// Detail Modal
// ────────────────────────────────────────────────────────────

function DetailModal({ poId, onClose }: { poId: string; onClose: () => void }) {
  const { data, isLoading } = usePurchaseOrderDetails(poId);

  return (
    <BaseModal
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="Detalle de Orden de Compra"
      maxWidth="sm:max-w-3xl"
      footer={<SecondaryButton label="Cerrar" onClick={onClose} />}
    >
      {isLoading || !data?.order ? (
        <div className="py-12 flex items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span className="text-xs font-black uppercase tracking-widest">Cargando detalle...</span>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Header info */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-muted/20 border border-border">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">N° OC</p>
              <p className="font-mono font-bold text-sm">{data.order.po_number || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Proveedor</p>
              <p className="font-bold text-sm truncate">{data.order.supplier_name}</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Fecha</p>
              <p className="text-sm">{formatDate(data.order.created_at)}</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Estado</p>
              <StatusBadge status={data.order.status} />
            </div>
            {data.order.expected_date && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Fecha esperada</p>
                <p className="text-sm">{formatDate(data.order.expected_date)}</p>
              </div>
            )}
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total</p>
              <p className="font-black text-primary text-sm">{formatCurrency(data.order.total_amount)}</p>
            </div>
            {data.order.notes && (
              <div className="col-span-2 sm:col-span-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Notas</p>
                <p className="text-sm">{data.order.notes}</p>
              </div>
            )}
          </div>

          {/* Items table */}
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="max-h-[50vh] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0 z-10">
                  <tr className="text-[9px] font-black uppercase tracking-widest text-muted-foreground border-b border-border">
                    <th className="p-2 text-left">Producto</th>
                    <th className="p-2 text-left">SKU</th>
                    <th className="p-2 text-right">Ordenado</th>
                    <th className="p-2 text-right">Recibido</th>
                    <th className="p-2 text-right">Costo</th>
                    <th className="p-2 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-muted-foreground">
                        Sin items en esta OC
                      </td>
                    </tr>
                  ) : (
                    data.items.map((it: PurchaseOrderItem) => (
                      <tr key={it.id} className="border-b border-border/50 last:border-0">
                        <td className="p-2 font-bold">{it.product_name}</td>
                        <td className="p-2 font-mono text-muted-foreground">{it.sku || '—'}</td>
                        <td className="p-2 text-right tabular-nums">{it.quantity_ordered} {it.unit_of_measure}</td>
                        <td className="p-2 text-right tabular-nums">
                          <span className={cn(
                            'font-black',
                            Number(it.quantity_received) >= Number(it.quantity_ordered)
                              ? 'text-success'
                              : Number(it.quantity_received) > 0
                                ? 'text-warning'
                                : 'text-muted-foreground',
                          )}>
                            {it.quantity_received}
                          </span>
                        </td>
                        <td className="p-2 text-right tabular-nums">{formatCurrency(it.unit_cost)}</td>
                        <td className="p-2 text-right tabular-nums font-bold">
                          {formatCurrency(it.quantity_ordered * it.unit_cost)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </BaseModal>
  );
}
