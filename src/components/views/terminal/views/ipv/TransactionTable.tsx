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
import { Eye, Trash2, Search, RotateCcw, LayoutGrid, List, CheckCircle2, XCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { formatCurrency, formatDate } from '@/lib/utils';
import { ManualReconciliationModal } from './ManualReconciliationModal';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Info } from 'lucide-react';

export function TransactionTable({ transactions }: { transactions: BankTransaction[] }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTx, setSelectedTx] = useState<BankTransaction | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [layoutMode, setLayoutMode] = useState<'table' | 'cards'>('table');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'Cr' | 'Db'>('ALL');

  const reconciliationLines = useLiveQuery(() => db.reconciliation_lines.toArray());

  const txReconciliationTotals = React.useMemo(() => {
    if (!reconciliationLines) return {};
    return reconciliationLines.reduce((acc, line) => {
      acc[line.transaction_ref] = (acc[line.transaction_ref] || 0) + line.importe_linea_cents;
      return acc;
    }, {} as Record<string, number>);
  }, [reconciliationLines]);

  const filtered = transactions.filter(t => {
    const matchesSearch = t.referencia_origen.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         t.observaciones.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'ALL' || t.tipo === typeFilter;
    return matchesSearch && matchesType;
  });

  const handleDelete = async (id: string) => {
    if (confirm('¿Eliminar esta transacción?')) {
      await db.bank_statements.delete(id);
    }
  };

  const handleResetReconciliation = async (tx: BankTransaction) => {
    if (confirm(`¿Reiniciar conciliación para ${tx.referencia_origen}? Se borrarán todos los productos asociados.`)) {
        await db.reconciliation_lines.where('transaction_ref').equals(tx.referencia_origen).delete();
        await db.bank_statements.update(tx.id, {
            estado_conciliacion: 'PENDIENTE'
        });
    }
  };

  const toggleExclusion = async (tx: BankTransaction) => {
      await db.bank_statements.update(tx.id, {
          excluido: !tx.excluido
      });
  };

  const bulkToggleExclusion = async (exclude: boolean) => {
      const ids = filtered.map(t => t.id);
      await db.bank_statements.where('id').anyOf(ids).modify({ excluido: exclude });
  };

  const getStatusBadge = (status: string, diffCents: number, matchedTotal: number) => {
    if (matchedTotal > 0 && diffCents === 0) {
      return <Badge className="bg-green-500 text-white border-green-600 shadow-sm text-[10px] font-black uppercase tracking-tighter">CUADRADA</Badge>;
    }
    if (matchedTotal > 0 && diffCents !== 0) {
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

            <div className="flex gap-1 bg-muted/50 p-1 rounded-lg">
                <Button variant="ghost" size="sm" onClick={() => bulkToggleExclusion(false)} className="h-8 text-[10px] font-black uppercase hover:bg-green-500/10 hover:text-green-600">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Incluir Filtro
                </Button>
                <Button variant="ghost" size="sm" onClick={() => bulkToggleExclusion(true)} className="h-8 text-[10px] font-black uppercase hover:bg-red-500/10 hover:text-red-600">
                    <XCircle className="w-3 h-3 mr-1" /> Excluir Filtro
                </Button>
            </div>

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
                  <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                    No se encontraron transacciones.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((tx) => {
                  const matchedTotal = txReconciliationTotals[tx.referencia_origen] || 0;
                  const targetAmount = tx.importe_venta_cents ?? tx.importe_cents;
                  const diff = targetAmount - matchedTotal;

                  return (
                  <TableRow key={tx.id} className={tx.excluido ? 'opacity-40 grayscale bg-muted/20' : ''}>
                    <TableCell className="text-center">
                        <Checkbox
                            checked={!tx.excluido}
                            onCheckedChange={() => toggleExclusion(tx)}
                            className="translate-y-0.5"
                        />
                    </TableCell>
                    <TableCell className="sticky-column-1 font-medium whitespace-nowrap">
                      {formatDate(tx.fecha)}
                    </TableCell>
                    <TableCell className="font-mono text-[10px]">{tx.referencia_origen}</TableCell>
                    <TableCell className="text-[10px] truncate max-w-md" title={tx.observaciones}>
                      {tx.observaciones}
                    </TableCell>
                    <TableCell className="text-right font-medium text-muted-foreground text-xs">
                      {formatCurrency(tx.importe_cents / 100)}
                    </TableCell>
                    <TableCell className="text-right font-black text-sm">
                      {formatCurrency(targetAmount / 100)}
                    </TableCell>
                    <TableCell className={`text-right font-bold text-sm ${diff === 0 ? 'text-green-500' : (diff < 0 ? 'text-red-500' : 'text-orange-500')}`}>
                      {formatCurrency(diff / 100)}
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
                            onClick={() => {
                              setSelectedTx(tx);
                              setModalOpen(true);
                            }}
                          >
                              <Eye className="w-4 h-4" />
                          </Button>
                          {matchedTotal > 0 && (
                              <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 hover:bg-orange-500/10 hover:text-orange-500"
                                  onClick={() => handleResetReconciliation(tx)}
                                  title="Reiniciar Conciliación"
                              >
                                  <RotateCcw className="w-4 h-4" />
                              </Button>
                          )}
                          <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => handleDelete(tx.id)}
                          >
                              <Trash2 className="w-4 h-4" />
                          </Button>
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

                            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border/50">
                                <div>
                                    <p className="text-[9px] font-bold text-muted-foreground uppercase">Importe Venta</p>
                                    <p className="text-lg font-black">{formatCurrency(targetAmount / 100)}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[9px] font-bold text-muted-foreground uppercase">Diferencia</p>
                                    <p className={`text-lg font-black ${diff === 0 ? 'text-green-500' : (diff < 0 ? 'text-red-500' : 'text-orange-500')}`}>
                                        {formatCurrency(diff / 100)}
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
                                        className="h-9 px-4 text-xs font-bold uppercase gap-2 neu-btn"
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
                                        className="h-9 w-9 text-destructive border-destructive/20 hover:bg-destructive/10"
                                        onClick={() => handleDelete(tx.id)}
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
    </div>
  );
}
