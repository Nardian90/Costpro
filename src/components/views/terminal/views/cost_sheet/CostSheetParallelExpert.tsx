'use client';

import React, { useState, useMemo, useCallback, memo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { ChevronRight, CornerDownRight, Star, HelpCircle, EyeOff, AlertTriangle, Sparkles, FunctionSquare } from 'lucide-react';
import { cn, formatAccounting } from '@/lib/utils';
import { isResultRow } from '@/lib/cost-engine/constants';
import { useScenarioStore } from '@/store/scenario-store';
import type {
  CostSheetSection,
  CostSheetRow,
  CostSheetScenario,
  ScenarioId,
  CalculatedRowValue,
  ScenarioConfig
} from '@/types/cost-sheet';

// ── Types ────────────────────────────────────────────────────────────

interface ScenarioCalcResult {
  calculatedValues: Record<string, CalculatedRowValue>;
}

interface CostSheetParallelExpertProps {
  sections: CostSheetSection[];
  scenarios: CostSheetScenario[];
  scenarioConfig?: ScenarioConfig;
  calcV1?: ScenarioCalcResult | null;
  calcV2?: ScenarioCalcResult | null;
  calcV3?: ScenarioCalcResult | null;
  onUpdateRowValue: (scenarioId: ScenarioId, rowId: string, field: string, value: number) => void;
  onScenarioAction: (action: string, scenarioId: ScenarioId) => void;
}

interface ParallelRowProps {
  row: CostSheetRow;
  level: number;
  index: number;
  numbering: string;
  calcs: Record<string, ScenarioCalcResult | null | undefined>;
  activeScenarioIds: ScenarioId[];
  baseId: ScenarioId;
  primaryId: ScenarioId;
  scenarios: CostSheetScenario[];
  onUpdateRowValue: (scenarioId: ScenarioId, rowId: string, field: string, value: number) => void;
}

// ── Technical Tooltip ────────────────────────────────────────────────

const TTip = ({ term, description, children }: { term: string; description: string; children: React.ReactNode }) => (
  <TooltipProvider delayDuration={400}>
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="cursor-help flex items-center gap-0.5 justify-center">{children}</div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs p-3 rounded-2xl border-border bg-popover shadow-xl z-50">
        <p className="font-black uppercase tracking-widest text-[10px] border-b border-border/50 pb-2 mb-2 text-primary">{term}</p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">{description}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

// ── Variance Badge ───────────────────────────────────────────────────

const VarianceBadge = ({ diff, percent }: { diff: number; percent: number }) => {
  if (Math.abs(diff) < 0.01) {
    return <span className="text-[10px] text-muted-foreground/40">—</span>;
  }
  const isPositive = diff > 0;
  return (
    <span className={cn(
      "text-[10px] font-bold tabular-nums",
      isPositive ? "text-red-500" : "text-emerald-500"
    )}>
      {isPositive ? '+' : ''}{diff.toFixed(2)}
      <span className="ml-1 opacity-70">({percent.toFixed(1)}%)</span>
    </span>
  );
};

// ── Parallel Row ─────────────────────────────────────────────────────

const ParallelRow: React.FC<ParallelRowProps> = React.memo(({
  row, level, numbering, calcs, activeScenarioIds, baseId, primaryId, scenarios, onUpdateRowValue
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [editingCell, setEditingCell] = useState<{ scenarioId: ScenarioId; field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const hasChildren = row.children && row.children.length > 0;
  const isRowPercent = row.isPercent ?? row.is_percent;
  const isResult = isResultRow(String(row.id)) || isRowPercent;

  const handleEditStart = (scenarioId: ScenarioId, field: string, currentValue: number) => {
    setEditingCell({ scenarioId, field });
    setEditValue(String(currentValue || 0));
  };

  const handleEditSave = () => {
    if (editingCell) {
      onUpdateRowValue(editingCell.scenarioId, row.id, editingCell.field, parseFloat(editValue) || 0);
      setEditingCell(null);
      setEditValue('');
    }
  };

  const handleEditCancel = () => {
    setEditingCell(null);
    setEditValue('');
  };

  return (
    <>
      <TableRow className={cn(
        "h-auto sm:h-8 text-xs transition-colors group",
        "border-t border-border/30 hover:bg-primary/5",
        isResult && "bg-primary/5 font-bold"
      )}>
        {/* No. */}
        <TableCell className="w-[60px] px-2 py-0.5 text-center text-xs font-black text-muted-foreground/60 tabular-nums border-r border-border/10">
          {numbering}
        </TableCell>

        {/* Concepto */}
        <TableCell
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          className="px-2 py-0.5 font-medium text-foreground border-r border-border/10"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {hasChildren ? (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1 rounded-full hover:bg-primary/10 shrink-0"
                type="button"
                aria-label={isExpanded ? `Contraer ${row.label}` : `Expandir ${row.label}`}
              >
                <ChevronRight className={cn('w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform', isExpanded && 'rotate-90')} />
              </button>
            ) : (
              <CornerDownRight className="w-3.5 h-3.5 sm:w-4 h-4 text-muted-foreground/50 shrink-0 ml-1" />
            )}
            <span className="truncate">{row.label}</span>
            {isRowPercent && <span className="text-[9px] font-bold text-muted-foreground ml-1">%</span>}
          </div>
        </TableCell>

        {/* UM */}
        <TableCell className="px-2 py-0.5 text-center w-[70px] border-r border-border/10 italic text-muted-foreground/80 font-mono text-[10px]">
          {row.um || row.unit || "Pesos"}
        </TableCell>

        {/* Per-Scenario Columns */}
        {activeScenarioIds.map((sid) => {
          const calc = calcs[sid];
          const calculated = calc?.calculatedValues?.[row.id] || {} as CalculatedRowValue;
          const isPrimary = sid === primaryId;
          const isBase = sid === baseId;
          const scenario = scenarios.find(s => s.id === sid);
          const colorClass = scenario?.color === 'blue' ? 'bg-blue-500' : scenario?.color === 'violet' ? 'bg-violet-500' : 'bg-amber-500';

          // Variance vs base
          const baseCalc = calcs[baseId]?.calculatedValues?.[row.id];
          const baseTotal = baseCalc?.total ?? 0;
          const currentTotal = calculated.total ?? 0;
          const diff = currentTotal - baseTotal;
          const pct = baseTotal !== 0 ? (diff / baseTotal) * 100 : 0;

          return (
            <React.Fragment key={sid}>
              {/* Scenario VH */}
              <TableCell
                className={cn(
                  "px-1.5 py-0.5 text-right border-l border-border/20 transition-colors min-w-[110px]",
                  isPrimary && "bg-amber-500/5"
                )}
              >
                <TTip term="Valor Histórico" description={`Costo base de entrada para este concepto en el escenario "${scenario?.label}".`}>
                  {hasChildren ? (
                    <span className={cn(
                      "text-[9px] text-muted-foreground/60 tabular-nums",
                      isResult ? "font-bold" : "font-medium text-muted-foreground"
                    )}>
                      {formatAccounting(calculated.calculatedVH ?? calculated.valorHistorico ?? 0)}
                    </span>
                  ) : (
                    <Input
                      className={cn(
                        "h-7 text-right text-[9px] text-muted-foreground/60 p-1 bg-transparent border-transparent hover:border-border focus:ring-1 focus:ring-primary tabular-nums",
                        editingCell?.scenarioId === sid && editingCell.field === 'valorHistorico' && "border-primary bg-background"
                      )}
                      value={
                        editingCell?.scenarioId === sid && editingCell.field === 'valorHistorico'
                          ? editValue
                          : formatAccounting(calculated.calculatedVH ?? calculated.valorHistorico ?? 0)
                      }
                      onFocus={() => handleEditStart(sid, 'valorHistorico', calculated.calculatedVH ?? calculated.valorHistorico ?? 0)}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={handleEditSave}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleEditSave();
                        if (e.key === 'Escape') handleEditCancel();
                      }}
                      aria-label={`VH de ${row.label} en ${scenario?.label}`}
                    />
                  )}
                </TTip>
              </TableCell>

              {/* Scenario Total */}
              <TableCell
                className={cn(
                  "px-1.5 py-0.5 text-right font-bold tabular-nums text-primary text-sm font-black border-r border-border/10 min-w-[100px]",
                  isPrimary && "bg-amber-500/5"
                )}
              >
                <span className={cn(
                  (row.totalFormula || row.formula) && "underline decoration-primary/30 decoration-dotted underline-offset-2"
                )}>
                  {formatAccounting(currentTotal)}
                </span>
                {(calculated.validationErrors || []).filter(e => e.type === 'CRITICAL').length > 0 && (
                  <AlertTriangle className="w-3 h-3 text-destructive inline ml-1" />
                )}
              </TableCell>

              {/* Delta column (not shown for base) */}
              {!isBase && (
                <TableCell
                  className={cn(
                    "px-1.5 py-0.5 text-right border-r border-border/10 min-w-[120px]",
                    diff < -0.01 ? "bg-primary/5" : diff > 0.01 ? "bg-red-500/5" : ""
                  )}
                >
                  <VarianceBadge diff={diff} percent={pct} />
                </TableCell>
              )}
            </React.Fragment>
          );
        })}
      </TableRow>

      {/* Recursive Children */}
      {hasChildren && isExpanded && (
        row.children!.map((child, childIdx) => (
          <ParallelRow
            key={child.id}
            row={child}
            level={level + 1}
            index={childIdx}
            numbering={`${numbering}.${childIdx + 1}`}
            calcs={calcs}
            activeScenarioIds={activeScenarioIds}
            baseId={baseId}
            primaryId={primaryId}
            scenarios={scenarios}
            onUpdateRowValue={onUpdateRowValue}
          />
        ))
      )}
    </>
  );
});

ParallelRow.displayName = 'ParallelRow';

// ── Filtered Parallel Row (stable component, outside render body) ──

interface FilteredParallelRowProps {
  row: CostSheetRow;
  level: number;
  index: number;
  numbering: string;
  hideNoDiff: boolean;
  rowHasDiff: (id: string) => boolean;
  calcs: Record<string, ScenarioCalcResult | null | undefined>;
  activeScenarioIds: ScenarioId[];
  baseId: ScenarioId;
  primaryId: ScenarioId;
  scenarios: CostSheetScenario[];
  onUpdateRowValue: (scenarioId: ScenarioId, rowId: string, field: string, value: number) => void;
}

const FilteredParallelRow = memo(({ row, level, index, numbering, hideNoDiff, rowHasDiff, ...rest }: FilteredParallelRowProps) => {
  if (hideNoDiff && !rowHasDiff(row.id) && (!row.children || row.children.length === 0)) return null;
  return <ParallelRow row={row} level={level} index={index} numbering={numbering} {...rest} />;
});
FilteredParallelRow.displayName = 'FilteredParallelRow';

// ── Mobile Scenario Cards ────────────────────────────────────────────

const MobileScenarioCards: React.FC<{
  sections: CostSheetSection[];
  scenarios: CostSheetScenario[];
  calcs: Record<string, ScenarioCalcResult | null | undefined>;
  activeScenarioIds: ScenarioId[];
  baseId: ScenarioId;
  primaryId: ScenarioId;
  onUpdateRowValue: (scenarioId: ScenarioId, rowId: string, field: string, value: number) => void;
}> = ({
  sections,
  scenarios,
  calcs,
  activeScenarioIds,
  baseId,
  primaryId,
  onUpdateRowValue
}: {
  sections: CostSheetSection[];
  scenarios: CostSheetScenario[];
  calcs: Record<string, ScenarioCalcResult | null | undefined>;
  activeScenarioIds: ScenarioId[];
  baseId: ScenarioId;
  primaryId: ScenarioId;
  onUpdateRowValue: (scenarioId: ScenarioId, rowId: string, field: string, value: number) => void;
}) => (
  <div className="space-y-6 md:hidden">
    {activeScenarioIds.map((sid) => {
      const s = scenarios.find(x => x.id === sid);
      const calc = calcs[sid];
      const isPrimary = sid === primaryId;
      const isBase = sid === baseId;
      const colorClass = s?.color === 'blue' ? 'bg-blue-500' : s?.color === 'violet' ? 'bg-violet-500' : 'bg-amber-500';

      return (
        <div key={sid} className={cn(
          "rounded-2xl border p-4 space-y-3 shadow-sm",
          isPrimary ? "bg-amber-500/5 border-amber-500/20 ring-1 ring-amber-500/10" : "bg-card"
        )}>
          {/* Scenario Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={cn("w-3 h-3 rounded-full", colorClass)} />
              <span className="text-xs font-black uppercase tracking-widest">{s?.label}</span>
              {isPrimary && <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />}
              {isBase && <Badge variant="secondary" className="text-[9px] h-4 px-1.5">Base</Badge>}
            </div>
          </div>

          {/* Sections */}
          {sections.map((section) => (
            <div key={section.id} className="space-y-1">
              <div className="text-[10px] font-black text-muted-foreground uppercase py-1.5 border-b border-border/50">
                {section.label}
              </div>
              {(section.rows || []).map((row: CostSheetRow) => {
                const calcVal = calc?.calculatedValues?.[row.id];
                const total = calcVal?.total ?? 0;
                const vh = calcVal?.calculatedVH ?? calcVal?.valorHistorico ?? 0;

                // Variance
                const baseCalcVal = calcs[baseId]?.calculatedValues?.[row.id];
                const baseTotal = baseCalcVal?.total ?? 0;
                const diff = total - baseTotal;
                const pct = baseTotal !== 0 ? (diff / baseTotal) * 100 : 0;

                return (
                  <div key={row.id} className="flex justify-between items-center py-1 px-1 rounded-lg hover:bg-muted/30 transition-colors">
                    <span className="text-[11px] text-muted-foreground truncate mr-2">{row.label}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <Input
                        className="h-6 w-16 text-right text-[10px] p-0 bg-transparent border-transparent hover:border-border"
                        defaultValue={vh}
                        onBlur={(e) => onUpdateRowValue(sid, row.id, 'valorHistorico', parseFloat(e.target.value) || 0)}
                        aria-label={`VH de ${row.label}`}
                      />
                      <span className="text-xs font-bold tabular-nums w-20 text-right">{formatAccounting(total)}</span>
                      {!isBase && Math.abs(diff) >= 0.01 && (
                        <span className={cn(
                          "text-[9px] font-bold",
                          diff < -0.01 ? "text-emerald-500" : "text-red-500"
                        )}>
                          {diff > 0 ? '+' : ''}{diff.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      );
    })}
  </div>
);

// ── Main Component ───────────────────────────────────────────────────

export const CostSheetParallelExpert: React.FC<CostSheetParallelExpertProps> = ({
  sections,
  scenarios,
  scenarioConfig,
  calcV1,
  calcV2,
  calcV3,
  onUpdateRowValue,
  onScenarioAction
}) => {
  const { activeScenarioIds, setComparisonBase, createScenario } = useScenarioStore();
  const [hideNoDiff, setHideNoDiff] = useState(false);

  const primaryId = scenarioConfig?.primaryScenarioId || 'v1';
  const baseId = scenarioConfig?.comparisonBaseId || 'v1';
  const calcs: Record<string, ScenarioCalcResult | null | undefined> = { v1: calcV1, v2: calcV2, v3: calcV3 };

  // Count total columns for colSpan
  const totalDataCols = activeScenarioIds.reduce((acc, sid) => {
    return acc + (sid === baseId ? 2 : 3); // VH + Total (+ delta if not base)
  }, 0);

  const rowHasDiff = useCallback((rowId: string): boolean => {
    return activeScenarioIds.some(sid => {
      if (sid === baseId) return false;
      const val = calcs[sid]?.calculatedValues?.[rowId]?.total ?? 0;
      const baseVal = calcs[baseId]?.calculatedValues?.[rowId]?.total ?? 0;
      return Math.abs(val - baseVal) > 0.01;
    });
  }, [activeScenarioIds, baseId, calcs]);

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-muted/30 rounded-2xl border shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <TTip term="Base Delta" description="Escenario de referencia para calcular las diferencias (Δ) y variaciones porcentuales.">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Base:</span>
              <HelpCircle className="w-3 h-3 text-muted-foreground/50" />
            </div>
          </TTip>

          {/* Scenario color indicators */}
          <div className="flex items-center gap-2">
            {activeScenarioIds.map(sid => {
              const s = scenarios.find(x => x.id === sid);
              const colorClass = s?.color === 'blue' ? 'bg-blue-500' : s?.color === 'violet' ? 'bg-violet-500' : 'bg-amber-500';
              const isPrimary = sid === primaryId;
              return (
                <div key={sid} className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                  isPrimary ? "bg-amber-500/10 ring-1 ring-amber-500/20" : "bg-card border"
                )}>
                  <div className={cn("w-2.5 h-2.5 rounded-full", colorClass)} />
                  {s?.label}
                  {isPrimary && <Star className="w-3 h-3 fill-amber-500 text-amber-500" />}
                </div>
              );
            })}
          </div>

          <div className="h-4 w-px bg-border mx-1 hidden sm:block" />

          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[10px] bg-card rounded-xl hover:bg-primary hover:text-primary-foreground transition-all shadow-sm"
            onClick={() => createScenario(primaryId, "Nuevo Escenario")}
            disabled={scenarios.length >= 3}
          >
            + Escenario
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center space-x-1.5 bg-card px-2.5 py-1 rounded-xl border shadow-sm">
            <Switch
              id="parallel-hide-no-diff"
              checked={hideNoDiff}
              onCheckedChange={setHideNoDiff}
              className="data-[state=checked]:bg-primary"
            />
            <Label htmlFor="parallel-hide-no-diff" className="text-[10px] font-black uppercase cursor-pointer select-none">
              Sin cambios
            </Label>
            <EyeOff className="w-3 h-3 text-muted-foreground/50" />
          </div>
        </div>
      </div>

      {/* ── Mobile Cards ────────────────────────────────────────────── */}
      <MobileScenarioCards
        sections={sections}
        scenarios={scenarios}
        calcs={calcs}
        activeScenarioIds={activeScenarioIds}
        baseId={baseId}
        primaryId={primaryId}
        onUpdateRowValue={onUpdateRowValue}
      />

      {/* ── Desktop Parallel Table ──────────────────────────────────── */}
      <div className="hidden md:block space-y-4">
        {/* Legend bar */}
        <div className="flex items-center gap-4 px-4 py-2 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-emerald-500/20 border border-emerald-500/30" />
            <span>Ahorro (Δ &lt; 0)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-red-500/20 border border-red-500/30" />
            <span>Incremento (Δ &gt; 0)</span>
          </div>
          <div className="flex items-center gap-1">
            <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
            <span>Escenario Principal</span>
          </div>
        </div>

        {/* Section Accordions with Parallel Tables */}
        {sections.map((section: CostSheetSection, sectionIndex: number) => {
          const sectionRows = section.rows || [];
          if (sectionRows.length === 0) return null;

          return (
            <div key={section.id} className="border border-border/50 rounded-[2rem] overflow-hidden bg-card shadow-sm">
              {/* Section Header */}
              <div className="flex items-center gap-3 px-5 py-3 bg-muted/40 border-b border-border/30">
                <div className="w-1 h-5 bg-primary/50 rounded-full" />
                <h3 className="text-sm font-black uppercase tracking-[0.15em] text-foreground">
                  {section.label || `Sección ${section.id}`}
                </h3>
                <Badge variant="secondary" className="text-[9px] h-5 px-2 ml-auto">
                  {sectionRows.length} conceptos
                </Badge>
              </div>

              {/* Parallel Table */}
              <div className="overflow-x-auto custom-scrollbar-parallel">
                <Table className="w-full border-collapse min-w-[600px]">
                  <TableHeader className="bg-muted/30">
                    {/* Scenario name row */}
                    <TableRow className="border-b border-border/20">
                      <TableHead colSpan={3} className="text-left text-[10px] font-black tracking-widest text-muted-foreground border-r border-border/30 py-2 px-2">
                        ESTRUCTURA
                      </TableHead>
                      {activeScenarioIds.map(sid => {
                        const s = scenarios.find(x => x.id === sid);
                        const colorClass = s?.color === 'blue' ? 'bg-blue-500' : s?.color === 'violet' ? 'bg-violet-500' : 'bg-amber-500';
                        const isPrimary = sid === primaryId;
                        const isBase = sid === baseId;
                        return (
                          <TableHead
                            key={sid}
                            colSpan={isBase ? 2 : 3}
                            className={cn(
                              "text-center py-2 px-3 border-l border-border/30",
                              isPrimary && "bg-amber-500/5"
                            )}
                          >
                            <div className="flex items-center justify-center gap-2">
                              <div className={cn("w-2.5 h-2.5 rounded-full shadow-sm", colorClass)} />
                              <span className="text-[10px] font-black uppercase tracking-widest">{s?.label}</span>
                              {isPrimary && <Star className="w-3 h-3 fill-amber-500 text-amber-500 animate-pulse" />}
                            </div>
                          </TableHead>
                        );
                      })}
                    </TableRow>

                    {/* Column headers row */}
                    <TableRow className="border-b border-border/30">
                      <TableHead className="w-[60px] px-2 py-1 text-center text-[9px] font-black tracking-widest text-muted-foreground border-r border-border/20">No.</TableHead>
                      <TableHead className="px-2 py-1 text-left text-[9px] font-black tracking-widest text-muted-foreground border-r border-border/20">CONCEPTO</TableHead>
                      <TableHead className="w-[70px] px-2 py-1 text-center text-[9px] font-black tracking-widest text-muted-foreground border-r border-border/20">UM</TableHead>
                      {activeScenarioIds.map(sid => {
                        const isBase = sid === baseId;
                        const isPrimary = sid === primaryId;
                        return (
                          <React.Fragment key={sid}>
                            <TableHead className={cn("px-1.5 py-1 text-right text-[9px] font-black tracking-widest text-muted-foreground border-l border-border/20", isPrimary && "bg-amber-500/5")}>
                              <TTip term="Valor Histórico (VH)" description="Costo base de entrada para este concepto.Editable inline en cada escenario.">
                                <span className="opacity-60">VH</span>
                              </TTip>
                            </TableHead>
                            <TableHead className={cn("px-1.5 py-1 text-right text-[9px] font-black tracking-widest text-muted-foreground border-r border-border/20", isPrimary && "bg-amber-500/5")}>
                              <TTip term="Total Calculado" description="Resultado tras procesar fórmulas, coeficientes y unidades de medida del concepto.">
                                <span className="opacity-60">TOTAL</span>
                              </TTip>
                            </TableHead>
                            {!isBase && (
                              <TableHead className="px-1.5 py-1 text-center text-[9px] font-black tracking-widest text-muted-foreground border-r border-border/20 bg-primary/5">
                                <TTip term="Variación (Δ %)" description="Diferencia absoluta y porcentual respecto al escenario Base. Verde=ahorro, Rojo=incremento.">
                                  <span className="text-primary/70">Δ %</span>
                                </TTip>
                              </TableHead>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {sectionRows.map((row: CostSheetRow, rowIndex: number) => (
                      <FilteredParallelRow
                        key={row.id}
                        row={row}
                        level={0}
                        index={rowIndex}
                        numbering={`${sectionIndex + 1}.${rowIndex + 1}`}
                        hideNoDiff={hideNoDiff}
                        rowHasDiff={rowHasDiff}
                        calcs={calcs}
                        activeScenarioIds={activeScenarioIds}
                        baseId={baseId}
                        primaryId={primaryId}
                        scenarios={scenarios}
                        onUpdateRowValue={onUpdateRowValue}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          );
        })}
      </div>

      {/* Custom scrollbar styles */}
      <style jsx global>{`
        .custom-scrollbar-parallel::-webkit-scrollbar { height: 8px; }
        .custom-scrollbar-parallel::-webkit-scrollbar-track { background: rgba(0,0,0,0.03); border-radius: 10px; }
        .custom-scrollbar-parallel::-webkit-scrollbar-thumb { background: rgba(var(--primary), 0.15); border-radius: 10px; }
        .custom-scrollbar-parallel::-webkit-scrollbar-thumb:hover { background: rgba(var(--primary), 0.3); }
      `}</style>
    </div>
  );
};

export default CostSheetParallelExpert;
