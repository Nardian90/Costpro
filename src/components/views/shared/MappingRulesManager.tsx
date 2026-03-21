'use client';
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/dexie';
import { MappingRule, TargetField, TransformType, ReportType } from '@/core/mapping/mapping.types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Edit2, Save, ListFilter, AlertCircle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const TARGET_FIELDS: TargetField[] = ['amount', 'date', 'reference', 'transaction_id', 'account', 'counterparty', 'customer_name', 'customer_id', 'currency', 'channel', 'status', 'description', 'bank', 'branch'];
const TRANSFORM_TYPES: TransformType[] = ['trim', 'toUpperCase', 'toLowerCase', 'toNumber', 'parseDate', 'removeSymbols', 'extractDigits', 'currencyNormalize'];

export function MappingRulesManager({ reportType }: { reportType?: ReportType }) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<MappingRule>>({ reportType: reportType || 'TRANSFER', active: true, priority: 1 });
  const rules = useLiveQuery(() => reportType ? (db as any).mapping_rules.where('reportType').equals(reportType).toArray() : (db as any).mapping_rules.toArray(), [reportType]);

  const handleSave = async () => {
    if (!formData.sourceColumn || !formData.targetField) return toast.error('Faltan campos');
    const rule: MappingRule = {
      id: editingId || uuidv4(),
      reportType: formData.reportType as ReportType,
      sourceColumn: formData.sourceColumn,
      targetField: formData.targetField as TargetField,
      transform: formData.transform as TransformType,
      active: formData.active ?? true,
      priority: formData.priority || 1,
      createdAt: Date.now(), updatedAt: Date.now()
    };
    await (db as any).mapping_rules.put(rule);
    setEditingId(null); setIsAdding(false); setFormData({ reportType: reportType || 'TRANSFER', active: true, priority: 1 });
    toast.success('Guardado');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2"><ListFilter className="w-5 h-5 text-primary" /> Mapping Engine</h2>
        <Button onClick={() => setIsAdding(true)} disabled={isAdding || !!editingId} className="rounded-2xl font-black text-[10px] gap-2"><Plus className="w-4 h-4" /> Nueva Regla</Button>
      </div>
      {(isAdding || editingId) && (
        <Card className="p-6 bg-primary/5 border-2 border-primary/20 rounded-[2rem]">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Input value={formData.sourceColumn || ''} onChange={(e) => setFormData({ ...formData, sourceColumn: e.target.value })} placeholder="Columna Origen" />
            <Select value={formData.targetField} onValueChange={(val) => setFormData({ ...formData, targetField: val as TargetField })}>
              <SelectTrigger><SelectValue placeholder="Destino" /></SelectTrigger>
              <SelectContent>{TARGET_FIELDS.map(f => <SelectItem key={f} value={f}>{f.toUpperCase()}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={formData.transform || 'none'} onValueChange={(val) => setFormData({ ...formData, transform: val === 'none' ? undefined : val as TransformType })}>
              <SelectTrigger><SelectValue placeholder="Transformación" /></SelectTrigger>
              <SelectContent><SelectItem value="none">NINGUNA</SelectItem>{TRANSFORM_TYPES.map(t => <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" onClick={() => { setEditingId(null); setIsAdding(false); }}>Cancelar</Button>
            <Button onClick={handleSave} className="gap-2"><Save className="w-4 h-4" /> Guardar</Button>
          </div>
        </Card>
      )}
      <Table>
        <TableHeader><TableRow><TableHead>Reporte</TableHead><TableHead>Origen</TableHead><TableHead>Destino</TableHead><TableHead>Estado</TableHead><TableHead></TableHead></TableRow></TableHeader>
        <TableBody>
          {rules?.map((r: MappingRule) => (
            <TableRow key={r.id}>
              <TableCell><Badge variant="outline">{r.reportType}</Badge></TableCell>
              <TableCell className="font-bold">{r.sourceColumn}</TableCell>
              <TableCell><code className="text-blue-500">{r.targetField}</code></TableCell>
              <TableCell><Badge className={r.active ? "bg-green-500" : "bg-muted"}>{r.active ? 'ON' : 'OFF'}</Badge></TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="icon" onClick={() => { setEditingId(r.id); setFormData(r); }}><Edit2 className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon" onClick={() => (db as any).mapping_rules.delete(r.id)}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
