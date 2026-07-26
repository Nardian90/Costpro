'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-fetch';
import { logger } from '@/lib/logger';

/**
 * useReverseDocument — Hook unificado para reversión contable de cualquier documento.
 *
 * V2.2/V2.3: Reemplaza al legacy `useInvertDocument` (que llamaba void_transaction RPC).
 * Llama al endpoint POST /api/reverse que despacha a la RPC reverse_* correspondiente:
 *   - transaction       -> reverse_transaction      (devuelve stock + kardex devolution_in)
 *   - receipt           -> reverse_receipt          (descuenta stock + kardex out)
 *   - transfer          -> reverse_transfer         (devuelve a origen + descuenta destino)
 *   - adjustment        -> reverse_adjustment       (invierte quantity_change)
 *   - devolution        -> reverse_devolution       (descuenta stock restaurado)
 *   - production_order  -> reverse_production_order (reabastece insumos + descuenta output)
 *
 * El hook invalida automáticamente todas las queries afectadas:
 *   transactions, receptions, transfers, devolutions, inventory, kardex, stock-movements, dashboard.
 */

export type ReversibleDocType =
  | 'transaction'
  | 'receipt'
  | 'transfer'
  | 'adjustment'
  | 'devolution'
  | 'production_order';

interface ReverseOptions {
  /** Tipo de documento a revertir */
  type: ReversibleDocType;
  /** ID del documento */
  id: string;
  /** Motivo de la reversión (mín 3 caracteres) */
  reason: string;
}

export function useReverseDocument() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: async ({ type, id, reason }: ReverseOptions) => {
      logger.info('DATABASE', `[Reverse] type=${type} id=${id} reason="${reason}"`);

      const result = await apiFetch('/api/reverse', {
        method: 'POST',
        body: JSON.stringify({ type, id, reason }),
      });

      return result as { status: string; items_reversed: number };
    },
    onSuccess: async (data, variables) => {
      // Invalidar TODAS las queries que puedan verse afectadas
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['receptions'] }),
        queryClient.invalidateQueries({ queryKey: ['transfers'] }),
        queryClient.invalidateQueries({ queryKey: ['devolutions'] }),
        queryClient.invalidateQueries({ queryKey: ['adjustments'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['stock-movements'] }),
        queryClient.invalidateQueries({ queryKey: ['kardex'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['production-orders'] }),
        queryClient.invalidateQueries({ queryKey: ['document-state-summary'] }),
      ]);

      const labelMap: Record<ReversibleDocType, string> = {
        transaction: 'Venta',
        receipt: 'Recepción',
        transfer: 'Transferencia',
        adjustment: 'Ajuste',
        devolution: 'Devolución',
        production_order: 'Orden de producción',
      };
      toast.success(
        `${labelMap[variables.type]} revertida (${data.items_reversed ?? 0} ítem(s) afectado(s)). Stock y kardex actualizados.`,
      );

      logger.info('DATABASE', `[Reverse] success`, {
        type: variables.type,
        id: variables.id,
        userId: user?.id,
        itemsReversed: data.items_reversed,
      });
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);

      // Mensajes amigables para errores conocidos
      if (msg.includes('ERR_ALREADY_REVERSED')) {
        toast.error('Este documento ya fue revertido anteriormente.');
      } else if (msg.includes('ERR_ALREADY_VOIDED')) {
        toast.error('Este documento ya está anulado. No se puede revertir.');
      } else if (msg.includes('ERR_NOT_CONFIRMED')) {
        toast.error('Solo se puede revertir un documento que ya fue confirmado/completado.');
      } else if (msg.includes('ERR_INVALID_TRANSITION')) {
        toast.error('Transición de estado inválida. El documento no permite esta operación.');
      } else if (msg.includes('ERR_UNAUTHORIZED')) {
        toast.error('No tienes permisos para revertir este documento.');
      } else if (msg.includes('ERR_') && msg.includes('_NOT_FOUND')) {
        toast.error('Documento no encontrado.');
      } else {
        toast.error(`Error al revertir: ${msg}`);
      }

      logger.error('DATABASE', `[Reverse] failed: ${msg}`);
    },
  });
}
