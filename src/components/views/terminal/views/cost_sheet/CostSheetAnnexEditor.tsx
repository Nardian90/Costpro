'use client';

import React from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { useCostSheetCalculator } from '@/hooks/logic/useCostSheetCalculator';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Trash2, Plus, Database, FunctionSquare, ChevronUp, ChevronDown, RefreshCw, Download, Upload, Target, ArrowLeft } from 'lucide-react';
import { solveCoefficient } from '@/lib/cost-engine/solver';
import { CostSheetAnnex, CostSheetColumn, CostSheetData } from '@/types/cost-sheet';
import ProductInventoryPicker from './ProductInventoryPicker';
import { useAuthStore } from '@/store';
import { exportAnnexToExcel, importAnnexFromExcel } from '@/services/excel-service';
import { cn, formatCurrency } from '@/lib/utils';
import { ViewMode } from '@/components/ui/ViewSwitcher';

interface CostSheetAnnexEditorProps {
  activeAnnexId: string;
  layoutMode?: ViewMode;
  calculatedAnnexes?: CostSheetAnnex[];
  hideBorder?: boolean;
  onNavigateToSection?: (rowId: string) => void;
  referencingSections?: { sectionLabel: string; sectionId: string; rowId: string; rowLabel: string }[];
}

const CostSheetAnnexEditor: React.FC<CostSheetAnnexEditorProps> = React.memo(({
  activeAnnexId,
  layoutMode = 'table',
  calculatedAnnexes = [],
  hideBorder = false,
  onNavigateToSection,
  referencingSections = []
}) => {
  const data = useCostSheetStore(state => state.data);
  const updateValue = useCostSheetStore(state => state.updateValue);
  const addRow = useCostSheetStore(state => state.addRow);
  const removeRow = useCostSheetStore(state => state.removeRow);
  const reorderRow = useCostSheetStore(state => state.reorderRow);
  const setSheet = useCostSheetStore(state => state.setSheet);
  const updateAnnexAdjustment = useCostSheetStore(state => state.updateAnnexAdjustment);
  const { user } = useAuthStore();

  const annexIndex = data.annexes.findIndex((a: CostSheetAnnex) => a.id === activeAnnexId);
  const annex = data.annexes[annexIndex] as CostSheetAnnex;
  const [targetPrice, setTargetPrice] = React.useState('');
  const [isSolving, setIsSolving] = React.useState(false);

  // Only Annexes I and II allow coefficient adjustment
  const isCoefficientAnnex = annex?.id === 'I' || annex?.id === 'II';
  const showTargetPriceInput = isCoefficientAnnex;

  const handleSolve = () => {
    const target = parseFloat(targetPrice);
    if (isNaN(target) || target <= 0) return;

    setIsSolving(true);
    setTimeout(() => {
      try {
        const defaultAdjCol = annex.id === 'I' ? 'PRECIO UNITARIO' : annex.id === 'II' ? 'HORAS MENSUALES' : 'PRECIO UNITARIO';
        const bestCoef = solveCoefficient(data, annex.id, target);
        const finalCoef = parseFloat(bestCoef.toFixed(6));
        updateAnnexAdjustment(annex.id, finalCoef, annex.adjustmentColumn || defaultAdjCol, true);
        setLocalCoef(String(finalCoef));
      } catch (err) {
        console.error("Solver error:", err);
      } finally {
        setIsSolving(false);
      }
    }, 100);
  };


  const calculatedAnnex = calculatedAnnexes.find((a: CostSheetAnnex) => a.id === activeAnnexId);
  const totalValue = calculatedAnnex ? calculatedAnnex.data.reduce((sum: number, row: Record<string, string | number | boolean | undefined>) => {
    const val = [row.total, row.amount, row.depreciation_cost, row.price_total, row.importe].find(v => v !== undefined && v !== null);
    return sum + (parseFloat(String(val ?? 0)) || 0);
  }, 0) : 0;

  const [isPickerOpen, setIsPickerOpen] = React.useState(false);
  const [localCoef, setLocalCoef] = React.useState(String(annex?.coefficient !== undefined ? annex.coefficient : 1));
  React.useEffect(() => {
    setLocalCoef(String(annex?.coefficient !== undefined ? annex.coefficient : 1));
  }, [annex?.coefficient]);
  const [targetRowIndex, setTargetRowIndex] = React.useState<number | null>(null);
  const [importTarget, setImportTarget] = React.useState<{file: File, annexIndex: number} | null>(null);

  if (!annex) return null;

  // Map adjustment column labels to their column keys for matching
  const ADJ_COL_KEYS: Record<string, string[]> = {
    'PRECIO UNITARIO': ['price', 'price_unit', 'rate'],
    'NORMA DE CONSUMO': ['consumption_norm', 'norm', 'consumption', 'quantity', 'qty'],
    'HORAS MENSUALES': ['time_norm'],
    'TARIFA $/H': ['hourly_rate'],
    'CANT. OBREROS': ['worker_count'],
    'VALOR': ['value'],
    'IMPORTE': ['importe'],
  };

  const isColAdjusted = (colKey: string, adjCol?: string): boolean => {
    if (!adjCol) return false;
    if (adjCol === 'AMBOS') {
      const bothKeys = [...(ADJ_COL_KEYS['PRECIO UNITARIO'] || []), ...(ADJ_COL_KEYS['NORMA DE CONSUMO'] || [])];
      return bothKeys.includes(colKey);
    }
    return (ADJ_COL_KEYS[adjCol] || []).includes(colKey);
  };

  const handleInputChange = (path: (string | number)[], value: string | number) => {
    // If it is '0' or '0.' it should be treated as string to allow typing decimals
    if (value === '0' || value === '0.') {
        updateValue(path, Number(value));
        return;
    }
    const finalValue = !isNaN(Number(value)) && value !== '' ? Number(value) : value;
    updateValue(path, finalValue);
  };

  const handleProductSelect = (product: { name: string; unit?: string; price?: number }) => {
    if (targetRowIndex !== null && annexIndex !== -1) {
      updateValue(['annexes', annexIndex, 'data', targetRowIndex, 'description'], product.name);
      updateValue(['annexes', annexIndex, 'data', targetRowIndex, 'um'], product.unit || 'u');
      updateValue(['annexes', annexIndex, 'data', targetRowIndex, 'price'], product.price || 0);
      setIsPickerOpen(false);
    }
  };

  const classificationSuggestions = [
    { id: '1.1', label: 'Insumos / Materiales' },
    { id: '1.2', label: 'Combustible' },
    { id: '1.3', label: 'Energía' },
    { id: '2.1', label: 'Salarios Directos' },
    { id: '3.1', label: 'Amortización' },
    { id: '3.2', label: 'Otros Gastos Directos' }
  ];

  const handleExport = () => {
    exportAnnexToExcel(annex);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportTarget({ file, annexIndex });
    }
    // Reset input so the same file can be re-imported
    e.target.value = '';
  };

  const confirmImport = async () => {
    if (!importTarget) return;
    const { file, annexIndex: idx } = importTarget;
    try {
      const updatedAnnex = (await importAnnexFromExcel(file, data.annexes[idx])) as unknown as CostSheetAnnex;
      const newData = { ...data } as CostSheetData;
      newData.annexes[idx] = updatedAnnex;
      setSheet(newData);
    } catch (err) {
      console.error("Import error:", err);
    } finally {
      setImportTarget(null);
    }
  };

  return (
    <div className="space-y-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
       {/* Compact Toolbar Row — inline with table style */}
       <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 bg-muted/30 border-b border-border/20">
          <div className="relative group">
             <input
               type="file"
               id={`import-${annex.id}-top`}
               className="hidden"
               onChange={handleImport}
               accept=".xlsx, .xls"
               aria-label={`Importar archivo Excel para anexo ${annex.title}`}
             />
             <Button
               variant="ghost"
               size="sm"
               asChild
               className="h-6 px-2 text-[9px] font-bold uppercase tracking-wider text-muted-foreground hover:text-primary hover:bg-primary/5 gap-1"
             >
               <label htmlFor={`import-${annex.id}-top`} className="cursor-pointer flex items-center">
                 <Upload className="w-3 h-3" />
                 Importar
               </label>
             </Button>
          </div>
          <Button
             variant="ghost"
             size="sm"
             onClick={handleExport}
             className="h-6 px-2 text-[9px] font-bold uppercase tracking-wider text-muted-foreground hover:text-primary hover:bg-primary/5 gap-1"
          >
             <Download className="w-3 h-3" />
             Exportar
          </Button>
          <Button
             variant="ghost"
             size="sm"
             onClick={() => addRow(annex.id)}
             className="h-6 px-2.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground hover:text-primary hover:bg-primary/5 gap-1"
          >
             <Plus className="w-3 h-3" />
             Agregar fila
          </Button>

          {/* Coefficient adjustment — compact inline */}
          {isCoefficientAnnex && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-[8px] font-bold uppercase tracking-wider text-primary/50">Coef:</span>
              <input
                  type="text"
                  value={localCoef}
                  aria-label="Coeficiente"
                  onChange={(e) => {
                      const val = e.target.value;
                      setLocalCoef(val);
                      if (val === '' || val === '-' || val.endsWith('.')) return;
                      if (val === '0' || val === '0.' || val === '0.0') {
                          updateAnnexAdjustment(annex.id, 0, annex.adjustmentColumn || (annex.id === 'I' ? 'PRECIO UNITARIO' : 'HORAS MENSUALES'), annex.isAdjustmentActive);
                          return;
                      }
                      const numericVal = parseFloat(val);
                      if (!isNaN(numericVal)) {
                          updateAnnexAdjustment(annex.id, numericVal, annex.adjustmentColumn || (annex.id === 'I' ? 'PRECIO UNITARIO' : 'HORAS MENSUALES'), annex.isAdjustmentActive);
                      }
                  }}
                  onBlur={() => {
                      if (localCoef === '' || isNaN(parseFloat(localCoef))) {
                          setLocalCoef('1');
                          updateAnnexAdjustment(annex.id, 1, annex.adjustmentColumn || (annex.id === 'I' ? 'PRECIO UNITARIO' : 'HORAS MENSUALES'), annex.isAdjustmentActive);
                      }
                  }}
                  className="w-16 h-6 px-1 bg-background border border-primary/20 text-[10px] font-black font-mono text-primary focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all text-center rounded"
              />
              <Select
                  value={annex.adjustmentColumn || (annex.id === 'I' ? 'PRECIO UNITARIO' : 'HORAS MENSUALES')}
                  onValueChange={(val) => updateAnnexAdjustment(annex.id, annex.coefficient !== undefined ? annex.coefficient : 1, val, annex.isAdjustmentActive)}
              >
                  <SelectTrigger className="h-6 min-w-[110px] bg-background border-primary/20 rounded text-[8px] font-bold uppercase hover:border-primary/40 transition-colors">
                      <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded border-primary/20">
                      {annex.id === 'I' ? (
                        <>
                          <SelectItem value="NORMA DE CONSUMO" className="text-[9px] font-bold uppercase">Norma Consumo</SelectItem>
                          <SelectItem value="PRECIO UNITARIO" className="text-[9px] font-bold uppercase">Precio Unit.</SelectItem>
                          <SelectItem value="AMBOS" className="text-[9px] font-bold uppercase">Ambos</SelectItem>
                        </>
                      ) : annex.id === 'II' ? (
                        <>
                          <SelectItem value="HORAS MENSUALES" className="text-[9px] font-bold uppercase">Horas Mens.</SelectItem>
                          <SelectItem value="TARIFA $/H" className="text-[9px] font-bold uppercase">Tarifa $/h</SelectItem>
                          <SelectItem value="CANT. OBREROS" className="text-[9px] font-bold uppercase">Cant. Obreros</SelectItem>
                        </>
                      ) : null}
                  </SelectContent>
              </Select>
              <div className="flex items-center gap-1.5 bg-background/50 px-2 py-0.5 rounded border border-primary/10">
                  <span className="text-[8px] font-bold uppercase tracking-wider text-primary/70">Auto</span>
                  <Switch
                      checked={!!annex.isAdjustmentActive}
                      onCheckedChange={(checked) => updateAnnexAdjustment(annex.id, annex.coefficient !== undefined ? annex.coefficient : 1, annex.adjustmentColumn || (annex.id === 'I' ? 'PRECIO UNITARIO' : 'HORAS MENSUALES'), checked)}
                      className="scale-75"
                  />
              </div>

              {showTargetPriceInput && (
                <>
                  <span className="text-[8px] font-bold uppercase tracking-wider text-primary/50 ml-2">Target:</span>
                  <input
                      disabled={isSolving}
                      type="number"
                      value={targetPrice}
                      onChange={(e) => setTargetPrice(e.target.value)}
                      placeholder="25"
                      aria-label="Precio de venta objetivo"
                      className="w-20 h-6 px-1 rounded bg-background border border-primary/40 text-[10px] font-black font-mono text-primary focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all text-center placeholder:text-primary/20"
                  />
                  <Button
                      size="sm"
                      onClick={handleSolve}
                      disabled={isSolving || !targetPrice}
                      className="h-6 px-2 rounded text-[8px] font-bold uppercase tracking-wider bg-primary text-foreground hover:bg-primary/90 active:scale-95 transition-all gap-1"
                  >
                      {isSolving ? (
                        <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                      ) : (
                        <Target className="w-2.5 h-2.5" />
                      )}
                      Calcular
                  </Button>
                </>
              )}
            </div>
          )}
       </div>

       <ProductInventoryPicker
         open={isPickerOpen}
         onOpenChange={setIsPickerOpen}
         onSelect={handleProductSelect}
       />

       {/* Referencing sections — back-links */}
       {referencingSections.length > 0 && onNavigateToSection && (
         <div className="flex items-center gap-2 px-2 py-1 bg-amber-500/5 border-b border-border/20">
            <ArrowLeft className="w-3 h-3 text-amber-600/70 shrink-0" />
            <span className="text-[8px] font-black uppercase tracking-widest text-amber-600/70">Usado en:</span>
            {referencingSections.map((ref, idx) => (
              <button
                key={`${ref.sectionId}-${ref.rowId}-${idx}`}
                type="button"
                onClick={() => onNavigateToSection(ref.rowId)}
                className="text-[9px] font-bold text-amber-600 hover:text-amber-700 hover:bg-amber-500/10 px-1.5 py-0.5 rounded transition-colors truncate max-w-[200px]"
                title={`${ref.sectionLabel} → ${ref.rowLabel}`}
              >
                {ref.sectionLabel}: {ref.rowLabel}
              </button>
            ))}
         </div>
       )}

       <div className={cn(
         "border border-border/60 rounded-xl overflow-hidden shadow-sm bg-card",
         layoutMode === 'grid' && "border-none bg-transparent shadow-none"
       )}>
         <div className="overflow-x-auto no-scrollbar">
            <Table className={cn(layoutMode === 'grid' && "hidden sm:table")}>
                <TableHeader className="sticky top-0 z-20">
                    <TableRow className="bg-muted/80 hover:bg-transparent border-b border-border/40 h-7">
                        <TableHead className="w-[32px] px-1 py-0 text-center text-[8px] font-black tracking-widest text-muted-foreground/50 border-r border-border/20">
                          #
                        </TableHead>
                        {annex.columns.map((col: CostSheetColumn) => {
                            // Intelligent column widths based on column key/label
                            const colKey = col.key.toLowerCase();
                            const colLabel = (col.label || col.title || '').toLowerCase();
                            let colClass = 'px-1.5 py-0 text-left text-[8px] font-black tracking-widest text-muted-foreground/50 border-r border-border/20';
                            
                            if (col.key === 'no') {
                              colClass = 'w-[56px] px-1.5 py-0 text-center text-[8px] font-black tracking-widest text-muted-foreground/50 border-r border-border/20';
                            } else if (colKey.includes('price') || colKey.includes('total') || colKey.includes('amount') || colKey.includes('importe') || colKey.includes('depreciation') || colKey.includes('valor') || colLabel.includes('total') || colLabel.includes('importe')) {
                              colClass = 'w-[120px] px-2 py-0 text-right text-[8px] font-black tracking-widest text-muted-foreground/50 border-r border-border/20';
                            } else if (colKey.includes('norm') || colKey.includes('consumption') || colKey.includes('quantity') || colKey.includes('cant') || colKey.includes('time') || colKey.includes('horas') || colKey.includes('days') || colKey.includes('días') || colKey.includes('explot')) {
                              colClass = 'w-[90px] px-2 py-0 text-center text-[8px] font-black tracking-widest text-muted-foreground/50 border-r border-border/20';
                            } else if (colKey.includes('um') || colKey === 'um') {
                              colClass = 'w-[50px] px-1.5 py-0 text-center text-[8px] font-black tracking-widest text-muted-foreground/50 border-r border-border/20';
                            } else if (colKey.includes('code') || colKey.includes('código') || colKey.includes('clasif')) {
                              colClass = 'w-[80px] px-2 py-0 text-center text-[8px] font-black tracking-widest text-muted-foreground/50 border-r border-border/20';
                            } else if (colKey.includes('description') || colKey.includes('descripción') || colKey.includes('nombre') || colKey.includes('puesto') || colKey.includes('worker')) {
                              colClass = 'px-2 py-0 text-left text-[8px] font-black tracking-widest text-muted-foreground/50 border-r border-border/20 min-w-[180px]';
                            }
                            
                            return (
                            <TableHead key={col.key} className={colClass}>
                                {col.label || col.title}
                            </TableHead>
                            );
                        })}
                        <TableHead className="px-1 py-0 text-center text-[8px] font-black tracking-widest text-muted-foreground/50 w-[48px]">
                        </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {annex.data.map((row: Record<string, string | number | boolean | undefined>, rowIndex: number) => {
                        const isZero = (colKey: string) => Number(row[colKey]) === 0;
                        return (
                        <TableRow key={rowIndex} className={cn(
                          'h-7 text-[11px] transition-colors group border-b border-border/15',
                          'hover:bg-primary/[0.03]',
                          rowIndex % 2 === 0 && 'bg-muted/[0.15]'
                        )}>
                            {/* Row number column */}
                            <TableCell className="w-[56px] px-1.5 py-0 text-center text-[10px] font-mono text-muted-foreground/40 tabular-nums border-r border-border/15">
                              {rowIndex + 1}
                            </TableCell>
                            {annex.columns.map((col: CostSheetColumn) => {
                                const isMain = col.key === 'description' || col.label?.toLowerCase().includes('descripción') || col.label?.toLowerCase().includes('puesto');
                                return (
                                <TableCell key={col.key} data-label={col.label || col.title || col.key} className="px-2 py-0">
                                    {col.formula ? (
                                        <div className="flex items-center justify-end gap-1">
                                            <span className={cn(
                                              'font-mono text-right tabular-nums',
                                              isZero(col.key) ? 'text-muted-foreground/60 font-medium' : 'text-primary font-black'
                                            )}>
                                                {formatCurrency((calculatedAnnex?.data[rowIndex]?.[col.key] ?? 0)).replace('$', '').trim()}
                                            </span>
                                            <FunctionSquare className="w-2 h-2 text-primary/30 shrink-0" />
                                        </div>
                                    ) : (
                                        <div className="relative group/cell">
                                            <Input
                                                type={typeof (annex.data[rowIndex][col.key]) === 'number' ? 'number' : 'text'}
                                                value={(() => {
                                                    const val = annex.data[rowIndex][col.key];
                                                    const coef = annex.coefficient !== undefined ? annex.coefficient : 1;
                                                    const isActive = !!annex.isAdjustmentActive;
                                                    if (!isActive || coef === 1 || typeof val !== "number") return val ?? "";

                                                    if (annex.adjustmentColumn === "AMBOS") {
                                                        if (isColAdjusted(col.key, "AMBOS")) return String((val * Math.sqrt(coef)).toFixed(4));
                                                    } else {
                                                        if (isColAdjusted(col.key, annex.adjustmentColumn)) return String((val * coef).toFixed(4));
                                                    }
                                                    return val ?? "";
                                                })()}
                                                onChange={(e) => {
                                                    let val: string | number = e.target.value;
                                                    const coef = annex.coefficient !== undefined ? annex.coefficient : 1;
                                                    const isActive = !!annex.isAdjustmentActive;

                                                    if (isActive && coef !== 1 && coef !== 0 && !isNaN(parseFloat(val))) {
                                                        const numericVal = parseFloat(val);
                                                        if (annex.adjustmentColumn === "AMBOS") {
                                                            if (isColAdjusted(col.key, "AMBOS")) val = numericVal / Math.sqrt(coef);
                                                        } else {
                                                            if (isColAdjusted(col.key, annex.adjustmentColumn)) val = numericVal / coef;
                                                        }
                                                    }
                                                    handleInputChange(['annexes', annexIndex, 'data', rowIndex, col.key], val);
                                                }}
                                                list={(() => {
                                                    const isDescriptionColumn = col.key === 'description' || col.label === 'DESCRIPCIÓN DEL PUESTO';
                                                    if (activeAnnexId === 'I' && col.key === 'description') return undefined;
                                                    if (activeAnnexId === 'II' && isDescriptionColumn) return undefined;
                                                    if (['IV', 'V'].includes(activeAnnexId) && isDescriptionColumn) return undefined;
                                                    if (col.key === 'classification' || col.key === 'description') return `classification-suggestions-${activeAnnexId}`;
                                                    return undefined;
                                                })()}
                                                className={cn(
                                                  'h-6 text-[11px] px-1.5 py-0 bg-transparent border border-transparent hover:border-border/30 focus:border-primary/40 focus:outline-none rounded transition-colors font-medium',
                                                  typeof annex.data[rowIndex][col.key] === 'string' && annex.data[rowIndex][col.key] !== '' && 'text-primary',
                                                  typeof row[col.key] === "number" && isZero(col.key) && 'text-muted-foreground/60 font-medium'
                                                )}
                                                placeholder={(() => {
                                                    const val = annex.data[rowIndex][col.key];
                                                    const coef = annex.coefficient !== undefined ? annex.coefficient : 1;
                                                    if (coef === 1 || typeof val !== "number") return "";

                                                    if (annex.adjustmentColumn === "AMBOS") {
                                                        if (isColAdjusted(col.key, "AMBOS")) {
                                                            return String((val * Math.sqrt(coef)).toFixed(4));
                                                        }
                                                    } else {
                                                        if (isColAdjusted(col.key, annex.adjustmentColumn)) return String((val * coef).toFixed(4));
                                                    }
                                                    return "";
                                                })()} />
                                            {typeof annex.data[rowIndex][col.key] === 'string' && annex.data[rowIndex][col.key] !== '' && (
                                                <FunctionSquare className="absolute top-0.5 right-0.5 w-2 h-2 text-primary/40" />
                                            )}
                                        </div>
                                    )}
                                </TableCell>
                                );
                            })}
                            <TableCell className="text-center px-0.5 py-0 w-[60px] whitespace-nowrap">
                                <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => reorderRow(annex.id, rowIndex, 'up')}
                                        className="h-5 w-5 text-muted-foreground hover:text-primary transition-all p-0"
                                        title="Subir"
                                    >
                                        <ChevronUp className="h-3 w-3" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => reorderRow(annex.id, rowIndex, 'down')}
                                        className="h-5 w-5 text-muted-foreground hover:text-primary transition-all p-0"
                                        title="Bajar"
                                    >
                                        <ChevronDown className="h-3 w-3" />
                                    </Button>
                                    {annex.id === 'I' && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => {
                                                setTargetRowIndex(rowIndex);
                                                setIsPickerOpen(true);
                                            }}
                                            className="h-5 w-5 text-primary hover:bg-primary/10 transition-all p-0"
                                            aria-label="Importar desde inventario"
                                        >
                                            <Database className="h-3 w-3" />
                                        </Button>
                                    )}
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removeRow(annex.id, rowIndex)}
                                        className="h-5 w-5 text-danger hover:bg-danger/10 transition-all p-0"
                                        aria-label="Eliminar fila"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    );})}
                </TableBody>
                <TableFooter>
                  <TableRow className="bg-primary/5 hover:bg-primary/5 border-t-2 border-primary/20 h-7">
                    <TableCell colSpan={annex.columns.length + 1} className="px-1.5 py-0">
                      <div className="flex justify-end items-center gap-3">
                        <span className="text-[9px] text-primary/70 uppercase font-black tracking-[0.15em]">Total {annex.id}</span>
                        <span className="text-[11px] font-black font-mono text-primary tabular-nums">
                            {formatCurrency(totalValue)}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                </TableFooter>
            </Table>
         </div>
       </div>

       {/* Global suggestions for classification column */}
       <datalist id={`classification-suggestions-${activeAnnexId}`}>
          {classificationSuggestions.map(s => (
              <option key={s.id} value={`${s.id} - ${s.label}`} aria-label={s.label} />
          ))}
       </datalist>

       {/* Import Confirmation Dialog */}
       <AlertDialog open={!!importTarget} onOpenChange={(open) => !open && setImportTarget(null)}>
         <AlertDialogContent>
           <AlertDialogHeader>
             <AlertDialogTitle>¿Importar anexo desde Excel?</AlertDialogTitle>
             <AlertDialogDescription>
               Esta acción reemplazará todos los datos del anexo "{annex?.title}" con los datos del archivo seleccionado. Los datos actuales se perderán. ¿Desea continuar?
             </AlertDialogDescription>
           </AlertDialogHeader>
           <AlertDialogFooter>
             <AlertDialogCancel>Cancelar</AlertDialogCancel>
             <AlertDialogAction onClick={confirmImport} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
               Sí, importar
             </AlertDialogAction>
           </AlertDialogFooter>
         </AlertDialogContent>
       </AlertDialog>

       {/* Annex Total for Grid Mode (Mobile Cards) */}
       {layoutMode === 'grid' && (
         <div className="flex justify-end mt-4 sm:hidden">
            <div className="neu-card !p-5 border-primary/20 bg-primary/5 shadow-xl min-w-[240px] w-full">
                <span className="text-xs text-primary/70 uppercase font-black tracking-[0.2em] block mb-2 text-right">Total {annex.id}</span>
                <div className="flex items-center justify-end gap-2">
                    <span className="text-3xl font-black font-mono text-primary drop-shadow-sm">
                        {formatCurrency(totalValue)}
                    </span>
                    {annex.coefficient && annex.coefficient !== 1 && (
                        <div className="px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-1.5 print:hidden">
                            <RefreshCw className="w-2.5 h-2.5 text-amber-500" />
                            <span className="text-[10px] font-black font-mono text-amber-500">x{annex.coefficient.toFixed(4)}</span>
                        </div>
                    )}
                </div>
            </div>
         </div>
       )}
    </div>
  );
});

CostSheetAnnexEditor.displayName = 'CostSheetAnnexEditor';

export default CostSheetAnnexEditor;
