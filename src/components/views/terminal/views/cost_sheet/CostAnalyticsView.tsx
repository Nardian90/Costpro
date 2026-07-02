'use client';

import React, { useMemo, useState, useCallback } from 'react';
import { DynamicAnalyticsCenter } from '@/components/analytics/DynamicAnalyticsCenter';
import { type AnalyticsDataSet, type AnalyticsField, type SavedAnalyticsView } from '@/components/analytics/types';
import { useAuthStore } from '@/store';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';

/**
 * Centro de Análisis de Costos — Vista específica del módulo COSTO.
 * Usa el componente reutilizable DynamicAnalyticsCenter con datos de
 * products + product_cost_sheets.
 */
export default function CostAnalyticsView() {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId;
  const [dataSet, setDataSet] = useState<AnalyticsDataSet>({ fields: [], data: [], totalRecords: 0 });
  const [loading, setLoading] = useState(true);

  // ── Field definitions ──
  const fields: AnalyticsField[] = useMemo(() => [
    { key: 'name', label: 'Producto', type: 'string', groupable: true, aggregatable: false },
    { key: 'sku', label: 'SKU', type: 'string', groupable: true, aggregatable: false },
    { key: 'category', label: 'Categoría', type: 'string', groupable: true, aggregatable: false },
    { key: 'unit_of_measure', label: 'UM', type: 'string', groupable: true, aggregatable: false },
    { key: 'is_active', label: 'Activo', type: 'boolean', groupable: true, aggregatable: false },
    // FIX-P1.6: currency sin hardcodear — el formateador usa CUP por defecto
    { key: 'cost_price', label: 'Costo Manual', type: 'number', groupable: false, aggregatable: true, format: 'currency' },
    { key: 'price', label: 'Precio Venta', type: 'number', groupable: false, aggregatable: true, format: 'currency' },
    { key: 'cost_average', label: 'Costo Prom. (WAC)', type: 'number', groupable: false, aggregatable: true, format: 'currency' },
    { key: 'stock_current', label: 'Stock', type: 'number', groupable: false, aggregatable: true, format: 'number' },
    { key: 'min_stock', label: 'Stock Mín.', type: 'number', groupable: false, aggregatable: true, format: 'number' },
    { key: 'margin', label: 'Margen', type: 'number', groupable: false, aggregatable: true, format: 'currency' },
    { key: 'margin_pct', label: 'Margen %', type: 'number', groupable: false, aggregatable: true, format: 'percent' },
    { key: 'stock_value', label: 'Valor Inventario', type: 'number', groupable: false, aggregatable: true, format: 'currency' },
    { key: 'created_at', label: 'Creado', type: 'date', groupable: true, aggregatable: false, format: 'date' },
  ], []);

  // ── Load data ──
  React.useEffect(() => {
    if (!storeId) return;
    setLoading(true);

    supabase
      .from('products')
      .select('name, sku, category, unit_of_measure, is_active, cost_price, price, cost_average, stock_current, min_stock, created_at')
      .eq('store_id', storeId)
      .then(({ data, error }) => {
        if (error) {
          toast.error('Error al cargar datos de costos');
          setDataSet({ fields, data: [], totalRecords: 0 });
        } else {
          // FIX-P1.6: usar cost_average (WAC) para cálculos de margen y valor
          // — consistente con el motor de costeo dinámico post-fix P0
          const enriched = (data || []).map(p => {
            const effectiveCost = p.cost_average ?? p.cost_price ?? 0;
            return {
              ...p,
              margin: (p.price || 0) - effectiveCost,
              margin_pct: effectiveCost > 0 ? ((p.price || 0) - effectiveCost) / effectiveCost * 100 : 0,
              stock_value: (p.stock_current || 0) * effectiveCost,
            };
          });
          setDataSet({ fields, data: enriched, totalRecords: enriched.length });
        }
        setLoading(false);
      });
  }, [storeId, fields]);

  // ── Save view ──
  const handleSaveView = useCallback(async (view: Partial<SavedAnalyticsView>) => {
    const { data, error } = await supabase
      .from('saved_analytics_views')
      .insert({
        user_id: user?.id,
        store_id: storeId,
        name: view.name,
        description: view.description,
        module: 'costs',
        config: view.config,
      })
      .select()
      .single();

    if (error) throw error;
    toast.success('Vista guardada');
  }, [user?.id, storeId]);

  // ── Load views ──
  const handleLoadViews = useCallback(async () => {
    const { data, error } = await supabase
      .from('saved_analytics_views')
      .select('*')
      .eq('user_id', user?.id)
      .eq('module', 'costs')
      .order('created_at', { ascending: false });

    if (error) return [];
    return (data || []) as SavedAnalyticsView[];
  }, [user?.id]);

  // ── Delete view ──
  const handleDeleteView = useCallback(async (viewId: string) => {
    await supabase.from('saved_analytics_views').delete().eq('id', viewId).eq('user_id', user?.id);
    toast.success('Vista eliminada');
  }, [user?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-muted-foreground">Cargando datos de costos…</p>
        </div>
      </div>
    );
  }

  return (
    <DynamicAnalyticsCenter
      dataSet={dataSet}
      module="costs"
      storeId={storeId}
      title="Centro de Análisis de Costos"
      description="Analiza costos, márgenes y rentabilidad de productos"
      onSaveView={handleSaveView}
      onLoadViews={handleLoadViews}
      onDeleteView={handleDeleteView}
      className="h-full"
    />
  );
}
