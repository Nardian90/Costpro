'use client';

import React, { useState, useMemo, useRef, memo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import {
  ChevronRight,
  CornerDownRight,
  AlertTriangle,
  Sparkles,
  FunctionSquare,
  Wand2,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  XCircle,
  Settings2
} from 'lucide-react';
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
import { cn, formatAccounting } from '@/lib/utils';
import { isResultRow } from '@/lib/cost-engine/constants';
import { FormulaEditor } from './FormulaEditor';
import { toast } from 'sonner';
import { CostSheetSectionActionsPanel } from './CostSheetSectionActionsPanel';
import { exportSectionToExcel, importSectionFromExcel } from '@/services/excel-service';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import type {
  CostSheetSection,
  CostSheetRow,
  CostSheetAnnex,
  CalculatedRowValue
} from '@/types/cost-sheet';
import reinicioTemplate from '@/lib/data/costpro-reinicio';

// ── Types ────────────────────────────────────────────────────────────

type CalculatedValues = Record<string, CalculatedRowValue>;

interface CostSheetFlatTableProps {
  sections: CostSheetSection[];
  calculatedValues: CalculatedValues;
  annexes: CostSheetAnnex[];
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Sequential row counter across all sections */
interface FlatRow {
  row: CostSheetRow;
  sectionIndex: number;
  rowIndexInSection: number;
  globalIndex: number;
  level: number;
  numbering: string;
  sectionLabel: string;
  sectionId: string;
  fullPath: (string | number)[];
  isSectionHeader: false;
}

interface SectionDivider {
  isSectionHeader: true;
  label: string;
  sectionIndex: number;
  sectionId: string;
  rowCount: number;
}

type FlatItem = FlatRow | SectionDivider;

/** Build flat list of rows with section dividers */
function buildFlatList(sections: CostSheetSection[]): FlatItem[] {
  const items: FlatItem[] = [];
  let globalIdx = 0;

  sections.forEach((section, sIdx) => {
    const rows = section.rows || [];
    if (rows.length === 0) return;

    // Section divider
    items.push({
      isSectionHeader: true,
      label: section.label || `Sección ${section.id}`,
      sectionIndex: sIdx,
      sectionId: section.id,
      rowCount: rows.length
    });

    // Rows
    const addRows = (rows: CostSheetRow[], level: number, parentNumbering: string, basePath: (string | number)[]) => {
      rows.forEach((row, rIdx) => {
        globalIdx++;
        const numbering = parentNumbering
          ? `${parentNumbering}.${rIdx + 1}`
          : `${sIdx + 1}.${rIdx + 1}`;

        items.push({
          row,
          sectionIndex: sIdx,
          rowIndexInSection: rIdx,
          globalIndex: globalIdx,
          level,
          numbering,
          sectionLabel: section.label || '',
          sectionId: section.id,
          fullPath: [...basePath, rIdx],
          isSectionHeader: false
        });

        if (row.children && row.children.length > 0) {
          addRows(row.children, level + 1, numbering, [...basePath, rIdx, 'children']);
        }
      });
    };

    addRows(rows, 0, '', ['sections', sIdx, 'rows']);
  });

  return items;
}

// ── Technical Tooltip ────────────────────────────────────────────────

const TTip = ({ term, description, children }: { term: string; description: string; children: React.ReactNode }) => (
  <TooltipProvider delayDuration={600}>
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="cursor-help flex items-center gap-0.5 justify-center">{children}</div>
      </TooltipTrigger>
      <TooltipContent className="max-w-[220px] p-2.5 rounded-xl border-border bg-popover shadow-xl z-50">
        <p className="font-black uppercase tracking-widest text-[9px] border-b border-border/50 pb-1.5 mb-1.5 text-primary">{term}</p>
        <p className="text-[10px] leading-relaxed text-muted-foreground">{description}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

// ── Section Divider Row ──────────────────────────────────────────────

const SectionDividerRow: React.FC<{
  divider: SectionDivider;
  isCollapsed: boolean;
  onToggle: () => void;
  sectionColorIdx: number;
}> = ({ divider, isCollapsed, onToggle, sectionColorIdx }) => {
  const bgColors = [
    'bg-primary/5',
    'bg-violet-500/5',
    'bg-amber-500/5',
    'bg-emerald-500/5',
    'bg-rose-500/5',
    'bg-cyan-500/5',
  ];
  const borderColors = [
    'border-l-primary/40',
    'border-l-violet-500/40',
    'border-l-amber-500/40',
    'border-l-emerald-500/40',
    'border-l-rose-500/40',
    'border-l-cyan-500/40',
  ];

  return (
    <TableRow className={cn(
      "h-8 border-y border-border/30 group hover:bg-primary/5 transition-colors cursor-pointer",
      bgColors[sectionColorIdx % bgColors.length]
    )} onClick={onToggle}>
      <TableCell colSpan={6} className="px-3 py-1">
        <div className="flex items-center gap-2">
          <ChevronRight className={cn(
            "w-3.5 h-3.5 text-muted-foreground transition-transform duration-200",
            !isCollapsed && "rotate-90"
          )} />
          <div className={cn("w-0.5 h-4 rounded-full border-l-2", borderColors[sectionColorIdx % borderColors.length])} />
          <span className="text-[11px] font-black uppercase tracking-[0.15em] text-foreground">
            {divider.label}
          </span>
          <span className="text-[9px] text-muted-foreground/60 font-mono ml-2">
            ({divider.rowCount} conceptos)
          </span>
          <Settings2 className="w-3 h-3 text-muted-foreground/30 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </TableCell>
    </TableRow>
  );
};

// ── Data Row ─────────────────────────────────────────────────────────

interface DataRowProps {
  item: FlatRow;
  calculatedValues: CalculatedValues;
  annexes: CostSheetAnnex[];
  suggestions: { label: string; value: string; description?: string }[];
  allSections: CostSheetSection[];
}

const DataRow: React.FC<DataRowProps> = memo(({ item, calculatedValues, annexes, suggestions, allSections }) => {
  const { row, level, numbering, sectionIndex, rowIndexInSection, globalIndex, sectionId } = item;
  const [isExpanded, setIsExpanded] = useState(true);
  const [isEditingTotal, setIsEditingTotal] = useState(false);
  const [isEditingVH, setIsEditingVH] = useState(false);
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [isEditingUM, setIsEditingUM] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(false);

  const updateValue = useCostSheetStore(state => state.updateValue);
  const addMainRow = useCostSheetStore(state => state.addMainRow);
  const removeMainRow = useCostSheetStore(state => state.removeMainRow);
  const reorderMainRow = useCostSheetStore(state => state.reorderMainRow);

  const path = item.fullPath;
  const hasChildren = row.children && row.children.length > 0;
  const isRowPercent = row.isPercent ?? row.is_percent;
  const isResult = isResultRow(String(row.id)) || isRowPercent;
  const calculated = calculatedValues?.[row.id] || {} as CalculatedRowValue;
  const safeCalculated = calculated || { total: 0, valorHistorico: 0, baseTotal: 0, coeficiente: 0, hasWarnings: false, audits: [], validationErrors: [], fuente: '', metadata: {} };
  const criticalErrors = (safeCalculated.validationErrors || []).filter(e => e.type === 'CRITICAL');
  const hasEngineWarnings = safeCalculated.hasWarnings || (!hasChildren && !isRowPercent && safeCalculated.total === 0 && ((row.valorHistorico ?? 0) > 0 || !!row.baseDeCalculoRef));

  const handleValueChange = (field: string, val: string | number | boolean | null) => {
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
    <>
      <TableRow className={cn(
        "h-7 text-[11px] transition-colors group border-b border-border/15",
        "hover:bg-primary/[0.03]",
        isResult && "bg-primary/[0.04] font-semibold",
        !isResult && globalIndex % 2 === 0 && "bg-muted/[0.15]"
      )}>
        {/* Excel-style row number */}
        <TableCell className="w-[40px] px-1.5 py-0 text-center text-[10px] font-mono text-muted-foreground/40 tabular-nums border-r border-border/15">
          {globalIndex}
        </TableCell>

        {/* Numbering */}
        <TableCell className="w-[55px] px-1.5 py-0 text-center text-[10px] font-bold text-muted-foreground/60 tabular-nums border-r border-border/15">
          {numbering}
        </TableCell>

        {/* Concepto */}
        <TableCell
          style={{ paddingLeft: `${level * 14 + 6}px` }}
          className="px-1.5 py-0 font-medium text-foreground border-r border-border/15 min-w-[180px]"
        >
          <div className="flex items-center gap-1 min-w-0 group/row">
            {hasChildren ? (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-0.5 rounded hover:bg-primary/10 shrink-0"
                type="button"
                aria-label={isExpanded ? `Contraer ${row.label}` : `Expandir ${row.label}`}
              >
                <ChevronRight className={cn('w-3 h-3 transition-transform', isExpanded && 'rotate-90')} />
              </button>
            ) : (
              <CornerDownRight className="w-3 h-3 text-muted-foreground/40 shrink-0 ml-0.5" />
            )}

            {isEditingLabel ? (
              <Input
                autoFocus
                className="h-6 text-[11px] py-0 border-primary/40"
                defaultValue={row.label}
                aria-label={`Nombre del concepto ${row.label}`}
                onBlur={(e) => {
                  handleValueChange('label', e.target.value);
                  setIsEditingLabel(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleValueChange('label', (e.target as HTMLInputElement).value);
                    setIsEditingLabel(false);
                  }
                  if (e.key === 'Escape') setIsEditingLabel(false);
                }}
              />
            ) : (
              <span
                role="button"
                tabIndex={0}
                className="truncate flex-1 cursor-text hover:text-primary transition-colors"
                onClick={() => setIsEditingLabel(true)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsEditingLabel(true); } }}
              >
                {row.label}
              </span>
            )}

            {/* Actions (hover reveal) */}
            <div className="flex items-center gap-0 opacity-0 group-hover:opacity-100 transition-opacity ml-auto shrink-0">
              <Button variant="ghost" size="icon" type="button" className="h-5 w-5 text-muted-foreground hover:bg-primary/10 hover:text-primary" onClick={() => reorderMainRow(path, 'up')} aria-label={`Subir ${row.label}`}>
                <ChevronUp className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" type="button" className="h-5 w-5 text-muted-foreground hover:bg-primary/10 hover:text-primary" onClick={() => reorderMainRow(path, 'down')} aria-label={`Bajar ${row.label}`}>
                <ChevronDown className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" type="button" className="h-5 w-5 text-primary hover:bg-primary/10" onClick={() => addMainRow([...path, 'children'])} aria-label={`Agregar fila a ${row.label}`}>
                <Plus className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" type="button" className="h-5 w-5 text-destructive hover:bg-destructive/10" onClick={() => setDeleteTarget(true)} aria-label={`Eliminar ${row.label}`}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </TableCell>

        {/* UM */}
        <TableCell
          className="px-1.5 py-0 text-center w-[65px] border-r border-border/15 italic text-muted-foreground/60 font-mono text-[9px] cursor-pointer hover:bg-primary/5"
          onClick={() => setIsEditingUM(true)}
        >
          {isEditingUM ? (
            <Input
              autoFocus
              className="h-5 text-[9px] px-0.5 py-0 text-center font-mono"
              defaultValue={row.um || row.unit || "Pesos"}
              onBlur={(e) => { handleValueChange("um", e.target.value); setIsEditingUM(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") { handleValueChange("um", (e.target as HTMLInputElement).value); setIsEditingUM(false); } if (e.key === "Escape") setIsEditingUM(false); }}
            />
          ) : (
            row.um || row.unit || "Pesos"
          )}
        </TableCell>

        {/* Valor Histórico */}
        <TableCell className={cn("px-1.5 py-0 text-right border-r border-border/15", !hasChildren && "cursor-pointer hover:bg-primary/5")} onClick={() => !hasChildren && setIsEditingVH(true)}>
          {isEditingVH ? (
            <FormulaEditor
              initialValue={row.vhFormula || String(row.valorHistorico || 0)}
              onSave={handleVHSave}
              onCancel={() => setIsEditingVH(false)}
              suggestions={suggestions}
            />
          ) : (
            <div className="flex items-center justify-end gap-0.5">
              <Input
                type="text"
                className={cn(
                  "h-6 text-right text-[11px] px-1 cursor-pointer flex-1 tabular-nums",
                  "bg-transparent border-transparent hover:border-border/30 focus-visible:ring-0",
                  (hasChildren || row.vhFormula) && "bg-muted/20 font-semibold border-dashed"
                )}
                value={hasChildren
                  ? formatAccounting(safeCalculated.calculatedVH ?? safeCalculated.valorHistorico ?? 0)
                  : (row.vhFormula
                    ? formatAccounting(safeCalculated.calculatedVH ?? safeCalculated.valorHistorico ?? 0)
                    : formatAccounting(safeCalculated.calculatedVH ?? row.valorHistorico ?? 0))}
                readOnly={true}
                aria-label={`VH de ${row.label}`}
              />
              {row.vhFormula && <FunctionSquare className="w-2.5 h-2.5 text-primary/30 shrink-0" />}
              {isRowPercent && <span className="text-[9px] font-bold text-muted-foreground">%</span>}
            </div>
          )}
        </TableCell>

        {/* Total */}
        <TableCell
          className={cn("px-1.5 py-0 text-right font-bold tabular-nums text-primary text-[11px] transition-colors", !hasChildren && "cursor-pointer hover:bg-primary/5")}
          onClick={() => !hasChildren && setIsEditingTotal(true)}
        >
          {isEditingTotal ? (
            <FormulaEditor
              initialValue={(row.formula ?? row.totalFormula ?? '')}
              onSave={handleTotalSave}
              onCancel={() => setIsEditingTotal(false)}
              suggestions={suggestions}
            />
          ) : (
            <div className="flex items-center justify-end gap-0.5">
              <span className={cn((row.formula || row.totalFormula) && "underline decoration-primary/20 decoration-dotted underline-offset-2")}>
                {formatAccounting(safeCalculated.total)}
              </span>
              {criticalErrors.length > 0 && <XCircle className="w-2.5 h-2.5 text-destructive shrink-0" />}
              {hasEngineWarnings && <Sparkles className="w-2.5 h-2.5 text-primary/30 animate-pulse shrink-0" />}
            </div>
          )}
        </TableCell>
      </TableRow>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este concepto?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción eliminará el concepto y todos sus hijos. No se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { removeMainRow(path); setDeleteTarget(false); toast.success("Concepto eliminado"); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});

DataRow.displayName = 'FlatDataRow';

// ── Main Component ───────────────────────────────────────────────────

const CostSheetFlatTable: React.FC<CostSheetFlatTableProps> = ({
  sections,
  calculatedValues,
  annexes
}) => {
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [activeSectionForActions, setActiveSectionForActions] = useState<{ section: CostSheetSection; index: number } | null>(null);
  const [importingSectionIndex, setImportingSectionIndex] = useState<number | null>(null);

  const sectionInputRef = useRef<HTMLInputElement>(null);
  const updateValue = useCostSheetStore(state => state.updateValue);
  const addMainRow = useCostSheetStore(state => state.addMainRow);
  const removeMainSection = useCostSheetStore(state => state.removeMainSection);

  const handleImportSectionExcel = async (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await importSectionFromExcel(file);
      updateValue(['sections', index, 'rows'], rows);
      toast.success('Sección importada correctamente');
    } catch (err) {
      toast.error('Error al importar sección');
      console.error(err);
    }
  };

  const toggleSection = (sectionId: string) => {
    setCollapsedSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  // Build flat list
  const flatItems = useMemo(() => buildFlatList(sections), [sections]);

  // Filter out collapsed sections
  const visibleItems = useMemo(() => {
    const result: FlatItem[] = [];
    let skipUntilNextDivider = false;
    for (const item of flatItems) {
      if (item.isSectionHeader) {
        skipUntilNextDivider = !!collapsedSections[item.sectionId];
        result.push(item);
        continue;
      }
      if (!skipUntilNextDivider) result.push(item);
    }
    return result;
  }, [flatItems, collapsedSections]);

  // Formula suggestions
  const suggestions = useMemo(() => {
    const list: { label: string; value: string; description?: string }[] = [
      ...(annexes || []).map(a => ({ label: `Anexo ${a.id}`, value: `Anexo${a.id}`, description: a.title })),
    ];
    sections.forEach(s => {
      s.rows.forEach(r => {
        list.push({ label: `Fila ${r.id}`, value: `ref('${r.id}')`, description: r.label });
        list.push({ label: `VH ${r.id}`, value: `vh('${r.id}')`, description: `VH de ${r.label}` });
        if (r.children) {
          r.children.forEach(c => {
            list.push({ label: `Fila ${c.id}`, value: `ref('${c.id}')`, description: c.label });
            list.push({ label: `VH ${c.id}`, value: `vh('${c.id}')`, description: `VH de ${c.label}` });
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

  const totalRows = flatItems.filter(i => !i.isSectionHeader).length;

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Stats bar */}
      <div className="flex items-center justify-between px-3 py-1.5 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="font-mono">{sections.length} secciones</span>
          <span className="font-mono">{totalRows} filas</span>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground/50">
          <span>Modo Hoja</span>
        </div>
      </div>

      {/* Excel-like Table */}
      <div className="border border-border/60 rounded-xl overflow-hidden shadow-sm bg-card">
        <div className="overflow-x-auto excel-scroll">
          <Table className="w-full border-collapse" style={{ borderSpacing: 0 }}>
            {/* Frozen Header */}
            <TableHeader className="sticky top-0 z-20">
              <TableRow className="bg-muted/80 hover:bg-transparent border-b border-border/40 h-7">
                <TableHead className="w-[40px] px-1.5 py-0 text-center text-[8px] font-black tracking-widest text-muted-foreground/50 border-r border-border/20">#</TableHead>
                <TableHead className="w-[55px] px-1.5 py-0 text-center text-[8px] font-black tracking-widest text-muted-foreground/50 border-r border-border/20">No.</TableHead>
                <TableHead className="px-2 py-0 text-left text-[8px] font-black tracking-widest text-muted-foreground/50 border-r border-border/20">CONCEPTO</TableHead>
                <TableHead className="w-[65px] px-1.5 py-0 text-center text-[8px] font-black tracking-widest text-muted-foreground/50 border-r border-border/20">
                  <TTip term="Unidad de Medida" description="Unidad en que se expresa el concepto (Pesos, kg, m³, etc.)">
                    <span className="opacity-70">UM</span>
                  </TTip>
                </TableHead>
                <TableHead className="w-[130px] px-1.5 py-0 text-right text-[8px] font-black tracking-widest text-muted-foreground/50 border-r border-border/20">
                  <TTip term="Valor Histórico" description="Costo base unitario de entrada. Clic para editar o usar fórmulas con =">
                    <span className="opacity-70">VALOR HISTÓRICO</span>
                  </TTip>
                </TableHead>
                <TableHead className="w-[120px] px-1.5 py-0 text-right text-[8px] font-black tracking-widest text-muted-foreground/50">
                  <TTip term="Total" description="Resultado calculado. Clic para editar fórmula con =">
                    <span className="opacity-70">TOTAL</span>
                  </TTip>
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {visibleItems.map((item, idx) => {
                if (item.isSectionHeader) {
                  return (
                    <SectionDividerRow
                      key={`divider-${item.sectionId}`}
                      divider={item}
                      isCollapsed={!!collapsedSections[item.sectionId]}
                      onToggle={() => toggleSection(item.sectionId)}
                      sectionColorIdx={item.sectionIndex}
                    />
                  );
                }

                return (
                  <DataRow
                    key={item.row.id}
                    item={item}
                    calculatedValues={calculatedValues}
                    annexes={annexes}
                    suggestions={suggestions}
                    allSections={sections}
                  />
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Hidden file input for section import */}
      <input
        type="file"
        ref={sectionInputRef}
        className="hidden"
        accept=".xlsx,.xls"
        aria-label="Importar sección desde archivo Excel"
        onChange={(e) => {
          if (importingSectionIndex !== null) {
            handleImportSectionExcel(e, importingSectionIndex);
            setImportingSectionIndex(null);
          }
        }}
      />

      {/* Section Actions Panel */}
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
            setActiveSectionForActions(null);
          }
        }}
      />

      {/* Scrollbar styles */}
      <style jsx global>{`
        .excel-scroll::-webkit-scrollbar { height: 6px; width: 6px; }
        .excel-scroll::-webkit-scrollbar-track { background: transparent; }
        .excel-scroll::-webkit-scrollbar-thumb { background: rgba(var(--primary), 0.12); border-radius: 6px; }
        .excel-scroll::-webkit-scrollbar-thumb:hover { background: rgba(var(--primary), 0.25); }
        .excel-scroll::-webkit-scrollbar-corner { background: transparent; }
      `}</style>
    </div>
  );
};

export default CostSheetFlatTable;
