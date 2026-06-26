'use client';

import React from 'react';
import { cn, formatCurrency } from '@/lib/utils';
import { CostSheetAnnex, CostSheetColumn } from '@/types/cost-sheet';

import { useTranslations } from 'next-intl';
type CostSheetAnnexesProps = {
  forceTable?: boolean;
  annexes: CostSheetAnnex[];
};

const CostSheetAnnexes: React.FC<CostSheetAnnexesProps> = ({ annexes, forceTable }) => {
  return (
    <div className="space-y-16">

      {annexes.map((annex) => {
        // Find the column that represents the total for summary calculation
        const totalColumn = annex.columns.find(c => c.key === 'total' || c.key === 'amount' || c.key === 'depreciation_cost' || c.key === 'total_cost' || c.key === 'value' || c.key === 'importe');

        return (
          <div key={annex.id} className="page-break-before space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-base font-black uppercase tracking-[0.4em] text-foreground text-foreground">
                {annex.id} - {annex.title}
              </h2>
              <div className="h-1 w-24 bg-primary mx-auto rounded-full" />
            </div>

            <div className={cn("overflow-x-auto border table-to-cards border-border rounded-2xl overflow-hidden shadow-lg bg-card", forceTable && "force-table")}>
              <table className="w-full text-xs">
                <thead className="bg-muted text-foreground text-foreground border-b border-border">
                  <tr>
                    {annex.columns.map((col: CostSheetColumn) => {
                      const isMain = col.key === 'description' || col.label?.toLowerCase().includes('descripción') || col.label?.toLowerCase().includes('puesto');
                      const widthClass = col.key === 'no' ? 'w-12' :
                                       (col.key === 'um' ? 'w-16' :
                                       (col.key === 'total' || col.key === 'amount' ? 'w-32' :
                                       (!isMain ? 'w-24' : '')));
                      return (
                        <th key={col.key} className={cn(
                            "p-3 text-left font-black uppercase tracking-widest text-xs text-muted-foreground text-muted-foreground whitespace-nowrap",
                            widthClass
                        )}>
                            {col.label || col.title || col.key}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50 dark:divide-border">
                  {annex.data.length > 0 ? annex.data.map((row, rowIndex) => {
                    const isZero = (val: unknown) => Number(val) === 0;
                    return (
                        <tr key={rowIndex} className="h-auto sm:h-8 text-xs hover:bg-muted dark:hover:bg-muted/30 transition-colors">
                        {annex.columns.map((col: CostSheetColumn) => {
                            const isMain = col.key === 'description' || col.label?.toLowerCase().includes('descripción') || col.label?.toLowerCase().includes('puesto');
                            const widthClass = col.key === 'no' ? 'w-12' :
                                            (col.key === 'um' ? 'w-16' :
                                            (col.key === 'total' || col.key === 'amount' ? 'w-32' :
                                            (!isMain ? 'w-24' : '')));
                            return (
                            <td key={`${rowIndex}-${col.key}`} data-label={col.label || col.title || col.key} className={cn(
                                "py-0.5 px-2 font-mono text-xs text-foreground/80 text-foreground/70 whitespace-nowrap",
                                widthClass
                            )}>
                            <span className={cn(col.formula ? "text-primary font-black" : "font-medium text-foreground/80", isZero(row[col.key]) && "text-muted-foreground opacity-60 font-medium")}>
                                {typeof row[col.key] === 'number'
                                ? row[col.key].toLocaleString('es-CU', { minimumFractionDigits: 2 })
                                : (row[col.key] !== undefined && row[col.key] !== null && row[col.key] !== '' ? row[col.key] : '--')
                                }
                            </span>
                            </td>
                            );
                        })}
                        </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={annex.columns.length} className="p-8 text-center italic text-muted-foreground">
                        No hay datos registrados en este anexo.
                      </td>
                    </tr>
                  )}

                  {/* Total Row */}
                  {annex.data.length > 0 && (
                    <tr className="bg-muted/50 font-bold border-t border-border">
                        {(() => {
                            const totalColIndex = totalColumn ? annex.columns.findIndex(c => c.key === totalColumn.key) : annex.columns.length - 1;
                            const cells: React.ReactElement[] = [];


                            // Label cell
                            if (totalColIndex > 0) {
                                cells.push(
                                    <td key="total-label" colSpan={totalColIndex} className="p-4 text-right uppercase tracking-[0.2em] text-xs font-black text-muted-foreground">
                                        TOTAL
                                    </td>
                                );
                            }

                            // Total value cell
                            cells.push(
                                <td key="total-value" className="p-4 text-right font-mono font-black text-base text-foreground border-l border-border">
                                    {totalColIndex === 0 && <span className="mr-4 text-xs font-black text-muted-foreground uppercase tracking-widest">TOTAL</span>}
                                    {formatCurrency(annex.data.reduce((acc, row) => acc + (totalColumn ? (row[totalColumn.key] || 0) : 0), 0)).replace('$', '').trim()}
                                </td>
                            );

                            // Remaining empty cells
                            if (totalColIndex < annex.columns.length - 1) {
                                for (let i = totalColIndex + 1; i < annex.columns.length; i++) {
                                    cells.push(<td key={`empty-${i}`} className="p-4" aria-hidden="true"></td>);
                                }
                            }

                            return cells;
                        })()}
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
