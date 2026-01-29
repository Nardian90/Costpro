
'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ReportType, ReportDefinition } from '@/types';

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
];

export const ReportConfigPanel = ({ config, setConfig }: ReportConfigPanelProps) => {
  const handleTypeChange = (type: ReportType) => {
    let columns: string[] = [];
    switch (type) {
      case 'sales': columns = ['id', 'created_at', 'total_amount', 'status', 'payment_method']; break;
      case 'profit': columns = ['id', 'created_at', 'total_amount', 'subtotal', 'discount_value']; break;
      case 'inventory': columns = ['id', 'name', 'sku', 'stock_current', 'price', 'cost_price']; break;
      case 'audit': columns = ['created_at', 'action', 'table_name', 'store_name', 'profile']; break;
      case 'kardex': columns = ['created_at', 'movement_type', 'quantity_change', 'balance_after', 'unit_cost']; break;
      case 'purchases': columns = ['id', 'created_at', 'supplier', 'total_cost', 'status', 'reference_doc']; break;
      default: columns = ['id', 'created_at'];
    }
    setConfig({ ...config, type, columns });
  };

  return (
    <Card className="p-6 rounded-3xl border-primary/10 bg-card/50 backdrop-blur-sm space-y-6">
      <div className="space-y-4">
        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary/60">Configuración Base</h3>

        <div className="space-y-2">
          <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Nombre del Reporte</Label>
          <Input
            value={config.name}
            onChange={(e) => setConfig({ ...config, name: e.target.value })}
            className="rounded-xl border-primary/10 bg-background/50 text-xs font-bold"
            placeholder="Ej: Ventas Mensuales Feb"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Tipo de Reporte</Label>
          <Select value={config.type} onValueChange={(val) => handleTypeChange(val as ReportType)}>
            <SelectTrigger className="rounded-xl border-primary/10 bg-background/50 text-xs font-bold uppercase tracking-widest">
              <SelectValue placeholder="Seleccionar tipo" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-primary/10">
              {REPORT_TYPES.map(t => (
                <SelectItem key={t.id} value={t.id} className="text-[10px] font-bold uppercase tracking-widest">
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary/60">Periodo</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Desde</Label>
            <Input
              type="date"
              value={config.date_range?.from}
              onChange={(e) => setConfig({ ...config, date_range: { ...config.date_range!, from: e.target.value } })}
              className="rounded-xl border-primary/10 bg-background/50 text-[10px] font-bold"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Hasta</Label>
            <Input
              type="date"
              value={config.date_range?.to}
              onChange={(e) => setConfig({ ...config, date_range: { ...config.date_range!, to: e.target.value } })}
              className="rounded-xl border-primary/10 bg-background/50 text-[10px] font-bold"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary/60">Formato</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Orientación</Label>
            <Select
                value={config.layout?.orientation || 'portrait'}
                onValueChange={(val) => setConfig({ ...config, layout: { ...config.layout, orientation: val } })}
            >
              <SelectTrigger className="rounded-xl border-primary/10 bg-background/50 text-[10px] font-bold uppercase tracking-widest">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-primary/10">
                <SelectItem value="portrait" className="text-[10px] font-bold uppercase">Vertical</SelectItem>
                <SelectItem value="landscape" className="text-[10px] font-bold uppercase">Horizontal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Tamaño</Label>
            <Select
                value={config.layout?.format || 'a4'}
                onValueChange={(val) => setConfig({ ...config, layout: { ...config.layout, format: val } })}
            >
              <SelectTrigger className="rounded-xl border-primary/10 bg-background/50 text-[10px] font-bold uppercase tracking-widest">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-primary/10">
                <SelectItem value="a4" className="text-[10px] font-bold uppercase">A4</SelectItem>
                <SelectItem value="letter" className="text-[10px] font-bold uppercase">Carta</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </Card>
  );
};
