
'use client';

import React from 'react';

// Simplified types for props
type Column = {
  key: string;
  label: string;
  formula?: string;
};

type Annex = {
  id: string;
  title: string;
  columns: Column[];
  data: any[]; // Data is pre-calculated by the hook
};

type CostSheetAnnexesProps = {
  annexes: Annex[];
};

const CostSheetAnnexes: React.FC<CostSheetAnnexesProps> = ({ annexes }) => {
  return (
    <div className="space-y-12">
      {annexes.map((annex) => {
        // Find the column that represents the total for summary calculation
        const totalColumn = annex.columns.find(c => c.key === 'total' || c.key === 'amount' || c.key === 'depreciation_cost');

        return (
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
                           {/* FIX: Directly render the value from the pre-calculated row data */}
                           <span className={col.formula ? "font-black text-primary" : ""}>
                             {typeof row[col.key] === 'number'
                               ? row[col.key].toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                               : row[col.key]
                             }
                           </span>
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
                          {/* FIX: Use the pre-calculated data for the final sum */}
                          {annex.data.reduce((acc, row) => acc + (totalColumn ? (row[totalColumn.key] || 0) : 0), 0)
                            .toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                          })}
                      </td>
                  </tr>
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
