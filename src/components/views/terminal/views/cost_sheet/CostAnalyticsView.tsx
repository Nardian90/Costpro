'use client';

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { DynamicAnalyticsCenter } from '@/components/analytics/DynamicAnalyticsCenter';
import { type AnalyticsDataSet, type AnalyticsField, type SavedAnalyticsView, type AnalyticsViewConfig, type AnalyticsZoneItem } from '@/components/analytics/types';
import { useAuthStore } from '@/store';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { LayoutTemplate, Package, TrendingUp, Warehouse } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Plantillas de ejemplo metodológico ────────────────────────────
// 3 configuraciones pre-armadas que demuestran diferentes análisis
// que se pueden hacer con la tabla dinámica.

const TEMPLATES: Array<{
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  config: AnalyticsViewConfig;
}> = [
  {
    id: 'margin-by-category',
    name: 'Margen por Categoría',
    description: 'Rentabilidad de cada categoría de producto',
    icon: TrendingUp,
    config: {
      rows: [{ fieldKey: 'category', label: 'Categoría' }],
      columns: [],
      values: [
        { fieldKey: 'price', label: 'Precio Venta', aggregation: 'avg' },
        { fieldKey: 'margin', label: 'Margen', aggregation: 'sum' },
        { fieldKey: 'margin_pct', label: 'Margen %', aggregation: 'avg' },
      ],
      filters: [],
      columnWidths: {},
      hiddenColumns: [],
      sortConfig: [],
    },
  },
  {
    id: 'inventory-value',
    name: 'Valor de Inventario',
    description: 'Valor del stock agrupado por categoría',
    icon: Warehouse,
    config: {
      rows: [{ fieldKey: 'category', label: 'Categoría' }],
      columns: [],
      values: [
        { fieldKey: 'stock_current', label: 'Stock', aggregation: 'sum' },
        { fieldKey: 'stock_value', label: 'Valor Inventario', aggregation: 'sum' },
        { fieldKey: 'cost_average', label: 'Costo Prom. (WAC)', aggregation: 'avg' },
      ],
      filters: [],
      columnWidths: {},
      hiddenColumns: [],
      sortConfig: [],
    },
  },
  {
    id: 'price-analysis',
    name: 'Análisis de Precios',
    description: 'Precios de venta vs costo por categoría y producto',
    icon: Package,
    config: {
      rows: [
        { fieldKey: 'category', label: 'Categoría' },
        { fieldKey: 'name', label: 'Producto' },
      ],
      columns: [],
      values: [
        { fieldKey: 'price', label: 'Precio Venta', aggregation: 'sum' },
        { fieldKey: 'cost_price', label: 'Costo Manual', aggregation: 'sum' },
        { fieldKey: 'margin', label: 'Margen', aggregation: 'sum' },
      ],
      filters: [],
      columnWidths: {},
      hiddenColumns: [],
      sortConfig: [],
    },
  },
];

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
  const [templateConfig, setTemplateConfig] = useState<AnalyticsViewConfig | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  // ── Field definitions ──
  const fields: AnalyticsField[] = useMemo(() => [
    { key: 'name', label: 'Producto', type: 'string', groupable: true, aggregatable: false },
    { key: 'sku', label: 'SKU', type: 'string', groupable: true, aggregatable: false },
    { key: 'category', label: 'Categoría', type: 'string', groupable: true, aggregatable: false },
    { key: 'unit_of_measure', label: 'UM', type: 'string', groupable: true, aggregatable: false },
    { key: 'is_active', label: 'Activo', type: 'boolean', groupable: true, aggregatable: false },
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

  // ── Plantilla handler ──
  const handleTemplateClick = useCallback((templateId: string) => {
    const template = TEMPLATES.find(t => t.id === templateId);
    if (!template) return;
    // Crear una nueva referencia para forzar el useEffect del DynamicAnalyticsCenter
    setTemplateConfig({ ...template.config, rows: [...template.config.rows], values: [...template.config.values] });
    setActiveTemplate(templateId);
    toast.success(`Plantilla cargada: ${template.name}`);
  }, []);

  // FIX-LIMPIAR: usar un timestamp para forzar el useEffect cuando se limpia
  // (si templateConfig ya era null, setTemplateConfig(null) no dispara re-render)
  const handleClearTemplate = useCallback(() => {
    setActiveTemplate(null);
    // Usar un objeto vacío único con timestamp para forzar el cambio de referencia
    // El DynamicAnalyticsCenter interpreta initialConfig === null como reset,
    // pero necesitamos que la referencia cambie. Usamos un objeto vacío con
    // una prop interna que el DynamicAnalyticsCenter puede detectar.
    // En realidad, pasamos null y usamos un resetKey para forzar el useEffect.
    setTemplateConfig(null);
    setResetKey(k => k + 1);
  }, []);

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
    <div className="h-full flex flex-col">
      {/* Plantillas de ejemplo — fila de botones encima del DynamicAnalyticsCenter */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card/30 flex-wrap">
        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground shrink-0">
          <LayoutTemplate className="w-3.5 h-3.5" />
          Plantillas:
        </div>
        {TEMPLATES.map(tpl => {
          const Icon = tpl.icon;
          return (
            <button
              key={tpl.id}
              onClick={() => handleTemplateClick(tpl.id)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all',
                activeTemplate === tpl.id
                  ? 'border-primary bg-primary/10 text-primary shadow-sm'
                  : 'border-border bg-card hover:bg-muted/50 text-muted-foreground hover:text-foreground'
              )}
              title={tpl.description}
            >
              <Icon className="w-3 h-3 shrink-0" />
              <span className="hidden sm:inline">{tpl.name}</span>
            </button>
          );
        })}
        {activeTemplate && (
          <button
            onClick={handleClearTemplate}
            className="px-2 py-1.5 rounded-lg text-[10px] font-bold text-muted-foreground hover:text-destructive hover:bg-destructive/5 border border-transparent transition-colors"
            title="Quitar plantilla"
          >
            ✕ Limpiar
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0">
        <DynamicAnalyticsCenter
          key={resetKey}
          dataSet={dataSet}
          module="costs"
          storeId={storeId}
          title="Centro de Análisis de Costos"
          description="Analiza costos, márgenes y rentabilidad de productos"
          onSaveView={handleSaveView}
          onLoadViews={handleLoadViews}
          onDeleteView={handleDeleteView}
          initialConfig={templateConfig}
          className="h-full"
        />
      </div>
    </div>
  );
}
