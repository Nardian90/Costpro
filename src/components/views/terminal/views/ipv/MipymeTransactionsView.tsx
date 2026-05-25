'use client';

import React, { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/dexie';
import { parseTransactionMetadata } from '@/lib/ipv/metadata-parser';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatCurrencyCents, formatDate } from '@/lib/utils';
import { Users, FileText, AlertCircle } from 'lucide-react';

export function MipymeTransactionsView() {
  const transactions = useLiveQuery(() => db.bank_statements.orderBy('fecha').toArray());

  const mipymeTransactions = useMemo(() => {
    if (!transactions) return [];

    return transactions
      .map(tx => {
        const metadata = parseTransactionMetadata(tx.observaciones || '');
        return {
          ...tx,
          metadata
        };
      })
      .filter(tx => !!tx.metadata.nit);
  }, [transactions]);

  if (!transactions) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
        <div className="text-muted-foreground font-bold uppercase tracking-widest text-xs">
          Cargando transacciones...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 px-1">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-primary uppercase flex items-center gap-2">
            <Users className="w-6 h-6" /> Transacciones Mipyme
          </h2>
          <p className="text-sm text-muted-foreground font-medium">Análisis fiscal de registros con NIT</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 h-8 px-3 font-black uppercase">
            {mipymeTransactions.length} Registros detectados
          </Badge>
        </div>
      </div>

      <Card className="border-none shadow-xl bg-card/50 backdrop-blur-sm overflow-hidden rounded-3xl">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30 border-b-2">
                <TableHead className="font-black uppercase text-[10px] tracking-widest">Fecha (PD)</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest text-right">Transferencia Débito</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest text-right">Créditos</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest">Impuesto (RF)</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest text-right">Valor</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest">Referencia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mipymeTransactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center gap-3 opacity-40">
                      <FileText className="w-12 h-12" />
                      <p className="font-bold uppercase tracking-widest">No se detectaron transacciones con NIT</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                mipymeTransactions.map((tx) => {
                  const { metadata, tipo, referencia_origen } = tx;
                  const isDebit = tipo === 'Db';
                  const isCredit = tipo === 'Cr';

                  return (
                    <TableRow key={referencia_origen} className="hover:bg-primary/5 transition-colors group">
                      <TableCell className="font-bold text-xs">
                        {metadata.pd || formatDate(tx.fecha)}
                      </TableCell>
                      <TableCell className="text-right font-bold text-red-500 text-sm">
                        {isDebit ? formatCurrency(metadata.valor) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-bold text-green-500 text-sm">
                        {isCredit ? formatCurrency(metadata.valor) : '-'}
                      </TableCell>
                      <TableCell className="max-w-[250px]">
                        <div className="truncate text-xs font-medium" title={metadata.rf}>
                          {metadata.rf || '-'}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-black text-primary text-sm">
                        {formatCurrency(metadata.valor)}
                      </TableCell>
                      <TableCell className="font-mono text-[10px] opacity-50 group-hover:opacity-100">
                        {referencia_origen}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {mipymeTransactions.some(t => t.metadata.inconsistencies.length > 0) && (
          <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-2xl flex gap-3 items-start">
              <AlertCircle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
              <div>
                  <p className="text-xs font-black uppercase text-orange-600 mb-1">Inconsistencias Detectadas</p>
                  <p className="text-[10px] text-orange-600/80 font-medium leading-relaxed">
                      Algunos registros tienen campos faltantes o formato inesperado en las observaciones. Revise las transacciones marcadas para asegurar integridad fiscal.
                  </p>
              </div>
          </div>
      )}
    </div>
  );
}
