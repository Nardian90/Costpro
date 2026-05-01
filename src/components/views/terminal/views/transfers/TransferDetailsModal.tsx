'use client';
// src/components/views/terminal/views/transfers/TransferDetailsModal.tsx

import { useAuthStore } from '@/store';
import { BaseModal } from '@/components/ui/BaseModal';
import { useTransferDetails, useConfirmTransfer } from '@/hooks/api/useTransfers';
import { StateRenderer } from '@/components/ui/StateRenderer';
import { CheckCircle2, Clock, Package, Building, User, Calendar } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';

interface TransferDetailsModalProps {
  transferId: string | null;
  onClose: () => void;
}

export default function TransferDetailsModal({ transferId, onClose }: TransferDetailsModalProps) {
  const { user } = useAuthStore();
  const { data: transfer, isLoading, error } = useTransferDetails(transferId);
  const confirmMutation = useConfirmTransfer();

  const handleConfirm = async () => {
    if (!transferId || !user) return;

    const toastId = toast.loading('Confirmando transferencia y actualizando stock...');
    try {
      await confirmMutation.mutateAsync({ transferId, userId: user.id });
      toast.success('Transferencia confirmada con éxito', { id: toastId });
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Error al confirmar la transferencia', { id: toastId });
    }
  };

  const isIncoming = transfer?.destination_store_id === user?.activeStoreId;
  const canConfirm = isIncoming && transfer?.status === 'PENDIENTE';

  return (
    <BaseModal
      open={!!transferId}
      onOpenChange={(open) => !open && onClose()}
      title={
        transfer ? (
          <div className="flex justify-between items-center w-full">
            <div className="flex items-center gap-3">
              <Package className="w-6 h-6 text-primary" />
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight">Detalle de Transferencia</h3>
                <p className="text-xs text-muted-foreground font-mono uppercase">ID: {transfer.id}</p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              {transfer.status === 'PENDIENTE' ? (
                <span className="flex items-center gap-1 text-amber-500 bg-amber-500/10 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest"><Clock className="w-3 h-3" /> Pendiente</span>
              ) : (
                <span className="flex items-center gap-1 text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest"><CheckCircle2 className="w-3 h-3" /> Confirmada</span>
              )}
            </div>
          </div>
        ) : "Cargando..."
      }
      maxWidth="sm:max-w-3xl"
      footer={
        <div className="flex justify-end gap-3 w-full">
          <button
            onClick={onClose}
            className="neu-btn px-6 py-2.5 text-xs font-black uppercase tracking-widest"
          >
            Cerrar
          </button>
          {canConfirm && (
            <button
              onClick={handleConfirm}
              disabled={confirmMutation.isPending}
              className="neu-btn-primary px-8 py-2.5 text-xs font-black uppercase tracking-widest flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              {confirmMutation.isPending ? 'Procesando...' : 'Confirmar Recepción'}
            </button>
          )}
        </div>
      }
    >
        <StateRenderer
          isLoading={isLoading}
          error={error as Error}
          data={transfer ? [transfer] : null}
        >
          {([t]: any[]) => (
            <div className="space-y-6">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                       <div className="flex items-start gap-3">
                          <Building className="w-4 h-4 text-muted-foreground mt-1" />
                          <div>
                             <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-1 block text-left">Origen</p>
                             <p className="text-sm font-bold">{t.origin_store?.name}</p>
                          </div>
                       </div>
                       <div className="flex items-start gap-3">
                          <Building className="w-4 h-4 text-muted-foreground mt-1" />
                          <div>
                             <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-1 block text-left">Destino</p>
                             <p className="text-sm font-bold">{t.destination_store?.name}</p>
                          </div>
                       </div>
                    </div>
                    <div className="space-y-4">
                       <div className="flex items-start gap-3">
                          <User className="w-4 h-4 text-muted-foreground mt-1" />
                          <div>
                             <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-1 block text-left">Solicitante</p>
                             <p className="text-sm font-bold">{t.creator?.full_name}</p>
                          </div>
                       </div>
                       <div className="flex items-start gap-3">
                          <Calendar className="w-4 h-4 text-muted-foreground mt-1" />
                          <div>
                             <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-1 block text-left">Fecha de Solicitud</p>
                             <p className="text-sm font-bold">{formatDate(t.created_at)}</p>
                          </div>
                       </div>
                    </div>
                 </div>

                 {t.notes && (
                   <div className="neu-card bg-white/2 !p-3">
                      <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-1 block text-left">Notas</p>
                      <p className="text-sm italic text-muted-foreground">"{t.notes}"</p>
                   </div>
                 )}

                 <div className="space-y-3 text-left">
                    <h4 className="text-xs font-black text-muted-foreground uppercase tracking-widest border-b border-white/5 pb-2">Lista de Productos</h4>
                    <div className="space-y-2">
                       {t.items?.map((item: any) => (
                         <div key={item.id} className="neu-card bg-white/2 !p-3 flex justify-between items-center">
                            <div>
                               <p className="text-sm font-bold">{item.product?.name}</p>
                               <p className="text-xs text-muted-foreground font-mono uppercase">SKU: {item.product?.sku}</p>
                            </div>
                            <div className="text-right">
                               <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Cantidad</p>
                               <p className="text-lg font-black text-primary">{item.quantity}</p>
                            </div>
                         </div>
                       ))}
                    </div>
                 </div>
              </div>
          )}
        </StateRenderer>
    </BaseModal>
  );
}
