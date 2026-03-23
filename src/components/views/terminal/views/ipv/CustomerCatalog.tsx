'use client';

import React, { useState, useEffect } from 'react';
import { db, type Customer } from "@/lib/dexie";
import { normalizeName } from "@/lib/ipv/identity/normalization";
import { propagateIdentity } from "@/lib/ipv/identity/registry";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Save, RefreshCw, Trash2, Edit3, UserCheck, UserX, AlertTriangle, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export function CustomerCatalog() {
    const [searchTerm, setSearchTerm] = useState('');
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [editingCi, setEditingCi] = useState<string | null>(null);
    const [editData, setEditData] = useState<Partial<Customer>>({});
    const [isPropagating, setIsPropagating] = useState(false);

    useEffect(() => {
        loadCustomers();
    }, [searchTerm]);

    const loadCustomers = async () => {
        let collection = db.customers.toCollection();
        if (searchTerm) {
            const lowSearch = searchTerm.toLowerCase();
            collection = db.customers.where('nombre').startsWithIgnoreCase(lowSearch)
                .or('ci').startsWith(lowSearch)
                .or('normalized_name').startsWithIgnoreCase(normalizeName(lowSearch));
        }
        const data = await collection.toArray();
        setCustomers(data.sort((a, b) => a.nombre.localeCompare(b.nombre)));
    };

    const handleEdit = (customer: Customer) => {
        setEditingCi(customer.ci);
        setEditData(customer);
    };

    const handleSave = async (ci: string) => {
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
        loadCustomers();
    };

    const handleDelete = async (ci: string) => {
        if (confirm("¿Está seguro de eliminar este cliente?")) {
            await db.customers.delete(ci);
            toast.success("Cliente eliminado");
            loadCustomers();
        }
    };

    const handlePropagate = async () => {
        setIsPropagating(true);
        try {
            const affectedTxs = await propagateIdentity();
            toast.success(`Propagación completada. ${affectedTxs} registros actualizados.`);
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
                    <h2 className="text-2xl font-black uppercase tracking-tight flex items-center gap-3">
                        <Users className="w-6 h-6 text-primary" />
                        Catálogo Maestro de Clientes
                    </h2>
                    <p className="text-xs text-muted-foreground font-medium">Gestione la identidad centralizada para reportes IPV y conciliación.</p>
                </div>

                <Button
                    onClick={handlePropagate}
                    disabled={isPropagating}
                    className="h-11 rounded-2xl font-black uppercase tracking-widest text-xs gap-2 shadow-lg shadow-primary/20"
                >
                    <RefreshCw className={`w-4 h-4 ${isPropagating ? 'animate-spin' : ''}`} />
                    Propagar a Reportes
                </Button>
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
                            <TableHead className="text-[10px] font-black uppercase">CI / Documento</TableHead>
                            <TableHead className="text-[10px] font-black uppercase">Nombre Normalizado</TableHead>
                            <TableHead className="text-[10px] font-black uppercase">Teléfono</TableHead>
                            <TableHead className="text-[10px] font-black uppercase">No. Tarjeta</TableHead>
                            <TableHead className="text-[10px] font-black uppercase">Estado</TableHead>
                            <TableHead className="text-[10px] font-black uppercase">Actualizado</TableHead>
                            <TableHead className="text-[10px] font-black uppercase text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {customers.map((c) => (
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
                                        <span className="text-xs font-black uppercase">{c.nombre}</span>
                                    )}
                                </TableCell>
                                <TableCell>
                                    {editingCi === c.ci ? (
                                        <Input
                                            value={editData.phone || ''}
                                            onChange={e => setEditData({...editData, phone: e.target.value})}
                                            className="h-8 text-xs font-bold"
                                            placeholder="53XXXXXXXX"
                                        />
                                    ) : (
                                        <span className="text-xs font-bold">{c.phone || '-'}</span>
                                    )}
                                </TableCell>
                                <TableCell>
                                    {editingCi === c.ci ? (
                                        <Input
                                            value={editData.card_number || ''}
                                            onChange={e => setEditData({...editData, card_number: e.target.value})}
                                            className="h-8 text-xs font-mono"
                                            placeholder="16 dígitos"
                                        />
                                    ) : (
                                        <span className="text-xs font-mono">{c.card_number || '-'}</span>
                                    )}
                                </TableCell>
                                <TableCell>
                                    <Badge
                                        variant={c.status === 'COMPLETO' ? 'default' : c.status === 'PENDIENTE' ? 'destructive' : 'outline'}
                                        className="text-[9px] font-black"
                                    >
                                        {c.status}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-[10px] text-muted-foreground whitespace-nowrap">
                                    {formatDate(c.updated_at)}
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex justify-end gap-1">
                                        {editingCi === c.ci ? (
                                            <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-500" onClick={() => handleSave(c.ci)}>
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
                        ))}
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
        </div>
    );
}
