'use client';

import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/dexie';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, Filter } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';

export function TransactionBreakdown() {
  const [searchTerm, setSearchTerm] = useState('');
  const lines = useLiveQuery(() => db.reconciliation_lines.toArray());
  const products = useLiveQuery(() => db.products.toArray());
  const transactions = useLiveQuery(() => db.bank_statements.toArray());

  const txMap = useMemo(() => {
    if (!transactions) return new Map();
    return new Map(transactions.map(t => [t.referencia_origen, t]));
  }, [transactions]);

  const productMap = useMemo(() => {
    if (!products) return new Map();
    return new Map(products.map(p => [p.cod, p]));
  }, [products]);

  const filteredLines = useMemo(() => {
    if (!lines) return [];
    return lines.filter(l => {
      const tx = txMap.get(l.transaction_ref);
      const prod = productMap.get(l.product_cod);
      const search = searchTerm.toLowerCase();

      return (
        l.transaction_ref.toLowerCase().includes(search) ||
        l.product_cod.toLowerCase().includes(search) ||
        (prod?.descripcion.toLowerCase().includes(search)) ||
        (tx?.observaciones.toLowerCase().includes(search))
      );
    }).sort((a, b) => b.fecha_operacion.localeCompare(a.fecha_operacion));
  }, [lines, txMap, productMap, searchTerm]);

  const total = useMemo(() => {
      return filteredLines.reduce((sum, l) => sum + l.importe_linea_cents, 0);
  }, [filteredLines]);

  return (
    <div className="space-y-4">
      <div className="p-4 bg-background/50 border-b flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="relative flex-1 w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por transacción, producto o descripción..."
            className="pl-10 h-10 text-xs"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-4">
            <div className="text-right">
                <p className="text-[10px] font-black text-muted-foreground uppercase">Total Filtrado</p>
                <p className="text-lg font-black text-primary">{formatCurrency(total)}</p>
            </div>
            <Badge variant="outline" className="h-10 px-4 font-black text-xs gap-2">
                <Filter className="w-3 h-3" />
                {filteredLines.length} Líneas
            </Badge>
        </div>
      </div>

      <div className="table-scroll-wrapper">
        <Table className="data-table">
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Ref. Transacción / Origen</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead className="text-center">Cant.</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead className="text-right">Importe</TableHead>
              <TableHead>Tipo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground font-bold uppercase text-[10px]">
                  No se encontraron líneas de detalle.
                </TableCell>
              </TableRow>
            ) : (
              filteredLines.map((l) => {
                const tx = txMap.get(l.transaction_ref);
                const prod = productMap.get(l.product_cod);
                const isAdjusted = prod && Math.abs(l.precio_unitario_cents - prod.precio_cents) > 0.001;

                return (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs font-medium">{formatDate(l.fecha_operacion)}</TableCell>
                    <TableCell>
                      <div className="text-[10px] font-black text-primary truncate max-w-[200px]" title={l.transaction_ref}>
                        {l.transaction_ref}
                      </div>
                      <div className="text-[9px] text-muted-foreground truncate max-w-[200px]" title={tx?.observaciones}>
                        {tx?.observaciones || 'Ajuste Manual / Global'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-bold">{prod?.descripcion || (l.product_cod === 'CASH' ? 'AJUSTE/REBAJA' : l.product_cod)}</div>
                      <div className="text-[9px] text-muted-foreground font-mono">{l.product_cod}</div>
                      {l.clasificacion === 'Rebaja/Ajuste' && (
                          <Badge className="bg-orange-500/10 text-orange-600 text-[8px] h-3 px-1 mt-1 font-black">REBAJA</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center font-bold text-xs">{l.cantidad}</TableCell>
                    <TableCell className="text-right">
                      <div className={`text-xs font-bold ${isAdjusted ? 'text-purple-600' : ''}`}>
                        {formatCurrency(l.precio_unitario_cents)}
                      </div>
                      {isAdjusted && (
                        <div className="text-[8px] line-through opacity-50">{formatCurrency(prod.precio_cents)}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-black text-xs">
                        {formatCurrency(l.importe_linea_cents)}
                    </TableCell>
                    <TableCell>
                        <Badge variant="outline" className={`text-[8px] font-black uppercase ${
                            l.origen_dato === 'AUTO_MATCH' ? 'border-green-200 text-green-600' :
                            l.origen_dato === 'CASH_FILLER' ? 'border-orange-200 text-orange-600' :
                            'border-blue-200 text-blue-600'
                        }`}>
                            {l.origen_dato}
                        </Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
