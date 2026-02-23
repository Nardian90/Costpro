import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { withTableLogging } from './base';
import { useAdjustStock } from './useInventory';
import { toast } from 'sonner';
import { useCartStore } from '@/store/cart';
import { useUIStore } from '@/store';
import { useAuthStore } from '@/store';

export function useInvertDocument() {
  const queryClient = useQueryClient();
  const { mutateAsync: adjustStock } = useAdjustStock();
  const { user } = useAuthStore.getState();

  return useMutation({
    mutationFn: async ({ type, id, items, storeId }: { type: 'sale' | 'reception', id: string, items: any[], storeId: string }) => {
      if (!user) throw new Error('No hay sesión de usuario activa');

      // 1. Marcar el documento como anulado (voided)
      const table = type === 'sale' ? 'transactions' : 'receipts';
      await withTableLogging('update', table, () =>
        supabase.from(table)
          .update({
            status: 'voided',
            updated_at: new Date().toISOString(),
            ...(type === 'sale' ? { cancelled_at: new Date().toISOString(), void_reason: 'Inversión automática por sistema' } : {})
          })
          .eq('id', id)
      );

      // 2. Realizar ajustes para cada item
      const results = [];
      for (const item of items) {
        // En venta: invertimos sumando stock (quantity es positiva en el item de venta, así que sumamos)
        // En recepción: invertimos restando stock (quantity es positiva en el item de recepción, así que restamos)
        const quantityDelta = type === 'sale' ? item.quantity : -item.quantity;
        const reason = `INVERSION_${type.toUpperCase()}: #${id.split('-')[0]}`;

        const result = await adjustStock({
          productId: item.product_id,
          storeId: storeId,
          userId: user.id,
          quantityDelta: quantityDelta,
          // Para recepción, el costo unitario de ajuste es el costo al que entró
          unitCostAdjustment: type === 'reception' ? item.unit_cost : null,
          reason: reason
        });
        results.push(result);
      }

      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['receptions'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      toast.success('Documento invertido y existencias actualizadas correctamente.');
    },
    onError: (error: any) => {
      toast.error('Error al procesar la inversión: ' + (error.message || 'Error del servidor'));
    }
  });
}

export function useDuplicateDocument() {
  const { setCurrentView } = useUIStore();
  const { clearCart, addItem } = useCartStore();

  return useMutation({
    mutationFn: async ({ type, items }: { type: 'sale' | 'reception', items: any[] }) => {
      if (type === 'sale') {
        clearCart();
        for (const item of items) {
          addItem({
            product_id: item.product_id,
            variant_id: item.variant_id || null,
            product: item.products || item.product,
            variant: null,
            quantity: item.quantity,
            price: item.price_at_sale || item.price || 0,
            cost: item.cost_at_sale || item.cost || 0,
            subtotal: item.quantity * (item.price_at_sale || item.price || 0)
          });
        }
        setCurrentView('pos');
        toast.success('Venta duplicada: Items cargados en el carrito');
      } else {
        toast.info('La duplicación de recepciones estará disponible próximamente.');
      }
    }
  });
}
