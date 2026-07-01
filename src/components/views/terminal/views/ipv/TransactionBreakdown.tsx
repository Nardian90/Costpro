import { StockService } from '../../../../../lib/ipv/StockService';
import { AlertTriangle, CreditCard, Banknote, HelpCircle } from 'lucide-react';
import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ReconciliationLine } from '../../../../../lib/dexie';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '../../../../ui/table';
import { Badge } from '../../../../ui/badge';
import { Button } from '../../../../ui/button';
import { Input } from '../../../../ui/input';
import {
  Search,
  Trash2,
  Edit2,
  Info
} from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrencyCents } from '../../../../../lib/utils';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from '../../../../ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '../../../../ui/select';
import { createWorkbook } from '@/lib/export/lazy-excel';
import { format } from 'date-fns';

const ObservationsModal = ({ open, onOpenChange, observations, reference }: { open: boolean, onOpenChange: (open: boolean) => void, observations: string, reference: string }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="text-xl font-black uppercase text-primary">Detalle de Transacción</DialogTitle>
      </DialogHeader>
      <div className="py-4 space-y-4">
        <div className="p-4 bg-muted/30 rounded-2xl border border-dashed border-muted-foreground/30">
            <p className="text-xs font-black uppercase text-muted-foreground mb-1">Referencia Origen</p>
            <p className="font-mono text-sm font-bold text-primary break-all">{reference}</p>
        </div>
        <div className="space-y-1">
            <p className="text-xs font-black uppercase text-muted-foreground">Observaciones / Concepto</p>
            <div className="p-4 bg-background border rounded-2xl text-sm min-h-[100px] whitespace-pre-wrap leading-relaxed italic">
                {observations || "Sin observaciones adicionales registradas."}
            </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)} className="font-bold uppercase text-xs">Cerrar</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export default function TransactionBreakdown() {
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('ALL');
  const [editingLine, setEditingLine] = useState<ReconciliationLine | null>(null);
  const [editTransfer, setEditTransfer] = useState<number>(0);
  const [editCash, setEditCash] = useState<number>(0);
  const [editDate, setEditDate] = useState<string>('');
  const [obsModal, setObsModal] = useState({ open: false, observations: "", reference: "" });

  const lines = useLiveQuery(() => db.reconciliation_lines.toArray());
  const transactions = useLiveQuery(() => db.bank_statements.toArray());
  const products = useLiveQuery(() => db.products.toArray());

  const txMap = useMemo(() => new Map(transactions?.map(t => [t.referencia_origen, t])), [transactions]);
  const productMap = useMemo(() => new Map(products?.map(p => [p.cod, p])), [products]);

  const filteredLines = useMemo(() => {
    if (!lines) return [];
    return lines.filter(l => {
      const search = searchTerm.toLowerCase();
      const tx = txMap.get(l.parent_transaction_id || l.transaction_ref);

      const matchesSearch =
        l.transaction_ref.toLowerCase().includes(search) ||
        l.product_cod.toLowerCase().includes(search) ||
        l.product_name.toLowerCase().includes(search) ||
        (tx?.observaciones?.toLowerCase().includes(search));

      const matchesStatus = paymentStatusFilter === 'ALL' || l.payment_status === paymentStatusFilter;

      return matchesSearch && matchesStatus;
    }).sort((a, b) => b.fecha_operacion.localeCompare(a.fecha_operacion));
  }, [lines, txMap, searchTerm, paymentStatusFilter]);

  const handleDeleteLine = async (line: ReconciliationLine) => {
    if (!confirm("¿Deseas revertir este registro?")) return;
    try {
        const snapshot = await StockService.takeSnapshot(line.product_cod);
        await StockService.revertReconciliationLine(line.id, snapshot);
        toast.success("Línea revertida exitosamente");
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Error al revertir la línea";
        toast.error(message);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingLine) return;
    try {
        const total = editTransfer + editCash;
        await db.reconciliation_lines.update(editingLine.id, {
            transfer_amount_cents: editTransfer,
            cash_amount_cents: editCash,
            total_amount_cents: total,
            fecha_operacion: editDate
        });
        toast.success('Línea actualizada');
        setEditingLine(null);
    } catch (error) {
        toast.error('Error al actualizar');
    }
  };

  const exportToExcel = async () => {
    const XLSX = await createWorkbook();
    const data = filteredLines.map(l => ({
        "Fecha": l.fecha_operacion,
        "Referencia": l.transaction_ref,
        "Producto": l.product_name,
        "Cantidad": l.cantidad,
        "UM": l.product_um,
        "Precio Unit": l.precio_unitario_cents / 100,
        "Transferencia": l.transfer_amount_cents / 100,
        "Efectivo": l.cash_amount_cents / 100,
        "Total": l.total_amount_cents / 100,
        "Estado": l.payment_status,
        "Observaciones": l.observaciones || ""
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Desglose IPV");
    XLSX.writeFile(wb, `desglose_ipv_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const formatDate = (dateStr: string) => {
    try {
        return format(new Date(dateStr), 'dd/MM/yyyy');
    } catch {
        return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-background/50 p-4 border-b">
        <div className="flex items-center gap-4 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                    placeholder="Buscar por ref, producto o concepto..."
                    className="pl-10 h-10 text-xs font-bold"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
                <SelectTrigger className="w-40 h-10 text-xs font-bold">
                    <SelectValue placeholder="Estado Pago" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="ALL">Todos los Estados</SelectItem>
                    <SelectItem value="MATCHED">CONCILIADO</SelectItem>
                    <SelectItem value="PARTIAL">PARCIAL</SelectItem>
                    <SelectItem value="OVERPAYMENT">EXCEDENTE</SelectItem>
                </SelectContent>
            </Select>
        </div>
        <Button onClick={exportToExcel} variant="outline" className="text-xs font-black uppercase tracking-widest border-primary/20 hover:bg-primary/5">
            Exportar Excel
        </Button>
      </div>

      <div className="px-4 overflow-x-auto">
        <Table className="data-table">
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Orden</TableHead>
              <TableHead>Transacción</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead className="text-center">Cant.</TableHead>
              <TableHead className="text-right">Composición de Pago</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground font-bold uppercase text-xs">
                  No se encontraron registros.
                </TableCell>
              </TableRow>
            ) : (
              filteredLines.map((l) => {
                const tx = txMap.get(l.parent_transaction_id || l.transaction_ref);
                const isReversion = l.observaciones?.startsWith('[REVERSIÓN]');

                return (
                  <TableRow key={l.id} className={isReversion ? "bg-muted/10" : ""}>
                    <TableCell className="text-xs font-medium">{formatDate(l.fecha_operacion)}</TableCell>
                    <TableCell className="text-[10px] font-mono text-muted-foreground">#{l.purchase_order_id || "-"}</TableCell>
                    <TableCell>
                      <div className="text-xs font-black text-primary truncate max-w-[150px]">{l.transaction_ref}</div>
                      <div className="flex items-center gap-1 group">
                        <div role="button" tabIndex={0} className="text-[10px] text-muted-foreground truncate max-w-[120px] cursor-pointer hover:text-primary transition-colors" onClick={() => { if (tx) setObsModal({ open: true, observations: tx.observaciones || "", reference: tx.referencia_origen }); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (tx) setObsModal({ open: true, observations: tx.observaciones || "", reference: tx.referencia_origen }); } }}>
                          {tx?.observaciones || "Manual / Global"}
                        </div>
                        {tx && <Info className="w-3 h-3 text-muted-foreground/50" />}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2"><div className="text-xs font-bold">{l.product_name}</div>{l.is_price_change && <Badge className="text-[8px] h-3 px-1 bg-purple-100 text-purple-700 border-purple-200 animate-none">Δ P</Badge>}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{l.product_cod}</div>
                    </TableCell>
                    <TableCell className="text-center font-bold text-xs">{l.cantidad} {l.product_um}</TableCell>
                    <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-1">
                            <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100 text-[10px] font-black h-5">
                                    <CreditCard className="w-3 h-3 mr-1" />
                                    {formatCurrencyCents(l.transfer_amount_cents)}T{l.adjustment_type === "REBAJA" ? "R" : l.adjustment_type === "PROPINA" ? "P" : ""}
                                </Badge>
                                {l.cash_amount_cents > 0 && (
                                    <Badge variant="secondary" className="bg-green-50 text-success border-green-100 text-[10px] font-black h-5">
                                        <Banknote className="w-3 h-3 mr-1" />
                                        {formatCurrencyCents(l.cash_amount_cents)}E
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </TableCell>
                    <TableCell className="text-right">
                        <div className="font-black text-xs text-primary">{formatCurrencyCents(l.total_amount_cents)}</div>
                    </TableCell>
                    <TableCell>
                        <Badge variant="outline" className={`text-[10px] font-black uppercase ${
                            l.payment_status === 'MATCHED' ? 'border-green-200 text-success bg-green-50' :
                            l.payment_status === 'OVERPAYMENT' ? 'border-orange-200 text-warning bg-orange-50' :
                            'border-blue-200 text-primary'
                        }`}>
                            {l.payment_status}
                        </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                                setEditingLine(l);
                                setEditTransfer(l.transfer_amount_cents);
                                setEditCash(l.cash_amount_cents);
                                setEditDate(l.fecha_operacion);
                            }}>
                                <Edit2 className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteLine(l)}>
                                <Trash2 className="w-3 h-3" />
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

      <ObservationsModal
        open={obsModal.open}
        onOpenChange={(open) => setObsModal(prev => ({ ...prev, open }))}
        observations={obsModal.observations}
        reference={obsModal.reference}
      />

      <Dialog open={!!editingLine} onOpenChange={(open) => !open && setEditingLine(null)}>
        <DialogContent className="max-w-md">
            <DialogHeader>
                <DialogTitle className="text-xl font-black uppercase text-primary">Editar Distribución de Pago</DialogTitle>
            </DialogHeader>
            <div className="py-6 space-y-4">
                <div className="p-4 bg-muted/30 rounded-2xl border border-dashed">
                    <p className="text-xs font-black uppercase text-muted-foreground">{editingLine?.product_name}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">{editingLine?.transaction_ref}</p>
                </div>

                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label htmlFor="edit-transfer" className="text-[10px] font-black uppercase text-muted-foreground">Transferencia (T)</label>
                            <Input
                                id="edit-transfer"
                                type="number"
                                step="0.01"
                                value={editTransfer / 100}
                                onChange={(e) => setEditTransfer(Math.round(parseFloat(e.target.value) * 100))}
                                className="font-black"
                            />
                        </div>
                        <div className="space-y-1">
                            <label htmlFor="edit-cash" className="text-[10px] font-black uppercase text-muted-foreground">Efectivo (E)</label>
                            <Input
                                id="edit-cash"
                                type="number"
                                step="0.01"
                                value={editCash / 100}
                                onChange={(e) => setEditCash(Math.round(parseFloat(e.target.value) * 100))}
                                className="font-black"
                            />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <label htmlFor="edit-date" className="text-[10px] font-black uppercase text-muted-foreground">Fecha Operación</label>
                        <Input id="edit-date" type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="font-bold" />
                    </div>
                </div>

                <div className="p-4 bg-primary/5 rounded-xl border border-primary/10 flex justify-between items-center">
                    <span className="text-xs font-bold uppercase">Total Calculado:</span>
                    <span className="text-lg font-black text-primary">{formatCurrencyCents(editTransfer + editCash)}</span>
                </div>
            </div>
            <DialogFooter>
                <Button variant="ghost" onClick={() => setEditingLine(null)} className="font-bold uppercase text-xs">Cancelar</Button>
                <Button onClick={handleSaveEdit} className="font-black uppercase text-xs">Guardar</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
