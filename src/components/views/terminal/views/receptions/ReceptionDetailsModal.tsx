'use client';

import React from 'react';
import Image from 'next/image';
import { BaseModal } from "@/components/ui/BaseModal";
import { Package, Hash, User, Calendar, FileText, Building2, Download } from 'lucide-react';
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
  onUpdateSubmit?: (updates: { supplier?: string; referenceDoc?: string }) => void;
  onVoidRequest?: () => void;
  isUpdating?: boolean;
  isVoiding?: boolean;
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
  isVoiding = false
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
        <div className="flex justify-between items-center w-full">
          <div className="flex items-center gap-4">
            {!isEditMode && receipt?.status !== 'voided' && onVoidRequest && (
              <button
                onClick={onVoidRequest}
                disabled={isVoiding}
                className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-destructive hover:underline disabled:opacity-50"
                type="button"
                aria-label="Anular recepción"
              >
                {isVoiding ? 'Anulando...' : 'Anular recepción'}
              </button>
            )}
            {!isEditMode && (
              <button
                onClick={onExport}
                className="flex items-center gap-2 px-4 py-3 bg-background border border-border rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary hover:text-foreground transition-all active:scale-95"
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
              onClick={onClose}
              className="px-8 py-3 bg-background border border-border rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-muted transition-all active:scale-95"
              type="button"
              aria-label={isEditMode ? 'Cancelar edición de recepción' : 'Cerrar detalle de recepción'}
            >
              {isEditMode ? 'Cancelar' : 'Cerrar'}
            </button>
            {isEditMode && (
              <button
                onClick={() => onUpdateSubmit?.({
                  supplier: (document.getElementById('edit-supplier') as HTMLInputElement)?.value,
                  referenceDoc: (document.getElementById('edit-reference-doc') as HTMLInputElement)?.value
                })}
                disabled={isUpdating}
                className="px-8 py-3 bg-primary text-white border border-primary rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50"
                type="button"
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
                Nota: Los ítems no pueden editarse porque el inventario ya fue afectado al momento de la recepción original.
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
                  "font-black text-lg",
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
                            <td className="p-3 text-center font-black">{item.quantity}</td>
                            <td className="p-3 text-right font-bold text-muted-foreground">{formatCurrency(item.unit_cost)}</td>
                            <td className="p-3 text-right font-black text-primary">{formatCurrency(item.quantity * item.unit_cost)}</td>
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
              <div className="flex justify-between w-full max-w-[200px] text-xs font-bold text-muted-foreground uppercase">
                <span>Subtotal:</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between w-full max-w-[200px] text-xs font-bold text-muted-foreground uppercase">
                <span>Impuestos (0%):</span>
                <span>{formatCurrency(taxes)}</span>
              </div>
              <div className="flex justify-between w-full max-w-[200px] text-sm font-black text-primary uppercase border-t border-primary/20 pt-1 mt-1">
                <span>Total:</span>
                <span>{formatCurrency(total)}</span>
              </div>
           </div>
        </div>
    </BaseModal>
  );
}
