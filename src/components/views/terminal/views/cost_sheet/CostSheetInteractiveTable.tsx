'use client';
import { LazyRender } from '@/components/ui/LazyRender';
import { motion, AnimatePresence } from "framer-motion";
import React, { useState, useMemo, memo, useRef } from 'react';
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

type CalculatedValues = Record<string, CalculatedRowValue>;

interface CostSheetInteractiveTableProps {
  sections: CostSheetSection[];
  groupedSections?: { id: string, label: string, sectionIds: string[] }[];
  calculatedValues: CalculatedValues;
  annexes: CostSheetAnnex[];
  activeSubSectionId: string;
  setActiveSubSectionId: (id: string) => void;
  onOpenSections?: () => void;
  hideHeader?: boolean;
}

interface RowProps {
  row: RowData;
  level: number;
  index: number;
  numbering: string;
  calculated: CalculatedRowValue;
  calculatedValues: CalculatedValues;
  path: (string | number)[];
  annexes: CostSheetAnnex[];
  suggestions: { label: string; value: string; description?: string }[];
}

const CostSheetRow: React.FC<RowProps> = memo(({ row, level, index, numbering, calculated, calculatedValues, path, annexes, suggestions }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isEditingTotal, setIsEditingTotal] = useState(false);
  const [isEditingVH, setIsEditingVH] = useState(false);
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [isEditingUM, setIsEditingUM] = useState(false);
  const updateValue = useCostSheetStore(state => state.updateValue);
  const addMainRow = useCostSheetStore(state => state.addMainRow);
  const removeMainRow = useCostSheetStore(state => state.removeMainRow);

  const handleToggle = () => setIsExpanded(!isExpanded);

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
    if (val.startsWith("=")) {
        handleValueChange("formula", val);
        handleValueChange("totalFormula", val);
    } else {
        handleValueChange("formula", null);
        handleValueChange("totalFormula", null);
        handleValueChange("calculationMethod", "FIJO");
        handleValueChange("valorHistorico", parseFloat(val) || 0);
        handleValueChange("total", parseFloat(val) || 0);
    }
    setIsEditingTotal(false);
  };

  const hasChildren = row.children && row.children.length > 0;
  const isRowPercent = row.isPercent ?? row.is_percent;
  const isResult = isResultRow(String(row.id)) || isRowPercent;
  const safeCalculated = calculated || { total: 0, valorHistorico: 0, baseTotal: 0, coeficiente: 0, hasWarnings: false, audits: [], validationErrors: [], fuente: '', metadata: {} };
  const criticalErrors = (safeCalculated.validationErrors || []).filter((e: any) => e.type === 'CRITICAL');
  const warningErrors = (safeCalculated.validationErrors || []).filter((e: any) => e.type === 'WARNING');
  const hasEngineWarnings = safeCalculated.hasWarnings || (!hasChildren && !isRowPercent && safeCalculated.total === 0 && ((row.valorHistorico ?? 0) > 0 || !!row.baseDeCalculoRef));

  return (
    <>
      <TableRow className={cn(
        "h-auto sm:h-8 text-xs",
        "border-t border-border/30 hover:bg-primary/5 transition-colors group",
        isResult && "bg-primary/5 font-bold"
      )}>
        <TableCell data-label="No." className="w-[60px] px-2 py-0.5 text-center text-xs font-black text-muted-foreground/60 tabular-nums border-r border-border/10">
            {numbering}
        </TableCell>

        <TableCell data-label="Concepto" style={{ paddingLeft: `${level * 16 + 8}px` }} className="px-2 py-0.5 font-medium text-foreground border-r border-border/10">
          <div className="flex items-center gap-1.5 min-w-0 group/row">
            {hasChildren && (
              <button onClick={handleToggle} className="p-1 rounded-full hover:bg-primary/10 shrink-0" type="button">
                <ChevronRight className={cn('w-3.5 h-3.5 sm:w-4 h-4 transition-transform', isExpanded && 'rotate-90')} aria-hidden="true" />
              </button>
            )}
            {!hasChildren && <CornerDownRight className="w-3.5 h-3.5 sm:w-4 h-4 text-muted-foreground shrink-0 ml-1" aria-hidden="true" />}

            {isEditingLabel ? (
                <Input
                    autoFocus
                    className="h-7 text-xs sm:text-sm py-0"
                    defaultValue={row.label}
                    onBlur={(e) => { handleValueChange('label', e.target.value); setIsEditingLabel(false); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { handleValueChange('label', (e.target as HTMLInputElement).value); setIsEditingLabel(false); } if (e.key === 'Escape') setIsEditingLabel(false); }}
                />
            ) : (
                <span role="button" tabIndex={0} className="truncate flex-1 cursor-text" onClick={() => setIsEditingLabel(true)}>
                    {row.label}
                </span>
            )}
          </div>
        </TableCell>

        <TableCell data-label="UM" className="w-[80px] px-2 py-0.5 text-center border-r border-border/10">
          <button className="w-full text-center hover:bg-muted/50 rounded transition-colors" onClick={() => setIsEditingUM(true)}>
            {row.um || row.unit || '-'}
          </button>
        </TableCell>

        <TableCell data-label="Valor Histórico" className="w-[140px] px-2 py-0.5 text-right font-medium tabular-nums border-r border-border/10">
          <div className="flex items-center justify-end gap-1">
              <button className="hover:bg-muted/50 px-1 rounded transition-colors" onClick={() => setIsEditingVH(true)}>
                {formatAccounting(row.valorHistorico ?? row.value ?? 0)}
              </button>
          </div>
        </TableCell>

        <TableCell data-label="Total" className={cn(
            "w-[120px] px-2 py-0.5 text-right font-black tabular-nums border-r border-border/10",
            safeCalculated.total < 0 ? "text-destructive" : "text-primary"
        )}>
          <button className="hover:bg-primary/5 px-1 rounded transition-colors" onClick={() => setIsEditingTotal(true)}>
            {formatAccounting(safeCalculated.total)}
          </button>
        </TableCell>

        <TableCell className="w-[100px] px-2 py-0.5 text-center hidden sm:table-cell">
           <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => addMainRow([...path.slice(0, -1)])}>
                    <Plus className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeMainRow(path)}>
                    <Trash2 className="h-3 w-3" />
                </Button>
           </div>
        </TableCell>
      </TableRow>

      {isEditingVH && (
          <FormulaEditor
              isOpen={isEditingVH}
              onClose={() => setIsEditingVH(false)}
              initialValue={String(row.vhFormula || row.valorHistorico || row.value || '')}
              onSave={handleVHSave}
              title={`Valor Histórico: ${row.label}`}
              suggestions={suggestions}
          />
      )}

      {isEditingTotal && (
          <FormulaEditor
              isOpen={isEditingTotal}
              onClose={() => setIsEditingTotal(false)}
              initialValue={String(row.totalFormula || row.formula || safeCalculated.total || '')}
              onSave={handleTotalSave}
              title={`Cálculo Total: ${row.label}`}
              suggestions={suggestions}
          />
      )}

      {isExpanded && row.children && row.children.map((child, childIdx) => (
        <CostSheetRow
          key={child.id}
          row={child}
          level={level + 1}
          index={childIdx}
          numbering={`${numbering}.${childIdx + 1}`}
          calculated={calculatedValues[child.id]}
          calculatedValues={calculatedValues}
          path={[...path, 'children', childIdx]}
          annexes={annexes}
          suggestions={suggestions}
        />
      ))}
    </>
  );
});

