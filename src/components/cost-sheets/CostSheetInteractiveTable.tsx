
'use client';

import React, { useState, useMemo } from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { useCostSheetCalculator } from '@/hooks/useCostSheetCalculator';
import { ChevronRight, HelpCircle, CornerDownRight } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  CostSheetRow as RowData,
  CostSheetSection,
  CostSheetAnnex,
  CalculatedRowValue
} from '@/types/cost-sheet';

// Define types based on our hook and data structure
type CalculatedValues = Record<string, CalculatedRowValue>;

// Props for the main table component
interface CostSheetInteractiveTableProps {
  sections: CostSheetSection[];
  calculatedValues: CalculatedValues;
  annexes: CostSheetAnnex[];
}

// Props for a single row component
interface RowProps {
  row: RowData;
  level: number;
  calculatedValues: CalculatedValues;
  path: (string | number)[]; // Path to this row in the Zustand store
  annexes: CostSheetAnnex[];
  allRows: RowData[];
}

/**
 * Renders a single, potentially recursive, row in the cost sheet table.
 */
const CostSheetRow: React.FC<RowProps> = ({ row, level, calculatedValues, path, annexes, allRows }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const { updateValue } = useCostSheetStore();
  const hasChildren = row.children && row.children.length > 0;
  const calculated = calculatedValues[row.id] || { total: 0, valorHistorico: 0, baseTotal: 0, coeficiente: 0 };

  const handleToggle = () => {
    if (hasChildren) {
      setIsExpanded(!isExpanded);
    }
  };

  const handleValueChange = (field: string, value: any) => {
    const isNumericField = field === 'valorHistorico' || field === 'value';
    const numericValue = isNumericField ? parseFloat(value) || 0 : value;
    updateValue([...path, field], numericValue);
  };

  const baseOptions = useMemo(() => [
    ...annexes.map(a => ({ value: a.id, label: `Anexo ${a.id}: ${a.title}` })),
    ...allRows.map(r => ({ value: r.id, label: `Fila ${r.id}: ${r.label}` }))
  ], [annexes, allRows]);

  return (
    <>
      <tr className="border-t border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
        {/* Concepto */}
        <td style={{ paddingLeft: `${level * 24 + 12}px` }} className="py-2.5 font-medium text-slate-700 dark:text-slate-300">
          <div className="flex items-center gap-2 min-w-0">
            {hasChildren && (
              <button onClick={handleToggle} className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 shrink-0">
                <ChevronRight className={cn('w-4 h-4 transition-transform', isExpanded && 'rotate-90')} />
              </button>
            )}
            {!hasChildren && <CornerDownRight className="w-4 h-4 text-slate-400 dark:text-slate-600 shrink-0 ml-1" />}
            <span className="truncate flex-1">{row.label}</span>
          </div>
        </td>

        {/* Valor Histórico / % */}
        <td className="px-4 py-2 text-right">
          {(row.calculationMethod === 'Prorrateo' || row.hasOwnProperty('formula') || hasChildren) && !row.is_percent ? (
            <div className="h-8 flex items-center justify-end px-3 text-sm font-bold text-primary/70 bg-primary/5 rounded-md border border-primary/10 tabular-nums">
              {(calculated.valorHistorico || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          ) : (row.hasOwnProperty('valorHistorico') || row.hasOwnProperty('value')) ? (
            <div className="relative">
                <Input
                type="number"
                step={row.is_percent ? "0.001" : "1"}
                className={cn("neu-input text-right h-8", row.is_percent && "pr-6")}
                value={row.hasOwnProperty('valorHistorico') ? (row.valorHistorico ?? 0) : (row.is_percent ? ((row.value ?? 0) * 100) : (row.value ?? 0))}
                onChange={(e) => {
                  const val = e.target.value;
                  handleValueChange(
                    row.hasOwnProperty('valorHistorico') ? 'valorHistorico' : 'value',
                    row.is_percent ? parseFloat(val) / 100 : val
                  );
                }}
                onFocus={(e) => e.target.select()}
                />
                {row.is_percent && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">%</span>}
            </div>
          ) : <span className="text-sm text-slate-400">-</span>}
        </td>

        {/* Forma de Cálculo */}
        <td className="px-4 py-2">
          {!hasChildren && !row.formula && !row.is_percent ? (
            <Select value={row.calculationMethod || 'ValorFijo'} onValueChange={(value) => handleValueChange('calculationMethod', value)}>
              <SelectTrigger className="neu-input h-8">
                <SelectValue placeholder="Seleccionar Método..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Prorrateo">Prorrateo</SelectItem>
                <SelectItem value="ValorFijo">Valor Fijo</SelectItem>
              </SelectContent>
            </Select>
          ) : <span className="text-sm text-slate-400">-</span>}
        </td>

        {/* Base de Cálculo */}
        <td className="px-4 py-2 min-w-[180px]">
          {!hasChildren && !row.formula && !row.is_percent ? (
             <Select value={row.baseDeCalculoRef || ''} onValueChange={(value) => handleValueChange('baseDeCalculoRef', value)}>
                <SelectTrigger className="neu-input h-8 w-full">
                    <div className="truncate text-left pr-2">
                      <SelectValue placeholder="Seleccionar Base..." />
                    </div>
                </SelectTrigger>
                <SelectContent className="max-w-[400px]">
                    {baseOptions.map(opt => <SelectItem key={opt.value} value={opt.value} className="truncate">{opt.label}</SelectItem>)}
                </SelectContent>
            </Select>
          ) : <span className="text-sm text-slate-400">-</span>}
        </td>

        {/* Coeficiente */}
        <td className="px-4 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
          {calculated.coeficiente > 0 ? calculated.coeficiente.toFixed(6) : <span className="text-sm text-slate-400">-</span>}
        </td>

        {/* Total */}
        <td className="px-4 py-2 text-right font-bold tabular-nums text-primary">
          {calculated.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>

        {/* Ayuda */}
        <td className="px-4 py-2 text-center">
          {row.helpText && (
            <Popover>
              <PopoverTrigger asChild>
                 <button className="p-2 rounded-full hover:bg-primary/10 text-primary/50 hover:text-primary transition-colors">
                    <HelpCircle className="w-5 h-5" />
                 </button>
              </PopoverTrigger>
              <PopoverContent className="w-80"><p className="text-sm">{row.helpText}</p></PopoverContent>
            </Popover>
          )}
        </td>
      </tr>

      {isExpanded && hasChildren && row.children?.map((child, index) => (
        <CostSheetRow
          key={child.id}
          row={child}
          level={level + 1}
          calculatedValues={calculatedValues}
          path={[...path, 'children', index]}
          annexes={annexes}
          allRows={allRows}
        />
      ))}
    </>
  );
};

/**
 * The main interactive table component for the Cost Sheet.
 */
const CostSheetInteractiveTable: React.FC<CostSheetInteractiveTableProps> = ({ sections, calculatedValues, annexes }) => {
  const flattenRows = (rows: RowData[]): RowData[] => {
    let all: RowData[] = [];
    for (const row of rows) {
      all.push(row);
      if (row.children && row.children.length > 0) {
        all = [...all, ...flattenRows(row.children)];
      }
    }
    return all;
  };

  const allRows = useMemo(() => flattenRows(sections.flatMap(s => s.rows)), [sections]);

  return (
    <div data-testid="cost-sheet-interactive-table" className="neu-card p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[1000px]">
          <thead className="bg-slate-100 dark:bg-slate-800/50 sticky-header">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider w-auto min-w-[250px]">Concepto</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider w-32">Valor Histórico</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider w-40">Forma de Cálculo</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider w-56">Base de Cálculo</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider w-32">Coeficiente</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider w-40">Total</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider w-20">Ayuda</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((section, sectionIndex) => (
              <React.Fragment key={section.id}>
                <tr className="bg-slate-200 dark:bg-slate-900 sticky top-0 z-10">
                  <td colSpan={7} className="px-4 py-2 font-black text-primary uppercase tracking-widest text-xs">
                    {section.label}
                  </td>
                </tr>
                {section.rows.map((row: RowData, rowIndex: number) => (
                  <CostSheetRow
                    key={row.id}
                    row={row}
                    level={0}
                    calculatedValues={calculatedValues}
                    path={['sections', sectionIndex, 'rows', rowIndex]}
                    annexes={annexes}
                    allRows={allRows}
                  />
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CostSheetInteractiveTable;
