'use client';

import React from 'react';
import { BaseModal } from "@/components/ui/BaseModal";
import { Package, Hash, User, Calendar, FileText, Building2, Download } from 'lucide-react';
import { type Receipt, type ReceiptItem } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { resolveProductImage, getProductImageUrl, formatCurrency, formatDate } from '@/lib/utils';

interface ReceptionDetailsModalProps {
  receipt: Receipt | null;
  isOpen: boolean;
  onClose: () => void;
  items: ReceiptItem[];
  isLoading: boolean;
  onExport?: () => void;
}

export function ReceptionDetailsModal({ receipt, isOpen, onClose, items, isLoading, onExport }: ReceptionDetailsModalProps) {
  if (!receipt && !isLoading) return null;

  const subtotal = receipt?.total_cost || 0;
  const taxes = subtotal * 0; // Assuming 0 for now as it's not in DB, or we can assume it's included
  const total = subtotal + taxes;

  return (
    <BaseModal
      open={isOpen}
      onOpenChange={onClose}
      title={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Package className="w-6 h-6 text-primary" />
          </div>
          Detalle de Recepción
        </div>
      }
      description="Muestra el listado de productos y cantidades recibidas en esta operación."
      maxWidth="sm:max-w-2xl"
      footer={
        <div className="flex justify-between items-center w-full">
          <button
            onClick={onExport}
            className="flex items-center gap-2 px-4 py-3 bg-background border border-border rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary hover:text-foreground transition-all active:scale-95"
          >
            <Download className="w-4 h-4" />
            Exportar CSV
          </button>
          <button
            onClick={onClose}
            className="px-8 py-3 bg-background border border-border rounded-xl text-xs font-black uppercase tracking-widest hover:bg-muted transition-all active:scale-95"
          >
            Cerrar Detalle
          </button>
        </div>
      }
    >
        <div className="space-y-6">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="neu-card !p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-black text-muted-foreground uppercase tracking-widest">
                <Hash className="w-3 h-3" /> ID Ref
              </div>
              <div className="font-bold text-xs truncate text-primary">{receipt?.id}</div>
            </div>

            <div className="neu-card !p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-black text-muted-foreground uppercase tracking-widest">
                <Calendar className="w-3 h-3" /> Fecha
              </div>
              <div className="font-bold text-xs uppercase">
                {formatDate(receipt?.reception_date)}
              </div>
            </div>

            <div className="neu-card !p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-black text-muted-foreground uppercase tracking-widest">
                <Building2 className="w-3 h-3" /> Proveedor
              </div>
              <div className="font-bold text-xs truncate">{receipt?.supplier || 'N/A'}</div>
            </div>

             <div className="neu-card !p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-black text-muted-foreground uppercase tracking-widest">
                <FileText className="w-3 h-3" /> Factura #
              </div>
              <div className="font-bold text-xs truncate">{receipt?.reference_doc || 'N/A'}</div>
            </div>

            <div className="neu-card !p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-black text-muted-foreground uppercase tracking-widest">
                <User className="w-3 h-3" /> Recibido por
              </div>
              <div className="font-bold text-xs truncate text-muted-foreground italic">
                SISTEMA (ID: {receipt?.user_id?.split('-')[0]})
              </div>
            </div>

            <div className="neu-card !p-3 space-y-1 bg-primary/5 border-primary/20">
              <div className="text-xs font-black text-primary uppercase tracking-widest">Total Costo</div>
              <div className="font-black text-lg text-primary">{formatCurrency(receipt?.total_cost || 0)}</div>
            </div>
          </div>

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
                                  <img src={imageUrl} alt={item.products?.name} className="w-full h-full object-cover" />
                                ) : (
                                  <Package className="w-5 h-5 text-muted-foreground/50" />
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
