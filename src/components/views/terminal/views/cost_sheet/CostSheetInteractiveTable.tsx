
'use client';

import React, { useState, useMemo } from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { ChevronRight, HelpCircle, CornerDownRight, Settings2, Calculator, Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn, formatCurrency } from '@/lib/utils';
import {
  CostSheetRow as RowData,
  CostSheetSection,
  CostSheetAnnex,
  CalculatedRowValue
} from '@/types/cost-sheet';

type CalculatedValues = Record<string, CalculatedRowValue>;

interface CostSheetInteractiveTableProps {
  sections: CostSheetSection[];
  calculatedValues: CalculatedValues;
  annexes: CostSheetAnnex[];
}

interface RowProps {
  row: RowData;
  level: number;
  calculatedValues: CalculatedValues;
  path: (string | number)[];
  annexes: CostSheetAnnex[];
  allRows: RowData[];
  onOpenConfig: (row: RowData, path: (string | number)[]) => void;
}

const CostSheetRow: React.FC<RowProps> = ({ row, level, calculatedValues, path, annexes, allRows, onOpenConfig }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const { updateValue } = useCostSheetStore();
  const hasChildren = row.children && row.children.length > 0;
  const calculated = calculatedValues[row.id] || { total: 0, valorHistorico: 0, baseTotal: 0, coeficiente: 0 };

  const handleToggle = () => {
    if (hasChildren) {
      setIsExpanded(!isExpanded);
    }
  };

  const handleValueChange = (field: string, value: any) => {
    const isNumericField = field === 'valorHistorico' || field === 'value';
    const numericValue = isNumericField ? parseFloat(value) || 0 : value;
    updateValue([...path, field], numericValue);
  };

  return (
    <>
      <TableRow className="border-t border-border/50 hover:bg-primary/5 transition-colors group">
        <TableCell style={{ paddingLeft: `${level * 24 + 12}px` }} className="py-2.5 font-bold text-foreground sticky-column-1">
          <div className="flex items-center gap-2 min-w-0">
            {hasChildren && (
              <button onClick={handleToggle} className="p-1 rounded-full hover:bg-primary/10 shrink-0">
                <ChevronRight className={cn('w-4 h-4 transition-transform', isExpanded && 'rotate-90')} />
              </button>
            )}
            {!hasChildren && <CornerDownRight className="w-4 h-4 text-muted-foreground shrink-0 ml-1" />}
            <span className="truncate flex-1">{row.label}</span>
          </div>
        </TableCell>

        <TableCell className="px-4 py-2 text-right">
          <Input
            type="number"
            step="0.01"
            className="neu-input text-right h-9 font-mono font-bold bg-transparent border-none focus-visible:ring-primary"
            value={row.valorHistorico ?? row.value ?? 0}
            onChange={(e) => handleValueChange(row.hasOwnProperty('valorHistorico') ? 'valorHistorico' : 'value', e.target.value)}
            onFocus={(e) => e.target.select()}
          />
        </TableCell>

        <TableCell className="px-4 py-2">
            <Badge variant="outline" className="rounded-md font-black text-[9px] uppercase tracking-tighter bg-background/50 border-muted">
                {row.calculationMethod || (row.formula ? 'FÓRMULA' : 'VALOR FIJO')}
            </Badge>
        </TableCell>

        <TableCell className="px-4 py-2 text-xs text-muted-foreground font-mono">
           {row.baseDeCalculoRef ? (
               <div className="flex items-center gap-1">
                   <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                   {row.baseDeCalculoRef}
               </div>
           ) : '-'}
        </TableCell>

        <TableCell className="px-4 py-2 text-right tabular-nums font-mono text-muted-foreground">
          {calculated.coeficiente > 0 ? calculated.coeficiente.toFixed(4) : '-'}
        </TableCell>

        <TableCell className="px-4 py-2 text-right font-black tabular-nums text-primary text-lg">
          {formatCurrency(calculated.total)}
        </TableCell>

        <TableCell className="px-4 py-2 text-center">
            <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl hover:bg-primary/10" onClick={() => onOpenConfig(row, path)}>
                    <Settings2 className="w-4 h-4" />
                </Button>
                {calculated.audit && (
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl hover:bg-primary/10">
                                <Info className="w-4 h-4" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-0 rounded-2xl border-none shadow-2xl bg-slate-900 text-white overflow-hidden">
                            <div className="p-4 border-b border-white/10 flex items-center gap-2">
                                <Calculator className="w-4 h-4 text-primary" />
                                <span className="font-black text-[10px] uppercase tracking-widest">Trazabilidad Algorítmica</span>
                            </div>
                            <div className="max-h-60 overflow-y-auto p-4 space-y-3">
                                {calculated.audit.map((a: any, i: number) => (
                                    <div key={i} className="text-[10px] border-l-2 border-primary/40 pl-3">
                                        <div className="text-primary font-bold">{a.note}</div>
                                        <div className="font-mono text-slate-400 mt-1">{a.prev} → {a.now}</div>
                                    </div>
                                ))}
                                <div className="text-[9px] text-slate-500 italic mt-2">Fuente: {calculated.fuente}</div>
                            </div>
                        </PopoverContent>
                    </Popover>
                )}
            </div>
        </TableCell>
      </TableRow>

      {isExpanded && hasChildren && row.children?.map((child, index) => (
        <CostSheetRow
          key={child.id}
          row={child}
          level={level + 1}
          calculatedValues={calculatedValues}
          path={[...path, 'children', index]}
          annexes={annexes}
          allRows={allRows}
          onOpenConfig={onOpenConfig}
        />
      ))}
    </>
  );
};

