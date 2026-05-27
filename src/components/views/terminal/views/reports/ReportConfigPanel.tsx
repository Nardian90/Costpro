import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuthStore } from '@/store';
import { useProducts } from '@/hooks/api/useProducts';
import { useStores } from '@/hooks/api/useStores';
import { ReportDefinition, ReportType } from '@/types';
import { COLUMN_LABELS } from '@/contracts/reports';
import { Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from '@/components/ui/button';

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

export const ReportConfigPanel = ({ config, setConfig }: ReportConfigPanelProps) => {
  const { user } = useAuthStore();
  const [productSearch, setProductSearch] = useState('');
  const [isProductPopoverOpen, setIsProductPopoverOpen] = useState(false);

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
    if (currentColumns.includes(col)) {
      setConfig({ ...config, columns: currentColumns.filter(c => c !== col) });
    } else {
      setConfig({ ...config, columns: [...currentColumns, col] });
    }
  };

  return (
    <Card className="p-6 rounded-3xl border-primary/10 bg-card/50 backdrop-blur-sm space-y-6">
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

        <div className="grid grid-cols-2 gap-4">
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
              value={config.store_id || user?.activeStoreId}
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
                  {isLoadingProducts ? (
                    <div className="p-2 text-center text-xs text-muted-foreground">Cargando...</div>
                  ) : (
                    products.map((p: any) => (
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
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
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
            <span className="text-xs font-bold text-muted-foreground uppercase">
                {config.columns?.length || 0} seleccionadas
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
                        className="text-xs font-bold uppercase tracking-tight cursor-pointer select-none"
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
