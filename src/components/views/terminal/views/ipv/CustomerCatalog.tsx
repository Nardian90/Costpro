'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { db, type Customer } from "@/lib/dexie";
import { normalizeName } from "@/lib/ipv/identity/normalization";
import { getHybridCustomers, propagateIdentity, getAllCustomerStats } from "@/lib/ipv/identity/registry";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Save, RefreshCw, Trash2, Edit3, UserPlus, UserCheck, UserX, AlertTriangle, Users, CreditCard, Phone, Hash, Banknote } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from "@/components/ui/badge";
import { formatDate, formatCurrency } from "@/lib/utils";
import { BaseModal } from "@/components/ui/BaseModal";

export function CustomerCatalog() {
    const [searchTerm, setSearchTerm] = useState('');
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [editingCi, setEditingCi] = useState<string | null>(null);
    const [editData, setEditData] = useState<Partial<Customer>>({});
    const [isPropagating, setIsPropagating] = useState(false);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newCustomer, setNewCustomer] = useState<Partial<Customer>>({ ci: '', nombre: '', phone: '', card_number: '' });
    const [customerStats, setCustomerStats] = useState<Record<string, { totalTransactions: number; totalAmountCents: number }>>({});
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, [searchTerm]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            // SINGLE SOURCE OF TRUTH: Hybrid Catalog (Dexie Master + Transactions)
            const allHybrid = await getHybridCustomers();

            let filtered = allHybrid;
            if (searchTerm) {
                const lowSearch = searchTerm.toLowerCase();
                filtered = allHybrid.filter(c =>
                    c.nombre.toLowerCase().includes(lowSearch) ||
                    c.ci.toLowerCase().includes(lowSearch) ||
                    (c.normalized_name && c.normalized_name.toLowerCase().includes(normalizeName(lowSearch)))
                );
            }

            setCustomers(filtered);

            // Load stats
            const stats = await getAllCustomerStats();
            setCustomerStats(stats);

            // CONSISTENCY CHECK
            const txCount = Object.keys(stats).length;
            if (txCount > 0 && filtered.length === 0 && !searchTerm) {
                console.error("Inconsistencia crítica: Se detectaron transacciones pero el catálogo híbrido está vacío.");
            }
        } catch (error) {
            console.error("Error loading hybrid catalog:", error);
            toast.error("Error al cargar el catálogo de clientes");
        } finally {
            setIsLoading(false);
        }
    };

    const handleEdit = (customer: Customer) => {
        setEditingCi(customer.ci);
        setEditData(customer);
    };

    const handleSaveEdit = async (ci: string) => {
        if (!editData.nombre) {
            toast.error("El nombre es obligatorio");
            return;
        }

        // Validation: Phone
        if (editData.phone && (!editData.phone.startsWith('53') || editData.phone.length !== 10)) {
            toast.error("Teléfono inválido. Debe iniciar con 53 y tener 10 dígitos.");
            return;
        }

        // Validation: Card
        if (editData.card_number && (editData.card_number.length !== 16 || !/^\d+$/.test(editData.card_number))) {
            toast.error("Número de tarjeta inválido. Debe tener 16 dígitos.");
            return;
        }

        const normalized_name = normalizeName(editData.nombre);
        const status = (ci && editData.nombre && editData.phone && editData.card_number) ? "COMPLETO" : "PARCIAL";

        // Persist change to Dexie Master
        await db.customers.put({
            ...editData,
            ci,
            normalized_name,
            status,
            source: "MANUAL",
            updated_at: new Date().toISOString()
        } as Customer);

        toast.success("Cliente actualizado en catálogo maestro");
        setEditingCi(null);
        loadData();
    };

    const handleAddCustomer = async () => {
        if (!newCustomer.ci || !newCustomer.nombre) {
            toast.error("CI y Nombre son obligatorios");
            return;
        }

        const existing = await db.customers.get(newCustomer.ci);
        if (existing) {
            toast.error("Ya existe un cliente con este CI en el catálogo");
            return;
        }

        // Validation: Phone
        if (newCustomer.phone && (!newCustomer.phone.startsWith('53') || newCustomer.phone.length !== 10)) {
            toast.error("Teléfono inválido. Debe iniciar con 53 y tener 10 dígitos.");
            return;
        }

        // Validation: Card
        if (newCustomer.card_number && (newCustomer.card_number.length !== 16 || !/^\d+$/.test(newCustomer.card_number))) {
            toast.error("Número de tarjeta inválido. Debe tener 16 dígitos.");
            return;
        }

        const normalized_name = normalizeName(newCustomer.nombre);
        const status = (newCustomer.ci && newCustomer.nombre && newCustomer.phone && newCustomer.card_number) ? "COMPLETO" : "PARCIAL";

        await db.customers.add({
            ...newCustomer,
            normalized_name,
            status,
            source: "MANUAL",
            raw_names: [newCustomer.nombre!],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        } as Customer);

        toast.success("Cliente registrado con éxito");
        setIsAddModalOpen(false);
        setNewCustomer({ ci: '', nombre: '', phone: '', card_number: '' });
        loadData();
    };

    const handleDelete = async (ci: string) => {
        if (confirm('¿Está seguro de eliminar este cliente del catálogo maestro? Esto no eliminará sus transacciones.')) {
            await db.customers.delete(ci);
            toast.success("Cliente eliminado del catálogo maestro");
            loadData();
        }
    };

    const handlePropagate = async () => {
        setIsPropagating(true);
        try {
            const affected = await propagateIdentity();
            toast.success(`Identidad propagada a ${affected} transacciones`);
            loadData();
        } catch (error) {
            toast.error("Error al propagar identidad");
        } finally {
            setIsPropagating(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                <div className="relative w-full md:max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar por nombre o CI..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="pl-10 font-bold"
                    />
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    <Button
                        variant="outline"
                        onClick={handlePropagate}
                        disabled={isPropagating}
                        className="flex-1 md:flex-none font-black text-xs uppercase"
                    >
                        <RefreshCw className={`w-4 h-4 mr-2 ${isPropagating ? 'animate-spin' : ''}`} />
                        Sincronizar Reportes
                    </Button>
                    <Button
                        onClick={() => setIsAddModalOpen(true)}
                        className="flex-1 md:flex-none font-black text-xs uppercase bg-emerald-600 hover:bg-emerald-700"
                    >
                        <UserPlus className="w-4 h-4 mr-2" />
                        Nuevo Cliente
                    </Button>
                </div>
            </div>

            <div className="rounded-xl border bg-card overflow-hidden">
                <Table>
                    <TableHeader className="bg-muted/50">
                        <TableRow>
                            <TableHead className="w-[120px] font-black uppercase text-[10px]">CI / Pasaporte</TableHead>
                            <TableHead className="font-black uppercase text-[10px]">Nombre Completo</TableHead>
                            <TableHead className="font-black uppercase text-[10px]">Contacto / Tarjeta</TableHead>
                            <TableHead className="text-center font-black uppercase text-[10px]">Operaciones</TableHead>
                            <TableHead className="text-right font-black uppercase text-[10px]">Total Operado</TableHead>
                            <TableHead className="font-black uppercase text-[10px]">Estado</TableHead>
                            <TableHead className="text-right font-black uppercase text-[10px]">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {customers.map((c) => {
                            const stats = customerStats[c.ci] || { totalTransactions: 0, totalAmountCents: 0 };
                            return (
                                <TableRow key={c.ci || c.nombre} className="hover:bg-muted/30 transition-colors">
                                    <TableCell className="font-mono font-bold text-xs">
                                        {c.ci || "—"}
                                    </TableCell>
                                    <TableCell>
                                        {editingCi === c.ci ? (
                                            <Input
                                                value={editData.nombre || ''}
                                                onChange={e => setEditData({...editData, nombre: e.target.value})}
                                                className="h-8 text-xs font-black uppercase"
                                            />
                                        ) : (
                                            <div className="space-y-0.5">
                                                <span className="text-xs font-black uppercase block">{c.nombre || "—"}</span>
                                                {c.raw_names && c.raw_names.length > 0 && (
                                                    <span className="text-[9px] text-muted-foreground italic truncate block max-w-[200px]">
                                                        {c.raw_names.join(', ')}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <div className="space-y-1">
                                            {editingCi === c.ci ? (
                                                <>
                                                    <div className="flex items-center gap-1">
                                                        <Phone className="w-3 h-3 text-muted-foreground" />
                                                        <Input
                                                            value={editData.phone || ''}
                                                            onChange={e => setEditData({...editData, phone: e.target.value})}
                                                            className="h-7 text-[10px] font-bold py-0 px-2"
                                                            placeholder="53XXXXXXXX"
                                                        />
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <CreditCard className="w-3 h-3 text-muted-foreground" />
                                                        <Input
                                                            value={editData.card_number || ''}
                                                            onChange={e => setEditData({...editData, card_number: e.target.value})}
                                                            className="h-7 text-[10px] font-mono py-0 px-2"
                                                            placeholder="16 dígitos"
                                                        />
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="flex items-center gap-1.5">
                                                        <Phone className="w-3 h-3 text-muted-foreground" />
                                                        <span className="text-xs font-bold">{c.phone || '—'}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                        <CreditCard className="w-3 h-3 text-muted-foreground" />
                                                        <span className="text-[10px] font-mono">{c.card_number || '—'}</span>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Badge variant="secondary" className="font-black text-xs h-6 px-3">
                                            {stats.totalTransactions}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <span className="font-black text-xs text-emerald-600">
                                            {formatCurrency(stats.totalAmountCents)}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={c.status === 'COMPLETO' ? 'default' : c.status === 'PENDIENTE' ? 'destructive' : 'outline'}
                                            className="text-[9px] font-black"
                                        >
                                            {c.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-1">
                                            {editingCi === c.ci ? (
                                                <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-500" onClick={() => handleSaveEdit(c.ci)}>
                                                    <Save className="w-4 h-4" />
                                                </Button>
                                            ) : (
                                                <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" onClick={() => handleEdit(c)}>
                                                    <Edit3 className="w-4 h-4" />
                                                </Button>
                                            )}
                                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(c.ci)}>
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                        {customers.length === 0 && !isLoading && (
                            <TableRow>
                                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground italic">
                                    No se encontraron clientes en el catálogo.
                                </TableCell>
                            </TableRow>
                        )}
                        {isLoading && (
                            <TableRow>
                                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                                    Cargando clientes híbridos...
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            <BaseModal
                open={isAddModalOpen}
                onOpenChange={(open) => setIsAddModalOpen(open)}
                title="Agregar Nuevo Cliente"
                description="Complete la información del cliente para el catálogo maestro."
            >
                <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-black uppercase">CI / Documento</Label>
                            <Input
                                placeholder="11 dígitos"
                                value={newCustomer.ci}
                                onChange={e => setNewCustomer({ ...newCustomer, ci: e.target.value })}
                                className="font-mono font-bold"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-black uppercase">Nombre Completo</Label>
                            <Input
                                placeholder="NOMBRE APELLIDO"
                                value={newCustomer.nombre}
                                onChange={e => setNewCustomer({ ...newCustomer, nombre: e.target.value.toUpperCase() })}
                                className="font-black"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-black uppercase">Teléfono Movil</Label>
                            <Input
                                placeholder="53XXXXXXXX"
                                value={newCustomer.phone}
                                onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                                className="font-bold"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-black uppercase">Número de Tarjeta</Label>
                            <Input
                                placeholder="16 dígitos"
                                value={newCustomer.card_number}
                                onChange={e => setNewCustomer({ ...newCustomer, card_number: e.target.value })}
                                className="font-mono"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleAddCustomer} className="font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-700">Guardar Cliente</Button>
                    </div>
                </div>
            </BaseModal>
        </div>
    );
}
