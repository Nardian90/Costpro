'use client';

import React, { useMemo, useState } from 'react';
import {
  ClipboardList,
  Search,
  X,
  Loader2,
  ChevronLeft,
  Package,
  CheckCircle2,
} from 'lucide-react';
import { POSPortalModal } from '../pos/POSPortalModal';
import { PrimaryButton, SecondaryButton } from '@/components/ui/atomic';
import { useAuthStore } from '@/store';
import {
  usePurchaseOrders,
  usePurchaseOrderDetails,
  useReceiveAgainstPO,
} from '@/hooks/api/usePurchaseOrders';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { PurchaseOrder, PurchaseOrderItem } from '@/types';

// ────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────

export interface ReceiveAgainstPOItem {
  product_id: string | null;
  product_name: string;
  sku: string | null;
  quantity: number; // cantidad a recibir en esta sesión
  unit_cost: number;
  unit_of_measure: string;
}

export interface ReceiveAgainstPOPayload {
  purchaseOrder: PurchaseOrder;
  items: ReceiveAgainstPOItem[];
}

interface ReceiveAgainstPOModalProps {
  open: boolean;
  onClose: () => void;
  onReceive: (payload: ReceiveAgainstPOPayload) => void;
}

// ────────────────────────────────────────────────────────────
// Main modal
// ────────────────────────────────────────────────────────────

