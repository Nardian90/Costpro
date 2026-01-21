'use client';

import React from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';

const CostSheetHeaderEditor = () => {
  const { header, setHeader } = useCostSheetStore();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setHeader({ ...header, [name]: value });
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-inner">
      <div className="flex flex-col gap-6">
        <div>
          <label htmlFor="name" className="text-[10px] font-black uppercase tracking-[0.2em] text-primary block mb-1">
            Nombre del Recurso
          </label>
          <input
            id="name"
            name="name"
            type="text"
            value={header.name || ''}
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
                value={header[item.id as keyof typeof header] || ''}
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