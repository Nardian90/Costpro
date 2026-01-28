'use client';

import React from 'react';
import { cn, formatDate } from '@/lib/utils';

type CostSheetHeaderProps = {
  header: {
    code: string;
    name: string;
    date: string;
    unit: string;
    quantity: number;
    currency: string;
    category: string;
    type: string;
  };
};

const CostSheetHeader: React.FC<CostSheetHeaderProps> = ({ header }) => {
  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-inner">
      <div className="flex flex-col gap-6">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary block mb-1">Nombre del Recurso</span>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white leading-tight uppercase">
            {header.name || 'Sin nombre'}
          </h1>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-6">
          {[
            { label: 'Código', value: header.code },
            { label: 'Fecha', value: formatDate(header.date) },
            { label: 'Unidad', value: header.unit },
            { label: 'Cantidad', value: header.quantity },
            { label: 'Moneda', value: header.currency },
            { label: 'Categoría', value: header.category },
            { label: 'Tipo', value: header.type },
          ].map((item, idx) => (
            <div key={idx} className="space-y-1">
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block">
                {item.label}
              </span>
              <div className="font-bold text-sm text-slate-700 dark:text-slate-300">
                {item.value || 'N/A'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CostSheetHeader;
