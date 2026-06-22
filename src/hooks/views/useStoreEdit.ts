'use client';

import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { storeApiClient, authHeaders } from '@/services/store-api-client';
import { useTranslations } from 'next-intl';
import type { Store } from '@/types';

/**
 * F3-T02: Hook compartido para editar stores y guardar/eliminar plantilla FC.
 *
 * Elimina la duplicación entre:
 * - useStoresView.ts (handleStoreFormSubmit edit mode + saveFCTemplate)
 * - MultiStoreDashboardView.tsx (handleStoreFormSubmit — reimplementaba lo mismo)
 *
 * El comentario "previously, editing a store from the Dashboard KPI would NOT
 * save the FC template" (MultiStoreDashboardView:206-208) ya no aplica porque
 * ambas vistas consumen este hook y por tanto el mismo camino de guardado.
 *
 * Acciones expuestas:
 * - saveStoreCore(storeId, data): actualiza campos principales de la tienda
 * - saveFCTemplate(storeId, fcData): upsert de plantilla FC
 * - deleteFCTemplate(storeId): elimina plantilla FC (cuando se desactiva)
 * - editStoreWithFC(storeId, data, prevFCActive): flujo completo de edición
 * - invalidateStoreQueries(): refresca caches relacionados
 */

type FCTemplateData = {
  template_id: string;
  modalidad: string;
  pdf_format: string;
  is_active: boolean;
};

export function useStoreEdit() {
  const queryClient = useQueryClient();

  /** Actualiza los campos principales de una tienda (no FC) */
  const saveStoreCore = async (storeId: string, data: Partial<Store>): Promise<void> => {
    await storeApiClient.updateStore(storeId, {
      name: data.name,
      address: data.address,
      reeup: data.reeup,
      nit: data.nit,
      bank_account: data.bank_account,
      phone: data.phone,
      email: data.email,
      logo_url: data.logo_url,
      signature_url: data.signature_url,
      stamp_url: data.stamp_url,
      latitude: data.latitude,
      longitude: data.longitude,
      slug: data.slug,
      plantilla: data.plantilla,
    });
  };

  /** Upsert de plantilla FC para una tienda. Retorna true si éxito. */
  const saveFCTemplate = async (storeId: string, fcData: FCTemplateData): Promise<boolean> => {
    try {
      const response = await fetch('/api/store-cost-templates', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          store_id: storeId,
          template_id: fcData.template_id,
          modalidad: fcData.modalidad,
          pdf_format: fcData.pdf_format,
          is_active: fcData.is_active,
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        logger.error('FC', 'TEMPLATE_SAVE_FAILED', { storeId, err });
        return false;
      }
      queryClient.invalidateQueries({ queryKey: ['store-cost-template'] });
      queryClient.invalidateQueries({ queryKey: ['product-cost-sheets-batch'] });

      // F3-T05: auto-invalidar FCs existentes de la tienda cuando se guarda una plantilla.
      // Las FCs existentes fueron generadas con la plantilla anterior; si la plantilla cambia,
      // las FCs deben marcarse como pendientes de regeneración para que el usuario sepa
      // que necesita regenerarlas con la nueva plantilla.
      // Antes el usuario tenía que eliminar y regenerar cada FC manualmente — propenso a olvidos.
      await invalidateFCsForStore(storeId);

      return true;
    } catch (error) {
      logger.error('FC', 'TEMPLATE_SAVE_EXCEPTION', { storeId, error });
      return false;
    }
  };

  /**
   * F3-T05: Marca todas las FCs de una tienda como pendientes de regeneración.
   *
   * FIX-DEUDA: ahora llama al endpoint /api/product-cost-sheets/invalidate que
   * usa service role (bypass RLS). Antes usaba el cliente Supabase regular del
   * navegador, sujeto a RLS — fallaba silenciosamente si el caller no era admin.
   *
   * No falla el saveFCTemplate si esta operación falla — es una optimización.
   */
  const invalidateFCsForStore = async (storeId: string): Promise<number> => {
    try {
      const response = await fetch('/api/product-cost-sheets/invalidate', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ storeId }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        logger.warn('FC', 'FC_INVALIDATION_FAILED', {
          storeId,
          error: err.error || err.message || `HTTP ${response.status}`,
        });
        return 0;
      }

      const result = await response.json();
      const count = result.affected ?? 0;

      if (count > 0) {
        logger.info('FC', 'FCs_INVALIDATED_BY_TEMPLATE_CHANGE', { storeId, count });
        toast.info(
          `${count} ficha${count === 1 ? '' : 's'} de costo marcada${count === 1 ? '' : 's'} como pendiente${count === 1 ? '' : 's'}`,
          {
            description: 'Regéralas con la nueva plantilla desde el tablero de costos.',
            duration: 8000,
          }
        );
        queryClient.invalidateQueries({ queryKey: ['product-cost-sheets'] });
        queryClient.invalidateQueries({ queryKey: ['product-cost-sheets-batch'] });
      }
      return count;
    } catch (error) {
      logger.warn('FC', 'FC_INVALIDATION_EXCEPTION', {
        storeId,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  };

  /** Elimina la plantilla FC de una tienda (cuando se desactiva) */
  const deleteFCTemplate = async (storeId: string): Promise<void> => {
    try {
      const response = await fetch(`/api/store-cost-templates?store_id=${storeId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!response.ok) {
        logger.error('FC', 'TEMPLATE_DELETE_FAILED', { storeId, status: response.status });
      }
      queryClient.invalidateQueries({ queryKey: ['store-cost-template'] });
      queryClient.invalidateQueries({ queryKey: ['product-cost-sheets-batch'] });
    } catch (error) {
      logger.error('FC', 'TEMPLATE_DELETE_EXCEPTION', { storeId, error });
    }
  };

  /**
   * Flujo completo de edición de tienda: guarda campos principales + maneja FC.
   * Detecta automáticamente si FC se activó, desactivó o no cambió.
   */
  const editStoreWithFC = async (
    storeId: string,
    data: Partial<Store>,
    previousFCActive: boolean
  ): Promise<void> => {
    const fcTemplateData = (data as Record<string, unknown>).cost_template as FCTemplateData | null;
    const fcWasActive = previousFCActive === true;
    const fcIsNowOff = fcTemplateData === null && fcWasActive;

    await saveStoreCore(storeId, data);

    if (fcTemplateData) {
      const saved = await saveFCTemplate(storeId, fcTemplateData);
      if (!saved) {
        toast.warning('La plantilla FC podría no haberse guardado. Verifica la configuración.');
      }
    }

    if (fcIsNowOff) {
      await deleteFCTemplate(storeId);
    }
  };

  /** Invalida todas las queries relacionadas con stores */
  const invalidateStoreQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['stores'] });
    queryClient.invalidateQueries({ queryKey: ['store-user-counts'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['multi-store-dashboard'] });
  };

  return {
    saveStoreCore,
    saveFCTemplate,
    deleteFCTemplate,
    editStoreWithFC,
    invalidateStoreQueries,
    invalidateFCsForStore,
  };
}
