
'use client';

import React, { useState, useMemo, memo } from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { ChevronRight, HelpCircle, CornerDownRight, AlertTriangle, ListFilter, LayoutGrid, ArrowRight, FunctionSquare, Plus, Trash2, Edit2, ChevronUp, ChevronDown, Download, Upload, CheckCircle2, XCircle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { cn, formatCurrency } from '@/lib/utils';
import { FormulaEditor } from './FormulaEditor';
import { exportSectionToExcel, importSectionFromExcel } from '@/services/excel-service';
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
  groupedSections?: { id: string, label: string, sectionIds: string[] }[];
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
  index: number;
  numbering: string;
  calculated: CalculatedRowValue;
  calculatedValues: CalculatedValues;
  path: (string | number)[]; // Path to this row in the Zustand store
  annexes: CostSheetAnnex[];
  suggestions: { label: string; value: string; description?: string }[];
}

/**
 * Renders a single, potentially recursive, row in the cost sheet table.
 */
const CostSheetRow: React.FC<RowProps> = memo(({ row, level, index, numbering, calculated, calculatedValues, path, annexes, suggestions }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isEditingTotal, setIsEditingTotal] = useState(false);
  const [isEditingVH, setIsEditingVH] = useState(false);
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const updateValue = useCostSheetStore(state => state.updateValue);
  const updateValues = useCostSheetStore(state => state.updateValues);
  const addMainRow = useCostSheetStore(state => state.addMainRow);
  const removeMainRow = useCostSheetStore(state => state.removeMainRow);
  const reorderMainRow = useCostSheetStore(state => state.reorderMainRow);

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
        const field = row.hasOwnProperty('valor_historico') ? 'valor_historico' : 'value';
        updateValue([...path, field], 0);
        updateValue([...path, 'calculation_method'], 'ValorFijo');
        updateValue([...path, 'formula'], '');
        if (row.is_percent) {
          updateValue([...path, 'is_percent'], false);
        }
        return;
    }

    // Cost Sheet Logic: Any non-empty input is treated as a formula unless it's a simple number.
    // However, per user request and memory, we should persist formulas even without '='.
    // If it's a number, we also save it as formula to keep it in the Total column.

    const updates: { path: (string | number)[], value: string | number | boolean }[] = [
        { path: [...path, 'formula'], value: trimmedVal },
        { path: [...path, 'calculation_method'], value: 'FORMULA' }
    ];

    // If it's a number and it was a percentage row, clear is_percent to ensure fixed value is respected
    if (row.is_percent && !isNaN(Number(trimmedVal))) {
        updates.push({ path: [...path, 'is_percent'], value: false });
    }

    updateValues(updates);
  }, [path, updateValues, row.is_percent]);

  const handleVHSave = React.useCallback((val: string) => {
    setIsEditingVH(false);
    const trimmedVal = val.trim();
    if (trimmedVal === '') {
        updateValue([...path, 'valor_historico'], 0);
        updateValue([...path, 'vh_formula'], '');
        return;
    }

    if (trimmedVal.startsWith('=') || isNaN(Number(trimmedVal))) {
        updateValue([...path, 'vh_formula'], trimmedVal);
    } else {
        updateValue([...path, 'valor_historico'], parseFloat(trimmedVal));
        updateValue([...path, 'vh_formula'], '');
    }
  }, [path, updateValue]);


  const isResultRow = row.is_percent || ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '13.1', '13.2', '14', '15', '16'].includes(String(row.id));
  const safeCalculated = calculated || { total: 0, valor_historico: 0, base_total: 0, coeficiente: 0, has_warnings: false, audits: [], validation_errors: [], fuente: '', metadata: {} };

  const criticalErrors = (safeCalculated.validation_errors || []).filter(e => e.type === 'CRITICAL');
  const warningErrors = (safeCalculated.validation_errors || []).filter(e => e.type === 'WARNING');
  const infoErrors = (safeCalculated.validation_errors || []).filter(e => e.type === 'INFO');
  const hasEngineWarnings = safeCalculated.has_warnings || (!hasChildren && !row.is_percent && safeCalculated.total === 0 && ((row.valor_historico ?? 0) > 0 || !!row.base_ref));

  return (
    <>
      <TableRow className={cn(
        "border-t border-border/50 hover:bg-primary/5 transition-colors group",
        isResultRow && "bg-primary/5 font-bold"
      )}>
        {/* No. */}
        <TableCell className="w-12 px-2 py-2 text-center text-[10px] font-black text-muted-foreground/60 tabular-nums">
            {numbering}
        </TableCell>

        {/* Concepto */}
        <TableCell style={{ paddingLeft: `${level * 24 + 12}px` }} className="px-2 py-2 sm:px-4 sm:py-2.5 font-medium text-[13px] sm:text-sm text-foreground min-w-[180px] sm:min-w-[250px]">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 group/row">
            {hasChildren && (
              <button onClick={handleToggle} className="p-1 rounded-full hover:bg-primary/10 shrink-0">
                <ChevronRight className={cn('w-3.5 h-3.5 sm:w-4 h-4 transition-transform', isExpanded && 'rotate-90')} />
              </button>
            )}
            {!hasChildren && <CornerDownRight className="w-3.5 h-3.5 sm:w-4 h-4 text-muted-foreground shrink-0 ml-1" />}

            {isEditingLabel ? (
                <Input
                    autoFocus
                    className="h-7 text-xs sm:text-sm py-0"
                    defaultValue={row.label}
                    onBlur={(e) => {
                        handleValueChange('label', e.target.value);
                        setIsEditingLabel(false);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            handleValueChange('label', (e.target as HTMLInputElement).value);
                            setIsEditingLabel(false);
                        }
                    }}
                />
            ) : (
                <span className="truncate flex-1 cursor-text" onClick={() => setIsEditingLabel(true)}>{row.label}</span>
            )}

            {/* Row Actions */}
            <div className="hidden group-hover/row:flex items-center gap-0.5 ml-auto shrink-0 animate-in fade-in slide-in-from-right-2">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 sm:h-6 sm:w-6 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                    onClick={() => reorderMainRow(path, 'up')}
                    title="Mover arriba"
                >
                    <ChevronUp className="h-4 w-4 sm:h-3 sm:w-3" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 sm:h-6 sm:w-6 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                    onClick={() => reorderMainRow(path, 'down')}
                    title="Mover abajo"
                >
                    <ChevronDown className="h-4 w-4 sm:h-3 sm:w-3" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 sm:h-6 sm:w-6 text-primary hover:bg-primary/10"
                    onClick={() => addMainRow([...path, 'children'])}
                    title="Añadir hijo"
                >
                    <Plus className="h-4 w-4 sm:h-3 sm:w-3" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 sm:h-6 sm:w-6 text-destructive hover:bg-destructive/10"
                    onClick={() => removeMainRow(path)}
                    title="Eliminar fila"
                >
                    <Trash2 className="h-4 w-4 sm:h-3 sm:w-3" />
                </Button>
            </div>
          </div>
        </TableCell>

        {/* Valor Histórico / % */}
        <TableCell className="px-2 py-1.5 sm:px-4 sm:py-2 text-right w-32 sm:w-40 cursor-pointer" onClick={() => !hasChildren && setIsEditingVH(true)}>
            <div className="relative">
                {isEditingVH ? (
                    <FormulaEditor
                        initialValue={row.vh_formula || String(row.valor_historico || 0)}
                        onSave={handleVHSave}
                        onCancel={() => setIsEditingVH(false)}
                        suggestions={suggestions}
                    />
                ) : (
                    <div className="flex items-center justify-end gap-1">
                        <Input
                        type="text"
                        className={cn(
                        "neu-input text-right h-8 transition-all text-xs sm:text-sm px-2 cursor-pointer flex-1",
                        row.is_percent && "pr-6",
                        (hasChildren || row.vh_formula) && "bg-muted/30 font-bold border-dashed"
                        )}
                        value={hasChildren
                        ? (safeCalculated.calculated_vh ?? safeCalculated.valor_historico ?? 0).toFixed(row.is_percent ? 3 : 2)
                        : (row.vh_formula
                            ? (safeCalculated.calculated_vh ?? 0).toFixed(row.is_percent ? 3 : 2)
                            : (row.hasOwnProperty('valor_historico') ? (row.valor_historico ?? 0) : (row.is_percent ? ((row.value ?? 0) * 100) : (row.value ?? 0))))}
                        readOnly={true}
                        />
                        {row.vh_formula && <FunctionSquare className="w-3 h-3 text-primary/40 absolute left-2" />}
                        {row.is_percent && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">%</span>}
                        {(hasChildren || row.vh_formula) && <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full animate-pulse" title="Calculado automáticamente" />}
                    </div>
                )}
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
                {/* Validation Status Icons */}
                <Popover>
                    <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <div className="cursor-help flex items-center">
                            {criticalErrors.length > 0 ? (
                                <XCircle className="w-4 h-4 text-destructive animate-pulse" />
                            ) : (warningErrors.length > 0 || hasEngineWarnings) ? (
                                <AlertTriangle className="w-4 h-4 text-amber-500 animate-bounce" />
                            ) : infoErrors.length > 0 ? (
                                <HelpCircle className="w-4 h-4 text-blue-500 opacity-70 group-hover:opacity-100 transition-opacity" />
                            ) : isResultRow ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-500 opacity-40 group-hover:opacity-100 transition-opacity" />
                            ) : null}
                        </div>
                    </PopoverTrigger>
                    <PopoverContent className="w-80" onClick={(e) => e.stopPropagation()}>
                        <p className={cn(
                            "text-xs font-bold mb-2 uppercase tracking-tight",
                            criticalErrors.length > 0 ? "text-destructive" : (warningErrors.length > 0 || hasEngineWarnings) ? "text-amber-600" : infoErrors.length > 0 ? "text-blue-600" : "text-emerald-600"
                        )}>
                            {criticalErrors.length > 0 ? "Errores Críticos" : (warningErrors.length > 0 || hasEngineWarnings) ? "Advertencias" : infoErrors.length > 0 ? "Información" : "Estado Correcto"}
                        </p>
                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                            {/* Deep Validation Errors */}
                            {(safeCalculated.validation_errors || []).map((ve, idx) => (
                                <div key={`ve-${idx}`} className={cn(
                                    "text-[10px] p-2 rounded border flex gap-2",
                                    ve.type === 'CRITICAL' ? "bg-destructive/5 border-destructive/20 text-destructive" :
                                    ve.type === 'WARNING' ? "bg-amber-50 border-amber-200 text-amber-800" :
                                    "bg-blue-50 border-blue-200 text-blue-800"
                                )}>
                                    <div className="mt-0.5">
                                        {ve.type === 'CRITICAL' ? <XCircle className="w-3 h-3" /> :
                                         ve.type === 'WARNING' ? <AlertTriangle className="w-3 h-3" /> :
                                         <HelpCircle className="w-3 h-3" />}
                                    </div>
                                    <div>
                                        <span className="font-bold uppercase text-[8px] block opacity-70">{ve.code}</span>
                                        {ve.message}
                                    </div>
                                </div>
                            ))}

                            {/* Calculation Context / Auditability */}
                            {(safeCalculated.fuente || safeCalculated.metadata?.rule) && (
                                <div className="text-[10px] bg-primary/5 p-2 rounded border border-primary/20 mb-2">
                                    <span className="font-bold uppercase text-[8px] block text-primary opacity-70">Contexto / Base Legal</span>
                                    {safeCalculated.metadata?.rule && <div className="font-black mb-1">{safeCalculated.metadata.rule}</div>}
                                    {safeCalculated.fuente && <div className="italic text-muted-foreground">{safeCalculated.fuente}</div>}
                                </div>
                            )}

                            {/* Engine Audits */}
                            {safeCalculated.audits && safeCalculated.audits.filter(a => a.type === 'ERROR' || a.type === 'WARNING' || a.type === 'CYCLE_DETECTED').map((a: any, idx: number) => (
                                <div key={`audit-${idx}`} className="text-[10px] bg-muted p-1.5 rounded border border-border">
                                    <span className="font-bold uppercase text-[8px] block opacity-50">{a.type}</span>
                                    {a.note}
                                </div>
                            ))}

                            {/* Legacy Warning */}
                            {!hasChildren && !row.is_percent && safeCalculated.total === 0 && ((row.valor_historico ?? 0) > 0 || !!row.base_ref) && (
                                <p className="text-[10px] text-slate-500 italic p-1">
                                    Esta fila tiene un total de 0.00 pero tiene una base de cálculo o valor histórico asignado. Verifique el prorrateo o la fórmula.
                                </p>
                            )}

                            {criticalErrors.length === 0 && warningErrors.length === 0 && !hasEngineWarnings && (
                                <p className="text-[10px] text-emerald-600 font-medium">Los cálculos de esta fila son consistentes con sus dependencias y reglas contables.</p>
                            )}
                        </div>
                    </PopoverContent>
                </Popover>

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
          {row.help_text && (
            <Popover>
              <PopoverTrigger asChild>
                 <button className="p-2 rounded-full hover:bg-primary/10 text-primary/50 hover:text-primary transition-colors">
                    <HelpCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                 </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 sm:w-80"><p className="text-sm">{row.help_text}</p></PopoverContent>
            </Popover>
          )}
        </TableCell>
      </TableRow>

      {isExpanded && hasChildren && (row.children || []).filter(c => !!c).map((child, childIndex) => (
        <CostSheetRow
          key={child.id}
          row={child}
          level={level + 1}
          index={childIndex}
          numbering={`${numbering}.${childIndex + 1}`}
          calculated={calculatedValues?.[child.id] || {} as any}
          calculatedValues={calculatedValues}
          path={[...path, 'children', childIndex]}
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
    groupedSections,
    calculatedValues,
    annexes,
    activeSubSectionId,
    setActiveSubSectionId,
    onOpenSections
}) => {
  const addMainSection = useCostSheetStore(state => state.addMainSection);
  const removeMainSection = useCostSheetStore(state => state.removeMainSection);
  const updateValue = useCostSheetStore(state => state.updateValue);
  const updateValues = useCostSheetStore(state => state.updateValues);
  const addMainRow = useCostSheetStore(state => state.addMainRow);
  const sectionInputRef = React.useRef<HTMLInputElement>(null);
  const [importingSectionIndex, setImportingSectionIndex] = useState<number | null>(null);

  // Smooth scroll to active section/group when selected
  React.useEffect(() => {
    if (activeSubSectionId) {
      // Small delay to allow for rendering if it was filtered
      const timer = setTimeout(() => {
        const element = document.getElementById(activeSubSectionId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [activeSubSectionId]);

  const handleImportSectionExcel = React.useCallback(async (e: React.ChangeEvent<HTMLInputElement>, sectionIndex: number) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const newRows = await importSectionFromExcel(file);
        updateValue(['sections', sectionIndex, 'rows'], newRows);
      } catch (err) {
        console.error(err);
      }
    }
    e.target.value = '';
  }, [updateValue]);

  const allRows = useMemo(() => {
    const all: RowData[] = [];
    const flatten = (rows: RowData[]) => {
      if (!rows) return;
      for (const row of rows) {
        all.push(row);
        if (row.children && row.children.length > 0) {
          flatten(row.children);
        }
      }
    };
    flatten((sections || []).flatMap(s => s?.rows || []));
    return all;
  }, [sections]);

  const suggestions = useMemo(() => [
    ...(annexes || []).map(a => ({ label: `Anexo ${a.id}`, value: `Anexo${a.id}`, description: a.title })),
    ...allRows.map(r => ({ label: `Fila ${r.id}`, value: `ref('${r.id}')`, description: r.label })),
    ...allRows.map(r => ({ label: `VH Fila ${r.id}`, value: `vh('${r.id}')`, description: `Valor Histórico de ${r.label}` })),
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
      const displayItems = groupedSections || sections;

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
                      {displayItems.map((item, idx) => (
                          <div key={item.id} className="relative group">
                              <button
                                onClick={() => setActiveSubSectionId(item.id)}
                                className="w-full flex items-center justify-between p-4 rounded-2xl bg-background border border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-all group neu-raised-sm active:scale-[0.98]"
                              >
                                  <div className="flex items-center gap-3 text-left">
                                      <div className="w-1.5 h-8 bg-muted group-hover:bg-primary rounded-full transition-colors" />
                                      <span className="font-bold text-sm uppercase tracking-wider">{item.label}</span>
                                  </div>
                                  <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all translate-x-[-10px] group-hover:translate-x-0" />
                              </button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="absolute -top-2 -right-2 h-7 w-7 bg-destructive text-white rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-lg hover:bg-destructive/90 z-10"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    removeMainSection(idx);
                                }}
                                title="Eliminar Sección"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                          </div>
                      ))}

                      <Button
                        onClick={addMainSection}
                        variant="outline"
                        className="w-full p-6 rounded-2xl border-dashed border-2 hover:border-primary hover:text-primary transition-all flex items-center justify-center gap-2 bg-primary/5 group"
                      >
                        <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        <span className="font-bold uppercase tracking-widest text-xs">Nueva Sección</span>
                      </Button>
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div data-testid="cost-sheet-interactive-table" className="space-y-6">
        <input
            type="file"
            ref={sectionInputRef}
            className="hidden"
            accept=".xlsx,.xls"
            onChange={(e) => {
                if (importingSectionIndex !== null) {
                    handleImportSectionExcel(e, importingSectionIndex);
                    setImportingSectionIndex(null);
                }
            }}
        />
        {(() => {
            const currentGroup = groupedSections?.find(g => g.id === activeSubSectionId);
            const targetSectionIds = currentGroup ? currentGroup.sectionIds : [activeSubSectionId];

            return sections.map((section, sectionIndex) => {
                const isTarget = targetSectionIds.includes(section.id);
                if (!isTarget) return null;

                const sectionNum = parseInt(section.id.replace('s', ''), 10);
                const isStickyHeaderSection = sectionNum >= 1 && sectionNum <= 3;

                return (
                <div key={section.id} id={section.id} className="animate-in fade-in slide-in-from-bottom-2 duration-500 mb-12 last:mb-0 scroll-mt-24">
                    <div className="flex items-center justify-between mb-4 px-1">
                        <div className="flex items-center gap-3">
                            <div className="w-1.5 h-6 bg-primary rounded-full" />
                            <Input
                                className="h-8 text-sm font-black uppercase tracking-[0.2em] text-foreground/80 bg-transparent border-none focus-visible:ring-0 p-0 w-auto min-w-[250px]"
                                value={section.label}
                                onChange={(e) => updateValue(['sections', sectionIndex, 'label'], e.target.value)}
                            />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-11 sm:h-8 rounded-xl font-bold gap-2 text-[10px] uppercase tracking-wider"
                                onClick={() => exportSectionToExcel(section, calculatedValues)}
                            >
                                <Download className="w-3.5 h-3.5" />
                                Exportar
                            </Button>

                            <div className="relative">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-11 sm:h-8 rounded-xl font-bold gap-2 text-[10px] uppercase tracking-wider"
                                    onClick={() => {
                                        setImportingSectionIndex(sectionIndex);
                                        setTimeout(() => sectionInputRef.current?.click(), 0);
                                    }}
                                >
                                    <Upload className="w-3.5 h-3.5" />
                                    Importar
                                </Button>
                            </div>

                            <Button
                                size="sm"
                                variant="outline"
                                className="h-11 sm:h-8 rounded-xl font-bold gap-2 text-[10px] uppercase tracking-wider"
                                onClick={() => addMainRow(['sections', sectionIndex, 'rows'])}
                            >
                                <Plus className="w-3.5 h-3.5" />
                                Añadir Fila
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive transition-colors"
                                onClick={() => {
                                    removeMainSection(sectionIndex);
                                    setActiveSubSectionId('');
                                }}
                                title="Eliminar Sección"
                            >
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>

                    <div className="neu-card p-0 border-border/50 shadow-sm hover:shadow-md transition-shadow">
                        <div className="table-scroll-wrapper rounded-2xl overflow-hidden">
                        <Table className="w-full min-w-[500px] sm:min-w-[700px] border-collapse">
                            <TableHeader className={cn(
                                "bg-muted/90 backdrop-blur-md text-muted-foreground font-black uppercase text-[9px] sm:text-[10px] tracking-widest border-b border-border",
                                isStickyHeaderSection ? "sticky top-0 z-20 shadow-sm" : "hidden"
                            )}>
                                <TableRow className="hover:bg-transparent border-none">
                                    <TableHead className="w-12 px-2 py-3 sm:px-4 sm:py-4 text-center font-black uppercase tracking-widest">No.</TableHead>
                                    <TableHead className="px-2 py-3 sm:px-4 sm:py-4 text-left font-black uppercase tracking-widest min-w-[180px] sm:min-w-[250px]">Concepto</TableHead>
                                    <TableHead className="px-2 py-3 sm:px-4 sm:py-4 text-right font-black uppercase tracking-widest w-32 sm:w-40">Valor Histórico</TableHead>
                                    <TableHead className="px-2 py-3 sm:px-4 sm:py-4 text-right font-black uppercase tracking-widest w-36 sm:w-48">Total</TableHead>
                                    <TableHead className="px-2 py-3 sm:px-4 sm:py-4 text-center font-black uppercase tracking-widest w-12 sm:w-20 hidden sm:table-cell">Ayuda</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {(section?.rows || []).filter(r => !!r).map((row: RowData, rowIndex: number) => (
                                    <CostSheetRow
                                        key={row.id}
                                        row={row}
                                        level={0}
                                        index={rowIndex}
                                        numbering={`${sectionIndex + 1}.${rowIndex + 1}`}
                                        calculated={calculatedValues?.[row.id] || {} as any}
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
                );
            });
        })()}
    </div>
  );
});

export default CostSheetInteractiveTable;
