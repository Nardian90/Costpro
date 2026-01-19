
'use client';

import React from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '../ui/button';
import { Trash2 } from 'lucide-react';

interface CostSheetFormProps {
  activeSection: string;
}

const CostSheetForm: React.FC<CostSheetFormProps> = ({ activeSection }) => {
  const { data, updateValue, addRow, removeRow } = useCostSheetStore();

  const handleInputChange = (path: (string | number)[], value: any) => {
    // Check if the value should be a number
    const isNumeric = typeof value === 'string' && /^-?\d*\.?\d*$/.test(value) && value !== '';
    updateValue(path, isNumeric ? parseFloat(value) : value);
  };

  const renderHeaderForm = () => {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
            <Label htmlFor="header-code">Code</Label>
            <Input id="header-code" value={data.header.code} onChange={(e) => handleInputChange(['header', 'code'], e.target.value)} />
        </div>
        <div>
            <Label htmlFor="header-name">Name</Label>
            <Input id="header-name" value={data.header.name} onChange={(e) => handleInputChange(['header', 'name'], e.target.value)} />
        </div>
        <div>
            <Label htmlFor="header-date">Date</Label>
            <Input id="header-date" type="date" value={data.header.date} onChange={(e) => handleInputChange(['header', 'date'], e.target.value)} />
        </div>
        <div>
            <Label htmlFor="header-unit">Unit</Label>
            <Input id="header-unit" value={data.header.unit} onChange={(e) => handleInputChange(['header', 'unit'], e.target.value)} />
        </div>
        <div>
            <Label htmlFor="header-quantity">Quantity</Label>
            <Input id="header-quantity" type="number" value={data.header.quantity} onChange={(e) => handleInputChange(['header', 'quantity'], e.target.value)} />
        </div>
        <div>
            <Label htmlFor="header-currency">Currency</Label>
            <Input id="header-currency" value={data.header.currency} onChange={(e) => handleInputChange(['header', 'currency'], e.target.value)} />
        </div>
        <div>
            <Label htmlFor="header-category">Category</Label>
            <Input id="header-category" value={data.header.category} onChange={(e) => handleInputChange(['header', 'category'], e.target.value)} />
        </div>
        <div>
            <Label htmlFor="header-type">Type</Label>
            <Input id="header-type" value={data.header.type} onChange={(e) => handleInputChange(['header', 'type'], e.target.value)} />
        </div>
      </div>
    );
  };

 const renderSignatureForm = () => {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(data.signature).map(([key, value]) => (
          <div key={key}>
            <Label htmlFor={`signature-${key}`} className="capitalize">{key.replace('_', ' ')}</Label>
            <Input
              id={`signature-${key}`}
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
      <div>
        {section.rows.map((row: any, rowIndex: number) =>
          row.formula ? null : (
            <div key={row.id} className="mb-4">
              <Label htmlFor={`section-${section.id}-${rowIndex}`}>{row.label}</Label>
              <Input
                id={`section-${section.id}-${rowIndex}`}
                type="number"
                value={row.value}
                onChange={(e) => handleInputChange(['sections', data.sections.indexOf(section), 'rows', rowIndex, 'value'], e.target.value)}
              />
            </div>
          )
        )}
      </div>
    );
  };

  const renderAnnexForm = () => {
    const annex = data.annexes.find((a: any) => a.id === activeSection);
    if (!annex) return null;

    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {annex.columns.map((col: any) => (
                <TableHead key={col.key}>{col.label}</TableHead>
              ))}
               <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {annex.data.map((row: any, rowIndex: number) => (
              <TableRow key={rowIndex}>
                {annex.columns.map((col: any) => (
                  <TableCell key={col.key}>
                    {col.formula ? (
                      <span>Calculated</span> // Placeholder for calculated values
                    ) : (
                      <Input
                        type={typeof row[col.key] === 'number' ? 'number' : 'text'}
                        value={row[col.key]}
                        onChange={(e) => handleInputChange(['annexes', data.annexes.indexOf(annex), 'data', rowIndex, col.key], e.target.value)}
                      />
                    )}
                  </TableCell>
                ))}
                 <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => removeRow(annex.id, rowIndex)}>
                        <Trash2 className="h-4 w-4" />
                    </Button>
                 </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
         <Button onClick={() => addRow(annex.id)} className="mt-4">Add Row</Button>
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
    <Card>
      <CardHeader>
        <CardTitle>Edit Section</CardTitle>
      </CardHeader>
      <CardContent>
        {getActiveContent()}
      </CardContent>
    </Card>
  );
};

export default CostSheetForm;
