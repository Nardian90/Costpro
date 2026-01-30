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
  sections: Section[];
  calculatedValues: { [key: string]: CalculatedRowValue };
};

const CostSheetBody: React.FC<CostSheetBodyProps> = ({ sections, calculatedValues }) => {
  const renderRow = (row: any, level: number = 0) => {
      const calc = calculatedValues[row.id] || { total: 0, valorHistorico: 0, baseTotal: 0, coeficiente: 0 };
      const hasChildren = row.children && row.children.length > 0;

      // Special handling for Base Cálculo column
      let baseCalculoDisplay = '-';

      if (row.base_display_override) {
          baseCalculoDisplay = row.base_display_override;
      } else if (row.is_percent && row.value !== undefined) {
          baseCalculoDisplay = `${((row.value || 0) * 100).toFixed(2)}%`;
      } else if (calc.coeficiente > 0) {
          baseCalculoDisplay = calc.coeficiente.toLocaleString('es-ES', { minimumFractionDigits: 4 });
      } else if (calc.baseTotal > 0 && !hasChildren) {
          baseCalculoDisplay = calc.baseTotal.toLocaleString('es-ES', { minimumFractionDigits: 2 });
      }

      return (
        <React.Fragment key={row.id}>
            <tr className={cn(
                "border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors",
                hasChildren && "bg-slate-50/30 dark:bg-slate-900/30"
            )}>
                {/* Fila */}
                <td className="p-3 text-center font-mono text-[10px] text-slate-400">
                    {row.id}
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
                </td>

                {/* Valor Histórico */}
                <td data-label="Valor Histórico" className="p-3 text-right font-mono text-slate-500 text-xs">
                    {calc.valorHistorico > 0 ? calc.valorHistorico.toLocaleString('es-ES', { minimumFractionDigits: 2 }) : '--'}
                </td>

                {/* Base Cálculo */}
                <td data-label="Base Cálculo" className="p-3 text-right font-mono text-slate-500 text-xs">
                    {baseCalculoDisplay}
                </td>

                {/* Total */}
                <td data-label="Total" className={cn(
                    "p-3 text-right font-mono font-black text-sm",
                    hasChildren ? "text-slate-900 dark:text-white" : "text-primary"
                )}>
                    {formatCurrency(calc.total).replace('$', '').trim()}
                </td>
            </tr>
            {row.children?.map((child: any) => renderRow(child, level + 1))}
        </React.Fragment>
      );
  };

  return (
    <div className="overflow-x-auto table-to-cards border border-slate-100 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xl bg-white dark:bg-slate-900">
      <table className="w-full text-sm">
        <thead className="bg-slate-800 text-white hidden sm:table-header-group">
          <tr>
            <th className="p-4 text-center font-black uppercase tracking-widest text-[9px] w-16">Fila</th>
            <th className="p-4 text-left font-black uppercase tracking-widest text-[9px]">Concepto</th>
            <th className="p-4 text-right font-black uppercase tracking-widest text-[9px] w-32">Valor Histórico</th>
            <th className="p-4 text-right font-black uppercase tracking-widest text-[9px] w-32">Base Cálculo</th>
            <th className="p-4 text-right font-black uppercase tracking-widest text-[9px] w-40">Total</th>
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-slate-900">
          {sections.map((section) => (
            <React.Fragment key={section.id}>
              <tr className="bg-slate-100 dark:bg-slate-950/80">
                  <td colSpan={5} className="px-4 py-2 text-[10px] font-black text-primary uppercase tracking-[0.2em] border-y border-slate-200 dark:border-slate-800">
                      {section.label}
                  </td>
              </tr>
              {section.rows.map((row) => renderRow(row))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default CostSheetBody;
