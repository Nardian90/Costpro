'use client';
import { toast } from 'sonner';
import { exportSectionToExcel, importSectionFromExcel } from '@/services/excel-service';

import React, { useState, memo } from 'react';
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
  Info,
  FunctionSquare,
  AlertTriangle,
  XCircle,
  HelpCircle,
  CheckCircle2,
  CornerDownRight,
  MoreVertical
} from 'lucide-react';
import { cn, formatAccounting, formatCurrency } from '@/lib/utils';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { CostSheetRow, CostSheetSection, CalculatedRowValue } from '@/types/cost-sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormulaEditor } from './FormulaEditor';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CostSheetSectionActionsPanel } from './CostSheetSectionActionsPanel';

// Circular Progress Component
const CircularProgress = ({ value, label, subLabel, color = "text-primary" }: { value: number, label: string, subLabel: string, color?: string }) => {
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const safeValue = isNaN(value) ? 0 : value;
  const strokeDashoffset = circumference - (Math.min(safeValue, 100) / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-20 h-20 flex items-center justify-center">
        <svg className="w-full h-full -rotate-90">
          <circle
            cx="40"
            cy="40"
            r={radius}
            className="stroke-muted/10 fill-none"
            strokeWidth="6"
          />
          <motion.circle
            cx="40"
            cy="40"
            r={radius}
            className={cn("fill-none", color)}
            strokeWidth="6"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1, ease: "easeOut" }}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center flex-col">
          <span className="text-sm font-black tracking-tighter">{Math.round(safeValue)}%</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground mb-0.5">{label}</p>
        <p className={cn("text-[10px] font-black tracking-tight", color)}>{subLabel}</p>
      </div>
    </div>
  );
};

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

  const hasChildren = row.children && row.children.length > 0;
  const isResultRow = row.is_percent || ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '13.1', '13.2', '14', '15', '16'].includes(String(row.id));

  const safeCalculated = calculated || { total: 0, valorHistorico: 0, baseTotal: 0, coeficiente: 0, hasWarnings: false, audits: [], validationErrors: [], fuente: '', metadata: {} };

  const criticalErrors = (safeCalculated.validationErrors || []).filter(e => e.type === 'CRITICAL');
  const warningErrors = (safeCalculated.validationErrors || []).filter(e => e.type === 'WARNING');
  const hasEngineWarnings = safeCalculated.hasWarnings || (!hasChildren && !row.is_percent && safeCalculated.total === 0 && ((row.valorHistorico ?? 0) > 0 || !!row.baseDeCalculoRef));

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
    handleValueChange('formula', val);
    setIsEditingTotal(false);
  };

  return (
    <div className={cn(
      "mb-3 rounded-2xl border transition-all overflow-hidden",
      isResultRow ? "bg-primary/5 border-primary/20 shadow-sm" : "bg-card border-border/50",
      level > 0 && "ml-4 border-l-2 border-l-primary/30"
    )}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <span className="text-[10px] font-black text-muted-foreground/50 tabular-nums shrink-0 mt-1">
              {numbering}
            </span>

            <div className="flex-1 min-w-0">
              {isEditingLabel ? (
                <Input
                  autoFocus
                  className="h-8 text-sm font-bold bg-background/50 border-primary/30"
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
                <div className="flex flex-col">
                  <span
                    className="text-sm font-bold text-foreground leading-tight cursor-text"
                    onClick={() => setIsEditingLabel(true)}
                  >
                    {row.label}
                  </span>
                  {row.id === '13' && calculatedValues?.['12']?.total > 0 && (
                    <span className="mt-1 inline-flex w-fit items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                      {((calculatedValues['13'].total / calculatedValues['12'].total) * 100).toFixed(1)}% s/ costo
                    </span>
                  )}
                </div>
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
                    <Button variant="ghost" size="sm" className="justify-start gap-2 text-[10px] font-bold uppercase tracking-widest rounded-lg" onClick={() => reorderMainRow(path, 'up')}>
                      <ChevronUp className="w-3.5 h-3.5" /> Subir
                    </Button>
                    <Button variant="ghost" size="sm" className="justify-start gap-2 text-[10px] font-bold uppercase tracking-widest rounded-lg" onClick={() => reorderMainRow(path, 'down')}>
                      <ChevronDown className="w-3.5 h-3.5" /> Bajar
                    </Button>
                    <Button variant="ghost" size="sm" className="justify-start gap-2 text-[10px] font-bold uppercase tracking-widest rounded-lg text-primary" onClick={() => addMainRow([...path, 'children'])}>
                      <Plus className="w-3.5 h-3.5" /> Añadir Hijo
                    </Button>
                    <Button variant="ghost" size="sm" className="justify-start gap-2 text-[10px] font-bold uppercase tracking-widest rounded-lg text-destructive hover:bg-destructive/10" onClick={() => removeMainRow(path)}>
                      <Trash2 className="w-3.5 h-3.5" /> Eliminar
                    </Button>
                  </div>
                </PopoverContent>
             </Popover>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground/60">Histórico / %</p>
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
                <div className={cn(
                  "p-2 rounded-xl border border-border/50 text-right transition-all",
                  (hasChildren || row.vhFormula) ? "bg-muted/30 font-bold border-dashed border-primary/30" : "bg-background"
                )}>
                  <span className="text-xs font-black tabular-nums">
                    {hasChildren
                      ? formatAccounting(safeCalculated.calculatedVH ?? safeCalculated.valorHistorico ?? 0)
                      : (row.vhFormula
                          ? formatAccounting(safeCalculated.calculatedVH ?? 0)
                          : (row.hasOwnProperty('valorHistorico') ? formatAccounting(row.valorHistorico ?? 0) : (row.is_percent ? ((row.value ?? 0) * 100).toFixed(3) : formatAccounting(row.value ?? 0))))}
                    {row.is_percent && "%"}
                  </span>
                  {row.vhFormula && <FunctionSquare className="w-2.5 h-2.5 text-primary/40 absolute left-2 top-2.5" />}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1 text-right">
            <p className="text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground/60">Total Actual</p>
            <div
              className="relative cursor-pointer group/total"
              onClick={() => setIsEditingTotal(true)}
            >
              {isEditingTotal ? (
                <div className="z-20 relative">
                  <FormulaEditor
                    initialValue={row.formula || String(safeCalculated.total)}
                    onSave={handleTotalSave}
                    onCancel={() => setIsEditingTotal(false)}
                    suggestions={suggestions}
                  />
                </div>
              ) : (
                <div className={cn(
                  "p-2 rounded-xl border border-primary/20 bg-primary/5 flex items-center justify-end gap-2 transition-all",
                  "hover:bg-primary/10"
                )}>
                  {criticalErrors.length > 0 ? (
                    <XCircle className="w-3 h-3 text-destructive animate-pulse" />
                  ) : (warningErrors.length > 0 || hasEngineWarnings) ? (
                    <AlertTriangle className="w-3 h-3 text-amber-500 animate-bounce" />
                  ) : (
                    <CheckCircle2 className="w-3 h-3 text-emerald-500 opacity-40" />
                  )}
                  <span className="text-sm font-black text-primary tabular-nums">
                    {formatCurrency(safeCalculated.total)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && hasChildren && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-border/50 bg-muted/20"
          >
            <div className="p-2 space-y-1">
              {row.children?.map((child, childIdx) => (
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

interface CostSheetCardViewProps {
  sections: CostSheetSection[];
  groupedSections: any[];
  calculatedValues: Record<string, CalculatedRowValue>;
  annexes: any[];
  activeSubSectionId: string;
  setActiveSubSectionId: (id: string) => void;
  onOpenSections: () => void;
}

const CostSheetCardView: React.FC<CostSheetCardViewProps> = memo(({
  sections,
  groupedSections,
  calculatedValues,
  annexes,
  activeSubSectionId,
  setActiveSubSectionId,
  onOpenSections
}) => {
  const { addMainSection, removeMainSection, updateValue, addMainRow } = useCostSheetStore();
  const sectionInputRef = React.useRef<HTMLInputElement>(null);
  const [importingSectionIndex, setImportingSectionIndex] = useState<number | null>(null);
  const [activeSectionForActions, setActiveSectionForActions] = useState<{ section: any, index: number } | null>(null);

  const handleImportSectionExcel = React.useCallback(async (e: React.ChangeEvent<HTMLInputElement>, sectionIndex: number) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
        const importedRows = await importSectionFromExcel(file);
        if (importedRows && importedRows.length > 0) {
            updateValue(['sections', sectionIndex, 'rows'], importedRows);
            toast.success("Sección importada correctamente");
        }
    } catch (error) {
        console.error("Error importing section:", error);
        toast.error("Error al importar la sección. Verifique el formato.");
    } finally {
        if (sectionInputRef.current) sectionInputRef.current.value = '';
    }
  }, [updateValue]);

  // KPI Calculation logic matching Summary
  const getTotal = (id: string) => calculatedValues?.[id]?.total || 0;
  const totalCost = getTotal('12');
  const utility = getTotal('13');
  const finalPrice = getTotal('14');

  // Percentages relative to Final Price (match Stitch design)
  const costPercent = finalPrice > 0 ? (totalCost / finalPrice) * 100 : 0;
  const utilityPercent = finalPrice > 0 ? (utility / finalPrice) * 100 : 0;
  const pricePercent = finalPrice > 0 ? 100 : 0;

  const currentGroup = groupedSections?.find(g => g.id === activeSubSectionId);
  const targetSectionIds = currentGroup ? currentGroup.sectionIds : [activeSubSectionId];

  // Suggestions for FormulaEditor
  const suggestions = React.useMemo(() => {
    const list: any[] = [];
    sections.forEach(s => {
      s.rows.forEach(r => {
        list.push({ id: r.id, label: r.label });
        if (r.children) {
          r.children.forEach(c => list.push({ id: c.id, label: c.label }));
        }
      });
    });
    return list;
  }, [sections]);

  if (!activeSubSectionId) {
    return (
        <div className="py-12 px-4 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="max-w-md mx-auto space-y-6">
                <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-8 neu-raised-sm">
                    <LayoutGrid className="w-10 h-10 text-primary animate-pulse" />
                </div>
                <h2 className="text-2xl font-black text-foreground uppercase tracking-tighter italic">Seleccione una Sección</h2>
                <div className="grid grid-cols-1 gap-3 pt-4">
                    {groupedSections.map((item, idx) => (
                        <button
                            key={item.id}
                            onClick={() => setActiveSubSectionId(item.id)}
                            className="w-full flex items-center justify-between p-4 rounded-2xl bg-background border border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-all group neu-raised-sm active:scale-[0.98]"
                        >
                            <div className="flex items-center gap-3 text-left">
                                <div className="w-1.5 h-8 bg-muted group-hover:bg-primary rounded-full transition-colors" />
                                <span className="font-bold text-xs uppercase tracking-wider">{item.label}</span>
                            </div>
                            <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all" />
                        </button>
                    ))}
                    <Button
                        onClick={addMainSection}
                        variant="outline"
                        className="w-full h-14 rounded-2xl border-dashed border-2 hover:border-primary hover:text-primary transition-all flex items-center justify-center gap-2 bg-primary/5 mt-4"
                    >
                        <Plus className="w-5 h-5" />
                        <span className="font-bold uppercase tracking-widest text-xs">Nueva Sección</span>
                    </Button>
                </div>
            </div>
        </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-5xl mx-auto">
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
      {/* Top circular KPIs */}
      <div className="bg-sidebar/30 backdrop-blur-md rounded-[2.5rem] p-6 border border-border/50 shadow-sm mx-2">
        <div className="flex items-center justify-around">
          <CircularProgress
            value={costPercent}
            label="Costo Total"
            subLabel={formatCurrency(totalCost)}
            color="text-primary"
          />
          <CircularProgress
            value={utilityPercent}
            label="Utilidad"
            subLabel={formatCurrency(utility)}
            color="text-emerald-500"
          />
          <CircularProgress
            value={pricePercent}
            label="P. Venta"
            subLabel={formatCurrency(finalPrice)}
            color="text-blue-500"
          />
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between px-4 mt-8">
          <h3 className="text-lg font-black uppercase tracking-tighter italic flex items-center gap-2">
            <div className="w-1 h-5 bg-primary rounded-full" />
            Análisis de Desglose
          </h3>
          <span className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-widest">
            {annexes?.[0]?.data?.[0]?.um || 'UND'} / TOTAL
          </span>
        </div>
        {sections.map((section, sectionIndex) => {
          const isTarget = targetSectionIds.includes(section.id);
          if (!isTarget) return null;

          return (
            <div key={section.id} className="animate-in fade-in slide-in-from-bottom-2 duration-500 px-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-1 h-6 bg-primary rounded-full" />
                  <Input
                    className="h-8 text-[11px] font-black uppercase tracking-[0.2em] text-foreground bg-transparent border-none focus-visible:ring-0 p-0 w-auto min-w-[200px]"
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

              <div className="space-y-1">
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
                    <span className="font-bold uppercase tracking-widest text-[10px]">Añadir Concepto</span>
                </Button>
              </div>
            </div>
          );
        })}
      </div>

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
                setActiveSectionForActions(null);
            }
        }}
      />
    </div>
  );
});

export default CostSheetCardView;
