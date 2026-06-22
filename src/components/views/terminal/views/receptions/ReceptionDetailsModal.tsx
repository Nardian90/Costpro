'use client';

import React from 'react';
import Image from 'next/image';
import { BaseModal } from "@/components/ui/BaseModal";
import { Package, Hash, User, Calendar, FileText, Building2, Download, CheckCircle2, AlertTriangle, Trash2 } from 'lucide-react';
import { type Receipt, type ReceiptItem } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { resolveProductImage, getProductImageUrl, formatCurrency, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

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
  if (!receipt && !isLoading) return null;

  const subtotal = receipt?.total_cost || 0;
  const taxes = subtotal * 0; // Assuming 0 for now as it's not in DB, or we can assume it's included
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
            {/* Reception-Flow-Fix: botón "Confirmar" visible solo en modo confirmar-pendiente. */}
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
        </div>

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
    </BaseModal>
  );
}
