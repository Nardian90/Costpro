import React, { useState, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store';
import { useProducts } from '@/hooks/api/useProducts';
import { useStores } from '@/hooks/api/useStores';
import { Product, ReportDefinition, ReportType, Store } from '@/types';
import { COLUMN_LABELS } from '@/contracts/reports';
import { Search, CalendarDays, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface ReportConfigPanelProps {
  config: Partial<ReportDefinition>;
  setConfig: (config: Partial<ReportDefinition>) => void;
}

const REPORT_TYPES = [
  { id: 'sales', label: 'Ventas' },
  { id: 'profit', label: 'Utilidad / Margen' },
  { id: 'inventory', label: 'Inventario' },
  { id: 'kardex', label: 'Kardex (Movimientos)' },
  { id: 'purchases', label: 'Compras / Recepciones' },
  { id: 'audit', label: 'Auditoría / Logs' },
  { id: 'cost_sheet', label: 'Ficha de Costo' },
  { id: 'daily_income', label: 'Ingresos por Día' },
  { id: 'daily_expenses', label: 'Gastos/Costos por Día' },
  { id: 'transfer', label: 'Transferencias' },
  { id: 'cash', label: 'Arqueo de Caja' },
];

const ALL_COLUMNS: Record<ReportType, string[]> = {
  sales: ['id', 'created_at', 'total_amount', 'status', 'payment_method', 'subtotal', 'discount_value'],
  profit: ['date', 'total_sales', 'total_cost', 'profit', 'margin_percentage'],
  inventory: ['id', 'name', 'sku', 'stock_current', 'price', 'cost_price', 'supplier'],
  kardex: ['created_at', 'movement_type', 'quantity_change', 'balance_after', 'unit_cost', 'reference_doc'],
  purchases: ['id', 'created_at', 'supplier', 'total_cost', 'status', 'reference_doc', 'notes'],
  audit: ['created_at', 'action', 'table_name', 'store_name', 'profile'],
  cost_sheet: ['id', 'created_at', 'name', 'code', 'total_cost'],
  daily_income: ['date', 'total_income'],
  daily_expenses: ['date', 'total_expenses'],
  transfer: ['id', 'created_at', 'origin_store_name', 'destination_store_name', 'creator_name', 'status'],
  cash: ['id', 'created_at', 'operator_name', 'declared_cash', 'declared_vouchers', 'system_total', 'difference', 'status']
};

/** Virtualized product list for Kardex Popover — uses @tanstack/react-virtual */
function ProductVirtualList({
  products,
  isLoading,
  onSelect,
}: {
  products: Product[];
  isLoading: boolean;
  onSelect: (product: { id: string; name: string; sku: string }) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: products.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 8,
  });

  if (isLoading) {
    return (
      <div className="p-4 text-center text-xs text-muted-foreground">Cargando productos...</div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="p-4 text-center text-xs text-muted-foreground">No se encontraron productos</div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="max-h-60 overflow-y-auto p-1"
      style={{ contain: 'strict' }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const p = products[virtualRow.index];
          return (
            <Button
              key={p.id}
              type="button"
              variant="ghost"
              className="w-full justify-start text-left text-xs font-bold uppercase absolute top-0 left-0 h-[36px]"
              style={{
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
              onClick={() => onSelect({ id: p.id, name: p.name, sku: p.sku ?? '' })}
            >
              {p.name} ({p.sku})
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export const ReportConfigPanel = ({ config, setConfig }: ReportConfigPanelProps) => {
  // ── ARIA section IDs for accessibility (4.4) ──
  const baseId = React.useId();
  const baseSectionId = `${baseId}-base`;
  const columnsSectionId = `${baseId}-columns`;
  const { user } = useAuthStore();
  const [productSearch, setProductSearch] = useState('');
  const [isProductPopoverOpen, setIsProductPopoverOpen] = useState(false);

  // Audit-Fix #5b: helper para formatear Date → YYYY-MM-DD (formato de <input type="date">).
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  // ── Date range validation ──
  const dateRangeError = useMemo(() => {
    const { from, to } = config.date_range || {};
    return !!(from && to && from > to);
  }, [config.date_range]);

  const dateRangeLabel = useMemo(() => {
    const { from, to } = config.date_range || {};
    if (!from || !to) return '';
    const days = Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return `${days} día${days !== 1 ? 's' : ''} seleccionados`;
  }, [config.date_range]);

  // ── Column helpers ──
  const isAdmin = user?.role === 'admin';
  const isEncargado = user?.role === 'encargado';

  const { data: products = [], isLoading: isLoadingProducts } = useProducts(
    config.store_id || user?.activeStoreId,
    productSearch
  );

  const { data: stores = [] } = useStores(user?.id || '', isAdmin, isEncargado);

  const handleTypeChange = (type: ReportType) => {
    setConfig({ ...config, type, columns: ALL_COLUMNS[type] || ['id', 'created_at'] });
  };

  const toggleColumn = (col: string) => {
    const currentColumns = config.columns || [];
    setConfig({ ...config, columns: currentColumns.includes(col) ? currentColumns.filter(c => c !== col) : [...currentColumns, col] });
  };

  const selectAllColumns = () => {
    const all = ALL_COLUMNS[config.type as ReportType] || [];
    setConfig({ ...config, columns: [...all] });
  };

  const deselectAllColumns = () => {
    setConfig({ ...config, columns: [] });
  };

  const currentTypeColumns = ALL_COLUMNS[config.type as ReportType] || [];
  const allSelected = currentTypeColumns.length > 0 && currentTypeColumns.every(c => config.columns?.includes(c));

  return (
    <Card className="p-4 sm:p-6 rounded-3xl border-primary/10 bg-card/50 backdrop-blur-sm space-y-6">
      <div className="space-y-4" role="group" aria-labelledby={baseSectionId}>
        <h3 id={baseSectionId} className="text-xs font-black uppercase tracking-[0.2em] text-primary/60">Configuración Base</h3>

        <div className="space-y-2">
          <Label htmlFor={`${baseId}-name`} className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Nombre del Reporte</Label>
          <Input
            value={config.name}
            onChange={(e) => setConfig({ ...config, name: e.target.value })}
            placeholder="Ej: Reporte Mensual de Ventas"
            className="rounded-xl border-primary/10 bg-background/50 text-xs font-bold"
            id={`${baseId}-name`}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor={`${baseId}-type`} className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Tipo de Reporte</Label>
            <Select value={config.type} onValueChange={(val) => handleTypeChange(val as ReportType)}>
              <SelectTrigger className="rounded-xl border-primary/10 bg-background/50 text-xs font-bold uppercase tracking-widest">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-primary/10">
                {REPORT_TYPES.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="text-xs font-bold uppercase">
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${baseId}-store`} className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Tienda</Label>
            <Select
              value={config.store_id || user?.activeStoreId}
              onValueChange={(val) => setConfig({ ...config, store_id: val })}
            >
              <SelectTrigger className="rounded-xl border-primary/10 bg-background/50 text-xs font-bold uppercase tracking-widest">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-primary/10">
                {stores.map((s: Store) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs font-bold uppercase">
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {config.type === 'kardex' && (
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Producto (Kardex)</Label>
            <span id={`${baseId}-kardex-desc`} className="sr-only">Selecciona un producto para generar el reporte de kardex</span>
            <Popover open={isProductPopoverOpen} onOpenChange={setIsProductPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start rounded-xl border-primary/10 bg-background/50 text-xs font-bold uppercase"
                  aria-describedby={`${baseId}-kardex-desc`}
                  aria-haspopup="listbox"
                  aria-expanded={isProductPopoverOpen}
                >
                  <Search className="mr-2 h-4 w-4" />
                  {config.filters?.product_id
                    ? products.find((p) => p.id === config.filters?.product_id)?.name || 'Seleccionar Producto'
                    : 'Seleccionar Producto'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[320px] p-0" align="start">
                <div className="flex items-center border-b p-2">
                  <Search className="mr-2 h-4 w-4 opacity-50" />
                  <Input
                    placeholder="Buscar producto..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="border-none focus-visible:ring-0 text-xs"
                  />
                </div>
                <ProductVirtualList
                  products={products}
                  isLoading={isLoadingProducts}
                  onSelect={(p) => {
                    setConfig({
                      ...config,
                      filters: { ...config.filters, product_id: p.id }
                    });
                    setIsProductPopoverOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>
        )}

        {/* ── Date Range ── */}
        {/* Audit-Fix #5: labels "Desde"/"Hasta" movidos encima de los inputs
            (antes estaban superpuestos con el icono de calendario nativo del input date).
            Audit-Fix #5b: añadidos presets rápidos (Hoy, Semana, Mes, Mes anterior)
            para que el usuario no tenga que seleccionar fechas manualmente cada vez. */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-3.5 h-3.5 text-primary/60" aria-hidden="true" />
              <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Rango de Fechas</Label>
            </div>
            {/* Presets rápidos */}
            <div className="flex items-center gap-1 flex-wrap">
              {([
                { id: 'today', label: 'Hoy', get: () => { const t = new Date(); return { from: fmt(t), to: fmt(t) }; } },
                { id: 'week', label: 'Semana', get: () => { const t = new Date(); const d = t.getDay() || 7; const monday = new Date(t); monday.setDate(t.getDate() - d + 1); return { from: fmt(monday), to: fmt(t) }; } },
                { id: 'month', label: 'Mes', get: () => { const t = new Date(); const first = new Date(t.getFullYear(), t.getMonth(), 1); return { from: fmt(first), to: fmt(t) }; } },
                { id: 'last-month', label: 'Mes anterior', get: () => { const t = new Date(); const first = new Date(t.getFullYear(), t.getMonth() - 1, 1); const last = new Date(t.getFullYear(), t.getMonth(), 0); return { from: fmt(first), to: fmt(last) }; } },
              ] as const).map(preset => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setConfig({ ...config, date_range: preset.get() })}
                  className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest text-primary/60 hover:text-primary hover:bg-primary/10 border border-primary/10 transition-all"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor={`${baseId}-from`} className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">Desde</Label>
              <Input
                type="date"
                value={config.date_range?.from || ''}
                onChange={(e) => setConfig({ ...config, date_range: { ...config.date_range, from: e.target.value, to: config.date_range?.to || '' } })}
                className="rounded-xl border-primary/10 bg-background/50 text-xs font-bold pl-3 w-full"
                max={config.date_range?.to || undefined}
                id={`${baseId}-from`}
                aria-label="Fecha de inicio"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${baseId}-to`} className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">Hasta</Label>
              <Input
                type="date"
                value={config.date_range?.to || ''}
                onChange={(e) => setConfig({ ...config, date_range: { ...config.date_range, from: config.date_range?.from || '', to: e.target.value } })}
                className={`rounded-xl border bg-background/50 text-xs font-bold pl-3 w-full ${dateRangeError ? 'border-destructive' : 'border-primary/10'}`}
                id={`${baseId}-to`}
                aria-label="Fecha de finalización"
                aria-invalid={dateRangeError || undefined}
                min={config.date_range?.from || undefined}
              />
            </div>
          </div>
          {dateRangeError && (
            <div className="flex items-center gap-2 text-destructive animate-in fade-in slide-in-from-top-1 duration-300" role="alert" aria-live="assertive">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <p className="text-[11px] font-bold">"Desde" no puede ser posterior a "Hasta"</p>
            </div>
          )}
          {!dateRangeError && config.date_range?.from && config.date_range?.to && (
            <div className="flex items-center gap-2 text-success">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <p className="text-[11px] font-bold">{dateRangeLabel}</p>
            </div>
          )}
        </div>

        {/* ── Format ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Formato</Label>
            <Select
                value={config.format || 'a4'}
                onValueChange={(val) => setConfig({ ...config, format: val as 'a4' | 'letter' })}
            >
              <SelectTrigger className="rounded-xl border-primary/10 bg-background/50 text-xs font-bold uppercase tracking-widest">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-primary/10">
                <SelectItem value="a4" className="text-xs font-bold uppercase">A4</SelectItem>
                <SelectItem value="letter" className="text-xs font-bold uppercase">Carta</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="space-y-4" role="group" aria-labelledby={columnsSectionId}>
        <div className="flex items-center justify-between">
            <h3 id={columnsSectionId} className="text-xs font-black uppercase tracking-[0.2em] text-primary/60">Columnas</h3>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={allSelected ? deselectAllColumns : selectAllColumns}
                className="h-6 px-2 text-[10px] font-bold uppercase tracking-widest text-primary/60 hover:text-primary hover:bg-primary/10"
              >
                {allSelected ? 'Deseleccionar' : 'Todas'}
              </Button>
              <span className="text-xs font-bold text-muted-foreground uppercase">
                {config.columns?.length || 0}/{currentTypeColumns.length}
              </span>
            </div>
        </div>
        <div className="grid grid-cols-2 gap-y-3 gap-x-4 p-4 rounded-2xl bg-background/50 border border-primary/5" role="group" aria-label="Seleccion de columnas">
            {(ALL_COLUMNS[config.type as ReportType] || []).map(col => (
                <div key={col} className="flex items-center space-x-2">
                    <Checkbox
                        id={`col-${col}`}
                        checked={config.columns?.includes(col)}
                        onCheckedChange={() => toggleColumn(col)}
                        className="rounded-md border-primary/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                    />
                    <Label
                        htmlFor={`col-${col}`}
                        className="text-xs font-bold uppercase tracking-tight cursor-pointer select-none break-words"
                    >
                        {COLUMN_LABELS[col] || col}
                    </Label>
                </div>
            ))}
        </div>
      </div>
    </Card>
  );
};
