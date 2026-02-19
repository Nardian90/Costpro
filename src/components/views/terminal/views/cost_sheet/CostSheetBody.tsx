'use client';

import React from 'react';
import { cn, formatCurrency } from '@/lib/utils';

// Define the richer structure for a single calculated value
type CalculatedRowValue = {
  valorHistorico: number;
  baseTotal: number;
  coeficiente: number;
  total: number;
};

type Row = {
  id: string;
  label: string;
  children?: Row[];
  is_percent?: boolean;
};

type Section = {
  id: string;
  label: string;
  rows: Row[];
};

type CostSheetBodyProps = {
  forceTable?: boolean;
  sections: Section[];
  calculatedValues: { [key: string]: CalculatedRowValue };
};

const CostSheetBody: React.FC<CostSheetBodyProps> = ({ sections, calculatedValues, forceTable }) => {
  const renderRow = (row: any, level: number = 0, numbering: string) => {
      const calc = calculatedValues[row.id] || { total: 0, valorHistorico: 0, baseTotal: 0, coeficiente: 0 };
      const hasChildren = row.children && row.children.length > 0;

      return (
        <React.Fragment key={row.id}>
            <tr className={cn(
                "border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors",
                hasChildren && "bg-slate-50/30 dark:bg-slate-900/30"
            )}>
                {/* No. */}
                <td className="p-3 text-center font-mono text-xs text-slate-400 w-12 whitespace-nowrap">
                    {numbering}
                </td>

                {/* Concepto */}
                <td
                    data-label="Concepto"
                    style={{ paddingLeft: `${level > 0 ? (level * 20) + 12 : 12}px` }}
                    className={cn(
                        "p-3",
                        hasChildren ? "font-black text-slate-900 dark:text-white uppercase tracking-tight" : "text-slate-600 dark:text-slate-400 font-medium"
                    )}
                >
                    {row.label}
                    {row.id === '13' && calculatedValues?.['12']?.total > 0 && (
                        <span className="ml-2 text-xs font-black text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded border border-emerald-500/20">
                            {((calculatedValues['13'].total / calculatedValues['12'].total) * 100).toFixed(1)}% s/ costo
                        </span>
                    )}
                    {row.is_percent && (
                        <span className="ml-2 text-xs font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                            {((row.value || calc.valorHistorico || 0) * 100).toFixed(2)}%
                        </span>
                    )}
                </td>

                {/* Valor Histórico */}
                <td data-label="Valor Histórico" className="p-3 text-right font-mono text-slate-500 text-xs w-28 whitespace-nowrap">
                    {calc.valorHistorico > 0 ? calc.valorHistorico.toLocaleString('es-ES', { minimumFractionDigits: 2 }) : '--'}
                </td>

                {/* Total */}
                <td data-label="Total" className={cn(
                    "p-3 text-right font-mono font-black text-sm w-32 whitespace-nowrap",
                    hasChildren ? "text-slate-900 dark:text-white" : "text-primary"
                )}>
                    {formatCurrency(calc.total).replace('$', '').trim()}
                </td>
            </tr>
            {row.children?.map((child: any, idx: number) => renderRow(child, level + 1, `${numbering}.${idx + 1}`))}
        </React.Fragment>
      );
  };

  return (
    <div className={cn("overflow-x-auto table-to-cards border border-slate-100 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xl bg-white dark:bg-slate-900", forceTable && "force-table")}>
      <table className="w-full text-sm">
        <thead className="bg-slate-800 text-white hidden sm:table-header-group">
          <tr>
            <th className="p-4 text-center font-black uppercase tracking-widest text-xs w-12 whitespace-nowrap">No.</th>
            <th className="p-4 text-left font-black uppercase tracking-widest text-xs">Concepto</th>
            <th className="p-4 text-right font-black uppercase tracking-widest text-xs w-28 whitespace-nowrap">Valor Histórico</th>
            <th className="p-4 text-right font-black uppercase tracking-widest text-xs w-32 whitespace-nowrap">Total</th>
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-slate-900">
          {sections.map((section) => (
            <React.Fragment key={section.id}>
              <tr className="bg-slate-100 dark:bg-slate-950/80">
                  <td colSpan={4} className="px-4 py-2 text-xs font-black text-primary uppercase tracking-[0.2em] border-y border-slate-200 dark:border-slate-800">
                      {section.label}
                  </td>
              </tr>
              {section.rows.map((row, idx) => renderRow(row, 0, String(idx + 1)))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default CostSheetBody;
