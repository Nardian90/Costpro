'use client';

import React from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { useCostSheetCalculator } from '@/hooks/logic/useCostSheetCalculator';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Trash2, Plus, Database, FunctionSquare, ChevronUp, ChevronDown, RefreshCw, Download, Upload } from 'lucide-react';
import { CostSheetAnnex, CostSheetColumn } from '@/types/cost-sheet';
import ProductInventoryPicker from './ProductInventoryPicker';
import { useAuthStore } from '@/store';
import { exportAnnexToExcel, importAnnexFromExcel } from '@/services/excel-service';
import { cn, formatCurrency } from '@/lib/utils';
import { ViewMode } from '@/components/ui/ViewSwitcher';

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
  const { user } = useAuthStore();

  const annexIndex = data.annexes.findIndex((a: CostSheetAnnex) => a.id === activeAnnexId);
  const annex = data.annexes[annexIndex] as CostSheetAnnex;

  const calculatedAnnex = calculatedAnnexes.find((a: any) => a.id === activeAnnexId);
  const totalValue = calculatedAnnex ? calculatedAnnex.data.reduce((sum: number, row: any) => {
    const val = [row.total, row.amount, row.depreciation_cost, row.price_total, row.importe].find(v => v !== undefined && v !== null);
    return sum + (parseFloat(String(val ?? 0)) || 0);
  }, 0) : 0;

  const [isPickerOpen, setIsPickerOpen] = React.useState(false);
  const [targetRowIndex, setTargetRowIndex] = React.useState<number | null>(null);

  if (!annex) return null;

  const handleInputChange = (path: (string | number)[], value: any) => {
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

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
       <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex flex-col">
            <h2 className="text-sm font-black uppercase tracking-[0.3em] text-muted-foreground mb-1">Editor de Anexo</h2>
            <div className="flex items-center gap-3">
              <div className="h-8 w-1 bg-primary rounded-full shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{annex.title}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
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
                className="rounded-xl bg-primary hover:bg-primary/90 text-foreground h-10 px-6 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20 gap-2 w-full sm:w-auto active:scale-95 transition-all"
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
                                                {formatCurrency(row[col.key] ?? 0).replace('$', '').trim()}
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
                                                value={annex.data[rowIndex][col.key] ?? ''}
                                                onChange={(e) => handleInputChange(['annexes', annexIndex, 'data', rowIndex, col.key], e.target.value)}
                                                list={(() => {
                                                    const isDescriptionColumn = col.key === 'description' || col.label === 'DESCRIPCIÓN DEL PUESTO';
                                                    if (activeAnnexId === 'I' && col.key === 'description') return undefined;
                                                    if (activeAnnexId === 'II' && isDescriptionColumn) return undefined;
                                                    if (['IV', 'V'].includes(activeAnnexId) && isDescriptionColumn) return undefined;
                                                    if (col.key === 'classification' || col.key === 'description') return `classification-suggestions-${activeAnnexId}`;
                                                    return undefined;
                                                })()}
                                                className={cn(
                                                    "neu-input !p-2 min-w-[80px] text-xs font-bold text-foreground border-transparent hover:border-primary/20 focus:border-primary bg-muted/20",
                                                    typeof annex.data[rowIndex][col.key] === 'string' && annex.data[rowIndex][col.key] !== '' && "border-primary/20 bg-primary/5", typeof row[col.key] === "number" && isZero(col.key) && "text-muted-foreground opacity-60 font-medium"
                                                )}
                                            />
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
                <TableFooter className={cn(layoutMode === 'grid' && "hidden sm:table-footer-group")}>
                  <TableRow className="bg-primary/5 hover:bg-primary/10 transition-colors border-t-2 border-primary/20">
                    <TableCell colSpan={annex.columns.length} className="p-0">
                      <div className="flex flex-col sm:flex-row justify-end items-end sm:items-center gap-4 p-6 min-w-full">
                        <span className="text-xs text-primary/70 uppercase font-black tracking-[0.2em]">Total {annex.id}</span>
                        <div className="flex items-center gap-3">
                            <span className="text-3xl font-black font-mono text-primary drop-shadow-sm">
                                {formatCurrency(totalValue)}
                            </span>
                            {annex.coefficient && annex.coefficient !== 1 && (
                                <div className="flex flex-col items-end print:hidden animate-in fade-in slide-in-from-right-2 duration-500">
                                    <span className="text-[9px] font-black uppercase tracking-widest text-amber-500 mb-1 opacity-80">Ajuste Aplicado</span>
                                    <div className="px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center gap-2 group/coef">
                                    <RefreshCw className="w-3 h-3 text-amber-500 group-hover/coef:rotate-180 transition-transform duration-500" />
                                    <span className="text-xs font-black font-mono text-amber-500">x{annex.coefficient.toFixed(4)}</span>
                                    </div>
                                </div>
                            )}
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
