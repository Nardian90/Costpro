'use client';

import React, { useState } from 'react';
import * as XLSX from "xlsx";
import { FileSpreadsheet } from "lucide-react";
import { AddTransactionModal } from './AddTransactionModal';
import { BaseModal } from "@/components/ui/BaseModal";
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type BankTransaction, type Product, type ReconciliationLine } from '@/lib/dexie';
import { MatchingTracePopover } from "./MatchingTracePopover";
import { ActionBadges } from "./ActionBadges";
import { ObservationsModal } from "./ObservationsModal";
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
import { Eye, Trash2, Search, RotateCcw, LayoutGrid, List, CheckCircle2, XCircle, Info, Wand2, Zap, Target, Plus, HelpCircle, Info as InfoIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { generateHash } from '@/lib/ipv/engine';
import { logAction } from '@/lib/ipv/audit';
import { v4 as uuidv4 } from 'uuid';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface TransactionTableProps {
    transactions: BankTransaction[];
    kpiFilter: 'ALL' | 'CUADRADAS' | 'EN_PROCESO' | 'PENDIENTES';
    txReconciliationTotals: Record<string, number>;
    onReconcile: (tx: BankTransaction) => void;
    onForceMatch?: (tx: BankTransaction) => void;
    onAnalyzeAll?: () => void;
}

export function TransactionTable({ transactions, kpiFilter, txReconciliationTotals, onReconcile, onForceMatch, onAnalyzeAll }: TransactionTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);
  const [layoutMode, setLayoutMode] = useState<'table' | 'cards'>('table');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'Cr' | 'Db'>('ALL');
  const [isAddTxOpen, setIsAddTxOpen] = useState(false);
  const [obsModal, setObsModal] = useState({ open: false, observations: "", reference: "" });

  const filtered = (transactions || []).filter(tx => {
    const matchesSearch = !searchTerm ||
        tx.referencia_origen.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (tx.observaciones || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesExclusion = showExcluded || !tx.excluido;
    const matchesType = typeFilter === 'ALL' || tx.tipo === typeFilter;

    let matchesKpi = true;
    if (kpiFilter !== 'ALL') {
        const total = txReconciliationTotals[tx.referencia_origen] || 0;
        const target = tx.importe_venta_cents || tx.importe_cents;
        const isSquare = Math.abs(total - target) < 0.001;

        if (kpiFilter === 'CUADRADAS') matchesKpi = isSquare;
        else if (kpiFilter === 'EN_PROCESO') matchesKpi = total > 0 && !isSquare;
        else if (kpiFilter === 'PENDIENTES') matchesKpi = total === 0;
    }

    return matchesSearch && matchesExclusion && matchesType && matchesKpi;
  });

  const handleDelete = async (ref: string) => {
    if (confirm('¿Seguro que desea eliminar esta transacción y sus líneas de conciliación?')) {
        const tx = transactions.find(t => t.referencia_origen === ref);
        await logAction({ type: "DELETE", entity: "TRANSACTION", before: tx });
        await db.bank_statements.delete(ref);
        await db.reconciliation_lines.where('transaction_ref').equals(ref).delete();
        toast.success('Transacción eliminada');
    }
  };

  const handleResetReconciliation = async (tx: BankTransaction) => {
    if (confirm('¿Resetear la conciliación de esta transacción?')) {
        const before = { ...tx };
        await db.reconciliation_lines.where('transaction_ref').equals(tx.referencia_origen).delete();
        await db.bank_statements.update(tx.referencia_origen, {
            estado_conciliacion: 'PENDIENTE',
            applied_rules: [],
            fail_reason: undefined
        });
        await logAction({ type: "UPDATE", entity: "TRANSACTION", before, after: { ...tx, estado_conciliacion: 'PENDIENTE' }, context: { action: "RESET" } });
        toast.success('Conciliación reseteada');
    }
  };

  const bulkResetMatching = async () => {
    if (confirm('¿Resetear TODAS las conciliaciones automáticas?')) {
        await db.reconciliation_lines.where('origen_dato').equals('AUTO_MATCH').delete();
        await db.bank_statements.toCollection().modify({
            estado_conciliacion: 'PENDIENTE',
            applied_rules: [],
            fail_reason: undefined
        });
        await logAction({ type: "RESET", entity: "ALL_MATCHING" });
        toast.success('Todas las conciliaciones reseteadas');
    }
  };

  const toggleExclusion = async (tx: BankTransaction, val: boolean) => {
    await db.bank_statements.update(tx.referencia_origen, { excluido: !val });
    await logAction({ type: "UPDATE", entity: "TRANSACTION", before: tx, after: { ...tx, excluido: !val }, context: { action: "TOGGLE_EXCLUSION" } });
  };

  const exportToExcel = () => {
    const data = filtered.map(tx => ({
        Fecha: formatDate(tx.fecha),
        Referencia: tx.referencia_origen,
        Observaciones: tx.observaciones,
        Neto: tx.importe_cents,
        Comision: tx.comision_cents || 0,
        Venta: tx.importe_venta_cents || tx.importe_cents,
        Diferencia: (tx.importe_venta_cents || tx.importe_cents) - (txReconciliationTotals[tx.referencia_origen] || 0),
        Tipo: tx.tipo,
        Estado: tx.estado_conciliacion
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transacciones");
    XLSX.writeFile(wb, `transacciones_ipv_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const getStatusBadge = (tx: BankTransaction, diff: number, matchedTotal: number) => {
    const badge = (
        <Badge
          className={cn(
            "text-[9px] font-black uppercase px-1.5 h-4",
            tx.estado_conciliacion === 'COMPLETO' ? "bg-green-500 hover:bg-green-600" :
            matchedTotal > 0 ? "bg-yellow-500 hover:bg-yellow-600" : "bg-orange-500 hover:bg-orange-600"
          )}
        >
          {tx.estado_conciliacion === 'COMPLETO' ? 'Cuadrado' :
           matchedTotal > 0 ? 'Parcial' : 'Pendiente'}
        </Badge>
    );

    return (
      <MatchingTracePopover transactionId={tx.referencia_origen}>
        {badge}
      </MatchingTracePopover>
    );
  };

  return (
    <>
      <div className="space-y-4">
        <div className="p-3 sm:p-4 flex flex-col lg:flex-row gap-3 bg-background/50 border-b items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar referencia u observaciones..." className="pl-10 h-10 text-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2 w-full lg:w-auto justify-end items-center">
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} className="h-10 text-xs font-bold border rounded-md bg-background px-3 outline-none">
                  <option value="ALL">TODOS LOS TIPOS</option>
                  <option value="Cr">SOLO CRÉDITOS (INGRESOS)</option>
                  <option value="Db">SOLO DÉBITOS (GASTOS)</option>
              </select>
              <div className="flex items-center gap-4 bg-muted/30 px-3 py-1.5 rounded-xl border border-border/50">
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-full transition-colors ${showExcluded ? 'bg-primary/10 border border-primary/20' : 'bg-muted'}`}>
                      <Switch id="show-excluded" checked={showExcluded} onCheckedChange={setShowExcluded} className="scale-75" />
                      <Label htmlFor="show-excluded" className={`text-xs font-black uppercase cursor-pointer tracking-tighter ${showExcluded ? 'text-primary' : 'text-muted-foreground'}`}>{showExcluded ? 'Mostrando Excluidos' : 'Ocultando Excluidos'}</Label>
                  </div>
                  <div className="h-4 w-px bg-border mx-1" />
                  <div className="flex gap-1 items-center">
                      <Button variant="ghost" size="sm" onClick={bulkResetMatching} className="h-7 text-xs font-black uppercase text-orange-600 hover:bg-orange-500/10"><RotateCcw className="w-3 h-3 mr-1" /> Reset</Button>
                      <Button variant="ghost" size="sm" onClick={onAnalyzeAll} className="h-7 text-xs font-black uppercase text-primary hover:bg-primary/10"><Wand2 className="w-3 h-3 mr-1" /> Analizar todo</Button>
                  </div>
                  <Button variant="outline" size="sm" onClick={exportToExcel} className="h-7 text-xs font-black uppercase text-green-600 border-green-200 hover:bg-green-50"><FileSpreadsheet className="w-3 h-3 mr-1" /> Excel</Button>
              </div>
              <Button variant="default" size="sm" onClick={() => setIsAddTxOpen(true)} className="h-10 px-4 neu-btn-primary text-xs font-black uppercase italic"><Plus className="w-4 h-4 mr-2" /> Nueva Transacción</Button>
              <div className="flex bg-muted/50 p-1 rounded-lg border">
                  <Button variant={layoutMode === 'table' ? 'secondary' : 'ghost'} size="icon" onClick={() => setLayoutMode('table')} className="h-8 w-8 rounded-md"><List className="w-4 h-4" /></Button>
                  <Button variant={layoutMode === 'cards' ? 'secondary' : 'ghost'} size="icon" onClick={() => setLayoutMode('cards')} className="h-8 w-8 rounded-md"><LayoutGrid className="w-4 h-4" /></Button>
              </div>
          </div>
        </div>

        {layoutMode === 'table' ? (
          <div className="transaction-table-wrapper overflow-x-auto">
            <Table className="transaction-table">
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30 border-b-2">
                  <TableHead className="w-[40px] text-center"><InfoIcon className="w-3 h-3 mx-auto opacity-20" /></TableHead>
                  <TableHead className="sticky-column-1">Fecha</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead className="max-w-md">Observaciones</TableHead>
                  <TableHead className="text-right">Neto</TableHead>
                  <TableHead className="text-right">Comis.</TableHead>
                  <TableHead className="text-right">Venta</TableHead>
                  <TableHead className="text-right">Diferencia</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Indicadores</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={12} className="h-32 text-center text-muted-foreground font-bold uppercase tracking-widest opacity-40">No hay transacciones para mostrar</TableCell></TableRow>
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
                        diff={(tx.importe_venta_cents || tx.importe_cents) - (txReconciliationTotals[tx.referencia_origen] || 0)}
                        onForceMatchInternal={onForceMatch}
                        onViewObservations={() => setObsModal({ open: true, observations: tx.observaciones || "", reference: tx.referencia_origen })}
                      />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4">
              {filtered.map(tx => (
                  <TransactionCard
                    key={tx.referencia_origen}
                    tx={tx}
                    matchedTotal={txReconciliationTotals[tx.referencia_origen] || 0}
                    onView={() => onReconcile(tx)}
                    onReset={() => handleResetReconciliation(tx)}
                    onDelete={() => handleDelete(tx.referencia_origen)}
                    diff={(tx.importe_venta_cents || tx.importe_cents) - (txReconciliationTotals[tx.referencia_origen] || 0)}
                    getStatusBadge={getStatusBadge}
                  />
              ))}
          </div>
        )}

        <div className="flex justify-between items-center p-4 border-t bg-muted/10">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Mostrando {filtered.length} de {transactions.length} transacciones</p>
            <Button variant="ghost" size="sm" onClick={() => setHelpOpen(true)} className="h-8 text-xs font-black uppercase"><HelpCircle className="w-4 h-4 mr-2" /> Guía de Uso</Button>
        </div>
      </div>

      <AddTransactionModal open={isAddTxOpen} onOpenChange={setIsAddTxOpen} />
      <ObservationsModal open={obsModal.open} onOpenChange={(val) => setObsModal({ ...obsModal, open: val })} observations={obsModal.observations} reference={obsModal.reference} />

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
            <DialogContent className="max-w-2xl">
                <DialogHeader><DialogTitle className="text-2xl font-black uppercase italic tracking-tighter">Guía de Conciliación Bancaria</DialogTitle></DialogHeader>
                <div className="space-y-6 pt-4"><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><HelpItem title="Fecha" desc="Fecha de la operación." /><HelpItem title="Ref_Origen" desc="Identificador único del banco." /><HelpItem title="Ref_Corriente" desc="Referencia corta." /><HelpItem title="Importe" desc="Monto con decimales." /><HelpItem title="Tipo" desc="'Cr' para Ingresos y 'Db' para Gastos." /><HelpItem title="Observaciones" desc="Detalle del banco." /></div></div>
            </DialogContent>
        </Dialog>
    </>
  );
}

function HelpItem({ title, desc }: { title: string, desc: string }) {
    return (<div className="space-y-1"><p className="text-sm font-black text-primary uppercase tracking-tighter">{title}</p><p className="text-xs text-muted-foreground leading-relaxed font-medium">{desc}</p></div>);
}

const TransactionRow = React.memo(({ tx, matchedTotal, onView, onReset, onDelete, onToggleExclusion, getStatusBadge, diff, onForceMatchInternal, onViewObservations }: any) => {
    return (
        <TableRow className={`${tx.excluido ? 'opacity-40 grayscale bg-muted\/20' : ''} transition-colors`}>
          <TableCell className="text-center"><Checkbox checked={!tx.excluido} onCheckedChange={onToggleExclusion} className="translate-y-0.5" /></TableCell>
          <TableCell className="sticky-column-1 font-medium whitespace-nowrap text-xs">{formatDate(tx.fecha)}</TableCell>
          <TableCell className="font-mono text-xs max-w-[120px] truncate">{tx.referencia_origen}</TableCell>
          <TableCell className="text-xs max-w-[150px]">
    <div className="flex items-center gap-2 group">
    <div className="truncate font-medium cursor-pointer flex-1" onClick={onViewObservations} title={tx.observaciones}>
      {tx.observaciones || "Sin observaciones"}
    </div>
    <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={onViewObservations}>
      <InfoIcon className="w-3 h-3 text-primary" />
    </Button>
  </div>
    {tx.fail_reason && tx.estado_conciliacion !== 'COMPLETO' && (
        <div className="text-[10px] text-red-500 font-bold uppercase mt-1 leading-tight animate-pulse whitespace-normal break-words">
            ⚠️ {tx.fail_reason}
        </div>
    )}
            {tx.estado_conciliacion !== "COMPLETO" && onForceMatchInternal && (
                <Button variant="link" className="h-4 p-0 text-[10px] text-primary font-black uppercase tracking-tighter" onClick={() => onForceMatchInternal(tx)}>
                    Analizar fallo
                </Button>
            )}
</TableCell>
          <TableCell className="text-right font-bold text-xs text-muted-foreground">{formatCurrency(tx.importe_cents)}</TableCell>
          <TableCell className="text-right font-bold text-xs text-red-500">{formatCurrency(tx.comision_cents || 0)}</TableCell>
          <TableCell className="text-right font-black text-sm text-primary">{formatCurrency(tx.importe_venta_cents || tx.importe_cents)}</TableCell>
          <TableCell className={`text-right font-bold text-sm ${Math.abs(diff) < 0.001 ? 'text-green-500' : (diff < -0.001 ? 'text-red-500' : 'text-orange-500')}`}>{formatCurrency(diff)}</TableCell>
          <TableCell><span className={`text-xs font-black ${tx.tipo === 'Cr' ? 'text-green-500' : 'text-red-500'}`}>{tx.tipo}</span></TableCell>
          <TableCell>{getStatusBadge(tx, diff, matchedTotal)}</TableCell>
          <TableCell><ActionBadges appliedRules={tx.applied_rules} /></TableCell>
          <TableCell className="text-right"><div className="flex justify-end gap-1 items-center"><Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary\/10 hover:text-primary" onClick={onView}><Eye className="w-4 h-4" /></Button>{matchedTotal > 0 && (<Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-orange-500\/10 hover:text-orange-500" onClick={onReset}><RotateCcw className="w-4 h-4" /></Button>)}<Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-destructive\/10 hover:text-destructive" onClick={onDelete}><Trash2 className="w-4 h-4" /></Button></div></TableCell>
        </TableRow>
    );
});
TransactionRow.displayName = 'TransactionRow';

function TransactionCard({ tx, matchedTotal, onView, onReset, onDelete, diff, getStatusBadge }: any) {
    return (
        <Card className="p-4 space-y-4 shadow-lg hover:border-primary/30 transition-all border-2 border-transparent bg-card/50 backdrop-blur-md rounded-3xl">
            <div className="flex justify-between items-start">
                <div className="space-y-1">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{formatDate(tx.fecha)}</p>
                    <p className="font-mono text-xs font-bold text-primary">{tx.referencia_origen.slice(-12)}</p>
                </div>
                {getStatusBadge(tx, diff, matchedTotal)}
            </div>

            <div className="space-y-2">
                <p className="text-xs font-medium text-foreground line-clamp-2 min-h-[2.5rem]">{tx.observaciones || "Sin observaciones"}</p>
                <div className="grid grid-cols-2 gap-4 py-3 border-y border-border/50">
                    <div>
                        <p className="text-[9px] font-black text-muted-foreground uppercase">Importe Venta</p>
                        <p className="font-black text-sm text-primary">{formatCurrency(tx.importe_venta_cents || tx.importe_cents)}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-[9px] font-black text-muted-foreground uppercase">Diferencia</p>
                        <p className={`font-black text-sm ${Math.abs(diff) < 0.001 ? 'text-green-500' : 'text-red-500'}`}>{formatCurrency(diff)}</p>
                    </div>
                </div>
            </div>

            <div className="flex justify-between items-center gap-2">
                <div className="flex gap-1">
                    <ActionBadges appliedRules={tx.applied_rules} />
                </div>
                <div className="flex gap-2">
                    <Button variant="ghost" size="icon" className="h-10 w-10 hover:bg-primary/10 rounded-xl" onClick={onView}><Eye className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-10 w-10 hover:bg-destructive/10 rounded-xl text-destructive" onClick={onDelete}><Trash2 className="w-4 h-4" /></Button>
                </div>
            </div>
        </Card>
    );
}

function QuickAdjustPopover({ transaction, remaining, onSuccess }: { transaction: BankTransaction, remaining: number, onSuccess: () => void }) {
    const lines = useLiveQuery(() => db.reconciliation_lines.where('transaction_ref').equals(transaction.referencia_origen).toArray(), [transaction.referencia_origen]);
    const handleAdjust = async (line: any) => {
        const newTotalLine = line.importe_linea_cents + remaining;
        if (newTotalLine < 0) { toast.error('Precio negativo'); return; }
        const before = { ...line };
        await db.reconciliation_lines.update(line.id, {
            importe_linea_cents: newTotalLine,
            precio_unitario_cents: line.cantidad === 1 ? newTotalLine : line.precio_unitario_cents,
            cuadre_cents: (line.cuadre_cents || 0) + remaining
        });

        await logAction({ type: "UPDATE", entity: "RECONCILIATION_LINE", before, after: { ...line, importe_linea_cents: newTotalLine }, context: { action: "QUICK_ADJUST", transaction_ref: transaction.referencia_origen } });

        const txLines = await db.reconciliation_lines.where('transaction_ref').equals(transaction.referencia_origen).toArray();
        const newTotal = txLines.reduce((sum, l) => sum + l.importe_linea_cents, 0);
        const target = transaction.importe_venta_cents || transaction.importe_cents;
        await db.bank_statements.update(transaction.referencia_origen, { estado_conciliacion: Math.abs(newTotal - target) < 0.001 ? 'COMPLETO' : 'PARCIAL' });

        toast.success('Ajuste aplicado');
        onSuccess();
    };
    return (
        <Popover><PopoverTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-orange-600 hover:bg-orange-500/10"><Wand2 className="w-4 h-4" /></Button></PopoverTrigger>
            <PopoverContent className="w-64 p-3 shadow-2xl rounded-2xl border-primary/20" align="end">
                <div className="space-y-3"><div className="flex justify-between items-center border-b pb-2"><span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Ajuste Rápido</span><Badge variant="outline" className={`text-xs font-black ${remaining > 0 ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>{remaining > 0 ? `+${remaining}` : `${remaining}`}</Badge></div>
                    <div className="space-y-1 max-h-48 overflow-y-auto">{lines?.map(l => (<button key={l.id} className="w-full text-left p-2 hover:bg-primary/5 rounded-lg transition-all" onClick={() => handleAdjust(l)}><p className="text-xs font-black uppercase truncate">{l.product_cod}</p><div className="flex justify-between items-center"><span className="text-xs text-muted-foreground">{l.cantidad} ud</span><Zap className="w-3 h-3 text-primary" /></div></button>))}</div>
                </div>
            </PopoverContent></Popover>
    );
}

function ForceMatchPopover({ transaction }: { transaction: BankTransaction }) {
    const products = useLiveQuery(() => db.products.toArray().then(prods => prods.filter(p => p.activo)));
    const [searchTerm, setSearchTerm] = useState('');
    const filtered = React.useMemo(() => {
        if (!products) return [];
        return products.filter(p => p.descripcion.toLowerCase().includes(searchTerm.toLowerCase()) || p.cod.toLowerCase().includes(searchTerm.toLowerCase())).sort((a, b) => a.prioridad_algoritmo - b.prioridad_algoritmo);
    }, [products, searchTerm]);
    const handleForceMatch = async (product: any) => {
        const target = transaction.importe_venta_cents || transaction.importe_cents;
        const qty = Math.floor(target / product.precio_cents);
        if (qty <= 0) { toast.error('El importe es menor al precio del producto'); return; }
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
        await logAction({ type: "CREATE", entity: "RECONCILIATION_LINE", after: newLine, context: { action: "FORCE_MATCH", transaction_ref: transaction.referencia_origen } });

        await db.bank_statements.update(transaction.referencia_origen, { estado_conciliacion: Math.abs(remaining) < 0.001 ? 'COMPLETO' : 'PARCIAL' });

        toast.success('Producto asignado exitosamente');
    };
    return (
        <Popover><PopoverTrigger asChild><Button variant="ghost" size="sm" className="h-7 text-xs font-black uppercase text-primary hover:bg-primary/10"><Target className="w-3 h-3 mr-1" /> Forzar</Button></PopoverTrigger>
            <PopoverContent className="w-72 p-0 shadow-2xl rounded-2xl border-primary/20" align="end">
                <div className="p-3 border-b bg-muted/20"><div className="relative"><Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" /><Input placeholder="Buscar producto..." className="pl-7 h-8 text-xs rounded-lg" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div></div>
                <ScrollArea className="h-64"><div className="p-1">{filtered.map(p => (<button key={p.cod} className="w-full text-left p-2 hover:bg-primary/5 rounded-lg transition-all flex justify-between items-center" onClick={() => handleForceMatch(p)}><div className="min-w-0 flex-1"><p className="text-xs font-black uppercase text-foreground truncate">{p.descripcion}</p><div className="flex gap-2"><span className="text-xs text-primary font-bold uppercase">${p.precio_cents}</span></div></div><Plus className="w-3 h-3 text-primary ml-2 shrink-0" /></button>))}</div></ScrollArea>
            </PopoverContent></Popover>
    );}
