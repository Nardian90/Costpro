'use client';

import React, { useState } from 'react';
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuthStore } from '@/store';
import { ReportDefinition, ReportType } from '@/types';
import { ReportDateRange } from '@/services/report-service';
import { useProducts } from '@/hooks/api/useProducts';
import { useStores } from '@/hooks/api/useStores';
import { Search, Info, AlertTriangle, CheckSquare, Square } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from '@/components/ui/button';
import { useReportValidation } from '@/hooks/ui/useReportValidation';
import { differenceInDays, parseISO, isValid } from 'date-fns';

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

const ALL_COLUMNS: Record<string, string[]> = {
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

const COLUMN_LABELS: Record<string, string> = {
  id: 'ID',
  created_at: 'Fecha',
  total_amount: 'Monto Total',
  payment_method: 'Método Pago',
  status: 'Estado',
  customer_name: 'Cliente',
  cashier_name: 'Cajero',
  name: 'Nombre',
  sku: 'SKU',
  stock: 'Stock',
  category: 'Categoría',
  price: 'Precio',
  cost: 'Costo',
  total_sales: 'Total Ventas',
  total_cost: 'Total Costo',
  profit: 'Utilidad',
  margin_percentage: 'Margen %',
  stock_current: 'Stock Actual',
  cost_price: 'Precio Costo',
  supplier: 'Proveedor',
  movement_type: 'Tipo Movimiento',
  quantity_change: 'Cantidad',
  balance_after: 'Saldo Final',
  unit_cost: 'Costo Unitario',
  reference_doc: 'Doc. Referencia',
  notes: 'Notas',
  action: 'Acción',
  table_name: 'Tabla',
  store_name: 'Tienda',
  profile: 'Perfil',
  code: 'Código',
  date: 'Fecha',
  total_income: 'Total Ingresos',
  total_expenses: 'Total Gastos',
  origin_store_name: 'Tienda Origen',
  destination_store_name: 'Tienda Destino',
  creator_name: 'Creador',
  operator_name: 'Operador',
  declared_cash: 'Efectivo Declarado',
  declared_vouchers: 'Vales Declarados',
  system_total: 'Total Sistema',
  difference: 'Diferencia'
};

export const ReportConfigPanel = ({ config, setConfig }: ReportConfigPanelProps) => {
  const { user } = useAuthStore();
  const [productSearch, setProductSearch] = useState('');
  const [isProductPopoverOpen, setIsProductPopoverOpen] = useState(false);

  const { isInvalidDateRange } = useReportValidation(config);

  const isAdmin = user?.role === 'admin';
  const isEncargado = user?.role === 'encargado';

  const { data: products = [] } = useProducts(
    config.store_id || user?.activeStoreId,
    productSearch
  );

  const { data: stores = [] } = useStores(user?.id || '', isAdmin, isEncargado);

  const handleTypeChange = (type: ReportType) => {
    setConfig({ ...config, type, columns: ALL_COLUMNS[type] || ['id', 'created_at'] });
  };

  const toggleColumn = (col: string) => {
    const currentColumns = config.columns || [];
    if (currentColumns.includes(col)) {
      setConfig({ ...config, columns: currentColumns.filter(c => c !== col) });
    } else {
      setConfig({ ...config, columns: [...currentColumns, col] });
    }
  };

  const selectAllColumns = () => {
    setConfig({ ...config, columns: ALL_COLUMNS[config.type as ReportType] || [] });
  };

  const deselectAllColumns = () => {
    setConfig({ ...config, columns: [] });
  };

  const dateFrom = config.date_range?.from;
  const dateTo = config.date_range?.to;
  let dayCount = 0;
  if (dateFrom && dateTo) {
    const from = parseISO(dateFrom);
    const to = parseISO(dateTo);
    if (isValid(from) && isValid(to)) {
      dayCount = Math.abs(differenceInDays(to, from)) + 1;
    }
  }

  return (
    <Card className="p-4 sm:p-6 rounded-3xl border-primary/10 bg-card/50 backdrop-blur-sm space-y-6">
      <div className="space-y-4">
        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary/60">Configuración Base</h3>

        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Nombre del Reporte</Label>
          <Input
            value={config.name}
            onChange={(e) => setConfig({ ...config, name: e.target.value })}
            placeholder="Ej: Reporte Mensual de Ventas"
            className="rounded-xl border-primary/10 bg-background/50 text-xs font-bold"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Tipo de Reporte</Label>
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
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Tienda</Label>
            <Select
              value={config.store_id || user?.activeStoreId || ''}
              onValueChange={(val) => setConfig({ ...config, store_id: val })}
            >
              <SelectTrigger className="rounded-xl border-primary/10 bg-background/50 text-xs font-bold uppercase tracking-widest">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-primary/10">
                {stores.map((s: any) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs font-bold uppercase">
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Desde</Label>
            <Input
              type="date"
              value={config.date_range?.from}
              onChange={(e) => setConfig({
                ...config,
                date_range: { ...config.date_range, from: e.target.value } as any
              })}
              className="rounded-xl border-primary/10 bg-background/50 text-xs font-bold"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Hasta</Label>
            <Input
              type="date"
              value={config.date_range?.to}
              onChange={(e) => setConfig({
                ...config,
                date_range: { ...config.date_range, to: e.target.value } as any
              })}
              className="rounded-xl border-primary/10 bg-background/50 text-xs font-bold"
            />
          </div>
        </div>

        {isInvalidDateRange && (
          <div className="flex items-center gap-2 text-destructive text-[10px] font-bold uppercase animate-pulse">
            <AlertTriangle className="w-3 h-3" />
            "Desde" no puede ser posterior a "Hasta"
          </div>
        )}

        {!isInvalidDateRange && dayCount > 0 && (
          <div className="flex items-center gap-2 text-primary/60 text-[10px] font-bold uppercase">
            <Info className="w-3 h-3" />
            {dayCount} días seleccionados
          </div>
        )}

        {config.type === 'kardex' && (
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Producto (Kardex)</Label>
            <Popover open={isProductPopoverOpen} onOpenChange={setIsProductPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start rounded-xl border-primary/10 bg-background/50 text-xs font-bold uppercase"
                >
                  <Search className="mr-2 h-4 w-4" />
                  {config.filters?.product_id
                    ? products.find((p: any) => p.id === config.filters?.product_id)?.name || 'Seleccionar Producto'
                    : 'Seleccionar Producto'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <div className="flex items-center border-b p-2">
                  <Search className="mr-2 h-4 w-4 opacity-50" />
                  <Input
                    placeholder="Buscar producto..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="border-none focus-visible:ring-0 text-xs"
                  />
                </div>
                <div className="max-h-60 overflow-y-auto p-1">
                    {products.map((p: any) => (
                      <Button
                        key={p.id}
                        variant="ghost"
                        className="w-full justify-start text-left text-xs font-bold uppercase"
                        onClick={() => {
                          setConfig({
                            ...config,
                            filters: { ...config.filters, product_id: p.id }
                          });
                          setIsProductPopoverOpen(false);
                        }}
                      >
                        {p.name} ({p.sku})
                      </Button>
                    ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Formato</Label>
            <Select
                value={config.format || 'a4'}
                onValueChange={(val) => setConfig({ ...config, format: val as any })}
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

      <div className="space-y-4">
        <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary/60">Columnas</h3>
            <div className="flex gap-2">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={selectAllColumns}
                    className="h-7 px-2 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/10 rounded-lg"
                >
                    <CheckSquare className="w-3 h-3 mr-1" /> Todas
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={deselectAllColumns}
                    className="h-7 px-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:bg-muted/10 rounded-lg"
                >
                    <Square className="w-3 h-3 mr-1" /> Deseleccionar
                </Button>
            </div>
        </div>
        <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                {config.columns?.length || 0}/{(ALL_COLUMNS[config.type as ReportType] || []).length}
            </span>
        </div>
        <div className="grid grid-cols-2 gap-y-3 gap-x-4 p-4 rounded-2xl bg-background/50 border border-primary/5">
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
