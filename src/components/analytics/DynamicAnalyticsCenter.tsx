'use client';

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  useVirtualizer,
} from '@tanstack/react-virtual';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Download, Save, FolderOpen, Trash2, Copy, RotateCcw,
  Search, ChevronRight, ChevronDown, X, Plus, Settings2,
  FileSpreadsheet, FileText, Printer, BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVirtualizer as useVirtual } from '@tanstack/react-virtual';
import {
  type AnalyticsProps, type AnalyticsViewConfig, type AnalyticsZoneItem,
  type AnalyticsField, type AggregationFunction, type DateGrouping,
  type SavedAnalyticsView, type AnalyticsFilter,
  AGGREGATION_LABELS, DATE_GROUPING_LABELS,
  aggregate, formatDateGroup,
} from './types';

// ── Sub-components ─────────────────────────────────────────────────

interface DropZoneProps {
  id: string;
  label: string;
  items: AnalyticsZoneItem[];
  onRemove: (index: number) => void;
  onAggregationChange?: (index: number, fn: AggregationFunction) => void;
  onDateGroupingChange?: (index: number, grouping: DateGrouping) => void;
  accentColor: string;
}

function DropZone({ id, label, items, onRemove, onAggregationChange, onDateGroupingChange, accentColor }: DropZoneProps) {
  return (
    <div
      className={cn(
        'min-h-[60px] rounded-lg border-2 border-dashed p-2 transition-colors',
        items.length === 0 ? 'border-muted-foreground/20 bg-muted/20' : 'border-muted-foreground/30 bg-muted/10'
      )}
      data-dropzone={id}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={cn('text-[10px] font-black uppercase tracking-widest', accentColor)}>{label}</span>
        {items.length > 0 && <Badge variant="secondary" className="h-4 text-[9px]">{items.length}</Badge>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, idx) => (
          <div
            key={`${item.fieldKey}-${idx}`}
            className="group flex items-center gap-1 px-2 py-1 rounded-md bg-card border border-border text-xs font-medium shadow-sm"
          >
            <span>{item.label}</span>
            {item.aggregation && onAggregationChange && (
              <select
                className="text-[10px] bg-transparent border-none outline-none cursor-pointer text-muted-foreground"
                value={item.aggregation}
                onChange={(e) => onAggregationChange(idx, e.target.value as AggregationFunction)}
              >
                {Object.entries(AGGREGATION_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            )}
            {item.dateGrouping && onDateGroupingChange && (
              <select
                className="text-[10px] bg-transparent border-none outline-none cursor-pointer text-muted-foreground"
                value={item.dateGrouping}
                onChange={(e) => onDateGroupingChange(idx, e.target.value as DateGrouping)}
              >
                {Object.entries(DATE_GROUPING_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            )}
            <button
              onClick={() => onRemove(idx)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        {items.length === 0 && (
          <span className="text-[10px] text-muted-foreground/50 italic">Arrastrar aquí…</span>
        )}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────

export function DynamicAnalyticsCenter({
  dataSet,
  module: moduleName,
  storeId,
  title,
  description,
  onSaveView,
  onLoadViews,
  onDeleteView,
  className,
}: AnalyticsProps) {
  const { fields, data } = dataSet;
  const [config, setConfig] = useState<AnalyticsViewConfig>({
    rows: [],
    columns: [],
    values: [],
    filters: [],
    columnWidths: {},
    hiddenColumns: [],
    sortConfig: [],
  });
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [activeDragField, setActiveDragField] = useState<AnalyticsField | null>(null);
  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [savedViews, setSavedViews] = useState<SavedAnalyticsView[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [viewName, setViewName] = useState('');
  const [showViewsList, setShowViewsList] = useState(false);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showFieldPanel, setShowFieldPanel] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // ── Load saved views on mount ──
  useEffect(() => {
    if (onLoadViews) {
      onLoadViews().then(views => setSavedViews(views)).catch(() => {});
    }
  }, [onLoadViews]);

  // ── DnD handlers ──
  const handleDragStart = (e: DragStartEvent) => {
    setActiveDragId(e.active.id as string);
    const field = fields.find(f => f.key === e.active.id);
    setActiveDragField(field || null);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDragId(null);
    setActiveDragField(null);
    if (!e.over) return;
    const zoneId = e.over.id as 'rows' | 'columns' | 'values' | 'filters';
    const fieldKey = e.active.id as string;
    const field = fields.find(f => f.key === fieldKey);
    if (!field) return;

    // No duplicar
    const existing = config[zoneId].find(i => i.fieldKey === fieldKey);
    if (existing) return;

    const newItem: AnalyticsZoneItem = {
      fieldKey,
      label: field.label,
      ...(zoneId === 'values' && field.aggregatable ? { aggregation: 'sum' as AggregationFunction } : {}),
      ...(field.type === 'date' ? { dateGrouping: 'month' as DateGrouping } : {}),
    };

    setConfig(prev => ({ ...prev, [zoneId]: [...prev[zoneId], newItem] }));
  };

  const removeFromZone = (zone: 'rows' | 'columns' | 'values' | 'filters', index: number) => {
    setConfig(prev => ({ ...prev, [zone]: prev[zone].filter((_, i) => i !== index) }));
  };

  const updateAggregation = (index: number, fn: AggregationFunction) => {
    setConfig(prev => ({
      ...prev,
      values: prev.values.map((item, i) => i === index ? { ...item, aggregation: fn } : item),
    }));
  };

  const updateDateGrouping = (zone: 'rows' | 'columns', index: number, grouping: DateGrouping) => {
    setConfig(prev => ({
      ...prev,
      [zone]: prev[zone].map((item, i) => i === index ? { ...item, dateGrouping: grouping } : item),
    }));
  };

  const resetView = () => {
    setConfig({ rows: [], columns: [], values: [], filters: [], columnWidths: {}, hiddenColumns: [], sortConfig: [] });
    setActiveViewId(null);
  };

  // ── Filtering ──
  const filteredData = useMemo(() => {
    let result = data;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(row =>
        Object.values(row).some(v => String(v).toLowerCase().includes(q))
      );
    }
    return result;
  }, [data, search]);

  // ── Pivot computation ──
  const pivotResult = useMemo(() => {
    if (config.rows.length === 0 && config.values.length === 0) {
      return { rowGroups: [], columnKeys: [], flatRows: filteredData.map((d, i) => ({ _row: d, _key: String(i) })) };
    }

    // Group by row fields
    const rowGroups = new Map<string, { key: string; label: string; items: Record<string, unknown>[] }>();

    for (const row of filteredData) {
      const groupKey = config.rows.map(r => {
        const val = row[r.fieldKey];
        if (val && r.dateGrouping) {
          const d = new Date(val as string);
          return formatDateGroup(d, r.dateGrouping);
        }
        return String(val ?? '—');
      }).join(' › ');

      if (!rowGroups.has(groupKey)) {
        rowGroups.set(groupKey, { key: groupKey, label: groupKey, items: [] });
      }
      rowGroups.get(groupKey)!.items.push(row);
    }

    // Get column keys
    const columnKeys = new Set<string>();
    if (config.columns.length > 0) {
      for (const row of filteredData) {
        const colKey = config.columns.map(c => {
          const val = row[c.fieldKey];
          if (val && c.dateGrouping) {
            const d = new Date(val as string);
            return formatDateGroup(d, c.dateGrouping);
          }
          return String(val ?? '—');
        }).join(' › ');
        columnKeys.add(colKey);
      }
    }

    // Compute values
    const grandTotals: Record<string, number> = {};
    for (const vItem of config.values) {
      const allValues = filteredData.map(r => Number(r[vItem.fieldKey]) || 0);
      grandTotals[vItem.fieldKey] = aggregate(allValues, vItem.aggregation || 'sum');
    }

    const groupTotals = new Map<string, Record<string, number>>();
    const cellValues = new Map<string, Record<string, number>>();

    for (const [groupKey, group] of rowGroups) {
      const totals: Record<string, number> = {};
      for (const vItem of config.values) {
        const vals = group.items.map(r => Number(r[vItem.fieldKey]) || 0);
        totals[vItem.fieldKey] = aggregate(vals, vItem.aggregation || 'sum', undefined, grandTotals[vItem.fieldKey]);
      }
      groupTotals.set(groupKey, totals);

      // Per column
      if (columnKeys.size > 0) {
        for (const colKey of columnKeys) {
          const cellItems = group.items.filter(row => {
            const rowColKey = config.columns.map(c => {
              const val = row[c.fieldKey];
              if (val && c.dateGrouping) {
                const d = new Date(val as string);
                return formatDateGroup(d, c.dateGrouping);
              }
              return String(val ?? '—');
            }).join(' › ');
            return rowColKey === colKey;
          });
          const cellVals: Record<string, number> = {};
          for (const vItem of config.values) {
            const vals = cellItems.map(r => Number(r[vItem.fieldKey]) || 0);
            cellVals[vItem.fieldKey] = aggregate(vals, vItem.aggregation || 'sum', totals[vItem.fieldKey], grandTotals[vItem.fieldKey]);
          }
          cellValues.set(`${groupKey}||${colKey}`, cellVals);
        }
      }
    }

    return {
      rowGroups: Array.from(rowGroups.values()),
      columnKeys: Array.from(columnKeys).sort(),
      groupTotals,
      cellValues,
      grandTotals,
    };
  }, [filteredData, config]);

  // ── Save/Load views ──
  const handleSave = async () => {
    if (!viewName.trim() || !onSaveView) return;
    setIsLoading(true);
    try {
      await onSaveView({
        name: viewName,
        module: moduleName,
        store_id: storeId || null,
        config,
      });
      setShowSaveDialog(false);
      setViewName('');
      if (onLoadViews) {
        const views = await onLoadViews();
        setSavedViews(views);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadView = (view: SavedAnalyticsView) => {
    setConfig(view.config);
    setActiveViewId(view.id);
    setShowViewsList(false);
  };

  const handleDeleteView = async (viewId: string) => {
    if (!onDeleteView) return;
    await onDeleteView(viewId);
    setSavedViews(prev => prev.filter(v => v.id !== viewId));
    if (activeViewId === viewId) resetView();
  };

  const handleDuplicateView = () => {
    setViewName(`${title} (copia)`);
    setShowSaveDialog(true);
  };

  // ── Export ──
  const exportCSV = () => {
    const headers = config.rows.map(r => r.label).concat(config.values.map(v => v.label));
    const rows = pivotResult.rowGroups.map(g => {
      const totals = pivotResult.groupTotals?.get(g.key) || {};
      return config.rows.map(() => String(g.key)).concat(config.values.map(v => String(totals[v.fieldKey] ?? 0)));
    });
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const exportExcel = async () => {
    const XLSX = await import('@e965/xlsx');
    const headers = config.rows.map(r => r.label).concat(config.values.map(v => v.label));
    const rows = pivotResult.rowGroups.map(g => {
      const totals = pivotResult.groupTotals?.get(g.key) || {};
      return [...config.rows.map(() => String(g.key)), ...config.values.map(v => String(totals[v.fieldKey] ?? 0))];
    });
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Análisis');
    XLSX.writeFile(wb, `${title.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.xlsx`);
    setShowExportMenu(false);
  };

  const handlePrint = () => {
    window.print();
    setShowExportMenu(false);
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const allExpanded = pivotResult.rowGroups.length > 0 && pivotResult.rowGroups.every(g => expandedGroups.has(g.key));

  // ── Render ──
  const availableFields = fields.filter(f =>
    !config.rows.some(r => r.fieldKey === f.key) &&
    !config.columns.some(c => c.fieldKey === f.key) &&
    !config.values.some(v => v.fieldKey === f.key)
  );

  return (
    <div className={cn('flex flex-col h-full bg-background', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-3 min-w-0">
          <BarChart3 className="w-5 h-5 text-primary shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-black uppercase tracking-tight truncate">{title}</h2>
            {description && <p className="text-[10px] text-muted-foreground truncate">{description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar…"
              className="h-8 w-40 pl-8 text-xs"
            />
          </div>
          <Button variant="ghost" size="sm" className="h-8" onClick={() => setShowFieldPanel(!showFieldPanel)}>
            <Settings2 className="w-3.5 h-3.5" />
          </Button>
          {onSaveView && (
            <Button variant="ghost" size="sm" className="h-8" onClick={() => setShowSaveDialog(true)} disabled={isLoading}>
              <Save className="w-3.5 h-3.5" />
            </Button>
          )}
          {onLoadViews && savedViews.length > 0 && (
            <Button variant="ghost" size="sm" className="h-8" onClick={() => setShowViewsList(!showViewsList)}>
              <FolderOpen className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-8" onClick={() => setShowExportMenu(!showExportMenu)}>
            <Download className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8" onClick={resetView}>
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Export menu */}
      {showExportMenu && (
        <div className="absolute right-4 top-14 z-50 rounded-xl border border-border bg-card shadow-2xl p-1.5 space-y-0.5">
          <button onClick={exportExcel} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted text-xs font-medium">
            <FileSpreadsheet className="w-3.5 h-3.5 text-green-600" /> Excel
          </button>
          <button onClick={exportCSV} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted text-xs font-medium">
            <FileText className="w-3.5 h-3.5 text-blue-600" /> CSV
          </button>
          <button onClick={handlePrint} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted text-xs font-medium">
            <Printer className="w-3.5 h-3.3 text-muted-foreground" /> Imprimir
          </button>
        </div>
      )}

      {/* Save dialog */}
      {showSaveDialog && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowSaveDialog(false)}>
          <Card className="w-80 p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-black uppercase">Guardar vista</h3>
            <Input value={viewName} onChange={e => setViewName(e.target.value)} placeholder="Nombre de la vista" className="h-9" />
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={handleSave} disabled={!viewName.trim() || isLoading}>Guardar</Button>
              <Button size="sm" variant="outline" onClick={() => setShowSaveDialog(false)}>Cancelar</Button>
            </div>
          </Card>
        </div>
      )}

      {/* Saved views list */}
      {showViewsList && (
        <div className="absolute right-4 top-14 z-50 w-64 rounded-xl border border-border bg-card shadow-2xl p-2 max-h-80 overflow-y-auto">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2 px-1">Vistas guardadas</p>
          {savedViews.map(v => (
            <div key={v.id} className="group flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-muted cursor-pointer" onClick={() => handleLoadView(v)}>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{v.name}</p>
                <p className="text-[9px] text-muted-foreground">{v.module}</p>
              </div>
              <button onClick={(e) => { e.stopPropagation(); handleDeleteView(v.id); }} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Body: field panel + pivot table */}
      <div className="flex flex-1 min-h-0">
        {/* Field panel */}
        {showFieldPanel && (
          <div className="w-52 shrink-0 border-r border-border bg-card/30 p-3 overflow-y-auto">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Campos disponibles</p>
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <div className="space-y-1">
                {availableFields.map(field => (
                  <div
                    key={field.key}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-card border border-border text-xs font-medium cursor-grab hover:border-primary/30 hover:bg-primary/5 transition-colors"
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: field.type === 'number' ? '#3b82f6' : field.type === 'date' ? '#f59e0b' : '#10b981' }} />
                    <span className="truncate">{field.label}</span>
                  </div>
                ))}
                {availableFields.length === 0 && (
                  <p className="text-[10px] text-muted-foreground/50 italic">Todos los campos están en uso</p>
                )}
              </div>

              {/* Drop zones */}
              <div className="mt-3 space-y-2">
                <DropZone
                  id="rows" label="Filas" items={config.rows}
                  onRemove={(i) => removeFromZone('rows', i)}
                  onDateGroupingChange={(i, g) => updateDateGrouping('rows', i, g)}
                  accentColor="text-blue-600 dark:text-blue-400"
                />
                <DropZone
                  id="columns" label="Columnas" items={config.columns}
                  onRemove={(i) => removeFromZone('columns', i)}
                  onDateGroupingChange={(i, g) => updateDateGrouping('columns', i, g)}
                  accentColor="text-purple-600 dark:text-purple-400"
                />
                <DropZone
                  id="values" label="Valores" items={config.values}
                  onRemove={(i) => removeFromZone('values', i)}
                  onAggregationChange={updateAggregation}
                  accentColor="text-emerald-600 dark:text-emerald-400"
                />
                <DropZone
                  id="filters" label="Filtros" items={config.filters as unknown as AnalyticsZoneItem[]}
                  onRemove={(i) => removeFromZone('filters', i)}
                  accentColor="text-amber-600 dark:text-amber-400"
                />
              </div>

              <DragOverlay>
                {activeDragField && (
                  <div className="px-2 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium shadow-lg">
                    {activeDragField.label}
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          </div>
        )}

        {/* Pivot table */}
        <div className="flex-1 min-w-0 overflow-auto">
          {config.rows.length === 0 && config.values.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <BarChart3 className="w-12 h-12 opacity-20" />
              <p className="text-sm font-medium">Arrastra campos a Filas y Valores para comenzar</p>
              <p className="text-xs text-muted-foreground/60">El análisis se construye en tiempo real</p>
            </div>
          ) : pivotResult.rowGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
              <Search className="w-8 h-8 opacity-20" />
              <p className="text-sm">No hay datos para los filtros actuales</p>
            </div>
          ) : (
            <table className="w-full text-xs">
              {/* Header */}
              <thead className="sticky top-0 z-10 bg-card border-b border-border">
                <tr>
                  <th className="text-left px-3 py-2 font-black uppercase tracking-widest text-[10px] text-muted-foreground min-w-[200px]">
                    <button onClick={() => {
                      if (allExpanded) setExpandedGroups(new Set());
                      else setExpandedGroups(new Set(pivotResult.rowGroups.map(g => g.key)));
                    }} className="inline-flex items-center gap-1 hover:text-foreground">
                      {allExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      {config.rows.map(r => r.label).join(' / ') || 'Grupo'}
                    </button>
                  </th>
                  {pivotResult.columnKeys.length > 0 ? (
                    pivotResult.columnKeys.map(col => (
                      <th key={col} className="text-right px-3 py-2 font-black uppercase tracking-widest text-[10px] text-muted-foreground whitespace-nowrap">
                        {col}
                      </th>
                    ))
                  ) : (
                    config.values.map(v => (
                      <th key={v.fieldKey} className="text-right px-3 py-2 font-black uppercase tracking-widest text-[10px] text-muted-foreground whitespace-nowrap">
                        {v.label}
                        {v.aggregation && <span className="text-[8px] block text-muted-foreground/60">{AGGREGATION_LABELS[v.aggregation]}</span>}
                      </th>
                    ))
                  )}
                </tr>
              </thead>
              {/* Body */}
              <tbody>
                {pivotResult.rowGroups.map(group => {
                  const isExpanded = expandedGroups.has(group.key);
                  const totals = pivotResult.groupTotals?.get(group.key) || {};
                  return (
                    <React.Fragment key={group.key}>
                      <tr className="border-b border-border/50 hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium">
                          <button onClick={() => toggleGroup(group.key)} className="inline-flex items-center gap-1">
                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            {group.label}
                          </button>
                          <Badge variant="secondary" className="ml-2 h-4 text-[9px]">{group.items.length}</Badge>
                        </td>
                        {pivotResult.columnKeys.length > 0 ? (
                          pivotResult.columnKeys.map(col => {
                            const cell = pivotResult.cellValues?.get(`${group.key}||${col}`) || {};
                            return (
                              <td key={col} className="text-right px-3 py-2 font-mono tabular-nums">
                                {config.values.map(v => formatValue(cell[v.fieldKey] ?? 0, v.fieldKey, fields)).join(' / ')}
                              </td>
                            );
                          })
                        ) : (
                          config.values.map(v => (
                            <td key={v.fieldKey} className="text-right px-3 py-2 font-mono tabular-nums">
                              {formatValue(totals[v.fieldKey] ?? 0, v.fieldKey, fields)}
                            </td>
                          ))
                        )}
                      </tr>
                      {/* Detail rows when expanded */}
                      {isExpanded && group.items.slice(0, 100).map((item, i) => (
                        <tr key={`${group.key}-${i}`} className="border-b border-border/20 bg-muted/10">
                          <td className="px-3 py-1.5 pl-8 text-muted-foreground text-[11px]">
                            {config.rows.map(r => String(item[r.fieldKey] ?? '—')).join(' / ')}
                          </td>
                          {pivotResult.columnKeys.length > 0 ? (
                            pivotResult.columnKeys.map(col => (
                              <td key={col} className="text-right px-3 py-1.5 font-mono tabular-nums text-[11px] text-muted-foreground">
                                {config.values.map(v => formatValue(Number(item[v.fieldKey]) || 0, v.fieldKey, fields)).join(' / ')}
                              </td>
                            ))
                          ) : (
                            config.values.map(v => (
                              <td key={v.fieldKey} className="text-right px-3 py-1.5 font-mono tabular-nums text-[11px] text-muted-foreground">
                                {formatValue(Number(item[v.fieldKey]) || 0, v.fieldKey, fields)}
                              </td>
                            ))
                          )}
                        </tr>
                      ))}
                      {isExpanded && group.items.length > 100 && (
                        <tr className="bg-muted/10">
                          <td colSpan={Math.max(pivotResult.columnKeys.length, config.values.length) + 1} className="px-3 py-1 text-center text-[10px] text-muted-foreground italic">
                            Mostrando 100 de {group.items.length} registros
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {/* Grand total */}
                {pivotResult.grandTotals && Object.keys(pivotResult.grandTotals).length > 0 && (
                  <tr className="border-t-2 border-border bg-muted/50 font-black sticky bottom-0">
                    <td className="px-3 py-2 uppercase text-[10px] tracking-widest">Total General</td>
                    {pivotResult.columnKeys.length > 0 ? (
                      pivotResult.columnKeys.map(col => (
                        <td key={col} className="text-right px-3 py-2 font-mono tabular-nums">
                          —
                        </td>
                      ))
                    ) : (
                      config.values.map(v => (
                        <td key={v.fieldKey} className="text-right px-3 py-2 font-mono tabular-nums">
                          {formatValue(pivotResult.grandTotals[v.fieldKey] ?? 0, v.fieldKey, fields)}
                        </td>
                      ))
                    )}
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-border bg-card/50 text-[10px] text-muted-foreground">
        <span>{filteredData.length.toLocaleString()} registros · {pivotResult.rowGroups.length} grupos</span>
        <span>{fields.length} campos · {config.values.length} valores</span>
      </div>
    </div>
  );
}

// ── Helpers ──

function formatValue(value: number, fieldKey: string, fields: AnalyticsField[]): string {
  const field = fields.find(f => f.key === fieldKey);
  if (!field) return String(value);

  switch (field.format) {
    case 'currency':
      return new Intl.NumberFormat('es-CU', { style: 'currency', currency: field.currency || 'CUP', minimumFractionDigits: 2 }).format(value);
    case 'percent':
      return `${value.toFixed(1)}%`;
    case 'number':
      return new Intl.NumberFormat('es-CU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    case 'date':
      return new Date(value).toLocaleDateString('es-CU');
    default:
      return new Intl.NumberFormat('es-CU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  }
}

export default DynamicAnalyticsCenter;
