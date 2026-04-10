'use client';
import { parseTransactionMetadata } from '@/lib/ipv/metadata-parser';
import React, { useState } from 'react';
import * as XLSX from "xlsx";
import { FileSpreadsheet, List, LayoutGrid, Info, Search, RotateCcw, Wand2, Plus, Eye, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { AddTransactionModal } from './AddTransactionModal';
import { BaseModal } from "@/components/ui/BaseModal";
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type BankTransaction } from '@/lib/dexie';
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
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { formatCurrencyCents, formatDate, cn } from '@/lib/utils';
import { toast } from 'sonner';

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
  const [layoutMode, setLayoutMode] = useState<'table' | 'cards'>('table');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'Cr' | 'Db'>('ALL');
  const [showExcluded, setShowExcluded] = useState(true);
  const [isAddTxOpen, setIsAddTxOpen] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [obsModal, setObsModal] = useState<{ open: boolean; observations: string; reference: string }>({ open: false, observations: "", reference: "" });

  const toggleExpand = (id: string) => setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));

  const [confirmation, setConfirmation] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'default' | 'destructive';
  }>({
    open: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const askConfirmation = (title: string, message: string, onConfirm: () => void, variant: 'default' | 'destructive' = 'default') => {
    setConfirmation({ open: true, title, message, onConfirm, variant });
  };

  const filtered = React.useMemo(() => {
    return transactions.filter(t => {
        if (!showExcluded && t.excluido) return false;
        const matchesSearch = t.referencia_origen.toLowerCase().includes(searchTerm.toLowerCase()) || t.observaciones.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesType = typeFilter === 'ALL' || t.tipo === typeFilter;

        const matched = txReconciliationTotals[t.referencia_origen] || 0;
        const target = t.importe_venta_cents || t.importe_cents;
        const diff = target - matched;

        let matchesKpi = true;
        if (t.excluido || t.estado_conciliacion === 'NO_PROCESAR') {
            matchesKpi = kpiFilter === 'ALL';
        } else {
            if (kpiFilter === 'CUADRADAS') matchesKpi = matched > 0 && Math.abs(diff) < 0.001;
            else if (kpiFilter === 'EN_PROCESO') matchesKpi = matched > 0 && Math.abs(diff) >= 0.001;
            else if (kpiFilter === 'PENDIENTES') matchesKpi = matched === 0;
        }
        return matchesSearch && matchesType && matchesKpi;
    });
  }, [transactions, searchTerm, typeFilter, kpiFilter, txReconciliationTotals]);

  const handleDelete = async (referencia: string) => {
    askConfirmation('Confirmar Acción', '¿Eliminar esta transacción?', async () => {
      await db.bank_statements.delete(referencia);
      toast.success('Transacción eliminada');
    }, 'destructive');
  };

  const handleResetReconciliation = async (tx: BankTransaction) => {
    askConfirmation('Confirmar Acción', `¿Reiniciar conciliación para ${tx.referencia_origen}? Se borrarán todos los productos asociados.`, async () => {
        await db.reconciliation_lines.where('transaction_ref').equals(tx.referencia_origen).delete();
        await db.bank_statements.update(tx.referencia_origen, { estado_conciliacion: 'PENDIENTE' });
        toast.success('Conciliación reiniciada');
    }, 'destructive');
  };

  const toggleExclusion = async (tx: BankTransaction, excluded: boolean) => {
      await db.bank_statements.update(tx.referencia_origen, { excluido: !excluded });
  };

  const getStatusBadge = (tx: BankTransaction, diffCents: number, matchedTotal: number) => {
    const status = tx.estado_conciliacion;
    const badge = (() => {
      if (status === "NO_PROCESAR") return <Badge className="bg-slate-400/10 text-slate-500 border-slate-500/20 text-[10px] font-black uppercase tracking-tighter">NO PROCESAR</Badge>;
      if (matchedTotal > 0 && diffCents <= 0.001) {
          if (diffCents < -0.001) return <Badge className="bg-orange-500 text-foreground border-orange-600 shadow-sm text-[10px] font-black uppercase tracking-tighter">EXCEDENTE</Badge>;
          return <Badge className="bg-green-500 text-foreground border-green-600 shadow-sm text-[10px] font-black uppercase tracking-tighter">CONCILIADA</Badge>;
      }
      if (matchedTotal > 0 && diffCents > 0.001) return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20 text-[10px] font-black uppercase tracking-tighter">PARCIAL</Badge>;
      return <Badge className="bg-muted/10 text-muted-foreground border-gray-500/20 text-[10px] font-black uppercase tracking-tighter">PENDIENTE</Badge>;
    })();

    return (
      <MatchingTracePopover trace={tx.matching_trace} confidence={tx.matching_confidence}>
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
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} className="h-10 text-[10px] font-black uppercase border rounded-xl bg-background px-3 outline-none">
                  <option value="ALL">TODOS</option>
                  <option value="Cr">INGRESOS</option>
                  <option value="Db">GASTOS</option>
              </select>
              <div className="flex items-center gap-4 bg-muted/30 px-3 py-1.5 rounded-xl border">
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-full transition-colors ${showExcluded ? 'bg-primary/10 border-primary/20' : 'bg-muted'}`}>
                      <Switch id="show-excluded" checked={showExcluded} onCheckedChange={setShowExcluded} className="scale-75" />
                      <Label htmlFor="show-excluded" className="text-[10px] font-black uppercase cursor-pointer tracking-tighter">Excluidos</Label>
                  </div>
                  <div className="h-4 w-px bg-border mx-1" />
                  <Button variant="ghost" size="sm" onClick={onAnalyzeAll} className="h-7 text-[10px] font-black uppercase text-primary hover:bg-primary/10"><Wand2 className="w-3 h-3 mr-1" /> Analizar</Button>
              </div>
              <Button variant="default" size="sm" onClick={() => setIsAddTxOpen(true)} className="h-10 px-4 neu-btn-primary text-xs font-black uppercase"><Plus className="w-4 h-4 mr-2" /> Transacción</Button>
              <div className="flex bg-muted/50 p-1 rounded-xl border">
                  <Button variant={layoutMode === 'table' ? 'secondary' : 'ghost'} size="icon" onClick={() => setLayoutMode('table')} className="h-8 w-8 rounded-lg"><List className="w-4 h-4" /></Button>
                  <Button variant={layoutMode === 'cards' ? 'secondary' : 'ghost'} size="icon" onClick={() => setLayoutMode('cards')} className="h-8 w-8 rounded-lg"><LayoutGrid className="w-4 h-4" /></Button>
              </div>
          </div>
        </div>

        {layoutMode === 'table' ? (
          <div className="overflow-x-auto">
            <Table className="transaction-table">
              <TableHeader>
                <TableRow className="bg-muted/30 border-b-2">
                  <TableHead className="w-[40px] text-center"><Checkbox className="translate-y-1"/></TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead className="max-w-[150px]">Concepto</TableHead>
                  <TableHead className="text-center w-[60px]">Naturaleza</TableHead>
                  <TableHead className="text-right">Neto</TableHead>
                  <TableHead className="text-right">Comis.</TableHead>
                  <TableHead className="text-right">Venta</TableHead>
                  <TableHead className="text-right">Diferencia</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={11} className="h-32 text-center text-muted-foreground font-black uppercase tracking-widest opacity-40">Sin resultados</TableCell></TableRow>
                ) : (
                  filtered.map((tx) => {
                      const matched = txReconciliationTotals[tx.referencia_origen] || 0;
                      const diff = (tx.importe_venta_cents || tx.importe_cents) - matched;
                      return (
                        <TableRow key={tx.referencia_origen} className={tx.excluido ? 'opacity-40 grayscale bg-muted/20' : ''}>
                          <TableCell className="text-center"><Checkbox checked={!tx.excluido} onCheckedChange={(val: boolean) => toggleExclusion(tx, val)} /></TableCell>
                          <TableCell className="font-medium whitespace-nowrap text-xs">{formatDate(tx.fecha)}</TableCell>
                          <TableCell className="font-mono text-[10px] max-w-[120px] truncate">{tx.referencia_origen}</TableCell>
                          <TableCell className="text-xs">
                            <div className="flex items-center gap-2 group max-w-[150px]">
                                <div className="truncate font-medium cursor-pointer flex-1" title={tx.observaciones || "Sin concepto"} onClick={() => setObsModal({ open: true, observations: tx.observaciones || "", reference: tx.referencia_origen })}>
                                    {tx.observaciones || "Sin concepto"}
                                </div>
                                <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setObsModal({ open: true, observations: tx.observaciones || "", reference: tx.referencia_origen })}>
                                    <Info className="w-3 h-3 text-primary/50" />
                                </Button>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                              <Badge variant="outline" className={`text-[10px] font-black uppercase px-2 py-0 border-2 ${tx.tipo === "Cr" ? "text-emerald-500 border-emerald-500/20 bg-emerald-500/5" : "text-red-500 border-red-500/20 bg-red-500/5"}`}>
                                  {tx.tipo}
                              </Badge>
                          </TableCell>
                          <TableCell className="text-right font-bold text-xs text-muted-foreground">{formatCurrencyCents(tx.importe_cents)}</TableCell>
                          <TableCell className="text-right font-bold text-xs text-red-500">{formatCurrencyCents(tx.comision_cents || 0)}</TableCell>
                          <TableCell className="text-right font-black text-xs text-primary">{formatCurrencyCents(tx.importe_venta_cents || tx.importe_cents)}</TableCell>
                          <TableCell className={`text-right font-bold text-xs ${Math.abs(diff) < 0.001 ? 'text-green-500' : (diff < -0.001 ? 'text-orange-500' : 'text-red-500')}`}>{formatCurrencyCents(diff)}</TableCell>
                          <TableCell>{getStatusBadge(tx, diff, matched)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1 items-center">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onReconcile(tx)}><Eye className="w-4 h-4" /></Button>
                                {matched > 0 && <Button variant="ghost" size="icon" className="h-8 w-8 text-orange-600" onClick={() => handleResetReconciliation(tx)}><RotateCcw className="w-4 h-4" /></Button>}
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(tx.referencia_origen)}><Trash2 className="w-4 h-4" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
              {filtered.map((tx) => {
                  const matched = txReconciliationTotals[tx.referencia_origen] || 0;
                  const target = tx.importe_venta_cents || tx.importe_cents;
                  const diff = target - matched;
                  return (
                      <Card key={tx.referencia_origen} className="p-4 space-y-4 border-none shadow-md bg-card/50 relative overflow-hidden">
                          <div className={`absolute top-0 left-0 w-1 h-full ${tx.tipo === 'Cr' ? 'bg-green-500' : 'bg-red-500'}`} />
                          <div className="flex justify-between items-start">
                              <div className="flex items-start gap-2">
                                <Checkbox checked={!tx.excluido} onCheckedChange={(val: boolean) => toggleExclusion(tx, val)} className="mt-1" />
                                <div>
                                    <p className="text-[10px] font-black text-muted-foreground uppercase">{formatDate(tx.fecha)} • {tx.tipo}</p>
                                    <p className="text-[10px] font-mono font-bold text-primary">{tx.referencia_origen}</p>
                                </div>
                              </div>
                              {getStatusBadge(tx, diff, matched)}
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2 italic">{tx.observaciones || "Sin concepto"}</p>
                          <div className="grid grid-cols-2 gap-2 pt-2 border-t text-[10px] font-black uppercase">
                              <div><p className="text-muted-foreground">Objetivo</p><p className="text-primary">{formatCurrencyCents(target)}</p></div>
                              <div className="text-right"><p className="text-muted-foreground">Diferencia</p><p className={Math.abs(diff) < 0.001 ? 'text-green-500' : 'text-orange-500'}>{formatCurrencyCents(diff)}</p></div>
                          </div>
                          <div className="flex justify-end gap-2 pt-2">
                              <Button variant="outline" size="sm" className="h-10 px-4 text-[10px] font-black uppercase gap-2" onClick={() => onReconcile(tx)}><Eye className="w-3 h-3" /> Ver</Button>
                              <Button variant="outline" size="icon" className="h-10 w-10 text-destructive border-destructive/20" onClick={() => handleDelete(tx.referencia_origen)}><Trash2 className="w-3 h-3" /></Button>
                          </div>
                      </Card>
                  );
              })}
          </div>
        )}

        <ObservationsModal
            open={obsModal.open}
            onOpenChange={(open) => setObsModal(prev => ({ ...prev, open }))}
            observations={obsModal.observations}
            reference={obsModal.reference}
        />

        <BaseModal
            open={confirmation.open}
            onOpenChange={(open) => setConfirmation(prev => ({ ...prev, open }))}
            title={confirmation.title}
            footer={
              <div className="flex gap-2 w-full pt-4">
                <Button variant="outline" onClick={() => setConfirmation(prev => ({ ...prev, open: false }))} className="flex-1 h-11 font-black uppercase text-xs">Cancelar</Button>
                <Button variant={confirmation.variant === 'destructive' ? 'destructive' : 'default'} onClick={() => { confirmation.onConfirm(); setConfirmation(prev => ({ ...prev, open: false })); }} className="flex-1 h-11 font-black uppercase text-xs">Confirmar</Button>
              </div>
            }
        >
            <div className="py-4"><p className="text-sm text-muted-foreground font-medium">{confirmation.message}</p></div>
        </BaseModal>
        <AddTransactionModal open={isAddTxOpen} onOpenChange={setIsAddTxOpen} />
      </div>
    </>
  );
}