export function ReceiveAgainstPOModal({ open, onClose, onReceive }: ReceiveAgainstPOModalProps) {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId ?? null;

  // Lista de OCs pendientes (sent/partial). Pasamos statusFilter='sent' y luego
  // filtramos client-side para incluir también 'partial' (la API sólo soporta
  // un filtro exacto a la vez).
  const { data: sentOrders = [], isLoading: loadingSent } = usePurchaseOrders(storeId, 'sent');
  const { data: partialOrders = [], isLoading: loadingPartial } = usePurchaseOrders(storeId, 'partial');

  const [step, setStep] = useState<1 | 2>(1);
  const [search, setSearch] = useState('');
  const [selectedPOId, setSelectedPOId] = useState<string | null>(null);

  const pendingOrders = useMemo(() => {
    // Merge & dedupe by id (sent + partial). Ordenar por fecha desc.
    const map = new Map<string, PurchaseOrder>();
    for (const o of [...sentOrders, ...partialOrders]) {
      if (!map.has(o.id)) map.set(o.id, o);
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [sentOrders, partialOrders]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pendingOrders;
    return pendingOrders.filter(
      (o) =>
        (o.po_number || '').toLowerCase().includes(q) ||
        (o.supplier_name || '').toLowerCase().includes(q),
    );
  }, [pendingOrders, search]);

  const handleClose = () => {
    setStep(1);
    setSearch('');
    setSelectedPOId(null);
    onClose();
  };

  const handleSelectPO = (poId: string) => {
    setSelectedPOId(poId);
    setStep(2);
  };

  const handleBack = () => {
    setStep(1);
    setSelectedPOId(null);
  };

  return (
    <POSPortalModal
      open={open}
      onClose={handleClose}
      title="Recibir contra OC"
      maxWidth="lg"
    >
      <div className="space-y-4 min-h-[50vh] flex flex-col">
        {/* Step indicator */}
        <div className="flex items-center gap-2 text-xs">
          <div className={cn(
            'w-6 h-6 rounded-full flex items-center justify-center font-black text-[10px]',
            step === 1 ? 'bg-primary text-primary-foreground' : 'bg-success/20 text-success',
          )}>
            {step > 1 ? <CheckCircle2 className="w-3.5 h-3.5" /> : '1'}
          </div>
          <span className={cn('font-black uppercase tracking-widest', step === 1 ? 'text-foreground' : 'text-muted-foreground')}>
            Seleccionar OC
          </span>
          <div className="flex-1 h-px bg-border" />
          <div className={cn(
            'w-6 h-6 rounded-full flex items-center justify-center font-black text-[10px]',
            step === 2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
          )}>
            2
          </div>
          <span className={cn('font-black uppercase tracking-widest', step === 2 ? 'text-foreground' : 'text-muted-foreground')}>
            Cargar items
          </span>
        </div>

        {step === 1 && (
          <StepSelectPO
            isLoading={loadingSent || loadingPartial}
            orders={filteredOrders}
            search={search}
            onSearch={setSearch}
            onSelect={handleSelectPO}
          />
        )}

        {step === 2 && selectedPOId && (
          <StepReceiveItems
            poId={selectedPOId}
            onBack={handleBack}
            onReceive={(payload) => {
              onReceive(payload);
              handleClose();
            }}
          />
        )}
      </div>
    </POSPortalModal>
  );
}

// ────────────────────────────────────────────────────────────
// Step 1: Select PO
// ────────────────────────────────────────────────────────────

function StepSelectPO({
  isLoading,
  orders,
  search,
  onSearch,
  onSelect,
}: {
  isLoading: boolean;
  orders: PurchaseOrder[];
  search: string;
  onSearch: (s: string) => void;
  onSelect: (poId: string) => void;
}) {
  return (
    <div className="flex-1 flex flex-col gap-3 min-h-0">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Buscar por N° OC o proveedor..."
          aria-label="Buscar orden de compra"
          className="w-full bg-muted/20 border border-border rounded-xl pl-10 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearch('')}
            aria-label="Limpiar búsqueda"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin text-primary mr-2" />
          <span className="text-xs font-black uppercase tracking-widest">Cargando...</span>
        </div>
      ) : orders.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground py-8">
          <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-3">
            <ClipboardList className="w-8 h-8 opacity-30" />
          </div>
          <p className="font-black text-sm uppercase tracking-widest">Sin OCs pendientes</p>
          <p className="text-xs mt-1 max-w-xs">
            {search
              ? 'No hay resultados con ese filtro.'
              : 'No tienes órdenes de compra pendientes de recibir. Crea una OC primero desde la vista de Órdenes de Compra.'}
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto rounded-xl border border-border divide-y divide-border max-h-[55vh]">
          {orders.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => onSelect(o.id)}
              className="w-full text-left p-3 hover:bg-primary/5 transition-colors flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Package className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-sm">{o.po_number || 'Sin N°'}</span>
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-warning/10 text-warning border border-warning/20 uppercase tracking-widest">
                    {o.status === 'partial' ? 'Parcial' : 'Pendiente'}
                  </span>
                </div>
                <p className="text-xs font-bold truncate">{o.supplier_name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {formatDate(o.created_at)} · Total: {formatCurrency(o.total_amount)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Step 2: Receive items
// ────────────────────────────────────────────────────────────

function StepReceiveItems({
  poId,
  onBack,
  onReceive,
}: {
  poId: string;
  onBack: () => void;
  onReceive: (payload: ReceiveAgainstPOPayload) => void;
}) {
  const { data, isLoading } = usePurchaseOrderDetails(poId);
  const receive = useReceiveAgainstPO();

  const [quantities, setQuantities] = useState<Record<string, number>>({});

  // Cuando llegan los items, inicializar quantities con quantity_ordered (cantidad faltante).
  React.useEffect(() => {
    if (data?.items) {
      const init: Record<string, number> = {};
      for (const it of data.items) {
        const pending = Math.max(0, Number(it.quantity_ordered) - Number(it.quantity_received));
        init[it.id] = pending;
      }
      setQuantities(init);
    }
  }, [data]);

  if (isLoading || !data?.order) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin text-primary mr-2" />
        <span className="text-xs font-black uppercase tracking-widest">Cargando items...</span>
      </div>
    );
  }

  // Capture non-null order/items so the narrowing is preserved in closures.
  const order: PurchaseOrder = data.order;
  const items: PurchaseOrderItem[] = data.items;

  const setQty = (itemId: string, value: number) => {
    setQuantities((prev) => ({ ...prev, [itemId]: value }));
  };

  const handleLoadItems = async () => {
    const receivedItems = items
      .filter((it) => (quantities[it.id] ?? 0) > 0)
      .map((it) => ({
        poItemId: it.id,
        quantityReceived: Number(it.quantity_received) + Number(quantities[it.id] ?? 0),
      }));

    if (receivedItems.length === 0) {
      toast.error('Indica al menos una cantidad a recibir mayor a 0');
      return;
    }

    try {
      await receive.mutateAsync({ poId, receivedItems });
    } catch {
      return; // el toast lo maneja quien llama si quiere; aquí no hay onError
    }

    // Mapear items a ReceiveAgainstPOItem con la cantidad recibida en esta sesión.
    const itemsToReceive: ReceiveAgainstPOItem[] = items
      .filter((it) => (quantities[it.id] ?? 0) > 0)
      .map((it) => ({
        product_id: it.product_id ?? null,
        product_name: it.product_name,
        sku: it.sku ?? null,
        quantity: Number(quantities[it.id] ?? 0),
        unit_cost: it.unit_cost,
        unit_of_measure: it.unit_of_measure,
      }));

    onReceive({ purchaseOrder: order, items: itemsToReceive });
  };

  return (
    <div className="flex-1 flex flex-col gap-3 min-h-0">
      {/* PO header */}
      <div className="rounded-xl border border-border bg-muted/20 p-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono font-bold text-sm truncate">
            {order.po_number || 'Sin N°'} · {order.supplier_name}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {formatDate(order.created_at)} · Total: {formatCurrency(order.total_amount)}
          </p>
        </div>
        <span className="text-[10px] font-black px-2 py-1 rounded bg-warning/10 text-warning border border-warning/20 uppercase tracking-widest shrink-0">
          {order.status === 'partial' ? 'Parcial' : 'Pendiente'}
        </span>
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto rounded-xl border border-border max-h-[45vh]">
        {items.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Esta OC no tiene items.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((it: PurchaseOrderItem) => {
              const pending = Math.max(0, Number(it.quantity_ordered) - Number(it.quantity_received));
              const qty = quantities[it.id] ?? 0;
              return (
                <div key={it.id} className="p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-sm truncate">{it.product_name}</p>
                    <p className="text-xs font-mono text-muted-foreground shrink-0">
                      {formatCurrency(it.unit_cost)} / {it.unit_of_measure}
                    </p>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    SKU: {it.sku || '—'} · Ordenado: {it.quantity_ordered} · Recibido: {it.quantity_received} · Pendiente: {pending}
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Recibir:
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max={pending}
                      step="0.01"
                      value={qty}
                      onChange={(e) => {
                        const v = Math.max(0, Math.min(pending, parseFloat(e.target.value) || 0));
                        setQty(it.id, v);
                      }}
                      className="w-24 px-2 py-1 text-sm font-bold rounded-lg border border-border bg-background"
                      aria-label={`Cantidad a recibir de ${it.product_name}`}
                    />
                    <button
                      type="button"
                      onClick={() => setQty(it.id, pending)}
                      className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20"
                    >
                      Todo
                    </button>
                    <button
                      type="button"
                      onClick={() => setQty(it.id, 0)}
                      className="text-[10px] font-bold uppercase px-2 py-1 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80"
                    >
                      0
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <SecondaryButton label="Volver" icon={ChevronLeft} onClick={onBack} />
        <PrimaryButton
          label={receive.isPending ? 'Cargando...' : 'Cargar Items'}
          onClick={handleLoadItems}
          disabled={receive.isPending}
          icon={receive.isPending ? Loader2 : undefined}
        />
      </div>
    </div>
  );
}
