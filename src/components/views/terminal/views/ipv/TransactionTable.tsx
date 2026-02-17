'use client';

import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type BankTransaction, type Product } from '@/lib/dexie';
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
import { Eye, Trash2, Search, RotateCcw, LayoutGrid, List, CheckCircle2, XCircle, HelpCircle, Wand2, Zap, Target, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { generateHash } from '@/lib/ipv/engine';
import { v4 as uuidv4 } from 'uuid';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { formatCurrency, formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
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
    onReconcile: (tx: BankTransaction) => void;
    onForceMatch?: (tx: BankTransaction) => void;
}

export function TransactionTable({ transactions, kpiFilter, txReconciliationTotals, onReconcile, onForceMatch }: TransactionTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
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
        return <Badge className="bg-slate-400/10 text-slate-500 border-slate-500/20 text-xs font-black uppercase tracking-tighter">NO PROCESAR</Badge>;
    }
    if (matchedTotal > 0 && Math.abs(diffCents) < 0.001) {
      return <Badge className="bg-green-500 text-white border-green-600 shadow-sm text-xs font-black uppercase tracking-tighter">CUADRADA</Badge>;
    }
    if (matchedTotal > 0 && Math.abs(diffCents) >= 0.001) {
      return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20 text-xs font-black uppercase tracking-tighter">EN PROCESO</Badge>;
    }
    return <Badge className="bg-gray-500/10 text-gray-500 border-gray-500/20 text-xs font-black uppercase tracking-tighter">PENDIENTE</Badge>;
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
                    <Label htmlFor="show-excluded" className={`text-xs font-black uppercase cursor-pointer tracking-tighter ${showExcluded ? 'text-primary' : 'text-muted-foreground'}`}>
                        {showExcluded ? 'Mostrando Excluidos' : 'Ocultando Excluidos'}
                    </Label>
                </div>

                <div className="h-4 w-px bg-border mx-1" />

                <div className="flex gap-1 items-center">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={bulkResetMatching}
                                className="h-7 text-xs font-black uppercase text-orange-600 hover:bg-orange-500/10"
                            >
                                <RotateCcw className="w-3 h-3 mr-1" /> Reset
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs font-medium p-3 bg-popover text-popover-foreground border shadow-xl">
                            Elimina todas las líneas de reconciliación de las transacciones visibles actualmente. ¡Acción destructiva!
                        </TooltipContent>
                    </Tooltip>

                    <BulkForceMatchPopover
                        transactions={filtered}
                    />
                </div>
            </div>

            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setHelpOpen(true)}
                        className="h-10 w-10 text-primary border-primary/20 hover:bg-primary/5"
                    >
                        <HelpCircle className="w-4 h-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs font-medium p-3 bg-popover text-popover-foreground border shadow-xl">
                    Ver ayuda detallada sobre las columnas y el proceso de importación de extractos.
                </TooltipContent>
            </Tooltip>

            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setLayoutMode('table')}
                        className={`h-10 w-10 ${layoutMode === 'table' ? 'bg-primary/10 text-primary border-primary/20' : ''}`}
                    >
                        <List className="w-4 h-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs font-medium p-3 bg-popover text-popover-foreground border shadow-xl">
                    Vista de tabla detallada.
                </TooltipContent>
            </Tooltip>

            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setLayoutMode('cards')}
                        className={`h-10 w-10 ${layoutMode === 'cards' ? 'bg-primary/10 text-primary border-primary/20' : ''}`}
                    >
                        <LayoutGrid className="w-4 h-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs font-medium p-3 bg-popover text-popover-foreground border shadow-xl">
                    Vista de tarjetas optimizada para móviles.
                </TooltipContent>
            </Tooltip>
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
                      <Tooltip>
                          <TooltipTrigger>
                              <Info className="w-3 h-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent className="text-xs max-w-xs p-3">
                              <p className="font-black mb-1 text-primary">Estados de Conciliación:</p>
                              <ul className="space-y-1">
                                  <li><strong>CUADRADA:</strong> Diferencia es $0.00. Listo para el IPV.</li>
                                  <li><strong>EN PROCESO:</strong> Tiene productos pero aún no cuadra.</li>
                                  <li><strong>PENDIENTE:</strong> Sin productos asociados.</li>
                              </ul>
                          </TooltipContent>
                      </Tooltip>
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
                        onView={() => onReconcile(tx)}
                        onForceMatch={() => onForceMatch?.(tx)}
                        onReset={() => handleResetReconciliation(tx)}
                        onDelete={() => handleDelete(tx.referencia_origen)}
                        onToggleExclusion={(val: boolean) => toggleExclusion(tx, val)}
                        getStatusBadge={getStatusBadge}
                        diff={ (tx.importe_venta_cents || tx.importe_cents) - (txReconciliationTotals[tx.referencia_origen] || 0)}
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
                    const targetAmount = tx.importe_venta_cents || tx.importe_cents;
                    const diff = targetAmount - matchedTotal;
                    const isEnProceso = matchedTotal > 0 && Math.abs(diff) >= 0.001;

                    return (
                        <Card key={tx.id} className="p-4 space-y-4 border-none shadow-md bg-card/50 backdrop-blur-sm relative overflow-hidden">
                            {onForceMatch && !tx.excluido && tx.estado_conciliacion !== 'COMPLETO' && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute top-2 right-2 h-8 w-8 text-primary hover:bg-primary/10 z-10"
                                    onClick={() => onForceMatch(tx)}
                                >
                                    <Zap className="w-4 h-4 fill-primary/20" />
                                </Button>
                            )}
                            <div className={`absolute top-0 left-0 w-1 h-full ${tx.tipo === 'Cr' ? 'bg-green-500' : 'bg-red-500'}`} />

                            <div className="flex justify-between items-start">
                                <div className="flex items-start gap-3">
                                    <Checkbox
                                        checked={!tx.excluido}
                                        onCheckedChange={(val: boolean) => toggleExclusion(tx, val)}
                                        className="mt-1"
                                    />
                                    <div>
                                        <p className="text-xs font-black text-muted-foreground uppercase">{formatDate(tx.fecha)}</p>
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
                                    <p className="text-xs font-bold text-muted-foreground uppercase">Neto</p>
                                    <p className="text-xs font-bold">{formatCurrency(tx.importe_cents)}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-muted-foreground uppercase">Comis.</p>
                                    <p className="text-xs font-bold text-red-500">{formatCurrency(tx.comision_cents || 0)}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-bold text-primary uppercase">Objetivo</p>
                                    <p className="text-sm font-black">{formatCurrency(targetAmount)}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 pt-2">
                                <div className="text-right">
                                    <p className="text-xs font-bold text-muted-foreground uppercase">Diferencia</p>
                                    <p className={`text-lg font-black ${Math.abs(diff) < 0.001 ? 'text-green-500' : (diff < -0.001 ? 'text-red-500' : 'text-orange-500')}`}>
                                        {formatCurrency(diff)}
                                    </p>
                                </div>
                            </div>

                            <div className="flex justify-between items-center pt-2">
                                <span className={`text-xs font-black uppercase tracking-widest ${tx.tipo === 'Cr' ? 'text-green-500/80' : 'text-red-500/80'}`}>
                                    {tx.tipo === 'Cr' ? 'Crédito (Ingreso)' : 'Débito (Gasto)'}
                                </span>
                                <div className="flex gap-2 items-center">
                                    {tx.estado_conciliacion === 'PENDIENTE' && (
                                        <ForceMatchPopover
                                            transaction={tx}
                                        />
                                    )}
                                    {isEnProceso && (
                                        <div className="flex gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-11 px-3 text-xs font-bold uppercase gap-2 text-green-600 border-green-200 hover:bg-green-50"
                                                onClick={async () => {
                                                    const lines = await db.reconciliation_lines.where('transaction_ref').equals(tx.referencia_origen).toArray();
                                                    if (lines.length > 0) {
                                                        const line = lines[0];
                                                        const newTotalLine = line.importe_linea_cents + diff;
                                                        await db.reconciliation_lines.update(line.id, {
                                                            importe_linea_cents: newTotalLine,
                                                            precio_unitario_cents: line.cantidad === 1 ? newTotalLine : line.precio_unitario_cents,
                                                            cuadre_cents: (line.cuadre_cents || 0) + diff
                                                        });
                                                        await db.bank_statements.update(tx.referencia_origen, {
                                                            estado_conciliacion: 'COMPLETO'
                                                        });
                                                        toast.success('Ajuste automático aplicado (Ajustar Todo)');
                                                    }
                                                }}
                                            >
                                                <CheckCircle2 className="w-3 h-3" />
                                                Ajustar Todo
                                            </Button>
                                            <QuickAdjustPopover
                                                transaction={tx}
                                                remaining={diff}
                                                onSuccess={() => {}}
                                            />
                                        </div>
                                    )}
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-11 px-4 text-xs font-bold uppercase gap-2 neu-btn"
                                        onClick={() => onReconcile(tx)}
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
                    <p className="text-xs text-muted-foreground leading-relaxed">
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

