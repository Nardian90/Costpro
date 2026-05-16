'use client';

import React, { useState, useRef, useMemo, memo } from 'react';
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
  Settings2,
  HelpCircle,
  ExternalLink,
  ShieldAlert,
  Info,
  CircleDot
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
import { FormulaEditor } from './FormulaEditor';
import { toast } from 'sonner';
import { CostSheetSectionActionsPanel } from './CostSheetSectionActionsPanel';
import { exportSectionToExcel } from '@/services/excel-service';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { useUIStore } from '@/store';
import type {
  CostSheetSection,
  CostSheetRow,
  CostSheetAnnex,
  CalculatedRowValue
} from '@/types/cost-sheet';
import { useCellEditor, useFormulaSuggestions, getRowDiagnostics } from '@/hooks/logic/useCellEditor';
import type { CostSheetFlatTableProps, StorePath } from './cost-sheet-view-shared';
import { handleImportSectionExcel } from './cost-sheet-view-shared';

// ── Types (extended locally) ─────────────────────────────────────────

type CalculatedValues = Record<string, CalculatedRowValue>;

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
  /** The row.id of the nearest ancestor parent row (for collapse tracking) */
  parentRowId?: string;
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
    const addRows = (rows: CostSheetRow[], level: number, parentNumbering: string, basePath: (string | number)[], parentRowId?: string) => {
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
          isSectionHeader: false,
          parentRowId: parentRowId
        });

        if (row.children && row.children.length > 0) {
          addRows(row.children, level + 1, numbering, [...basePath, rIdx, 'children'], row.id);
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
  section?: CostSheetSection;
  calculatedValues?: CalculatedValues;
  onOpenActions?: () => void;
}> = ({ divider, isCollapsed, onToggle, sectionColorIdx, section, calculatedValues, onOpenActions }) => {
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

  // Compute active items and % of total costs
  let activeItems = 0;
  let sectionTotal = 0;
  let totalCosts = 0; // Section 12.1
  let helpText: string | undefined;

  if (section && calculatedValues) {
    const countActive = (rows: CostSheetRow[]) => {
      rows.forEach(r => {
        const hasData = (r.valorHistorico && r.valorHistorico > 0) || r.totalFormula || r.formula || r.vhFormula;
        if (hasData && !r.children?.length) activeItems++;
        if (r.children?.length) countActive(r.children);
      });
    };
    countActive(section.rows || []);

    // Get section total and helpText from first root row
    const rootRow = section.rows?.[0];
    if (rootRow) {
      sectionTotal = calculatedValues[rootRow.id]?.total ?? 0;
      helpText = rootRow.helpText || undefined;
    }

    // Get total costs (section 12.1 = row id "12.1")
    totalCosts = calculatedValues['12.1']?.total ?? 0;
  }

  const pctTotal = totalCosts > 0 && sectionTotal > 0
    ? ((sectionTotal / totalCosts) * 100).toFixed(1)
    : null;

  return (
    <TableRow className={cn(
      "h-8 border-y border-border/30 group hover:bg-primary/5 transition-colors cursor-pointer",
      bgColors[sectionColorIdx % bgColors.length]
    )} onClick={onToggle}>
      <TableCell colSpan={5} className="px-3 py-1">
        <div className="flex items-center gap-2">
          <ChevronRight className={cn(
            "w-3.5 h-3.5 text-muted-foreground transition-transform duration-200",
            !isCollapsed && "rotate-90"
          )} />
          <div className={cn("w-0.5 h-4 rounded-full border-l-2", borderColors[sectionColorIdx % borderColors.length])} />
          <span className="text-[11px] font-black uppercase tracking-[0.15em] text-foreground">
            {divider.label}
          </span>
          <span className="text-[9px] text-muted-foreground/60 font-mono ml-1">
            ({divider.rowCount} conceptos
            {activeItems > 0 && <span className="text-muted-foreground"> · {activeItems} activos</span>})
          </span>
          {pctTotal !== null && (
            <span className={cn(
              "text-[9px] font-mono ml-1 px-1.5 py-0 rounded-full",
              parseFloat(pctTotal) > 20
                ? "bg-primary/10 text-primary font-bold"
                : "bg-muted/50 text-muted-foreground/60"
            )}>
              {pctTotal}%
            </span>
          )}
          {helpText && (
            <TTip term="Ayuda de sección" description={helpText}>
              <HelpCircle className="w-3 h-3 text-primary/40 ml-1 shrink-0 cursor-help" />
            </TTip>
          )}
          <Settings2 className="w-3 h-3 text-muted-foreground/30 ml-auto opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:text-primary" onClick={(e) => { e.stopPropagation(); onOpenActions?.(); }} />
        </div>
      </TableCell>
    </TableRow>
  );
};

