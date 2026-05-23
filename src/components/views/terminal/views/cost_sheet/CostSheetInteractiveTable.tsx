'use client';
import { LazyRender } from '@/components/ui/LazyRender';

import { motion, AnimatePresence } from "framer-motion";

import React, { useState, memo } from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { ChevronRight, HelpCircle, CornerDownRight, AlertTriangle, ListFilter, LayoutGrid, Sparkles, Info, ArrowRight, FunctionSquare, Plus, Trash2, Edit2, ChevronUp, ChevronDown, Download, Upload, CheckCircle2, XCircle, MoreVertical, Settings2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { cn, formatAccounting } from '@/lib/utils';
import { FormulaEditor } from './FormulaEditor';
import { toast } from "sonner";
import { exportSectionToExcel } from '@/services/excel-service';
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
import { useCellEditor, useFormulaSuggestions, getRowDiagnostics } from '@/hooks/logic/useCellEditor';
import reinicioTemplate from '@/lib/data/costpro-reinicio';
import {
  CostSheetRow as RowData,
  CostSheetSection,
  CalculatedRowValue
} from '@/types/cost-sheet';
import type { CostSheetInteractiveTableProps, CostSheetRowTableProps } from './cost-sheet-view-shared';
import { handleImportSectionExcel } from './cost-sheet-view-shared';

/**
 * Renders a single, potentially recursive, row in the cost sheet table.
 */
const CostSheetRow: React.FC<CostSheetRowTableProps> = memo(({ row, level, index, numbering, calculated, calculatedValues, path, annexes, suggestions }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isEditingTotal, setIsEditingTotal] = useState(false);
  const [isEditingVH, setIsEditingVH] = useState(false);
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [isEditingUM, setIsEditingUM] = useState(false);
  const [pendingVHValue, setPendingVHValue] = useState<string | null>(null);
  const [pendingTotalValue, setPendingTotalValue] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<(string | number)[] | null>(null);
  const updateValue = useCostSheetStore(state => state.updateValue);
  const addMainRow = useCostSheetStore(state => state.addMainRow);
  const removeMainRow = useCostSheetStore(state => state.removeMainRow);
  const reorderMainRow = useCostSheetStore(state => state.reorderMainRow);
  const { setField, saveVH, saveTotal, applySuggested } = useCellEditor();

  const hasChildren = row.children && row.children.length > 0;
  const { isRowPercent, isResult, safeCalculated, criticalErrors, warningErrors, hasEngineWarnings, audits } = getRowDiagnostics(row, calculated);

  return (
    <>
      <TableRow className={cn(
        "h-auto sm:h-8 text-xs",
        "border-t border-border/30 hover:bg-primary/5 transition-colors group",
        isResult && "bg-primary/5 font-bold"
      )}>
        {/* No. */}
        <TableCell data-label="No." className="w-[60px] px-2 py-0.5 text-center text-xs font-black text-muted-foreground/60 tabular-nums border-r border-border/10 relative">
            <div className="flex flex-col items-center justify-center gap-0.5">
                {numbering}
                {audits.length > 0 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="h-4 w-4 rounded-full bg-muted flex items-center justify-center hover:bg-muted-foreground/10 transition-colors">
                        <Info className="w-2.5 h-2.5 text-muted-foreground" />
                        <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-muted-foreground/20 text-[7px] font-black">
                          {audits.length}
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3 bg-popover/95 backdrop-blur-sm border-border shadow-xl rounded-xl z-[60]">
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                          <Info className="w-3 h-3" />
                          Auditoría de Fila {numbering}
                        </h4>
                        <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
                          {audits.map((a: any, i: number) => (
                            <div key={i} className="p-2 rounded-lg bg-muted\/30 border border-border\/10 text-[11px] leading-relaxed">
                              <p className="font-medium">{a.message}</p>
                              {a.timestamp && <p className="text-[9px] text-muted-foreground mt-1">{new Date(a.timestamp).toLocaleTimeString()}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
            </div>
        </TableCell>

        {/* Concepto */}
        <TableCell data-label="Concepto" style={{ paddingLeft: `${level * 16 + 8}px` }} className="px-2 py-0.5 font-medium text-foreground border-r border-border/10">
          <div className="flex items-center gap-1.5 min-w-0 group/row">
            {hasChildren && (
              <button onClick={() => setIsExpanded(!isExpanded)} className="p-1 rounded-full hover:bg-primary/10 shrink-0" type="button" aria-label={isExpanded ? `Contraer sección de ${row.label}` : `Expandir sección de ${row.label}`}>
                <ChevronRight className={cn('w-3.5 h-3.5 sm:w-4 h-4 transition-transform', isExpanded && 'rotate-90')} aria-hidden="true" />
              </button>
            )}
            {!hasChildren && <CornerDownRight className="w-3.5 h-3.5 sm:w-4 h-4 text-muted-foreground shrink-0 ml-1" aria-hidden="true" />}

            {isEditingLabel ? (
                <Input
                    autoFocus
                    className="h-7 text-xs sm:text-sm py-0"
                    defaultValue={row.label}
                    aria-label={`Nombre del concepto ${row.label}`}
                    onBlur={(e) => {
                        setField(path, 'label', e.target.value);
                        setIsEditingLabel(false);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            setField(path, 'label', (e.target as HTMLInputElement).value);
                            setIsEditingLabel(false);
                        }
                        if (e.key === 'Escape') {
                            setIsEditingLabel(false);
                        }
                    }}
                />
            ) : (
                <span role="button" tabIndex={0} aria-label={`Editar nombre del concepto: ${row.label}`} className="truncate flex-1 cursor-text" onClick={() => setIsEditingLabel(true)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsEditingLabel(true); } }}>
                    {row.label}
                </span>
            )}

            {/* Row Actions */}
            <div className="flex sm:hidden group-hover/row:flex sm:opacity-0 sm:group-hover/row:opacity-100 transition-opacity items-center gap-0.5 ml-auto shrink-0">
                <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    className="h-8 w-8 sm:h-6 sm:w-6 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                    onClick={() => reorderMainRow(path, 'up')}
                    aria-label={`Mover ${row.label} hacia arriba`}
                >
                    <ChevronUp className="h-4 w-4 sm:h-3 sm:w-3" aria-hidden="true" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    className="h-8 w-8 sm:h-6 sm:w-6 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                    onClick={() => reorderMainRow(path, 'down')}
                    aria-label={`Mover ${row.label} hacia abajo`}
                >
                    <ChevronDown className="h-4 w-4 sm:h-3 sm:w-3" aria-hidden="true" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    className="h-8 w-8 sm:h-6 sm:w-6 text-primary hover:bg-primary/10"
                    onClick={() => applySuggested(row.id, path)}
                    aria-label={`Aplicar fórmula sugerida a ${row.label}`}
                >
                    <Info className="h-4 w-4 sm:h-3 sm:w-3" aria-hidden="true" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    className="h-8 w-8 sm:h-6 sm:w-6 text-primary hover:bg-primary/10"
                    onClick={() => addMainRow([...path, 'children'])}
                    aria-label={`Añadir fila hija a ${row.label}`}
                >
                    <Plus className="h-4 w-4 sm:h-3 sm:w-3" aria-hidden="true" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    className="h-8 w-8 sm:h-6 sm:w-6 text-destructive hover:bg-destructive/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(path);
                    }}
                    aria-label={`Eliminar concepto ${row.label}`}
                >
                    <Trash2 className="h-4 w-4 sm:h-3 sm:w-3" aria-hidden="true" />
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
                    aria-label={`Unidad de medida de ${row.label}`}
                    onBlur={(e) => {
                        setField(path, "um", e.target.value);
                        setIsEditingUM(false);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            setField(path, "um", (e.target as HTMLInputElement).value);
                            setIsEditingUM(false);
                        }
                        if (e.key === 'Escape') {
                            setIsEditingUM(false);
                        }
                    }}
                />
            ) : (
                row.um || row.unit || "Pesos"
            )}
        </TableCell>

        {/* Valor Histórico / % — SUBDUED: reference input value */}
        <TableCell data-label="Valor Histórico" className={cn("px-2 py-0.5 text-right text-muted-foreground/60 tabular-nums transition-colors text-[10px] border-r border-border/10", !hasChildren ? "cursor-pointer hover:bg-muted/30" : "cursor-default opacity-60", isEditingVH && "w-auto min-w-[180px]")} onClick={() => !hasChildren && setIsEditingVH(true)}>
            <div className="relative">
                {isEditingVH ? (
                    <FormulaEditor
                        initialValue={row.vhFormula || String(row.valorHistorico || 0)}
                        onSave={(val: string) => { saveVH(path, val); setIsEditingVH(false); }}
                        onCancel={() => { setPendingVHValue(null); setIsEditingVH(false); }}
                        onPendingChange={setPendingVHValue}
                        suggestions={suggestions}
                    />
                ) : (
                    <div className="flex items-center justify-end gap-1">
                        <Input
                        type="text"
                        className={cn(
                        "neu-input text-right h-10 sm:h-8 transition-all text-xs px-2 cursor-pointer flex-1 tabular-nums text-muted-foreground",
                        isRowPercent && "pr-6",
                        (hasChildren || row.vhFormula) && "bg-primary/10 font-black border-primary/30 border-dashed"
                        )}
                        value={hasChildren
                        ? formatAccounting(safeCalculated.calculatedVH ?? safeCalculated.valorHistorico ?? 0)
                        : (row.vhFormula
                            ? formatAccounting(safeCalculated.calculatedVH ?? safeCalculated.valorHistorico ?? 0)
                            : (row.hasOwnProperty('valorHistorico')
                                ? formatAccounting(safeCalculated.calculatedVH ?? row.valorHistorico ?? 0)
                                : (isRowPercent ? ((row.value ?? 0) * 100).toFixed(3) : formatAccounting(safeCalculated.calculatedVH ?? row.value ?? 0))))}
                        readOnly={true}
                        aria-label={`Valor histórico de ${row.label}${isRowPercent ? ' en porcentaje' : ''}`}
                        />
                        {row.vhFormula && <FunctionSquare className="w-3 h-3 text-primary/40 absolute left-2" aria-hidden="true" />}
                        {isRowPercent && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground" aria-hidden="true">%</span>}
                    </div>
                )}
            </div>
        </TableCell>

        {/* Total — PRIMARY COLUMN: calculated result with maximum visual emphasis */}
        <TableCell
          className={cn("px-2 py-0.5 text-right border-r-2 border-primary/30 bg-primary/5 tabular-nums text-base sm:text-lg transition-colors", !hasChildren ? "cursor-pointer hover:bg-primary/10" : "cursor-default", isEditingTotal && "w-auto min-w-[180px]")}
          onClick={() => !hasChildren && setIsEditingTotal(true)}
        >
          {isEditingTotal ? (
            <FormulaEditor
              initialValue={row.formula || row.totalFormula || String(safeCalculated.total ?? 0)}
              onSave={(val: string) => { saveTotal(path, row, val); setIsEditingTotal(false); }}
              onCancel={() => { setPendingTotalValue(null); setIsEditingTotal(false); }}
              onPendingChange={setPendingTotalValue}
              suggestions={suggestions}
            />
          ) : (
             <div className="flex items-center justify-end gap-1">
                 <span className={cn("font-black",
                    (row.formula || row.totalFormula) ? "underline decoration-primary/30 decoration-dotted underline-offset-4" : ""
                 )}>
                    {formatAccounting(safeCalculated.total)}
                 </span>
                 {criticalErrors.length > 0 && <XCircle className="w-3 h-3 text-destructive shrink-0" aria-hidden="true" />}
                 {warningErrors.length > 0 && <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" aria-hidden="true" />}
                 {hasEngineWarnings && <Sparkles className="w-3 h-3 text-primary/40 animate-pulse shrink-0" aria-hidden="true" />}
             </div>
          )}
        </TableCell>

        {/* Desktop Actions */}
        <TableCell className="px-2 py-0.5 text-center hidden sm:table-cell w-[100px]">
           <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    className="h-6 w-6 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                    onClick={() => reorderMainRow(path, 'up')}
                    aria-label={`Mover ${row.label} hacia arriba`}
                >
                    <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    className="h-6 w-6 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                    onClick={() => reorderMainRow(path, 'down')}
                    aria-label={`Mover ${row.label} hacia abajo`}
                >
                    <ChevronDown className="h-4 w-4 sm:h-3 sm:w-3" aria-hidden="true" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    className="h-8 w-8 sm:h-6 sm:w-6 text-primary hover:bg-primary/10"
                    onClick={() => applySuggested(row.id, path)}
                    aria-label={`Aplicar fórmula sugerida a ${row.label}`}
                >
                    <Info className="h-4 w-4 sm:h-3 sm:w-3" aria-hidden="true" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    className="h-6 w-6 text-primary hover:bg-primary/10"
                    onClick={() => addMainRow([...path, 'children'])}
                    aria-label={`Añadir fila hija a ${row.label}`}
                >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    className="h-6 w-6 text-destructive hover:bg-destructive/10"
                    onClick={() => setDeleteTarget(path)}
                    aria-label={`Eliminar concepto ${row.label}`}
                >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
           </div>
        </TableCell>
      </TableRow>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este concepto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará el concepto y todos sus hijos. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
                onClick={() => {
                    if (deleteTarget) {
                        removeMainRow(deleteTarget);
                        setDeleteTarget(null);
                        toast.success("Concepto eliminado");
                    }
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
                Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Recursive Children */}
      {hasChildren && isExpanded && (
        row.children!.map((child, childIdx) => (
          <CostSheetRow
            key={child.id}
            row={child}
            level={level + 1}
            index={childIdx}
            numbering={`${numbering}.${childIdx + 1}`}
            calculated={calculatedValues?.[child.id] || {} as CalculatedRowValue}
            calculatedValues={calculatedValues}
            path={[...path, 'children', childIdx]}
            annexes={annexes}
            suggestions={suggestions}
          />
        ))
      )}
    </>
  );
});

