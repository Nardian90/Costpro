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
import { Card } from '../../../../ui/card';
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
  };

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
            <Select value={classificationFilter} onValueChange={setClassificationFilter}>
                <SelectTrigger className="w-40 h-10 text-xs font-bold">
                    <SelectValue placeholder="Tipo Pago" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="ALL">Todos</SelectItem>
                    <SelectItem value="Transferencia">Transferencia</SelectItem>
                    <SelectItem value="Efectivo">Efectivo</SelectItem>
                    <SelectItem value="QR">QR</SelectItem>
                </SelectContent>
            </Select>
        </div>
        <Button onClick={exportToExcel} variant="outline" className="text-xs font-black uppercase tracking-widest border-primary/20 hover:bg-primary/5">
            Exportar Excel
        </Button>
      </div>

      <div className="px-4">
        <Table className="data-table">
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Ref. Transacción / Origen</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead className="text-center">Cant.</TableHead>
              <TableHead className="text-right">Precio Base</TableHead>
              <TableHead className="text-right text-green-600">Propina</TableHead>
              <TableHead className="text-right text-red-600">Descuento</TableHead>
              <TableHead className="text-right">Importe Real</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="h-24 text-center text-muted-foreground font-bold uppercase text-xs">
                  No se encontraron líneas de detalle.
                </TableCell>
              </TableRow>
            ) : (
              filteredLines.map((l) => {
                const baseRef = l.parent_transaction_id || l.transaction_ref.split("_EFECTIVO")[0];
                const tx = txMap.get(baseRef);
                const prod = productMap.get(l.product_cod);
                const basePrice = prod?.precio_cents || l.precio_unitario_cents;

                const propina = l.cuadre_cents > 0 ? l.cuadre_cents : 0;
                const descuento = l.cuadre_cents < 0 ? Math.abs(l.cuadre_cents) : 0;

                const isReversion = l.observaciones?.startsWith('[REVERSIÓN]');
                const canEditDelete = (l.clasificacion === 'Efectivo' || l.origen_dato === 'CASH_FILLER') && !isReversion;

                return (
                  <TableRow key={l.id} className={isReversion ? "bg-muted/10" : ""}>
                    <TableCell className={`text-xs font-medium ${isReversion ? "opacity-40" : ""}`}>{formatDate(l.fecha_operacion)}</TableCell>
                    <TableCell>
                      <div className="text-xs font-black text-primary truncate max-w-[150px]" title={l.transaction_ref}>
                        {l.transaction_ref}
                      </div>
                      {l.status === 'INVALID_ORPHAN' && (
                        <div className="flex items-center gap-1 mt-1 text-[9px] text-red-600 font-black animate-pulse">
                           <AlertTriangle className="w-3 h-3" /> SIN ORIGEN VÁLIDO
                        </div>
                      )}
                      <div className="flex items-center gap-1 group">
                        <div className="text-xs text-muted-foreground truncate max-w-[120px] cursor-pointer flex-1" title={tx?.observaciones} onClick={() => tx && setObsModal({ open: true, observations: tx.observaciones || "", reference: baseRef })} >
                          {tx?.observaciones || "Ajuste Manual / Global"}
                        </div>
                        {tx && (
                          <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setObsModal({ open: true, observations: tx.observaciones || "", reference: baseRef })}>
                            <Info className="w-3 h-3 text-primary" />
                          </Button>
                        )}
                      </div>
                      {l.observaciones && (
                        <div className="text-[10px] text-orange-600 font-bold italic mt-0.5 truncate max-w-[150px] cursor-pointer" title={l.observaciones} onClick={() => setObsModal({ open: true, observations: l.observaciones || "", reference: l.transaction_ref })} >
                          {l.observaciones}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className={`text-xs font-bold ${isReversion ? "text-muted-foreground line-through" : ""}`}>{prod?.descripcion || (l.product_cod === 'CASH' ? 'EFECTIVO' : l.product_cod)}</div>
                      <div className="text-xs text-muted-foreground font-mono">{l.product_cod}</div>
                    </TableCell>
                    <TableCell className="text-center font-bold text-xs">{l.cantidad}</TableCell>
                    <TableCell className="text-right">
                      <div className="text-xs font-bold text-muted-foreground">
                        {formatCurrencyCents(basePrice)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                        {propina > 0 ? (
                            <div className="text-xs font-black text-green-600">
                                +{formatCurrencyCents(propina)}
                            </div>
                        ) : <span className="text-muted-foreground opacity-30 text-xs">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                        {descuento > 0 ? (
                            <div className="text-xs font-black text-red-600">
                                -{formatCurrencyCents(descuento)}
                            </div>
                        ) : <span className="text-muted-foreground opacity-30 text-xs">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                        <div className="font-black text-xs text-primary">{formatCurrencyCents(l.importe_linea_cents)}</div>
                    </TableCell>
                    <TableCell>
                        <Badge variant="outline" className={`text-xs font-black uppercase ${
                            l.status === 'INVALID_ORPHAN' ? 'border-red-500 text-red-600 bg-red-50' :
                            l.source_type === 'REAL_CASH_GOAL' ? 'border-purple-200 text-purple-600 bg-purple-50' :
                            l.origen_dato === 'AUTO_MATCH' ? 'border-green-200 text-green-600' :
                            l.origen_dato === 'CASH_FILLER' ? 'border-orange-200 text-orange-600' :
                            'border-blue-200 text-blue-600'
                        }`}>
                            {l.status === 'INVALID_ORPHAN' ? 'HUÉRFANO' : (l.source_type === 'REAL_CASH_GOAL' ? 'PLANIFICACIÓN' : l.origen_dato)}
                        </Badge>
                        {isReversion && (
                            <Badge variant="secondary" className="ml-2 bg-red-100 text-red-600 border-red-200 text-[10px] animate-none">REVERTIDO</Badge>
                        )}
                    </TableCell>
                    <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                disabled={!canEditDelete}
                                onClick={() => {
                                    setEditingLine(l);
                                    setEditAmount(l.importe_linea_cents);
                                    setEditDate(l.fecha_operacion);
                                }}
                            >
                                <Edit2 className="w-3 h-3" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:bg-destructive/10"
                                disabled={!canEditDelete}
                                onClick={() => handleDeleteLine(l)}
                            >
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
