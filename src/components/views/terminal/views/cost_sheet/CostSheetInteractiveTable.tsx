'use client';

import React, { useState, useMemo, memo } from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { useIsMobile } from '@/hooks/ui/useMobile';
import { ChevronRight, HelpCircle, CornerDownRight, AlertTriangle, ListFilter, LayoutGrid, ArrowRight, FunctionSquare, Plus, Trash2, Edit2, ChevronUp, ChevronDown, Download, Upload, CheckCircle2, XCircle, MoreVertical, Settings2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { cn, formatAccounting } from '@/lib/utils';
import { FormulaEditor } from './FormulaEditor';
import { exportSectionToExcel, importSectionFromExcel } from '@/services/excel-service';
import { CostSheetSectionActionsPanel } from './CostSheetSectionActionsPanel';
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
  const isMobile = useIsMobile();
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
        const field = row.hasOwnProperty('valorHistorico') ? 'valorHistorico' : 'value';
        updateValue([...path, field], 0);
        updateValue([...path, 'calculationMethod'], 'ValorFijo');
        updateValue([...path, 'formula'], '');
        if (row.is_percent) {
          updateValue([...path, 'is_percent'], false);
        }
        return;
    }

    const updates: { path: (string | number)[], value: string | number | boolean }[] = [
        { path: [...path, 'formula'], value: trimmedVal },
        { path: [...path, 'calculationMethod'], value: 'FORMULA' }
    ];

    if (row.is_percent && !isNaN(Number(trimmedVal))) {
        updates.push({ path: [...path, 'is_percent'], value: false });
    }

    updateValues(updates);
  }, [path, updateValues, row.is_percent]);

  const handleVHSave = React.useCallback((val: string) => {
    setIsEditingVH(false);
    const trimmedVal = val.trim();
    if (trimmedVal === '') {
        updateValue([...path, 'valorHistorico'], 0);
        updateValue([...path, 'vhFormula'], '');
        return;
    }

    if (trimmedVal.startsWith('=') || isNaN(Number(trimmedVal))) {
        updateValue([...path, 'vhFormula'], trimmedVal);
    } else {
        updateValue([...path, 'valorHistorico'], parseFloat(trimmedVal));
        updateValue([...path, 'vhFormula'], '');
    }
  }, [path, updateValue]);


  const isResultRow = row.is_percent || ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '13.1', '13.2', '14', '15', '16'].includes(String(row.id));
  const safeCalculated = calculated || { total: 0, valorHistorico: 0, baseTotal: 0, coeficiente: 0, hasWarnings: false, audits: [], validationErrors: [], fuente: '', metadata: {} };

  const criticalErrors = (safeCalculated.validationErrors || []).filter(e => e.type === 'CRITICAL');
  const warningErrors = (safeCalculated.validationErrors || []).filter(e => e.type === 'WARNING');
  const infoErrors = (safeCalculated.validationErrors || []).filter(e => e.type === 'INFO');
  const hasEngineWarnings = safeCalculated.hasWarnings || (!hasChildren && !row.is_percent && safeCalculated.total === 0 && ((row.valorHistorico ?? 0) > 0 || !!row.baseDeCalculoRef));

  return (
    <>
      <TableRow className={cn(
        "transition-all duration-300 group",
        !isMobile && "border-t border-border/30 hover:bg-primary/5",
        !isMobile && isResultRow && "bg-primary/5 font-bold",
        isMobile && "flex flex-col p-5 mb-4 rounded-[2rem] bg-zinc-900/40 border border-white/5 shadow-2xl mx-2 animate-in fade-in slide-in-from-bottom-4",
        isMobile && isResultRow && "bg-primary/5 border-primary/20"
      )}>
        {/* No. and Header Info for Mobile */}
        <TableCell className={cn(
            "w-12 px-2 py-1.5 text-center text-[10px] font-black text-muted-foreground/60 tabular-nums border-r border-border/10",
            isMobile && "w-full text-left border-none p-0 flex items-center justify-between mb-2 opacity-50"
        )}>
            <span>{numbering}</span>
            {isMobile && isResultRow && <span className="bg-primary/20 text-primary px-2 py-0.5 rounded-full text-[8px] uppercase font-black">Resultado</span>}
        </TableCell>

        {/* Concepto */}
        <TableCell
            style={!isMobile ? { paddingLeft: `${level * 16 + 8}px` } : {}}
            className={cn(
                "px-2 py-1.5 font-medium text-[13px] text-foreground min-w-[250px] border-r border-border/10",
                isMobile && "block w-full border-none p-0 mb-6"
            )}
        >
          <div className="flex items-start gap-1.5 min-w-0 group/row">
            {hasChildren && (
              <button onClick={handleToggle} className="p-1 rounded-full hover:bg-primary/10 shrink-0 mt-0.5">
                <ChevronRight className={cn('w-3.5 h-3.5 sm:w-4 h-4 transition-transform', isExpanded && 'rotate-90')} />
              </button>
            )}
            {!hasChildren && !isMobile && <CornerDownRight className="w-3.5 h-3.5 sm:w-4 h-4 text-muted-foreground shrink-0 ml-1 mt-1" />}

            {isEditingLabel ? (
                <Input
                    autoFocus
                    className="h-8 text-sm py-0 bg-background/50"
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
                <span className={cn(
                    "truncate flex-1 cursor-text",
                    isMobile ? "text-lg font-black tracking-tight text-white whitespace-normal leading-tight" : "truncate"
                )} onClick={() => setIsEditingLabel(true)}>
                    {row.label}
                    {row.id === '13' && calculatedValues?.['12']?.total > 0 && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                            {((calculatedValues['13'].total / calculatedValues['12'].total) * 100).toFixed(1)}% s/ costo
                        </span>
                    )}
                </span>
            )}

            {/* Row Actions */}
            <div className={cn(
                "items-center gap-0.5 ml-auto shrink-0 animate-in fade-in slide-in-from-right-2",
                !isMobile ? "hidden group-hover/row:flex" : "flex"
            )}>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:bg-primary/10 hover:text-primary rounded-full"
                    onClick={() => reorderMainRow(path, 'up')}
                >
                    <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:bg-primary/10 hover:text-primary rounded-full"
                    onClick={() => reorderMainRow(path, 'down')}
                >
                    <ChevronDown className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-primary hover:bg-primary/10 rounded-full"
                    onClick={() => addMainRow([...path, 'children'])}
                >
                    <Plus className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:bg-destructive/10 rounded-full"
                    onClick={() => removeMainRow(path)}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>
          </div>
        </TableCell>

        {/* Values Container for Mobile */}
        <div className={cn(isMobile && "grid grid-cols-2 gap-4 mt-2 pt-5 border-t border-white/5")}>
            {/* Valor Histórico / % */}
            <TableCell className={cn(
                "px-2 py-1 text-right w-32 sm:w-40 cursor-pointer border-r border-border/10",
                isMobile && "block w-full border-none p-0 text-left"
            )} onClick={() => setIsEditingVH(true)}>
                {isMobile && <span className="block text-[10px] uppercase font-black text-zinc-500 mb-1.5 tracking-widest">Histórico</span>}
                <div className="relative">
                    {isEditingVH ? (
                        <FormulaEditor
                            initialValue={row.vhFormula || String(row.valorHistorico || 0)}
                            onSave={handleVHSave}
                            onCancel={() => setIsEditingVH(false)}
                            suggestions={suggestions}
                        />
                    ) : (
                        <div className="flex items-center justify-end gap-1">
                            <Input
                            type="text"
                            className={cn(
                            "neu-input text-right h-10 sm:h-8 transition-all text-base sm:text-sm px-2 cursor-pointer flex-1",
                            isMobile && "text-left h-12 bg-white/5 border-none rounded-2xl",
                            row.is_percent && "pr-6",
                            (hasChildren || row.vhFormula) && "bg-muted/30 font-bold border-dashed"
                            )}
                            value={hasChildren
                            ? formatAccounting(safeCalculated.calculatedVH ?? safeCalculated.valorHistorico ?? 0)
                            : (row.vhFormula
                                ? formatAccounting(safeCalculated.calculatedVH ?? 0)
                                : (row.hasOwnProperty('valorHistorico') ? formatAccounting(row.valorHistorico ?? 0) : (row.is_percent ? ((row.value ?? 0) * 100).toFixed(3) : formatAccounting(row.value ?? 0))))}
                            readOnly={true}
                            />
                            {row.vhFormula && <FunctionSquare className="w-3 h-3 text-primary/40 absolute left-2" />}
                            {row.is_percent && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">%</span>}
                            {(hasChildren || row.vhFormula) && <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full animate-pulse" title="Calculado automáticamente" />}
                        </div>
                    )}
                </div>
            </TableCell>

            {/* Total */}
            <TableCell
              className={cn(
                "px-2 py-1 text-right font-black tabular-nums text-primary w-36 sm:w-48 cursor-pointer hover:bg-primary/5 transition-colors text-[13px] border-r border-border/10",
                isMobile && "block w-full border-none p-0 text-right"
              )}
              onClick={() => setIsEditingTotal(true)}
            >
              {isMobile && <span className="block text-[10px] uppercase font-black text-zinc-500 mb-1.5 tracking-widest">Total Ficha</span>}
              {isEditingTotal ? (
                <FormulaEditor
                  initialValue={row.formula || String(safeCalculated.total)}
                  onSave={handleTotalSave}
                  onCancel={() => setIsEditingTotal(false)}
                  suggestions={suggestions}
                />
              ) : (
                <div className={cn(
                    "flex items-center justify-end gap-2 group-hover:scale-105 transition-transform origin-right",
                    isMobile && "h-12 bg-primary/10 rounded-2xl px-3 border border-primary/20"
                )}>
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
                                {(safeCalculated.validationErrors || []).map((ve, idx) => (
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

                                {(safeCalculated.fuente || safeCalculated.metadata?.rule) && (
                                    <div className="text-[10px] bg-primary/5 p-2 rounded border border-primary/20 mb-2">
                                        <span className="font-bold uppercase text-[8px] block text-primary opacity-70">Contexto / Base Legal</span>
                                        {safeCalculated.metadata?.rule && <div className="font-black mb-1">{safeCalculated.metadata.rule}</div>}
                                        {safeCalculated.fuente && <div className="italic text-muted-foreground">{safeCalculated.fuente}</div>}
                                    </div>
                                )}

                                {safeCalculated.audits && safeCalculated.audits.filter(a => a.type === 'ERROR' || a.type === 'WARNING' || a.type === 'CYCLE_DETECTED').map((a: any, idx: number) => (
                                    <div key={`audit-${idx}`} className="text-[10px] bg-muted p-1.5 rounded border border-border">
                                        <span className="font-bold uppercase text-[8px] block opacity-50">{a.type}</span>
                                        {a.note}
                                    </div>
                                ))}

                                {!hasChildren && !row.is_percent && safeCalculated.total === 0 && ((row.valorHistorico ?? 0) > 0 || !!row.baseDeCalculoRef) && (
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
                        <span className={cn(
                            row.formula && "underline decoration-dotted decoration-primary/30",
                            isMobile ? "text-lg font-black" : ""
                        )}>
                            {formatAccounting(safeCalculated.total)}
                        </span>
                    </div>
                </div>
              )}
            </TableCell>
        </div>

        {/* Ayuda - Hidden on mobile, shown as info if needed */}
        {!isMobile && (
            <TableCell className="px-2 py-1 text-center w-12 sm:w-20 hidden sm:table-cell">
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
        )}
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
  const isMobile = useIsMobile();
  const addMainSection = useCostSheetStore(state => state.addMainSection);
  const removeMainSection = useCostSheetStore(state => state.removeMainSection);
  const updateValue = useCostSheetStore(state => state.updateValue);
  const updateValues = useCostSheetStore(state => state.updateValues);
  const addMainRow = useCostSheetStore(state => state.addMainRow);
  const sectionInputRef = React.useRef<HTMLInputElement>(null);
  const [importingSectionIndex, setImportingSectionIndex] = useState<number | null>(null);
  const [activeSectionForActions, setActiveSectionForActions] = useState<{ section: any, index: number } | null>(null);

  // Smooth scroll to active section/group when selected
  React.useEffect(() => {
    if (activeSubSectionId) {
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
                  <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-[0_0_20px_rgba(57,255,20,0.1)]">
                      <LayoutGrid className="w-10 h-10 text-primary animate-pulse" />
                  </div>
                  <h2 className="text-2xl font-black text-foreground uppercase tracking-tighter italic">Seleccione una Sección</h2>
                  <p className="text-muted-foreground text-sm font-medium leading-relaxed">
                      Para comenzar a visualizar o editar los datos de la tabla principal, elija una de las secciones disponibles.
                  </p>

                  <div className="grid grid-cols-1 gap-4 pt-8">
                      {displayItems.map((item, idx) => (
                          <div key={item.id} className="relative group">
                              <button
                                onClick={() => setActiveSubSectionId(item.id)}
                                className="w-full flex items-center justify-between p-5 rounded-[1.5rem] bg-zinc-900/50 border border-white/5 hover:border-primary/50 hover:bg-primary/5 transition-all group active:scale-[0.98] shadow-xl"
                              >
                                  <div className="flex items-center gap-4 text-left">
                                      <div className="w-1 h-8 bg-zinc-800 group-hover:bg-primary rounded-full transition-colors" />
                                      <span className="font-black text-sm uppercase tracking-widest">{item.label}</span>
                                  </div>
                                  <ArrowRight className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-all translate-x-[-10px] group-hover:translate-x-0 text-primary" />
                              </button>
                          </div>
                      ))}

                      <Button
                        onClick={addMainSection}
                        variant="outline"
                        className="w-full p-8 rounded-[1.5rem] border-dashed border-2 border-white/10 hover:border-primary hover:text-primary transition-all flex items-center justify-center gap-2 bg-primary/5 group mt-4"
                      >
                        <Plus className="w-6 h-6 group-hover:scale-110 transition-transform" />
                        <span className="font-black uppercase tracking-widest text-xs">Nueva Sección</span>
                      </Button>
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div data-testid="cost-sheet-interactive-table" className="space-y-8">
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

                const isFirstInGroup = targetSectionIds[0] === section.id;
                const sectionNum = parseInt(section.id.replace('s', ''), 10);
                const isStickyHeaderSection = sectionNum >= 1 && sectionNum <= 3;

                return (
                <div key={section.id} id={section.id} className="animate-in fade-in slide-in-from-bottom-2 duration-500 mb-0 last:mb-0 scroll-mt-24">
                    <div className="flex items-center justify-between py-3 px-6 bg-zinc-900/80 backdrop-blur-md border-y border-white/5 sticky top-[120px] z-10 sm:static">
                        <div className="flex items-center gap-4">
                            <div className="w-1 h-6 bg-primary rounded-full shadow-[0_0_10px_rgba(57,255,20,0.5)]" />
                            <Input
                                className="h-8 text-sm font-black uppercase tracking-[0.2em] text-white/90 bg-transparent border-none focus-visible:ring-0 p-0 w-auto min-w-[250px]"
                                value={section.label}
                                onChange={(e) => updateValue(['sections', sectionIndex, 'label'], e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-9 w-9 p-0 text-primary hover:bg-primary/10 rounded-full transition-all"
                                onClick={() => setActiveSectionForActions({ section, index: sectionIndex })}
                            >
                                <Settings2 className="w-5 h-5" />
                            </Button>
                        </div>
                    </div>

                    <div className="w-full p-0 border-none shadow-none">
                        <div className={cn(
                            "table-scroll-wrapper border-none",
                            !isMobile ? "overflow-x-auto" : "overflow-visible"
                        )}>
                        <Table className={cn(
                            "w-full border-collapse",
                            !isMobile ? "min-w-[800px]" : "flex flex-col"
                        )}>
                            <TableHeader className={cn(
                                "bg-zinc-900/50 text-zinc-500 font-black uppercase text-[10px] tracking-widest border-b border-white/5",
                                (!isFirstInGroup || isMobile) && "hidden",
                                (isStickyHeaderSection && isFirstInGroup) && "sticky top-0 z-20"
                            )}>
                                <TableRow className="hover:bg-transparent border-none">
                                    <TableHead className="w-12 px-4 py-4 text-center border-r border-white/5">No.</TableHead>
                                    <TableHead className="px-4 py-4 text-left min-w-[250px] border-r border-white/5">Concepto</TableHead>
                                    <TableHead className="px-4 py-4 text-right w-32 sm:w-40 border-r border-white/5">Valor Histórico</TableHead>
                                    <TableHead className="px-4 py-4 text-right w-36 sm:w-48 border-r border-white/5">Total</TableHead>
                                    <TableHead className="px-4 py-4 text-center w-12 sm:w-20 hidden sm:table-cell">Ayuda</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody className={cn(isMobile && "flex flex-col pt-4")}>
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

        <CostSheetSectionActionsPanel
            isOpen={!!activeSectionForActions}
            onClose={() => setActiveSectionForActions(null)}
            section={activeSectionForActions?.section}
            onExport={() => activeSectionForActions && exportSectionToExcel(activeSectionForActions.section, calculatedValues)}
            onImport={() => {
                if (activeSectionForActions) {
                    setImportingSectionIndex(activeSectionForActions.index);
                    setTimeout(() => sectionInputRef.current?.click(), 0);
                }
            }}
            onAddRow={() => activeSectionForActions && addMainRow(['sections', activeSectionForActions.index, 'rows'])}
            onRemove={() => {
                if (activeSectionForActions) {
                    removeMainSection(activeSectionForActions.index);
                    setActiveSubSectionId('');
                }
            }}
        />
    </div>
  );
});

export default CostSheetInteractiveTable;
