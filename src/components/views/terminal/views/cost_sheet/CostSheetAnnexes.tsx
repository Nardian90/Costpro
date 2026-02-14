
'use client';

import React from 'react';
import { cn, formatCurrency } from '@/lib/utils';
import { CostSheetAnnex, CostSheetColumn } from '@/types/cost-sheet';

type CostSheetAnnexesProps = {
  forceTable?: boolean;
  annexes: CostSheetAnnex[];
};

const CostSheetAnnexes: React.FC<CostSheetAnnexesProps> = ({ annexes, forceTable }) => {
  return (
    <div className="space-y-16">
      {annexes.map((annex) => {
        // Find the column that represents the total for summary calculation
        const totalColumn = annex.columns.find(c => c.key === 'total' || c.key === 'amount' || c.key === 'depreciation_cost' || c.key === 'total_cost');

        return (
          <div key={annex.id} className="page-break-before space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-base font-black uppercase tracking-[0.4em] text-slate-900 dark:text-white">
                {annex.id} - {annex.title}
              </h2>
              <div className="h-1 w-24 bg-primary mx-auto rounded-full" />
            </div>

            <div className={cn("overflow-x-auto border table-to-cards border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-lg bg-white dark:bg-slate-900", forceTable && "force-table")}>
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    {annex.columns.map((col: CostSheetColumn) => (
                      <th key={col.key} className="p-3 text-left font-black uppercase tracking-widest text-[9px] text-slate-500 dark:text-slate-400">
                        {col.label || col.title || col.key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {annex.data.length > 0 ? annex.data.map((row, rowIndex) => (
                    <tr key={rowIndex} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                      {annex.columns.map((col: CostSheetColumn) => (
                        <td key={`${rowIndex}-${col.key}`} className="p-3 font-mono text-[10px] text-slate-700 dark:text-slate-300">
                           <span className={col.formula ? "font-black text-primary" : "font-medium"}>
                             {typeof row[col.key] === 'number'
                               ? row[col.key].toLocaleString('es-ES', { minimumFractionDigits: 2 })
                               : (row[col.key] !== undefined && row[col.key] !== null && row[col.key] !== '' ? row[col.key] : '--')
                             }
                           </span>
                        </td>
                      ))}
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={annex.columns.length} className="p-8 text-center italic text-slate-400">
                        No hay datos registrados en este anexo.
                      </td>
                    </tr>
                  )}
                  {/* Total Row */}
                  {annex.data.length > 0 && (
                    <tr className="bg-slate-50 dark:bg-slate-800/50 font-bold border-t border-slate-200 dark:border-slate-700">
                        <td colSpan={annex.columns.length - 1} className="p-4 text-right uppercase tracking-[0.2em] text-[10px] font-black text-slate-500">
                          TOTAL
                        </td>
                        <td className="p-4 text-right font-mono font-black text-base text-slate-900 dark:text-white border-l border-slate-200 dark:border-slate-700">
                            {formatCurrency(annex.data.reduce((acc, row) => acc + (totalColumn ? (row[totalColumn.key] || 0) : 0), 0)).replace('$', '').trim()}
                        </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default CostSheetAnnexes;
