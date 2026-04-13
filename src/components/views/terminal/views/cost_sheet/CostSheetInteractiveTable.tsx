'use client';
import { LazyRender } from '@/components/ui/LazyRender';

import { motion, AnimatePresence } from "framer-motion";

import React, { useState, useMemo, memo } from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { ChevronRight, HelpCircle, CornerDownRight, AlertTriangle, ListFilter, LayoutGrid, Sparkles, Wand2, ArrowRight, FunctionSquare, Plus, Trash2, Edit2, ChevronUp, ChevronDown, Download, Upload, CheckCircle2, XCircle, MoreVertical, Settings2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { cn, formatAccounting } from '@/lib/utils';
import { isResultRow } from '@/lib/cost-engine/constants';
import { FormulaEditor } from './FormulaEditor';
import { toast } from "sonner";
import { exportSectionToExcel, importSectionFromExcel } from '@/services/excel-service';
import { CostSheetSectionActionsPanel } from './CostSheetSectionActionsPanel';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import reinicioTemplate from '@/lib/data/costpro-reinicio';
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
  const [isEditingUM, setIsEditingUM] = useState(false);
  const [pendingVHValue, setPendingVHValue] = useState<string | null>(null);
  const [pendingTotalValue, setPendingTotalValue] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<(string | number)[] | null>(null);
  const updateValue = useCostSheetStore(state => state.updateValue);
  const updateValues = useCostSheetStore(state => state.updateValues);
  const addMainRow = useCostSheetStore(state => state.addMainRow);
  const removeMainRow = useCostSheetStore(state => state.removeMainRow);
  const reorderMainRow = useCostSheetStore(state => state.reorderMainRow);
  const applySuggestedFormula = () => {
    const findInSections = (sections: any[]): any => {
      for (const s of sections) {
        for (const r of s.rows) {
          const found = findInRow(r);
          if (found) return found;
        }
      }
      return null;
    };
    const findInRow = (r: any): any => {
      if (r.id === row.id) return r;
      if (r.children) {
        for (const child of r.children) {
          const found = findInRow(child);
          if (found) return found;
        }
      }
      return null;
    };

    const suggestedRow = findInSections((reinicioTemplate as any).sections);
    if (suggestedRow) {
      const updates: any[] = [];

      // Copy totalFormula (primary formula for the Total column)
      if (suggestedRow.totalFormula) {
        updates.push({ path: [...path, 'totalFormula'], value: suggestedRow.totalFormula });
        updates.push({ path: [...path, 'calculationMethod'], value: 'FORMULA' });
        // Also set 'formula' field to match for backward compatibility
        if (suggestedRow.totalFormula.startsWith('=') || suggestedRow.totalFormula.includes('(') || suggestedRow.totalFormula.includes('ref(') || suggestedRow.totalFormula.includes('vh(')) {
          updates.push({ path: [...path, 'formula'], value: suggestedRow.totalFormula });
        }
      }
      // Copy formula (secondary formula field)
      if (suggestedRow.formula && suggestedRow.formula !== suggestedRow.totalFormula) {
        updates.push({ path: [...path, 'formula'], value: suggestedRow.formula });
        updates.push({ path: [...path, 'calculationMethod'], value: 'FORMULA' });
      }
      // Copy vhFormula (Valor Histórico column formula)
      if (suggestedRow.vhFormula) {
        updates.push({ path: [...path, 'vhFormula'], value: suggestedRow.vhFormula });
      }

      if (updates.length > 0) {
        updateValues(updates);
        toast.success(`Fórmula de "NUEVA FICHA" aplicada a: ${row.label}`);
      } else {
        toast.info('Esta fila en la plantilla "NUEVA FICHA" no tiene fórmulas definidas.');
      }
    } else {
      toast.error(`No se encontró la fila (${row.id}) en la plantilla "NUEVA FICHA".`);
    }
  };


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
    setPendingTotalValue(null);
    setIsEditingTotal(false);

    const trimmedVal = val.trim();
    const isRowPercent = row.isPercent ?? row.is_percent;
    if (trimmedVal === '') {
        // Reset to 0 if empty
        const field = row.hasOwnProperty('valorHistorico') ? 'valorHistorico' : 'value';
        updateValue([...path, field], 0);
        updateValue([...path, 'calculationMethod'], 'ValorFijo');
        updateValue([...path, 'formula'], '');
        updateValue([...path, 'totalFormula'], '');
        if (isRowPercent) {
          updateValue([...path, 'isPercent'], false);
        }
        return;
    }

    // Determine if the input is a plain number
    const isPlainNumber = !isNaN(Number(trimmedVal));

    if (isPlainNumber) {
      // Save as fixed value (ValorFijo)
      const numVal = parseFloat(trimmedVal);
      const updates: { path: (string | number)[], value: string | number | boolean }[] = [
          { path: [...path, 'formula'], value: '' },
          { path: [...path, 'totalFormula'], value: '' },
          { path: [...path, 'calculationMethod'], value: 'ValorFijo' },
      ];
      // Also update the numeric value field
      if (row.hasOwnProperty('valorHistorico')) {
        updates.push({ path: [...path, 'valorHistorico'], value: numVal });
      } else {
        updates.push({ path: [...path, 'value'], value: numVal });
      }
      if (isRowPercent) {
          updates.push({ path: [...path, 'isPercent'], value: false });
      }
      updateValues(updates);
    } else {
      // Save as formula
      const updates: { path: (string | number)[], value: string | number | boolean }[] = [
          { path: [...path, 'formula'], value: trimmedVal },
          { path: [...path, 'totalFormula'], value: trimmedVal },
          { path: [...path, 'calculationMethod'], value: 'FORMULA' }
      ];
      if (isRowPercent) {
          updates.push({ path: [...path, 'isPercent'], value: false });
      }
      updateValues(updates);
    }
  }, [path, updateValue, updateValues, row]);

  const handleVHSave = React.useCallback((val: string) => {
    setPendingVHValue(null);
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


  const isRowPercent = row.isPercent ?? row.is_percent;
  const isResult = isResultRow(String(row.id)) || isRowPercent;
  const safeCalculated = calculated || { total: 0, valorHistorico: 0, baseTotal: 0, coeficiente: 0, hasWarnings: false, audits: [], validationErrors: [], fuente: '', metadata: {} };

  const criticalErrors = (safeCalculated.validationErrors || []).filter(e => e.type === 'CRITICAL');
  const warningErrors = (safeCalculated.validationErrors || []).filter(e => e.type === 'WARNING');
  const infoErrors = (safeCalculated.validationErrors || []).filter(e => e.type === 'INFO');
  const hasEngineWarnings = safeCalculated.hasWarnings || (!hasChildren && !isRowPercent && safeCalculated.total === 0 && ((row.valorHistorico ?? 0) > 0 || !!row.baseDeCalculoRef));
  const isZero = Number(safeCalculated.total) === 0;

  return (
    <>
      <TableRow className={cn(
        "h-auto sm:h-8 text-xs",
        "border-t border-border/30 hover:bg-primary/5 transition-colors group",
        isResult && "bg-primary/5 font-bold"
      )}>
        {/* No. */}
        <TableCell data-label="No." className="w-[60px] px-2 py-0.5 text-center text-xs font-black text-muted-foreground/60 tabular-nums border-r border-border/10">
            {numbering}
        </TableCell>

        {/* Concepto */}
        <TableCell data-label="Concepto" style={{ paddingLeft: `${level * 16 + 8}px` }} className="px-2 py-0.5 font-medium text-foreground border-r border-border/10">
          <div className="flex items-center gap-1.5 min-w-0 group/row">
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
                <span className="truncate flex-1 cursor-text" onClick={() => setIsEditingLabel(true)}>
                    {row.label}
                    {['13', '13.1'].includes(row.id) && (calculatedValues?.['12.1']?.total ?? calculatedValues?.['12']?.total) > 0 && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-black bg-primary/10 text-primary border border-primary/20">
                            {(((calculatedValues['13.1']?.total ?? calculatedValues['13']?.total) / (calculatedValues['12.1']?.total ?? calculatedValues['12']?.total)) * 100).toFixed(1)}% s/ costo
                        </span>
                    )}
                </span>
            )}

            {/* Row Actions */}
            <div className="flex sm:hidden group-hover/row:flex sm:opacity-0 sm:group-hover/row:opacity-100 transition-opacity items-center gap-0.5 ml-auto shrink-0">
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
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(path);
                    }}
                    title="Eliminar fila"
                >
                    <Trash2 className="h-4 w-4 sm:h-3 sm:w-3" />
                </Button>
            </div>
          </div>
        </TableCell>

                {/* UM */}
        <TableCell
            data-label="UM"
            className="px-2 py-0.5 text-center w-[80px] border-r border-border/10 italic text-muted-foreground/80 font-mono text-[10px] cursor-pointer hover:bg-primary/5"
            onClick={() => setIsEditingUM(true)}
        >
            {isEditingUM ? (
                <Input
                    autoFocus
                    className="h-6 text-[10px] px-1 py-0 text-center font-mono"
                    defaultValue={row.um || row.unit || "Pesos"}
                    onBlur={(e) => {
                        handleValueChange("um", e.target.value);
                        setIsEditingUM(false);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            handleValueChange("um", (e.target as HTMLInputElement).value);
                            setIsEditingUM(false);
                        }
                    }}
                />
            ) : (
                row.um || row.unit || "Pesos"
            )}
        </TableCell>

        {/* Valor Histórico / % */}
        <TableCell data-label="Valor Histórico" className={cn("px-2 py-0.5 text-right w-[140px] border-r border-border/10", !hasChildren ? "cursor-pointer" : "cursor-default")} onClick={() => !hasChildren && setIsEditingVH(true)}>
            <div className="relative">
                {isEditingVH ? (
                    <FormulaEditor
                        initialValue={row.vhFormula || String(row.valorHistorico || 0)}
                        onSave={handleVHSave}
                        onCancel={() => { setPendingVHValue(null); setIsEditingVH(false); }}
                        onPendingChange={setPendingVHValue}
                        suggestions={suggestions}
                    />
                ) : (
                    <div className="flex items-center justify-end gap-1">
                        <Input
                        type="text"
                        className={cn(
                        "neu-input text-right h-10 sm:h-8 transition-all text-base sm:text-sm px-2 cursor-pointer flex-1",
                        isRowPercent && "pr-6",
                        (hasChildren || row.vhFormula) && "bg-muted/30 font-bold border-dashed"
                        )}
                        value={hasChildren
                        ? formatAccounting(safeCalculated.calculatedVH ?? safeCalculated.valorHistorico ?? 0)
                        : (row.vhFormula
                            ? formatAccounting(safeCalculated.calculatedVH ?? safeCalculated.valorHistorico ?? 0)
                            : (row.hasOwnProperty('valorHistorico')
                                ? formatAccounting(safeCalculated.calculatedVH ?? row.valorHistorico ?? 0)
                                : (isRowPercent ? ((row.value ?? 0) * 100).toFixed(3) : formatAccounting(safeCalculated.calculatedVH ?? row.value ?? 0))))}
                        readOnly={true}
                        />
                        {row.vhFormula && <FunctionSquare className="w-3 h-3 text-primary/40 absolute left-2" />}
                        {isRowPercent && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">%</span>}
                        {(hasChildren || row.vhFormula) && <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full animate-pulse" title="Calculado automáticamente" />}
                    </div>
                )}
            </div>
        </TableCell>

        {/* Total */}
        <TableCell
          className={cn("px-2 py-0.5 text-right font-black tabular-nums text-primary w-[120px] transition-colors text-xs border-r border-border/10", !hasChildren ? "cursor-pointer hover:bg-primary/5" : "cursor-default opacity-80")}
          onClick={() => !hasChildren && setIsEditingTotal(true)}
        >
          {isEditingTotal ? (
            <FormulaEditor
              initialValue={row.formula || row.totalFormula || String(safeCalculated.total)}
              onSave={handleTotalSave}
              onCancel={() => { setPendingTotalValue(null); setIsEditingTotal(false); }}
              onPendingChange={setPendingTotalValue}
              suggestions={suggestions}
            />
          ) : (
            <div className="flex items-center justify-end gap-2 group-hover:scale-105 transition-transform origin-right">
                {safeCalculated.metadata?.isIndirectAffected && (
                    <div className="flex items-center px-1.5 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-600 animate-pulse" title="Gastos Indirectos Aplicados">
                        <Settings2 className="w-2.5 h-2.5" />
                    </div>
                )}
                {/* Validation Status Icons */}
                <Popover>
                    <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <div className="cursor-help flex items-center">
                            {(criticalErrors.length > 0 && !isZero) ? (
                                <XCircle className="w-4 h-4 text-destructive animate-pulse" />
                            ) : (warningErrors.length > 0 || hasEngineWarnings) && !isZero ? (
                                <AlertTriangle className="w-4 h-4 text-amber-500 animate-bounce" />
                            ) : (infoErrors.length > 0 && !isZero) ? (
                                <HelpCircle className="w-4 h-4 text-primary opacity-70 group-hover:opacity-100 transition-opacity" />
                            ) : (isResult && !isZero) ? (
                                <CheckCircle2 className="w-4 h-4 text-primary opacity-40 group-hover:opacity-100 transition-opacity" />
                            ) : null}
                        </div>
                    </PopoverTrigger>
                    <PopoverContent className="w-80" onClick={(e) => e.stopPropagation()}>
                        <p className={cn(
                            "text-xs font-bold mb-2 uppercase tracking-tight",
                            criticalErrors.length > 0 ? "text-destructive" : (warningErrors.length > 0 || hasEngineWarnings) ? "text-amber-600" : infoErrors.length > 0 ? "text-primary" : "text-primary"
                        )}>
                            {criticalErrors.length > 0 ? "Errores Críticos" : (warningErrors.length > 0 || hasEngineWarnings) ? "Advertencias" : infoErrors.length > 0 ? "Información" : "Estado Correcto"}
                        </p>
                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                            {/* Deep Validation Errors */}
                            {(safeCalculated.validationErrors || []).map((ve, idx) => (
                                <div key={`ve-${idx}`} className={cn(
                                    "text-xs p-2 rounded border flex gap-2",
                                    ve.type === 'CRITICAL' ? "bg-destructive/5 border-destructive/20 text-destructive" :
                                    ve.type === 'WARNING' ? "bg-amber-50 border-amber-200 text-amber-800" :
                                    "bg-muted border-border text-foreground"
                                )}>
                                    <div className="mt-0.5">
                                        {ve.type === 'CRITICAL' ? <XCircle className="w-3 h-3" /> :
                                         ve.type === 'WARNING' ? <AlertTriangle className="w-3 h-3" /> :
                                         <HelpCircle className="w-3 h-3" />}
                                    </div>
                                    <div>
                                        <span className="font-bold uppercase text-xs block opacity-70">{ve.code}</span>
                                        {ve.message}
                                    </div>
                                </div>
                            ))}

                                                        {/* Auditabilidad de Fórmula (Incluyendo Coeficientes) */}
                            {safeCalculated.metadata?.appliedFormula && (
                                <div className="text-xs bg-emerald-500/5 p-2 rounded border border-emerald-500/20 mb-2">
                                    <span className="font-bold uppercase text-[10px] block text-emerald-600 opacity-70 flex items-center gap-1">
                                        <FunctionSquare className="w-3 h-3" /> Fórmula Ejecutada
                                    </span>
                                    <div className="font-mono font-black mt-1 break-all">
                                        {safeCalculated.metadata.appliedFormula}
                                    </div>
                                    <p className="text-[9px] text-muted-foreground mt-1 uppercase italic">
                                        Refleja el cálculo base + coeficientes indirectos aplicados.
                                    </p>
                                </div>
                            )}
                            {/* Calculation Context / Auditability */}
                            {(safeCalculated.fuente || safeCalculated.metadata?.rule) && (
                                <div className="text-xs bg-primary/5 p-2 rounded border border-primary/20 mb-2">
                                    <span className="font-bold uppercase text-xs block text-primary opacity-70">Contexto / Base Legal</span>
                                    {safeCalculated.metadata?.rule && <div className="font-black mb-1">{safeCalculated.metadata.rule}</div>}
                                    {safeCalculated.fuente && <div className="italic text-muted-foreground">{safeCalculated.fuente}</div>}
                                </div>
                            )}

                            {/* Engine Audits */}
                            {safeCalculated.audits && safeCalculated.audits.filter(a => a.type === 'ERROR' || a.type === 'WARNING' || a.type === 'CYCLE_DETECTED').map((a: any, idx: number) => (
                                <div key={`audit-${idx}`} className="text-xs bg-muted p-1.5 rounded border border-border">
                                    <span className="font-bold uppercase text-xs block opacity-50">{a.type}</span>
                                    {a.note}
                                </div>
                            ))}

                            {/* Legacy Warning */}
                            {!hasChildren && !isRowPercent && safeCalculated.total === 0 && ((row.valorHistorico ?? 0) > 0 || !!row.baseDeCalculoRef) && (
                                <p className="text-xs text-muted-foreground italic p-1">
                                    Esta fila tiene un total de 0.00 pero tiene una base de cálculo o valor histórico asignado. Verifique el prorrateo o la fórmula.
                                </p>
                            )}

                            {criticalErrors.length === 0 && warningErrors.length === 0 && !hasEngineWarnings && (
                                <p className="text-xs text-primary font-medium">Los cálculos de esta fila son consistentes con sus dependencias y reglas contables.</p>
                            )}
                        </div>
                    </PopoverContent>
                </Popover>

                <div className="flex items-center gap-1">
                    {(row.formula || row.totalFormula) && <FunctionSquare className="w-3 h-3 text-primary/40" />}
                    <span className={cn((row.formula || row.totalFormula) && "underline decoration-dotted decoration-primary/30", isZero ? "text-muted-foreground opacity-60 font-medium" : "text-primary font-black")}>
                        {formatAccounting(safeCalculated.total)}
                    </span>
                </div>
            </div>
          )}
        </TableCell>

        {/* Ayuda - Hidden on very small screens */}
        <TableCell className="px-2 py-0.5 text-center w-[100px] hidden sm:table-cell">
          <div className="flex items-center justify-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-primary hover:bg-primary/10 rounded-full transition-all"
              onClick={applySuggestedFormula}
              title="Aplicar fórmula sugerida (VH y Total)"
            >
              <Wand2 className="w-4 h-4" />
            </Button>
            {row.helpText && (
              <Popover>
                <PopoverTrigger asChild>
                   <button className="p-2 rounded-full hover:bg-primary/10 text-primary/50 hover:text-primary transition-colors">
                      <HelpCircle className="w-4 h-4" />
                   </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 sm:w-80"><p className="text-sm">{row.helpText}</p></PopoverContent>
              </Popover>
            )}
          </div>
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar fila?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. La fila será eliminada permanentemente del anexo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) {
                  removeMainRow(deleteTarget);
                  setDeleteTarget(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  const [activeSectionForActions, setActiveSectionForActions] = useState<{ section: any, index: number } | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (sectionId: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };

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
                                className="absolute -top-2 -right-2 h-7 w-7 bg-destructive text-foreground rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-lg hover:bg-destructive/90 z-10"
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
            const isAll = activeSubSectionId === 'all';
            const targetSectionIds = currentGroup ? currentGroup.sectionIds : (isAll ? sections.map(s => s.id) : [activeSubSectionId]);

            return sections.map((section, sectionIndex) => {
                const isTarget = targetSectionIds.includes(section.id);
                if (!isTarget) return null;

                const isFirstInGroup = targetSectionIds[0] === section.id;
                const sectionNum = parseInt(section.id.replace('s', ''), 10);
                const isStickyHeaderSection = sectionNum >= 1 && sectionNum <= 3;


                return (
                <LazyRender key={section.id}>
                <div id={section.id} className="animate-in fade-in slide-in-from-bottom-2 duration-500 mb-8 last:mb-0 scroll-mt-24">
                    <div className="flex items-center justify-between py-1 px-4 bg-primary/5 border-y border-border/20 border-l-2 border-primary/20">

                        <div className="flex items-center gap-3 cursor-pointer group/header" onClick={() => toggleSection(section.id)}>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 p-0 hover:bg-primary/10 text-primary transition-all"
                                    // onClick handled by parent div
                                >
                                    <ChevronRight className={cn("h-4 w-4 transition-transform duration-300", !collapsedSections[section.id] && "rotate-90")} />
                                </Button>
                                <div className="w-1 h-4 bg-primary/40 rounded-full group-hover/header:bg-primary transition-colors" />
                            </div>
                            <Input
                                className="h-7 text-xs font-black uppercase tracking-[0.2em] text-foreground bg-transparent border-none focus-visible:ring-0 p-0 w-auto min-w-[250px] cursor-text"
                                value={section.label}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => updateValue(['sections', sectionIndex, 'label'], e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-primary hover:bg-primary/10 rounded-full transition-all"
                                onClick={() => setActiveSectionForActions({ section, index: sectionIndex })}
                                title="Acciones de Sección"
                            >
                                <Settings2 className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>

<AnimatePresence initial={false}>
                        {!collapsedSections[section.id] && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.3, ease: "easeInOut" }}
                                className="overflow-hidden"
                            >
                                <div className="w-full p-0 border-none shadow-none">
                                    <div className="table-scroll-wrapper overflow-x-auto border-border/50">
                                    <Table className="w-full border-collapse min-w-[800px]">
                            <TableHeader className={cn(
                                "bg-muted/50 text-muted-foreground font-black uppercase text-xs tracking-widest border-b border-border",
                                !isFirstInGroup && "hidden",
                                (isStickyHeaderSection && isFirstInGroup) && "sticky top-0 z-20"
                            )}>
                                <TableRow className="hover:bg-transparent border-none h-auto sm:h-8 text-xs">
                                    <TableHead className="w-[60px] px-2 py-0.5 text-center font-black uppercase tracking-widest border-r border-border/10">No.</TableHead>
                                    <TableHead className="px-2 py-0.5 text-left font-black uppercase tracking-widest border-r border-border/10">Concepto</TableHead>
                                    <TableHead className="w-[80px] px-2 py-0.5 text-center font-black uppercase tracking-widest border-r border-border/10">UM</TableHead>
                                    <TableHead className="w-[140px] px-2 py-0.5 text-right font-black uppercase tracking-widest border-r border-border/10">Valor Histórico</TableHead>
                                    <TableHead className="w-[120px] px-2 py-0.5 text-right font-black uppercase tracking-widest border-r border-border/10">Total</TableHead>
                                    <TableHead className="w-[100px] px-2 py-0.5 text-center font-black uppercase tracking-widest hidden sm:table-cell">Acciones</TableHead>
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
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
                </LazyRender>
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
