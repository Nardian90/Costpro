'use client';
import React, { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { MoreVertical, Star, Plus, FileDown, Trash2, HelpCircle, EyeOff, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useScenarioStore } from '@/store/scenario-store';
import type { ScenarioId, CostSheetSection, CostSheetRow, CostSheetScenario, ScenarioConfig, CalculatedRowValue } from '@/types/cost-sheet';

interface ScenarioCalcResult {
  calculatedValues: Record<string, CalculatedRowValue>;
}

interface CostSheetComparisonTableProps {
  sections: CostSheetSection[];
  scenarios: CostSheetScenario[];
  scenarioConfig?: ScenarioConfig;
  calcV1?: ScenarioCalcResult;
  calcV2?: ScenarioCalcResult;
  calcV3?: ScenarioCalcResult;
  onUpdateRowValue: (scenarioId: ScenarioId, rowId: string, field: string, value: number) => void;
  onScenarioAction: (action: string, scenarioId: ScenarioId) => void;
}

const TechnicalTooltip = ({ term, description, children }: { term: string, description: string, children: React.ReactNode }) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="cursor-help flex items-center gap-1 justify-center">
          {children}
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs p-3 rounded-2xl border-sidebar-border bg-popover shadow-xl">
        <p className="font-black uppercase tracking-widest text-[10px] border-b border-border/50 pb-2 mb-2 text-primary">{term}</p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">{description}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

export const CostSheetComparisonTable = ({ sections, scenarios, scenarioConfig, calcV1, calcV2, calcV3, onUpdateRowValue, onScenarioAction }: CostSheetComparisonTableProps) => {
  const { activeScenarioIds, setComparisonBase, createScenario, renameScenario } = useScenarioStore();
  const [hideNoDiff, setHideNoDiff] = useState(false);

  const primaryId = scenarioConfig?.primaryScenarioId || 'v1';
  const baseId = scenarioConfig?.comparisonBaseId || 'v1';
  const calcs: Partial<Record<ScenarioId, ScenarioCalcResult>> = { v1: calcV1, v2: calcV2, v3: calcV3 };

  const hasDiff = (rowId: string) => {
    return activeScenarioIds.some(sid => {
      if (sid === baseId) return false;
      const val = calcs[sid]?.calculatedValues?.[rowId]?.total ?? 0;
      const baseVal = calcs[baseId]?.calculatedValues?.[rowId]?.total ?? 0;
      return Math.abs(val - baseVal) > 0.01;
    });
  };

  const renderRow = (row: CostSheetRow, level = 0) => {
    if (hideNoDiff && !hasDiff(row.id) && (!row.children || row.children.length === 0)) return null;

    return (
      <React.Fragment key={row.id}>
        <TableRow id={row.id} className="group hover:bg-muted/50 transition-colors">
          <TableCell className="sticky left-0 bg-card group-hover:bg-muted/50 z-10 w-[60px] text-center font-bold text-[10px] border-r border-border/50">{row.id}</TableCell>
          <TableCell className="sticky left-[60px] bg-card group-hover:bg-muted/50 z-10 min-w-[200px] border-r border-border/50" style={{ paddingLeft: level * 16 + 8 }}>
             <span className="text-xs font-medium tracking-tight">{row.label}</span>
          </TableCell>
          <TableCell className="sticky left-[260px] bg-card group-hover:bg-muted/50 z-10 w-[60px] text-center text-[10px] border-r border-border/50 text-muted-foreground font-bold">{row.um || row.unit || '-'}</TableCell>
          {activeScenarioIds.map(sid => {
            const scenario = scenarios.find((s: CostSheetScenario) => s.id === sid);
            const calculated = calcs[sid]?.calculatedValues?.[row.id] || { total: 0, valorHistorico: 0 };
            const baseTotal = calcs[baseId]?.calculatedValues?.[row.id]?.total ?? 0;
            const diff = calculated.total - baseTotal;
            const isPrimary = sid === primaryId;

            return (
              <React.Fragment key={sid}>
                <TableCell className={cn("text-right p-2 border-l border-border/50 transition-colors", isPrimary && "bg-amber-500/5 group-hover:bg-amber-500/10")}>
                  <Input
                    className="h-7 text-right text-xs p-1 focus:ring-1 focus:ring-primary bg-transparent border-transparent hover:border-border transition-all"
                    defaultValue={scenario?.values[row.id]?.valorHistorico ?? row.valorHistorico ?? 0}
                    onBlur={(e) => onUpdateRowValue(sid, row.id, 'valorHistorico', parseFloat(e.target.value) || 0)}
                  />
                </TableCell>
                <TableCell className={cn("text-right p-2 font-bold text-xs border-r border-border/10", isPrimary && "bg-amber-500/5 group-hover:bg-amber-500/10")}>
                  {calculated.total.toFixed(2)}
                </TableCell>
                {sid !== baseId && (
                  <>
                    <TableCell className={cn("text-right p-2 text-[10px] border-l border-border/10", diff < -0.01 ? "text-emerald-500" : diff > 0.01 ? "text-red-500" : "text-muted-foreground/40")}>
                      {diff > 0.01 ? '+' : ''}{diff.toFixed(2)}
                    </TableCell>
                    <TableCell className={cn("text-right p-2 text-[10px] border-r border-border/10", diff < -0.01 ? "text-emerald-500 font-bold" : diff > 0.01 ? "text-red-500 font-bold" : "text-muted-foreground/40")}>
                      {baseTotal !== 0 ? ((diff/baseTotal)*100).toFixed(1) : 0}%
                    </TableCell>
                  </>
                )}
              </React.Fragment>
            );
          })}
        </TableRow>
        {row.children?.map((c: CostSheetRow) => renderRow(c, level + 1))}
      </React.Fragment>
    );
  };

  const renderMobileScenarioCards = () => (
    <div className="space-y-6 md:hidden">
      {activeScenarioIds.map(sid => {
        const s = scenarios.find((x: CostSheetScenario) => x.id === sid);
        const isPrimary = sid === primaryId;
        const isBase = sid === baseId;
        return (
          <div key={sid} className={cn(
            "rounded-[2rem] border p-6 space-y-4 shadow-sm transition-all",
            isPrimary ? "bg-amber-500/5 border-amber-500/20 ring-1 ring-amber-500/10" : "bg-card"
          )}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn("w-4 h-4 rounded-full",
                    s?.color === 'blue' ? 'bg-blue-500' : s?.color === 'violet' ? 'bg-violet-500' : 'bg-amber-500'
                )}/>
                <Input
                   value={s?.label}
                   onChange={(e) => renameScenario(sid, e.target.value)}
                   className="h-6 bg-transparent border-none p-0 font-black uppercase tracking-widest text-xs focus-visible:ring-0 w-32"
                />
                {isPrimary && <Star className="w-4 h-4 fill-amber-500 text-amber-500"/>}
                {isBase && <Badge variant="secondary" className="text-[9px]">Base Δ</Badge>}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="w-4 h-4"/></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                   <DropdownMenuItem onClick={() => onScenarioAction('setPrimary', sid)} className="text-xs"><Star className="w-3 h-3 mr-2"/>Principal</DropdownMenuItem>
                   <DropdownMenuItem onClick={() => onScenarioAction('duplicate', sid)} className="text-xs"><Plus className="w-3 h-3 mr-2"/>Duplicar</DropdownMenuItem>
                   <DropdownMenuItem onClick={() => onScenarioAction('exportPdf', sid)} className="text-xs"><FileDown className="w-3 h-3 mr-2"/>Exportar</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="space-y-2">
              {sections.map((section: CostSheetSection) => (
                <div key={section.id} className="space-y-1">
                  <div className="text-[10px] font-black text-muted-foreground uppercase py-2 border-b border-border/50">{section.label}</div>
                  {section.rows.map((row: CostSheetRow) => (
                    <div key={row.id} className="flex justify-between items-center py-1">
                      <span className="text-[11px] text-muted-foreground">{row.label}</span>
                      <span className="text-xs font-bold">{(calcs[sid]?.calculatedValues?.[row.id]?.total ?? 0).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-muted/30 rounded-2xl border shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-4">
            <TechnicalTooltip term="Base Delta" description="Escenario de referencia utilizado para calcular las diferencias (Δ) y porcentajes de variación en los otros escenarios.">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Base Delta:</span>
                <HelpCircle className="w-3 h-3 text-muted-foreground/50"/>
            </TechnicalTooltip>

            <Select value={baseId} onValueChange={(v) => setComparisonBase(v as ScenarioId)}>
            <SelectTrigger className="w-40 h-8 text-xs bg-card rounded-xl border-sidebar-border shadow-sm focus:ring-primary"><SelectValue /></SelectTrigger>
            <SelectContent className="rounded-2xl border-sidebar-border shadow-2xl">
                {scenarios.map((s: CostSheetScenario) => (
                <SelectItem key={s.id} value={s.id}>
                    <div className="flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full",
                        s.color === 'blue' ? 'bg-blue-500' : s.color === 'violet' ? 'bg-violet-500' : 'bg-amber-500'
                    )}/>
                    {s.label}
                    </div>
                </SelectItem>
                ))}
            </SelectContent>
            </Select>

            <div className="h-4 w-px bg-border mx-2 hidden sm:block"/>

            <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs bg-card rounded-xl hover:bg-primary hover:text-primary-foreground transition-all duration-300 shadow-sm"
            onClick={() => createScenario(primaryId, "Nuevo Escenario")}
            disabled={scenarios.length >= 3}
            >
            <Plus className="w-3 h-3 mr-2"/>
            Nuevo Escenario
            </Button>
        </div>

        <div className="flex items-center gap-4">
            <div className="flex items-center space-x-2 bg-card px-3 py-1.5 rounded-xl border border-sidebar-border shadow-sm">
                <Switch
                    id="hide-no-diff"
                    checked={hideNoDiff}
                    onCheckedChange={setHideNoDiff}
                    className="data-[state=checked]:bg-primary"
                />
                <Label htmlFor="hide-no-diff" className="text-[10px] font-black uppercase cursor-pointer select-none">Ocultar sin cambios</Label>
                <EyeOff className="w-3 h-3 text-muted-foreground/50" />
            </div>
        </div>
      </div>

      {/* Mobile Card View */}
      {renderMobileScenarioCards()}

      {/* Desktop Table View */}
      <div className="hidden md:block relative border border-border/50 rounded-[2.5rem] overflow-hidden bg-card shadow-2xl overflow-x-auto custom-scrollbar">
        <Table className="w-full border-collapse">
          <TableHeader className="bg-muted/90 backdrop-blur-md sticky top-0 z-30">
            <TableRow className="border-b-2 border-border/20">
              <TableHead colSpan={3} className="sticky left-0 z-40 bg-muted border-r border-border/30"></TableHead>
              {activeScenarioIds.map(sid => {
                const s = scenarios.find((x: CostSheetScenario) => x.id === sid);
                const isBase = sid === baseId;
                const isPrimary = sid === primaryId;
                return (
                  <TableHead key={sid} colSpan={isBase ? 2 : 4} className={cn("text-center border-l border-border/30 p-3", isPrimary && "bg-amber-500/5")}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={cn("w-3 h-3 rounded-full shadow-sm",
                          s?.color === 'blue' ? 'bg-blue-500' : s?.color === 'violet' ? 'bg-violet-500' : 'bg-amber-500'
                        )}/>
                        <Input
                          value={s?.label}
                          onChange={(e) => renameScenario(sid, e.target.value)}
                          className="h-6 bg-transparent border-none p-0 font-black uppercase tracking-widest text-[11px] focus-visible:ring-0 w-32 inline-block"
                        />
                        {isPrimary && <Star className="w-3 h-3 fill-amber-500 text-amber-500 animate-pulse"/>}
                        {isBase && <Badge variant="secondary" className="text-[9px] h-4 px-1 rounded-full uppercase tracking-tighter bg-primary/10 text-primary border-none">Base Δ</Badge>}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full hover:bg-muted-foreground/10 transition-colors"><MoreVertical className="w-3.5 h-3.5"/></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 rounded-2xl p-2 border-sidebar-border shadow-2xl">
                          <DropdownMenuItem onClick={() => onScenarioAction('setPrimary', sid)} className="text-[11px] font-bold rounded-xl px-3 py-2">
                            <Star className="w-4 h-4 mr-3 text-amber-500"/> Establecer como Principal
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onScenarioAction('duplicate', sid)} className="text-[11px] font-bold rounded-xl px-3 py-2">
                            <LayoutGrid className="w-4 h-4 mr-3 text-primary"/> Duplicar Escenario
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onScenarioAction('exportPdf', sid)} className="text-[11px] font-bold rounded-xl px-3 py-2">
                            <FileDown className="w-4 h-4 mr-3 text-emerald-500"/> Exportar este escenario (PDF)
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="my-2 opacity-50" />
                          <DropdownMenuItem
                            className="text-destructive text-[11px] font-bold rounded-xl px-3 py-2 focus:bg-destructive/10"
                            onClick={() => onScenarioAction('delete', sid)}
                            disabled={isPrimary || activeScenarioIds.length <= 1}
                          >
                            <Trash2 className="w-4 h-4 mr-3"/> Eliminar de la comparativa
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableHead>
                );
              })}
            </TableRow>
            <TableRow className="bg-muted/40 backdrop-blur-sm">
              <TableHead className="sticky left-0 bg-muted z-40 w-[60px] text-center text-[10px] font-black border-r border-border/30 tracking-tighter">ID</TableHead>
              <TableHead className="sticky left-[60px] bg-muted z-40 min-w-[200px] text-[10px] font-black border-r border-border/30 tracking-widest">CONCEPTO</TableHead>
              <TableHead className="sticky left-[260px] bg-muted z-40 w-[60px] text-center text-[10px] font-black border-r border-border/30">UM</TableHead>
              {activeScenarioIds.map(sid => (
                <React.Fragment key={sid}>
                  <TableHead className={cn("text-center border-l border-border/20 bg-muted/20 p-2", sid === primaryId && "bg-amber-500/5")}>
                    <TechnicalTooltip term="Valor Histórico (VH)" description="Costo unitario o valor base de entrada para esta fila. Es el dato crudo antes de aplicar fórmulas de costo total.">
                      <span className="text-[9px] font-black tracking-widest opacity-60">VH</span>
                    </TechnicalTooltip>
                  </TableHead>
                  <TableHead className={cn("text-center bg-muted/20 p-2", sid === primaryId && "bg-amber-500/5")}>
                    <TechnicalTooltip term="Total Calculado" description="Resultado final tras procesar la fórmula, unidad de medida y coeficientes técnicos asociados a este concepto.">
                      <span className="text-[9px] font-black tracking-widest opacity-60">TOTAL</span>
                    </TechnicalTooltip>
                  </TableHead>
                  {sid !== baseId && (
                    <>
                      <TableHead className="text-center border-l border-border/10 bg-emerald-500/5 p-2">
                        <TechnicalTooltip term="Diferencia (Δ)" description="Valor absoluto de la variación respecto al Escenario Base. El color verde indica ahorro y el rojo incremento de costo.">
                          <span className="text-[9px] font-black tracking-widest text-emerald-600/70">Δ</span>
                        </TechnicalTooltip>
                      </TableHead>
                      <TableHead className="text-center bg-emerald-500/5 p-2">
                        <TechnicalTooltip term="Variación (%)" description="Porcentaje relativo de aumento o disminución comparado con el valor de referencia de la Base Delta.">
                          <span className="text-[9px] font-black tracking-widest text-emerald-600/70">%</span>
                        </TechnicalTooltip>
                      </TableHead>
                    </>
                  )}
                </React.Fragment>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sections.map((s: CostSheetSection) => (
              <React.Fragment key={s.id}>
                <TableRow className="bg-muted/40 backdrop-blur-sm border-y border-border/20 hover:bg-muted/60 transition-colors">
                  <TableCell colSpan={20} className="font-black text-[10px] uppercase text-primary/80 py-1.5 px-6 tracking-widest">
                    {s.label}
                  </TableCell>
                </TableRow>
                {s.rows.map((r: CostSheetRow) => renderRow(r))}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          height: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(0,0,0,0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(var(--primary), 0.2);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(var(--primary), 0.4);
        }
      `}</style>
    </div>
  );
};
