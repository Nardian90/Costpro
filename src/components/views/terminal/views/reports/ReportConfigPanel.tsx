'use client';


import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ReportType, ReportDefinition } from '@/types';
import { useProducts, useSuspenseProducts } from '@/hooks/api/useProducts';
import { useAuthStore } from '@/store';
import { useStores } from '@/hooks/api/useStores';
import { Search, Package, Check, ChevronsUpDown, Filter, Store as StoreIcon, Tag } from 'lucide-react';
import { COLUMN_LABELS } from '@/contracts/reports';
import { cn } from '@/lib/utils';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
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
];

const ALL_COLUMNS: Record<ReportType, string[]> = {
  sales: ['id', 'created_at', 'total_amount', 'status', 'payment_method', 'subtotal', 'discount_value'],
  profit: ['id', 'created_at', 'total_amount', 'subtotal', 'discount_value', 'profit', 'margin_percentage'],
  inventory: ['id', 'name', 'sku', 'stock_current', 'price', 'cost_price', 'supplier'],
  kardex: ['created_at', 'movement_type', 'quantity_change', 'balance_after', 'unit_cost', 'reference_doc'],
  purchases: ['id', 'created_at', 'supplier', 'total_cost', 'status', 'reference_doc', 'notes'],
  audit: ['created_at', 'action', 'table_name', 'store_name', 'profile'],
  cost_sheet: ['id', 'created_at', 'name', 'code', 'total_cost'],
  daily_income: ['date', 'total_income'],
  daily_expenses: ['date', 'total_expenses']
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

  // Extract unique categories from products for the filter
  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean))) as string[];

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
            className="rounded-xl border-primary/10 bg-background/50 text-xs font-bold"
            placeholder="Ej: Ventas Mensuales Feb"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Tipo de Reporte</Label>
          <Select value={config.type} onValueChange={(val) => handleTypeChange(val as ReportType)}>
            <SelectTrigger className="rounded-xl border-primary/10 bg-background/50 text-xs font-bold uppercase tracking-widest">
              <SelectValue placeholder="Seleccionar tipo" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-primary/10">
              {REPORT_TYPES.map(t => (
                <SelectItem key={t.id} value={t.id} className="text-xs font-bold uppercase tracking-widest">
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {(isAdmin || isEncargado) && (
           <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
             <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
               <StoreIcon className="w-3 h-3" />
               Almacén / Tienda
             </Label>
             <Select
                value={config.store_id || user?.activeStoreId || 'none'}
                onValueChange={(val) => setConfig({ ...config, store_id: val })}
             >
                <SelectTrigger className="rounded-xl border-primary/10 bg-background/50 text-xs font-bold uppercase">
                    <SelectValue placeholder="Seleccionar tienda" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-primary/10">
                    {stores.map(s => (
                        <SelectItem key={s.id} value={s.id} className="text-xs font-bold uppercase">{s.name}</SelectItem>
                    ))}
                </SelectContent>
             </Select>
           </div>
        )}

        {(config.type === 'inventory' || config.type === 'sales') && (
          <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
             <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
               <Tag className="w-3 h-3" />
               Filtrar por Categoría
             </Label>
             <Select
                value={config.filters?.category || 'all'}
                onValueChange={(val) => setConfig({
                    ...config,
                    filters: { ...config.filters, category: val === 'all' ? undefined : val }
                })}
             >
                <SelectTrigger className="rounded-xl border-primary/10 bg-background/50 text-xs font-bold uppercase">
                    <SelectValue placeholder="Todas las categorías" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-primary/10">
                    <SelectItem value="all" className="text-xs font-bold uppercase">Todas</SelectItem>
                    {categories.map(cat => (
                        <SelectItem key={cat} value={cat} className="text-xs font-bold uppercase">{cat}</SelectItem>
                    ))}
                </SelectContent>
             </Select>
          </div>
        )}

        {config.type === 'kardex' && (
          <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
            <Label className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
              <Package className="w-3 h-3" />
              Producto (Obligatorio para Kardex)
            </Label>
            <Popover open={isProductPopoverOpen} onOpenChange={setIsProductPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={isProductPopoverOpen}
                  className="w-full justify-between rounded-xl border-primary/20 bg-background/50 text-xs font-bold uppercase tracking-widest"
                >
                  {config.filters?.product_id
                    ? products.find((p) => p.id === config.filters?.product_id)?.name || "Cargando..."
                    : "Seleccionar producto..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Buscar producto..."
                    value={productSearch}
                    onValueChange={setProductSearch}
                  />
                  <CommandList>
                    <CommandEmpty>No se encontraron productos.</CommandEmpty>
                    <CommandGroup>
                      {products.map((product) => (
                        <CommandItem
                          key={product.id}
                          value={product.id}
                          onSelect={() => {
                            setConfig({
                              ...config,
                              filters: { ...config.filters, product_id: product.id }
                            });
                            setIsProductPopoverOpen(false);
                          }}
                          className="text-xs font-bold uppercase"
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              config.filters?.product_id === product.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <div className="flex flex-col">
                             <span>{product.name}</span>
                             <span className="text-xs text-muted-foreground">{product.sku}</span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary/60">Periodo</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Desde</Label>
            <Input
              type="date"
              value={config.date_range?.from}
              onChange={(e) => setConfig({ ...config, date_range: { ...config.date_range!, from: e.target.value } })}
              className="rounded-xl border-primary/10 bg-background/50 text-xs font-bold"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Hasta</Label>
            <Input
              type="date"
              value={config.date_range?.to}
              onChange={(e) => setConfig({ ...config, date_range: { ...config.date_range!, to: e.target.value } })}
              className="rounded-xl border-primary/10 bg-background/50 text-xs font-bold"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary/60">Formato</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Orientación</Label>
            <Select
                value={config.layout?.orientation || 'portrait'}
                onValueChange={(val) => setConfig({ ...config, layout: { ...config.layout, orientation: val } })}
            >
              <SelectTrigger className="rounded-xl border-primary/10 bg-background/50 text-xs font-bold uppercase tracking-widest">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-primary/10">
                <SelectItem value="portrait" className="text-xs font-bold uppercase">Vertical</SelectItem>
                <SelectItem value="landscape" className="text-xs font-bold uppercase">Horizontal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Tamaño</Label>
            <Select
                value={config.layout?.format || 'a4'}
                onValueChange={(val) => setConfig({ ...config, layout: { ...config.layout, format: val } })}
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
