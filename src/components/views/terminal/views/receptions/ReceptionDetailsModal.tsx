'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { BaseModal } from "@/components/ui/BaseModal";
import { Package, Hash, User, Calendar, FileText, Building2, Download, CheckCircle2, AlertTriangle, Trash2, Truck, Link2, Plus, RefreshCw, Eye, X, DollarSign, Wallet } from 'lucide-react';
import { type Receipt, type ReceiptItem } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { resolveProductImage, getProductImageUrl, formatCurrency, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from 'sonner';

interface ReceptionDetailsModalProps {
  receipt: Receipt | null;
  isOpen: boolean;
  onClose: () => void;
  items: ReceiptItem[];
  isLoading: boolean;
  onExport?: () => void;
  // Nuevas props para edición y anulación:
  isEditMode?: boolean;
  onUpdateSubmit?: (updates: { supplier?: string; referenceDoc?: string; itemUpdates?: Array<{ id: string; quantity: number; unit_cost: number; deleted: boolean }> }) => void;
  onVoidRequest?: () => void;
  isUpdating?: boolean;
  isVoiding?: boolean;
  // Reception-Flow-Fix: confirmar recepción pendiente desde el modal.
  isConfirmPendingMode?: boolean;
  onConfirmPending?: () => void;
  onConfirmPendingCancel?: () => void;
  isConfirmingPending?: boolean;
}

export function ReceptionDetailsModal({
  receipt,
  isOpen,
  onClose,
  items,
  isLoading,
  onExport,
  isEditMode = false,
  onUpdateSubmit,
  onVoidRequest,
  isUpdating = false,
  isVoiding = false,
  // Reception-Flow-Fix
  isConfirmPendingMode = false,
  onConfirmPending,
  onConfirmPendingCancel,
  isConfirmingPending = false,
}: ReceptionDetailsModalProps) {
  // F3: Tab state for "Costos Asociados" — debe ir ANTES de cualquier early return
  // para cumplir con las reglas de hooks de React.
  const [activeTab, setActiveTab] = useState<'items' | 'costs' | 'tasa' | 'payments'>('items');
  const [tasaUpdateLoading, setTasaUpdateLoading] = useState<string | null>(null);

  // FIX-BATCH: Estado para asignación global de tasa a toda la recepción
  const [batchMoneda, setBatchMoneda] = useState('CUP');
  const [batchTasa, setBatchTasa] = useState(1);
  const [batchLoading, setBatchLoading] = useState(false);

  // FIX-BACKFILL: Función para actualizar moneda/tasa de un item individual
  // Funciona incluso en recepciones confirmadas (active) — solo requiere admin/manager
  const updateItemTasa = async (itemId: string, moneda: string, tasa: number) => {
    if (!receipt) return;
    setTasaUpdateLoading(itemId);
    try {
      await apiFetch(`/api/inventory/receptions/${receipt.id}/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          moneda_recepcion: moneda,
          tasa_cambio_recepcion: tasa,
          motivo: 'Actualización desde detalle de recepción',
        }),
      });
    } catch (e: any) {
      console.error('[ReceptionDetail] Error updating tasa:', e);
    } finally {
      setTasaUpdateLoading(null);
    }
  };

  // FIX-BATCH: Aplicar moneda+tasa a TODOS los items de la recepción
  const handleBatchApply = async () => {
    if (!receipt || !items || items.length === 0) return;
    setBatchLoading(true);
    let updated = 0;
    for (const item of items) {
      try {
        await updateItemTasa(item.id, batchMoneda, batchTasa);
        updated++;
      } catch {}
    }
    setBatchLoading(false);
    toast.success(`${updated} de ${items.length} productos actualizados a ${batchMoneda} ${batchTasa}`);
    // Switch to items tab to see the result
    setActiveTab('items');
  };

  // FIX-BATCH: Auto-fill tasa cuando se cambia la moneda en el batch
  const handleBatchMonedaChange = async (moneda: string) => {
    setBatchMoneda(moneda);
    if (moneda === 'CUP') {
      setBatchTasa(1);
    } else {
      try {
        const res = await fetch(`/api/exchange-rates?currency=${moneda}&source=BCC&segment=3&days=1`);
        if (res.ok) {
          const data = await res.json();
          // FIX-F03: la API devuelve { rates: [...] } no un array directo.
          if (data?.rates && data.rates.length > 0) setBatchTasa(data.rates[0].rate);
        }
      } catch {}
    }
  };

  if (!receipt && !isLoading) return null;

  const subtotal = receipt?.total_cost || 0;
  const taxes = subtotal * 0;
  const total = subtotal + taxes;

  return (
    <BaseModal
      open={isOpen}
      onOpenChange={onClose}
      aria-label={isEditMode ? 'Editar recepción' : 'Detalle de recepción'}
      title={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Package className="w-6 h-6 text-primary" />
          </div>
          {isEditMode ? 'Editar Recepción' : 'Detalle de Recepción'}
        </div>
      }
      description={isEditMode ? "Modifica los datos de cabecera de la recepción." : "Muestra el listado de productos y cantidades recibidas en esta operación."}
      maxWidth="sm:max-w-2xl"
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center w-full">
          <div className="flex items-center gap-4">
            {isConfirmPendingMode && (
              <button
                onClick={onConfirmPending}
                disabled={isConfirmingPending}
                className="flex items-center gap-2 px-4 py-3 bg-success text-white dark:text-black border border-success rounded-xl text-xs font-black uppercase tracking-widest hover:bg-success/90 transition-all active:scale-95 disabled:opacity-50"
                type="button"
                aria-label="Confirmar recepción pendiente"
              >
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                {isConfirmingPending ? 'Confirmando...' : 'Confirmar Recepción'}
              </button>
            )}
            {!isEditMode && !isConfirmPendingMode && receipt?.status === 'pending' && onVoidRequest && (
              <button
                onClick={onVoidRequest}
                disabled={isVoiding}
                className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-destructive hover:underline disabled:opacity-50"
                type="button"
                aria-label="Anular recepción"
              >
                {isVoiding ? 'Anulando...' : 'Anular recepción'}
              </button>
            )}
            {/* Reception-Flow-Restriction: para confirmadas (active) NO se muestra Anular.
                El usuario debe usar "Invertir" desde el historial, que crea un documento
                de disminución manteniendo trazabilidad. Mostramos una nota explicativa. */}
            {!isEditMode && !isConfirmPendingMode && receipt?.status === 'active' && (
              <p className="text-[10px] font-medium text-muted-foreground italic max-w-[200px] leading-tight">
                Recepción confirmada. Para revertir, use <strong>Invertir</strong> desde el historial (mantiene trazabilidad).
              </p>
            )}
            {!isEditMode && !isConfirmPendingMode && (
              <button
                onClick={onExport}
                className="flex items-center gap-2 px-4 py-3 bg-background border border-border rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary hover:text-foreground transition-all active:scale-95"
                type="button"
                aria-label="Exportar recepción como archivo CSV"
              >
                <Download className="w-4 h-4" aria-hidden="true" />
                Exportar Excel
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={isConfirmPendingMode ? (onConfirmPendingCancel || onClose) : onClose}
              className="px-8 py-3 bg-background border border-border rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-muted transition-all active:scale-95"
              type="button"
              aria-label={isEditMode ? 'Cancelar edición de recepción' : isConfirmPendingMode ? 'Cancelar confirmación' : 'Cerrar detalle de recepción'}
            >
              {isEditMode ? 'Cancelar' : isConfirmPendingMode ? 'Cancelar' : 'Cerrar'}
            </button>
            {isEditMode && (
              <button type="button"
                onClick={() => {
                  const supplier = (document.getElementById('edit-supplier') as HTMLInputElement)?.value;
                  const referenceDoc = (document.getElementById('edit-reference-doc') as HTMLInputElement)?.value;
                  // R2: recolectar cambios de items si la recepción está pendiente
                  const itemUpdates: Array<{ id: string; quantity: number; unit_cost: number; deleted: boolean }> = [];
                  if (receipt?.status === 'pending') {
                    document.querySelectorAll('input[data-item-id]').forEach(input => {
                      const el = input as HTMLInputElement;
                      const itemId = el.dataset.itemId;
                      const field = el.dataset.field;
                      if (itemId && field) {
                        let existing = itemUpdates.find(i => i.id === itemId);
                        if (!existing) {
                          existing = { id: itemId, quantity: 0, unit_cost: 0, deleted: false };
                          itemUpdates.push(existing);
                        }
                        if (field === 'quantity') {
                          existing.quantity = parseFloat(el.value) || 0;
                          existing.deleted = el.dataset.deleted === 'true' || existing.quantity === 0;
                        }
                        if (field === 'unit_cost') {
                          existing.unit_cost = parseFloat(el.value) || 0;
                        }
                      }
                    });
                  }
                  onUpdateSubmit?.({ supplier, referenceDoc, itemUpdates });
                }}
                disabled={isUpdating}
                className="px-8 py-3 bg-primary text-white border border-primary rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50"
                aria-label="Guardar cambios de la recepción"
              >
                {isUpdating ? 'Guardando...' : 'Guardar cambios'}
              </button>
            )}
          </div>
        </div>
      }
    >
        <div className="space-y-6">
          {/* F3: Tab system — Productos | Costos Asociados */}
          {!isEditMode && (
            <div className="flex border-b border-border">
              <button
                type="button"
                onClick={() => setActiveTab('items')}
                className={cn("flex-1 py-3 text-xs font-black uppercase tracking-widest border-b-2 -mb-px transition-colors min-h-[44px]",
                  activeTab === 'items' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}
                aria-selected={activeTab === 'items'}
                role="tab"
              >
                Productos
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('costs')}
                className={cn("flex-1 py-3 text-xs font-black uppercase tracking-widest border-b-2 -mb-px transition-colors min-h-[44px] flex items-center justify-center gap-2",
                  activeTab === 'costs' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}
                aria-selected={activeTab === 'costs'}
                role="tab"
              >
                <Truck className="w-4 h-4" />
                Costos Asociados
              </button>
              {/* FIX-BATCH: Tab de Tasa de Cambio global */}
              <button
                type="button"
                onClick={() => setActiveTab('tasa')}
                className={cn("flex-1 py-3 text-xs font-black uppercase tracking-widest border-b-2 -mb-px transition-colors min-h-[44px] flex items-center justify-center gap-2",
                  activeTab === 'tasa' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}
                aria-selected={activeTab === 'tasa'}
                role="tab"
              >
                <DollarSign className="w-4 h-4" />
                Tasa de Cambio
              </button>
              {/* Tab Pagos proveedor */}
              <button
                type="button"
                onClick={() => setActiveTab('payments')}
                className={cn(
                  "flex-1 py-3 text-xs font-black uppercase tracking-widest border-b-2 -mb-px transition-colors min-h-[44px] flex items-center justify-center gap-2",
                  activeTab === 'payments'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
                aria-selected={activeTab === 'payments'}
                role="tab"
              >
                <Wallet className="w-4 h-4" />
                Pagos
              </button>
            </div>
          )}

          {/* TAB: Tasa de Cambio (batch global) */}
          {activeTab === 'tasa' && receipt && (
            <div className="p-6 space-y-5">
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-1">
                <p className="text-sm font-black uppercase tracking-widest text-primary">Asignación global de tasa</p>
                <p className="text-xs text-muted-foreground">
                  Aplica la misma moneda y tasa de cambio a TODOS los productos de esta recepción.
                  Esto sobrescribe cualquier valor anterior. Genera auditoría por cada item.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Moneda de compra</label>
                  <select
                    value={batchMoneda}
                    onChange={e => handleBatchMonedaChange(e.target.value)}
                    className="w-full h-12 px-3 rounded-xl border border-border bg-background text-sm font-bold"
                  >
                    <option value="CUP">CUP (Peso Cubano)</option>
                    <option value="USD">USD (Dólar)</option>
                    <option value="EUR">EUR (Euro)</option>
                    <option value="MLC">MLC</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                    Tasa de cambio (CUP por unidad)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={batchTasa}
                    onChange={e => setBatchTasa(parseFloat(e.target.value) || 1)}
                    disabled={batchMoneda === 'CUP'}
                    className="w-full h-12 px-3 rounded-xl border border-border bg-background text-sm font-bold tabular-nums disabled:opacity-50"
                    placeholder="500"
                  />
                  {batchMoneda !== 'CUP' && (
                    <p className="text-[10px] text-muted-foreground">
                      Tasa auto-obtenida del BCC seg 3. Puedes ajustar manualmente.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-muted/30 border border-border">
                <div>
                  <p className="text-xs text-muted-foreground">Se actualizarán</p>
                  <p className="text-lg font-black">{items?.length || 0} productos</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Costo total en CUP</p>
                  <p className="text-lg font-black tabular-nums">
                    {formatCurrency((items || []).reduce((sum, i) => sum + (i.unit_cost * i.quantity * (batchMoneda === 'CUP' ? 1 : batchTasa)), 0))}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleBatchApply}
                disabled={batchLoading || !items || items.length === 0}
                className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-black text-xs uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {batchLoading ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /> Aplicando...</>
                ) : (
                  <><CheckCircle2 className="w-4 h-4" /> Aplicar a {items?.length || 0} productos</>
                )}
              </button>
            </div>
          )}

          {/* TAB: Costos Asociados */}
          {activeTab === 'costs' && !isEditMode && receipt && (
            <CostsAssociatedTab receiptId={receipt.id} />
          )}

          {/* FIX-PAYMENT-TRACKING (2026-07-12): TAB: Pagos a proveedor */}
          {activeTab === 'payments' && !isEditMode && receipt && (
            <PaymentsTab receiptId={receipt.id} totalCost={receipt.total_cost} />
          )}

          {/* TAB: Productos (contenido original) */}
          {(activeTab === 'items' || isEditMode) && (
            <>
          {/* Reception-Flow-Fix: banner de advertencia cuando se va a confirmar
              una recepción pendiente. Aclara que la acción aplicará cambios al
              inventario y volverá la recepción no editable. */}
          {isConfirmPendingMode && (
            <div className="p-4 rounded-xl bg-success/15 border border-success/30 flex gap-3 items-start" role="alert">
              <AlertTriangle className="w-5 h-5 text-success shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-1">
                <p className="text-xs font-black uppercase text-foreground tracking-widest">Confirmar Recepción</p>
                <p className="text-xs font-medium text-muted-foreground leading-relaxed">
                  Al confirmar, se aplicarán los cambios de stock al inventario y la recepción
                  pasará a estado <strong>Confirmada</strong> (no editable). Esta acción
                  <strong> no se puede deshacer</strong> — solo se puede anular o invertir después.
                </p>
              </div>
            </div>
          )}
          {isEditMode ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="edit-supplier" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">
                  Proveedor
                </label>
                <input
                  type="text"
                  defaultValue={receipt?.supplier || ''}
                  id="edit-supplier"
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                  placeholder="Nombre del proveedor..."
                  aria-label="Nombre del proveedor"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="edit-reference-doc" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">
                  N° Documento referencia / Factura
                </label>
                <input
                  type="text"
                  defaultValue={receipt?.reference_doc || ''}
                  id="edit-reference-doc"
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                  placeholder="Número de factura o documento..."
                  aria-label="Número de documento de referencia o factura"
                />
              </div>
              <p className="text-[10px] text-muted-foreground italic px-1">
                {receipt?.status === 'pending'
                  ? 'Los ítems son editables porque la recepción está pendiente (no ha afectado inventario).'
                  : 'Nota: Los ítems no pueden editarse porque el inventario ya fue afectado al momento de la recepción original.'}
              </p>
            </div>
          ) : (
            /* Metadata Grid */
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="neu-card !p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-black text-muted-foreground uppercase tracking-widest">
                  <Hash className="w-3 h-3" aria-hidden="true" /> ID Ref
                </div>
                <div className="font-bold text-xs truncate text-primary">{receipt?.id?.split('-')[0]}</div>
              </div>

              <div className="neu-card !p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-black text-muted-foreground uppercase tracking-widest">
                  <Calendar className="w-3 h-3" aria-hidden="true" /> Fecha
                </div>
                <div className="font-bold text-xs uppercase">
                  {formatDate(receipt?.reception_date)}
                </div>
              </div>

              <div className="neu-card !p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-black text-muted-foreground uppercase tracking-widest">
                  <Building2 className="w-3 h-3" aria-hidden="true" /> Proveedor
                </div>
                <div className="font-bold text-xs truncate">{receipt?.supplier || 'N/A'}</div>
              </div>

               <div className="neu-card !p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-black text-muted-foreground uppercase tracking-widest">
                  <FileText className="w-3 h-3" aria-hidden="true" /> Factura #
                </div>
                <div className="font-bold text-xs truncate">{receipt?.reference_doc || 'N/A'}</div>
              </div>

              <div className="neu-card !p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-black text-muted-foreground uppercase tracking-widest">
                  <User className="w-3 h-3" aria-hidden="true" /> Recibido por
                </div>
                <div className="font-bold text-xs truncate text-muted-foreground italic">
                  ID: {receipt?.user_id?.split('-')[0]}
                </div>
              </div>

              <div className={cn(
                "neu-card !p-3 space-y-1 bg-primary/5 border-primary/20",
                receipt?.status === 'voided' && "border-destructive/20 bg-destructive/5"
              )}>
                <div className={cn(
                  "text-xs font-black uppercase tracking-widest",
                  receipt?.status === 'voided' ? "text-destructive" : "text-primary"
                )}>
                  {receipt?.status === 'voided' ? 'Anulada' : 'Total Costo'}
                </div>
                <div className={cn(
                  "font-black text-lg tabular-nums",
                  receipt?.status === 'voided' ? "text-destructive" : "text-primary"
                )}>
                  {formatCurrency(receipt?.total_cost || 0)}
                </div>
              </div>
            </div>
          )}

          {/* Items Table */}
          <div className="space-y-3">
             <h4 className="text-xs font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Productos Recibidos</h4>
             <div className="rounded-2xl border border-white/5 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground font-black uppercase text-xs tracking-widest text-left">
                      <th className="p-3">Img</th>
                      <th className="p-3">Producto</th>
                      <th className="p-3 text-center">Cant.</th>
                      <th className="p-3 text-right">Costo U.</th>
                      <th className="p-3 text-center">Moneda</th>
                      <th className="p-3 text-center">Tasa</th>
                      <th className="p-3 text-right">Subtotal</th>
                      {isEditMode && receipt?.status === 'pending' && <th className="p-3 text-center">Acción</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      [...Array(3)].map((_, i) => (
                        <tr key={i} className="border-t border-white/5">
                          <td className="p-3"><Skeleton className="h-8 w-8 rounded-lg" /></td>
                          <td className="p-3"><Skeleton className="h-4 w-32" /></td>
                          <td className="p-3"><Skeleton className="h-4 w-8 mx-auto" /></td>
                          <td className="p-3"><Skeleton className="h-4 w-16 ml-auto" /></td>
                          <td className="p-3"><Skeleton className="h-4 w-16 ml-auto" /></td>
                        </tr>
                      ))
                    ) : (
                      items.map((item) => {
                        const imageUrl = item.products ? getProductImageUrl(resolveProductImage(item.products as any)) : null;
                        const isItemEditable = isEditMode && receipt?.status === 'pending';
                        return (
                          <tr key={item.id} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                            <td className="p-3">
                              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden border border-white/5">
                                {imageUrl ? (
                                  <Image src={imageUrl} alt={item.products?.name || 'Imagen de producto'} width={40} height={40} className="w-full h-full object-cover" unoptimized />
                                ) : (
                                  <Package className="w-5 h-5 text-muted-foreground/50" aria-hidden="true" />
                                )}
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="font-bold">{item.products?.name}</div>
                              <div className="text-xs font-mono text-muted-foreground">{item.products?.sku}</div>
                            </td>
                            <td className="p-3 text-center font-black tabular-nums">
                              {isItemEditable ? (
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  defaultValue={item.quantity}
                                  data-item-id={item.id}
                                  data-field="quantity"
                                  className="w-16 px-2 py-1 text-center rounded-lg border border-border bg-background text-xs font-black tabular-nums focus:ring-2 focus:ring-primary/20 outline-none"
                                  aria-label={`Cantidad de ${item.products?.name}`}
                                />
                              ) : (
                                item.quantity
                              )}
                            </td>
                            <td className="p-3 text-right font-bold text-muted-foreground tabular-nums">
                              {isItemEditable ? (
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  defaultValue={item.unit_cost}
                                  data-item-id={item.id}
                                  data-field="unit_cost"
                                  className="w-20 px-2 py-1 text-right rounded-lg border border-border bg-background text-xs font-bold tabular-nums focus:ring-2 focus:ring-primary/20 outline-none"
                                  aria-label={`Costo unitario de ${item.products?.name}`}
                                />
                              ) : (
                                formatCurrency(item.unit_cost)
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <select
                                defaultValue={item.moneda_recepcion || 'CUP'}
                                data-item-id={item.id}
                                data-field="moneda_recepcion"
                                onChange={async (e) => {
                                  const moneda = e.target.value;
                                  const tasaInput = document.querySelector(`input[data-item-id="${item.id}"][data-field="tasa_cambio_recepcion"]`) as HTMLInputElement;
                                  if (moneda === 'CUP') {
                                    if (tasaInput) { tasaInput.value = '1'; tasaInput.disabled = true; }
                                    await updateItemTasa(item.id, 'CUP', 1);
                                  } else {
                                    if (tasaInput) tasaInput.disabled = false;
                                    // Auto-fill from exchange_rates
                                    try {
                                      const res = await fetch(`/api/exchange-rates?currency=${moneda}&source=BCC&segment=3&days=1`);
                                      if (res.ok) {
                                        const data = await res.json();
                                        // FIX-F03: la API devuelve { rates: [...] } no un array directo.
                                        if (data?.rates && data.rates.length > 0) {
                                          if (tasaInput) tasaInput.value = String(data.rates[0].rate);
                                          await updateItemTasa(item.id, moneda, data.rates[0].rate);
                                        }
                                      }
                                    } catch {}
                                  }
                                }}
                                className="w-16 px-1 py-1 text-center rounded-lg border border-border bg-background text-xs font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                                aria-label={`Moneda de ${item.products?.name}`}
                              >
                                <option value="CUP">CUP</option>
                                <option value="USD">USD</option>
                                <option value="EUR">EUR</option>
                                <option value="MLC">MLC</option>
                              </select>
                            </td>
                            <td className="p-3 text-center">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                defaultValue={item.tasa_cambio_recepcion || 1}
                                data-item-id={item.id}
                                data-field="tasa_cambio_recepcion"
                                disabled={(item.moneda_recepcion || 'CUP') === 'CUP'}
                                onBlur={async (e) => {
                                  const val = parseFloat(e.target.value) || 1;
                                  const monedaSelect = document.querySelector(`select[data-item-id="${item.id}"][data-field="moneda_recepcion"]`) as HTMLSelectElement;
                                  const moneda = monedaSelect?.value || 'CUP';
                                  await updateItemTasa(item.id, moneda, val);
                                }}
                                className="w-20 px-2 py-1 text-center rounded-lg border border-border bg-background text-xs font-bold tabular-nums focus:ring-2 focus:ring-primary/20 outline-none disabled:opacity-50"
                                aria-label={`Tasa de cambio de ${item.products?.name}`}
                              />
                            </td>
                            <td className="p-3 text-right font-black text-primary tabular-nums">
                              {formatCurrency(item.quantity * item.unit_cost)}
                            </td>
                            {isItemEditable && (
                              <td className="p-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (confirm(`¿Eliminar ${item.products?.name} de la recepción?`)) {
                                      const row = document.querySelector(`tr[key="${item.id}"]`);
                                      // Mark for deletion
                                      const input = document.querySelector(`input[data-item-id="${item.id}"][data-field="quantity"]`) as HTMLInputElement;
                                      if (input) { input.value = '0'; input.dataset.deleted = 'true'; }
                                      const row2 = (event?.target as HTMLElement)?.closest('tr');
                                      if (row2) { row2.style.opacity = '0.3'; row2.style.textDecoration = 'line-through'; }
                                    }
                                  }}
                                  className="text-destructive hover:bg-destructive/10 p-1.5 rounded-lg transition-colors"
                                  aria-label={`Eliminar ${item.products?.name}`}
                                  title="Eliminar item"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
             </div>
          </div>
            </>
          )}

        {/* Financial Summary */}
        <div className="mt-6 pt-4 border-t border-white/5">
           <div className="flex flex-col items-end gap-1">
              <div className="flex justify-between w-full max-w-[200px] text-xs font-bold text-muted-foreground uppercase tabular-nums">
                <span>Subtotal:</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between w-full max-w-[200px] text-xs font-bold text-muted-foreground uppercase tabular-nums">
                <span>Impuestos (0%):</span>
                <span>{formatCurrency(taxes)}</span>
              </div>
              <div className="flex justify-between w-full max-w-[200px] text-sm font-black text-primary uppercase border-t border-primary/20 pt-1 mt-1 tabular-nums">
                <span>Total:</span>
                <span>{formatCurrency(total)}</span>
              </div>
           </div>
        </div>
        </div>
    </BaseModal>
  );
}

// ════════════════════════════════════════════════════════════════════
// F3: CostsAssociatedTab — Tab de Costos Asociados en Recepciones
// ════════════════════════════════════════════════════════════════════
function CostsAssociatedTab({ receiptId }: { receiptId: string }) {
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const fetchServices = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('service_reception_links')
        .select(`
          *,
          received_services!inner(*)
        `)
        .eq('receipt_id', receiptId);
      if (error) throw error;
      setServices(data || []);
    } catch (e: any) {
      // Tabla puede no existir todavía en algunos entornos
      console.warn('[CostsAssociatedTab] Error:', e.message);
    } finally {
      setLoading(false);
    }
  }, [receiptId]);

  useEffect(() => { fetchServices(); }, [fetchServices]);

  const handleQuickCreate = async (type: string, amount: string) => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('El importe debe ser mayor a 0');
      return;
    }
    try {
      const res = await fetch('/api/received-services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_type_name: type,
          total_amount: parseFloat(amount),
          receipt_ids: [receiptId],
          distribution_method: 'amount',
        }),
      });
      if (!res.ok) throw new Error('Error al crear servicio');
      toast.success(`${type} creado y vinculado`);
      setShowCreate(false);
      fetchServices();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleRecalculate = async (serviceId: string) => {
    try {
      const res = await fetch('/api/received-services/distribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_id: serviceId }),
      });
      if (!res.ok) throw new Error('Error al recalcular');
      toast.success('Distribución recalculada');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const totalServices = services.reduce((sum, s) => sum + (s.allocated_amount || 0), 0);

  // GAP-1: Vincular servicio existente
  const [showLinkExisting, setShowLinkExisting] = useState(false);
  const [availableServices, setAvailableServices] = useState<any[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [linking, setLinking] = useState(false);

  // GAP-2: Ver distribución detallada
  const [distributionData, setDistributionData] = useState<any[]>([]);
  const [showDistribution, setShowDistribution] = useState<string | null>(null);

  const fetchAvailableServices = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('received_services')
        .select('id, service_number, service_type_name, total_amount, supplier, service_date')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      // Filter out already linked
      const linkedIds = services.map(s => s.service_id);
      setAvailableServices((data || []).filter((s: any) => !linkedIds.includes(s.id)));
    } catch (e: any) {
      console.warn('[LinkExisting] Error:', e.message);
    }
  }, [services]);

  const handleLinkExisting = async () => {
    if (!selectedServiceId) return;
    setLinking(true);
    try {
      const svc = availableServices.find(s => s.id === selectedServiceId);
      if (!svc) return;
      const { error } = await supabase.from('service_reception_links').insert({
        service_id: selectedServiceId,
        receipt_id: receiptId,
        allocation_percentage: 100,
        allocated_amount: svc.total_amount,
      });
      if (error) throw error;
      toast.success('Servicio vinculado correctamente');
      setShowLinkExisting(false);
      setSelectedServiceId('');
      fetchServices();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLinking(false);
    }
  };

  const handleViewDistribution = async (serviceId: string) => {
    if (showDistribution === serviceId) {
      setShowDistribution(null);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('service_cost_distributions')
        .select(`
          distribution_amount,
          distribution_percentage,
          receipt_items!inner(quantity, unit_cost, product_id, products!inner(name))
        `)
        .eq('service_id', serviceId)
        .eq('receipt_id', receiptId);
      if (error) throw error;
      setDistributionData(data || []);
      setShowDistribution(serviceId);
    } catch (e: any) {
      toast.error('Error al cargar distribución: ' + e.message);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">
          Servicios Vinculados ({services.length})
        </h3>
        <div className="flex gap-2">
          {/* GAP-1: Vincular existente */}
          <button
            onClick={() => { setShowLinkExisting(!showLinkExisting); if (!showLinkExisting) fetchAvailableServices(); }}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted text-muted-foreground font-black text-xs uppercase tracking-widest hover:bg-muted/70 transition-colors min-h-[44px]"
          >
            <Link2 className="w-4 h-4" />
            Vincular Existente
          </button>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10 text-primary font-black text-xs uppercase tracking-widest hover:bg-primary/20 transition-colors min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            Nuevo
          </button>
        </div>
      </div>

      {/* GAP-1: Link existing service */}
      {showLinkExisting && (
        <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-3">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Vincular servicio existente</p>
          {availableServices.length === 0 ? (
            <p className="text-xs text-muted-foreground">No hay servicios disponibles para vincular.</p>
          ) : (
            <div className="flex gap-2">
              <select
                value={selectedServiceId}
                onChange={e => setSelectedServiceId(e.target.value)}
                className="flex-1 h-11 px-3 rounded-xl border border-border bg-background text-sm font-bold min-h-[44px]"
              >
                <option value="">Seleccionar servicio...</option>
                {availableServices.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.service_number} — {s.service_type_name} — {formatCurrency(s.total_amount)} — {s.supplier || 'Sin proveedor'}
                  </option>
                ))}
              </select>
              <button
                onClick={handleLinkExisting}
                disabled={!selectedServiceId || linking}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-black text-xs uppercase tracking-widest hover:bg-primary/90 transition-colors disabled:opacity-40 min-h-[44px]"
              >
                {linking ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Quick create */}
      {showCreate && (
        <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-3">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Creación rápida</p>
          <div className="grid grid-cols-2 gap-3">
            {['Transporte', 'Manipulación', 'Seguro', 'Estiba'].map(type => (
              <QuickCreateRow key={type} type={type} onCreate={handleQuickCreate} />
            ))}
          </div>
        </div>
      )}

      {/* Services table */}
      {loading ? (
        <div className="p-8 text-center">
          <RefreshCw className="w-6 h-6 animate-spin text-primary mx-auto" />
        </div>
      ) : services.length === 0 ? (
        <div className="p-8 text-center border border-dashed border-border rounded-xl">
          <Truck className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-xs font-bold text-muted-foreground">No hay servicios vinculados a esta recepción</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Crea un servicio o vincula uno existente</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-3 py-2 text-left font-black uppercase tracking-widest text-muted-foreground">Tipo</th>
                <th className="px-3 py-2 text-left font-black uppercase tracking-widest text-muted-foreground">Número</th>
                <th className="px-3 py-2 text-right font-black uppercase tracking-widest text-muted-foreground">Importe</th>
                <th className="px-3 py-2 text-center font-black uppercase tracking-widest text-muted-foreground">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {services.map((link) => {
                const svc = link.received_services;
                if (!svc) return null;
                return (
                  <tr key={link.id} className="hover:bg-primary/5">
                    <td className="px-3 py-2 font-bold">{svc.service_type_name}</td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">{svc.service_number}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold">{formatCurrency(link.allocated_amount)} {svc.currency}</td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {/* GAP-2: Ver Distribución */}
                        <button
                          onClick={() => handleViewDistribution(svc.id)}
                          className={cn("p-2 rounded-lg transition-colors min-h-[44px] min-w-[44px]", showDistribution === svc.id ? "bg-primary/20 text-primary" : "hover:bg-primary/10 text-primary")}
                          aria-label="Ver distribución"
                          title="Ver distribución por línea"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleRecalculate(svc.id)}
                          className="p-2 rounded-lg hover:bg-primary/10 text-primary transition-colors min-h-[44px] min-w-[44px]"
                          aria-label="Recalcular"
                          title="Recalcular distribución"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Total */}
      {services.length > 0 && (
        <div className="flex justify-between items-center pt-3 border-t border-border">
          <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Total Costos Asociados:</span>
          <span className="text-sm font-black font-mono text-primary">{formatCurrency(totalServices)} CUP</span>
        </div>
      )}

      {/* GAP-2: Distribution detail panel */}
      {showDistribution && distributionData.length > 0 && (
        <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Distribución por Línea</p>
            <button onClick={() => setShowDistribution(null)} className="p-1 rounded-lg hover:bg-muted text-muted-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-2 py-1.5 text-left font-black uppercase tracking-widest text-muted-foreground">Producto</th>
                  <th className="px-2 py-1.5 text-right font-black uppercase tracking-widest text-muted-foreground">Cant.</th>
                  <th className="px-2 py-1.5 text-right font-black uppercase tracking-widest text-muted-foreground">Costo Unit.</th>
                  <th className="px-2 py-1.5 text-right font-black uppercase tracking-widest text-muted-foreground">Monto Dist.</th>
                  <th className="px-2 py-1.5 text-right font-black uppercase tracking-widest text-muted-foreground">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {distributionData.map((dist, i) => {
                  const item = dist.receipt_items;
                  const productName = item?.products?.name || 'N/A';
                  return (
                    <tr key={i}>
                      <td className="px-2 py-1.5 font-bold truncate max-w-[150px]">{productName}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{item?.quantity || 0}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{formatCurrency(item?.unit_cost || 0)}</td>
                      <td className="px-2 py-1.5 text-right font-mono font-bold text-primary">{formatCurrency(dist.distribution_amount)}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">{dist.distribution_percentage.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function QuickCreateRow({ type, onCreate }: { type: string; onCreate: (type: string, amount: string) => void }) {
  const [amount, setAmount] = useState('');
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-bold text-muted-foreground flex-1">{type}</span>
      <input
        type="number"
        step="0.01"
        value={amount}
        onChange={e => setAmount(e.target.value)}
        placeholder="0.00"
        className="w-20 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-bold text-right min-h-[44px]"
      />
      <button
        onClick={() => onCreate(type, amount)}
        className="px-2 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-black uppercase hover:bg-primary/20 transition-colors min-h-[44px] min-w-[44px]"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ============================================================================
// FIX-PAYMENT-TRACKING (2026-07-12): PaymentsTab — Tab de pagos a proveedor
// Permite registrar pagos (parciales o totales) y ver el historial de pagos.
// ============================================================================
function PaymentsTab({ receiptId, totalCost }: { receiptId: string; totalCost: number }) {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'transfer' | 'zelle'>('cash');
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/payments?ref_type=receipt&ref_id=${receiptId}`);
      if (res.ok) {
        const data = await res.json();
        setPayments(data);
      }
    } catch (e) {
      console.error('[PaymentsTab] Error:', e);
    } finally {
      setLoading(false);
    }
  }, [receiptId]);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount_cup || p.amount), 0);
  const balance = totalCost - totalPaid;
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
          ref_type: 'receipt',
          ref_id: receiptId,
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
      } else {
        const err = await res.json();
        toast.error(err.error || 'Error al registrar pago');
      }
    } catch (e) {
      toast.error('Error de conexión');
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge = {
    paid: { label: 'Pagado', color: 'bg-success/10 text-success border-success/30' },
    partial: { label: 'Parcial', color: 'bg-amber-500/10 text-amber-500 border-amber-500/30' },
    unpaid: { label: 'Pendiente', color: 'bg-destructive/10 text-destructive border-destructive/30' },
  }[paymentStatus];

  return (
    <div className="p-6 space-y-4">
      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border/30 bg-muted/20 p-3 text-center">
          <p className="text-[10px] font-black uppercase text-muted-foreground">Total</p>
          <p className="text-lg font-mono font-black tabular-nums">{formatCurrency(totalCost)}</p>
        </div>
        <div className="rounded-xl border border-success/20 bg-success/5 p-3 text-center">
          <p className="text-[10px] font-black uppercase text-muted-foreground">Pagado</p>
          <p className="text-lg font-mono font-black tabular-nums text-success">{formatCurrency(totalPaid)}</p>
        </div>
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-center">
          <p className="text-[10px] font-black uppercase text-muted-foreground">Saldo</p>
          <p className="text-lg font-mono font-black tabular-nums text-primary">{formatCurrency(balance)}</p>
        </div>
      </div>

      {/* Badge de estado */}
      <div className="flex items-center justify-between">
        <span className={cn("px-3 py-1 rounded-full text-[10px] font-black uppercase border", statusBadge.color)}>
          {statusBadge.label}
        </span>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[10px] font-black uppercase hover:opacity-90 flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> Registrar Pago
        </button>
      </div>

      {/* Formulario de pago */}
      {showForm && (
        <div className="rounded-xl border border-border/30 p-4 space-y-3 bg-muted/10">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black uppercase text-muted-foreground block mb-1">Monto (CUP)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={String(balance.toFixed(2))}
                className="w-full h-10 bg-background border border-border/50 rounded-lg px-3 text-sm font-bold tabular-nums"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-muted-foreground block mb-1">Método</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as any)}
                className="w-full h-10 bg-background border border-border/50 rounded-lg px-3 text-sm font-bold"
              >
                <option value="cash">💵 Efectivo</option>
                <option value="transfer">📱 Transferencia</option>
                <option value="zelle">💳 Zelle</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase text-muted-foreground block mb-1">Referencia (opcional)</label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="N° de transferencia, etc."
              className="w-full h-10 bg-background border border-border/50 rounded-lg px-3 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="flex-1 h-10 rounded-lg border border-border/40 text-[10px] font-black uppercase hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-[10px] font-black uppercase hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? 'Guardando...' : 'Confirmar Pago'}
            </button>
          </div>
        </div>
      )}

      {/* Historial de pagos */}
      <div className="space-y-2">
        <h4 className="text-[10px] font-black uppercase text-muted-foreground">Historial de Pagos</h4>
        {loading ? (
          <p className="text-xs text-muted-foreground text-center py-4">Cargando...</p>
        ) : payments.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Wallet className="w-8 h-8 mx-auto opacity-30 mb-2" />
            <p className="text-xs">Sin pagos registrados</p>
          </div>
        ) : (
          payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border border-border/30 p-3 bg-muted/10">
              <div className="flex items-center gap-2">
                <span className="text-lg">
                  {p.payment_method === 'cash' ? '💵' : p.payment_method === 'transfer' ? '📱' : '💳'}
                </span>
                <div>
                  <p className="text-sm font-bold tabular-nums">{formatCurrency(Number(p.amount_cup || p.amount))} {p.currency}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(p.payment_date).toLocaleString()} · {p.reference || 'Sin referencia'}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
