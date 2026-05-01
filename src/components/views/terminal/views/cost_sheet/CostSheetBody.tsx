'use client';

import React from 'react';
import { cn, formatCurrency } from '@/lib/utils';

// Define the richer structure for a single calculated value
type CalculatedRowValue = {
  valorHistorico: number;
  calculatedVH?: number;
  baseTotal: number;
  coeficiente: number;
  total: number;
};

type Row = {
  id: string;
  label: string;
  children?: Row[];
  isPercent?: boolean;
  /** @deprecated Use isPercent instead */
  is_percent?: boolean;
  value?: unknown;
  um?: string;
  unit?: string;
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
  const renderRow = (row: Row, level: number = 0, numbering: string) => {
      const calc = calculatedValues[row.id] || { total: 0, valorHistorico: 0, calculatedVH: 0, baseTotal: 0, coeficiente: 0 };
      const isZero = Number(calc.total) === 0;
      const hasChildren = row.children && row.children.length > 0;

      return (
        <React.Fragment key={row.id}>
            <tr className={cn(
                "h-auto sm:h-8 text-xs",
                "border-b border-border/50 hover:bg-muted/50/50 hover:bg-primary/10 transition-colors",
                hasChildren && "bg-muted/30 bg-background/30"
            )}>
                {/* No. */}
                <td className="py-0.5 px-2 text-center font-mono text-xs text-muted-foreground w-[60px] whitespace-nowrap">
                    {numbering}
                </td>

                {/* Concepto */}
                <td
                    data-label="Concepto"
                    style={{ paddingLeft: `${level > 0 ? (level * 20) + 12 : 12}px` }}
                    className={cn(
                        "py-0.5 px-2",
                        hasChildren ? "font-black text-foreground uppercase tracking-tight" : "text-foreground/80 text-muted-foreground font-medium"
                    )}
                >
                    {row.label}
                    {['13', '13.1'].includes(row.id) && (calculatedValues?.['12.1']?.total ?? calculatedValues?.['12']?.total) > 0 && (
                        <span className="ml-2 text-xs font-black text-primary bg-primary/10 dark:bg-primary/20 px-1.5 py-0.5 rounded border border-primary/30">
                            {(((calculatedValues['13.1']?.total ?? calculatedValues['13']?.total) / (calculatedValues['12.1']?.total ?? calculatedValues['12']?.total)) * 100).toFixed(1)}% s/ costo
                        </span>
                    )}
                    {((row.isPercent ?? row.is_percent)) && (
                        <span className="ml-2 text-xs font-bold text-muted-foreground bg-muted dark:bg-primary px-1.5 py-0.5 rounded">
                            {((Number(row.value) || calc.valorHistorico || 0) * 100).toFixed(2)}%
                        </span>
                    )}
                </td>

                {/* UM */}
                <td data-label="UM" className="py-0.5 px-2 text-center font-mono text-muted-foreground text-[10px] w-[80px] whitespace-nowrap italic">
                    {row.um || row.unit || '-'}
                </td>

                {/* Valor Histórico */}
                <td data-label="Valor Histórico" className="py-0.5 px-2 text-right font-mono text-muted-foreground text-xs w-[140px] whitespace-nowrap">
                    {(calc.calculatedVH ?? calc.valorHistorico ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>

                {/* Total */}
                <td data-label="Total" className={cn(
                    "py-0.5 px-2 text-right font-mono font-black text-sm w-[120px] whitespace-nowrap",
                    hasChildren ? "text-foreground" : (isZero ? "text-muted-foreground opacity-60 font-medium" : "text-primary font-black")
                )}>
                    {formatCurrency(calc.total).replace('$', '').trim()}
                </td>
            </tr>
            {row.children?.map((child: Row, idx: number) => renderRow(child, level + 1, `${numbering}.${idx + 1}`))}
        </React.Fragment>
      );
  };

  return (
    <div className={cn("overflow-x-auto table-to-cards border border-border/70 border-border rounded-3xl overflow-hidden shadow-xl bg-card", forceTable && "force-table")}>
      <table className="w-full text-sm">
        <thead className="bg-primary text-primary-foreground hidden sm:table-header-group">
          <tr>
            <th className="py-1 px-2 text-center font-black uppercase tracking-widest text-xs w-[60px] whitespace-nowrap">No.</th>
            <th className="py-1 px-2 text-left font-black uppercase tracking-widest text-xs">Concepto</th>
            <th className="py-1 px-2 text-center font-black uppercase tracking-widest text-xs w-[80px] whitespace-nowrap">UM</th>
            <th className="py-1 px-2 text-right font-black uppercase tracking-widest text-xs w-[140px] whitespace-nowrap">Valor Histórico</th>
            <th className="py-1 px-2 text-right font-black uppercase tracking-widest text-xs w-[120px] whitespace-nowrap">Total</th>
          </tr>
        </thead>
        <tbody className="bg-card">
          {sections.map((section) => (
            <React.Fragment key={section.id}>
              <tr className="bg-primary/5 border-l-2 border-primary/20">
                  <td colSpan={5} className="px-4 py-2 text-xs font-black text-primary uppercase tracking-[0.2em] border-y border-border">
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
