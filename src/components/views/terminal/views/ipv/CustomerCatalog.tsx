'use client';

import React, { useState, useMemo, useEffect } from 'react';
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Search,
  User,
  Phone,
  CreditCard,
  RefreshCw,
  UserPlus,
  ShieldCheck,
  AlertCircle,
  Clock,
  ExternalLink,
  Edit,
  Trash2,
  Download,
  AlertTriangle,
  History,
  TrendingUp,
  Database
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { propagateIdentity, getAllCustomerStats, deleteCustomer, type CustomerStats, syncCatalogFromTransactions } from '@/lib/ipv/identity/registry';
import { toast } from 'sonner';
import { CustomerFormDialog } from './CustomerFormDialog';
import { CustomerDetailsModal } from './CustomerDetailsModal';
import { IdentityConflictPanel } from './IdentityConflictPanel';

export function CustomerCatalog() {
  const [searchTerm, setSearchTerm] = useState('');
  const [isPropagating, setIsPropagating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState('catalog');

  const [formOpen, setFormOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const [stats, setStats] = useState<Record<string, CustomerStats>>({});

  const customers = useLiveQuery(() => db.customers.toArray()) || [];
  const conflictCount = useLiveQuery(() => db.identity_audit.where('tipo').equals('CONFLICT').count()) || 0;

  useEffect(() => {
    loadStats();
  }, [customers]);

  const loadStats = async () => {
    const s = await getAllCustomerStats();
    setStats(s);
  };

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

  const handleSyncFromTransactions = async () => {
    try {
      setIsSyncing(true);
      const imported = await syncCatalogFromTransactions();
      toast.success(`Sincronización completada: ${imported} nuevos clientes detectados`);
    } catch (error) {
      console.error('Error syncing from transactions:', error);
      toast.error('Error al sincronizar con transacciones');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDelete = async (ci: string) => {
    if (confirm('¿Está seguro de que desea eliminar este cliente?')) {
      try {
        await deleteCustomer(ci);
        toast.success('Cliente eliminado');
      } catch (error) {
        console.error('Error deleting customer:', error);
        toast.error('Error al eliminar el cliente');
      }
    }
  };

  const handleExport = () => {
    try {
      const headers = ['CI', 'Nombre', 'Estado', 'Teléfono', 'Tarjeta', 'Origen', 'Transacciones', 'Monto Total'];
      const rows = filteredCustomers.map(c => {
        const s = stats[c.ci] || { totalTransactions: 0, totalAmountCents: 0 };
        return [
          c.ci,
          c.nombre,
          c.status,
          c.phone || '',
          c.card_number || '',
          c.source,
          s.totalTransactions,
          (s.totalAmountCents / 100).toFixed(2)
        ];
      });

      const csvContent = [headers, ...rows].map(e => e.join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Catalogo_Clientes_${format(new Date(), 'yyyyMMdd')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Catálogo exportado exitosamente');
    } catch (error) {
      console.error('Error exporting catalog:', error);
      toast.error('Error al exportar el catálogo');
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
    <div className="space-y-adaptive">
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
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          <Button
            onClick={handleSyncFromTransactions}
            disabled={isSyncing}
            variant="outline"
            className="neu-btn gap-2 flex-1 sm:flex-none"
            title="Sincronizar desde Transacciones"
          >
            <Database className={`w-4 h-4 ${isSyncing ? 'animate-pulse' : ''}`} />
            <span className="hidden xs:inline">Actualizar Catálogo</span>
            <span className="inline xs:hidden">Act. Catálogo</span>
          </Button>
          <Button
            onClick={handlePropagate}
            disabled={isPropagating}
            variant="outline"
            className="neu-btn gap-2 flex-1 sm:flex-none"
            title="Propagar Identidad a Historico"
          >
            <RefreshCw className={`w-4 h-4 ${isPropagating ? 'animate-spin' : ''}`} />
            <span className="hidden xs:inline">Re-Sincronizar</span>
            <span className="inline xs:hidden">Re-Sync</span>
          </Button>
          <Button
            className="neu-btn-primary gap-2 flex-1 sm:flex-none"
            onClick={() => {
              setSelectedCustomer(null);
              setFormOpen(true);
            }}
          >
            <UserPlus className="w-4 h-4" />
            <span className="hidden sm:inline">Nuevo Cliente</span>
            <span className="inline sm:hidden">+ Cliente</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-adaptive">
        <Card className="neu-card border-none bg-card/50 shadow-md p-4">
          <CardHeader className="pb-2 p-0">
            <CardDescription className="badge-responsive flex items-center gap-1">
                <User className="w-3 h-3 shrink-0" /> <span className="label-no-wrap">Total Clientes</span>
            </CardDescription>
            <CardTitle className="text-2xl md:text-3xl font-black">{customers.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="neu-card border-none bg-card/50 shadow-md p-4">
          <CardHeader className="pb-2 p-0">
            <CardDescription className="badge-responsive flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-green-500 shrink-0" /> <span className="label-no-wrap">Completos</span>
            </CardDescription>
            <CardTitle className="text-2xl md:text-3xl font-black text-green-500">
              {customers.filter(c => c.status === 'COMPLETO').length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="neu-card border-none bg-card/50 shadow-md p-4">
          <CardHeader className="pb-2 p-0">
            <CardDescription className="badge-responsive flex items-center gap-1">
                <Clock className="w-3 h-3 text-blue-500 shrink-0" /> <span className="label-no-wrap">Detectados Auto</span>
            </CardDescription>
            <CardTitle className="text-2xl md:text-3xl font-black text-blue-500">
              {customers.filter(c => c.source === 'AUTOMATICO').length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="neu-card border-none bg-card/50 shadow-md p-4">
          <CardHeader className="pb-2 p-0">
            <CardDescription className="badge-responsive flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-orange-500 shrink-0" /> <span className="label-no-wrap">Conflictos</span>
            </CardDescription>
            <CardTitle className="text-2xl md:text-3xl font-black text-orange-500">
              {conflictCount}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Tabs defaultValue="catalog" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-muted/30 p-1 rounded-2xl mb-4">
          <TabsTrigger value="catalog" className="rounded-xl px-4 md:px-6 data-[state=active]:bg-primary data-[state=active]:text-white transition-all">
            <User className="w-4 h-4 mr-2" />
            Catálogo
          </TabsTrigger>
          <TabsTrigger value="conflicts" className="rounded-xl px-4 md:px-6 data-[state=active]:bg-orange-500 data-[state=active]:text-white transition-all relative">
            <AlertTriangle className="w-4 h-4 mr-2" />
            Conflictos
            {conflictCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm ring-2 ring-background">
                    {conflictCount}
                </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="catalog" className="mt-0">
          <Card className="border-none shadow-xl bg-card/30 backdrop-blur-md overflow-hidden rounded-3xl">
            <div className="p-4 border-b border-border/50 flex flex-col md:flex-row items-center gap-4 bg-muted/20">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre, CI, teléfono o tarjeta..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-10 bg-background/50 border-none focus-visible:ring-1 focus-visible:ring-primary/30 font-medium"
                />
              </div>
              <Button
                variant="outline"
                className="neu-btn gap-2 w-full md:w-auto"
                onClick={handleExport}
                disabled={filteredCustomers.length === 0}
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Exportar CSV</span>
                <span className="inline sm:hidden">Exportar</span>
              </Button>
            </div>

            <div className="table-container">
              <Table className="table-responsive">
                <TableHeader className="bg-muted/30">
                  <TableRow className="hover:bg-transparent border-border/50">
                    <TableHead className="text-[10px] font-black uppercase tracking-widest py-4">Cliente / CI</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-widest py-4 text-center">Estado</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-widest py-4">Contacto / Pago</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-widest py-4">Estadísticas</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-widest py-4">Origen</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-widest py-4 text-right px-6">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.length > 0 ? (
                    filteredCustomers.map((customer) => {
                      const cStats = stats[customer.ci] || { totalTransactions: 0, totalAmountCents: 0 };
                      return (
                        <TableRow key={customer.ci} className="hover:bg-primary/5 transition-colors border-border/40 group">
                          <TableCell className="py-4">
                            <div className="flex flex-col min-w-[120px]">
                              <span className="font-bold text-sm whitespace-nowrap overflow-hidden text-ellipsis">{customer.nombre}</span>
                              <span className="text-[10px] font-mono text-muted-foreground">{customer.ci}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {getStatusBadge(customer.status)}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1 min-w-[120px]">
                              <div className="flex items-center gap-1.5 text-[10px] font-medium opacity-80">
                                <Phone className="w-3 h-3 text-muted-foreground shrink-0" />
                                <span className="label-no-wrap">{customer.phone || '—'}</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px] font-mono opacity-60">
                                <CreditCard className="w-3 h-3 text-muted-foreground shrink-0" />
                                <span className="label-no-wrap">{customer.card_number || '—'}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1 min-w-[80px]">
                              <div className="flex items-center gap-1.5 text-[10px] font-bold">
                                <History className="w-3 h-3 text-muted-foreground shrink-0" />
                                <span>{cStats.totalTransactions} tx</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px] font-black text-primary">
                                <TrendingUp className="w-3 h-3 shrink-0" />
                                <span>${(cStats.totalAmountCents / 100).toLocaleString('es-CU', { minimumFractionDigits: 2 })}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase opacity-60">
                              {getSourceIcon(customer.source)}
                              {customer.source}
                            </div>
                          </TableCell>
                          <TableCell className="text-right px-6">
                            <div className="action-buttons-mobile justify-end">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 hover:bg-primary/10 group-hover:opacity-100 opacity-70 transition-opacity shrink-0"
                                onClick={() => {
                                  setSelectedCustomer(customer);
                                  setDetailsOpen(true);
                                }}
                                title="Ver Detalles"
                              >
                                <ExternalLink className="w-4 h-4 text-primary" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 hover:bg-blue-500/10 group-hover:opacity-100 opacity-70 transition-opacity shrink-0"
                                onClick={() => {
                                  setSelectedCustomer(customer);
                                  setFormOpen(true);
                                }}
                                title="Editar Cliente"
                              >
                                <Edit className="w-4 h-4 text-blue-500" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 hover:bg-destructive/10 group-hover:opacity-100 opacity-70 transition-opacity shrink-0"
                                onClick={() => handleDelete(customer.ci)}
                                title="Eliminar Cliente"
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
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
        </TabsContent>

        <TabsContent value="conflicts" className="mt-0">
          <IdentityConflictPanel />
        </TabsContent>
      </Tabs>

      <CustomerFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        customer={selectedCustomer || undefined}
        onSave={() => loadStats()}
      />

      <CustomerDetailsModal
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        customer={selectedCustomer}
      />
    </div>
  );
}