CostSheetRow.displayName = 'CostSheetRow';

const CostSheetInteractiveTable: React.FC<CostSheetInteractiveTableProps> = memo(({
  sections,
  groupedSections,
  calculatedValues,
  annexes,
  activeSubSectionId,
  setActiveSubSectionId,
  hideHeader = false
}) => {
  const updateValue = useCostSheetStore(state => state.updateValue);
  const sectionInputRef = useRef<HTMLInputElement>(null);
  const [importingSectionIndex, setImportingSectionIndex] = useState<number | null>(null);
  const [activeSectionForActions, setActiveSectionForActions] = useState<{ section: CostSheetSection, index: number } | null>(null);

  const suggestions = useMemo(() => {
      const s = [{ label: 'Valor Histórico', value: 'VH', description: 'Usa el valor histórico ingresado' }];
      annexes.forEach(a => {
          s.push({ label: `Total ${a.title}`, value: `TotalAnexo${a.id}`, description: `Suma total del ${a.title}` });
      });
      return s;
  }, [annexes]);

  return (
    <div data-testid="cost-sheet-interactive-table" className="space-y-6">
        <input type="file" ref={sectionInputRef} className="hidden" accept=".xlsx,.xls" onChange={(e) => {
            if (importingSectionIndex !== null && e.target.files?.[0]) {
                // handleImport
            }
        }} />

        {sections.map((section, sectionIndex) => {
            const isTarget = activeSubSectionId === 'all' || activeSubSectionId === section.id;
            if (!isTarget) return null;

            return (
                <div key={section.id} className="mb-8 last:mb-0">
                    {!hideHeader && (
                        <div className="flex items-center justify-between py-1 px-4 bg-primary/5 border-y border-border/20 border-l-2 border-primary/20">
                            <div className="flex items-center gap-3">
                                <h3 className="text-xs font-black uppercase tracking-widest">{section.label}</h3>
                            </div>
                            <Button size="sm" variant="ghost" onClick={() => setActiveSectionForActions({ section, index: sectionIndex })}>
                                <Settings2 className="w-4 h-4" />
                            </Button>
                        </div>
                    )}

                    <div className="overflow-x-auto">
                        <Table className="w-full border-collapse">
                            <TableHeader className="bg-muted/50">
                                <TableRow className="h-8">
                                    <TableHead className="w-[60px] text-center">No.</TableHead>
                                    <TableHead>Concepto</TableHead>
                                    <TableHead className="w-[80px] text-center">UM</TableHead>
                                    <TableHead className="w-[140px] text-right">Valor Histórico</TableHead>
                                    <TableHead className="w-[120px] text-right">Total</TableHead>
                                    <TableHead className="w-[100px] text-center hidden sm:table-cell">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {section.rows.map((row, rowIndex) => (
                                    <CostSheetRow
                                        key={row.id}
                                        row={row}
                                        level={0}
                                        index={rowIndex}
                                        numbering={`${sectionIndex + 1}.${rowIndex + 1}`}
                                        calculated={calculatedValues[row.id]}
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
            );
        })}
    </div>
  );
});

CostSheetInteractiveTable.displayName = 'CostSheetInteractiveTable';
export default CostSheetInteractiveTable;
