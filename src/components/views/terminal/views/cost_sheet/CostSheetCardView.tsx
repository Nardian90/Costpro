'use client';
import { LazyRender } from '@/components/ui/LazyRender';
import { toast } from 'sonner';

import React, { useState, memo, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Plus,
  Trash2,
  Settings2,
  ArrowRight,
  LayoutGrid,
  Sparkles,
  FunctionSquare,
  AlertTriangle,
  XCircle,
  MoreVertical
} from 'lucide-react';
import { cn, formatAccounting, formatCurrency } from '@/lib/utils';
import { exportSectionToExcel, importSectionFromExcel } from '@/services/excel-service';
import { isResultRow } from '@/lib/cost-engine/constants';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { CostSheetRow, CostSheetSection, CalculatedRowValue, CostSheetAnnex } from '@/types/cost-sheet';
import reinicioTemplate from '@/lib/data/costpro-reinicio';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormulaEditor } from './FormulaEditor';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CostSheetSectionActionsPanel } from './CostSheetSectionActionsPanel';

// Define types based on our hook and data structure
type CalculatedValues = Record<string, CalculatedRowValue>;

interface CostSheetCardViewProps {
  sections: CostSheetSection[];
  groupedSections?: { id: string, label: string, sectionIds: string[] }[];
  calculatedValues: CalculatedValues;
  annexes: CostSheetAnnex[];
  activeSubSectionId: string;
  setActiveSubSectionId: (id: string) => void;
  onOpenSections?: () => void;
  hideHeader?: boolean;
}

interface RowCardProps {
  row: CostSheetRow;
  level: number;
  index: number;
  numbering: string;
  calculated: CalculatedRowValue;
  calculatedValues: Record<string, CalculatedRowValue>;
  path: (string | number)[];
  annexes: any[];
  suggestions: any;
}

