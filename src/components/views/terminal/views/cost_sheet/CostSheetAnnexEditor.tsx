
'use client';

import React from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { useCostSheetCalculator } from '@/hooks/logic/useCostSheetCalculator';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Trash2, Plus } from 'lucide-react';
import { CostSheetAnnex, CostSheetColumn } from '@/types/cost-sheet';

interface CostSheetAnnexEditorProps {
  activeAnnexId: string;
}

const CostSheetAnnexEditor: React.FC<CostSheetAnnexEditorProps> = ({ activeAnnexId }) => {
  const { data, updateValue, addRow, removeRow } = useCostSheetStore();
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

  return (
    <div data-testid="cost-sheet-annex-editor" className="space-y-6 animate-in fade-in duration-500">
       <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
              <h3 className="text-xl font-black text-primary">Anexo {annex.id}</h3>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{annex.title}</p>
          </div>
          <Button
            onClick={() => addRow(annex.id)}
            className="neu-btn-primary !py-2.5 !px-5 rounded-xl w-full sm:w-auto flex items-center justify-center gap-2 font-bold text-sm shadow-lg"
          >
              <Plus className="w-4 h-4" />
              Añadir Fila
          </Button>
       </div>

       <div className="w-full">
         <div className="overflow-x-auto table-to-cards rounded-2xl shadow-2xl border border-white/5 bg-background/30">
            <Table>
                <TableHeader className="bg-muted/50 hidden sm:table-header-group">
                    <TableRow className="border-b border-border/50">
                        {annex.columns.map((col: any) => (
                            <TableHead key={col.key} className="font-black py-4 px-4 text-[10px] uppercase tracking-widest text-muted-foreground">
                                {col.label}
                            </TableHead>
                        ))}
                        <TableHead className="text-center w-20"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {displayData.map((row: any, rowIndex: number) => (
                        <TableRow key={rowIndex} className="border-b border-border/30 hover:bg-primary/5 transition-colors group">
                            {annex.columns.map((col: any) => (
                                <TableCell key={col.key} data-label={col.label} className="p-3 sm:p-4">
                                    {col.formula ? (
                                        <div className="neu-inset-sm px-3 py-2 font-mono text-right bg-primary/5 text-primary font-black min-w-[100px] border border-primary/10">
                                            {(row[col.key] ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </div>
                                    ) : (
                                        <Input
                                            type={typeof row[col.key] === 'number' ? 'number' : 'text'}
                                            value={data.annexes[annexIndex].data[rowIndex][col.key]}
                                            onChange={(e) => handleInputChange(['annexes', annexIndex, 'data', rowIndex, col.key], e.target.value)}
                                            className="neu-input !p-2 min-w-[120px] text-sm font-medium border-transparent hover:border-primary/20 focus:border-primary"
                                        />
                                    )}
                                </TableCell>
                            ))}
                            <TableCell data-label="Acciones" className="text-center p-3 sm:p-4">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeRow(annex.id, rowIndex)}
                                    className="p-2.5 text-danger hover:bg-danger/10 rounded-xl transition-all neu-raised-sm group-hover:scale-110 active:scale-95"
                                    aria-label="Eliminar fila"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
         </div>
       </div>

       {/* Annex Total */}
       <div className="flex justify-end mt-4">
          <div className="neu-card !p-5 border-primary/20 bg-primary/5 shadow-xl min-w-[240px]">
              <span className="text-[10px] text-primary/70 uppercase font-black tracking-[0.2em] block mb-2 text-right">Total {annex.id}</span>
              <div className="flex items-center justify-end gap-2">
                  <span className="text-primary/50 text-xl font-bold">$</span>
                  <span className="text-3xl font-black font-mono text-primary drop-shadow-sm">
                      {displayData.reduce((acc: number, row: any) => {
                           const totalCol = annex.columns.find((c: CostSheetColumn) => c.key === 'total' || c.key === 'amount' || c.key === 'depreciation_cost');
                           const key = totalCol?.key;
                           return acc + (key ? (row[key] || 0) : 0);
                      }, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
              </div>
          </div>
       </div>
    </div>
  );
};

export default CostSheetAnnexEditor;
