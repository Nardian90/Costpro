
'use client';

import React, { useState, useMemo, memo } from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { ChevronRight, HelpCircle, CornerDownRight, AlertTriangle, ListFilter, LayoutGrid, ArrowRight, FunctionSquare } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
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
  activeSubSectionId: string;
  setActiveSubSectionId: (id: string) => void;
  onOpenSections?: () => void;
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
  const updateValue = useCostSheetStore(state => state.updateValue);

  const hasChildren = row.children && row.children.length > 0;

  const handleToggle = () => {
    if (hasChildren) {
      setIsExpanded(!isExpanded);
    }
  };

  const handleValueChange = React.useCallback((field: string, value: any) => {
    updateValue([...path, field], value);
  }, [path, updateValue]);

  const handleTotalSave = React.useCallback((val: string) => {
    setIsEditingTotal(false);

    const trimmedVal = val.trim();
    if (trimmedVal === '') {
        // Reset to 0 if empty
        const field = row.hasOwnProperty('valorHistorico') ? 'valorHistorico' : 'value';
        updateValue([...path, field], 0);
        updateValue([...path, 'calculationMethod'], 'ValorFijo');
        updateValue([...path, 'formula'], '');
        if (row.is_percent) {
          updateValue([...path, 'is_percent'], false);
        }
        return;
    }

    // Cost Sheet Logic: Any non-empty input is treated as a formula unless it's a simple number.
    // However, per user request and memory, we should persist formulas even without '='.
    // If it's a number, we also save it as formula to keep it in the Total column.

    updateValue([...path, 'formula'], trimmedVal);
    updateValue([...path, 'calculationMethod'], 'FORMULA');

    // If it's a number and it was a percentage row, clear is_percent to ensure fixed value is respected
    if (row.is_percent && !isNaN(Number(trimmedVal))) {
      updateValue([...path, 'is_percent'], false);
    }
  }, [path, updateValue, row.is_percent]);


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
        <TableCell style={{ paddingLeft: `${level * 24 + 12}px` }} className="px-2 py-2 sm:px-4 sm:py-2.5 font-medium text-[13px] sm:text-sm text-foreground min-w-[180px] sm:min-w-[250px]">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            {hasChildren && (
              <button onClick={handleToggle} className="p-1 rounded-full hover:bg-primary/10 shrink-0">
                <ChevronRight className={cn('w-3.5 h-3.5 sm:w-4 h-4 transition-transform', isExpanded && 'rotate-90')} />
              </button>
            )}
            {!hasChildren && <CornerDownRight className="w-3.5 h-3.5 sm:w-4 h-4 text-muted-foreground shrink-0 ml-1" />}
            <span className="truncate flex-1">{row.label}</span>
          </div>
        </TableCell>

        {/* Valor Histórico / % */}
        <TableCell className="px-2 py-1.5 sm:px-4 sm:py-2 text-right w-32 sm:w-40">
            <div className="relative">
                <Input
                type="number"
                step={row.is_percent ? "0.001" : "1"}
                className={cn(
                  "neu-input text-right h-8 transition-all text-xs sm:text-sm px-2",
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
          className="px-2 py-1.5 sm:px-4 sm:py-2 text-right font-black tabular-nums text-primary w-36 sm:w-48 cursor-pointer hover:bg-primary/5 transition-colors text-xs sm:text-sm"
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
                <div className="flex items-center gap-1">
                    {row.formula && <FunctionSquare className="w-3 h-3 text-primary/40" />}
                    <span className={cn(row.formula && "underline decoration-dotted decoration-primary/30")}>
                        {formatCurrency(safeCalculated.total)}
                    </span>
                </div>
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
const CostSheetInteractiveTable: React.FC<CostSheetInteractiveTableProps> = memo(({
    sections,
    calculatedValues,
    annexes,
    activeSubSectionId,
    setActiveSubSectionId,
    onOpenSections
}) => {
  const allRows = useMemo(() => {
    const all: RowData[] = [];
    const flatten = (rows: RowData[]) => {
      for (const row of rows) {
        all.push(row);
        if (row.children && row.children.length > 0) {
          flatten(row.children);
        }
      }
    };
    flatten(sections.flatMap(s => s.rows));
    return all;
  }, [sections]);

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

  if (!activeSubSectionId) {
      return (
          <div className="py-12 px-4 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="max-w-md mx-auto space-y-6">
                  <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-8 neu-raised-sm">
                      <LayoutGrid className="w-10 h-10 text-primary animate-pulse" />
                  </div>
                  <h2 className="text-2xl font-black text-foreground uppercase tracking-tighter italic">Seleccione una Sección</h2>
                  <p className="text-muted-foreground text-sm font-medium leading-relaxed">
                      Para comenzar a visualizar o editar los datos de la tabla principal, elija una de las secciones disponibles en el menú superior o en la cuadrícula a continuación.
                  </p>

                  <div className="grid grid-cols-1 gap-3 pt-8">
                      {sections.map(section => (
                          <button
                            key={section.id}
                            onClick={() => setActiveSubSectionId(section.id)}
                            className="flex items-center justify-between p-4 rounded-2xl bg-background border border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-all group neu-raised-sm active:scale-[0.98]"
                          >
                              <div className="flex items-center gap-3 text-left">
                                  <div className="w-1.5 h-8 bg-muted group-hover:bg-primary rounded-full transition-colors" />
                                  <span className="font-bold text-sm uppercase tracking-wider">{section.label}</span>
                              </div>
                              <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all translate-x-[-10px] group-hover:translate-x-0" />
                          </button>
                      ))}
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div data-testid="cost-sheet-interactive-table" className="space-y-6">
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
                        <div className="table-scroll-wrapper">
                        <Table className="w-full min-w-[500px] sm:min-w-[700px]">
                            <TableHeader className="bg-muted/30 text-muted-foreground font-black uppercase text-[9px] sm:text-[10px] tracking-widest border-b border-border">
                                <TableRow>
                                    <TableHead className="px-2 py-3 sm:px-4 sm:py-4 text-left font-black uppercase tracking-widest min-w-[180px] sm:min-w-[250px]">Concepto</TableHead>
                                    <TableHead className="px-2 py-3 sm:px-4 sm:py-4 text-right font-black uppercase tracking-widest w-32 sm:w-40">Valor Histórico</TableHead>
                                    <TableHead className="px-2 py-3 sm:px-4 sm:py-4 text-right font-black uppercase tracking-widest w-36 sm:w-48">Total</TableHead>
                                    <TableHead className="px-2 py-3 sm:px-4 sm:py-4 text-center font-black uppercase tracking-widest w-12 sm:w-20 hidden sm:table-cell">Ayuda</TableHead>
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
});

export default CostSheetInteractiveTable;
