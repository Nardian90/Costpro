'use client';

import React from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { Button } from '@/components/ui/button';
import { Download, Upload } from 'lucide-react';
import { exportHeaderToExcel, importHeaderFromExcel } from '@/services/excel-service';

const CostSheetHeaderEditor = () => {
  const { data, updateValue, updateValues } = useCostSheetStore();
  const header = data?.header;

  if (!header) return null;

  const headerInputRef = React.useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const finalValue = type === 'number' ? parseFloat(value) || 0 : value;
    updateValue(['header', name], finalValue);
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const newHeader = await importHeaderFromExcel(file);
        const updates = Object.keys(newHeader).map(key => ({
          path: ['header', key],
          value: (newHeader as any)[key]
        }));
        updateValues(updates);
      } catch (err) {
        console.error(err);
      }
    }
    e.target.value = '';
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-inner animate-in slide-in-from-top duration-500">
      <div className="flex flex-col gap-6">
        <div className="flex justify-end gap-2 mb-2">
            <Button
                size="sm"
                variant="outline"
                className="h-9 rounded-xl font-bold gap-2 text-[10px] uppercase tracking-wider bg-white/50 dark:bg-slate-900/50"
                onClick={() => exportHeaderToExcel(header)}
            >
                <Download className="w-3.5 h-3.5 text-primary" />
                Exportar Excel
            </Button>
            <div className="relative">
                <Button
                    size="sm"
                    variant="outline"
                    className="h-9 rounded-xl font-bold gap-2 text-[10px] uppercase tracking-wider bg-white/50 dark:bg-slate-900/50"
                    onClick={() => headerInputRef.current?.click()}
                >
                    <Upload className="w-3.5 h-3.5 text-primary" />
                    Importar Excel
                </Button>
                <input
                    type="file"
                    ref={headerInputRef}
                    className="hidden"
                    accept=".xlsx,.xls"
                    onChange={handleImportExcel}
                />
            </div>
        </div>
        <div>
          <label htmlFor="name" className="text-[10px] font-black uppercase tracking-[0.2em] text-primary block mb-1">
            Nombre del Recurso
          </label>
          <input
            id="name"
            name="name"
            type="text"
            value={header?.name || ''}
            onChange={handleChange}
            className="w-full px-3 py-2 text-2xl font-black text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-primary focus:border-primary"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-6">
          {[
            { id: 'code', label: 'Código' },
            { id: 'date', label: 'Fecha', type: 'date' },
            { id: 'unit', label: 'Unidad' },
            { id: 'quantity', label: 'Cantidad', type: 'number' },
            { id: 'currency', label: 'Moneda' },
            { id: 'category', label: 'Categoría' },
            { id: 'type', label: 'Tipo' },
          ].map((item) => (
            <div key={item.id} className="space-y-1">
              <label htmlFor={item.id} className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block">
                {item.label}
              </label>
              <input
                id={item.id}
                name={item.id}
                type={item.type || 'text'}
                value={header?.[item.id] || ''}
                onChange={handleChange}
                className="w-full px-2 py-1.5 text-sm font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md focus:ring-primary focus:border-primary"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CostSheetHeaderEditor;