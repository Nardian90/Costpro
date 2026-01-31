
'use client';

import React from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { useCostSheetCalculator } from '@/hooks/logic/useCostSheetCalculator';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Trash2, Plus, Database } from 'lucide-react';
import { CostSheetAnnex, CostSheetColumn } from '@/types/cost-sheet';
import ProductInventoryPicker from './ProductInventoryPicker';
import { useAuthStore } from '@/store';
import { cn, formatCurrency } from '@/lib/utils';
import { ViewMode } from '@/components/ui/ViewSwitcher';

interface CostSheetAnnexEditorProps {
  activeAnnexId: string;
  layoutMode?: ViewMode;
}

const CostSheetAnnexEditor: React.FC<CostSheetAnnexEditorProps> = ({ activeAnnexId, layoutMode = 'grid' }) => {
  const { data, updateValue, addRow, removeRow } = useCostSheetStore();
  const { user } = useAuthStore();
  const [isPickerOpen, setIsPickerOpen] = React.useState(false);
  const [targetRowIndex, setTargetRowIndex] = React.useState<number | null>(null);

  // We need the calculator to get the calculated values for display
  const { calculatedAnnexes } = useCostSheetCalculator(data);

  const handleInputChange = (path: (string | number)[], value: any) => {
    const isNumeric = typeof value === 'string' && /^-?\d*\.?\d*$/.test(value) && value !== '';
    updateValue(path, isNumeric ? parseFloat(value) : value);
  };

  const annex = data.annexes.find((a: CostSheetAnnex) => a.id === activeAnnexId);
  const calculatedAnnex = calculatedAnnexes.find((a: any) => a.id === activeAnnexId);

  if (!annex) {
      return <p className="text-center py-12 text-muted-foreground italic">Anexo no encontrado.</p>;
  }

  const displayData = calculatedAnnex ? calculatedAnnex.data : annex.data;
  const annexIndex = data.annexes.indexOf(annex);

  const totalValue = displayData.reduce((acc: number, row: any) => {
    const totalCol = annex.columns.find((c: CostSheetColumn) => c.key === 'total' || c.key === 'amount' || c.key === 'depreciation_cost');
    const key = totalCol?.key;
    return acc + (key ? (row[key] || 0) : 0);
  }, 0);

  const handleProductSelect = (product: any) => {
    if (targetRowIndex === null) return;

    // Map product fields to annex columns
    // We update the original data in the store
    const basePath = ['annexes', annexIndex, 'data', targetRowIndex];

    updateValue([...basePath, 'description'], product.name);
    if (product.sku) {
        updateValue([...basePath, 'code'], product.sku);
    }
    if (product.unit_of_measure) {
        updateValue([...basePath, 'um'], product.unit_of_measure);
    }
    if (product.cost_price !== undefined) {
        updateValue([...basePath, 'price'], product.cost_price);
    }

    setTargetRowIndex(null);
  };

  return (
    <div data-testid="cost-sheet-annex-editor" className="space-y-6 animate-in fade-in duration-500">
      <ProductInventoryPicker
        open={isPickerOpen}
        onOpenChange={setIsPickerOpen}
        onSelect={handleProductSelect}
        storeId={user?.activeStoreId}
      />
       <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
              <h3 className="text-xl font-black text-primary">Anexo {annex.id}</h3>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{annex.title}</p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
              {annex.id === 'I' && (
                <Button
                    onClick={() => {
                        addRow(annex.id);
                        setTargetRowIndex(data.annexes[annexIndex].data.length);
                        setIsPickerOpen(true);
                    }}
                    variant="outline"
                    className="neu-button flex-1 sm:flex-none flex items-center justify-center gap-2 font-bold text-sm min-h-[44px] px-5"
                >
                    <Database className="w-4 h-4 text-primary" />
                    Importar Inventario
                </Button>
              )}
              <Button
                onClick={() => addRow(annex.id)}
                className="neu-btn-primary !py-3 !px-5 rounded-xl flex-1 sm:flex-none flex items-center justify-center gap-2 font-bold text-sm shadow-lg min-h-[44px]"
              >
                  <Plus className="w-4 h-4" />
                  Añadir Fila
              </Button>
          </div>
       </div>

       <div className="w-full">
         <div className={cn(
           "table-to-cards rounded-2xl shadow-2xl border border-white/5 bg-background/30",
           layoutMode === 'table' && "force-table"
         )}>
            <Table>
                <TableHeader className={cn(
                  "bg-slate-100 dark:bg-slate-800/50 text-slate-900 dark:text-white font-black uppercase text-[10px] tracking-widest border-b border-slate-200 dark:border-slate-700",
                  layoutMode === 'grid' ? "hidden md:table-header-group" : "table-header-group"
                )}>
                    <TableRow className="border-b border-border/50">
                        {annex.columns.map((col: CostSheetColumn) => (
                            <TableHead key={col.key} className="font-black py-4 px-4 text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                {col.label || col.title || col.key}
                            </TableHead>
                        ))}
                        <TableHead className="text-center w-20 uppercase tracking-widest">Acciones</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {displayData.map((row: any, rowIndex: number) => (
                        <TableRow key={rowIndex} className="border-b border-border/30 hover:bg-primary/5 transition-colors group">
                            {annex.columns.map((col: CostSheetColumn) => (
                                <TableCell key={col.key} data-label={col.label || col.title || col.key} className="p-3 sm:p-4">
                                    {col.formula ? (
                                        <div className="neu-inset-sm px-3 py-2 font-mono text-right bg-primary/5 text-primary font-black min-w-[100px] border border-primary/10">
                                            {formatCurrency(row[col.key] ?? 0).replace('$', '').trim()}
                                        </div>
                                    ) : (
                                        <Input
                                            type={typeof (data.annexes[annexIndex].data[rowIndex][col.key]) === 'number' ? 'number' : 'text'}
                                            value={data.annexes[annexIndex].data[rowIndex][col.key] ?? ''}
                                            onChange={(e) => handleInputChange(['annexes', annexIndex, 'data', rowIndex, col.key], e.target.value)}
                                            className="neu-input !p-2 min-w-[140px] text-xs font-bold text-slate-700 dark:text-slate-200 border-transparent hover:border-primary/20 focus:border-primary bg-white/50 dark:bg-slate-900/50"
                                        />
                                    )}
                                </TableCell>
                            ))}
                            <TableCell data-label="Acciones" className="text-center p-3 sm:p-4">
                                <div className="flex items-center justify-center gap-1">
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
                    ))}
                </TableBody>
                <TableFooter className={cn(layoutMode === 'grid' && "hidden sm:table-footer-group")}>
                  <TableRow className="bg-primary/5 hover:bg-primary/10 transition-colors border-t-2 border-primary/20">
                    <TableCell colSpan={annex.columns.length} className="p-0">
                      <div className="flex flex-col sm:flex-row justify-end items-end sm:items-center gap-4 p-6 min-w-full">
                        <span className="text-[10px] text-primary/70 uppercase font-black tracking-[0.2em]">Total {annex.id}</span>
                        <span className="text-3xl font-black font-mono text-primary drop-shadow-sm">
                          {formatCurrency(totalValue)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="bg-primary/5"></TableCell>
                  </TableRow>
                </TableFooter>
            </Table>
         </div>
       </div>

       {/* Annex Total for Grid Mode (Mobile Cards) */}
       {layoutMode === 'grid' && (
         <div className="flex justify-end mt-4 sm:hidden">
            <div className="neu-card !p-5 border-primary/20 bg-primary/5 shadow-xl min-w-[240px] w-full">
                <span className="text-[10px] text-primary/70 uppercase font-black tracking-[0.2em] block mb-2 text-right">Total {annex.id}</span>
                <div className="flex items-center justify-end gap-2">
                    <span className="text-3xl font-black font-mono text-primary drop-shadow-sm">
                        {formatCurrency(totalValue)}
                    </span>
                </div>
            </div>
         </div>
       )}
    </div>
  );
};

export default CostSheetAnnexEditor;
