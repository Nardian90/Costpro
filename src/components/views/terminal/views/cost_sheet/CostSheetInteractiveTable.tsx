
'use client';

import React, { useState, useMemo, memo } from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { ChevronRight, HelpCircle, CornerDownRight, AlertTriangle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn, formatCurrency } from '@/lib/utils';
import { FormulaEditor } from './FormulaEditor';
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
  calculated: CalculatedRowValue;
  calculatedValues: CalculatedValues;
  path: (string | number)[]; // Path to this row in the Zustand store
  annexes: CostSheetAnnex[];
  suggestions: { label: string; value: string; description?: string }[];
}

/**
 * Renders a single, potentially recursive, row in the cost sheet table.
 */
const CostSheetRow: React.FC<RowProps> = memo(({ row, level, calculated, calculatedValues, path, annexes, suggestions }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isEditingTotal, setIsEditingTotal] = useState(false);
  const { updateValue } = useCostSheetStore();

  const hasChildren = row.children && row.children.length > 0;

  const handleToggle = () => {
    if (hasChildren) {
      setIsExpanded(!isExpanded);
    }
  };

  const handleValueChange = (field: string, value: any) => {
    updateValue([...path, field], value);
  };

  const handleTotalSave = (val: string) => {
    setIsEditingTotal(false);

    // Improved check for fixed values, especially '0'
    const trimmedVal = val.trim();
    if (trimmedVal.startsWith('=')) {
      // It's a formula
      updateValue([...path, 'formula'], trimmedVal);
      updateValue([...path, 'calculationMethod'], 'FORMULA');
    } else if (trimmedVal !== '' && !isNaN(Number(trimmedVal))) {
      // It's a valid fixed number (including 0)
      const num = Number(trimmedVal);
      const field = row.hasOwnProperty('valorHistorico') ? 'valorHistorico' : 'value';
      updateValue([...path, field], num);
      updateValue([...path, 'calculationMethod'], 'ValorFijo');
      updateValue([...path, 'formula'], ''); // Clear formula

      // If it was a percentage row, clear it to ensure the fixed value is respected
      if (row.is_percent) {
        updateValue([...path, 'is_percent'], false);
      }
    } else if (trimmedVal === '') {
        // Reset to 0 if empty
        const field = row.hasOwnProperty('valorHistorico') ? 'valorHistorico' : 'value';
        updateValue([...path, field], 0);
        updateValue([...path, 'calculationMethod'], 'ValorFijo');
        updateValue([...path, 'formula'], '');
        if (row.is_percent) {
          updateValue([...path, 'is_percent'], false);
        }
    }
  };


  const isResultRow = row.is_percent || ['5', '12', '13', '13.1', '13.2', '14'].includes(row.id);
  const safeCalculated = calculated || { total: 0, valorHistorico: 0, baseTotal: 0, coeficiente: 0, hasWarnings: false, audits: [] };
  const showWarning = safeCalculated.hasWarnings || (!hasChildren && !row.is_percent && safeCalculated.total === 0 && ((row.valorHistorico ?? 0) > 0 || !!row.baseDeCalculoRef));

  return (
    <>
      <TableRow className={cn(
        "border-t border-border/50 hover:bg-primary/5 transition-colors group",
        isResultRow && "bg-primary/5 font-bold"
      )}>
        {/* Concepto */}
        <TableCell style={{ paddingLeft: `${level * 24 + 12}px` }} className="py-2.5 font-medium text-foreground sticky-column-1 min-w-[250px]">
          <div className="flex items-center gap-2 min-w-0">
            {hasChildren && (
              <button onClick={handleToggle} className="p-1 rounded-full hover:bg-primary/10 shrink-0">
                <ChevronRight className={cn('w-4 h-4 transition-transform', isExpanded && 'rotate-90')} />
              </button>
            )}
            {!hasChildren && <CornerDownRight className="w-4 h-4 text-muted-foreground shrink-0 ml-1" />}
            <span className="truncate flex-1">{row.label}</span>
          </div>
        </TableCell>

        {/* Valor Histórico / % */}
        <TableCell className="px-4 py-2 text-right w-40">
            <div className="relative">
                <Input
                type="number"
                step={row.is_percent ? "0.001" : "1"}
                className={cn(
                  "neu-input text-right h-9 sm:h-8 transition-all",
                  row.is_percent && "pr-6",
                  hasChildren && "bg-muted/30 font-bold border-dashed cursor-default"
                )}
                value={hasChildren
                  ? (safeCalculated.valorHistorico ?? 0).toFixed(row.is_percent ? 3 : 2)
                  : (row.hasOwnProperty('valorHistorico') ? (row.valorHistorico ?? 0) : (row.is_percent ? ((row.value ?? 0) * 100) : (row.value ?? 0)))}
                readOnly={hasChildren}
                onChange={(e) => {
                  if (hasChildren) return;
                  const val = e.target.value;
                  const numVal = parseFloat(val) || 0;
                  handleValueChange(
                    row.hasOwnProperty('valorHistorico') ? 'valorHistorico' : 'value',
                    row.is_percent ? numVal / 100 : numVal
                  );
                  // Ensure engine respects manual changes
                  handleValueChange('calculationMethod', 'ValorFijo');
                  handleValueChange('formula', '');
                }}
                onFocus={(e) => !hasChildren && e.target.select()}
                />
                {row.is_percent && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">%</span>}
                {hasChildren && <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full animate-pulse" title="Calculado automáticamente" />}
            </div>
        </TableCell>

        {/* Total */}
        <TableCell
          className="px-4 py-2 text-right font-black tabular-nums text-primary w-48 cursor-pointer hover:bg-primary/5 transition-colors"
          onClick={() => setIsEditingTotal(true)}
        >
          {isEditingTotal ? (
            <FormulaEditor
              initialValue={row.formula || String(safeCalculated.total)}
              onSave={handleTotalSave}
              onCancel={() => setIsEditingTotal(false)}
              suggestions={suggestions}
            />
          ) : (
            <div className="flex items-center justify-end gap-2 group-hover:scale-105 transition-transform origin-right">
                {showWarning && (
                    <Popover>
                        <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <AlertTriangle className={cn("w-4 h-4 cursor-help animate-pulse", calculated.hasWarnings ? "text-destructive" : "text-amber-500")} />
                        </PopoverTrigger>
                        <PopoverContent className="w-80" onClick={(e) => e.stopPropagation()}>
                            <p className={cn("text-xs font-bold mb-1", calculated.hasWarnings ? "text-destructive" : "text-amber-600")}>
                                {calculated.hasWarnings ? "Errores de Motor" : "Advertencia de Cálculo"}
                            </p>
                            <div className="space-y-2">
                                {calculated.audits && calculated.audits.length > 0 ? (
                                    calculated.audits.map((a: any, idx: number) => (
                                        <div key={idx} className="text-[10px] bg-muted p-1.5 rounded border border-border">
                                            <span className="font-bold uppercase text-[8px] block opacity-50">{a.type}</span>
                                            {a.note}
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-[10px] text-slate-500">Esta fila tiene un total de 0.00 pero tiene una base de cálculo o valor histórico asignado. Verifique el prorrateo o la fórmula.</p>
                                )}
                            </div>
                        </PopoverContent>
                    </Popover>
                )}
                <span className={cn(row.formula && "underline decoration-dotted decoration-primary/30")}>
                    {formatCurrency(safeCalculated.total)}
                </span>
            </div>
          )}
        </TableCell>

        {/* Ayuda - Hidden on very small screens */}
        <TableCell className="px-4 py-2 text-center w-12 sm:w-20 hidden sm:table-cell">
          {row.helpText && (
            <Popover>
              <PopoverTrigger asChild>
                 <button className="p-2 rounded-full hover:bg-primary/10 text-primary/50 hover:text-primary transition-colors">
                    <HelpCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                 </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 sm:w-80"><p className="text-sm">{row.helpText}</p></PopoverContent>
            </Popover>
          )}
        </TableCell>
      </TableRow>

      {isExpanded && hasChildren && row.children?.map((child, index) => (
        <CostSheetRow
          key={child.id}
          row={child}
          level={level + 1}
          calculated={calculatedValues[child.id]}
          calculatedValues={calculatedValues}
          path={[...path, 'children', index]}
          annexes={annexes}
          suggestions={suggestions}
        />
      ))}
    </>
  );
});

/**
 * The main interactive table component for the Cost Sheet.
 * Decomposed by sections for a more professional and clean enterprise-level experience.
 */
const CostSheetInteractiveTable: React.FC<CostSheetInteractiveTableProps> = ({ sections, calculatedValues, annexes }) => {
  const [activeSubSectionId, setActiveSubSectionId] = useState(sections[0]?.id || '');

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

  const suggestions = useMemo(() => [
    ...annexes.map(a => ({ label: `Anexo ${a.id}`, value: `Anexo${a.id}`, description: a.title })),
    ...allRows.map(r => ({ label: `Fila ${r.id}`, value: `ref('${r.id}')`, description: r.label })),
    { label: 'SUMA', value: 'SUMA(', description: 'Suma de valores' },
    { label: 'PROMEDIO', value: 'PROMEDIO(', description: 'Promedio de valores' },
    { label: 'MAX', value: 'MAX(', description: 'Valor máximo' },
    { label: 'MIN', value: 'MIN(', description: 'Valor mínimo' },
    { label: 'PCT', value: 'pct(', description: 'Porcentaje: pct(valor, %)' },
    { label: 'ROUND2', value: 'round2(', description: 'Redondear a 2 decimales' },
    { label: 'VH', value: 'VH', description: 'Valor Histórico de la fila' },
    { label: 'BASE_TOTAL', value: 'BASE_TOTAL', description: 'Total de la base de cálculo' },
  ], [annexes, allRows]);

  return (
    <div data-testid="cost-sheet-interactive-table" className="space-y-6">
        {/* Secondary Navigation for Sections within the Main Table */}
        <div className="space-y-3 mb-8">
            <div className="text-[10px] font-black uppercase tracking-[0.4em] text-primary/70 px-2 flex items-center gap-2">
                <div className="w-1 h-1 bg-primary rounded-full" />
                Secciones de la Ficha
            </div>
            <div className="flex flex-wrap gap-2 bg-background/50 backdrop-blur-sm p-2 rounded-[2rem] border border-sidebar-border/30 overflow-x-auto no-scrollbar shadow-inner">
                {sections.map(s => (
                    <button
                        key={s.id}
                        onClick={() => setActiveSubSectionId(s.id)}
                        className={cn(
                            "px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0 active:scale-95",
                            activeSubSectionId === s.id
                                ? "bg-primary text-white shadow-xl shadow-primary/20 scale-105"
                                : "bg-background/50 text-sidebar-foreground/60 hover:bg-primary/5 hover:text-primary"
                        )}
                    >
                        {s.label}
                    </button>
                ))}
            </div>
        </div>

        {sections.map((section, sectionIndex) => (
            section.id === activeSubSectionId && (
                <div key={section.id} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <div className="flex items-center gap-3 mb-4 px-1">
                        <div className="w-1.5 h-6 bg-primary rounded-full" />
                        <h3 className="text-sm font-black uppercase tracking-[0.2em] text-foreground/80">
                            {section.label}
                        </h3>
                    </div>

                    <div className="neu-card p-0 overflow-hidden border-border/50 shadow-sm hover:shadow-md transition-shadow">
                        <div className="table-scroll-wrapper sticky-column-1">
                        <Table className="w-full min-w-[600px] sm:min-w-[700px]">
                            <TableHeader className="bg-muted/30 text-muted-foreground font-black uppercase text-[10px] tracking-widest border-b border-border sticky-header">
                                <TableRow>
                                    <TableHead className="px-4 py-4 text-left font-black uppercase tracking-widest min-w-[200px] sm:min-w-[250px]">Concepto</TableHead>
                                    <TableHead className="px-4 py-4 text-right font-black uppercase tracking-widest w-32 sm:w-40">Valor Histórico</TableHead>
                                    <TableHead className="px-4 py-4 text-right font-black uppercase tracking-widest w-40 sm:w-48">Total</TableHead>
                                    <TableHead className="px-4 py-4 text-center font-black uppercase tracking-widest w-12 sm:w-20 hidden sm:table-cell">Ayuda</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {section.rows.map((row: RowData, rowIndex: number) => (
                                    <CostSheetRow
                                        key={row.id}
                                        row={row}
                                        level={0}
                                        calculated={calculatedValues[row.id]}
                                        calculatedValues={calculatedValues}
                                        path={['sections', sectionIndex, 'rows', rowIndex]}
                                        annexes={annexes}
                                        suggestions={suggestions}
                                    />
                                ))}
                            </TableBody>
                        </Table>
                        </div>
                    </div>
                </div>
            )
        ))}
    </div>
  );
};

export default CostSheetInteractiveTable;