const RowCard: React.FC<RowCardProps> = memo(({
  row,
  level,
  index,
  numbering,
  calculated,
  calculatedValues,
  path,
  annexes,
  suggestions
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [isEditingVH, setIsEditingVH] = useState(false);
  const [isEditingTotal, setIsEditingTotal] = useState(false);

  const { updateValue, addMainRow, removeMainRow, reorderMainRow } = useCostSheetStore();
  const applySuggestedFormula = (rowId: string, path: (string | number)[]) => {
    const findSuggested = (rows: any[]): any => {
      for (const r of rows) {
        if (r.id === rowId) return r;
        if (r.children) {
          const found = findSuggested(r.children);
          if (found) return found;
        }
      }
      return null;
    };
    let suggested = null;
    if (reinicioTemplate?.sections) {
      for (const s of reinicioTemplate.sections) {
        suggested = findSuggested(s.rows);
        if (suggested) break;
      }
    }
    if (suggested) {
      if (suggested.totalFormula) {
        updateValue([...path, 'totalFormula'], suggested.totalFormula);
        updateValue([...path, 'formula'], suggested.totalFormula);
      }
      if (suggested.vhFormula) {
        updateValue([...path, 'vhFormula'], suggested.vhFormula);
        updateValue([...path, 'valorHistorico'], 0);
      }
      toast.success("Fórmulas sugeridas aplicadas");
    } else {
      toast.error("No se encontró fórmula sugerida");
    }
  };

  const hasChildren = row.children && row.children.length > 0;
  const isRowPercent = row.isPercent ?? row.is_percent;
  const isResult = isResultRow(String(row.id)) || isRowPercent;

  const safeCalculated = calculated || { total: 0, valorHistorico: 0, baseTotal: 0, coeficiente: 0, hasWarnings: false, audits: [], validationErrors: [], fuente: '', metadata: {} };

  const criticalErrors = (safeCalculated.validationErrors || []).filter(e => e.type === 'CRITICAL');
  const warningErrors = (safeCalculated.validationErrors || []).filter(e => e.type === 'WARNING');
  const hasEngineWarnings = safeCalculated.hasWarnings || (!hasChildren && !isRowPercent && safeCalculated.total === 0 && ((row.valorHistorico ?? 0) > 0 || !!row.baseDeCalculoRef));

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  const handleValueChange = (field: string, val: any) => {
    updateValue([...path, field], val);
  };

  const handleVHSave = (val: string) => {
    if (val.startsWith('=')) {
        handleValueChange('vhFormula', val);
        handleValueChange('valorHistorico', 0);
    } else {
        handleValueChange('vhFormula', null);
        handleValueChange('valorHistorico', parseFloat(val) || 0);
    }
    setIsEditingVH(false);
  };

  const handleTotalSave = (val: string) => {
    if (val.startsWith('=')) {
        handleValueChange('formula', val);
        handleValueChange('totalFormula', val);
    } else {
        handleValueChange('formula', null);
        handleValueChange('totalFormula', null);
        handleValueChange('total', parseFloat(val) || 0);
    }
    setIsEditingTotal(false);
  };

  return (
    <div className={cn(
      "p-4 rounded-3xl border transition-all duration-300 relative overflow-hidden",
      isResult ? "bg-primary/5 border-primary/20" : "bg-card border-border/50",
      level > 0 && "ml-4 border-l-2",
      isExpanded && "shadow-lg"
    )}>
      {/* Background patterns for visual interest */}
      <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
          <LayoutGrid className="w-24 h-24 rotate-12" />
      </div>

      <div className="relative z-10">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="text-[10px] font-black font-mono text-muted-foreground/40 shrink-0">
              {numbering}
            </span>
            <div className="flex-1 min-w-0">
               {isEditingLabel ? (
                 <Input
                    autoFocus
                    className="h-8 text-xs font-bold uppercase tracking-widest bg-muted/50 border-primary/20 rounded-xl"
                    defaultValue={row.label}
                    onBlur={(e) => { handleValueChange('label', e.target.value); setIsEditingLabel(false); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { handleValueChange('label', (e.target as HTMLInputElement).value); setIsEditingLabel(false); } }}
                 />
               ) : (
                 <h4 className="text-xs font-black uppercase tracking-widest text-foreground truncate cursor-pointer hover:text-primary transition-colors" onClick={() => setIsEditingLabel(true)}>
                    {row.label}
                 </h4>
               )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
             {hasChildren && (
                <button
                  onClick={handleToggle}
                  className="p-2 rounded-xl bg-muted/50 text-muted-foreground active:scale-95 transition-all"
                >
                  <ChevronRight className={cn("w-4 h-4 transition-transform", isExpanded && "rotate-90")} />
                </button>
             )}

             <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl hover:bg-primary/10">
                    <MoreVertical className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2 rounded-2xl shadow-xl z-50" align="end">
                  <div className="grid grid-cols-1 gap-1">
                    <Button variant="ghost" size="sm" className="justify-start gap-2 text-xs font-bold uppercase tracking-widest rounded-lg" onClick={() => reorderMainRow(path, 'up')}>
                      <ChevronUp className="w-3.5 h-3.5" /> Subir
                    </Button>
                    <Button variant="ghost" size="sm" className="justify-start gap-2 text-xs font-bold uppercase tracking-widest rounded-lg" onClick={() => reorderMainRow(path, 'down')}>
                      <ChevronDown className="w-3.5 h-3.5" /> Bajar
                    </Button>
                                        <Button variant="ghost" size="sm" className="justify-start gap-2 text-xs font-bold uppercase tracking-widest rounded-lg text-primary" onClick={() => applySuggestedFormula(row.id, path)}>
                      <Wand2 className="w-3.5 h-3.5" /> Sugerir Fórmula
                    </Button>
                    <Button variant="ghost" size="sm" className="justify-start gap-2 text-xs font-bold uppercase tracking-widest rounded-lg text-primary" onClick={() => addMainRow([...path, 'children'])}>
                      <Plus className="w-3.5 h-3.5" /> Añadir Hijo
                    </Button>
                    <Button variant="ghost" size="sm" className="justify-start gap-2 text-xs font-bold uppercase tracking-widest rounded-lg text-destructive hover:bg-destructive/10" onClick={() => removeMainRow(path)}>
                      <Trash2 className="w-3.5 h-3.5" /> Eliminar
                    </Button>
                  </div>
                </PopoverContent>
             </Popover>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-xs font-black uppercase tracking-[0.15em] text-muted-foreground/60">Histórico / %</p>
            <div
              className="relative cursor-pointer group/vh"
              onClick={() => setIsEditingVH(true)}
            >
              {isEditingVH ? (
                <div className="z-20 relative">
                  <FormulaEditor
                    initialValue={row.vhFormula || String(row.valorHistorico || 0)}
                    onSave={handleVHSave}
                    onCancel={() => setIsEditingVH(false)}
                    suggestions={suggestions}

                  />
                </div>
              ) : (
                <div className="flex items-baseline gap-1">
                  <span className={cn(
                    "text-lg font-black font-mono tracking-tighter transition-colors",
                    (row.vhFormula || hasChildren) ? "text-primary/70" : "text-foreground"
                  )}>
                    {hasChildren
                      ? formatAccounting(safeCalculated.calculatedVH ?? safeCalculated.valorHistorico ?? 0)
                      : (row.vhFormula
                          ? formatAccounting(safeCalculated.calculatedVH ?? safeCalculated.valorHistorico ?? 0)
                          : (isRowPercent ? ((row.value ?? 0) * 100).toFixed(3) : formatAccounting(row.valorHistorico ?? 0)))}
                  </span>
                  {row.vhFormula && <FunctionSquare className="w-3 h-3 text-primary/30" />}
                  {isRowPercent && <span className="text-[10px] font-bold text-muted-foreground">%</span>}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1 text-right">
            <p className="text-xs font-black uppercase tracking-[0.15em] text-primary/60">Total {row.um || row.unit || "CUP"}</p>
            <div
              className="relative cursor-pointer group/total"
              onClick={() => !hasChildren && setIsEditingTotal(true)}
            >
              {isEditingTotal ? (
                 <div className="z-20 relative">
                    <FormulaEditor
                      initialValue={row.formula || row.totalFormula || String(safeCalculated.total)}
                      onSave={handleTotalSave}
                      onCancel={() => setIsEditingTotal(false)}
                      suggestions={suggestions}

                    />
                 </div>
              ) : (
                <div className="flex items-center justify-end gap-1.5">
                  <span className="text-xl font-black font-mono tracking-tighter text-primary drop-shadow-sm">
                    {formatAccounting(safeCalculated.total)}
                  </span>
                  {(row.formula || row.totalFormula) && <FunctionSquare className="w-3 h-3 text-primary/40" />}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Validation Badges */}
        {(criticalErrors.length > 0 || warningErrors.length > 0 || hasEngineWarnings) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {criticalErrors.map((e, idx) => (
              <div key={idx} className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-destructive/10 border border-destructive/20 text-[9px] font-bold text-destructive uppercase tracking-widest">
                <XCircle className="w-2.5 h-2.5" />
                {e.message}
              </div>
            ))}
            {warningErrors.map((e, idx) => (
              <div key={idx} className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[9px] font-bold text-amber-500 uppercase tracking-widest">
                <AlertTriangle className="w-2.5 h-2.5" />
                {e.message}
              </div>
            ))}
            {hasEngineWarnings && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-primary/10 border border-primary/20 text-[9px] font-bold text-primary uppercase tracking-widest">
                <Sparkles className="w-2.5 h-2.5" />
                Calculado
              </div>
            )}
          </div>
        )}
      </div>

      {/* Children Container */}
      <AnimatePresence>
        {isExpanded && hasChildren && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-4 space-y-4 pt-4 border-t border-border/30"
          >
            {row.children!.map((child, childIdx) => (
              <RowCard
                key={child.id}
                row={child}
                level={level + 1}
                index={childIdx}
                numbering={`${numbering}.${childIdx + 1}`}
                calculated={calculatedValues?.[child.id] || {} as any}
                calculatedValues={calculatedValues}
                path={[...path, 'children', childIdx]}
                annexes={annexes}
                suggestions={suggestions}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

const CostSheetCardView: React.FC<CostSheetCardViewProps> = memo(({
  sections,
  groupedSections,
  calculatedValues,
  annexes,
  activeSubSectionId,
  setActiveSubSectionId,
  onOpenSections,
  hideHeader = false
}) => {
  const { updateValue, addMainRow, addMainSection, removeMainSection } = useCostSheetStore();
  const [activeSectionForActions, setActiveSectionForActions] = useState<{ section: any, index: number } | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (id: string) => {
    setCollapsedSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const currentGroup = groupedSections?.find(g => g.id === activeSubSectionId);
  const isAll = activeSubSectionId === 'all';
  const targetSectionIds = currentGroup ? currentGroup.sectionIds : (isAll ? sections.map(s => s.id) : [activeSubSectionId]);

  // Suggestions for FormulaEditor
  const suggestions = useMemo(() => {
    const list: any[] = [
      ...(annexes || []).map(a => ({ label: `Anexo ${a.id}`, value: `Anexo${a.id}`, description: a.title })),
    ];
    sections.forEach(s => {
      s.rows.forEach(r => {
        list.push({ label: `Fila ${r.id}`, value: `ref('${r.id}')`, description: r.label });
        list.push({ label: `VH Fila ${r.id}`, value: `vh('${r.id}')`, description: `Valor Histórico de ${r.label}` });
        if (r.children) {
          r.children.forEach(c => {
            list.push({ label: `Fila ${c.id}`, value: `ref('${c.id}')`, description: c.label });
            list.push({ label: `VH Fila ${c.id}`, value: `vh('${c.id}')`, description: `Valor Histórico de ${c.label}` });
          });
        }
      });
    });
    list.push(
      { label: 'SUMA', value: 'SUMA(', description: 'Suma de valores' },
      { label: 'PCT', value: 'PCT(', description: 'Porcentaje de un valor' },
      { label: 'hijos', value: 'hijos', description: 'Referencia a filas hijas' }
    );
    return list;
  }, [sections, annexes]);


  if (!sections || sections.length === 0) {
    return (
        <div className="p-12 text-center bg-muted/20 rounded-[2.5rem] border-2 border-dashed border-border/50 mx-4">
            <div className="max-w-md mx-auto space-y-6">
                <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto rotate-12">
                    <LayoutGrid className="w-10 h-10 text-primary" />
                </div>
                <div className="space-y-2">
                    <h3 className="text-2xl font-black uppercase tracking-tight italic">Tablero Vacío</h3>
                    <p className="text-sm text-muted-foreground font-medium">Esta ficha aún no tiene una estructura de costos. Empieza diseñando la primera sección.</p>
                </div>
                <Button
                  onClick={addMainSection}
                  className="w-full h-16 rounded-[1.5rem] bg-primary text-primary-foreground font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Crear Primera Sección
                </Button>
            </div>
        </div>
    );
  }

  return (
    <div className="space-y-12 pb-24" data-testid="cost-sheet-card-view">
      <div className="px-4">
        <div className="flex items-center justify-between bg-primary/5 border border-primary/10 rounded-2xl p-3 mb-8">
          <div className="flex items-center gap-3">
             <LayoutGrid className="w-4 h-4 text-primary" />
             <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/70">Modo Tarjeta Activo</span>
          </div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">
            {annexes?.[0]?.data?.[0]?.um || 'UND'} / TOTAL
          </span>
        </div>
        {sections.map((section, sectionIndex) => {
          const isTarget = targetSectionIds.includes(section.id);
          if (!isTarget) return null;

          return (
            <LazyRender key={section.id}>
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 px-4 mb-8">
              {!hideHeader && (
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleSection(section.id)}
                      className="p-1.5 rounded-lg hover:bg-primary/10 transition-colors group"
                    >
                      <ChevronDown className={cn("w-4 h-4 text-primary transition-transform", collapsedSections[section.id] && "-rotate-90")} />
                    </button>
                    <Input
                      className="h-8 text-xs font-black uppercase tracking-[0.2em] text-foreground bg-transparent border-none focus-visible:ring-0 p-0 w-auto min-w-[200px]"
                      value={section.label}
                      onChange={(e) => updateValue(['sections', sectionIndex, 'label'], e.target.value)}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 w-9 p-0 bg-primary/5 text-primary rounded-xl"
                    onClick={() => setActiveSectionForActions({ section, index: sectionIndex })}
                  >
                    <Settings2 className="w-4 h-4" />
                  </Button>
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
                    <div className="space-y-4 pt-2">
                      {(section?.rows || []).map((row, rowIndex) => (
                        <RowCard
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

                      <Button
                          onClick={() => addMainRow(['sections', sectionIndex, 'rows'])}
                          variant="outline"
                          className="w-full h-12 rounded-2xl border-dashed border-2 hover:border-primary hover:text-primary transition-all flex items-center justify-center gap-2 bg-primary/5 mt-4"
                      >
                          <Plus className="w-4 h-4" />
                          <span className="font-bold uppercase tracking-widest text-xs">Añadir Concepto</span>
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            </LazyRender>
          );
        })}
      </div>

      <CostSheetSectionActionsPanel
        isOpen={!!activeSectionForActions}
        onClose={() => setActiveSectionForActions(null)}
        section={activeSectionForActions?.section}
        onExport={() => activeSectionForActions && exportSectionToExcel(activeSectionForActions.section, calculatedValues)}
        onImport={() => {
            toast.info("Importación desde Excel no disponible en vista de tarjetas");
        }}
        onAddRow={() => activeSectionForActions && addMainRow(['sections', activeSectionForActions.index, 'rows'])}
        onRemove={() => {
            if (activeSectionForActions) {
                removeMainSection(activeSectionForActions.index);
                setActiveSectionForActions(null);
            }
        }}
      />
    </div>
  );
});

CostSheetCardView.displayName = 'CostSheetCardView';

export default CostSheetCardView;
