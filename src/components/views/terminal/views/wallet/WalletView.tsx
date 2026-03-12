"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Wallet,
    Plus,
    Search,
    PieChart,
    List,
    Database,
    Trash2,
    Upload,
    FileText,
    AlertCircle,
    Loader2
} from "lucide-react";
import { useDropzone } from 'react-dropzone';
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { WalletTransaction, RawImportMessage } from '@/lib/wallet/types';
import { parseSmsText, extractRawMessages, calculateAnalytics } from '@/lib/wallet/parser';
import AnalyticsDashboard from './components/AnalyticsDashboard';

const STORAGE_KEY_RAW = 'wallet_raw_messages';
const STORAGE_KEY_TXS = 'wallet_transactions';

export default function WalletView() {
    const [viewMode, setViewMode] = useState<'bd' | 'list' | 'analytics'>('bd');
    const [rawMessages, setRawMessages] = useState<RawImportMessage[]>([]);
    const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
    const [isImporting, setIsImporting] = useState(false);
    const [importText, setImportText] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [isProcessingFile, setIsProcessingFile] = useState(false);
    const [hideDuplicates, setHideDuplicates] = useState(false);

    // Persistence
    useEffect(() => {
        const savedRaw = localStorage.getItem(STORAGE_KEY_RAW);
        const savedTxs = localStorage.getItem(STORAGE_KEY_TXS);
        if (savedRaw) setRawMessages(JSON.parse(savedRaw));
        if (savedTxs) setTransactions(JSON.parse(savedTxs));
    }, []);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_RAW, JSON.stringify(rawMessages));
        localStorage.setItem(STORAGE_KEY_TXS, JSON.stringify(transactions));
    }, [rawMessages, transactions]);

    const analytics = useMemo(() => calculateAnalytics(transactions), [transactions]);

    const handleImport = () => {
        if (!importText.trim()) return;

        const newRaw = extractRawMessages(importText);
        const newTxs = parseSmsText(importText);

        setRawMessages(prev => [...newRaw, ...prev]);
        setTransactions(prev => [...newTxs, ...prev]);

        setImportText('');
        setIsImporting(false);
        toast.success(`Importados ${newRaw.length} mensajes y ${newTxs.length} transacciones`);
    };

    const onDrop = async (acceptedFiles: File[]) => {
        setIsProcessingFile(true);
        try {
            for (const file of acceptedFiles) {
                if (file.type === 'application/pdf') {
                    const formData = new FormData();
                    formData.append('file', file);

                    const response = await fetch('/api/wallet/parse-pdf', {
                        method: 'POST',
                        body: formData
                    });

                    if (!response.ok) throw new Error('Error al procesar el PDF');

                    const { text } = await response.json();
                    if (text) {
                        const newRaw = extractRawMessages(text);
                        const newTxs = parseSmsText(text);
                        setRawMessages(prev => [...newRaw, ...prev]);
                        setTransactions(prev => [...newTxs, ...prev]);
                        toast.success(`Archivo ${file.name} procesado`);
                    }
                } else {
                    // Handle text files
                    const text = await file.text();
                    const newRaw = extractRawMessages(text);
                    const newTxs = parseSmsText(text);
                    setRawMessages(prev => [...newRaw, ...prev]);
                    setTransactions(prev => [...newTxs, ...prev]);
                    toast.success(`Archivo ${file.name} procesado`);
                }
            }
        } catch (error: any) {
            toast.error(error.message || 'Error al procesar archivos');
        } finally {
            setIsProcessingFile(false);
            setIsImporting(false);
        }
    };

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'application/pdf': ['.pdf'],
            'text/plain': ['.txt'],
            'text/csv': ['.csv']
        }
    });

    const clearBD = () => {
        if (confirm('¿Seguro que desea limpiar toda la base de datos de mensajes y transacciones?')) {
            setRawMessages([]);
            setTransactions([]);
            localStorage.removeItem(STORAGE_KEY_RAW);
            localStorage.removeItem(STORAGE_KEY_TXS);
            toast.info('Base de datos limpiada');
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-CU', { style: 'currency', currency: 'CUP' }).format(amount);
    };

    const processedRaw = useMemo(() => {
        if (!hideDuplicates) return rawMessages;

        const groups: Record<string, RawImportMessage> = {};
        rawMessages.forEach(msg => {
            // Extract transaction ID if present
            const idMatch = msg.content.match(/No\.\s*Transaccion:\s*([A-Z0-9]+)/i) ||
                          msg.content.match(/NoTransaccion\s*\n\s*([A-Z0-9]+)/i) ||
                          msg.content.match(/;([A-Z0-9]+)(\s*\||$)/);

            const txId = idMatch ? idMatch[1] : msg.id;

            if (!groups[txId] || msg.content.length > groups[txId].content.length) {
                groups[txId] = msg;
            }
        });
        return Object.values(groups);
    }, [rawMessages, hideDuplicates]);

    const filteredRaw = processedRaw.filter(msg =>
        msg.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        msg.nameNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        msg.date.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredTxs = transactions.filter(tx =>
        tx.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tx.counterparty.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="flex flex-col h-full bg-background overflow-hidden relative">
            <div className="flex flex-col md:flex-row md:items-center justify-between p-6 md:p-8 gap-4 shrink-0 bg-background/80 backdrop-blur-md z-10 border-b border-secondary/20">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
                        <Wallet className="w-6 h-6 text-primary-foreground" />
                    </div>
                    <div>
                        <h1 className="text-xl font-black uppercase tracking-tight">Billetera</h1>
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-50">Control de SMS Bancarios</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 bg-secondary/30 p-1 rounded-xl">
                    <Button variant={viewMode === 'bd' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('bd')} className="rounded-lg h-9 px-4 text-[10px] font-black uppercase tracking-widest">
                        <Database className="w-4 h-4 mr-2" /> BD
                    </Button>
                    <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('list')} className="rounded-lg h-9 px-4 text-[10px] font-black uppercase tracking-widest">
                        <List className="w-4 h-4 mr-2" /> Lista
                    </Button>
                    <Button variant={viewMode === 'analytics' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('analytics')} className="rounded-lg h-9 px-4 text-[10px] font-black uppercase tracking-widest">
                        <PieChart className="w-4 h-4 mr-2" /> Análisis
                    </Button>
                </div>
                <Button onClick={() => setIsImporting(true)} className="rounded-xl bg-primary text-primary-foreground h-11 px-6 text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20">
                    <Plus className="w-4 h-4 mr-2" /> Importar
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar pb-32">
                {viewMode === 'analytics' ? <AnalyticsDashboard analytics={analytics} /> : (
                    <div className="px-6 md:px-8 pt-8 space-y-8">
                        {viewMode === 'list' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                <Card className="rounded-3xl border-none shadow-xl bg-green-500/10">
                                    <CardContent className="p-8">
                                        <p className="text-[10px] font-black uppercase tracking-widest opacity-50">Ingresos</p>
                                        <h3 className="text-2xl font-black mt-2 text-green-500">{formatCurrency(analytics.summary.total_income)}</h3>
                                    </CardContent>
                                </Card>
                                <Card className="rounded-3xl border-none shadow-xl bg-red-500/10">
                                    <CardContent className="p-8">
                                        <p className="text-[10px] font-black uppercase tracking-widest opacity-50">Gastos</p>
                                        <h3 className="text-2xl font-black mt-2 text-red-500">{formatCurrency(analytics.summary.total_expenses)}</h3>
                                    </CardContent>
                                </Card>
                                <Card className="rounded-3xl border-none shadow-xl bg-primary text-primary-foreground">
                                    <CardContent className="p-8">
                                        <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Balance</p>
                                        <h3 className="text-2xl font-black mt-2">{formatCurrency(analytics.summary.balance)}</h3>
                                    </CardContent>
                                </Card>
                            </div>
                        )}

                        <div className="bg-card rounded-[2.5rem] border border-secondary/20 overflow-hidden shadow-xl">
                            <div className="p-6 border-b border-secondary/10 flex flex-col sm:flex-row justify-between items-center gap-4">
                                <h2 className="text-[10px] font-black uppercase tracking-[0.2em]">{viewMode === 'bd' ? 'Mensajes Importados' : 'Movimientos'}</h2>
                                <div className="flex items-center gap-4 w-full sm:w-auto">
                                    {viewMode === 'bd' && rawMessages.length > 0 && (
                                        <Button variant="ghost" size="sm" onClick={clearBD} className="text-red-500 hover:text-red-600 h-9 px-3 rounded-lg shrink-0">
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    )}
                                                            {viewMode === "bd" && (<Button
                            variant={hideDuplicates ? "default" : "outline"}
                            size="sm"
                            onClick={() => setHideDuplicates(!hideDuplicates)}
                            className="rounded-lg font-bold text-[9px] uppercase h-9 gap-2 shrink-0"
                        >
                            <Database className="w-3.5 h-3.5" />
                            {hideDuplicates ? "Duplicados Ocultos" : "Ocultar Duplicados"}
                        </Button>)}
                                    <div className="relative flex-1 sm:w-64">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-50" />
                                        <Input
                                            placeholder="Buscar..."
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                            className="pl-9 h-9 bg-secondary/20 border-none rounded-lg text-[9px] font-bold uppercase w-full"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    {viewMode === 'bd' ? (
                                        <>
                                            <thead>
                                                <tr className="border-b border-secondary/10 bg-secondary/5">
                                                    <th className="px-6 py-4 text-left text-[9px] font-black uppercase tracking-widest opacity-50">Type</th>
                                                    <th className="px-6 py-4 text-left text-[9px] font-black uppercase tracking-widest opacity-50">Date</th>
                                                    <th className="px-6 py-4 text-left text-[9px] font-black uppercase tracking-widest opacity-50">Nombre/Número</th>
                                                    <th className="px-6 py-4 text-left text-[9px] font-black uppercase tracking-widest opacity-50">Banco</th>
                                                    <th className="px-6 py-4 text-left text-[9px] font-black uppercase tracking-widest opacity-50">Content</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-secondary/10">
                                                {filteredRaw.length === 0 ? (
                                                    <tr><td colSpan={5} className="px-6 py-20 text-center text-[10px] font-black uppercase opacity-20 tracking-widest">Sin mensajes importados</td></tr>
                                                ) : filteredRaw.map(msg => (
                                                    <tr key={msg.id} className="hover:bg-primary/5 transition-colors align-top">
                                                        <td className="px-6 py-4">
                                                            <Badge variant="outline" className="text-[8px] font-black uppercase border-primary/20 bg-primary/5 whitespace-nowrap">
                                                                {msg.type}
                                                            </Badge>
                                                        </td>
                                                        <td className="px-6 py-4 text-[10px] font-bold whitespace-nowrap opacity-70">
                                                            {msg.date}
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="text-[10px] font-black uppercase max-w-[150px] break-words">
                                                                {msg.nameNumber}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <Badge variant="outline" className="text-[8px] font-black uppercase border-primary/20 bg-primary/10 whitespace-nowrap">
                                                                {msg.bank || "BPA"}
                                                            </Badge>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="bg-secondary/10 p-3 rounded-xl">
                                                                <pre className="text-[9px] font-mono leading-relaxed opacity-90 whitespace-pre-wrap max-h-40 overflow-y-auto no-scrollbar italic">
                                                                    {msg.content}
                                                                </pre>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </>
                                    ) : (
                                        <tbody className="divide-y divide-secondary/10">
                                            {filteredTxs.length === 0 ? (
                                                <tr><td colSpan={3} className="px-6 py-20 text-center text-[10px] font-black uppercase opacity-20 tracking-widest">Sin transacciones</td></tr>
                                            ) : filteredTxs.map(tx => (
                                                <tr key={tx.id} className="hover:bg-primary/5 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <p className="text-[10px] font-black">{tx.date}</p>
                                                        <p className="text-[8px] font-bold opacity-40 uppercase">{tx.bank}</p>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <p className="text-[10px] font-black uppercase truncate max-w-[150px]">{tx.counterparty}</p>
                                                        <p className="text-[8px] font-medium opacity-50 truncate max-w-[150px]">{tx.description}</p>
                                                    </td>
                                                    <td className={cn("px-6 py-4 text-right text-[10px] font-black", tx.direction === 'IN' ? "text-green-500" : "text-red-500")}>
                                                        {tx.direction === 'IN' ? '+' : '-'}{formatCurrency(tx.amount)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    )}
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {isImporting && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md overflow-y-auto">
                    <Card className="w-full max-w-xl rounded-[2.5rem] border-none shadow-2xl p-8 bg-card relative">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-black uppercase tracking-tight">Importar Datos</h2>
                            <Button variant="ghost" size="icon" onClick={() => setIsImporting(false)} className="rounded-full h-10 w-10">×</Button>
                        </div>

                        <div className="space-y-6">
                            <div
                                {...getRootProps()}
                                className={cn(
                                    "border-2 border-dashed rounded-3xl p-10 text-center transition-all cursor-pointer",
                                    isDragActive ? "border-primary bg-primary/5" : "border-secondary/30 hover:border-primary/50",
                                    isProcessingFile && "opacity-50 pointer-events-none"
                                )}
                            >
                                <input {...getInputProps()} />
                                <div className="flex flex-col items-center gap-4">
                                    <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                                        {isProcessingFile ? (
                                            <Loader2 className="w-8 h-8 animate-spin" />
                                        ) : (
                                            <Upload className="w-8 h-8" />
                                        )}
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs font-black uppercase tracking-widest">
                                            {isProcessingFile ? "Procesando..." : "Arrastra PDF o TXT aquí"}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground opacity-60">o haz clic para seleccionar archivos</p>
                                    </div>
                                </div>
                            </div>

                            <div className="relative">
                                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-secondary/20" /></div>
                                <div className="relative flex justify-center text-[10px] font-black uppercase tracking-widest"><span className="bg-card px-4 opacity-40">O pega el texto</span></div>
                            </div>

                            <div className="space-y-4">
                                <textarea
                                    value={importText}
                                    onChange={e => setImportText(e.target.value)}
                                    placeholder="Pega los SMS o logs bancarios aquí..."
                                    className="w-full h-40 p-5 bg-secondary/10 rounded-2xl text-[10px] font-medium leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-none no-scrollbar"
                                />
                                <div className="flex justify-end gap-3">
                                    <Button variant="ghost" onClick={() => setIsImporting(false)} className="font-bold text-[10px] uppercase h-11 px-6 rounded-xl">
                                        Cancelar
                                    </Button>
                                    <Button
                                        onClick={handleImport}
                                        disabled={!importText.trim()}
                                        className="rounded-xl bg-primary text-primary-foreground px-8 font-black uppercase text-[10px] h-11 shadow-lg shadow-primary/20"
                                    >
                                        Procesar Texto
                                    </Button>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 p-4 bg-orange-500/5 border border-orange-500/20 rounded-2xl">
                                <AlertCircle className="w-4 h-4 text-orange-500 shrink-0" />
                                <p className="text-[9px] font-bold text-orange-600/80 leading-normal">
                                    Los datos se procesarán localmente. Los archivos PDF se analizan de forma segura mediante un servicio de extracción de texto efímero.
                                </p>
                            </div>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}