// ── Data Row ─────────────────────────────────────────────────────────

interface RowHealthStatus {
  criticals: number;
  warnings: number;
  infos: number;
  highestSeverity: 'CRITICAL' | 'WARNING' | 'INFO' | 'OK';
}

interface DataRowProps {
  item: FlatRow;
  calculatedValues: CalculatedValues;
  annexes: CostSheetAnnex[];
  suggestions: { label: string; value: string; description?: string }[];
  allSections: CostSheetSection[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onNavigateToAnnex?: (annexId: string) => void;
  rowHealth?: RowHealthStatus;
}

// ── Row Health Indicator (ISA 540 §35: Risk Status per Item) ──

const RowHealthIndicator: React.FC<{ health: RowHealthStatus; rowId: string }> = ({ health, rowId }) => {
  const setActiveCostSection = useUIStore(state => state.setActiveCostSection);
  const setPendingAuditFilter = useUIStore(state => state.setPendingAuditFilter);

  if (health.highestSeverity === 'OK') return null;

  const config = {
    CRITICAL: { icon: ShieldAlert, color: 'text-destructive', bg: 'bg-destructive10', label: 'Con errores críticos' },
    WARNING: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10', label: 'Con advertencias' },
    INFO: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-400/10', label: 'Informativo' },
  }[health.highestSeverity];

  const IconComp = config.icon;
  const totalCount = health.criticals + health.warnings + health.infos;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingAuditFilter({ rowId, severity: health.highestSeverity as 'CRITICAL' | 'WARNING' | 'INFO' });
    setActiveCostSection('audit');
  };

  return (
    <TTip
      term={`Fila ${rowId}: ${config.label}`}
      description={
        health.criticals > 0 ? `${health.criticals} error${health.criticals > 1 ? 'es' : ''} crítico${health.criticals > 1 ? 's' : ''}` + (health.warnings > 0 ? `, ${health.warnings} advertencia${health.warnings > 1 ? 's' : ''}` : '') + (health.infos > 0 ? `, ${health.infos} info` : '') :
        health.warnings > 0 ? `${health.warnings} advertencia${health.warnings > 1 ? 's' : ''}` + (health.infos > 0 ? `, ${health.infos} info` : '') :
        `${health.infos} mensaje${health.infos > 1 ? 's' : ''} informativo${health.infos > 1 ? 's' : ''}`
      }
    >
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          'relative flex items-center justify-center shrink-0 cursor-pointer',
          'w-5 h-5 rounded-full transition-all',
          'hover:scale-125 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
          config.bg
        )}
        aria-label={`Ver auditoría de fila ${rowId}: ${config.label}`}
      >
        <IconComp className={cn('w-3 h-3', config.color)} />
        {totalCount > 1 && (
          <span className={cn(
            'absolute -top-1 -right-1.5 min-w-[10px] h-[10px] rounded-full flex items-center justify-center',
            'text-[7px] font-black leading-none px-0.5 pointer-events-none',
            health.highestSeverity === 'CRITICAL' ? 'bg-destructive text-destructive-foreground' :
            health.highestSeverity === 'WARNING' ? 'bg-amber-500 text-white' :
            'bg-blue-400 text-white'
          )}>
            {totalCount}
          </span>
        )}
      </button>
    </TTip>
  );
};

