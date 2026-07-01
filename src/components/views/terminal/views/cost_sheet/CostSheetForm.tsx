'use client';

import React from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import type { CostSheetSection, CostSheetRow, CostSheetColumn, CostSheetAnnex, CostSheetHeader } from '@/types/cost-sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Trash2, Plus, Edit } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';

import { useTranslations } from 'next-intl';
interface CostSheetFormProps {
  activeSection: string;
  calculatedAnnexes?: CostSheetAnnex[];
  calculatedValues?: { [key: string]: number };
}

const CostSheetForm: React.FC<CostSheetFormProps> = ({
  activeSection,
  calculatedAnnexes = [],
  calculatedValues = {}
}) => {
  const { data, updateValue, addRow, removeRow } = useCostSheetStore();

  const handleInputChange = (path: (string | number)[], value: string | number) => {
    const isNumeric = typeof value === 'string' && /^-?\d*\.?\d*$/.test(value) && value !== '';
    updateValue(path, isNumeric ? parseFloat(value) : value);
  };

  const renderHeaderForm = () => {
    if (!data?.header) {
      return (
        <div className="p-8 text-center bg-muted/20 rounded-2xl border border-dashed">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Datos de encabezado no disponibles</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {[
          { id: 'code', label: 'Código', type: 'text' },
          { id: 'name', label: 'Nombre del Producto/Servicio', type: 'text' },
          { id: 'date', label: 'Fecha', type: 'date' },
          { id: 'unit', label: 'U.M.', type: 'text' },
          { id: 'quantity', label: 'Cantidad', type: 'number' },
          { id: 'currency', label: 'Moneda', type: 'text' },
          { id: 'category', label: 'Categoría', type: 'text' },
          { id: 'type', label: 'Tipo', type: 'text' },
        ].map((field) => (
          <div key={field.id} className="space-y-1.5">
            <Label htmlFor={`header-${field.id}`} className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
              {field.label}
            </Label>
            <Input
              id={`header-${field.id}`}
              className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm font-bold focus:ring-1 focus:ring-primary/20 outline-none"
              type={field.type}
              value={(data?.header)?.[field.id as keyof CostSheetHeader] ?? ''}
              onChange={(e) => handleInputChange(['header', field.id], e.target.value)}
            />
          </div>
        ))}
      </div>
    );
  };

 const renderSignatureForm = () => {
    if (!data?.signature) return null;
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {Object.entries(data?.signature || {}).map(([key, value]) => (
          <div key={key} className="space-y-1.5">
            <Label htmlFor={`signature-${key}`} className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                {key === 'prepared_by' ? 'Elaborado por' : 'Aprobado por'}
            </Label>
            <Input
              id={`signature-${key}`}
              className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm font-bold focus:ring-1 focus:ring-primary/20 outline-none"
              type={'text'}
              value={value as string}
              onChange={(e) => handleInputChange(['signature', key], e.target.value)}
            />
          </div>
        ))}
      </div>
    );
  };

  const renderSectionForm = () => {
    const sections = data?.sections ?? [];
    const section = sections.find((s: CostSheetSection) => s?.id === activeSection);
    if (!section) return null;

    const rows = section.rows ?? [];

    return (
      <div className="space-y-4 sm:space-y-6">
        {rows.map((row: CostSheetRow, rowIndex: number) => (
          <div key={row.id} className="!p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-white/5 rounded-xl bg-card shadow-sm">
            <div className="flex-1">
                <Label htmlFor={`section-${section.id}-${rowIndex}`} className="font-black text-sm sm:text-base block mb-1">
                    {row.label}
                </Label>
                {row.formula && (
                    <div className="text-xs text-primary/70 font-mono bg-primary/5 px-2 py-0.5 rounded-full inline-block border border-primary/10">
                        Fórmula: {row.formula}
                    </div>
                )}
            </div>

            <div className="w-full sm:w-56 shrink-0">
                {row.formula ? (
                   <div className="px-4 py-2.5 font-mono text-right text-lg font-black text-primary bg-primary/5 rounded-lg border border-primary/10">
                        {formatCurrency(calculatedValues[row.id] || 0)}
                   </div>
                ) : (
                    <div className="relative group">
                        <Input
                            id={`section-${section.id}-${rowIndex}`}
                            type="number"
                            value={row.value ?? 0}
                            onChange={(e) => handleInputChange(['sections', (data?.sections || []).indexOf(section), 'rows', rowIndex, 'value'], e.target.value)}
                            className="bg-background border border-border rounded-lg px-3 py-2 text-right font-mono text-lg font-bold focus:ring-1 focus:ring-primary/20 outline-none"
                        />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary font-bold">
                            $
                        </div>
                    </div>
                )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderAnnexForm = () => {
    const annexes = data?.annexes ?? [];
    const annex = annexes.find((a: CostSheetAnnex) => a?.id === activeSection);
    const calculatedAnnex = (calculatedAnnexes || []).find((a: CostSheetAnnex) => a?.id === activeSection);
    if (!annex) return null;

    const displayData = calculatedAnnex ? (calculatedAnnex.data ?? []) : (annex.data ?? []);
    const annexIndex = annexes.indexOf(annex);

    return (
      <div className="space-y-6">
         <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                <h3 className="text-xl font-black text-primary">Anexo {annex.id}</h3>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{annex.title}</p>
            </div>
            <button type="button"
              onClick={() => addRow(annex.id)}
              className="bg-primary text-primary-foreground h-11 !px-5 rounded-xl w-full sm:w-auto flex items-center justify-center gap-2 font-bold text-sm shadow-lg shadow-primary/20"
              aria-label={`Añadir fila al anexo ${annex.id}`}
            >
                <Plus className="w-4 h-4" aria-hidden="true" />
                Añadir Fila
            </button>
         </div>

         <div className="w-full">
           <div className="overflow-x-auto table-to-cards rounded-2xl shadow-2xl border border-white/5 bg-background/30">
              <Table className="sm:data-table">
                  <TableHeader className="bg-muted/50 hidden sm:table-header-group">
                      <TableRow className="border-b border-border/50">
                          {annex.columns.map((col: CostSheetColumn) => (
                              <TableHead key={col.key} className="font-black py-4 px-4 text-xs uppercase tracking-widest text-muted-foreground">
                                  {col.label}
                              </TableHead>
                          ))}
                          <TableHead className="text-center w-20"></TableHead>
                      </TableRow>
                  </TableHeader>
                  <TableBody>
                      {displayData.map((row: Record<string, number | string>, rowIndex: number) => (
                          <TableRow key={rowIndex} className="border-b border-border/30 hover:bg-primary/5 transition-colors group">
                              {(annex.columns ?? []).map((col: CostSheetColumn) => (
                                  <TableCell key={col?.key} data-label={col?.label} className="p-3 sm:p-4">
                                      {col?.formula ? (
                                          <div className="px-3 py-2 font-mono text-right bg-primary/5 text-primary font-black min-w-[100px] rounded-lg border border-primary/10">
                                              {formatCurrency(Number(row?.[col.key]) || 0).replace('$', '').trim()}
                                          </div>
                                      ) : (
                                          <Input
                                              type={typeof row?.[col?.key] === 'number' ? 'number' : 'text'}
                                              value={data?.annexes?.[annexIndex]?.data?.[rowIndex]?.[col?.key] ?? ''}
                                              onChange={(e) => handleInputChange(['annexes', annexIndex, 'data', rowIndex, col?.key], e.target.value)}
                                              className="bg-background border border-border rounded-lg !p-2 min-w-[120px] text-sm font-medium hover:border-primary/20 focus:border-primary focus:ring-1 focus:ring-primary/20"
                                              aria-label={`${col?.label || col?.key} de la fila ${rowIndex + 1} del anexo ${annex.id}`}
                                          />
                                      )}
                                  </TableCell>
                              ))}
                              <TableCell data-label="Acciones" className="text-center p-3 sm:p-4">
                                  <button type="button"
                                      onClick={() => removeRow(annex.id, rowIndex)}
                                      className="w-11 h-11 flex items-center justify-center text-danger hover:bg-danger/10 rounded-xl transition-all mx-auto"
                                      aria-label="Eliminar fila"
                                  >
                                      <Trash2 className="h-4 w-4" />
                                  </button>
                              </TableCell>
                          </TableRow>
                      ))}
                  </TableBody>
              </Table>
           </div>
         </div>

         {/* Annex Total */}
         <div className="flex justify-end mt-4">
            <div className="!p-5 border-primary/20 bg-primary/5 shadow-xl min-w-[240px] rounded-xl">
                <span className="text-xs text-primary/70 uppercase font-black tracking-[0.2em] block mb-2 text-right">Total {annex.id}</span>
                <div className="flex items-center justify-end gap-2">
                    <span className="text-[clamp(1.5rem,5vw,1.875rem)] font-black font-mono text-primary drop-shadow-sm">
                        {formatCurrency(displayData.reduce((acc: number, row: Record<string, number | string>) => {
                             const totalCol = annex.columns.find((c: CostSheetColumn) => c.formula || c.key === 'amount' || c.key === 'total');
                             return acc + (Number(row[totalCol?.key || '']) || 0);
                        }, 0))}
                    </span>
                </div>
            </div>
         </div>
      </div>
    );
  };

  const getActiveContent = () => {
    if (activeSection === 'header') return renderHeaderForm();
    if (activeSection === 'signature') return renderSignatureForm();
    if ((data?.sections || []).some((s: CostSheetSection) => s.id === activeSection)) return renderSectionForm();
    if ((data?.annexes || []).some((a: CostSheetAnnex) => a.id === activeSection)) return renderAnnexForm();
    return <p className="text-center py-12 text-muted-foreground italic">Selecciona una sección para comenzar a editar.</p>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
          <Edit className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-black uppercase tracking-widest text-primary leading-tight">
            Editor de Ficha
          </h2>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
            {activeSection === 'header' ? 'Encabezado General' :
             activeSection === 'signature' ? 'Control de Firmas' :
             `Sección: ${activeSection}`}
          </p>
        </div>
      </div>

      <div className="!p-4 sm:!p-8 bg-card/30 backdrop-blur-sm border border-white/5 shadow-2xl rounded-3xl animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-x-auto no-scrollbar">
        {getActiveContent()}
      </div>
    </div>
  );
};

export default CostSheetForm;