const CostSheetInteractiveTable: React.FC<CostSheetInteractiveTableProps> = ({ sections, calculatedValues, annexes }) => {
  const [configTarget, setConfigTarget] = useState<{ row: RowData, path: (string | number)[] } | null>(null);
  const { updateValue } = useCostSheetStore();

  const flattenRows = (rows: RowData[]): RowData[] => {
    let all: RowData[] = [];
    for (const row of rows) {
      all.push(row);
      if (row.children && row.children.length > 0) {
        all = [...all, ...flattenRows(row.children)];
      }
    }
    return all;
  };

  const allRows = useMemo(() => flattenRows(sections.flatMap(s => s.rows)), [sections]);

  const baseOptions = useMemo(() => [
    ...annexes.map(a => ({ value: a.id, label: `Anexo ${a.id}: ${a.title}` })),
    ...allRows.map(r => ({ value: r.classification || r.id, label: `Fila ${r.classification || r.id}: ${r.label}` }))
  ], [annexes, allRows]);

  return (
    <div className="space-y-6">
        <div className="neu-card p-0 overflow-hidden rounded-3xl border-none shadow-xl">
            <Table className="min-w-[1000px]">
            <TableHeader className="bg-muted/30 border-b border-border/50">
                <TableRow className="border-none">
                <TableHead className="px-6 py-5 text-left font-black uppercase tracking-widest text-[10px] text-muted-foreground sticky-column-1">Concepto</TableHead>
                <TableHead className="px-4 py-5 text-right font-black uppercase tracking-widest text-[10px] text-muted-foreground w-36">V. Histórico</TableHead>
                <TableHead className="px-4 py-5 text-left font-black uppercase tracking-widest text-[10px] text-muted-foreground w-40">Método</TableHead>
                <TableHead className="px-4 py-5 text-left font-black uppercase tracking-widest text-[10px] text-muted-foreground w-56">Base</TableHead>
                <TableHead className="px-4 py-5 text-right font-black uppercase tracking-widest text-[10px] text-muted-foreground w-32">Coef.</TableHead>
                <TableHead className="px-4 py-5 text-right font-black uppercase tracking-widest text-[10px] text-muted-foreground w-44">Total</TableHead>
                <TableHead className="px-6 py-5 text-center font-black uppercase tracking-widest text-[10px] text-muted-foreground w-24">Acciones</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {sections.map((section, sectionIndex) => (
                <React.Fragment key={section.id}>
                    <TableRow className="bg-muted/50 border-none">
                    <TableCell colSpan={7} className="px-6 py-3 font-black text-primary uppercase tracking-[0.2em] text-[10px]">
                        {section.label}
                    </TableCell>
                    </TableRow>
                    {section.rows.map((row: RowData, rowIndex: number) => (
                    <CostSheetRow
                        key={row.id}
                        row={row}
                        level={0}
                        calculatedValues={calculatedValues}
                        path={['sections', sectionIndex, 'rows', rowIndex]}
                        annexes={annexes}
                        allRows={allRows}
                        onOpenConfig={(r, p) => setConfigTarget({ row: r, path: p })}
                    />
                    ))}
                </React.Fragment>
                ))}
            </TableBody>
            </Table>
        </div>

        <Dialog open={!!configTarget} onOpenChange={(open) => !open && setConfigTarget(null)}>
            <DialogContent className="sm:max-w-[500px] rounded-3xl border-none shadow-2xl">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-black uppercase tracking-tight">Configuración Avanzada</DialogTitle>
                </DialogHeader>

                {configTarget && (
                    <div className="grid gap-6 py-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground">Forma de Cálculo</Label>
                            <Select
                                value={configTarget.row.calculationMethod || 'ValorFijo'}
                                onValueChange={(val) => updateValue([...configTarget.path, 'calculationMethod'], val)}
                            >
                                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ValorFijo">Valor Fijo / Manual</SelectItem>
                                    <SelectItem value="Prorrateo">Prorrateo / Coeficiente</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground">Referencia de Base</Label>
                            <Select
                                value={configTarget.row.baseDeCalculoRef || ''}
                                onValueChange={(val) => updateValue([...configTarget.path, 'baseDeCalculoRef'], val)}
                            >
                                <SelectTrigger className="rounded-xl truncate"><SelectValue placeholder="Seleccionar Base..." /></SelectTrigger>
                                <SelectContent className="max-w-[400px]">
                                    <SelectItem value="NONE">Sin Base</SelectItem>
                                    {baseOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground">Fórmula Personalizada (Opcional)</Label>
                            <Input
                                placeholder="VH * 1.1"
                                className="font-mono text-xs rounded-xl"
                                value={configTarget.row.formula || ''}
                                onChange={(e) => updateValue([...configTarget.path, 'formula'], e.target.value)}
                            />
                        </div>

                        <div className="flex items-center space-x-2 p-4 bg-muted/50 rounded-2xl">
                            <input
                                type="checkbox"
                                id="is_percent"
                                className="w-4 h-4 rounded border-primary"
                                checked={configTarget.row.is_percent || false}
                                onChange={(e) => updateValue([...configTarget.path, 'is_percent'], e.target.checked)}
                            />
                            <Label htmlFor="is_percent" className="text-xs font-bold">Usar como porcentaje (multiplica base por valor/100)</Label>
                        </div>
                    </div>
                )}

                <DialogFooter>
                    <Button className="w-full rounded-2xl py-6 font-black uppercase tracking-widest" onClick={() => setConfigTarget(null)}>
                        Guardar Cambios
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
  );
};

export default CostSheetInteractiveTable;
