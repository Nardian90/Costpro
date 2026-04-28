'use client';
import React, { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MoreVertical, Star, Plus, FileDown, Trash2, Edit3, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useScenarioStore } from '@/store/scenario-store';

export const CostSheetComparisonTable = ({ sections, scenarios, scenarioConfig, calcV1, calcV2, calcV3, onUpdateRowValue, onScenarioAction }: any) => {
  const { activeScenarioIds, setComparisonBase, createScenario } = useScenarioStore();
  const primaryId = scenarioConfig?.primaryScenarioId || 'v1';
  const baseId = scenarioConfig?.comparisonBaseId || 'v1';
  const calcs: any = { v1: calcV1, v2: calcV2, v3: calcV3 };

  const renderRow = (row: any, sIdx: number, rIdx: number, level = 0) => {
    return (
      <React.Fragment key={row.id}>
        <TableRow>
          <TableCell className="sticky left-0 bg-card z-10 w-[60px] text-center font-bold text-[10px]">{row.id}</TableCell>
          <TableCell className="sticky left-[60px] bg-card z-10 min-w-[200px]" style={{ paddingLeft: level * 16 + 8 }}>{row.label}</TableCell>
          <TableCell className="sticky left-[260px] bg-card z-10 w-[60px] text-center text-[10px]">{row.um || row.unit || '-'}</TableCell>
          {activeScenarioIds.map(sid => {
            const scenario = scenarios.find((s: any) => s.id === sid);
            const calculated = calcs[sid]?.calculatedValues?.[row.id] || { total: 0, valorHistorico: 0 };
            const baseTotal = calcs[baseId]?.calculatedValues?.[row.id]?.total ?? 0;
            const diff = calculated.total - baseTotal;
            return (
              <React.Fragment key={sid}>
                <TableCell className={cn("text-right p-2", sid === primaryId && "bg-primary/5")}>
                  <Input
                    className="h-7 text-right text-xs p-1"
                    defaultValue={scenario?.values[row.id]?.valorHistorico ?? row.valorHistorico ?? 0}
                    onBlur={(e) => onUpdateRowValue(sid, row.id, 'valorHistorico', parseFloat(e.target.value))}
                  />
                </TableCell>
                <TableCell className="text-right p-2 font-bold text-xs">{calculated.total.toFixed(2)}</TableCell>
                {sid !== baseId && (
                  <>
                    <TableCell className={cn("text-right p-2 text-[10px]", diff < -0.01 ? "text-emerald-500" : diff > 0.01 ? "text-red-500" : "")}>{diff.toFixed(2)}</TableCell>
                    <TableCell className={cn("text-right p-2 text-[10px]", diff < -0.01 ? "text-emerald-500" : diff > 0.01 ? "text-red-500" : "")}>{baseTotal !== 0 ? ((diff/baseTotal)*100).toFixed(1) : 0}%</TableCell>
                  </>
                )}
              </React.Fragment>
            );
          })}
        </TableRow>
        {row.children?.map((c: any, i: number) => renderRow(c, sIdx, i, level + 1))}
      </React.Fragment>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-2xl border">
        <span className="text-xs font-bold uppercase">Base Delta:</span>
        <Select value={baseId} onValueChange={(v) => setComparisonBase(v as any)}>
          <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{scenarios.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => createScenario(primaryId, "Nuevo Escenario")} disabled={scenarios.length >= 3}><Plus className="w-3 h-3 mr-2"/>Escenario</Button>
      </div>
      <div className="relative border rounded-2xl overflow-hidden bg-card shadow-xl overflow-x-auto">
        <Table className="w-full border-collapse">
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead colSpan={3} className="sticky left-0 z-20 bg-muted/50"></TableHead>
              {activeScenarioIds.map(sid => {
                const s = scenarios.find((x: any) => x.id === sid);
                return (
                  <TableHead key={sid} colSpan={sid === baseId ? 2 : 4} className="text-center border-l p-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{s?.label}</Badge>
                        {sid === primaryId && <Star className="w-3 h-3 fill-amber-500 text-amber-500"/>}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6"><MoreVertical className="w-3 h-3"/></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onScenarioAction('setPrimary', sid)}><Star className="w-4 h-4 mr-2"/>Principal</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onScenarioAction('duplicate', sid)}><Plus className="w-4 h-4 mr-2"/>Duplicar</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onScenarioAction('exportPdf', sid)}><FileDown className="w-4 h-4 mr-2"/>PDF</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => onScenarioAction('delete', sid)} disabled={sid === primaryId}><Trash2 className="w-4 h-4 mr-2"/>Eliminar</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sections.map((s: any, i: number) => (
              <React.Fragment key={s.id}>
                <TableRow className="bg-muted/20"><TableCell colSpan={20} className="font-bold text-[10px] uppercase text-primary py-1">{s.label}</TableCell></TableRow>
                {s.rows.map((r: any, j: number) => renderRow(r, i, j))}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
