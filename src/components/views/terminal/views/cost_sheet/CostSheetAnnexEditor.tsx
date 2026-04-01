'use client';

import React from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { useCostSheetCalculator } from '@/hooks/logic/useCostSheetCalculator';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Trash2, Plus, Database, FunctionSquare, ChevronUp, ChevronDown, RefreshCw, Download, Upload, Target } from 'lucide-react';
import { CostSheetAnnex, CostSheetColumn } from '@/types/cost-sheet';
import ProductInventoryPicker from './ProductInventoryPicker';
import { useAuthStore } from '@/store';
import { exportAnnexToExcel, importAnnexFromExcel } from '@/services/excel-service';
import { cn, formatCurrency } from '@/lib/utils';
import { ViewMode } from '@/components/ui/ViewSwitcher';
import { solveCoefficient } from '@/lib/cost-engine/solver';

interface CostSheetAnnexEditorProps {
  activeAnnexId: string;
  layoutMode?: ViewMode;
  calculatedAnnexes?: any[];
}

const CostSheetAnnexEditor: React.FC<CostSheetAnnexEditorProps> = React.memo(({
  activeAnnexId,
  layoutMode = 'table',
  calculatedAnnexes = []
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

  const calculatedAnnex = calculatedAnnexes.find((a: any) => a.id === activeAnnexId);
  const totalValue = calculatedAnnex ? calculatedAnnex.data.reduce((sum: number, row: any) => {
    const val = [row.total, row.amount, row.depreciation_cost, row.price_total, row.importe].find(v => v !== undefined && v !== null);
    return sum + (parseFloat(String(val ?? 0)) || 0);
  }, 0) : 0;

  const [isPickerOpen, setIsPickerOpen] = React.useState(false);
  const [localCoef, setLocalCoef] = React.useState(String(annex?.coefficient !== undefined ? annex.coefficient : 1));
  const [targetPrice, setTargetPrice] = React.useState('');
  const [isSolving, setIsSolving] = React.useState(false);

  React.useEffect(() => {
    setLocalCoef(String(annex?.coefficient !== undefined ? annex.coefficient : 1));
  }, [annex?.coefficient]);
  const [targetRowIndex, setTargetRowIndex] = React.useState<number | null>(null);

  if (!annex) return null;

  const handleInputChange = (path: (string | number)[], value: any) => {
    if (value === '0' || value === '0.') {
        updateValue(path, !isNaN(Number(value)) && value !== '' ? Number(value) : value);
        return;
    }
    const finalValue = !isNaN(Number(value)) && value !== '' ? Number(value) : value;
    updateValue(path, finalValue);
  };

  const handleProductSelect = (product: any) => {
    if (targetRowIndex !== null && annexIndex !== -1) {
      updateValue(['annexes', annexIndex, 'data', targetRowIndex, 'description'], product.name);
      updateValue(['annexes', annexIndex, 'data', targetRowIndex, 'um'], product.unit || 'u');
      updateValue(['annexes', annexIndex, 'data', targetRowIndex, 'price'], product.price || 0);
      setIsPickerOpen(false);
    }
  };

  const handleSolve = () => {
    const target = parseFloat(targetPrice);
    if (isNaN(target) || target <= 0) return;

    setIsSolving(true);
    // Use a small timeout to let the UI update and then run the solver
    setTimeout(() => {
      try {
        const bestCoef = solveCoefficient(data, annex.id, target);
        updateAnnexAdjustment(annex.id, bestCoef, annex.adjustmentColumn || 'PRECIO UNITARIO', true);
      } finally {
        setIsSolving(false);
      }
    }, 100);
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
      const updatedAnnex = await importAnnexFromExcel(file, annex);
      const newData = { ...data } as any;
      newData.annexes[annexIndex] = updatedAnnex;
      setSheet(newData);
    }
  };

  const showTargetPriceInput = annex.id === 'I' || annex.id === 'II';

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
       <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-card/50 p-6 rounded-[2.5rem] border border-border/50 shadow-xl backdrop-blur-md">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
                <div className="h-4 w-1 bg-primary rounded-full" />
                <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-primary/70">Editor de Anexo</h2>
            </div>
            <h3 className="text-xl font-black text-foreground uppercase tracking-tighter italic">
                {annex.id}: {annex.title}
            </h3>

            <div className="flex flex-wrap items-center gap-4 mt-2 p-3 rounded-2xl bg-primary/5 border border-primary/10 animate-in fade-in slide-in-from-left-4 duration-500">
                <div className="flex flex-col">
                    <span className="text-[8px] font-black uppercase tracking-widest text-primary/50 mb-1">Columna a Ajustar</span>
                    <Select
                        value={annex.adjustmentColumn || 'PRECIO UNITARIO'}
                        onValueChange={(val) => updateAnnexAdjustment(annex.id, annex.coefficient !== undefined ? annex.coefficient : 1, val, annex.isAdjustmentActive)}
                    >
                        <SelectTrigger className="h-8 min-w-[140px] bg-background border-primary/20 rounded-xl text-[9px] font-black uppercase hover:border-primary/40 transition-colors">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-primary/20">
                            <SelectItem value="PRECIO UNITARIO" className="text-[10px] font-bold uppercase">Precio Unitario</SelectItem>
                            <SelectItem value="NORMA DE CONSUMO" className="text-[10px] font-bold uppercase">Norma de Consumo</SelectItem>
                            <SelectItem value="AMBOS" className="text-[10px] font-bold uppercase">Ambos</SelectItem>
                            <SelectItem value="VALOR" className="text-[10px] font-bold uppercase">Valor</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex flex-col">
                    <span className="text-[8px] font-black uppercase tracking-widest text-primary/50 mb-1">Coeficiente</span>
                    <div className="relative group/coef">
                        <input
                            type="text"
                            value={localCoef}
                            onChange={(e) => {
                                const val = e.target.value;
                                setLocalCoef(val);
                                if (val === '' || val === '-' || val.endsWith('.')) return;
                                if (val === '0' || val === '0.' || val === '0.0') {
                                    updateAnnexAdjustment(annex.id, 0, annex.adjustmentColumn || 'PRECIO UNITARIO', annex.isAdjustmentActive);
                                    return;
                                }
                                const numericVal = parseFloat(val);
                                if (!isNaN(numericVal)) {
                                    updateAnnexAdjustment(annex.id, numericVal, annex.adjustmentColumn || 'PRECIO UNITARIO', annex.isAdjustmentActive);
                                }
                            }}
                            onBlur={() => {
                                if (localCoef === '' || isNaN(parseFloat(localCoef))) {
                                    setLocalCoef('1');
                                    updateAnnexAdjustment(annex.id, 1, annex.adjustmentColumn || 'PRECIO UNITARIO', annex.isAdjustmentActive);
                                }
                            }}
                            className="w-24 h-8 px-8 rounded-xl bg-background border border-primary/20 text-[10px] font-black font-mono text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all text-center"
                        />
                        <RefreshCw className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-primary/40 group-hover/coef:rotate-180 transition-transform duration-700" />
                    </div>
                </div>

                <div className="flex items-center gap-3 bg-background/50 px-4 py-1.5 rounded-xl border border-primary/10 ml-2">
                    <span className="text-[9px] font-black uppercase tracking-widest text-primary/70">Auto-ajuste</span>
                    <Switch
                        checked={!!annex.isAdjustmentActive}
                        onCheckedChange={(checked) => updateAnnexAdjustment(annex.id, annex.coefficient !== undefined ? annex.coefficient : 1, annex.adjustmentColumn || 'PRECIO UNITARIO', checked)}
                        className="scale-90"
                    />
                </div>

                {showTargetPriceInput && (
                  <div className="flex flex-row items-end gap-2 ml-4 animate-in fade-in slide-in-from-left-4 duration-700">
                    <div className="flex flex-col">
                        <span className="text-[8px] font-black uppercase tracking-widest text-primary/50 mb-1">Precio Venta Objetivo</span>
                        <div className="relative group/target">
                            <input
                                type="number"
                                value={targetPrice}
                                onChange={(e) => setTargetPrice(e.target.value)}
                                placeholder="Ej: 25"
                                className="w-24 h-8 px-8 rounded-xl bg-background border border-primary/20 text-[10px] font-black font-mono text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all text-center placeholder:text-primary/20"
                            />
                            <Target className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-primary/40" />
                        </div>
                    </div>
                    <Button
                        size="sm"
                        onClick={handleSolve}
                        disabled={isSolving || !targetPrice}
                        className="h-8 px-4 rounded-xl bg-primary text-foreground font-black uppercase tracking-widest text-[9px] shadow-lg shadow-primary/10 active:scale-95 transition-all gap-2"
                    >
                        {isSolving ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <>Calcular</>
                        )}
                    </Button>
                  </div>
                )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto self-end lg:self-center">
             <div className="relative group">
                <input
                  type="file"
                  id={`import-${annex.id}`}
                  className="hidden"
                  onChange={handleImport}
                  accept=".xlsx, .xls"
                />
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="rounded-xl border-dashed border-primary/30 hover:border-primary/50 hover:bg-primary/5 text-primary h-10 px-4 font-black uppercase tracking-widest text-[10px]"
                >
                  <label htmlFor={`import-${annex.id}`} className="cursor-pointer flex items-center gap-2">
                    <Upload className="w-3.5 h-3.5" />
                    Importar Excel
                  </label>
                </Button>
             </div>
             <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                className="rounded-xl border-primary/20 hover:bg-primary/10 text-primary h-10 px-4 font-black uppercase tracking-widest text-[10px] gap-2"
             >
                <Download className="w-3.5 h-3.5" />
                Exportar
             </Button>
             <Button
                onClick={() => addRow(annex.id)}
                className="rounded-xl bg-primary hover:bg-primary/90 text-foreground h-10 px-6 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20 gap-2 w-full lg:w-auto active:scale-95 transition-all"
             >
                <Plus className="w-4 h-4" />
                Añadir Fila
             </Button>
          </div>
       </div>

       <ProductInventoryPicker
         open={isPickerOpen}
         onOpenChange={setIsPickerOpen}
         onSelect={handleProductSelect}
       />

       <div className={cn(
         "rounded-3xl border border-border/50 bg-card/30 backdrop-blur-sm overflow-hidden shadow-2xl",
         layoutMode === 'grid' && "border-none bg-transparent shadow-none backdrop-blur-none"
       )}>
         <div className="overflow-x-auto no-scrollbar">
            <Table className={cn(layoutMode === 'grid' && "hidden sm:table")}>
                <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50 border-b border-border/50">
                        {annex.columns.map((col: CostSheetColumn) => (
                            <TableHead key={col.key} className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground p-4 h-14">
                                {col.label || col.title}
                            </TableHead>
                        ))}
                        <TableHead className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground p-4 text-center h-14 w-24">Acciones</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {annex.data.map((row: any, rowIndex: number) => {
                        const isZero = (colKey: string) => Number(row[colKey]) === 0;
                        return (
                        <TableRow key={rowIndex} className="h-auto sm:h-8 text-xs border-b border-border/30 hover:bg-primary/5 transition-colors group">
                            {annex.columns.map((col: CostSheetColumn) => {
                                const isMain = col.key === 'description' || col.label?.toLowerCase().includes('descripción') || col.label?.toLowerCase().includes('puesto');
                                const widthClass = col.key === 'no' ? 'w-12' :
                                               (col.key === 'um' ? 'w-16' :
                                               (col.key === 'total' || col.key === 'amount' ? 'w-32' :
                                               (!isMain ? 'w-24' : '')));
                                return (
                                <TableCell key={col.key} data-label={col.label || col.title || col.key} className={cn("p-3 sm:p-4", widthClass)}>
                                    {col.formula ? (
                                        <div className="relative group/cell">
                                            <div className={cn("neu-inset-sm px-2 py-1 font-mono text-right bg-primary/5 min-w-[100px] border border-primary/10", isZero(col.key) ? "text-muted-foreground opacity-60 font-medium" : "text-primary font-black")}>
                                                {formatCurrency((calculatedAnnex?.data[rowIndex]?.[col.key] ?? 0)).replace('$', '').trim()}
                                            </div>
                                            <FunctionSquare className="absolute -top-1 -right-1 w-2.5 h-2.5 text-primary/30" />
                                        </div>
                                    ) : col.key === 'no' ? (
                                        <div className="neu-inset-sm px-3 py-2 font-black text-center bg-muted/20 text-muted-foreground w-12 border border-border/50 mx-auto">
                                            {rowIndex + 1}
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

                                                    const isPrice = col.key === "price_unit" || col.key === "rate" || col.label === "PRECIO UNITARIO" || col.key === "price";
                                                    const isNorm = col.key === "norm" || col.key === "consumption" || col.key === "quantity" || col.label === "NORMA DE CONSUMO" || col.key === "qty";

                                                    if (annex.adjustmentColumn === "AMBOS") {
                                                        if (isPrice || isNorm) return String((val * Math.sqrt(coef)).toFixed(4));
                                                    } else {
                                                        const isAdjusted =
                                                            (col.label === annex.adjustmentColumn) ||
                                                            (annex.adjustmentColumn === "PRECIO UNITARIO" && isPrice) ||
                                                            (annex.adjustmentColumn === "NORMA DE CONSUMO" && isNorm) ||
                                                            (annex.adjustmentColumn === "VALOR" && col.key === "value") ||
                                                            (annex.adjustmentColumn === "IMPORTE" && col.key === "importe");
                                                        if (isAdjusted) return String((val * coef).toFixed(4));
                                                    }
                                                    return val ?? "";
                                                })()}
                                                onChange={(e) => {
                                                    let val: string | number = e.target.value;
                                                    const coef = annex.coefficient !== undefined ? annex.coefficient : 1;
                                                    const isActive = !!annex.isAdjustmentActive;

                                                    if (isActive && coef !== 1 && coef !== 0 && !isNaN(parseFloat(val))) {
                                                        const numericVal = parseFloat(val);
                                                        const isPrice = col.key === "price_unit" || col.key === "rate" || col.label === "PRECIO UNITARIO" || col.key === "price";
                                                        const isNorm = col.key === "norm" || col.key === "consumption" || col.key === "quantity" || col.label === "NORMA DE CONSUMO" || col.key === "qty";

                                                        if (annex.adjustmentColumn === "AMBOS") {
                                                            if (isPrice || isNorm) val = numericVal / Math.sqrt(coef);
                                                        } else {
                                                            const isAdjusted =
                                                                (col.label === annex.adjustmentColumn) ||
                                                                (annex.adjustmentColumn === "PRECIO UNITARIO" && isPrice) ||
                                                                (annex.adjustmentColumn === "NORMA DE CONSUMO" && isNorm) ||
                                                                (annex.adjustmentColumn === "VALOR" && col.key === "value") ||
                                                                (annex.adjustmentColumn === "IMPORTE" && col.key === "importe");
                                                            if (isAdjusted) val = numericVal / coef;
                                                        }
                                                    }
                                                    handleInputChange(['annexes', annexIndex, 'data', rowIndex, col.key], val);
                                                }}
                                                className={cn(
                                                    "neu-inset-sm h-8 px-2 py-1 font-mono text-right bg-background/50 border border-border/50 focus:border-primary/30 focus:ring-1 focus:ring-primary/20",
                                                    isZero(col.key) ? "text-muted-foreground opacity-60" : "text-foreground font-bold"
                                                )}
                                            />
                                            {(() => {
                                                const val = annex.data[rowIndex][col.key];
                                                const coef = annex.coefficient !== undefined ? annex.coefficient : 1;
                                                const isActive = !!annex.isAdjustmentActive;
                                                if (!isActive || coef === 1 || typeof val !== "number" || val === 0) return null;

                                                const isPrice = col.key === "price_unit" || col.key === "rate" || col.label === "PRECIO UNITARIO" || col.key === "price";
                                                const isNorm = col.key === "norm" || col.key === "consumption" || col.key === "quantity" || col.label === "NORMA DE CONSUMO" || col.key === "qty";

                                                let show = false;
                                                if (annex.adjustmentColumn === "AMBOS") {
                                                    if (isPrice || isNorm) show = true;
                                                } else {
                                                    show = (col.label === annex.adjustmentColumn) ||
                                                           (annex.adjustmentColumn === "PRECIO UNITARIO" && isPrice) ||
                                                           (annex.adjustmentColumn === "NORMA DE CONSUMO" && isNorm) ||
                                                           (annex.adjustmentColumn === "VALOR" && col.key === "value") ||
                                                           (annex.adjustmentColumn === "IMPORTE" && col.key === "importe");
                                                }

                                                if (!show) return null;
                                                return (
                                                    <div className="absolute -bottom-4 right-0 text-[8px] font-bold text-muted-foreground whitespace-nowrap opacity-70">
                                                        Orig: {val.toFixed(4)}
                                                    </div>
                                                );
                                            })()}
                                            {typeof annex.data[rowIndex][col.key] === 'string' && annex.data[rowIndex][col.key] !== '' && (
                                                <FunctionSquare className="absolute top-1 right-1 w-2.5 h-2.5 text-primary/40" />
                                            )}
                                        </div>
                                    )}
                                </TableCell>
                                );
                            })}
                            <TableCell data-label="Acciones" className="text-center p-3 sm:p-4 w-[1%] whitespace-nowrap">
                                <div className="flex items-center justify-center gap-1">
                                <div className="flex flex-col sm:flex-row items-center gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => reorderRow(annex.id, rowIndex, 'up')}
                                        className="p-1 h-8 w-8 text-muted-foreground hover:text-primary transition-all"
                                        title="Subir"
                                    >
                                        <ChevronUp className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => reorderRow(annex.id, rowIndex, 'down')}
                                        className="p-1 h-8 w-8 text-muted-foreground hover:text-primary transition-all"
                                        title="Bajar"
                                    >
                                        <ChevronDown className="h-4 w-4" />
                                    </Button>
                                </div>
                                {annex.id === 'I' && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => {
                                            setTargetRowIndex(rowIndex);
                                            setIsPickerOpen(true);
                                        }}
                                        className="p-3 text-primary hover:bg-primary/10 rounded-xl transition-all neu-raised-sm group-hover:scale-110 active:scale-95 min-h-[44px] min-w-[44px]"
                                        aria-label="Importar desde inventario"
                                    >
                                        <Database className="h-4 w-4" />
                                    </Button>
                                )}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeRow(annex.id, rowIndex)}
                                    className="p-3 text-danger hover:bg-danger/10 rounded-xl transition-all neu-raised-sm group-hover:scale-110 active:scale-95 min-h-[44px] min-w-[44px]"
                                    aria-label="Eliminar fila"
                                >
                                    <Trash2 className="h-5 w-5" />
                                </Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    );})}
                </TableBody>
                <TableFooter>
                  <TableRow className="bg-primary/5 hover:bg-primary/10 transition-colors border-t-2 border-primary/20">
                    <TableCell colSpan={annex.columns.length} className="p-0">
                      <div className="flex flex-col sm:flex-row justify-end items-end sm:items-center gap-4 p-6 min-w-full">
                        <span className="text-xs text-primary/70 uppercase font-black tracking-[0.2em]">Total {annex.id}</span>
                        <div className="flex items-center gap-3">
                            <span className="text-3xl font-black font-mono text-primary drop-shadow-sm">
                                {formatCurrency(totalValue)}
                            </span>

                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="bg-primary/5"></TableCell>
                  </TableRow>
                </TableFooter>
            </Table>
         </div>
       </div>

       {/* Global suggestions for classification column */}
       <datalist id={`classification-suggestions-${activeAnnexId}`}>
          {classificationSuggestions.map(s => (
              <option key={s.id} value={`${s.id} - ${s.label}`} />
          ))}
       </datalist>

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
