'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { apiFetch } from '@/lib/api-fetch';
import { logger } from '@/lib/logger';
import type { Store } from '@/types';

/**
 * F4-T05: Hook para calcular el Health Score holístico de una tienda.
 *
 * Score 0-100 que indica qué tan completa y operativa está una tienda.
 * Compuesto por 5 categorías de 20 puntos cada una:
 *
 * 1. Configuración general (20pts): nombre + dirección + teléfono + email
 * 2. Datos fiscales (20pts): REEUP + NIT + cuenta bancaria
 * 3. Ficha de Costo (20pts): plantilla FC activa
 * 4. Productos (20pts): al menos 1 producto activo en catálogo
 * 5. Ventas recientes (20pts): al menos 1 venta en los últimos 30 días
 *
 * Devuelve el score total + breakdown por categoría para que la UI pueda
 * mostrar tooltips informativos ("Falta configurar datos fiscales").
 *
 * Patrón usado por Shopify (Shop Health), Stripe (Dashboard Health), HubSpot.
 */

export type HealthCategory = {
  key: 'config' | 'fiscal' | 'fc' | 'products' | 'sales';
  label: string;
  score: number; // 0 o 20
  achieved: boolean;
  hint: string; // qué hacer si no se logró
};

export type StoreHealth = {
  storeId: string;
  total: number; // 0-100
  categories: HealthCategory[];
};

const CATEGORY_LABELS: Record<HealthCategory['key'], string> = {
  config: 'Configuración general',
  fiscal: 'Datos fiscales',
  fc: 'Ficha de Costo',
  products: 'Productos',
  sales: 'Ventas recientes',
};

const CATEGORY_HINTS: Record<HealthCategory['key'], string> = {
  config: 'Completa nombre, dirección, teléfono y email desde Configurar.',
  fiscal: 'Agrega REEUP, NIT y cuenta bancaria desde Configurar > Fiscal.',
  fc: 'Activa una plantilla de Ficha de Costo desde Configurar > FC.',
  products: 'Agrega al menos un producto al catálogo de esta tienda.',
  sales: 'Registra al menos una venta en los últimos 30 días.',
};

/**
 * Calcula el health score de una lista de tiendas en paralelo.
 * Una sola query por tienda para no saturar Supabase.
 */
// Audit-Fix #2d: acepta Store[] completo en lugar de un subtipo estricto.
// Antes el tipo exigía `cost_template?: { is_active?: boolean } | null` lo cual
// no era compatible con `StoreCostTemplate | null` (que tiene is_active?: boolean | null).
// Ahora usamos un tipo estructural que acepta cualquier objeto con los campos básicos
// + cost_template con is_active opcional. Esto es compatible con Store[] y con
// los mocks de tests que usan { is_active: boolean }.
type StoreHealthInput = {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  reeup?: string | null;
  nit?: string | null;
  bank_account?: string | null;
  // Acepta tanto StoreCostTemplate completo como { is_active: boolean } (para tests).
  cost_template?: { is_active?: boolean | null } | null;
};

export function useStoreHealth(stores: StoreHealthInput[]) {
  return useQuery<Record<string, StoreHealth>>({
    queryKey: ['store-health', stores.map(s => s.id).join(',')],
    enabled: stores.length > 0,
    staleTime: 60_000, // 1 minuto — el health cambia lentamente
    queryFn: async () => {
      if (!supabase || stores.length === 0) return {};

      const result: Record<string, StoreHealth> = {};

      // Fecha de corte para "ventas recientes" (30 días)
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const cutoffIso = cutoff.toISOString();

      // BATCH: una sola peticion para todas las tiendas
      let batchData: Record<string, { has_products: boolean; has_sales: boolean }> | null = null;
      try {
        batchData = await apiFetch<Record<string, { has_products: boolean; has_sales: boolean }>>(
          `/api/stores/health-batch?store_ids=${stores.map(s => s.id).join(',')}`
        );
      } catch (e) {
        logger.warn('HEALTH', 'BATCH_FETCH_FAILED', { error: e });
      }

      // Procesar tiendas en paralelo (solo config/fiscal/fc que no necesitan query)
      await Promise.all(stores.map(async (store) => {
        const categories: HealthCategory[] = [];

        // 1. Configuración general (20pts)
        const hasConfig = !!(store.address && store.phone && store.email);
        categories.push({
          key: 'config',
          label: CATEGORY_LABELS.config,
          score: hasConfig ? 20 : 0,
          achieved: hasConfig,
          hint: CATEGORY_HINTS.config,
        });

        // 2. Datos fiscales (20pts)
        const hasFiscal = !!(store.reeup && store.nit && store.bank_account);
        categories.push({
          key: 'fiscal',
          label: CATEGORY_LABELS.fiscal,
          score: hasFiscal ? 20 : 0,
          achieved: hasFiscal,
          hint: CATEGORY_HINTS.fiscal,
        });

        // 3. Ficha de Costo (20pts)
        const hasFC = !!(store.cost_template?.is_active);
        categories.push({
          key: 'fc',
          label: CATEGORY_LABELS.fc,
          score: hasFC ? 20 : 0,
          achieved: hasFC,
          hint: CATEGORY_HINTS.fc,
        });

        // 4. Productos (20pts) — query a Supabase
        // FIX-F4-T05: products usa `is_active` (no `deleted_at`). El filtro anterior
        // .is('deleted_at', null) fallaba silenciosamente porque ese campo no existe
        // en la tabla products (es de product_cost_sheets). Ahora filtramos por is_active=true
        // que es el campo correcto según las migraciones y useProducts.ts.
        let hasProducts = false;
        if (batchData?.[store.id]) {
          hasProducts = batchData[store.id].has_products;
        }
        categories.push({
          key: 'products',
          label: CATEGORY_LABELS.products,
          score: hasProducts ? 20 : 0,
          achieved: hasProducts,
          hint: CATEGORY_HINTS.products,
        });

        // 5. Ventas recientes (20pts) — query a Supabase
        // FIX-F4-T05: la app usa la tabla `transactions` (no `sales`) para registrar ventas.
        // La tabla transactions tiene store_id, total_amount, status y created_at.
        // Filtramos por status='completed' (ventas reales, no pending/cancelled/voided)
        // y por los últimos 30 días.
        // Antes consultábamos `sales` que no es la tabla activa — siempre devolvía 0.
        let hasRecentSales = false;
        if (batchData?.[store.id]) {
          hasRecentSales = batchData[store.id].has_sales;
        }
        categories.push({
          key: 'sales',
          label: CATEGORY_LABELS.sales,
          score: hasRecentSales ? 20 : 0,
          achieved: hasRecentSales,
          hint: CATEGORY_HINTS.sales,
        });

        const total = categories.reduce((sum, c) => sum + c.score, 0);
        result[store.id] = { storeId: store.id, total, categories };
      }));

      return result;
    },
  });
}
