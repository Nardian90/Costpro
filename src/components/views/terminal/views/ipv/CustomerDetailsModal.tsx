'use client';

import React, { useState, useEffect } from 'react';
import { db, type Customer } from '@/lib/dexie';
import { getCustomerStats } from '@/lib/ipv/identity/registry';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  User,
  Phone,
  CreditCard,
  TrendingUp,
  History,
  AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface CustomerDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
}

export function CustomerDetailsModal({
  open,
  onOpenChange,
  customer,
}: CustomerDetailsModalProps) {
  const [stats, setStats] = useState<{ totalTransactions: number; totalAmountCents: number } | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (customer && open) {
      loadData();
    }
  }, [customer, open]);

  const loadData = async () => {
    if (!customer) return;
    try {
      setLoading(true);
      const s = await getCustomerStats(customer.ci);
      setStats(s);

      const txs = await db.bank_statements
        .where('carnet')
        .equals(customer.ci)
        .reverse()
        .limit(20)
        .toArray();
      setTransactions(txs);
    } catch (error) {
      console.error('Error loading customer details:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!customer) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] h-[80vh] flex flex-col p-0 overflow-hidden border-none rounded-3xl shadow-2xl">
        <DialogHeader className="p-6 bg-primary/10 border-b border-primary/20 shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center">
              <User className="w-6 h-6 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl font-black">{customer.nombre}</DialogTitle>
              <p className="text-sm font-mono text-muted-foreground">{customer.ci}</p>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 p-6">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="neu-card border-none bg-muted/30">
                <CardHeader className="p-4 pb-2">
                  <CardDescription className="text-[10px] font-black uppercase flex items-center gap-1">
                    <History className="w-3 h-3" /> Transacciones
                  </CardDescription>
                  <CardTitle className="text-2xl font-black">
                    {stats?.totalTransactions || 0}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card className="neu-card border-none bg-muted/30">
                <CardHeader className="p-4 pb-2">
                  <CardDescription className="text-[10px] font-black uppercase flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> Total Gastado
                  </CardDescription>
                  <CardTitle className="text-2xl font-black text-primary">
                    ${((stats?.totalAmountCents || 0) / 100).toLocaleString('es-CU', { minimumFractionDigits: 2 })}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card className="neu-card border-none bg-muted/30">
                <CardHeader className="p-4 pb-2">
                  <CardDescription className="text-[10px] font-black uppercase flex items-center gap-1">
                    <Phone className="w-3 h-3" /> Contacto
                  </CardDescription>
                  <CardTitle className="text-sm font-bold truncate">
                    {customer.phone || 'N/A'}
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                <History className="w-4 h-4 text-primary" />
                Historial de Transacciones (Últimas 20)
              </h3>

              <div className="rounded-2xl border border-border/40 overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="text-[10px] font-black uppercase">Fecha</TableHead>
                      <TableHead className="text-[10px] font-black uppercase">Referencia</TableHead>
                      <TableHead className="text-[10px] font-black uppercase text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.length > 0 ? (
                      transactions.map((tx) => (
                        <TableRow key={tx.referencia_origen} className="hover:bg-primary/5 border-border/30">
                          <TableCell className="text-xs font-medium">
                            {format(new Date(tx.fecha), 'dd MMM yyyy', { locale: es })}
                          </TableCell>
                          <TableCell className="text-[10px] font-mono opacity-70">
                            {tx.referencia_origen}
                          </TableCell>
                          <TableCell className="text-right font-bold text-xs">
                            ${((tx.importe_venta_cents || tx.importe_cents || 0) / 100).toLocaleString('es-CU', { minimumFractionDigits: 2 })}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={3} className="h-24 text-center">
                          <div className="flex flex-col items-center gap-1 opacity-40">
                            <AlertCircle className="w-6 h-6" />
                            <p className="text-xs font-bold uppercase">Sin movimientos</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            {customer.raw_names.length > 1 && (
              <div className="space-y-2">
                <h3 className="text-sm font-black uppercase tracking-widest">Nombres Detectados</h3>
                <div className="flex flex-wrap gap-2">
                  {customer.raw_names.map((name, i) => (
                    <Badge key={i} variant="outline" className="text-[10px] opacity-70">
                      {name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
