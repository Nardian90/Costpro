
'use client';

import React from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { useCostSheetCalculator } from '@/hooks/logic/useCostSheetCalculator';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Trash2, Plus, Database, FunctionSquare, ChevronUp, ChevronDown, Download, Upload } from 'lucide-react';
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
    layoutMode = 'grid',
    calculatedAnnexes: providedCalculatedAnnexes
}) => {
  const annexes = useCostSheetStore(state => state.data?.annexes ?? []);
  const sections = useCostSheetStore(state => state.data?.sections ?? []);
  const header = useCostSheetStore(state => state.data?.header);
  const updateValue = useCostSheetStore(state => state.updateValue);

  if (!activeAnnexId) {
    return (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center animate-in fade-in duration-500">
            <p className="text-muted-foreground font-bold uppercase tracking-widest text-xs">Anexo no seleccionado</p>
        </div>
    );
  }
  const addRow = useCostSheetStore(state => state.addRow);
  const removeRow = useCostSheetStore(state => state.removeRow);
  const reorderRow = useCostSheetStore(state => state.reorderRow);

  const { user } = useAuthStore();
  const [isPickerOpen, setIsPickerOpen] = React.useState(false);
  const [targetRowIndex, setTargetRowIndex] = React.useState<number | null>(null);
  const annexInputRef = React.useRef<HTMLInputElement>(null);

  // Fallback to internal calculator only if not provided by parent (optimization)
  const internalData = React.useMemo(() => ({ annexes, header, sections: [] } as any), [annexes, header]);
  const { calculatedAnnexes: internalCalculatedAnnexes } = useCostSheetCalculator(providedCalculatedAnnexes ? null as any : internalData);

  const calculatedAnnexes = providedCalculatedAnnexes || internalCalculatedAnnexes;

  const handleInputChange = React.useCallback((path: (string | number)[], value: any) => {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        // If it's a simple number, store as number
        if (/^-?\d*\.?\d+$/.test(trimmed)) {
            updateValue(path, parseFloat(trimmed));
            return;
        }
        // Otherwise store as string (could be a formula)
        updateValue(path, value);
    } else {
        updateValue(path, value);
    }
  }, [updateValue]);

  const annex = React.useMemo(() => (annexes || []).find((a: CostSheetAnnex) => a?.id === activeAnnexId), [annexes, activeAnnexId]);
  const calculatedAnnex = React.useMemo(() => (calculatedAnnexes || []).find((a: any) => a?.id === activeAnnexId), [calculatedAnnexes, activeAnnexId]);

  // Extract classifications from sections based on annex ID
        const classificationSuggestions = React.useMemo(() => {
    const getSuggestions = () => {
        const suggestions: { id: string, label: string }[] = [];

        // Strategy 1: Find rows in all sections that explicitly reference this annex via baseRef
        const traverseByBaseRef = (rows: any[], parentNumbering?: string) => {
            rows.forEach((r, idx) => {
                const numbering = r.id || (parentNumbering
                    ? `${parentNumbering}.${idx + 1}`
                    : `${idx + 1}`);

                if (r.baseRef === activeAnnexId || r.baseRef === `Anexo${activeAnnexId}`) {
                    suggestions.push({ id: numbering, label: r.label });
                    // Also suggest a sub-level if it feeds from an annex
                }

                if (r.children) traverseByBaseRef(r.children, numbering);
            });
        };

        sections.forEach(s => traverseByBaseRef(s.rows || []));

        // Strategy 2: Supplement with hardcoded section mapping
        let targetSectionId = '';
        if (activeAnnexId === 'I') targetSectionId = '1';
        else if (activeAnnexId === 'II') targetSectionId = '2';
        else if (activeAnnexId === 'III') targetSectionId = '3.1';
        else if (activeAnnexId === 'IV') targetSectionId = '3';
        else if (activeAnnexId === 'V') targetSectionId = '3.7';
        else {
            const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
            const num = roman.indexOf(activeAnnexId) + 1;
            if (num > 0) targetSectionId = `s${num}`;
        }

        const findSectionRows = (targetId: string) => {
            const section = sections.find(s => s.id === targetId || s.id === (targetId.startsWith('s') ? targetId : 's' + targetId));
            if (section) return section.rows || [];

            // Look for specific row ID
            for (const s of sections) {
                const search = (rows: any[]): any[] | null => {
                    for (const r of rows) {
                        if (r.id === targetId) {
                            // If it's Otros Gastos (Annex IV), we want the direct children of Section 3
                            // but if targetId is '3', we already handle it.
                            // The user says "literal what is in the section"
                            return r.children || [r];
                        }
                        if (r.children) {
                            const res = search(r.children);
                            if (res) return res;
                        }
                    }
                    return null;
                };
                const res = search(s.rows || []);
                if (res) return res;
            }
            return [];
        };

        const sectionRows = findSectionRows(targetSectionId);
        const traverse = (rows: any[], parentNumbering?: string) => {
            rows.forEach((r, idx) => {
                const numbering = r.id || (parentNumbering
                    ? `${parentNumbering}.${idx + 1}`
                    : (targetSectionId && !targetSectionId.startsWith('s') ? `${targetSectionId}.${idx + 1}` : `${idx + 1}`));

                // Avoid duplicates and ensure we don't suggest empty labels
                if (!suggestions.some(s => s.id === numbering)) {
                    suggestions.push({ id: numbering, label: r.label });
                }

                if (r.children) traverse(r.children, numbering);
            });
        };
        traverse(sectionRows);

        // Remove duplicates just in case and sort by ID
        return suggestions
            .filter((v, i, a) => a.findIndex(t => t.id === v.id) === i)
            .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' }));
    };

    return getSuggestions();
  }, [sections, activeAnnexId]);

  if (!annex) {
      return (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center animate-in fade-in duration-500">
            <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mb-4">
                <Database className="w-8 h-8 text-muted-foreground opacity-20" />
            </div>
            <p className="text-muted-foreground font-bold uppercase tracking-widest text-xs">Anexo no disponible</p>
            <p className="text-xs text-muted-foreground/60 mt-1 uppercase">Verifique la configuración de la ficha</p>
        </div>
      );
  }

  const displayData = calculatedAnnex ? (calculatedAnnex.data ?? []) : (annex?.data ?? []);
  const annexIndex = React.useMemo(() => annexes.indexOf(annex!), [annexes, annex]);

  const totalValue = React.useMemo(() => {
    if (!annex?.columns || !displayData) return 0;


    const totalCol = annex.columns.find((c: CostSheetColumn) =>
        ['total', 'amount', 'depreciation_cost', 'price_total', 'value', 'importe'].includes(c.key)
    );
    const key = totalCol?.key;
    if (!key) return 0;

    return displayData.reduce((acc: number, row: any) => {
        return acc + (Number(row[key]) || 0);
    }, 0);
  }, [displayData, annex?.columns]);

  const handleProductSelect = React.useCallback((product: any) => {
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
  }, [targetRowIndex, annexIndex, updateValue]);

  const handleImportExcel = React.useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && annex) {
      try {
        const newData = await importAnnexFromExcel(file, annex);
        updateValue(['annexes', annexIndex, 'data'], newData);
      } catch (err) {
        console.error(err);
      }
    }
    e.target.value = '';
  }, [annex, annexIndex, updateValue]);

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
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              {annex.id === 'I' && (
                <Button
                    onClick={() => {
                        const currentLength = annexes[annexIndex].data.length;
                        addRow(annex.id);
                        setTargetRowIndex(currentLength);
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
                onClick={() => exportAnnexToExcel(annex)}
                variant="outline"
                className="neu-button flex-1 sm:flex-none flex items-center justify-center gap-2 font-bold text-sm min-h-[44px] px-5"
              >
                  <Download className="w-4 h-4 text-primary" />
                  Exportar
              </Button>

              <div className="relative flex-1 sm:flex-none">
                <Button
                  onClick={() => annexInputRef.current?.click()}
                  variant="outline"
                  className="neu-button w-full flex items-center justify-center gap-2 font-bold text-sm min-h-[44px] px-5"
                >
                    <Upload className="w-4 h-4 text-primary" />
                    Importar
                </Button>
                <input
                  type="file"
                  ref={annexInputRef}
                  className="hidden"
                  accept=".xlsx,.xls"
                  onChange={handleImportExcel}
                />
              </div>

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
            <Table className={cn(layoutMode === "grid" && "sm:data-table")}>
                <TableHeader className={cn(
                  "bg-slate-100 dark:bg-slate-800/50 text-slate-900 dark:text-foreground font-black uppercase text-xs tracking-widest border-b border-slate-200 dark:border-slate-700",
                  layoutMode === 'grid' ? "hidden md:table-header-group" : "table-header-group"
                )}>
                    <TableRow className="border-b border-border/50">
                        {annex.columns.map((col: CostSheetColumn) => {
                             const isMain = col.key === 'description' || col.label?.toLowerCase().includes('descripción') || col.label?.toLowerCase().includes('puesto');
                             const widthClass = col.key === 'no' ? 'w-12' :
                                               (col.key === 'um' ? 'w-16' :
                                               (col.key === 'total' || col.key === 'amount' ? 'w-32' :
                                               (!isMain ? 'w-24' : '')));
                             return (
                                <TableHead key={col.key} className={cn(
                                    "font-black py-2 px-2 text-xs uppercase tracking-widest text-slate-500 dark:text-slate-400 whitespace-nowrap",
                                    widthClass
                                )}>
                                    {col.label || col.title || col.key}
                                </TableHead>
                             );
                        })}
                        <TableHead className="text-center w-[1%] whitespace-nowrap uppercase tracking-widest">Acciones</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {displayData.map((row: any, rowIndex: number) => {
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
                                                type={typeof (annexes[annexIndex].data[rowIndex][col.key]) === 'number' ? 'number' : 'text'}
                                                value={annexes[annexIndex].data[rowIndex][col.key] ?? ''}
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
                                                    typeof annexes[annexIndex].data[rowIndex][col.key] === 'string' && annexes[annexIndex].data[rowIndex][col.key] !== '' && "border-primary/20 bg-primary/5", typeof row[col.key] === "number" && isZero(col.key) && "text-muted-foreground opacity-60 font-medium"
                                                )}
                                            />
                                            {typeof annexes[annexIndex].data[rowIndex][col.key] === 'string' && annexes[annexIndex].data[rowIndex][col.key] !== '' && (
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
                </div>
            </div>
         </div>
       )}
    </div>
  );
});

export default CostSheetAnnexEditor;
