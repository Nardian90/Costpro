'use client';

import React from 'react';
import { cn } from '@/lib/utils';

type Column = {
  key: string;
  label: string;
  formula?: string;
};

type Annex = {
  id: string;
  title: string;
  columns: Column[];
  data: any[];
};

type CostSheetAnnexesProps = {
  annexes: Annex[];
};

const calculateRowValue = (row: any, formula: string): number => {
    const [operand1, operator, operand2] = formula.split(' ');
    if (operator === '*') {
        return (row[operand1] || 0) * (row[operand2] || 0);
    }
     if (operator === '/') {
        return (row[operand1] || 0) / (row[operand2] || 1);
    }
    return 0;
}

const CostSheetAnnexes: React.FC<CostSheetAnnexesProps> = ({ annexes }) => {
  return (
    <div className="space-y-12">
      {annexes.map((annex) => (
        <div key={annex.id} className="page-break-before space-y-4">
          <div className="flex items-center gap-4">
            <div className="h-0.5 flex-1 bg-slate-100 dark:bg-slate-800" />
            <h2 className="text-sm font-black uppercase tracking-[0.3em] text-slate-400">
              {annex.id} • {annex.title}
            </h2>
            <div className="h-0.5 flex-1 bg-slate-100 dark:bg-slate-800" />
          </div>

          <div className="overflow-x-auto table-to-cards border border-slate-100 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xl bg-white dark:bg-slate-900">
            <table className="w-full text-sm">
              <thead className="bg-slate-800 text-white hidden sm:table-header-group">
                <tr>
                  {annex.columns.map((col) => (
                    <th key={col.key} className="p-4 text-left font-black uppercase tracking-widest text-[10px]">
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {annex.data.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                    {annex.columns.map((col) => (
                      <td key={`${rowIndex}-${col.key}`} data-label={col.label} className="p-4 font-mono text-slate-700 dark:text-slate-300">
                        {col.formula
                          ? <span className="font-black text-primary">
                              {calculateRowValue(row, col.formula).toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </span>
                          : row[col.key]}
                      </td>
                    ))}
                  </tr>
                ))}
                {/* Total Row */}
                <tr className="bg-slate-50 dark:bg-slate-800/30 font-bold border-t-2 border-slate-100 dark:border-slate-700">
                    <td colSpan={annex.columns.length - 1} className="p-4 text-right uppercase tracking-widest text-[10px] hidden sm:table-cell">
                      Subtotal {annex.id}
                    </td>
                    <td data-label="TOTAL" className="p-4 text-right font-mono font-black text-xl text-slate-900 dark:text-white">
                        <span className="text-xs mr-1 opacity-40">$</span>
                        {annex.data.reduce((acc, row) => {
                            const totalColumn = annex.columns.find(c => c.formula);
                            if (totalColumn) {
                                return acc + calculateRowValue(row, totalColumn.formula);
                            }
                            const lastColKey = annex.columns[annex.columns.length - 1].key;
                            return acc + (typeof row[lastColKey] === 'number' ? row[lastColKey] : 0);
                        }, 0).toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                        })}
                    </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
};

export default CostSheetAnnexes;