function ForceMatchPopover({ transaction }: { transaction: BankTransaction }) {
    const products = useLiveQuery(() => db.products.toArray().then(prods => prods.filter(p => p.activo)));
    const [searchTerm, setSearchTerm] = useState('');

    const filtered = React.useMemo(() => {
        if (!products) return [];
        return products.filter(p =>
            p.descripcion.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.cod.toLowerCase().includes(searchTerm.toLowerCase())
        ).sort((a, b) => (b.stock_inicial_manual || 0) - (a.stock_inicial_manual || 0));
    }, [products, searchTerm]);

    const handleForceMatch = async (product: any) => {
        const target = transaction.importe_venta_cents || transaction.importe_cents;
        const qty = Math.floor(target / product.precio_cents);

        if (qty <= 0) {
            toast.error('El precio del producto es mayor que el importe de la transacción');
            return;
        }

        const importe = product.precio_cents * qty;
        const remaining = target - importe;

        const newLine: any = {
            id: uuidv4(),
            transaction_ref: transaction.referencia_origen,
            fecha_operacion: transaction.fecha,
            ingreso_banco_cents: transaction.importe_cents,
            venta_real_calculada_cents: importe,
            comision_banco_cents: transaction.comision_cents || 0,
            product_cod: product.cod,
            product_um: product.um,
            cantidad: qty,
            precio_unitario_cents: product.precio_cents,
            importe_linea_cents: importe,
            cuadre_cents: 0,
            clasificacion: transaction.tipo === 'Cr' ? 'Transferencia' : 'Efectivo',
            origen_dato: 'MANUAL_USER',
            reconciliation_hash: await generateHash(`${transaction.referencia_origen}-${product.cod}-${qty}-${Date.now()}`),
            created_at: new Date().toISOString()
        };

        await db.reconciliation_lines.add(newLine);
        await db.bank_statements.update(transaction.referencia_origen, {
            estado_conciliacion: Math.abs(remaining) < 0.001 ? 'COMPLETO' : 'PARCIAL'
        });

        toast.success(`Forzado Matching: ${qty}x ${product.descripcion}. Restante: ${remaining} cts`);
    };

    return (
        <Popover>
            <Tooltip>
                <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-blue-600 hover:bg-blue-500/10"
                        >
                            <Target className="w-4 h-4" />
                        </Button>
                    </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs font-medium p-3 bg-popover text-popover-foreground border shadow-xl">
                    Forzar Matching: Selecciona un producto para cubrir lo máximo posible de esta transacción.
                </TooltipContent>
            </Tooltip>
            <PopoverContent className="w-72 p-0 shadow-2xl rounded-2xl border-primary/20" align="end">
                <div className="p-3 border-b bg-muted/20">
                    <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">Forzar Matching</p>
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                        <Input
                            placeholder="Buscar producto..."
                            className="pl-7 h-8 text-xs rounded-lg"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
                <ScrollArea className="h-64">
                    <div className="p-1">
                        {filtered.map(p => (
                            <button
                                key={p.cod}
                                className="w-full text-left p-2 hover:bg-primary/5 rounded-lg border border-transparent hover:border-primary/20 transition-all flex justify-between items-center group"
                                onClick={() => handleForceMatch(p)}
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-black uppercase text-foreground truncate">{p.descripcion}</p>
                                    <div className="flex gap-2">
                                        <span className="text-xs text-muted-foreground font-bold uppercase">Stock: {p.stock_inicial_manual}</span>
                                        <span className="text-xs text-primary font-bold uppercase">${p.precio_cents}</span>
                                    </div>
                                </div>
                                <Plus className="w-3 h-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0" />
                            </button>
                        ))}
                    </div>
                </ScrollArea>
            </PopoverContent>
        </Popover>
    );
}

