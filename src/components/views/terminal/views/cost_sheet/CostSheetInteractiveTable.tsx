
'use client';

import React, { useState, useMemo, memo } from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { useCostSheetCalculator } from '@/hooks/logic/useCostSheetCalculator';
import { ChevronRight, HelpCircle, CornerDownRight, AlertTriangle, Settings2, Eye } from 'lucide-react';
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
  calculatedValues: CalculatedValues; // Still need this for children
  path: (string | number)[]; // Path to this row in the Zustand store
  annexes: CostSheetAnnex[];
  allRows: RowData[];
  isTechnicalMode: boolean;
}

/**
 * Renders a single, potentially recursive, row in the cost sheet table.
 */
const CostSheetRow: React.FC<RowProps> = memo(({ row, level, calculated, calculatedValues, path, annexes, allRows, isTechnicalMode }) => {
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
    if (val.startsWith('=')) {
      // It's a formula
      updateValue([...path, 'formula'], val);
      updateValue([...path, 'calculationMethod'], 'FORMULA');
    } else {
      // It's a fixed value
      const num = parseFloat(val) || 0;
      const field = row.hasOwnProperty('valorHistorico') ? 'valorHistorico' : 'value';
      updateValue([...path, field], num);
      updateValue([...path, 'calculationMethod'], 'ValorFijo');
      updateValue([...path, 'formula'], ''); // Clear formula
    }
  };

  const baseOptions = useMemo(() => [
    ...annexes.map(a => ({ value: a.id, label: `Anexo ${a.id}`, description: a.title })),
    ...allRows.filter(r => r.id !== row.id).map(r => ({ value: r.id, label: `Fila ${r.id}: ${r.label}` }))
  ], [annexes, allRows, row.id]);

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
        <TableCell className={cn("px-4 py-2 text-right w-32", !isTechnicalMode && "hidden")}>
          {(row.calculationMethod === 'Prorrateo' || row.hasOwnProperty('formula') || hasChildren) && !row.is_percent ? (
            <div className="h-8 flex items-center justify-end px-3 text-sm font-bold text-primary/70 bg-primary/5 rounded-md border border-primary/10 tabular-nums">
              {formatCurrency(safeCalculated.valorHistorico || 0).replace('$', '').trim()}
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
                  const numVal = parseFloat(val) || 0;
                  handleValueChange(
                    row.hasOwnProperty('valorHistorico') ? 'valorHistorico' : 'value',
                    row.is_percent ? numVal / 100 : numVal
                  );
                }}
                onFocus={(e) => e.target.select()}
                />
                {row.is_percent && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">%</span>}
            </div>
          ) : <span className="text-sm text-slate-400">-</span>}
        </TableCell>

        {/* Forma de Cálculo */}
        <TableCell className={cn("px-4 py-2 w-40", !isTechnicalMode && "hidden")}>
          {!hasChildren && !row.formula && !row.is_percent ? (
            <Select value={row.calculationMethod || 'ValorFijo'} onValueChange={(value) => handleValueChange('calculationMethod', value)}>
              <SelectTrigger className="neu-input h-8">
                <SelectValue placeholder="Método..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Prorrateo">Prorrateo</SelectItem>
                <SelectItem value="ValorFijo">Valor Fijo</SelectItem>
              </SelectContent>
            </Select>
          ) : <span className="text-sm text-slate-400">{row.calculationMethod || (row.formula ? 'Fórmula' : '-')}</span>}
        </TableCell>

        {/* Base de Cálculo */}
        <TableCell className={cn("px-4 py-2 min-w-[180px]", !isTechnicalMode && "hidden")}>
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
          ) : <span className="text-sm text-slate-400">{row.baseDeCalculoRef || '-'}</span>}
        </TableCell>

        {/* Coeficiente */}
        <TableCell className={cn("px-4 py-2 text-right tabular-nums text-muted-foreground w-32", !isTechnicalMode && "hidden")}>
          {safeCalculated.coeficiente > 0 ? safeCalculated.coeficiente.toFixed(6) : <span className="text-sm text-slate-400">-</span>}
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

        {/* Ayuda */}
        <TableCell className="px-4 py-2 text-center w-20">
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
          allRows={allRows}
          isTechnicalMode={isTechnicalMode}
        />
      ))}
    </>
  );
});

/**
 * The main interactive table component for the Cost Sheet.
 */
const CostSheetInteractiveTable: React.FC<CostSheetInteractiveTableProps> = ({ sections, calculatedValues, annexes }) => {
  const [isTechnicalMode, setIsTechnicalMode] = useState(false);

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
    <div data-testid="cost-sheet-interactive-table" className="space-y-4">
        <div className="flex justify-end px-2">
            <button
                onClick={() => setIsTechnicalMode(!isTechnicalMode)}
                className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    isTechnicalMode ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
            >
                {isTechnicalMode ? <Eye className="w-3.5 h-3.5" /> : <Settings2 className="w-3.5 h-3.5" />}
                {isTechnicalMode ? "Modo Operativo" : "Modo Técnico"}
            </button>
        </div>

        <div className="neu-card p-0 overflow-hidden border-border/50">
            <Table className="w-full table-fixed min-w-[800px]">
            <TableHeader className="bg-muted/30 text-muted-foreground font-black uppercase text-[10px] tracking-widest border-b border-border">
                <TableRow>
                <TableHead className="px-4 py-4 text-left font-black uppercase tracking-widest sticky-column-1 min-w-[250px]">Concepto</TableHead>
                <TableHead className={cn("px-4 py-4 text-right font-black uppercase tracking-widest w-32", !isTechnicalMode && "hidden")}>Valor Histórico</TableHead>
                <TableHead className={cn("px-4 py-4 text-left font-black uppercase tracking-widest w-40", !isTechnicalMode && "hidden")}>Forma de Cálculo</TableHead>
                <TableHead className={cn("px-4 py-4 text-left font-black uppercase tracking-widest w-56", !isTechnicalMode && "hidden")}>Base de Cálculo</TableHead>
                <TableHead className={cn("px-4 py-4 text-right font-black uppercase tracking-widest w-32", !isTechnicalMode && "hidden")}>Coeficiente</TableHead>
                <TableHead className="px-4 py-4 text-right font-black uppercase tracking-widest w-48">Total</TableHead>
                <TableHead className="px-4 py-4 text-center font-black uppercase tracking-widest w-20">Ayuda</TableHead>
                </TableRow>
            </TableHeader>
          <TableBody>
            {sections.map((section, sectionIndex) => (
              <React.Fragment key={section.id}>
                <TableRow className="bg-muted/50 border-b border-border/50">
                  <TableCell colSpan={7} className="px-4 py-2 font-black text-primary uppercase tracking-widest text-xs">
                    {section.label}
                  </TableCell>
                </TableRow>
                {section.rows.map((row: RowData, rowIndex: number) => (
                  <CostSheetRow
                    key={row.id}
                    row={row}
                    level={0}
                    calculated={calculatedValues[row.id]}
                    calculatedValues={calculatedValues}
                    path={['sections', sectionIndex, 'rows', rowIndex]}
                    annexes={annexes}
                    allRows={allRows}
                    isTechnicalMode={isTechnicalMode}
                  />
                ))}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default CostSheetInteractiveTable;
