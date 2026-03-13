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
  History,
  Info
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function MovementsView() {
  const [searchTerm, setSearchTerm] = useState('');

  const movements = useLiveQuery(
    () => db.product_movements.orderBy('fecha').reverse().toArray()
  );

  const clearMovements = async () => {
    if (window.confirm('¿Seguro que quieres borrar el historial de movimientos?')) {
      await db.product_movements.clear();
      toast.success('Historial borrado');
    }
  };

  const filteredMovements = movements?.filter(m =>
    m.producto_origen_cod.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.producto_destino_cod.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (m.provenance && m.provenance.toLowerCase().includes(searchTerm.toLowerCase())) ||
    m.referencia_transaccion?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getBadgeStyle = (tipo: string) => {
      switch(tipo) {
          case 'DECOMPOSITION': return 'bg-orange-500/10 text-orange-600 border-orange-200';
          case 'IMPORT': return 'bg-emerald-500/10 text-emerald-600 border-emerald-200';
          case 'PRICE_ADJUSTMENT': return 'bg-purple-500/10 text-purple-600 border-purple-200';
          default: return 'bg-blue-500/10 text-blue-600 border-blue-200';
      }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-background/50 p-4 border-b">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por código, ref o origen..."
            className="pl-10 h-10 text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
           <Button variant="outline" size="sm" onClick={clearMovements} className="text-destructive border-destructive/20 hover:bg-destructive/10">
              <Trash2 className="w-4 h-4 mr-2" /> Vaciar Historial
           </Button>
        </div>
      </div>

      <div className="px-4 pb-12">
        <Card className="border-none shadow-sm overflow-hidden bg-card/50 backdrop-blur-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-[180px]">Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Movimiento / Detalle</TableHead>
                <TableHead>Procedencia</TableHead>
                <TableHead>Referencia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMovements?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground font-medium">
                    No hay movimientos registrados.
                  </TableCell>
                </TableRow>
              ) : (
                filteredMovements?.map((m) => (
                  <TableRow key={m.id} className="group hover:bg-primary/5">
                    <TableCell className="text-[10px] font-mono text-muted-foreground">
                      {format(new Date(m.fecha), "dd MMM, HH:mm:ss", { locale: es })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[9px] px-1 font-black ${getBadgeStyle(m.tipo)}`}>
                        {m.tipo}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {m.tipo === 'PRICE_ADJUSTMENT' ? (
                          <div className="flex items-center gap-2">
                              <Badge className="bg-purple-500 text-white font-black">{m.producto_destino_cod}</Badge>
                              <span className="text-xs font-bold text-muted-foreground">Cambio de Precio</span>
                          </div>
                      ) : (
                          <div className="flex items-center gap-3">
                            <div className="flex flex-col">
                                <span className="font-black text-sm">{m.producto_origen_cod}</span>
                                <span className="text-[10px] text-muted-foreground uppercase">-{m.cantidad_origen}</span>
                            </div>
                            <ArrowRight className="w-3 h-3 text-muted-foreground opacity-30" />
                            <div className="flex flex-col">
                                <span className="font-black text-sm text-primary">{m.producto_destino_cod}</span>
                                <span className="text-[10px] text-primary/70 uppercase font-black">+{m.cantidad_destino}</span>
                            </div>
                          </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                          <Info className="w-3 h-3 text-muted-foreground opacity-50" />
                          <span className="text-[10px] font-bold uppercase tracking-tighter">{m.provenance || '---'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-mono opacity-60">
                        {m.referencia_transaccion || '---'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
