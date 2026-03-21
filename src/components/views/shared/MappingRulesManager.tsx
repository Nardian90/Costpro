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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Edit2, Save, X, ListFilter, AlertCircle, RefreshCw } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props {
  reportType?: ReportType; // Si se provee, filtra por este tipo
  onClose?: () => void;
}

const TARGET_FIELDS: TargetField[] = [
  'amount', 'date', 'reference', 'transaction_id', 'account', 'counterparty',
  'customer_name', 'customer_id', 'currency', 'channel', 'status', 'description', 'bank', 'branch'
];

const TRANSFORM_TYPES: TransformType[] = [
  'trim', 'toUpperCase', 'toLowerCase', 'toNumber', 'parseDate', 'removeSymbols', 'extractDigits', 'currencyNormalize'
];

export function MappingRulesManager({ reportType, onClose }: Props) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<MappingRule>>({
    reportType: reportType || 'TRANSFER',
    active: true,
    priority: 1
  });

  const rules = useLiveQuery(
    () => {
      const q = (db as any).mapping_rules;
      return reportType ? q.where('reportType').equals(reportType).toArray() : q.toArray();
    },
    [reportType]
  );

  const handleSave = async () => {
    if (!formData.sourceColumn || !formData.targetField) {
      toast.error('Columna origen y campo destino son obligatorios');
      return;
    }

    try {
      const rule: MappingRule = {
        id: editingId || uuidv4(),
        reportType: formData.reportType as ReportType,
        sourceColumn: formData.sourceColumn,
        targetField: formData.targetField as TargetField,
        transform: formData.transform as TransformType,
        active: formData.active ?? true,
        priority: formData.priority || 1,
        createdAt: editingId ? (rules?.find(r => r.id === editingId)?.createdAt || Date.now()) : Date.now(),
        updatedAt: Date.now()
      };

      await (db as any).mapping_rules.put(rule);
      toast.success(editingId ? 'Regla actualizada' : 'Regla creada');
      setEditingId(null);
      setIsAdding(false);
      setFormData({ reportType: reportType || 'TRANSFER', active: true, priority: 1 });
    } catch (error: any) {
      toast.error('Error al guardar regla: ' + error.message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await (db as any).mapping_rules.delete(id);
      toast.success('Regla eliminada');
    } catch (error: any) {
      toast.error('Error al eliminar regla: ' + error.message);
    }
  };

  const startEdit = (rule: MappingRule) => {
    setEditingId(rule.id);
    setFormData(rule);
    setIsAdding(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
            <ListFilter className="w-5 h-5 text-primary" />
            Mapping Rules Engine
          </h2>
          <p className="text-xs text-muted-foreground font-medium italic">
            Configuración dinámica de mapeo de columnas para reportes.
          </p>
        </div>
        <Button
          onClick={() => setIsAdding(true)}
          disabled={isAdding || !!editingId}
          className="h-10 px-6 rounded-2xl font-black uppercase tracking-widest text-[10px] gap-2"
        >
          <Plus className="w-4 h-4" />
          Nueva Regla
        </Button>
      </div>

      {(isAdding || editingId) && (
        <Card className="p-6 bg-primary/5 border-2 border-primary/20 rounded-[2rem] animate-in slide-in-from-top duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Tipo de Reporte</Label>
              <Select
                value={formData.reportType}
                onValueChange={(val) => setFormData({ ...formData, reportType: val as ReportType })}
                disabled={!!reportType}
              >
                <SelectTrigger className="h-10 rounded-xl font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TRANSFER">TRANSFERENCIAS</SelectItem>
                  <SelectItem value="QR">PAGO QR</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Columna Origen (Excel/CSV)</Label>
              <Input
                value={formData.sourceColumn || ''}
                onChange={(e) => setFormData({ ...formData, sourceColumn: e.target.value })}
                placeholder="Ej: importe, monto..."
                className="h-10 rounded-xl font-bold"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Campo Destino (Sistema)</Label>
              <Select
                value={formData.targetField}
                onValueChange={(val) => setFormData({ ...formData, targetField: val as TargetField })}
              >
                <SelectTrigger className="h-10 rounded-xl font-bold">
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {TARGET_FIELDS.map(f => (
                    <SelectItem key={f} value={f}>{f.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Transformación</Label>
              <Select
                value={formData.transform || 'none'}
                onValueChange={(val) => setFormData({ ...formData, transform: val === 'none' ? undefined : val as TransformType })}
              >
                <SelectTrigger className="h-10 rounded-xl font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">SIN TRANSFORMACIÓN</SelectItem>
                  {TRANSFORM_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button variant="ghost" onClick={() => { setEditingId(null); setIsAdding(false); }} className="h-10 px-4 rounded-xl font-black uppercase tracking-widest text-[10px]">
              Cancelar
            </Button>
            <Button onClick={handleSave} className="h-10 px-8 rounded-xl font-black uppercase tracking-widest text-[10px] gap-2">
              <Save className="w-4 h-4" />
              {editingId ? 'Actualizar' : 'Guardar Regla'}
            </Button>
          </div>
        </Card>
      )}

      <div className="rounded-[2rem] border border-border/50 overflow-hidden shadow-xl bg-card/50 backdrop-blur-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="text-[10px] font-black uppercase">Reporte</TableHead>
              <TableHead className="text-[10px] font-black uppercase">Columna Origen</TableHead>
              <TableHead className="text-[10px] font-black uppercase">Campo Destino</TableHead>
              <TableHead className="text-[10px] font-black uppercase">Transformación</TableHead>
              <TableHead className="text-[10px] font-black uppercase">Estado</TableHead>
              <TableHead className="text-right text-[10px] font-black uppercase">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground italic font-medium">
                  No hay reglas configuradas para este reporte.
                </TableCell>
              </TableRow>
            ) : (
              rules?.map(rule => (
                <TableRow key={rule.id} className={cn("group transition-colors", !rule.active && "opacity-50")}>
                  <TableCell>
                    <Badge variant="outline" className="text-[9px] font-black bg-primary/5 text-primary border-primary/20">
                      {rule.reportType}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-bold text-xs">{rule.sourceColumn}</TableCell>
                  <TableCell>
                    <code className="text-[10px] font-black text-blue-500 bg-blue-500/5 px-2 py-0.5 rounded-md border border-blue-500/10">
                      {rule.targetField}
                    </code>
                  </TableCell>
                  <TableCell>
                    {rule.transform ? (
                      <Badge variant="secondary" className="text-[9px] font-bold">
                        {rule.transform}
                      </Badge>
                    ) : (
                      <span className="text-[9px] italic opacity-40">ninguna</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={cn("text-[8px] font-black", rule.active ? "bg-green-500" : "bg-muted")}>
                      {rule.active ? 'ACTIVA' : 'INACTIVA'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" onClick={() => startEdit(rule)} className="h-8 w-8 text-primary hover:bg-primary/10">
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(rule.id)} className="h-8 w-8 text-destructive hover:bg-destructive/10">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="p-4 bg-muted/20 rounded-2xl flex items-center gap-3">
        <AlertCircle className="w-4 h-4 text-muted-foreground shrink-0" />
        <p className="text-[10px] font-medium text-muted-foreground italic">
          Las reglas se aplican en orden de prioridad. Si hay conflicto, prevalece la regla más reciente.
        </p>
      </div>
    </div>
  );
}
