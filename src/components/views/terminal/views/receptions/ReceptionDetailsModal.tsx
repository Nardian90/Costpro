'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Package, Hash, User, Calendar, FileText, Building2 } from 'lucide-react';
import { type Receipt, type ReceiptItem } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';

interface ReceptionDetailsModalProps {
  receipt: Receipt | null;
  isOpen: boolean;
  onClose: () => void;
  items: ReceiptItem[];
  isLoading: boolean;
}

export function ReceptionDetailsModal({ receipt, isOpen, onClose, items, isLoading }: ReceptionDetailsModalProps) {
  if (!receipt && !isLoading) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl !rounded-3xl border-white/5 shadow-2xl overflow-hidden p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-2xl font-black uppercase tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Package className="w-6 h-6 text-primary" />
            </div>
            Detalle de Recepción
          </DialogTitle>
        </DialogHeader>

        <div className="p-6 space-y-6">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="neu-card !p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-[9px] font-black text-muted-foreground uppercase tracking-widest">
                <Hash className="w-3 h-3" /> ID Ref
              </div>
              <div className="font-bold text-xs truncate text-primary">{receipt?.id}</div>
            </div>

            <div className="neu-card !p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-[9px] font-black text-muted-foreground uppercase tracking-widest">
                <Calendar className="w-3 h-3" /> Fecha
              </div>
              <div className="font-bold text-xs uppercase">
                {receipt?.reception_date ? new Date(receipt.reception_date).toLocaleDateString() : 'N/A'}
              </div>
            </div>

            <div className="neu-card !p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-[9px] font-black text-muted-foreground uppercase tracking-widest">
                <Building2 className="w-3 h-3" /> Proveedor
              </div>
              <div className="font-bold text-xs truncate">{receipt?.supplier || 'N/A'}</div>
            </div>

             <div className="neu-card !p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-[9px] font-black text-muted-foreground uppercase tracking-widest">
                <FileText className="w-3 h-3" /> Factura #
              </div>
              <div className="font-bold text-xs truncate">{receipt?.reference_doc || 'N/A'}</div>
            </div>

            <div className="neu-card !p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-[9px] font-black text-muted-foreground uppercase tracking-widest">
                <User className="w-3 h-3" /> Recibido por
              </div>
              <div className="font-bold text-[10px] truncate text-muted-foreground italic">
                SISTEMA (ID: {receipt?.user_id?.split('-')[0]})
              </div>
            </div>

            <div className="neu-card !p-3 space-y-1 bg-primary/5 border-primary/20">
              <div className="text-[9px] font-black text-primary uppercase tracking-widest">Total Costo</div>
              <div className="font-black text-lg text-primary">${receipt?.total_cost.toFixed(2)}</div>
            </div>
          </div>

          {/* Items Table */}
          <div className="space-y-3">
             <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Productos Recibidos</h4>
             <div className="rounded-2xl border border-white/5 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground font-black uppercase text-[9px] tracking-widest text-left">
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
                          <td className="p-3"><Skeleton className="h-4 w-32" /></td>
                          <td className="p-3"><Skeleton className="h-4 w-8 mx-auto" /></td>
                          <td className="p-3"><Skeleton className="h-4 w-16 ml-auto" /></td>
                          <td className="p-3"><Skeleton className="h-4 w-16 ml-auto" /></td>
                        </tr>
                      ))
                    ) : (
                      items.map((item) => (
                        <tr key={item.id} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                          <td className="p-3">
                            <div className="font-bold">{item.products?.name}</div>
                            <div className="text-[9px] font-mono text-muted-foreground">{item.products?.sku}</div>
                          </td>
                          <td className="p-3 text-center font-black">{item.quantity}</td>
                          <td className="p-3 text-right font-bold text-muted-foreground">${item.unit_cost.toFixed(2)}</td>
                          <td className="p-3 text-right font-black text-primary">${(item.quantity * item.unit_cost).toFixed(2)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
             </div>
          </div>
        </div>

        <div className="p-6 bg-muted/20 border-t border-white/5 flex justify-end">
          <button
            onClick={onClose}
            className="px-8 py-3 bg-background border border-border rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-muted transition-all active:scale-95"
          >
            Cerrar Detalle
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
