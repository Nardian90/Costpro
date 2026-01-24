import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { logger } from '@/lib/logger';
import { userService } from '@/services/user-service';
import { storeService } from '@/services/store-service';
import { createSaleParamsSchema } from '@/validation/schemas';
import { useAuthStore, useCartStore } from '@/store';
import { PaymentMethod } from '@/types';
import { UserFormData } from '@/components/views/terminal/UserForm';
import {
  useCreateSale,
  useCreateUser,
  useUpdateUser,
  useManageUserMemberships
} from '@/hooks/useQueries';

export function useTerminalOperations() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { items, clearCart, getTotal, getSubtotal, discount } = useCartStore();

  const createSaleMutation = useCreateSale();
  const createUserMutation = useCreateUser();
  const updateUserMutation = useUpdateUser();
  const manageMembershipsMutation = useManageUserMemberships();

  const handleCheckout = async (paymentMethod: PaymentMethod, checkoutDiscount?: { type: string, value: number } | null) => {
    if (items.length === 0 || createSaleMutation.isPending || !user) return;

    const toastId = toast.loading('Procesando venta...');

    logger.info('POS', 'CHECKOUT_ATTEMPT', {
      userId: user?.id,
      storeId: user?.storeId,
      itemCount: items.length,
      total: getTotal(),
    });

    try {
      const finalDiscount = checkoutDiscount || discount;

      const saleParams = {
        p_store_id: user.storeId,
        p_seller_id: user.id,
        p_payment_method: paymentMethod,
        p_total_amount: Number(getTotal().toFixed(2)),
        p_subtotal: Number(getSubtotal().toFixed(2)),
        p_discount_type: (finalDiscount?.type || 'fixed') as string,
        p_discount_value: Number(finalDiscount?.value || 0),
        p_items: items.map(i => ({
          product_id: i.product_id, variant_id: i.variant_id,
          quantity: i.quantity, price: i.price, cost: i.cost
        }))
      };

      const validationResult = createSaleParamsSchema.safeParse(saleParams);
      if (!validationResult.success) {
          console.error('[Zod Validation Error] create_sale params:', validationResult.error.format());
          throw new Error('Datos de venta inválidos. Revise el carrito.');
      }

      const result = await createSaleMutation.mutateAsync(validationResult.data);

      logger.info('POS', 'CHECKOUT_SUCCESS', {
        userId: user?.id,
        storeId: user?.storeId,
        saleId: (result as any)?.[0]?.r_sale_id,
      });

      toast.success('Venta exitosa', { id: toastId });
      clearCart();
    } catch (error: any) {
      logger.error('POS', 'CHECKOUT_FAILED', {
        userId: user?.id,
        storeId: user?.storeId,
        error: error.message,
      });
      toast.error(error.message || 'Error en venta', { id: toastId });
    }
  };

  const handleLogout = async () => {
    try {
      await userService.logout();
      logout();
      router.replace('/login');
    } catch (error: any) {
      toast.error('Error al cerrar sesión');
    }
  };

  const handleSetActiveStore = async (storeId: string) => {
    if (!user) return;
    try {
      await userService.setActiveStore(user.id, storeId);
      toast.success('Tienda cambiada');
      window.location.reload();
    } catch (error: any) {
      toast.error('Error al cambiar de tienda');
    }
  };

  const handleUserFormSubmit = async (mode: 'create' | 'edit' | null, data: UserFormData, selectedUserContractId?: string): Promise<boolean> => {
    if (!user) return false;
    try {
      if (mode === 'create') {
        await createUserMutation.mutateAsync({
          p_email: data.email,
          p_full_name: data.fullName,
          p_role: data.role,
          p_store_id: data.memberships?.[0]?.store_id || user.storeId || '',
          p_memberships: data.memberships
        });
      } else if (mode === 'edit' && selectedUserContractId) {
        await updateUserMutation.mutateAsync({
          id: selectedUserContractId,
          full_name: data.fullName,
          role: data.role,
          is_active: data.isActive
        });

        await manageMembershipsMutation.mutateAsync({
          userId: selectedUserContractId,
          memberships: data.memberships
        });
      }
      return true;
    } catch (error) {
      return false;
    }
  };

  const handleUpdateStore = async (storeId: string, name: string, address: string) => {
    try {
      await storeService.updateStore(storeId, name, address);
      toast.success('Actualizado');
      return true;
    } catch (error: any) {
      toast.error('Error al actualizar tienda');
      return false;
    }
  };

  return {
    handleCheckout,
    handleLogout,
    handleSetActiveStore,
    handleUserFormSubmit,
    handleUpdateStore,
    isProcessingSale: createSaleMutation.isPending,
    isSubmittingUser: createUserMutation.isPending || updateUserMutation.isPending || manageMembershipsMutation.isPending
  };
}
