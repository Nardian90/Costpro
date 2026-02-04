'use client';

import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type BankTransaction } from '@/lib/dexie';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Eye, Trash2, Search, RotateCcw, LayoutGrid, List, CheckCircle2, XCircle, HelpCircle, Wand2, Zap } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { formatCurrency, formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import { ManualReconciliationModal } from './ManualReconciliationModal';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Info } from 'lucide-react';

interface TransactionTableProps {
    transactions: BankTransaction[];
    kpiFilter: 'ALL' | 'CUADRADAS' | 'EN_PROCESO' | 'PENDIENTES';
    txReconciliationTotals: Record<string, number>;
}

export function TransactionTable({ transactions, kpiFilter, txReconciliationTotals }: TransactionTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTx, setSelectedTx] = useState<BankTransaction | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [layoutMode, setLayoutMode] = useState<'table' | 'cards'>('table');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'Cr' | 'Db'>('ALL');
  const [showExcluded, setShowExcluded] = useState(true);

  const filtered = React.useMemo(() => {
    return transactions.filter(t => {
        // Excluded Filter
        if (!showExcluded && t.excluido) return false;

        // Text Search
        const matchesSearch = t.referencia_origen.toLowerCase().includes(searchTerm.toLowerCase()) ||
                             t.observaciones.toLowerCase().includes(searchTerm.toLowerCase());

        // Type Filter
        const matchesType = typeFilter === 'ALL' || t.tipo === typeFilter;

        // KPI Filter
        const matched = txReconciliationTotals[t.referencia_origen] || 0;
        const target = t.importe_venta_cents || t.importe_cents;
        const diff = target - matched;

        let matchesKpi = true;
        if (t.excluido || t.estado_conciliacion === 'NO_PROCESAR') {
            // Excluded transactions only match 'ALL' filter
            matchesKpi = kpiFilter === 'ALL';
        } else {
            if (kpiFilter === 'CUADRADAS') {
                matchesKpi = matched > 0 && Math.abs(diff) < 0.001;
            } else if (kpiFilter === 'EN_PROCESO') {
                matchesKpi = matched > 0 && Math.abs(diff) >= 0.001;
            } else if (kpiFilter === 'PENDIENTES') {
                matchesKpi = matched === 0;
            }
        }

        return matchesSearch && matchesType && matchesKpi;
    });
  }, [transactions, searchTerm, typeFilter, kpiFilter, txReconciliationTotals]);

  const handleDelete = async (referencia: string) => {
    if (confirm('¿Eliminar esta transacción?')) {
      await db.bank_statements.delete(referencia);
    }
  };

  const handleResetReconciliation = async (tx: BankTransaction) => {
    if (confirm(`¿Reiniciar conciliación para ${tx.referencia_origen}? Se borrarán todos los productos asociados.`)) {
        await db.reconciliation_lines.where('transaction_ref').equals(tx.referencia_origen).delete();
        await db.bank_statements.update(tx.referencia_origen, {
            estado_conciliacion: 'PENDIENTE'
        });
    }
  };

  const handleUpdateCommission = async (tx: BankTransaction, newComision: number) => {
      const newImporteVenta = tx.importe_cents + newComision;
      await db.bank_statements.update(tx.referencia_origen, {
          comision_cents: newComision,
          importe_venta_cents: newImporteVenta,
          updated_at: new Date().toISOString()
      });
  };


  const toggleExclusion = async (tx: BankTransaction, forcedValue?: boolean) => {
      // Si forcedValue viene de Radix Checkbox, invertimos su lógica (Checked = !Excluido)
      const newValue = forcedValue !== undefined ? !forcedValue : !tx.excluido;

      await db.bank_statements.update(tx.referencia_origen, {
          excluido: newValue,
          estado_conciliacion: newValue ? 'NO_PROCESAR' : 'PENDIENTE',
          updated_at: new Date().toISOString()
      });
  };

  const bulkResetMatching = async () => {
    if (filtered.length === 0) return;
    if (confirm(`¿REINICIAR CONCILIACIÓN de ${filtered.length} transacciones visibles? Se borrarán todos los productos asociados.`)) {
        const ids = filtered.map(t => t.referencia_origen);

        // Ejecutar en una transacción de Dexie para asegurar consistencia
        await db.transaction('rw', [db.reconciliation_lines, db.bank_statements], async () => {
            await db.reconciliation_lines.where('transaction_ref').anyOf(ids).delete();
            await db.bank_statements.where('referencia_origen').anyOf(ids).modify({
                estado_conciliacion: 'PENDIENTE'
            });
        });
    }
  };

  const getStatusBadge = (status: string, diffCents: number, matchedTotal: number) => {
    if (status === 'NO_PROCESAR') {
        return <Badge className="bg-slate-400/10 text-slate-500 border-slate-500/20 text-[10px] font-black uppercase tracking-tighter">NO PROCESAR</Badge>;
    }
    if (matchedTotal > 0 && Math.abs(diffCents) < 0.001) {
      return <Badge className="bg-green-500 text-white border-green-600 shadow-sm text-[10px] font-black uppercase tracking-tighter">CUADRADA</Badge>;
    }
    if (matchedTotal > 0 && Math.abs(diffCents) >= 0.001) {
      return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20 text-[10px] font-black uppercase tracking-tighter">EN PROCESO</Badge>;
    }
    return <Badge className="bg-gray-500/10 text-gray-500 border-gray-500/20 text-[10px] font-black uppercase tracking-tighter">PENDIENTE</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="p-3 sm:p-4 flex flex-col lg:flex-row gap-3 bg-background/50 border-b items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar referencia u observaciones..."
            className="pl-10 h-10 text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2 w-full lg:w-auto justify-end items-center">
            <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as any)}
                className="h-10 text-xs font-bold border rounded-md bg-background px-3 outline-none"
            >
                <option value="ALL">TODOS LOS TIPOS</option>
                <option value="Cr">SOLO CRÉDITOS (INGRESOS)</option>
                <option value="Db">SOLO DÉBITOS (GASTOS)</option>
            </select>

            <div className="flex items-center gap-4 bg-muted/30 px-3 py-1.5 rounded-xl border border-border/50">
                <div className={`flex items-center gap-2 px-3 py-1 rounded-full transition-colors ${showExcluded ? 'bg-primary/10 border border-primary/20' : 'bg-muted'}`}>
                    <Switch
                        id="show-excluded"
                        checked={showExcluded}
                        onCheckedChange={setShowExcluded}
                        className="scale-75"
                    />
                    <Label htmlFor="show-excluded" className={`text-[9px] font-black uppercase cursor-pointer tracking-tighter ${showExcluded ? 'text-primary' : 'text-muted-foreground'}`}>
                        {showExcluded ? 'Mostrando Excluidos' : 'Ocultando Excluidos'}
                    </Label>
                </div>

                <div className="h-4 w-px bg-border mx-1" />

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={bulkResetMatching}
                    className="h-7 text-[10px] font-black uppercase text-orange-600 hover:bg-orange-500/10"
                >
                    <RotateCcw className="w-3 h-3 mr-1" /> Reset Matching
                </Button>
            </div>

            <Button
                variant="outline"
                size="icon"
                onClick={() => setHelpOpen(true)}
                className="h-10 w-10 text-primary border-primary/20 hover:bg-primary/5"
            >
                <HelpCircle className="w-4 h-4" />
            </Button>

            <Button
                variant="outline"
                size="icon"
                onClick={() => setLayoutMode('table')}
                className={`h-10 w-10 ${layoutMode === 'table' ? 'bg-primary/10 text-primary border-primary/20' : ''}`}
            >
                <List className="w-4 h-4" />
            </Button>
            <Button
                variant="outline"
                size="icon"
                onClick={() => setLayoutMode('cards')}
                className={`h-10 w-10 ${layoutMode === 'cards' ? 'bg-primary/10 text-primary border-primary/20' : ''}`}
            >
                <LayoutGrid className="w-4 h-4" />
            </Button>
        </div>
      </div>

      {layoutMode === 'table' ? (
        <div className="table-scroll-wrapper">
          <Table className="data-table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px] text-center">
                    <Info className="w-3 h-3 mx-auto opacity-20" />
                </TableHead>
                <TableHead className="sticky-column-1">Fecha</TableHead>
                <TableHead>Referencia</TableHead>
                <TableHead className="max-w-md">Observaciones</TableHead>
                <TableHead className="text-right">Neto</TableHead>
                <TableHead className="text-right">Comis.</TableHead>
                <TableHead className="text-right">Venta</TableHead>
                <TableHead className="text-right">Diferencia</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>
                  <div className="flex items-center gap-1">
                      Estado
                      <TooltipProvider>
                          <Tooltip>
                              <TooltipTrigger>
                                  <Info className="w-3 h-3 text-muted-foreground" />
                              </TooltipTrigger>
                              <TooltipContent className="text-[10px] max-w-xs p-3">
                                  <p className="font-black mb-1 text-primary">Estados de Conciliación:</p>
                                  <ul className="space-y-1">
                                      <li><strong>CUADRADA:</strong> Diferencia es $0.00. Listo para el IPV.</li>
                                      <li><strong>EN PROCESO:</strong> Tiene productos pero aún no cuadra.</li>
                                      <li><strong>PENDIENTE:</strong> Sin productos asociados.</li>
                                  </ul>
                              </TooltipContent>
                          </Tooltip>
                      </TooltipProvider>
                  </div>
                </TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="h-24 text-center text-muted-foreground font-medium">
                    No se encontraron transacciones que coincidan con los filtros.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((tx) => (
                    <TransactionRow
                        key={tx.referencia_origen}
                        tx={tx}
                        matchedTotal={txReconciliationTotals[tx.referencia_origen] || 0}
                        onView={() => {
                            setSelectedTx(tx);
                            setModalOpen(true);
                        }}
                        onReset={() => handleResetReconciliation(tx)}
                        onUpdateCommission={handleUpdateCommission}
                        onDelete={() => handleDelete(tx.referencia_origen)}
                        onToggleExclusion={(val: boolean) => toggleExclusion(tx, val)}
                        getStatusBadge={getStatusBadge}
                    />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 p-4">
            {filtered.length === 0 ? (
                <div className="h-24 flex items-center justify-center text-muted-foreground">
                    No se encontraron transacciones.
                </div>
            ) : (
                filtered.map((tx) => {
                    const matchedTotal = txReconciliationTotals[tx.referencia_origen] || 0;
                    const targetAmount = tx.importe_cents;
                    const diff = targetAmount - matchedTotal;
                    const isEnProceso = matchedTotal > 0 && Math.abs(diff) >= 0.001;

                    return (
                        <Card key={tx.id} className="p-4 space-y-4 border-none shadow-md bg-card/50 backdrop-blur-sm relative overflow-hidden">
                            <div className={`absolute top-0 left-0 w-1 h-full ${tx.tipo === 'Cr' ? 'bg-green-500' : 'bg-red-500'}`} />

                            <div className="flex justify-between items-start">
                                <div className="flex items-start gap-3">
                                    <Checkbox
                                        checked={!tx.excluido}
                                        onCheckedChange={(val: boolean) => toggleExclusion(tx, val)}
                                        className="mt-1"
                                    />
                                    <div>
                                        <p className="text-[10px] font-black text-muted-foreground uppercase">{formatDate(tx.fecha)}</p>
                                        <p className="text-xs font-mono font-bold text-primary">{tx.referencia_origen}</p>
                                    </div>
                                </div>
                                {getStatusBadge(tx.estado_conciliacion, diff, matchedTotal)}
                            </div>

                            <p className="text-xs text-muted-foreground line-clamp-2" title={tx.observaciones}>
                                {tx.observaciones}
                            </p>

                            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50">
                                <div>
                                    <p className="text-[8px] font-bold text-muted-foreground uppercase">Neto</p>
                                    <p className="text-xs font-bold">{formatCurrency(tx.importe_cents)}</p>
                                </div>
                                <div>
                                    <p className="text-[8px] font-bold text-muted-foreground uppercase">Comis.</p>
                                    <Input
                                        type="number"
                                        className="h-6 w-20 text-[10px] bg-transparent border-none font-bold text-red-500 p-0"
                                        value={tx.comision_cents || 0}
                                        onChange={(e) => handleUpdateCommission(tx, parseFloat(e.target.value) || 0)}
                                    />
                                </div>
                                <div className="text-right">
                                    <p className="text-[8px] font-bold text-primary uppercase">Objetivo</p>
                                    <p className="text-sm font-black">{formatCurrency(targetAmount)}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 pt-2">
                                <div className="text-right">
                                    <p className="text-[9px] font-bold text-muted-foreground uppercase">Diferencia</p>
                                    <p className={`text-lg font-black ${Math.abs(diff) < 0.001 ? 'text-green-500' : (diff < -0.001 ? 'text-red-500' : 'text-orange-500')}`}>
                                        {formatCurrency(diff)}
                                    </p>
                                </div>
                            </div>

                            <div className="flex justify-between items-center pt-2">
                                <span className={`text-[10px] font-black uppercase tracking-widest ${tx.tipo === 'Cr' ? 'text-green-500/80' : 'text-red-500/80'}`}>
                                    {tx.tipo === 'Cr' ? 'Crédito (Ingreso)' : 'Débito (Gasto)'}
                                </span>
                                <div className="flex gap-2 items-center">
                                    {isEnProceso && (
                                        <QuickAdjustPopover
                                            transaction={tx}
                                            remaining={diff}
                                            onSuccess={() => {}}
                                        />
                                    )}
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-11 px-4 text-xs font-bold uppercase gap-2 neu-btn"
                                        onClick={() => {
                                            setSelectedTx(tx);
                                            setModalOpen(true);
                                        }}
                                    >
                                        <Eye className="w-3 h-3" />
                                        Ver / Cuadrar
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-11 w-11 text-destructive border-destructive/20 hover:bg-destructive/10"
                                        onClick={() => handleDelete(tx.referencia_origen)}
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    );
                })
            )}
        </div>
      )}

      <ManualReconciliationModal
        transaction={selectedTx}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />

      <ColumnHelpModal open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}

function ColumnHelpModal({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <div className="flex items-center gap-2 text-primary border-b pb-4">
                        <HelpCircle className="w-6 h-6" />
                        <DialogTitle className="text-xl font-black uppercase tracking-tight">Guía de Columnas (Estado de Cuenta)</DialogTitle>
                    </div>
                </DialogHeader>
            <div className="space-y-6 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <HelpItem
                        title="Fecha"
                        desc="Fecha de la operación (ej: 17/10/2025). El sistema la normaliza automáticamente al formato YYYY-MM-DD."
                    />
                    <HelpItem
                        title="Ref_Origen"
                        desc="Identificador único del banco (Número de transferencia o ID de mensaje). Es vital para la idempotencia."
                    />
                    <HelpItem
                        title="Ref_Corriente"
                        desc="Referencia corta para visualización rápida en tablas y búsqueda."
                    />
                    <HelpItem
                        title="Importe"
                        desc="Monto con decimales (ej: 1,500.00). Los créditos son positivos y los débitos negativos en el balance."
                    />
                    <HelpItem
                        title="Tipo"
                        desc="'Cr' para Créditos (Ingresos) y 'Db' para Débitos (Gastos/Comisiones)."
                    />
                    <HelpItem
                        title="Observaciones"
                        desc="Detalle del banco. Aquí el motor busca códigos de producto (ej: 'COD:1') para el matching automático."
                    />
                </div>

                <div className="p-4 bg-primary/5 rounded-2xl border border-primary/20">
                    <p className="text-xs font-bold text-primary mb-2 uppercase tracking-widest">💡 Tip Pro:</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Si exportas tus movimientos desde BANDEC en formato .txt, el sistema los reconocerá y parseará automáticamente sin necesidad de usar la plantilla CSV.
                    </p>
                </div>
            </div>
            </DialogContent>
        </Dialog>
    );
}

function HelpItem({ title, desc }: { title: string, desc: string }) {
    return (
        <div className="space-y-1">
            <p className="text-sm font-black text-primary uppercase tracking-tighter">{title}</p>
            <p className="text-xs text-muted-foreground leading-relaxed font-medium">{desc}</p>
        </div>
    );
}

const TransactionRow = React.memo(({ tx, matchedTotal, onView, onReset, onUpdateCommission, onDelete, onToggleExclusion, getStatusBadge }: any) => {
    const targetAmount = tx.importe_venta_cents || tx.importe_cents;
    const diff = targetAmount - matchedTotal;
    const isEnProceso = matchedTotal > 0 && Math.abs(diff) >= 0.001;

    return (
        <TableRow className={`${tx.excluido ? 'opacity-40 grayscale bg-muted/20' : ''} transition-colors`}>
          <TableCell className="text-center">
              <Checkbox
                  checked={!tx.excluido}
                  onCheckedChange={onToggleExclusion}
                  className="translate-y-0.5"
              />
          </TableCell>
          <TableCell className="sticky-column-1 font-medium whitespace-nowrap text-xs">
            {formatDate(tx.fecha)}
          </TableCell>
          <TableCell className="font-mono text-[10px] max-w-[120px] truncate">{tx.referencia_origen}</TableCell>
          <TableCell className="text-[10px] max-w-[150px]">
            <div className="truncate" title={tx.observaciones}>
                {tx.observaciones}
            </div>
          </TableCell>
          <TableCell className="text-right font-bold text-xs text-muted-foreground">
            {formatCurrency(tx.importe_cents)}
          </TableCell>
          <TableCell className="text-right">
            <Input
                type="number"
                className="w-20 h-8 text-right bg-transparent border-none font-bold text-xs text-red-500 focus-visible:ring-1 focus-visible:ring-primary rounded p-1"
                value={tx.comision_cents || 0}
                onChange={(e) => onUpdateCommission(tx, parseFloat(e.target.value) || 0)}
            />
          </TableCell>
          <TableCell className="text-right font-black text-sm text-primary">
            {formatCurrency(targetAmount)}
          </TableCell>
          <TableCell className={`text-right font-bold text-sm ${Math.abs(diff) < 0.001 ? 'text-green-500' : (diff < -0.001 ? 'text-red-500' : 'text-orange-500')}`}>
            {formatCurrency(diff)}
          </TableCell>
          <TableCell>
            <span className={`text-[10px] font-black ${tx.tipo === 'Cr' ? 'text-green-500' : 'text-red-500'}`}>
                {tx.tipo}
            </span>
          </TableCell>
          <TableCell>{getStatusBadge(tx.estado_conciliacion, diff, matchedTotal)}</TableCell>
          <TableCell className="text-right">
            <div className="flex justify-end gap-1 items-center">
                {isEnProceso && (
                    <QuickAdjustPopover
                        transaction={tx}
                        remaining={diff}
                        onSuccess={() => {}}
                    />
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
                  onClick={onView}
                >
                    <Eye className="w-4 h-4" />
                </Button>
                {matchedTotal > 0 && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:bg-orange-500/10 hover:text-orange-500"
                        onClick={onReset}
                        title="Reiniciar Conciliación"
                    >
                        <RotateCcw className="w-4 h-4" />
                    </Button>
                )}
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                    onClick={onDelete}
                >
                    <Trash2 className="w-4 h-4" />
                </Button>
            </div>
          </TableCell>
        </TableRow>
    );
});

TransactionRow.displayName = 'TransactionRow';

function QuickAdjustPopover({ transaction, remaining, onSuccess }: { transaction: BankTransaction, remaining: number, onSuccess: () => void }) {
    const lines = useLiveQuery(
        () => db.reconciliation_lines.where('transaction_ref').equals(transaction.referencia_origen).toArray(),
        [transaction.referencia_origen]
    );

    const handleAdjust = async (line: any) => {
        const newTotalLine = line.importe_linea_cents + remaining;
        if (newTotalLine < 0) {
            toast.error('El ajuste resultaría en un precio negativo');
            return;
        }

        await db.reconciliation_lines.update(line.id, {
            importe_linea_cents: newTotalLine,
            precio_unitario_cents: line.cantidad === 1 ? newTotalLine : line.precio_unitario_cents,
            cuadre_cents: (line.cuadre_cents || 0) + remaining
        });

        const txLines = await db.reconciliation_lines.where('transaction_ref').equals(transaction.referencia_origen).toArray();
        const newTotal = txLines.reduce((sum, l) => sum + l.importe_linea_cents, 0);
        const target = transaction.importe_venta_cents || transaction.importe_cents;
        const newStatus = Math.abs(newTotal - target) < 0.001 ? 'COMPLETO' : 'PARCIAL';

        await db.bank_statements.update(transaction.referencia_origen, {
            estado_conciliacion: newStatus
        });

        toast.success('Ajuste aplicado correctamente');
        onSuccess();
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-orange-600 hover:bg-orange-500/10 hover:text-orange-600"
                    title="Ajuste Rápido (Cuadrar diferencia)"
                >
                    <Wand2 className="w-4 h-4" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3 shadow-2xl rounded-2xl border-primary/20" align="end">
                <div className="space-y-3">
                    <div className="flex justify-between items-center border-b pb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Ajuste Rápido</span>
                        <Badge variant="outline" className={`text-[10px] font-black ${remaining > 0 ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                            {remaining > 0 ? `+${remaining} cts` : `${remaining} cts`}
                        </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground font-medium uppercase leading-tight">
                        Selecciona el producto al que aplicar el {remaining > 0 ? 'exceso (Propina)' : 'faltante (Descuento)'}:
                    </p>
                    <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                        {lines?.map(l => (
                            <button
                                key={l.id}
                                className="w-full text-left p-2 hover:bg-primary/5 rounded-lg border border-transparent hover:border-primary/20 transition-all group"
                                onClick={() => handleAdjust(l)}
                            >
                                <p className="text-[10px] font-black uppercase text-foreground truncate">{l.product_cod}</p>
                                <div className="flex justify-between items-center">
                                    <span className="text-[9px] text-muted-foreground">{l.cantidad} ud × {l.precio_unitario_cents}</span>
                                    <Zap className="w-3 h-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
