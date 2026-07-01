'use client';

import React, { useState } from 'react';
import { Plus, Trash2, Zap, ChevronRight, Settings2, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from 'sonner';

import { useTranslations } from 'next-intl';
interface QuickRow {
  id: string;
  product: string;
  um: string;
  quantity: number;
  cost: number;
  sale_price?: number;
}

interface CostSheetQuickModeProps {
  onGenerate: (rows: QuickRow[]) => void;
  mapping: { targetColumn: 'sale_price' | 'total_cost', modificationRow: string };
  onMappingChange: (mapping: { targetColumn: 'sale_price' | 'total_cost'; modificationRow: string }) => void;
}

export const CostSheetQuickMode: React.FC<CostSheetQuickModeProps> = ({
  onGenerate,
  mapping,
  onMappingChange
}) => {
  const [rows, setRows] = useState<QuickRow[]>([
    { id: '1', product: '', um: '', quantity: 0, cost: 0, sale_price: 0 }
  ]);

  const addRow = () => {
    const newId = Math.random().toString(36).substring(2, 9);
    setRows([...rows, { id: newId, product: '', um: '', quantity: 0, cost: 0, sale_price: 0 }]);
  };

  const removeRow = (index: number) => {
    if (rows.length === 1) {
        setRows([{ id: '1', product: '', um: '', quantity: 0, cost: 0, sale_price: 0 }]);
        return;
    }
    const newRows = [...rows];
    newRows.splice(index, 1);
    setRows(newRows);
  };

  const updateRow = (index: number, field: keyof QuickRow, value: QuickRow[keyof QuickRow]) => {
    const newRows = [...rows];
    newRows[index] = { ...newRows[index], [field]: value };
    setRows(newRows);
  };

  // P2: Reemplaza parseFloat(x) || 0 con validación explícita.
  // Antes: input inválido (ej: "abc") se coercía silenciosamente a 0, ocultando errores.
  // Ahora: si el input es inválido, se conserva el valor anterior y se muestra toast.
  const updateNumericRow = (index: number, field: 'quantity' | 'cost' | 'sale_price', rawValue: string) => {
    if (rawValue === '') {
      // Campo vacío es válido — representa 0 temporalmente hasta que el usuario escriba
      updateRow(index, field, 0);
      return;
    }
    const parsed = parseFloat(rawValue);
    if (isNaN(parsed) || parsed < 0) {
      // No sobrescribir con valor inválido — conservar el anterior y notificar
      toast.error('Número inválido', { description: `El valor "${rawValue}" no es válido para ${field}.` });
      return;
    }
    updateRow(index, field, parsed);
  };

  const handleGenerate = () => {
    const validRows = rows.filter(r => r.product.trim() !== '');
    if (validRows.length === 0) {
        toast.error("Debe ingresar al menos un producto");
        return;
    }
    onGenerate(validRows);
  };

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500 max-w-5xl mx-auto">
      {/* Configuration Header */}
      <div className="bg-warning/10 border border-warning/20 rounded-[2rem] p-6 flex flex-col md:flex-row items-center gap-6 shadow-sm">
        <div className="p-4 bg-warning rounded-2xl text-foreground shadow-lg shadow-warning/20">
            <Zap className="w-6 h-6" />
        </div>
        <div className="flex-1">
            <h2 className="text-xl font-black tracking-tight text-warning uppercase">Configuración de Generación</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
              <div className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-widest text-amber-700/70 ml-1">Columna Objetivo</span>
                <Select
                  value={mapping.targetColumn}
                  onValueChange={(val) => onMappingChange({ ...mapping, targetColumn: val as 'sale_price' | 'total_cost' })}
                >
                  <SelectTrigger className="h-10 rounded-xl border-warning/20 bg-background/50 text-xs font-bold">
                    <SelectValue placeholder="Objetivo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sale_price">Precio Venta</SelectItem>
                    <SelectItem value="total_cost">Costo Total</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="cost-modification-row" className="text-xs font-black uppercase tracking-widest text-amber-700/70 ml-1">Fila que Cambiará</label>
                <div className="relative">
                  <Target className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-warning" />
                  <Input
                    id="cost-modification-row"
                    className="h-10 pl-9 rounded-xl border-warning/20 bg-background/50 text-xs font-bold"
                    placeholder="Ej. 13.1"
                    value={mapping.modificationRow}
                    onChange={(e) => onMappingChange({ ...mapping, modificationRow: e.target.value })}
                  />
                </div>
              </div>
            </div>
        </div>
        <Button
            onClick={handleGenerate}
            className="rounded-2xl bg-warning hover:bg-warning text-foreground font-black uppercase tracking-widest px-8 py-6 h-auto shadow-xl shadow-warning/20 active:scale-95 transition-all mt-4 md:mt-0"
        >
            Generar Ahora
            <ChevronRight className="ml-2 w-5 h-5" />
        </Button>
      </div>

      <div className="bg-card dark:bg-slate-900 rounded-[2.5rem] border border-border shadow-xl overflow-hidden">
        <div className="overflow-x-auto table-to-cards rounded-2xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-muted-foreground w-12">No.</th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-muted-foreground">Producto / Item</th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-muted-foreground w-20">UM</th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-muted-foreground w-24">Cantidad</th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-muted-foreground w-32">Costo Unit.</th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-muted-foreground w-32 text-warning">Precio Venta</th>
                <th className="px-6 py-4 w-12">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {rows.map((row, idx) => (
                <tr key={row.id} className="group hover:bg-primary/5 transition-colors h-auto sm:h-12">
                  <td data-label="No." className="px-6 py-3 font-black text-muted-foreground text-xs">
                    {idx + 1}
                  </td>
                  <td data-label="Producto" className="px-6 py-3">
                    <Input
                      value={row.product}
                      onChange={(e) => updateRow(idx, 'product', e.target.value)}
                      placeholder="Ej. Pizza Margherita"
                      className="bg-transparent border-none focus-visible:ring-0 font-bold text-sm h-8"
                    />
                  </td>
                  <td data-label="UM" className="px-6 py-3">
                    <Input
                      value={row.um}
                      onChange={(e) => updateRow(idx, 'um', e.target.value)}
                      placeholder="kg"
                      className="bg-transparent border-none focus-visible:ring-0 text-center font-bold text-xs h-8"
                    />
                  </td>
                  <td data-label="Cantidad" className="px-6 py-3">
                    <Input
                      type="number"
                      value={row.quantity}
                      onChange={(e) => updateNumericRow(idx, 'quantity', e.target.value)}
                      className="bg-transparent border-none focus-visible:ring-0 text-right font-black text-sm h-8"
                      aria-label={`Cantidad de ${row.product || `fila ${idx + 1}`}`}
                    />
                  </td>
                  <td data-label="Costo" className="px-6 py-3">
                    <div className="relative">
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 text-xs font-black text-muted-foreground">$</span>
                        <Input
                          type="number"
                          value={row.cost}
                          onChange={(e) => updateNumericRow(idx, 'cost', e.target.value)}
                          className="bg-transparent border-none focus-visible:ring-0 text-right font-black text-sm pl-4 h-8"
                          aria-label={`Costo de ${row.product || `fila ${idx + 1}`}`}
                        />
                    </div>
                  </td>
                  <td data-label="Precio Venta" className="px-6 py-3 bg-warning/5">
                    <div className="relative">
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 text-xs font-black text-warning/70">$</span>
                        <Input
                          type="number"
                          value={row.sale_price}
                          onChange={(e) => updateNumericRow(idx, 'sale_price', e.target.value)}
                          className="bg-transparent border-none focus-visible:ring-0 text-right font-black text-sm pl-4 h-8 text-warning"
                          placeholder="Opcional"
                          aria-label={`Precio de venta de ${row.product || `fila ${idx + 1}`}`}
                        />
                    </div>
                  </td>
                  <td data-label="Acciones" className="px-6 py-3 text-center">
                    <button type="button"
                      onClick={() => removeRow(idx)}
                      className="p-1.5 text-destructive/70 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-3 bg-muted/30 border-t border-border">
          <Button
            variant="ghost"
            onClick={addRow}
            className="w-full rounded-xl border-2 border-dashed border-border hover:border-warning/50 hover:bg-warning/5 text-muted-foreground hover:text-warning font-bold py-6 transition-all"
          >
            <Plus className="mr-2 w-4 h-4" />
            Añadir otro producto
          </Button>
        </div>
      </div>

      <div className="flex justify-center py-4">
         <p className="text-xs font-black uppercase tracking-[0.4em] text-muted-foreground flex items-center gap-2 opacity-50">
            <Settings2 className="w-3 h-3" />
            Smart Engine Quick Config
         </p>
      </div>
    </div>
  );
};
export default CostSheetQuickMode;