function BulkForceMatchPopover({ transactions }: { transactions: BankTransaction[] }) {
    const products = useLiveQuery(() => db.products.toArray().then(prods => prods.filter(p => p.activo)));
    const reconciliationLines = useLiveQuery(() => db.reconciliation_lines.toArray());
    const rules = useLiveQuery(() => db.matching_rules.toArray());
    const [searchTerm, setSearchTerm] = useState('');

    const useStockLimit = rules?.some(r => r.tipo === 'STOCK_LIMIT' && r.activo);

    const currentStockMap = React.useMemo(() => {
        const map = new Map<string, number>();
        if (!products || !reconciliationLines) return map;
        products.forEach(p => {
            const sold = reconciliationLines
                .filter(l => l.product_cod === p.cod)
                .reduce((sum, l) => sum + l.cantidad, 0);
            map.set(p.cod, (p.stock_inicial_manual || 0) - sold);
        });
        return map;
    }, [products, reconciliationLines]);

    const filteredProducts = React.useMemo(() => {
        if (!products) return [];
        return products.filter(p =>
            p.descripcion.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.cod.toLowerCase().includes(searchTerm.toLowerCase())
        ).sort((a, b) => {
            const sA = currentStockMap.get(a.cod) || 0;
            const sB = currentStockMap.get(b.cod) || 0;
            return sB - sA;
        });
    }, [products, searchTerm, currentStockMap]);

    const handleBulkForceMatch = async (product: any) => {
        const pendings = transactions.filter(t => t.estado_conciliacion === 'PENDIENTE');
        if (pendings.length === 0) {
            toast.error('No hay transacciones pendientes en la vista actual');
            return;
        }

        const loadingToast = toast.loading(`Forzando matching para ${pendings.length} transacciones...`);

        let processedCount = 0;
        const localStockMap = new Map(currentStockMap);

        try {
            await db.transaction('rw', [db.reconciliation_lines, db.bank_statements], async () => {
                for (const tx of pendings) {
                    const target = tx.importe_venta_cents || tx.importe_cents;
                    let qty = Math.floor(target / product.precio_cents);

                    if (useStockLimit) {
                        const available = localStockMap.get(product.cod) || 0;
                        qty = Math.min(qty, available);
                    }

                    if (qty <= 0) continue;

                    const importe = product.precio_cents * qty;
                    const remaining = target - importe;

                    const newLine: any = {
                        id: uuidv4(),
                        transaction_ref: tx.referencia_origen,
                        fecha_operacion: tx.fecha,
                        ingreso_banco_cents: tx.importe_cents,
                        venta_real_calculada_cents: importe,
                        comision_banco_cents: tx.comision_cents || 0,
                        product_cod: product.cod,
                        product_um: product.um,
                        cantidad: qty,
                        precio_unitario_cents: product.precio_cents,
                        importe_linea_cents: importe,
                        cuadre_cents: 0,
                        clasificacion: tx.tipo === 'Cr' ? 'Transferencia' : 'Efectivo',
                        origen_dato: 'MANUAL_USER',
                        reconciliation_hash: await generateHash(`${tx.referencia_origen}-${product.cod}-${qty}-${Date.now()}`),
                        created_at: new Date().toISOString()
                    };

                    await db.reconciliation_lines.add(newLine);
                    await db.bank_statements.update(tx.referencia_origen, {
                        estado_conciliacion: Math.abs(remaining) < 0.001 ? 'COMPLETO' : 'PARCIAL'
                    });

                    localStockMap.set(product.cod, (localStockMap.get(product.cod) || 0) - qty);
                    processedCount++;
                }
            });

            toast.success(`Matching forzado en ${processedCount} transacciones con ${product.descripcion}`, { id: loadingToast });
        } catch (error) {
            console.error(error);
            toast.error('Error durante el proceso masivo', { id: loadingToast });
        }
    };

    return (
        <Popover>
            <Tooltip>
                <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs font-black uppercase text-blue-600 hover:bg-blue-500/10"
                        >
                            <Target className="w-3 h-3 mr-1" /> Forzar Matching
                        </Button>
                    </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs font-medium p-3 bg-popover text-popover-foreground border shadow-xl">
                    Forzar Matching (Masivo): Aplica un producto a TODAS las transacciones pendientes filtradas. Respeta existencias si el límite está activo.
                </TooltipContent>
            </Tooltip>
            <PopoverContent className="w-72 p-0 shadow-2xl rounded-2xl border-primary/20" align="end">
                <div className="p-3 border-b bg-muted/20">
                    <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">Forzar Matching Masivo</p>
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                        <Input
                            placeholder="Buscar producto..."
                            className="pl-7 h-8 text-xs rounded-lg"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
                <ScrollArea className="h-64">
                    <div className="p-1">
                        {filteredProducts.map(p => (
                            <button
                                key={p.cod}
                                className="w-full text-left p-2 hover:bg-primary/5 rounded-lg border border-transparent hover:border-primary/20 transition-all flex justify-between items-center group"
                                onClick={() => handleBulkForceMatch(p)}
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-black uppercase text-foreground truncate">{p.descripcion}</p>
                                    <div className="flex gap-2">
                                        <span className="text-xs text-muted-foreground font-bold uppercase">Stock: {currentStockMap.get(p.cod) || 0}</span>
                                        <span className="text-xs text-primary font-bold uppercase">${p.precio_cents}</span>
                                    </div>
                                </div>
                                <Plus className="w-3 h-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0" />
                            </button>
                        ))}
                    </div>
                </ScrollArea>
            </PopoverContent>
        </Popover>
    );
}

