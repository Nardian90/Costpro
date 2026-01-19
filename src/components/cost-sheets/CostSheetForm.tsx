
'use client';

import React from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '../ui/button';
import { Trash2, Plus, Edit } from 'lucide-react';

interface CostSheetFormProps {
  activeSection: string;
  calculatedAnnexes?: any[];
  calculatedValues?: { [key: string]: number };
}

const CostSheetForm: React.FC<CostSheetFormProps> = ({
  activeSection,
  calculatedAnnexes = [],
  calculatedValues = {}
}) => {
  const { data, updateValue, addRow, removeRow } = useCostSheetStore();

  const handleInputChange = (path: (string | number)[], value: any) => {
    // Check if the value should be a number
    const isNumeric = typeof value === 'string' && /^-?\d*\.?\d*$/.test(value) && value !== '';
    updateValue(path, isNumeric ? parseFloat(value) : value);
  };

  const renderHeaderForm = () => {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-1">
            <Label htmlFor="header-code" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Código</Label>
            <Input id="header-code" className="neu-input w-full" value={data.header.code} onChange={(e) => handleInputChange(['header', 'code'], e.target.value)} />
        </div>
        <div className="space-y-1">
            <Label htmlFor="header-name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Nombre del Producto/Servicio</Label>
            <Input id="header-name" className="neu-input w-full" value={data.header.name} onChange={(e) => handleInputChange(['header', 'name'], e.target.value)} />
        </div>
        <div className="space-y-1">
            <Label htmlFor="header-date" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Fecha</Label>
            <Input id="header-date" className="neu-input w-full" type="date" value={data.header.date} onChange={(e) => handleInputChange(['header', 'date'], e.target.value)} />
        </div>
        <div className="space-y-1">
            <Label htmlFor="header-unit" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">U.M.</Label>
            <Input id="header-unit" className="neu-input w-full" value={data.header.unit} onChange={(e) => handleInputChange(['header', 'unit'], e.target.value)} />
        </div>
        <div className="space-y-1">
            <Label htmlFor="header-quantity" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Cantidad</Label>
            <Input id="header-quantity" className="neu-input w-full" type="number" value={data.header.quantity} onChange={(e) => handleInputChange(['header', 'quantity'], e.target.value)} />
        </div>
        <div className="space-y-1">
            <Label htmlFor="header-currency" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Moneda</Label>
            <Input id="header-currency" className="neu-input w-full" value={data.header.currency} onChange={(e) => handleInputChange(['header', 'currency'], e.target.value)} />
        </div>
        <div className="space-y-1">
            <Label htmlFor="header-category" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Categoría</Label>
            <Input id="header-category" className="neu-input w-full" value={data.header.category} onChange={(e) => handleInputChange(['header', 'category'], e.target.value)} />
        </div>
        <div className="space-y-1">
            <Label htmlFor="header-type" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tipo</Label>
            <Input id="header-type" className="neu-input w-full" value={data.header.type} onChange={(e) => handleInputChange(['header', 'type'], e.target.value)} />
        </div>
      </div>
    );
  };

 const renderSignatureForm = () => {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Object.entries(data.signature).map(([key, value]) => (
          <div key={key} className="space-y-1">
            <Label htmlFor={`signature-${key}`} className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {key === 'prepared_by' ? 'Elaborado por' : 'Aprobado por'}
            </Label>
            <Input
              id={`signature-${key}`}
              className="neu-input w-full"
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
    const section = data.sections.find((s: any) => s.id === activeSection);
    if (!section) return null;

    return (
      <div className="space-y-6">
        {section.rows.map((row: any, rowIndex: number) => (
          <div key={row.id} className="neu-raised-sm p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex-1">
                <Label htmlFor={`section-${section.id}-${rowIndex}`} className="font-bold text-base block mb-1">
                    {row.label}
                </Label>
                {row.formula && (
                    <div className="text-xs text-muted-foreground font-mono bg-accent/10 p-1 rounded inline-block">
                        Fórmula: {row.formula}
                    </div>
                )}
            </div>

            <div className="w-full sm:w-48 shrink-0">
                {row.formula ? (
                   <div className="neu-inset-sm px-4 py-2 font-mono text-right text-lg font-bold text-primary bg-background/50">
                        {calculatedValues[row.id]?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                   </div>
                ) : (
                    <div className="relative">
                        <Input
                            id={`section-${section.id}-${rowIndex}`}
                            type="number"
                            value={row.value}
                            onChange={(e) => handleInputChange(['sections', data.sections.indexOf(section), 'rows', rowIndex, 'value'], e.target.value)}
                            className="neu-input !pr-10 text-right font-mono text-lg"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
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
    const annex = data.annexes.find((a: any) => a.id === activeSection);
    const calculatedAnnex = calculatedAnnexes.find((a: any) => a.id === activeSection);
    if (!annex) return null;

    const displayData = calculatedAnnex ? calculatedAnnex.data : annex.data;
    const annexIndex = data.annexes.indexOf(annex);

    return (
      <div className="space-y-6">
         <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
            <div>
                <h3 className="text-xl font-bold text-primary">Anexo {annex.id}</h3>
                <p className="text-sm text-muted-foreground">{annex.title}</p>
            </div>
            <Button onClick={() => addRow(annex.id)} className="neu-btn-primary w-full sm:w-auto">
                <Plus className="w-4 h-4 mr-2" /> Añadir Fila
            </Button>
         </div>

         <div className="border rounded-2xl overflow-hidden shadow-2xl bg-card">
            <div className="overflow-x-auto table-to-cards force-table">
                <Table>
                    <TableHeader className="bg-gray-800 dark:bg-gray-900 sticky top-0 z-10">
                        <TableRow>
                            {annex.columns.map((col: any) => (
                                <TableHead key={col.key} className="text-white font-bold py-4 px-3 text-xs uppercase tracking-wider">
                                    {col.label}
                                </TableHead>
                            ))}
                            <TableHead className="text-white font-bold py-4 px-3 text-center text-xs uppercase tracking-wider">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {displayData.map((row: any, rowIndex: number) => (
                            <TableRow key={rowIndex} className="border-b border-border/50 hover:bg-accent/5 transition-colors">
                                {annex.columns.map((col: any) => (
                                    <TableCell key={col.key} data-label={col.label} className="p-2 sm:p-3">
                                        {col.formula ? (
                                            <div className="neu-inset-sm px-3 py-2 font-mono text-right bg-gray-50/10 text-primary font-bold min-w-[100px]">
                                                {row[col.key]?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </div>
                                        ) : (
                                            <Input
                                                type={typeof row[col.key] === 'number' ? 'number' : 'text'}
                                                value={data.annexes[annexIndex].data[rowIndex][col.key]}
                                                onChange={(e) => handleInputChange(['annexes', annexIndex, 'data', rowIndex, col.key], e.target.value)}
                                                className="neu-input !p-2 min-w-[120px] text-sm sm:text-base"
                                            />
                                        )}
                                    </TableCell>
                                ))}
                                <TableCell data-label="Acciones" className="text-center p-2 sm:p-3">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removeRow(annex.id, rowIndex)}
                                        className="text-danger hover:bg-danger/10 h-10 w-10 neu-raised-sm"
                                    >
                                        <Trash2 className="h-5 w-5" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
         </div>

         {/* Annex Total */}
         <div className="flex justify-end p-6 bg-background rounded-2xl border border-border shadow-lg">
            <div className="text-right">
                <span className="text-xs text-muted-foreground uppercase font-black tracking-widest block mb-1">Total {annex.id}</span>
                <div className="flex items-center justify-end gap-2">
                    <span className="text-muted-foreground text-lg">$</span>
                    <span className="text-3xl font-black font-mono text-primary">
                        {displayData.reduce((acc: number, row: any) => {
                             const totalCol = annex.columns.find((c:any) => c.formula || c.key === 'amount' || c.key === 'total');
                             return acc + (row[totalCol?.key || ''] || 0);
                        }, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                </div>
            </div>
         </div>
      </div>
    );
  };

  const getActiveContent = () => {
    if (activeSection === 'header') {
      return renderHeaderForm();
    }
     if (activeSection === 'signature') {
      return renderSignatureForm();
    }
    if (data.sections.some((s: any) => s.id === activeSection)) {
      return renderSectionForm();
    }
    if (data.annexes.some((a: any) => a.id === activeSection)) {
      return renderAnnexForm();
    }
    return <p>Select a section to start editing.</p>;
  };

  return (
    <div className="neu-card !p-0 overflow-hidden border-none shadow-2xl">
      <div className="bg-primary/10 p-6 border-b border-primary/20">
        <h2 className="text-lg font-black uppercase tracking-widest text-primary flex items-center gap-2">
            <Edit className="w-5 h-5" />
            Configuración de Sección
        </h2>
      </div>
      <div className="p-4 sm:p-8 bg-card/50">
        {getActiveContent()}
      </div>
    </div>
  );
};

export default CostSheetForm;
