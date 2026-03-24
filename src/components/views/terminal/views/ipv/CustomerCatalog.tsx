'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { db, type Customer } from "@/lib/dexie";
import { normalizeName } from "@/lib/ipv/identity/normalization";
import { propagateIdentity, getAllCustomerStats } from "@/lib/ipv/identity/registry";
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

    useEffect(() => {
        loadData();
    }, [searchTerm]);

    const loadData = async () => {
        let collection = db.customers.toCollection();
        if (searchTerm) {
            const lowSearch = searchTerm.toLowerCase();
            collection = db.customers.where('nombre').startsWithIgnoreCase(lowSearch)
                .or('ci').startsWith(lowSearch)
                .or('normalized_name').startsWithIgnoreCase(normalizeName(lowSearch));
        }
        const data = await collection.toArray();
        setCustomers(data.sort((a, b) => a.nombre.localeCompare(b.nombre)));

        // Load stats
        const stats = await getAllCustomerStats();
        setCustomerStats(stats);
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

        await db.customers.update(ci, {
            ...editData,
            normalized_name,
            status,
            source: "MANUAL",
            updated_at: new Date().toISOString()
        });

        toast.success("Cliente actualizado");
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
            toast.error("Ya existe un cliente con este CI");
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

        await db.customers.put({
            ci: newCustomer.ci,
            nombre: newCustomer.nombre.toUpperCase() as string,
            normalized_name,
            raw_names: [newCustomer.nombre] as string[],
            phone: newCustomer.phone,
            card_number: newCustomer.card_number,
            status,
            source: "MANUAL",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        });

        toast.success("Cliente agregado correctamente");
        setIsAddModalOpen(false);
        setNewCustomer({ ci: '', nombre: '', phone: '', card_number: '' });
        loadData();
    };

    const handleDelete = async (ci: string) => {
        if (confirm("¿Está seguro de eliminar este cliente?")) {
            await db.customers.delete(ci);
            toast.success("Cliente eliminado");
            loadData();
        }
    };

    const handlePropagate = async () => {
        setIsPropagating(true);
        try {
            const affectedTxs = await propagateIdentity();
            toast.success(`Propagación completada. ${affectedTxs} registros actualizados.`);
            loadData();
        } catch (error) {
            toast.error("Error durante la propagación");
        } finally {
            setIsPropagating(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                <div className="space-y-1">
                    <h2 className="text-2xl font-black uppercase tracking-tight flex items-center gap-3 text-primary">
                        <Users className="w-6 h-6" />
                        Catálogo Maestro de Clientes
                    </h2>
                    <p className="text-xs text-muted-foreground font-medium">Gestione la identidad centralizada para reportes IPV y conciliación.</p>
                </div>

                <div className="flex gap-3">
                    <Button
                        onClick={() => setIsAddModalOpen(true)}
                        className="h-11 rounded-2xl font-black uppercase tracking-widest text-xs gap-2 shadow-lg shadow-emerald-500/20 bg-emerald-600 hover:bg-emerald-700"
                    >
                        <UserPlus className="w-4 h-4" />
                        Nuevo Cliente
                    </Button>
                    <Button
                        onClick={handlePropagate}
                        disabled={isPropagating}
                        className="h-11 rounded-2xl font-black uppercase tracking-widest text-xs gap-2 shadow-lg shadow-primary/20"
                    >
                        <RefreshCw className={`w-4 h-4 ${isPropagating ? 'animate-spin' : ''}`} />
                        Propagar Cambios
                    </Button>
                </div>
            </div>

            <div className="flex gap-4 items-center bg-card/50 p-4 rounded-3xl border border-border/50">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar por CI, Nombre o Alias..."
                        className="pl-10 h-11 rounded-xl"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="rounded-3xl border border-border/50 overflow-hidden shadow-xl bg-card">
                <Table>
                    <TableHeader className="bg-muted/50">
                        <TableRow>
                            <TableHead className="text-[10px] font-black uppercase">Identidad (CI)</TableHead>
                            <TableHead className="text-[10px] font-black uppercase">Nombre del Cliente</TableHead>
                            <TableHead className="text-[10px] font-black uppercase">Contacto / Pago</TableHead>
                            <TableHead className="text-[10px] font-black uppercase text-center">Transacciones</TableHead>
                            <TableHead className="text-[10px] font-black uppercase text-right">Importe Total</TableHead>
                            <TableHead className="text-[10px] font-black uppercase">Estado</TableHead>
                            <TableHead className="text-[10px] font-black uppercase text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {customers.map((c) => {
                            const stats = customerStats[c.ci] || { totalTransactions: 0, totalAmountCents: 0 };
                            return (
                                <TableRow key={c.ci} className="hover:bg-muted/30 transition-colors">
                                    <TableCell className="font-mono text-xs font-bold">{c.ci}</TableCell>
                                    <TableCell>
                                        {editingCi === c.ci ? (
                                            <Input
                                                value={editData.nombre || ''}
                                                onChange={e => setEditData({...editData, nombre: e.target.value})}
                                                className="h-8 text-xs font-black uppercase"
                                            />
                                        ) : (
                                            <div className="space-y-0.5">
                                                <span className="text-xs font-black uppercase block">{c.nombre}</span>
                                                <span className="text-[9px] text-muted-foreground italic truncate block max-w-[200px]">
                                                    {c.raw_names.join(', ')}
                                                </span>
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
                                                        <span className="text-xs font-bold">{c.phone || '-'}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                        <CreditCard className="w-3 h-3 text-muted-foreground" />
                                                        <span className="text-[10px] font-mono">{c.card_number || '-'}</span>
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
                        {customers.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground italic">
                                    No se encontraron clientes en el catálogo.
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