const TransactionRow = React.memo(({ tx, matchedTotal, onView, onReset, onDelete, onToggleExclusion, getStatusBadge, diff }: any) => {
    const targetAmount = tx.importe_venta_cents || tx.importe_cents;
    const isEnProceso = matchedTotal > 0 && Math.abs(diff) >= 0.001;
    const isPending = matchedTotal === 0;

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
          <TableCell className="font-mono text-xs max-w-[120px] truncate">{tx.referencia_origen}</TableCell>
          <TableCell className="text-xs max-w-[150px]">
            <div className="truncate" title={tx.observaciones}>
                {tx.observaciones}
            </div>
          </TableCell>
          <TableCell className="text-right font-bold text-xs text-muted-foreground">
            {formatCurrency(tx.importe_cents)}
          </TableCell>
          <TableCell className="text-right font-bold text-xs text-red-500">
            {formatCurrency(tx.comision_cents || 0)}
          </TableCell>
          <TableCell className="text-right font-black text-sm text-primary">
            {formatCurrency(targetAmount)}
          </TableCell>
          <TableCell className={`text-right font-bold text-sm ${Math.abs(diff) < 0.001 ? 'text-green-500' : (diff < -0.001 ? 'text-red-500' : 'text-orange-500')}`}>
            {formatCurrency(diff)}
          </TableCell>
          <TableCell>
            <span className={`text-xs font-black ${tx.tipo === 'Cr' ? 'text-green-500' : 'text-red-500'}`}>
                {tx.tipo}
            </span>
          </TableCell>
          <TableCell>{getStatusBadge(tx.estado_conciliacion, diff, matchedTotal)}</TableCell>
          <TableCell className="text-right">
            <div className="flex justify-end gap-1 items-center">
                {tx.estado_conciliacion === 'PENDIENTE' && (
                    <ForceMatchPopover
                        transaction={tx}
                    />
                )}
                {isEnProceso && (
                    <div className="flex gap-1">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-green-600 hover:bg-green-500/10"
                                    onClick={async () => {
                                        const lines = await db.reconciliation_lines.where('transaction_ref').equals(tx.referencia_origen).toArray();
                                        if (lines.length > 0) {
                                            const line = lines[0];
                                            const newTotalLine = line.importe_linea_cents + diff;
                                            await db.reconciliation_lines.update(line.id, {
                                                importe_linea_cents: newTotalLine,
                                                precio_unitario_cents: line.cantidad === 1 ? newTotalLine : line.precio_unitario_cents,
                                                cuadre_cents: (line.cuadre_cents || 0) + diff
                                            });
                                            await db.bank_statements.update(tx.referencia_origen, {
                                                estado_conciliacion: 'COMPLETO'
                                            });
                                            toast.success('Ajuste automático aplicado (Ajustar Todo)');
                                        }
                                    }}
                                >
                                    <CheckCircle2 className="w-4 h-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">Ajustar Todo (Cerrar transacción)</TooltipContent>
                        </Tooltip>
                        <QuickAdjustPopover
                            transaction={tx}
                            remaining={diff}
                            onSuccess={() => {}}
                        />
                    </div>
                )}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
                          onClick={onView}
                        >
                            <Eye className="w-4 h-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs font-medium p-3 bg-popover text-popover-foreground border shadow-xl">
                        Ver detalles y gestionar reconciliación manual.
                    </TooltipContent>
                </Tooltip>

                {matchedTotal > 0 && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 hover:bg-orange-500/10 hover:text-orange-500"
                                onClick={onReset}
                            >
                                <RotateCcw className="w-4 h-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs font-medium p-3 bg-popover text-popover-foreground border shadow-xl">
                            Reiniciar Conciliación: Borra los productos asociados a esta transacción.
                        </TooltipContent>
                    </Tooltip>
                )}

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                            onClick={onDelete}
                        >
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs font-medium p-3 bg-popover text-popover-foreground border shadow-xl">
                        Eliminar Transacción permanentemente.
                    </TooltipContent>
                </Tooltip>
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
            <Tooltip>
                <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-orange-600 hover:bg-orange-500/10 hover:text-orange-600"
                        >
                            <Wand2 className="w-4 h-4" />
                        </Button>
                    </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs font-medium p-3 bg-popover text-popover-foreground border shadow-xl">
                    Ajuste Rápido: Distribuye la diferencia restante como propina o descuento en un producto existente.
                </TooltipContent>
            </Tooltip>
            <PopoverContent className="w-64 p-3 shadow-2xl rounded-2xl border-primary/20" align="end">
                <div className="space-y-3">
                    <div className="flex justify-between items-center border-b pb-2">
                        <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Ajuste Rápido</span>
                        <Badge variant="outline" className={`text-xs font-black ${remaining > 0 ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                            {remaining > 0 ? `+${remaining} cts` : `${remaining} cts`}
                        </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground font-medium uppercase leading-tight">
                        Selecciona el producto al que aplicar el {remaining > 0 ? 'exceso (Propina)' : 'faltante (Descuento)'}:
                    </p>
                    <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                        {lines?.map(l => (
                            <button
                                key={l.id}
                                className="w-full text-left p-2 hover:bg-primary/5 rounded-lg border border-transparent hover:border-primary/20 transition-all group"
                                onClick={() => handleAdjust(l)}
                            >
                                <p className="text-xs font-black uppercase text-foreground truncate">{l.product_cod}</p>
                                <div className="flex justify-between items-center">
                                    <span className="text-xs text-muted-foreground">{l.cantidad} ud × {l.precio_unitario_cents}</span>
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
