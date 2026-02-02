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
import { Eye, Trash2, Search, RotateCcw, LayoutGrid, List, CheckCircle2, XCircle, HelpCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { formatCurrency, formatDate } from '@/lib/utils';
import { ManualReconciliationModal } from './ManualReconciliationModal';
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
        if (kpiFilter === 'CUADRADAS') {
            matchesKpi = matched > 0 && Math.abs(diff) < 0.001;
        } else if (kpiFilter === 'EN_PROCESO') {
            matchesKpi = matched > 0 && Math.abs(diff) >= 0.001;
        } else if (kpiFilter === 'PENDIENTES') {
            matchesKpi = matched === 0;
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

  const toggleExclusion = async (tx: BankTransaction) => {
      await db.bank_statements.update(tx.referencia_origen, {
          excluido: !tx.excluido
      });
  };

  const bulkResetMatching = async () => {
    if (confirm('¿REINICIAR CONCILIACIÓN de todas las transacciones visibles? Se borrarán los productos asociados.')) {
        const ids = filtered.map(t => t.referencia_origen);
        await db.reconciliation_lines.where('transaction_ref').anyOf(ids).delete();
        await db.bank_statements.where('referencia_origen').anyOf(ids).modify({
            estado_conciliacion: 'PENDIENTE'
        });
    }
  };

  const getStatusBadge = (status: string, diffCents: number, matchedTotal: number) => {
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
                <div className="flex items-center gap-2">
                    <Switch
                        id="show-excluded"
                        checked={showExcluded}
                        onCheckedChange={setShowExcluded}
                    />
                    <Label htmlFor="show-excluded" className="text-[10px] font-black uppercase cursor-pointer">
                        Ver Excluidos
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
                <TableHead className="text-right">Importe</TableHead>
                <TableHead className="text-right text-orange-600">Comisión</TableHead>
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
                        key={tx.id}
                        tx={tx}
                        matchedTotal={txReconciliationTotals[tx.referencia_origen] || 0}
                        onView={() => {
                            setSelectedTx(tx);
                            setModalOpen(true);
                        }}
                        onReset={() => handleResetReconciliation(tx)}
                        onDelete={() => handleDelete(tx.referencia_origen)}
                        onToggleExclusion={() => toggleExclusion(tx)}
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
                    const targetAmount = tx.importe_venta_cents ?? tx.importe_cents;
                    const diff = targetAmount - matchedTotal;

                    return (
                        <Card key={tx.id} className="p-4 space-y-4 border-none shadow-md bg-card/50 backdrop-blur-sm relative overflow-hidden">
                            <div className={`absolute top-0 left-0 w-1 h-full ${tx.tipo === 'Cr' ? 'bg-green-500' : 'bg-red-500'}`} />

                            <div className="flex justify-between items-start">
                                <div className="flex items-start gap-3">
                                    <Checkbox
                                        checked={!tx.excluido}
                                        onCheckedChange={() => toggleExclusion(tx)}
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
                                    <p className="text-[8px] font-bold text-muted-foreground uppercase">Importe</p>
                                    <p className="text-sm font-bold">{formatCurrency(tx.importe_cents)}</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-[8px] font-bold text-orange-500 uppercase">Comisión</p>
                                    <p className="text-sm font-bold text-orange-500">{formatCurrency((tx.comision_cents || 0))}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[8px] font-bold text-primary uppercase">Total Venta</p>
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
                                <div className="flex gap-2">
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

const TransactionRow = React.memo(({ tx, matchedTotal, onView, onReset, onDelete, onToggleExclusion, getStatusBadge }: any) => {
    const targetAmount = tx.importe_venta_cents ?? tx.importe_cents;
    const diff = targetAmount - matchedTotal;

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
          <TableCell className="font-mono text-[10px]">{tx.referencia_origen}</TableCell>
          <TableCell className="text-[10px] truncate max-w-[200px]" title={tx.observaciones}>
            {tx.observaciones}
          </TableCell>
          <TableCell className="text-right font-medium text-muted-foreground text-xs">
            {formatCurrency(tx.importe_cents)}
          </TableCell>
          <TableCell className="text-right font-bold text-orange-500 text-xs">
            {formatCurrency((tx.comision_cents || 0))}
          </TableCell>
          <TableCell className="text-right font-black text-sm">
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
            <div className="flex justify-end gap-1">
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