const DataRow: React.FC<DataRowProps> = memo(({ item, calculatedValues, annexes, suggestions, allSections, isExpanded, onToggleExpand, onNavigateToAnnex, rowHealth }) => {
  const { row, level, numbering, sectionIndex, rowIndexInSection, globalIndex, sectionId } = item;
  const [isEditingTotal, setIsEditingTotal] = useState(false);
  const [isEditingVH, setIsEditingVH] = useState(false);
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [isEditingUM, setIsEditingUM] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(false);

  const updateValue = useCostSheetStore(state => state.updateValue);
  const addMainRow = useCostSheetStore(state => state.addMainRow);
  const removeMainRow = useCostSheetStore(state => state.removeMainRow);
  const reorderMainRow = useCostSheetStore(state => state.reorderMainRow);
  const { setField, saveVH, saveTotal, applySuggested } = useCellEditor();

  const path = item.fullPath;
  const hasChildren = row.children && row.children.length > 0;
  const { isRowPercent, isResult, safeCalculated, criticalErrors, warningErrors, hasEngineWarnings } = getRowDiagnostics(row, calculatedValues?.[row.id] ?? null);

  // Merge row health: combine engine diagnostics with deep validation errors
  const mergedHealth: RowHealthStatus = useMemo(() => {
    const dCrits = criticalErrors.length;
    const dWarns = warningErrors.length;
    // Also count INFO from validationErrors if present
    const allErrors = safeCalculated?.validationErrors ?? [];
    const dInfos = allErrors.filter((e: { type: string }) => e.type === 'INFO').length;
    const rCrits = rowHealth?.criticals ?? 0;
    const rWarns = rowHealth?.warnings ?? 0;
    const rInfos = rowHealth?.infos ?? 0;
    const totalCrits = dCrits + rCrits;
    const totalWarns = dWarns + rWarns;
    const totalInfos = dInfos + rInfos;
    return {
      criticals: totalCrits,
      warnings: totalWarns,
      infos: totalInfos,
      highestSeverity: totalCrits > 0 ? 'CRITICAL' : totalWarns > 0 ? 'WARNING' : totalInfos > 0 ? 'INFO' : 'OK',
    };
  }, [criticalErrors, warningErrors, safeCalculated, rowHealth]); // eslint-disable-line react-hooks/preserve-manual-memoization

  const handleVHSave = (val: string) => { saveVH(path, val); setIsEditingVH(false); };
  const handleTotalSave = (val: string) => { saveTotal(path, row, val); setIsEditingTotal(false); };

  // Detect annex reference in formula (e.g. =AnexoI, =TotalAnexoIII)
  const annexMatch = React.useMemo(() => {
    const raw = (row.totalFormula || row.formula || row.vhFormula || '').replace(/^=\s*/, '').trim();
    const m = raw.match(/^(Total)?[Aa]nexo([IVXLC]+)$/i);
    if (m) return m[2]; // annex ID
    // Also check calculationMethod
    if (row.calculationMethod === 'ANEXO' || row.calculationMethod === 'ANEXO_REF') {
      const ref = row.baseDeCalculoRef || '';
      const rm = ref.match(/^(Total)?[Aa]nexo([IVXLC]+)$/i);
      if (rm) return rm[2];
    }
    return null;
  }, [row.totalFormula, row.formula, row.vhFormula, row.calculationMethod, row.baseDeCalculoRef]);

  const annexRef = annexMatch ? annexes.find(a => a.id === annexMatch) : null;

  return (
    <>
      <TableRow className={cn(
        "h-7 text-[11px] transition-colors group border-b border-border/15",
        "hover:bg-primary/[0.03]",
        isResult && "bg-primary/[0.04] font-semibold",
        !isResult && globalIndex % 2 === 0 && "bg-muted/[0.15]",
        mergedHealth.highestSeverity === 'CRITICAL' && "bg-destructive/[0.03]",
        mergedHealth.highestSeverity === 'WARNING' && !isResult && "bg-amber-500/[0.02]"
      )}>
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
                onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
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
                  setField(path, 'label', e.target.value);
                  setIsEditingLabel(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setField(path, 'label', (e.target as HTMLInputElement).value);
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

            {/* Annex navigation link */}
            {annexRef && onNavigateToAnnex && (
              <TTip term={`Ir al Anexo ${annexRef.id}`} description={`Abrir ${annexRef.title} (${annexRef.id})`}>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onNavigateToAnnex(annexRef.id); }}
                  className="p-0.5 rounded hover:bg-amber-500/10 shrink-0 text-amber-600/70 hover:text-amber-600 transition-colors"
                  aria-label={`Ir al Anexo ${annexRef.id}: ${annexRef.title}`}
                >
                  <ExternalLink className="w-3 h-3" />
                </button>
              </TTip>
            )}

            {/* Row Health Indicator (ISA 540 §35) — inline with label */}
            <RowHealthIndicator health={mergedHealth} rowId={row.id} />

            {/* Actions (hover reveal) */}
            <div className="flex items-center gap-0 opacity-0 group-hover:opacity-100 transition-opacity ml-auto shrink-0">
              <Button variant="ghost" size="icon" type="button" className="h-5 w-5 text-muted-foreground hover:bg-primary/10 hover:text-primary" onClick={() => reorderMainRow(path, 'up')} aria-label={`Subir ${row.label}`}>
                <ChevronUp className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" type="button" className="h-5 w-5 text-muted-foreground hover:bg-primary/10 hover:text-primary" onClick={() => reorderMainRow(path, 'down')} aria-label={`Bajar ${row.label}`}>
                <ChevronDown className="h-3 w-3" />
              </Button>
              <TTip term="Restablecer Fórmula" description="Restaura la fórmula original de la Plantilla Nueva Ficha para esta fila">
                <Button variant="ghost" size="icon" type="button" className="h-5 w-5 text-violet-500 hover:bg-violet-500/10" onClick={() => applySuggested(row.id, path)} aria-label={`Restablecer fórmula de ${row.label}`}>
                  <Wand2 className="h-3 w-3" />
                </Button>
              </TTip>
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
              onBlur={(e) => { setField(path, "um", e.target.value); setIsEditingUM(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") { setField(path, "um", (e.target as HTMLInputElement).value); setIsEditingUM(false); } if (e.key === "Escape") setIsEditingUM(false); }}
            />
          ) : (
            row.um || row.unit || "Pesos"
          )}
        </TableCell>

        {/* Valor Histórico — SUBDUED: reference input value */}
        <TableCell className={cn("px-1.5 py-0 text-right border-r border-border/15 text-muted-foreground", !hasChildren && "cursor-pointer hover:bg-muted/30")} onClick={() => !hasChildren && setIsEditingVH(true)}>
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
                  "h-6 text-right text-[11px] px-1 cursor-pointer flex-1 tabular-nums text-muted-foreground",
                  "bg-transparent border-transparent hover:border-border/50 focus-visible:ring-0",
                  (hasChildren || row.vhFormula) && "bg-muted/20 border-border/30 border-dashed"
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

        {/* Total — PRIMARY COLUMN: calculated result with maximum visual emphasis */}
        <TableCell
          className={cn("px-1.5 py-0 text-right border-r-2 border-primary/30 bg-primary/5 tabular-nums text-[11px] transition-colors", !hasChildren && "cursor-pointer hover:bg-primary/10")}
          onClick={() => !hasChildren && setIsEditingTotal(true)}
        >
          {isEditingTotal ? (
            <FormulaEditor
              initialValue={row.formula || row.totalFormula || String(safeCalculated.total ?? 0)}
              onSave={handleTotalSave}
              onCancel={() => setIsEditingTotal(false)}
              suggestions={suggestions}
            />
          ) : (
            <div className="flex items-center justify-end gap-0.5">
              <span className={cn("font-black", (row.formula || row.totalFormula) && "underline decoration-primary/20 decoration-dotted underline-offset-2")}>
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
  annexes,
  deepValidationErrors = [],
  onNavigateToAnnex
}) => {
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [collapsedRows, setCollapsedRows] = useState<Record<string, boolean>>({});
  const [activeSectionForActions, setActiveSectionForActions] = useState<{ section: CostSheetSection; index: number } | null>(null);
  const [importingSectionIndex, setImportingSectionIndex] = useState<number | null>(null);

  const sectionInputRef = useRef<HTMLInputElement>(null);
  const updateValue = useCostSheetStore(state => state.updateValue);
  const addMainRow = useCostSheetStore(state => state.addMainRow);
  const removeMainSection = useCostSheetStore(state => state.removeMainSection);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    void handleImportSectionExcel(e, index, sections, updateValue);
  };

  const toggleSection = (sectionId: string) => {
    setCollapsedSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  const toggleRow = (rowId: string) => {
    setCollapsedRows(prev => ({ ...prev, [rowId]: !prev[rowId] }));
  };

  // Build flat list
  const flatItems = useMemo(() => buildFlatList(sections), [sections]);

  // Build per-row health map from deepValidationErrors (ISA 540 §35)
  const rowHealthMap = useMemo(() => {
    const map = new Map<string, RowHealthStatus>();
    deepValidationErrors.forEach(err => {
      const key = err.rowId || '_unknown';
      const existing = map.get(key) || { criticals: 0, warnings: 0, infos: 0, highestSeverity: 'OK' as const };
      if (err.type === 'CRITICAL') existing.criticals++;
      else if (err.type === 'WARNING') existing.warnings++;
      else existing.infos++;
      existing.highestSeverity = existing.criticals > 0 ? 'CRITICAL' : existing.warnings > 0 ? 'WARNING' : existing.infos > 0 ? 'INFO' : 'OK';
      map.set(key, existing);
    });
    return map;
  }, [deepValidationErrors]);

  // Filter out collapsed sections and collapsed rows
  const visibleItems = useMemo(() => {
    const result: FlatItem[] = [];
    let skipUntilNextDivider = false;
    // Track which ancestor rows are collapsed
    const collapsedAncestors = new Set<string>();

    for (const item of flatItems) {
      if (item.isSectionHeader) {
        skipUntilNextDivider = !!collapsedSections[item.sectionId];
        collapsedAncestors.clear();
        result.push(item);
        continue;
      }
      if (skipUntilNextDivider) continue;

      // Check if any ancestor is collapsed
      if (item.parentRowId && collapsedAncestors.has(item.parentRowId)) continue;

      result.push(item);

      // If this row has children and is collapsed, add to ancestors set
      const rowItem = item as FlatRow;
      if (rowItem.row?.children?.length && collapsedRows[rowItem.row.id]) {
        collapsedAncestors.add(rowItem.row.id);
      }
    }
    return result;
  }, [flatItems, collapsedSections, collapsedRows]);

  // Formula suggestions
  const suggestions = useFormulaSuggestions(sections, annexes);

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

      {/* Precio de Venta — always visible above table */}
      <div className="sticky top-[48px] z-20 bg-primary/5 backdrop-blur-xl border border-primary/20 rounded-xl px-4 py-2 flex items-center justify-between">
        <span className="font-black text-[10px] uppercase tracking-[0.15em] text-primary">Precio de Venta Sugerido</span>
        <span className="font-black text-base tabular-nums text-primary bg-primary/10 px-3 py-1 rounded-lg border border-primary/20">
          ${formatAccounting(calculatedValues?.['14.1']?.total ?? 0)}
        </span>
      </div>

      {/* Excel-like Table */}
      <div className="border border-border/60 rounded-xl overflow-hidden shadow-sm bg-card">
        <div className="overflow-x-auto excel-scroll">
          <Table className="w-full border-collapse" style={{ borderSpacing: 0 }}>
            {/* Frozen Header */}
            <TableHeader className="sticky top-0 z-20">
              <TableRow className="bg-muted/80 hover:bg-transparent border-b border-border/40 h-7">
                <TableHead className="w-[55px] px-1.5 py-0 text-center text-[8px] font-black tracking-widest text-muted-foreground/50 border-r border-border/20">No.</TableHead>
                <TableHead className="px-2 py-0 text-left text-[8px] font-black tracking-widest text-muted-foreground/50 border-r border-border/20">CONCEPTO</TableHead>
                <TableHead className="w-[65px] px-1.5 py-0 text-center text-[8px] font-black tracking-widest text-muted-foreground/50 border-r border-border/20">
                  <TTip term="Unidad de Medida" description="Unidad en que se expresa el concepto (Pesos, kg, m³, etc.)">
                    <span className="opacity-70">UM</span>
                  </TTip>
                </TableHead>
                <TableHead className="w-[120px] px-1.5 py-0 text-right text-[8px] font-bold tracking-widest text-muted-foreground/50 bg-muted/20 border-r border-border/15">
                  <TTip term="Valor Histórico" description="Costo base unitario de entrada. Clic para editar o usar fórmulas con =">
                    <span className="text-muted-foreground/60">VALOR HISTÓRICO</span>
                  </TTip>
                </TableHead>
                <TableHead className="w-[130px] px-1.5 py-0 text-right text-[8px] font-black tracking-widest text-primary bg-primary/5 border-r-2 border-primary/20">
                  <TTip term="Total" description="Resultado calculado. Clic para editar fórmula con =">
                    <span className="text-primary">TOTAL</span>
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
                      section={sections[item.sectionIndex]}
                      calculatedValues={calculatedValues}
                      onOpenActions={() => setActiveSectionForActions({ section: sections[item.sectionIndex], index: item.sectionIndex })}
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
                    isExpanded={!collapsedRows[item.row.id]}
                    onToggleExpand={() => toggleRow(item.row.id)}
                    onNavigateToAnnex={onNavigateToAnnex}
                    rowHealth={rowHealthMap.get(item.row.id)}
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
            handleImport(e, importingSectionIndex);
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
