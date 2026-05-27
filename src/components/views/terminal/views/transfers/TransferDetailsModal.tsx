import React, { useState } from 'react';
import { BaseModal } from '@/components/modals/BaseModal';
import { StateRenderer } from '@/components/ui/state-renderer';
import { useTransferDetails, useConfirmTransfer, useCancelTransfer } from '@/hooks/api/useTransfers';
import { useAuthStore } from '@/store';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CheckCircle2, Clock, Package, Building, User, Calendar, XCircle, FileDown } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import type { Transfer, TransferItem, TransferStatus } from '@/types';

interface TransferDetailsModalProps {
  transferId: string | null;
  onClose: () => void;
}

/** Devuelve el badge de estado con icono y color apropiado */
function StatusBadge({ status }: { status: TransferStatus }) {
  switch (status) {
    case 'PENDIENTE':
      return (
        <span className="flex items-center gap-1 text-amber-500 bg-amber-500/10 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest">
          <Clock className="w-3 h-3" /> Pendiente
        </span>
      );
    case 'CONFIRMADA':
      return (
        <span className="flex items-center gap-1 text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest">
          <CheckCircle2 className="w-3 h-3" /> Confirmada
        </span>
      );
    case 'CANCELADA':
      return (
        <span className="flex items-center gap-1 text-rose-500 bg-rose-500/10 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest">
          <XCircle className="w-3 h-3" /> Cancelada
        </span>
      );
    default:
      return <span className="text-xs">{status}</span>;
  }
}

export default function TransferDetailsModal({ transferId, onClose }: TransferDetailsModalProps) {
  const { user } = useAuthStore();
  const { data: transfer, isLoading, error } = useTransferDetails(transferId);
  const confirmMutation = useConfirmTransfer();
  const cancelMutation = useCancelTransfer();

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const handleConfirm = async () => {
    if (!transferId || !user) return;

    setShowConfirmDialog(false);
    const toastId = toast.loading('Confirmando transferencia y actualizando stock...');
    try {
      await confirmMutation.mutateAsync({ transferId, userId: user.id });
      toast.success('Transferencia confirmada con éxito', { id: toastId });
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al confirmar la transferencia';
      toast.error(message, { id: toastId });
    }
  };

  const handleCancel = async () => {
    if (!transferId || !user) return;

    setShowCancelDialog(false);
    const toastId = toast.loading('Cancelando transferencia...');
    try {
      await cancelMutation.mutateAsync({ transferId, userId: user.id });
      toast.success('Transferencia cancelada con éxito', { id: toastId });
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al cancelar la transferencia';
      toast.error(message, { id: toastId });
    }
  };

  const handleExportPdf = () => {
    if (!transferId) return;
    window.open(`/api/transfers/${transferId}/export-pdf`, '_blank');
  };

  const isIncoming = transfer?.destination_store_id === user?.activeStoreId;
  const isOutgoing = transfer?.origin_store_id === user?.activeStoreId;
  const canConfirm = isIncoming && transfer?.status === 'PENDIENTE';
  const canCancel = (isOutgoing || user?.role === 'admin' || user?.role === 'manager') && transfer?.status === 'PENDIENTE';

  return (
    <>
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
              <StatusBadge status={transfer.status} />
            </div>
          ) : 'Cargando...'
        }
        maxWidth="sm:max-w-3xl"
        footer={
          <div className="flex flex-col sm:flex-row justify-between gap-3 w-full">
            <div className="flex gap-2 flex-wrap">
              {transfer?.status === 'PENDIENTE' && (
                <button
                  type="button"
                  onClick={() => setShowCancelDialog(true)}
                  disabled={cancelMutation.isPending}
                  className={`neu-btn px-4 py-2 text-xs font-black uppercase tracking-widest flex items-center gap-2 text-rose-500 ${!canCancel && 'opacity-50 cursor-not-allowed'}`}
                  title={!canCancel ? "No tienes permisos para cancelar esta transferencia" : ""}
                >
                  <XCircle className="w-4 h-4" />
                  Cancelar Transferencia
                </button>
              )}
              <button
                type="button"
                onClick={handleExportPdf}
                className="neu-btn px-4 py-2 text-xs font-black uppercase tracking-widest flex items-center gap-2"
              >
                <FileDown className="w-4 h-4" />
                Exportar PDF
              </button>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="neu-btn px-6 py-2.5 text-xs font-black uppercase tracking-widest"
              >
                Cerrar
              </button>
              {canConfirm && (
                <button
                  type="button"
                  onClick={() => setShowConfirmDialog(true)}
                  disabled={confirmMutation.isPending}
                  className="neu-btn-primary px-8 py-2.5 text-xs font-black uppercase tracking-widest flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Confirmar Recepción
                </button>
              )}
            </div>
          </div>
        }
      >
        <StateRenderer
          isLoading={isLoading}
          error={error as Error}
          data={transfer ? [transfer] : null}
        >
          {([t]: Transfer[]) => (
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
                  <p className="text-sm italic text-muted-foreground">&ldquo;{t.notes}&rdquo;</p>
                </div>
              )}

              <div className="space-y-3 text-left">
                <h4 className="text-xs font-black text-muted-foreground uppercase tracking-widest border-b border-white/5 pb-2">Lista de Productos</h4>
                <div className="space-y-2">
                  {t.items?.map((item: TransferItem) => (
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

      {/* Diálogo de confirmación antes de confirmar recepción */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar recepción de transferencia</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción actualizará el stock del almacén destino con los productos de la transferencia.
              La operación no se puede deshacer. ¿Deseas continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={confirmMutation.isPending}>
              {confirmMutation.isPending ? 'Procesando...' : 'Sí, confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo de confirmación antes de cancelar */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar transferencia?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción marcará la transferencia como CANCELADA. Esta operación no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelMutation.isPending}>Volver</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} disabled={cancelMutation.isPending} className="bg-rose-600 hover:bg-rose-700">
              {cancelMutation.isPending ? 'Cancelando...' : 'Sí, cancelar transferencia'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
