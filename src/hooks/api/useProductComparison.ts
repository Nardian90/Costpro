'use client';

/**
 * ADNEGOCIO-UI 2026-11-23 · Datos de «Comparar productos» (misión §5).
 *
 * UNA SOLA FUENTE DE VERDAD de ventas: el RPC get_sales_dashboard_analytics
 * (el mismo del dashboard comercial y del Ritmo de ventas) en DOS llamadas —
 * ventana actual (mes en curso acumulado) y ventana anterior equivalente
 * (mismo tramo del mes anterior, previousMonthEquivalentWindow). Sin
 * consultas nuevas ni agregados propios: netos de descuento y de devoluciones
 * según el cálculo canónico ya autorizado (CUP contable a la tasa de cada
 * venta; anulados/borradores excluidos por el propio RPC).
 *
 * p_limit_products = 20 (tope del propio RPC): la comparación reúne la UNIÓN
 * de ambos Tops, así el líder anterior con ventas cero hoy permanece visible.
 *
 * El catálogo de productos (existencias y unidad de medida) NO se mezcla
 * aquí: la vista lo combina con buildComparison en un useMemo — el stock se
 * pinta en cuanto el catálogo carga, sin re-consultar ventas.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { dashboardResponseSchema, type SalesDashboardResponse } from '@/lib/sales-dashboard/schema';
import {
  resolvePeriodWindow, previousMonthEquivalentWindow, havanaNow, type PeriodWindow,
} from '@/lib/sales-dashboard/periods';

/** Ventana «mes en curso acumulado» (1º → hoy, La Habana). */
export function monthToDateWindow(): PeriodWindow {
  return resolvePeriodWindow('this_month');
}

export interface ProductComparisonData {
  ventana: PeriodWindow;
  ventanaAnterior: PeriodWindow;
  /** Respuesta del período actual (kpi + products.top_net/top_units). */
  actual: SalesDashboardResponse;
  /** Respuesta del período anterior equivalente. */
  anterior: SalesDashboardResponse;
  /**
   * Productos del Top anterior ausentes del Top actual que SÍ registran
   * salidas por venta (movement_type='sale') en el mayor de inventario del
   * período actual — evidencia real para distinguir «sale del Top» de
   * «dejó de venderse» (misión §5.3) sin sumar movimientos como ventas.
   */
  ventasEnPeriodoActual: Set<string>;
  /** Fecha de actualización de la información (último fetch exitoso, La Habana). */
  updatedAt: string | null;
}

export function useProductComparison(storeId: string | null) {
  return useQuery<ProductComparisonData>({
    queryKey: ['product-comparison-rpc', storeId ?? 'all'],
    queryFn: async (): Promise<ProductComparisonData> => {
      const ventana = monthToDateWindow();
      const ventanaAnterior = previousMonthEquivalentWindow(ventana);

      const call = (from: Date, to: Date, prevFrom: Date, prevTo: Date) =>
        supabase.rpc('get_sales_dashboard_analytics', {
          p_store_id: storeId,
          p_date_from: from.toISOString(),
          p_date_to: to.toISOString(),
          p_prev_from: prevFrom.toISOString(),
          p_prev_to: prevTo.toISOString(),
          p_seller_id: null,
          p_status: null,
          p_payment_method: null,
          p_limit_products: 20,
        }).then(({ data, error }) => {
          if (error) throw error;
          return dashboardResponseSchema.parse(data);
        });

      const [actual, anterior] = await Promise.all([
        call(ventana.from, ventana.to, ventanaAnterior.from, ventanaAnterior.to),
        call(ventanaAnterior.from, ventanaAnterior.to, ventanaAnterior.from, ventanaAnterior.to),
      ]);

      // Evidencia de «sigue vendiéndose» para los líderes anteriores ausentes
      // del Top actual: UNA consulta por lotes al mayor real de inventario
      // (movement_type='sale' en el período actual). RLS por tienda aplica.
      const curIds = new Set((actual.products?.top_net ?? []).map((r) => r.product_id).filter(Boolean) as string[]);
      const missing = (anterior.products?.top_net ?? [])
        .map((r) => r.product_id)
        .filter((id): id is string => typeof id === 'string' && !curIds.has(id));
      const ventasEnPeriodoActual = new Set<string>();
      if (missing.length > 0) {
        const { data: movs, error: movError } = await supabase
          .from('stock_movements')
          .select('product_id')
          .in('product_id', missing)
          .eq('movement_type', 'sale')
          .gte('created_at', ventana.from.toISOString())
          .lte('created_at', ventana.to.toISOString());
        if (movError) throw movError;
        for (const m of (movs ?? []) as Array<{ product_id: string }>) {
          ventasEnPeriodoActual.add(m.product_id);
        }
      }

      return {
        ventana,
        ventanaAnterior,
        actual,
        anterior,
        ventasEnPeriodoActual,
        updatedAt: havanaNow().toISOString(),
      };
    },
    staleTime: 60 * 1000,
    retry: 1,
  });
}
