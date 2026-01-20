
'use client';

import React from 'react';
import { cn } from '@/lib/utils';

// Define the richer structure for a single calculated value
type CalculatedRowValue = {
  valorHistorico: number;
  baseValue: number;
  coeficiente: number;
  total: number;
};

type Row = {
  id: string;
  label: string;
};

type Section = {
  id: string;
  label: string;
  rows: Row[];
};

type CostSheetBodyProps = {
  sections: Section[];
  // Update the type definition to expect the new object structure
  calculatedValues: { [key: string]: CalculatedRowValue };
};

const CostSheetBody: React.FC<CostSheetBodyProps> = ({ sections, calculatedValues }) => {
  return (
    <div className="overflow-x-auto table-to-cards border border-slate-100 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xl">
      <table className="w-full text-sm">
        <thead className="bg-slate-800 text-white hidden sm:table-header-group">
          <tr>
            <th className="p-4 text-left font-black uppercase tracking-widest text-[10px]">Descripción del Concepto</th>
            <th className="p-4 text-right font-black uppercase tracking-widest text-[10px] w-48">Valor Calculado</th>
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-slate-900">
          {sections.map((section) => (
            <React.Fragment key={section.id}>
              {section.rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                  <td
                    data-label="Descripción"
                    className={cn(
                      "p-4",
                      row.id.includes('.') ? 'pl-8 sm:pl-12 text-slate-500 italic' : 'font-bold text-slate-900 dark:text-white uppercase tracking-tight'
                    )}
                  >
                    {row.label}
                  </td>
                  <td data-label="Valor" className="p-4 text-right font-mono font-black text-primary text-base">
                    <span className="text-[10px] mr-1 opacity-50">$</span>
                    {/* FIX: Access the 'total' property of the calculated value object */}
                    {(calculatedValues[row.id]?.total ?? 0).toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default CostSheetBody;
