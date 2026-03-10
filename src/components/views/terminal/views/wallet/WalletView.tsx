import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Wallet,
    ArrowUpRight,
    ArrowDownRight,
    Search,
    Filter,
    Download,
    Plus,
    MoreVertical,
    Banknote,
    PieChart as PieChartIcon,
    List as ListIcon,
    FileText,
    Copy,
    Info
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { parseSmsText, calculateAnalytics } from "@/lib/wallet/parser";
import { WalletTransaction, WalletAnalytics } from "@/lib/wallet/types";
import { toast } from "sonner";
import { AnalyticsDashboard } from "./components/AnalyticsDashboard";

const PROMPT_PROFESSIONAL = "Actúa como un analista financiero experto. Convierte este texto de mensajes bancarios (PAGOxMOVIL/Enzona) en un JSON estructurado con los siguientes campos por cada transacción: id (uuid), date (YYYY-MM-DD), bank (BPA/Bandec/Metropolitano), type (TRANSFER_IN/OUT, PAYMENT_SERVICE, etc), amount (number), currency (CUP/MLC), counterparty (nombre o cuenta), transaction_id, description (texto original), y extra_data (JSON con consumo_kw si es electricidad, etc). Devuelve SOLO el array JSON.";

export default function WalletView() {
    const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [importText, setImportText] = useState('');
    const [viewMode, setViewMode] = useState<'list' | 'analytics'>('list');

    useEffect(() => {
        const saved = localStorage.getItem('wallet_transactions');
        if (saved) {
            try {
                setTransactions(JSON.parse(saved));
            } catch (e) {
                console.error('Failed to parse transactions', e);
            }
        }
    }, []);

    const saveTransactions = (newTxs: WalletTransaction[]) => {
        setTransactions(newTxs);
        localStorage.setItem('wallet_transactions', JSON.stringify(newTxs));
    };

    const handleImport = () => {
        if (!importText.trim()) return;

        try {
            const parsed = parseSmsText(importText);
            if (parsed.length === 0) {
                toast.error('No se detectaron transacciones válidas');
                return;
            }

            const existingIds = new Set(transactions.map(tx => tx.transaction_id));
            const uniqueNew = parsed.filter(tx => !existingIds.has(tx.transaction_id));

            if (uniqueNew.length === 0) {
                toast.info('Todas las transacciones ya han sido importadas');
            } else {
                saveTransactions([...uniqueNew, ...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
                toast.success(`${uniqueNew.length} transacciones importadas`);
            }

            setImportText('');
            setIsImporting(false);
        } catch (e) {
            toast.error('Error al procesar el texto');
        }
    };

    const analytics = useMemo(() => calculateAnalytics(transactions), [transactions]);

    const filteredTransactions = transactions.filter(tx =>
        tx.counterparty.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tx.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('es-CU', { style: 'currency', currency: 'CUP' }).format(val);

    return (
        <div className="flex flex-col h-full bg-background overflow-hidden">
            {/* Header Sticky */}
            <div className="flex flex-col md:flex-row md:items-center justify-between p-6 md:p-8 gap-4 shrink-0 bg-background/80 backdrop-blur-md z-10">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-3xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
                        <Wallet className="w-7 h-7 text-primary-foreground" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black uppercase tracking-tight">Billetera Digital</h1>
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-50">Control de finanzas personales</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 bg-secondary/30 p-1 rounded-2xl">
                    <Button
                        variant={viewMode === 'list' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setViewMode('list')}
                        className="rounded-xl h-10 px-4 text-[10px] font-black uppercase tracking-widest"
                    >
                        <ListIcon className="w-4 h-4 mr-2" />
                        Lista
                    </Button>
                    <Button
                        variant={viewMode === 'analytics' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setViewMode('analytics')}
                        className="rounded-xl h-10 px-4 text-[10px] font-black uppercase tracking-widest"
                    >
                        <PieChartIcon className="w-4 h-4 mr-2" />
                        Análisis
                    </Button>
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="outline" className="rounded-2xl border-secondary h-12 px-6 text-[10px] font-black uppercase tracking-widest">
                        <Download className="w-4 h-4 mr-2" />
                        Exportar
                    </Button>
                    <Button
                        onClick={() => setIsImporting(true)}
                        className="rounded-2xl bg-primary text-primary-foreground h-12 px-6 text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Importar
                    </Button>
                </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto no-scrollbar pb-20">
                {viewMode === 'analytics' ? (
                    <AnalyticsDashboard analytics={analytics} />
                ) : (
                    <div className="px-6 md:px-8 space-y-8">
                        {/* Summary Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            <Card className="rounded-[2.5rem] border-none shadow-xl bg-green-500/10 dark:bg-green-500/5">
                                <CardContent className="p-8">
                                    <p className="text-[10px] font-black uppercase tracking-widest opacity-50">Ingresos del Mes</p>
                                    <h3 className="text-3xl font-black mt-2 text-green-500">{formatCurrency(analytics.summary.total_income)}</h3>
                                </CardContent>
                            </Card>
                            <Card className="rounded-[2.5rem] border-none shadow-xl bg-red-500/10 dark:bg-red-500/5">
                                <CardContent className="p-8">
                                    <p className="text-[10px] font-black uppercase tracking-widest opacity-50">Gastos del Mes</p>
                                    <h3 className="text-3xl font-black mt-2 text-red-500">{formatCurrency(analytics.summary.total_expenses)}</h3>
                                </CardContent>
                            </Card>
                            <Card className="rounded-[2.5rem] border-none shadow-xl bg-primary text-primary-foreground">
                                <CardContent className="p-8">
                                    <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Balance Disponible</p>
                                    <h3 className="text-3xl font-black mt-2">{formatCurrency(analytics.summary.balance)}</h3>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Transaction List */}
                        <Card className="rounded-[3rem] border-none shadow-2xl overflow-hidden mb-10">
                            <div className="p-8 border-b border-secondary/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <h2 className="text-sm font-black uppercase tracking-[0.2em]">Movimientos Recientes</h2>
                                <div className="flex items-center gap-3">
                                    <div className="relative group flex-1 md:flex-none">
                                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                        <Input
                                            placeholder="Buscar en transacciones..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="pl-12 pr-6 h-11 bg-secondary/30 border-none rounded-xl text-[10px] font-black uppercase tracking-widest focus:outline-none w-full md:w-64"
                                        />
                                    </div>
                                    <Button variant="outline" size="icon" className="rounded-xl border-secondary h-11 w-11"><Filter className="w-4 h-4" /></Button>
                                </div>
                            </div>
                            <CardContent className="p-0">
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="bg-secondary/20">
                                                <th className="px-8 py-4 text-left text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Fecha</th>
                                                <th className="px-8 py-4 text-left text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Detalle / Origen</th>
                                                <th className="px-8 py-4 text-left text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Tipo</th>
                                                <th className="px-8 py-4 text-right text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Monto</th>
                                                <th className="px-8 py-4 text-center"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-secondary/30">
                                            {filteredTransactions.slice(0, 50).map((tx) => (
                                                <tr key={tx.id} className="hover:bg-primary/5 transition-colors group">
                                                    <td className="px-8 py-5">
                                                        <div className="flex flex-col">
                                                            <span className="text-xs font-black">{tx.date}</span>
                                                            <span className="text-[9px] font-bold opacity-50 uppercase tracking-tighter">{tx.bank}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-5">
                                                        <div className="flex items-center gap-3">
                                                            <div className={cn(
                                                                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                                                                tx.direction === 'IN' ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                                                            )}>
                                                                {tx.direction === 'IN' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                                                            </div>
                                                            <div className="flex flex-col max-w-md">
                                                                <span className="text-xs font-black uppercase truncate">{tx.counterparty}</span>
                                                                <span className="text-[9px] font-medium text-muted-foreground truncate">{tx.description}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-5">
                                                        <Badge variant="outline" className="text-[9px] font-black uppercase border-secondary/50 py-0.5">
                                                            {tx.type.replace('_', ' ')}
                                                        </Badge>
                                                    </td>
                                                    <td className="px-8 py-5 text-right">
                                                        <span className={cn(
                                                            "text-sm font-black",
                                                            tx.direction === 'IN' ? "text-green-500" : "text-red-500"
                                                        )}>
                                                            {tx.direction === 'IN' ? '+' : '-'}{formatCurrency(tx.amount)}
                                                        </span>
                                                    </td>
                                                    <td className="px-8 py-5 text-center">
                                                        <Button variant="ghost" size="icon" className="rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"><MoreVertical className="w-4 h-4" /></Button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {filteredTransactions.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} className="px-8 py-20 text-center">
                                                        <div className="flex flex-col items-center gap-4 opacity-30">
                                                            <Banknote className="w-12 h-12" />
                                                            <p className="text-xs font-black uppercase tracking-[0.2em]">No se han registrado transacciones</p>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>

            {isImporting && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
                    <Card className="w-full max-w-2xl rounded-[3rem] border-none shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <CardHeader className="p-8 pb-4 flex flex-row items-center justify-between">
                            <CardTitle className="text-2xl font-black uppercase tracking-tight flex items-center gap-3">
                                <FileText className="w-7 h-7 text-primary" />
                                Importar Datos
                            </CardTitle>
                            <Button variant="ghost" size="icon" onClick={() => setIsImporting(false)} className="rounded-full">
                                <Plus className="w-6 h-6 rotate-45" />
                            </Button>
                        </CardHeader>
                        <CardContent className="p-8 pt-0">
                            <div className="space-y-4">
                                <div className="bg-primary/5 rounded-2xl p-4 flex items-start gap-3 border border-primary/10">
                                    <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                                    <div className="space-y-2">
                                        <p className="text-[10px] font-bold text-primary uppercase tracking-widest">Tip de Modelado AI</p>
                                        <p className="text-[9px] font-medium leading-relaxed opacity-70">Puedes usar este prompt en una AI para convertir cualquier PDF a JSON estructurado:</p>
                                        <div className="relative group">
                                            <div className="bg-background/50 rounded-lg p-2 text-[8px] font-mono break-all pr-8">
                                                {PROMPT_PROFESSIONAL}
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="absolute right-1 top-1 w-6 h-6 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(PROMPT_PROFESSIONAL);
                                                    toast.success('Prompt copiado');
                                                }}
                                            >
                                                <Copy className="w-3 h-3" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Pega el texto de tus SMS o archivos bancarios aquí:</p>
                                <textarea
                                    value={importText}
                                    onChange={(e) => setImportText(e.target.value)}
                                    placeholder="Ej: PAGOxMOVIL El titular del telefono 5353183965 le ha realizado una transferencia..."
                                    className="w-full h-48 p-6 bg-secondary/30 rounded-[2rem] text-sm font-medium focus:outline-none border-2 border-transparent focus:border-primary/20 transition-all resize-none"
                                />
                                <div className="flex items-center justify-end gap-3 pt-4">
                                    <Button variant="ghost" onClick={() => setIsImporting(false)} className="rounded-xl uppercase font-bold text-xs">Cancelar</Button>
                                    <Button onClick={handleImport} className="rounded-xl bg-primary text-primary-foreground px-8 font-black uppercase text-xs tracking-widest">Procesar Información</Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
