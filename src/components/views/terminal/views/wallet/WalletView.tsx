'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
    Card, CardContent, CardHeader, CardTitle
} from '@/components/ui/card';
import {
    TrendingUp,
    ArrowUpRight,
    ArrowDownRight,
    Wallet,
    Plus,
    Download,
    Upload,
    FileText,
    Search,
    Filter,
    ArrowRightLeft,
    Banknote,
    MoreVertical,
    Info,
    Copy
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area
} from 'recharts';
import { cn } from '@/lib/utils';
import { WalletTransaction, WalletAnalytics } from '@/lib/wallet/types';
import { parseSmsText, calculateAnalytics } from '@/lib/wallet/parser';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';

const STORAGE_KEY = 'costpro_wallet_data';

const PROMPT_PROFESSIONAL = `Contexto del Problema: Se dispone de un archivo PDF o texto que contiene mensajes SMS de una plataforma de pagos móviles bancaria.
Los mensajes incluyen diferentes tipos de eventos: Transferencias recibidas, enviadas, pagos de servicios, recargas, etc.
Objetivo: Extraer eventos financieros, normalizar el formato, clasificar el tipo de operación y convertir en estructura tabular JSON.`;

export default function WalletView() {
    const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
    const [isImporting, setIsImporting] = useState(false);
    const [showPrompt, setShowPrompt] = useState(false);
    const [importText, setImportText] = useState('');
    const [sidebarSearch, setSidebarSearch] = useState('');

    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                setTransactions(JSON.parse(saved));
            } catch (e) {
                console.error('Error loading wallet data:', e);
            }
        }
    }, []);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
    }, [transactions]);

    const analytics = useMemo(() => calculateAnalytics(transactions), [transactions]);

    const chartData = useMemo(() => {
        return Object.entries(analytics.monthly)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, data]) => ({
                name: month,
                ingresos: data.income,
                gastos: data.expenses
            }));
    }, [analytics]);

    const filteredTransactions = useMemo(() => {
        if (!sidebarSearch) return transactions;
        const search = sidebarSearch.toLowerCase();
        return transactions.filter(tx =>
            tx.counterparty.toLowerCase().includes(search) ||
            tx.description.toLowerCase().includes(search) ||
            tx.bank.toLowerCase().includes(search)
        );
    }, [transactions, sidebarSearch]);

    const handleImport = () => {
        if (!importText.trim()) return;
        const newTxs = parseSmsText(importText);
        if (newTxs.length > 0) {
            setTransactions(prev => [...newTxs, ...prev]);
            toast.success(`Se importaron ${newTxs.length} transacciones`);
            setImportText('');
            setIsImporting(false);
        } else {
            toast.error('No se detectaron transacciones válidas');
        }
    };

    const handleBackup = () => {
        const blob = new Blob([JSON.stringify(transactions, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `wallet_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target?.result as string);
                if (Array.isArray(data)) {
                    setTransactions(data);
                    toast.success('Respaldo restaurado correctamente');
                }
            } catch (err) {
                toast.error('Error al leer el archivo de respaldo');
            }
        };
        reader.readAsText(file);
    };

    return (
        <div className="space-y-8 p-4 lg:p-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-tight flex items-center gap-3">
                        <Wallet className="w-8 h-8 text-primary" />
                        Billetera Digital
                    </h1>
                    <p className="text-muted-foreground font-medium uppercase text-xs tracking-widest mt-1">
                        Control Financiero Personal y Empresarial
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleBackup}
                        className="rounded-xl border-primary/20 hover:bg-primary/5 uppercase font-bold text-[10px] tracking-widest"
                    >
                        <Download className="w-3.5 h-3.5 mr-2" />
                        Exportar
                    </Button>
                    <div className="relative">
                        <input
                            type="file"
                            accept=".json"
                            onChange={handleFileImport}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                        <Button
                            variant="outline"
                            size="sm"
                            className="rounded-xl border-primary/20 hover:bg-primary/5 uppercase font-bold text-[10px] tracking-widest"
                        >
                            <Upload className="w-3.5 h-3.5 mr-2" />
                            Importar JSON
                        </Button>
                    </div>
                    <Button
                        onClick={() => setIsImporting(true)}
                        className="rounded-xl bg-primary text-primary-foreground hover:opacity-90 uppercase font-black text-[10px] tracking-widest shadow-lg shadow-primary/20"
                    >
                        <Plus className="w-3.5 h-3.5 mr-2" />
                        Importar SMS/PDF
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="rounded-[2.5rem] border-none shadow-xl bg-primary/5 overflow-hidden">
                    <CardContent className="p-8">
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center">
                                <ArrowUpRight className="w-6 h-6 text-primary" />
                            </div>
                            <Badge variant="outline" className="border-primary/20 text-primary font-bold uppercase text-[10px] tracking-tighter">Mensual</Badge>
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs font-bold text-primary/60 uppercase tracking-widest">Ingresos Totales</p>
                            <h2 className="text-4xl font-black text-primary">{formatCurrency(analytics.summary.total_income)}</h2>
                        </div>
                    </CardContent>
                </Card>

                <Card className="rounded-[2.5rem] border-none shadow-xl bg-destructive/5 overflow-hidden">
                    <CardContent className="p-8">
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-12 h-12 rounded-2xl bg-destructive/20 flex items-center justify-center">
                                <ArrowDownRight className="w-6 h-6 text-destructive" />
                            </div>
                            <Badge variant="outline" className="border-destructive/20 text-destructive font-bold uppercase text-[10px] tracking-tighter">Mensual</Badge>
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs font-bold text-destructive/60 uppercase tracking-widest">Gastos Totales</p>
                            <h2 className="text-4xl font-black text-destructive">{formatCurrency(analytics.summary.total_expenses)}</h2>
                        </div>
                    </CardContent>
                </Card>

                <Card className="rounded-[2.5rem] border-none shadow-xl bg-secondary/30 overflow-hidden border-2 border-primary/10">
                    <CardContent className="p-8">
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center">
                                <TrendingUp className="w-6 h-6 text-primary" />
                            </div>
                            <Badge className="bg-primary text-primary-foreground font-bold uppercase text-[10px] tracking-tighter">Balance</Badge>
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs font-bold text-primary/60 uppercase tracking-widest">Saldo Neto</p>
                            <h2 className="text-4xl font-black">{formatCurrency(analytics.summary.balance)}</h2>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 rounded-[2.5rem] border-none shadow-xl bg-card overflow-hidden">
                    <CardHeader className="p-8 pb-0">
                        <CardTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-primary" />
                            Flujo Mensual de Fondos
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-8 pt-4">
                        <div className="h-[350px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData}>
                                    <defs>
                                        <linearGradient id="colorIngresos" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                                        </linearGradient>
                                        <linearGradient id="colorGastos" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                                    <XAxis
                                        dataKey="name"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 10, fontWeight: 700, fill: '#888' }}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 10, fontWeight: 700, fill: '#888' }}
                                        tickFormatter={(val) => `$${val}`}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            borderRadius: '16px',
                                            border: 'none',
                                            boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
                                            textTransform: 'uppercase',
                                            fontSize: '10px',
                                            fontWeight: '900'
                                        }}
                                    />
                                    <Area type="monotone" dataKey="ingresos" stroke="#22c55e" fillOpacity={1} fill="url(#colorIngresos)" strokeWidth={3} />
                                    <Area type="monotone" dataKey="gastos" stroke="#ef4444" fillOpacity={1} fill="url(#colorGastos)" strokeWidth={3} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card className="rounded-[2.5rem] border-none shadow-xl bg-card overflow-hidden">
                    <CardHeader className="p-8 pb-0">
                        <CardTitle className="text-lg font-black uppercase tracking-tight">Distribución Bancaria</CardTitle>
                    </CardHeader>
                    <CardContent className="p-8">
                        <div className="space-y-6">
                            {Object.entries(analytics.banks).map(([bank, data]) => (
                                <div key={bank} className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-black uppercase tracking-widest">{bank}</span>
                                        <span className="text-xs font-black text-primary">{formatCurrency(data.income - data.expenses)}</span>
                                    </div>
                                    <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-primary"
                                            style={{ width: `${Math.min(100, (data.income / (analytics.summary.total_income || 1)) * 100)}%` }}
                                        />
                                    </div>
                                    <div className="flex justify-between text-[9px] font-bold uppercase opacity-60">
                                        <span>IN: {formatCurrency(data.income)}</span>
                                        <span>OUT: {formatCurrency(data.expenses)}</span>
                                    </div>
                                </div>
                            ))}
                            {Object.keys(analytics.banks).length === 0 && (
                                <div className="text-center py-12 text-muted-foreground uppercase text-xs font-bold opacity-40">
                                    No hay datos bancarios
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="rounded-[2.5rem] border-none shadow-xl bg-card overflow-hidden">
                <div className="p-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-secondary/50">
                    <CardTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                        <ArrowRightLeft className="w-6 h-6 text-primary" />
                        Últimos Movimientos
                    </CardTitle>
                    <div className="flex items-center gap-2">
                         <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <input
                                type="text"
                                value={sidebarSearch}
                                onChange={(e) => setSidebarSearch(e.target.value)}
                                placeholder="BUSCAR..."
                                className="pl-9 pr-4 py-2 bg-secondary/50 rounded-xl text-[10px] font-black uppercase tracking-widest focus:outline-none w-48"
                            />
                        </div>
                        <Button variant="outline" size="icon" className="rounded-xl border-secondary"><Filter className="w-4 h-4" /></Button>
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