CostSheetRow.displayName = 'CostSheetRow';

/**
 * The main interactive table component for the Cost Sheet.
 */
const CostSheetInteractiveTable: React.FC<CostSheetInteractiveTableProps> = memo(({
    sections,
    groupedSections,
    calculatedValues,
    annexes,
    activeSubSectionId,
    setActiveSubSectionId,
    onOpenSections,
    hideHeader = false
}) => {
  const addMainSection = useCostSheetStore(state => state.addMainSection);
  const removeMainSection = useCostSheetStore(state => state.removeMainSection);
  const updateValue = useCostSheetStore(state => state.updateValue);
  const addMainRow = useCostSheetStore(state => state.addMainRow);
  const sectionInputRef = React.useRef<HTMLInputElement>(null);

  const [importingSectionIndex, setImportingSectionIndex] = useState<number | null>(null);
  const [activeSectionForActions, setActiveSectionForActions] = useState<{ section: CostSheetSection, index: number } | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (sectionId: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };

  // Smooth scroll to active section
  React.useEffect(() => {
    if (activeSubSectionId && !hideHeader) {
      const timer = setTimeout(() => {
        const element = document.getElementById(activeSubSectionId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [activeSubSectionId, hideHeader]);

  // Suggestions for FormulaEditor
  const suggestions = useFormulaSuggestions(sections, annexes);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    void handleImportSectionExcel(e, index, sections, updateValue);
  };

  if (!sections || sections.length === 0) {
      return (
          <div className="p-12 text-center bg-muted/20 rounded-[2rem] border-2 border-dashed border-border/50">
              <div className="max-w-md mx-auto space-y-6">
                  <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto">
                      <LayoutGrid className="w-8 h-8 text-primary" />
                  </div>
                  <div className="space-y-2">
                      <h3 className="text-xl font-black uppercase tracking-tight">Ficha Vacía</h3>
                      <p className="text-sm text-muted-foreground">Esta ficha no tiene secciones definidas aún. Comience agregando una o use una plantilla.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 pt-4">
                      {['Industrial', 'Gastronomía', 'Servicios', 'Construcción'].map((tpl, idx) => (
                          <div key={tpl} className="relative group">
                              <button
                                className="w-full p-4 rounded-2xl border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-all text-left flex items-center justify-between"
                                onClick={() => {
                                    if (reinicioTemplate) {
                                        useCostSheetStore.getState().setSheet(reinicioTemplate);
                                        toast.success(`Plantilla ${tpl} cargada`);
                                    }
                                }}
                                type="button"
                                aria-label={`Cargar plantilla ${tpl}`}
                              >
                                  <div className="flex items-center gap-3">
                                      <Sparkles className="w-4 h-4 text-primary" aria-hidden="true" />
                                      <span className="text-xs font-bold uppercase tracking-widest">{tpl}</span>
                                  </div>
                                  <ArrowRight className="w-4 h-4 text-muted-foreground transition-transform group-hover:translate-x-1" aria-hidden="true" />
                              </button>
                          </div>
                      ))}

                      <Button
                        onClick={addMainSection}
                        className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-black uppercase tracking-widest text-xs shadow-lg shadow-primary/20"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Crear Sección Manual
                      </Button>
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div data-testid="cost-sheet-interactive-table" className="space-y-6" role="grid" aria-label="Tabla interactiva de ficha de costo">
        <input
            type="file"
            ref={sectionInputRef}
            className="hidden"
            accept=".xlsx,.xls"
            aria-label="Importar sección desde archivo Excel"
            onChange={(e) => {
                if (importingSectionIndex !== null) {
                    handleImport(e, importingSectionIndex);
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
                    {!hideHeader && (
                        <div className="flex items-center justify-between py-1 px-4 bg-primary/5 border-y border-border/20 border-l-2 border-primary/20">
                            <div role="button" tabIndex={0} className="flex items-center gap-3 cursor-pointer group/header" onClick={() => toggleSection(section.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSection(section.id); } }} aria-label={collapsedSections[section.id] ? `Expandir sección ${section.label}` : `Contraer sección ${section.label}`}>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        type="button"
                                        className="h-6 w-6 p-0 hover:bg-primary/10 text-primary transition-all"
                                        aria-label={collapsedSections[section.id] ? `Expandir sección ${section.label}` : `Contraer sección ${section.label}`}
                                    >
                                        <ChevronRight className={cn("h-4 w-4 transition-transform duration-300", !collapsedSections[section.id] && "rotate-90")} aria-hidden="true" />
                                    </Button>
                                    <div className="w-1 h-4 bg-primary/40 rounded-full group-hover/header:bg-primary transition-colors" />
                                </div>
                                <Input
                                    className="h-7 text-xs font-black uppercase tracking-[0.2em] text-foreground bg-transparent border-none focus-visible:ring-0 p-0 w-auto min-w-[250px] cursor-text"
                                    value={section.label}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => updateValue(['sections', sectionIndex, 'label'], e.target.value)}
                                    aria-label={`Nombre de la sección ${section.label}`}
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    type="button"
                                    className="h-8 w-8 p-0 text-primary hover:bg-primary/10 rounded-full transition-all"
                                    onClick={() => setActiveSectionForActions({ section, index: sectionIndex })}
                                    aria-label={`Acciones de la sección ${section.label}`}
                                >
                                    <Settings2 className="w-4 h-4" aria-hidden="true" />
                                </Button>
                            </div>
                        </div>
                    )}

                    <AnimatePresence initial={false}>
                        {(!collapsedSections[section.id] || hideHeader) && (
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
                                (isStickyHeaderSection && isFirstInGroup && !hideHeader) && "sticky top-0 z-20"
                            )}>
                                <TableRow className="hover:bg-transparent border-none h-auto sm:h-8 text-xs">
                                    <TableHead className="w-[60px] px-2 py-0.5 text-center font-black uppercase tracking-widest border-r border-border/10">No.</TableHead>
                                    <TableHead className="px-2 py-0.5 text-left font-black uppercase tracking-widest border-r border-border/10">Concepto</TableHead>
                                    <TableHead className="w-[80px] px-2 py-0.5 text-center font-black uppercase tracking-widest border-r border-border/10">UM</TableHead>
                                    <TableHead className="w-[140px] px-2 py-0.5 text-right font-medium uppercase tracking-widest text-muted-foreground/40 bg-muted/10 border-r border-border/10">Valor Histórico</TableHead>
                                    <TableHead className="w-[120px] px-2 py-0.5 text-right font-black uppercase tracking-widest text-primary bg-primary/10 border-r border-primary/30 shadow-sm">Total</TableHead>
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
                                        calculated={calculatedValues?.[row.id] || {} as CalculatedRowValue}
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
            section={activeSectionForActions?.section ?? null}
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

        {/* ── Sticky Precio de Venta Bar — SAS ISO 19249: key output always visible ── */}
        {(() => {
          const pricingSections = sections.filter(s => {
            const num = parseInt(s.id.replace('s', ''), 10);
            return num >= 13 && num <= 16;
          });
          if (pricingSections.length === 0) return null;
          const precioRow = sections.find(s => s.id === 's14')?.rows?.[0];
          const utilidadRow = sections.find(s => s.id === 's13')?.rows?.[0];
          const precioCalc = precioRow ? calculatedValues?.[precioRow.id] : null;
          const utilidadCalc = utilidadRow ? calculatedValues?.[utilidadRow.id] : null;
          const costoYGastoRow = sections.find(s => s.id === 's12')?.rows?.[0];
          const costoYGastoCalc = costoYGastoRow ? calculatedValues?.[costoYGastoRow.id] : null;

          return (
            <div className="sticky bottom-0 z-30 mt-4 -mx-1">
              <div className="bg-card/95 backdrop-blur-xl border-2 border-t border-primary/30 rounded-t-2xl shadow-[0_-4px_24px_rgba(0,0,0,0.15)] px-4 py-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-[9px] font-black uppercase tracking-widest text-primary bg-primary/5 px-2 py-0.5 rounded-lg">Precio de Venta</span>
                  {costoYGastoCalc && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">C+G:</span>
                      <span className="text-xs font-bold tabular-nums text-foreground">{formatAccounting(costoYGastoCalc.total ?? 0)}</span>
                    </div>
                  )}
                  {utilidadCalc && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Utilidad:</span>
                      <span className="text-xs font-bold tabular-nums text-foreground">{formatAccounting(utilidadCalc.total ?? 0)}</span>
                    </div>
                  )}
                  {precioCalc && (
                    <div className="flex items-center gap-1.5 ml-auto">
                      <span className="text-[9px] font-black uppercase tracking-widest text-primary">Precio Final:</span>
                      <span className="text-base font-black tabular-nums text-primary">{formatAccounting(precioCalc.total ?? 0)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
});

CostSheetInteractiveTable.displayName = 'CostSheetInteractiveTable';

export default CostSheetInteractiveTable;
