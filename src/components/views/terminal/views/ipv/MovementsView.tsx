import { StockService } from '../../../../../lib/ipv/StockService';
import { createWorkbook } from '@/lib/export/lazy-excel';
import { FileSpreadsheet } from "lucide-react";
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../../../lib/dexie';
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
  ArrowRight,
  Trash2,
  Search,
  History
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function MovementsView() {
  const [searchTerm, setSearchTerm] = useState('');

  const movements = useLiveQuery(
    () => db.product_movements.orderBy('fecha').reverse().toArray()
  );

  const handleRevertMovement = async (m: any) => {
    if (!confirm("¿Deseas revertir este movimiento de inventario mediante compensación?")) return;
    try {
      const snapshot = await StockService.takeSnapshot(m.producto_destino_cod);
      await StockService.revertMovement(m.id, snapshot);
      toast.success("Movimiento revertido mediante compensación");
    } catch (error: any) {
      toast.error(error.message || "Error al revertir el movimiento");
    }
  };


  const filteredMovements = movements?.filter(m =>
    m.producto_origen_cod.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.producto_destino_cod.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.referencia_transaccion?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const exportToExcel = async () => {
    const XLSX = await createWorkbook();
    const data = filteredMovements?.map(m => ({
        "Fecha": m.fecha,
        "Producto Origen": m.producto_origen_cod,
        "Producto Destino": m.producto_destino_cod,
        "Cantidad Origen": Number(m.cantidad_origen),
        "Cantidad Destino": Number(m.cantidad_destino),
        "Tipo": m.tipo,
        "Referencia": m.referencia_transaccion || ""
    })) || [];
    const ws = XLSX.utils.json_to_sheet(data);

    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
        ['D', 'E'].forEach(col => {
            const addr = col + (R + 1);
            if (ws[addr]) {
                ws[addr].t = 'n';
                ws[addr].z = '0.00';
            }
        });
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Movimientos");
    XLSX.writeFile(wb, `movimientos_ipv_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast.success("Excel de movimientos exportado");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-background/50 p-4 border-b">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por código o ref..."
            className="pl-10 h-10 text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
           <Button variant="outline" size="sm" onClick={exportToExcel} className="text-green-600 border-green-200 hover:bg-green-50">
              <FileSpreadsheet className="w-4 h-4 mr-2" /> Exportar Excel
           </Button>
        </div>
      </div>

      <div className="px-4">
        <Card className="border-none shadow-sm overflow-hidden bg-card/50 backdrop-blur-sm overflow-x-auto movements-table">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-auto sm:w-[180px]">Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead className="text-center w-8"></TableHead>
                <TableHead>Destino</TableHead>
                <TableHead className="hidden-mobile-col">Referencia</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMovements?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground font-medium">
                    No hay movimientos registrados.
                  </TableCell>
                </TableRow>
              ) : (
                filteredMovements?.map((m) => {
                  const isReversion = m.motivo?.startsWith('[REVERSIÓN]');
                  return (
                    <TableRow key={m.id} className={`group hover:bg-primary/5 ${isReversion ? 'opacity-60 bg-muted/20' : ''}`}>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {format(new Date(m.fecha), "dd/MM HH:mm:ss", { locale: es })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={m.tipo === 'DECOMPOSITION' ? 'bg-orange-500/10 text-orange-600 border-orange-200' : 'bg-blue-500/10 text-blue-600 border-blue-200'}>
                          {m.tipo === 'DECOMPOSITION' ? 'DESCOMPOSICIÓN' : 'MANUAL'}
                        </Badge>
                        {isReversion && (
                          <Badge variant="secondary" className="ml-2 bg-red-100 text-red-600 border-red-200 text-[10px]">REVERTIDO</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-black text-sm">{m.producto_origen_cod}</span>
                          <span className="text-[10px] text-muted-foreground uppercase">Qty: -{m.cantidad_origen}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <ArrowRight className="w-4 h-4 text-muted-foreground opacity-50" />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-black text-sm text-primary">{m.producto_destino_cod}</span>
                          <span className="text-[10px] text-primary/70 uppercase font-bold">Qty: +{m.cantidad_destino}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden-mobile-col">
                        <span className="text-xs font-mono opacity-60">
                          {m.referencia_transaccion || '---'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleRevertMovement(m)}
                          disabled={isReversion}
                          title="Revertir Movimiento"
                        >
                          <History className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
