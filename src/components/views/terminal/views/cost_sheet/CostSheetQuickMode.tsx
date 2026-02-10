
'use client';

import React, { useState } from 'react';
import { Plus, Trash2, Zap, Save, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface QuickRow {
  id: string;
  product: string;
  um: string;
  quantity: number;
  cost: number;
}

interface CostSheetQuickModeProps {
  onGenerate: (rows: QuickRow[]) => void;
}

export const CostSheetQuickMode: React.FC<CostSheetQuickModeProps> = ({ onGenerate }) => {
  const [rows, setRows] = useState<QuickRow[]>([
    { id: '1', product: '', um: '', quantity: 0, cost: 0 }
  ]);

  const addRow = () => {
    const newId = (rows.length + 1).toString();
    setRows([...rows, { id: newId, product: '', um: '', quantity: 0, cost: 0 }]);
  };

  const removeRow = (index: number) => {
    if (rows.length === 1) {
        setRows([{ id: '1', product: '', um: '', quantity: 0, cost: 0 }]);
        return;
    }
    const newRows = [...rows];
    newRows.splice(index, 1);
    setRows(newRows);
  };

  const updateRow = (index: number, field: keyof QuickRow, value: any) => {
    const newRows = [...rows];
    newRows[index] = { ...newRows[index], [field]: value };
    setRows(newRows);
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
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500 max-w-5xl mx-auto">
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-[2rem] p-8 flex flex-col md:flex-row items-center gap-6 shadow-sm">
        <div className="p-4 bg-amber-500 rounded-2xl text-white shadow-lg shadow-amber-500/20">
            <Zap className="w-8 h-8" />
        </div>
        <div className="flex-1 text-center md:text-left">
            <h2 className="text-2xl font-black tracking-tight text-amber-600">Modo Rápido</h2>
            <p className="text-amber-700/70 font-medium">Crea una ficha de costo al vuelo ingresando solo los materiales principales.</p>
        </div>
        <Button
            onClick={handleGenerate}
            className="rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-black uppercase tracking-widest px-8 py-6 h-auto shadow-xl shadow-amber-500/20 active:scale-95 transition-all"
        >
            Generar Ficha
            <ChevronRight className="ml-2 w-5 h-5" />
        </Button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 w-16">No.</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Producto / Insumo</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 w-24">UM</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 w-32">Cantidad</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 w-40">Costo Unit.</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((row, idx) => (
                <tr key={row.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                  <td className="px-6 py-4 font-black text-slate-400 text-sm">
                    {idx + 1}
                  </td>
                  <td className="px-6 py-4">
                    <Input
                      value={row.product}
                      onChange={(e) => updateRow(idx, 'product', e.target.value)}
                      placeholder="Ej. Harina de Trigo"
                      className="bg-transparent border-none focus-visible:ring-1 focus-visible:ring-amber-500/30 font-bold text-slate-700 dark:text-slate-300 placeholder:text-slate-300"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <Input
                      value={row.um}
                      onChange={(e) => updateRow(idx, 'um', e.target.value)}
                      placeholder="kg"
                      className="bg-transparent border-none focus-visible:ring-1 focus-visible:ring-amber-500/30 text-center font-medium"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <Input
                      type="number"
                      value={row.quantity}
                      onChange={(e) => updateRow(idx, 'quantity', parseFloat(e.target.value) || 0)}
                      className="bg-transparent border-none focus-visible:ring-1 focus-visible:ring-amber-500/30 text-right font-black"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div className="relative">
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">$</span>
                        <Input
                          type="number"
                          value={row.cost}
                          onChange={(e) => updateRow(idx, 'cost', parseFloat(e.target.value) || 0)}
                          className="bg-transparent border-none focus-visible:ring-1 focus-visible:ring-amber-500/30 text-right font-black pl-4"
                        />
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={() => removeRow(idx)}
                      className="p-2 text-slate-300 hover:text-danger hover:bg-danger/10 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 bg-slate-50/50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800">
          <Button
            variant="ghost"
            onClick={addRow}
            className="w-full rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-amber-500/50 hover:bg-amber-500/5 text-slate-500 hover:text-amber-600 font-bold py-8 transition-all"
          >
            <Plus className="mr-2 w-5 h-5" />
            Añadir otro producto
          </Button>
        </div>
      </div>

      <div className="flex justify-center pt-8">
         <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 flex items-center gap-2">
            <Zap className="w-3 h-3 text-amber-500" />
            Sistema de Generación Express CostPro
         </p>
      </div>
    </div>
  );
};
