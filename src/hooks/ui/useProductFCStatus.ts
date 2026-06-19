'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store';
import {
  resolveProductFC,
  type FCResolutionResult,
  type FCProductInput,
  type FCStoreTemplateInput,
  type FCExistingCostSheetInput,
} from '@/lib/integration/fc-automation';
import { getProductFCStatus } from '@/contracts/product-cost-sheet';
import type { Product, ProductFCStatus } from '@/types';
import type { CostSheetSyncStatus } from '@/contracts/product-cost-sheet';

// ============================================
// Tipos
// ============================================

export interface ProductFCInfo {
  productId: string;
  fcStatus: ProductFCStatus;
  resolution: FCResolutionResult;
}

export interface FCCoverageData {
  vigente: number;
  pendiente: number;
  sin_fc: number;
  total: number;
  coverage: number;
}

// ============================================
// Datos de FC desde Supabase
// ============================================

interface CostSheetRow {
  id: string;
  product_id: string;
  store_id: string;
  template_id: string;
  modalidad: string;
  calculated_data: Record<string, unknown>;
  cost_price: number;
  cost_price_updated_at: string;
  sync_status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface StoreTemplateRow {
  store_id: string;
  template_id: string;
  template_data: Record<string, unknown> | null;
  modalidad: string;
  pdf_format: string;
  is_active: boolean;
}

// ============================================
// Hook principal
// ============================================

/**
 * useProductFCStatus — Resuelve el estado de FC para una lista de productos.
 *
 * Realiza dos queries optimizadas a Supabase:
 * 1. Busca las FC existentes (product_cost_sheets) para los productos dados
 * 2. Busca la plantilla de la tienda activa (store_cost_templates)
 *
 * Luego resuelve el estado de FC para cada producto.
 *
 * IMPORTANTE: El RPC `get_paginated_products` NO devuelve `cost_sheet_id`
 * ni `fc_auto_enabled`, así que este hook NO depende de esos campos del
 * inventario. En su lugar, usa directamente los datos de `product_cost_sheets`
 * y `store_cost_templates` para determinar el estado.
 */
export function useProductFCStatus(products: Product[]) {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId;

  // Extraer IDs de productos
  const productIds = useMemo(
    () => products.map(p => p.id),
    [products],
  );

  // Query 1: FC existentes de los productos
  const { data: costSheetsData = [], isLoading: isLoadingCostSheets, error: costSheetsError } = useQuery({
    queryKey: ['product-cost-sheets-batch', storeId, productIds],
    queryFn: async (): Promise<CostSheetRow[]> => {
      if (!storeId || productIds.length === 0) return [];

      const { data, error } = await supabase
        .from('product_cost_sheets')
        .select('id, product_id, store_id, template_id, modalidad, calculated_data, cost_price, cost_price_updated_at, sync_status, created_at, updated_at, deleted_at')
        .eq('store_id', storeId)
        .in('product_id', productIds)
        .is('deleted_at', null);

      if (error) {
        console.error('[useProductFCStatus] Error fetching cost sheets:', error);
        return [];
      }
      return (data || []) as CostSheetRow[];
    },
    enabled: !!storeId && productIds.length > 0,
    staleTime: 60 * 1000, // 1 minuto — las FC no cambian constantemente
  });

  // Query 2: Plantilla de la tienda activa
  const { data: storeTemplateData, isLoading: isLoadingTemplate, error: templateError } = useQuery({
    queryKey: ['store-cost-template', storeId],
    queryFn: async (): Promise<StoreTemplateRow | null> => {
      if (!storeId) return null;

      const { data, error } = await supabase
        .from('store_cost_templates')
        .select('store_id, template_id, template_data, modalidad, pdf_format, is_active')
        .eq('store_id', storeId)
        .maybeSingle();

      if (error) {
        console.error('[useProductFCStatus] Error fetching store template:', error);
        return null;
      }
      return data as StoreTemplateRow | null;
    },
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000, // 5 minutos — la plantilla raramente cambia
  });

  // Indexar FC por product_id
  const costSheetsByProductId = useMemo(() => {
    const map = new Map<string, CostSheetRow>();
    for (const cs of costSheetsData) {
      map.set(cs.product_id, cs);
    }
    return map;
  }, [costSheetsData]);

  // Resolver FC para cada producto
  // FIX: El RPC del inventario NO devuelve cost_sheet_id ni fc_auto_enabled.
  // Por eso usamos costSheetsByProductId (query directa a product_cost_sheets)
  // como fuente de verdad para saber si un producto ya tiene FC existente.
  const fcInfoMap = useMemo(() => {
    const map = new Map<string, ProductFCInfo>();

    const templateInput: FCStoreTemplateInput | null = storeTemplateData
      ? {
          template_id: storeTemplateData.template_id,
          template_data: storeTemplateData.template_data,
          modalidad: storeTemplateData.modalidad as 'produccion' | 'servicios' | 'comercializacion',
          pdf_format: storeTemplateData.pdf_format as 'res148',
          is_active: storeTemplateData.is_active,
        }
      : null;

    for (const product of products) {
      const existingSheet = costSheetsByProductId.get(product.id) ?? null;

      // Construir productInput usando cost_sheet_id del inventario si existe,
      // pero si encontramos un existingSheet directo, usamos ese como fuente de verdad.
      const productInput: FCProductInput = {
        id: product.id,
        store_id: product.store_id ?? storeId ?? null,
        // FIX: Si el RPC del inventario no trae cost_sheet_id (que es el caso),
        // pero encontramos un cost sheet existente en la query directa,
        // usamos el ID del cost sheet como si fuera cost_sheet_id del producto.
        cost_sheet_id: product.cost_sheet_id ?? (existingSheet ? existingSheet.id : null),
        fc_auto_enabled: product.fc_auto_enabled ?? true,
        cost_price: product.cost_price ?? 0,
        name: product.name,
      };

      const costSheetInput: FCExistingCostSheetInput | null = existingSheet
        ? {
            id: existingSheet.id,
            product_id: existingSheet.product_id,
            store_id: existingSheet.store_id,
            template_id: existingSheet.template_id,
            modalidad: existingSheet.modalidad as 'produccion' | 'servicios' | 'comercializacion',
            calculated_data: existingSheet.calculated_data,
            cost_price: existingSheet.cost_price,
            cost_price_updated_at: existingSheet.cost_price_updated_at,
            sync_status: existingSheet.sync_status as 'pending' | 'synced' | 'conflict',
            created_at: existingSheet.created_at,
            updated_at: existingSheet.updated_at,
            deleted_at: existingSheet.deleted_at,
          }
        : null;

      const resolution = resolveProductFC(productInput, costSheetInput, templateInput);

      // Determinar fc_status desde la resolución
      let fcStatus: ProductFCStatus = 'sin_fc';
      if (resolution.status === 'existing') {
        fcStatus = resolution.fc_status;
      } else if (resolution.status === 'needs_calculation') {
        fcStatus = 'pendiente';
      }

      map.set(product.id, { productId: product.id, fcStatus, resolution });
    }

    return map;
  }, [products, costSheetsByProductId, storeTemplateData, storeId]);

  // Calcular cobertura FC — usar fcInfoMap (que ya usa resolveProductFC)
  const coverage = useMemo((): FCCoverageData => {
    let vigente = 0;
    let pendiente = 0;
    let sin_fc = 0;

    for (const product of products) {
      const info = fcInfoMap.get(product.id);
      const status = info?.fcStatus ?? 'sin_fc';
      if (status === 'vigente') vigente++;
      else if (status === 'pendiente') pendiente++;
      else sin_fc++;
    }

    const total = products.length;
    const coveragePercent = total > 0 ? (vigente / total) * 100 : 0;

    return { vigente, pendiente, sin_fc, total, coverage: Math.round(coveragePercent * 100) / 100 };
  }, [products, fcInfoMap]);

  // Helpers de acceso rápido
  const getFCInfo = (productId: string): ProductFCInfo | undefined =>
    fcInfoMap.get(productId);

  const getFCStatus = (productId: string): ProductFCStatus => {
    const info = fcInfoMap.get(productId);
    return info?.fcStatus ?? 'sin_fc';
  };

  return {
    fcInfoMap,
    coverage,
    getFCInfo,
    getFCStatus,
    isLoading: isLoadingCostSheets || isLoadingTemplate,
    isError: !!costSheetsError || !!templateError,
    hasStoreTemplate: !!storeTemplateData?.is_active,
    storeTemplate: storeTemplateData,
  };
}
