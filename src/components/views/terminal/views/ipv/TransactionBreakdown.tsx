import { StockService } from '../../../../../lib/ipv/StockService';
import { AlertTriangle } from 'lucide-react';
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
import { Card, CardHeader, CardTitle, CardContent } from '../../../../ui/card';
import { Badge } from '../../../../ui/badge';
import { Button } from '../../../../ui/button';
import { Input } from '../../../../ui/input';
import {
  Search,
  Filter,
  Trash2,
  Edit2,
  Info,
  ArrowRightLeft
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
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger
} from '../../../../ui/tooltip';
import * as XLSX from 'xlsx';
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
  const [classificationFilter, setClassificationFilter] = useState<string>('ALL');
  const [editingLine, setEditingLine] = useState<ReconciliationLine | null>(null);
  const [editAmount, setEditAmount] = useState<number>(0);
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
      const prod = productMap.get(l.product_cod);
      const baseRef = l.parent_transaction_id || l.transaction_ref.split("_EFECTIVO")[0];
                const tx = txMap.get(baseRef);
      const search = searchTerm.toLowerCase();

      const matchesSearch =
        l.transaction_ref.toLowerCase().includes(search) ||
        l.product_cod.toLowerCase().includes(search) ||
        (prod?.descripcion.toLowerCase().includes(search)) ||
        (tx?.observaciones?.toLowerCase().includes(search));

      const matchesClassification = classificationFilter === 'ALL' || l.clasificacion === classificationFilter;

      return matchesSearch && matchesClassification;
    }).sort((a, b) => b.fecha_operacion.localeCompare(a.fecha_operacion));
  }, [lines, txMap, productMap, searchTerm, classificationFilter]);

  const handleDeleteLine = async (line: any) => {
    if (!confirm("¿Deseas revertir este registro mediante compensación?")) return;
    try {
        const snapshot = await StockService.takeSnapshot(line.product_cod);
        await StockService.revertReconciliationLine(line.id, snapshot);

        const tx = await db.bank_statements.get(line.transaction_ref);
        if (tx) {
            const remainingLines = await db.reconciliation_lines.where("transaction_ref").equals(line.transaction_ref).toArray();
            const txTotal = remainingLines.reduce((sum, l) => sum + l.importe_linea_cents, 0);
            const target = tx.importe_venta_cents || tx.importe_cents;
            const newStatus = txTotal >= target - 0.001 ? "COMPLETO" : (txTotal > 0 ? "PARCIAL" : "PENDIENTE");
            await db.bank_statements.update(line.transaction_ref, { estado_conciliacion: newStatus });
        }

        toast.success("Línea revertida exitosamente");
    } catch (error: any) {
        toast.error(error.message || "Error al revertir la línea");
    }
  };

  const handleSaveEdit = async () => {
    if (!editingLine) return;
    try {
        await db.reconciliation_lines.update(editingLine.id, {
            importe_linea_cents: editAmount,
            fecha_operacion: editDate,
            cuadre_cents: editAmount - (editingLine.precio_unitario_cents * editingLine.cantidad)
        });
        toast.success('Línea actualizada');
        setEditingLine(null);
    } catch (error) {
        toast.error('Error al actualizar');
    }
  }
  const handleExportExcel = () => {
    const data = filteredLines.map(l => ({
      Fecha: l.fecha_operacion,
      Referencia: l.transaction_ref,
      Producto: l.product_cod,
      Cantidad: l.cantidad,
      Importe: l.importe_linea_cents / 100
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Desglose");
    XLSX.writeFile(wb, `desglose_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };
;

  const exportToExcel = () => {
    const data = filteredLines.map(l => {
        const prod = productMap.get(l.product_cod);
        return {
            "Fecha": l.fecha_operacion,
            "Referencia": l.transaction_ref,
            "Producto": prod?.descripcion || l.product_cod,
            "Cantidad": l.cantidad,
            "UM": l.product_um,
            "Precio Unit": l.precio_unitario_cents / 100,
            "Importe Real": l.importe_linea_cents / 100,
            "Cuadre": l.cuadre_cents / 100,
            "Clasificación": l.clasificacion,
            "Origen": l.origen_dato,
            "Observaciones": l.observaciones || ""
        };
    });

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
    <div className="space-y-4">
      <div className="p-3 sm:p-4 flex flex-col lg:flex-row gap-3 bg-background/50 border-b items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por producto o referencia..."
            className="pl-10 h-10 neu-input-primary"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2 w-full lg:w-auto">
          <Button variant="outline" className="h-10 gap-2 flex-1 lg:flex-none uppercase font-black text-[10px]" onClick={handleExportExcel}>
            <Filter className="w-3.5 h-3.5" /> EXPORTAR EXCEL
          </Button>
        </div>
      </div>

      <div className="space-y-6">
          {filteredLines.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-muted-foreground italic text-xs bg-muted/20 rounded-xl border border-dashed">
              No se encontraron registros de conciliación.
            </div>
          ) : (
            Object.entries(
              filteredLines.reduce((acc, l) => {
                const baseRef = l.parent_transaction_id || l.transaction_ref;
                if (!acc[baseRef]) acc[baseRef] = [];
                acc[baseRef].push(l);
                return acc;
              }, {} as Record<string, ReconciliationLine[]>)
            ).map(([baseRef, groupLines]) => {
              const tx = txMap.get(baseRef);
              const totalTransfer = groupLines.reduce((s, l) => s + (l.transfer_amount_cents || 0), 0);
              const totalCash = groupLines.reduce((s, l) => s + (l.cash_amount_cents || 0), 0);
              const composition = `${totalTransfer / 100}T + ${totalCash / 100}E`;

              return (
                <Card key={baseRef} className="border-2 border-primary/10 overflow-hidden shadow-sm hover:shadow-md transition-all">
                  <CardHeader className="bg-muted/30 py-3 px-4 flex-row items-center justify-between space-y-0 border-b">
                    <div className="flex items-center gap-3">
                      <div className="bg-primary/10 p-1.5 rounded-lg">
                        <ArrowRightLeft className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
                          Transacción: <span className="truncate max-w-[200px]">{baseRef}</span>
                        </CardTitle>
                        <p className="text-[10px] text-muted-foreground font-medium uppercase truncate max-w-[300px]">
                           {tx?.observaciones || "Sin observaciones de origen"}
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="neu-badge-primary px-3 py-1 font-black text-xs uppercase flex-shrink-0">
                      {composition}
                    </Badge>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader className="bg-muted/10">
                        <TableRow className="hover:bg-transparent border-b">
                          <TableHead className="w-[100px] text-[9px] font-black uppercase py-2">Producto</TableHead>
                          <TableHead className="text-[9px] font-black uppercase py-2 text-center">Cant.</TableHead>
                          <TableHead className="text-[9px] font-black uppercase py-2 text-right">P. Base</TableHead>
                          <TableHead className="text-[9px] font-black uppercase py-2 text-right text-muted-foreground/30">—</TableHead>
                          <TableHead className="text-[9px] font-black uppercase py-2 text-right text-muted-foreground/30">—</TableHead>
                          <TableHead className="text-[9px] font-black uppercase py-2 text-right">Valor</TableHead>
                          <TableHead className="text-[9px] font-black uppercase py-2 text-right">Composición</TableHead>
                          <TableHead className="text-[9px] font-black uppercase py-2 text-right"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {groupLines.map((l) => {
                          const prod = productMap.get(l.product_cod);
                          const basePrice = prod?.precio_cents || l.precio_unitario_cents;
                          const isReversion = l.observaciones?.startsWith('[REVERSIÓN]');

                          const t = (l.transfer_amount_cents || 0) / 100;
                          const e = (l.cash_amount_cents || 0) / 100;
                          const lineComposition = t > 0 && e > 0 ? `${t}T + ${e}E` : (t > 0 ? `${t}T` : `${e}E`);

                          return (
                            <TableRow key={l.id} className={isReversion ? "bg-muted/5" : "hover:bg-primary/[0.02]"}>
                              <TableCell className="py-2">
                                <div className={`text-xs font-bold ${isReversion ? "text-muted-foreground line-through" : ""}`}>{prod?.descripcion || l.product_cod}</div>
                                <div className="text-[10px] text-muted-foreground font-mono">{l.product_cod}</div>
                              </TableCell>
                              <TableCell className="text-center font-bold text-xs py-2">{l.cantidad || '—'}</TableCell>
                              <TableCell className="text-right text-xs text-muted-foreground py-2">{formatCurrencyCents(basePrice)}</TableCell>
                              <TableCell className="text-right py-2 opacity-20 text-[10px]">—</TableCell>
                              <TableCell className="text-right py-2 opacity-20 text-[10px]">—</TableCell>
                              <TableCell className="text-right py-2">
                                <div className="font-black text-xs text-primary">{formatCurrencyCents(l.importe_linea_cents)}</div>
                              </TableCell>
                              <TableCell className="text-right py-2">
                                <Badge variant="outline" className="text-[9px] font-black uppercase px-2 py-0 h-5 bg-background shadow-sm border-primary/20">
                                  {lineComposition}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right py-2 px-4">
                                <div className="flex justify-end gap-0.5">
                                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:bg-destructive/10" onClick={() => handleDeleteLine(l)}>
                                    <Trash2 className="w-2.5 h-2.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              );
            })
          )}
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
                <DialogTitle className="text-xl font-black uppercase text-primary">Editar Importe Real</DialogTitle>
            </DialogHeader>
            <div className="py-6 space-y-4">
                <div className="p-4 bg-muted/30 rounded-2xl border border-dashed border-muted-foreground/30">
                    <p className="text-xs font-black uppercase text-muted-foreground mb-1">Producto / Ref</p>
                    <p className="font-bold text-sm">{editingLine?.product_cod}</p>
                    <p className="text-xs text-muted-foreground">{editingLine?.transaction_ref}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-xs font-black uppercase text-muted-foreground">Importe Total (Pesos)</label>
                        <Input
                            type="number"
                            step="0.01"
                            value={editAmount / 100}
                            onChange={(e) => setEditAmount(Math.round(parseFloat(e.target.value) * 100))}
                            className="h-12 text-lg font-black"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-black uppercase text-muted-foreground">Fecha Operación</label>
                        <Input
                            type="date"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                            className="h-12 font-bold"
                        />
                    </div>
                </div>

                <div className="p-4 bg-primary/5 rounded-xl border border-primary/10">
                    <p className="text-xs text-muted-foreground italic">
                        El precio base es {formatCurrencyCents(productMap.get(editingLine?.product_cod || "")?.precio_cents || editingLine?.precio_unitario_cents || 0)}.
                        Cualquier diferencia se guardará como Propina o Descuento.
                    </p>
                </div>
            </div>
            <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={() => setEditingLine(null)} className="font-bold uppercase text-xs">Cancelar</Button>
                <Button onClick={handleSaveEdit} className="neu-btn-primary font-black uppercase text-xs">Guardar Cambios</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
