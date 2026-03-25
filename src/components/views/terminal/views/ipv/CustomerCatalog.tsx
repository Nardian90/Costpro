'use client';

import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Customer } from '@/lib/dexie';
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
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Search,
  User,
  Phone,
  CreditCard,
  Calendar,
  RefreshCw,
  UserPlus,
  ShieldCheck,
  AlertCircle,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { propagateIdentity } from '@/lib/ipv/identity/registry';
import { toast } from 'sonner';

export function CustomerCatalog() {
  const [searchTerm, setSearchTerm] = useState('');
  const [isPropagating, setIsPropagating] = useState(false);

  const customers = useLiveQuery(() => db.customers.toArray()) || [];

  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      const search = searchTerm.toLowerCase();
      return (
        c.nombre.toLowerCase().includes(search) ||
        c.ci.includes(search) ||
        (c.phone && c.phone.includes(search)) ||
        (c.card_number && c.card_number.includes(search))
      );
    });
  }, [customers, searchTerm]);

  const handlePropagate = async () => {
    try {
      setIsPropagating(true);
      const affected = await propagateIdentity();
      toast.success(`Identidad propagada a ${affected} transacciones`);
    } catch (error) {
      console.error('Error propagating identity:', error);
      toast.error('Error al propagar la identidad');
    } finally {
      setIsPropagating(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETO':
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Completo</Badge>;
      case 'PARCIAL':
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Parcial</Badge>;
      case 'PENDIENTE':
        return <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/20">Pendiente</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getSourceIcon = (source: string) => {
    return source === 'MANUAL' ? (
      <ShieldCheck className="w-3 h-3 text-blue-500" />
    ) : (
      <Clock className="w-3 h-3 text-muted-foreground" />
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <User className="w-6 h-6 text-primary" />
            Catálogo de Clientes
          </h2>
          <p className="text-muted-foreground text-sm font-medium uppercase tracking-wider">
            Gestión de identidades detectadas y registradas
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handlePropagate}
            disabled={isPropagating}
            variant="outline"
            className="neu-btn gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isPropagating ? 'animate-spin' : ''}`} />
            Re-Sincronizar
          </Button>
          <Button className="neu-btn-primary gap-2">
            <UserPlus className="w-4 h-4" />
            Nuevo Cliente
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card/50 backdrop-blur-sm border-none shadow-md">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest">Total Clientes</CardDescription>
            <CardTitle className="text-3xl font-black">{customers.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border-none shadow-md">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest">Completos</CardDescription>
            <CardTitle className="text-3xl font-black text-green-500">
              {customers.filter(c => c.status === 'COMPLETO').length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border-none shadow-md">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest">Detectados Auto</CardDescription>
            <CardTitle className="text-3xl font-black text-blue-500">
              {customers.filter(c => c.source === 'AUTOMATICO').length}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="border-none shadow-xl bg-card/30 backdrop-blur-md overflow-hidden rounded-3xl">
        <div className="p-4 border-b border-border/50 flex items-center gap-4 bg-muted/20">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, CI, teléfono o tarjeta..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-10 bg-background/50 border-none focus-visible:ring-1 focus-visible:ring-primary/30 font-medium"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="hover:bg-transparent border-border/50">
                <TableHead className="text-[10px] font-black uppercase tracking-widest py-4">Cliente / CI</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest py-4 text-center">Estado</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest py-4">Contacto</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest py-4">Finanzas</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest py-4">Origen</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest py-4 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCustomers.length > 0 ? (
                filteredCustomers.map((customer) => (
                  <TableRow key={customer.ci} className="hover:bg-primary/5 transition-colors border-border/40">
                    <TableCell className="py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-sm">{customer.nombre}</span>
                        <span className="text-[10px] font-mono text-muted-foreground">{customer.ci}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {getStatusBadge(customer.status)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 text-xs">
                          <Phone className="w-3 h-3 text-muted-foreground" />
                          <span className="font-medium">{customer.phone || '—'}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs">
                        <CreditCard className="w-3 h-3 text-muted-foreground" />
                        <span className="font-mono">{customer.card_number || '—'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase opacity-70">
                        {getSourceIcon(customer.source)}
                        {customer.source}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary/10">
                        <ExternalLink className="w-4 h-4 text-primary" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 opacity-50">
                      <AlertCircle className="w-8 h-8" />
                      <p className="text-sm font-bold uppercase tracking-widest">No se encontraron clientes</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
