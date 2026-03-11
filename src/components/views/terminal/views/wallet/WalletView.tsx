'use client';

import React, { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Wallet, ArrowUpRight, ArrowDownRight,
    Search, Filter, Plus, List, PieChart, Banknote, Database, Trash2
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { parseSmsText, calculateAnalytics, parseRawMessages } from "@/lib/wallet/parser";
import { WalletTransaction, RawImportMessage } from "@/lib/wallet/types";
import { toast } from "sonner";

const AnalyticsDashboard = dynamic(
  () => import('./components/AnalyticsDashboard').then(mod => mod.AnalyticsDashboard),
  {
    ssr: false,
    loading: () => (
        <div className="flex flex-col items-center justify-center p-20 gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="text-[10px] font-black uppercase tracking-widest opacity-50">Cargando...</p>
        </div>
    )
  }
);

export default function WalletView() {
    const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
    const [rawMessages, setRawMessages] = useState<RawImportMessage[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [importText, setImportText] = useState('');
    const [viewMode, setViewMode] = useState<'bd' | 'list' | 'analytics'>('bd');
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
        try {
            const savedTxs = localStorage.getItem('wallet_transactions');
            if (savedTxs) setTransactions(JSON.parse(savedTxs));

            const savedRaw = localStorage.getItem('wallet_raw_messages');
            if (savedRaw) setRawMessages(JSON.parse(savedRaw));
        } catch (e) { console.error('Storage error', e); }
    }, []);

    const saveTransactions = (newTxs: WalletTransaction[]) => {
        setTransactions(newTxs);
        if (typeof window !== 'undefined') localStorage.setItem('wallet_transactions', JSON.stringify(newTxs));
    };

    const saveRawMessages = (newRaw: RawImportMessage[]) => {
        setRawMessages(newRaw);
        if (typeof window !== 'undefined') localStorage.setItem('wallet_raw_messages', JSON.stringify(newRaw));
    };

    const handleImport = () => {
        if (!importText.trim()) return;
        try {
            // Process for BD (Raw Messages)
            const newRaw = parseRawMessages(importText);
            if (newRaw.length > 0) {
                const updatedRaw = [...newRaw, ...rawMessages];
                saveRawMessages(updatedRaw);
            }

            // Process for List (Transactions)
            const parsed = parseSmsText(importText);
            if (parsed.length > 0) {
                const existingIds = new Set(transactions.map(tx => tx.transaction_id));
                const uniqueNew = parsed.filter(tx => !existingIds.has(tx.transaction_id));
                saveTransactions([...uniqueNew, ...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
                toast.success(`Procesadas ${uniqueNew.length} transacciones y ${newRaw.length} mensajes base`);
            } else if (newRaw.length > 0) {
                toast.success(`Procesados ${newRaw.length} mensajes base`);
            } else {
                toast.error('Sin datos válidos');
                return;
            }

            setImportText(''); setIsImporting(false);
        } catch (e) { toast.error('Error al procesar'); }
    };

    const clearBD = () => {
        if (confirm('¿Eliminar todos los mensajes base?')) {
            saveRawMessages([]);
            toast.success('BD limpiada');
        }
    };

    const analytics = useMemo(() => calculateAnalytics(transactions), [transactions]);
    const filteredTxs = transactions.filter(tx => tx.counterparty.toLowerCase().includes(searchQuery.toLowerCase()) || tx.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const filteredRaw = rawMessages.filter(m => m.nameNumber.toLowerCase().includes(searchQuery.toLowerCase()) || m.content.toLowerCase().includes(searchQuery.toLowerCase()) || m.date.toLowerCase().includes(searchQuery.toLowerCase()));

    const formatCurrency = (val: number) => new Intl.NumberFormat('es-CU', { style: 'currency', currency: 'CUP' }).format(val);

    if (!isMounted) return null;

    return (
        <div className="flex flex-col h-full bg-background overflow-hidden animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between p-6 md:p-8 gap-4 shrink-0 bg-background/80 backdrop-blur-md z-10 border-b border-secondary/20">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20 shrink-0"><Wallet className="w-6 h-6 text-primary-foreground" /></div>
                    <div><h1 className="text-xl font-black uppercase tracking-tight">Billetera</h1><p className="text-[10px] font-black uppercase tracking-widest opacity-50">Control de SMS Bancarios</p></div>
                </div>
                <div className="flex items-center gap-2 bg-secondary/30 p-1 rounded-xl">
                    <Button variant={viewMode === 'bd' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('bd')} className="rounded-lg h-9 px-4 text-[10px] font-black uppercase tracking-widest"><Database className="w-4 h-4 mr-2" /> BD</Button>
                    <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('list')} className="rounded-lg h-9 px-4 text-[10px] font-black uppercase tracking-widest"><List className="w-4 h-4 mr-2" /> Lista</Button>
                    <Button variant={viewMode === 'analytics' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('analytics')} className="rounded-lg h-9 px-4 text-[10px] font-black uppercase tracking-widest"><PieChart className="w-4 h-4 mr-2" /> Análisis</Button>
                </div>
                <Button onClick={() => setIsImporting(true)} className="rounded-xl bg-primary text-primary-foreground h-11 px-6 text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20"><Plus className="w-4 h-4 mr-2" /> Importar</Button>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar pb-32">
                {viewMode === 'analytics' ? <AnalyticsDashboard analytics={analytics} /> : (
                    <div className="px-6 md:px-8 pt-8 space-y-8">
                        {viewMode === 'list' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                <Card className="rounded-3xl border-none shadow-xl bg-green-500/10"><CardContent className="p-8"><p className="text-[10px] font-black uppercase tracking-widest opacity-50">Ingresos</p><h3 className="text-2xl font-black mt-2 text-green-500">{formatCurrency(analytics.summary.total_income)}</h3></CardContent></Card>
                                <Card className="rounded-3xl border-none shadow-xl bg-red-500/10"><CardContent className="p-8"><p className="text-[10px] font-black uppercase tracking-widest opacity-50">Gastos</p><h3 className="text-2xl font-black mt-2 text-red-500">{formatCurrency(analytics.summary.total_expenses)}</h3></CardContent></Card>
                                <Card className="rounded-3xl border-none shadow-xl bg-primary text-primary-foreground"><CardContent className="p-8"><p className="text-[10px] font-black uppercase tracking-widest opacity-60">Balance</p><h3 className="text-2xl font-black mt-2">{formatCurrency(analytics.summary.balance)}</h3></CardContent></Card>
                            </div>
                        )}

                        <div className="bg-card rounded-[2.5rem] border border-secondary/20 overflow-hidden">
                            <div className="p-6 border-b border-secondary/10 flex justify-between items-center">
                                <h2 className="text-[10px] font-black uppercase tracking-[0.2em]">{viewMode === 'bd' ? 'Mensajes Importados' : 'Movimientos'}</h2>
                                <div className="flex items-center gap-4">
                                    {viewMode === 'bd' && rawMessages.length > 0 && (
                                        <Button variant="ghost" size="sm" onClick={clearBD} className="text-red-500 hover:text-red-600 h-9 px-3 rounded-lg"><Trash2 className="w-4 h-4" /></Button>
                                    )}
                                    <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-50" /><Input placeholder="Buscar..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 h-9 bg-secondary/20 border-none rounded-lg text-[9px] font-bold uppercase w-40" /></div>
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
                                                    <th className="px-6 py-4 text-left text-[9px] font-black uppercase tracking-widest opacity-50">Content</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-secondary/10">
                                                {filteredRaw.length === 0 ? (
                                                    <tr><td colSpan={4} className="px-6 py-20 text-center text-[10px] font-black uppercase opacity-20 tracking-widest">Sin mensajes importados</td></tr>
                                                ) : filteredRaw.map(msg => (
                                                    <tr key={msg.id} className="hover:bg-primary/5 transition-colors align-top">
                                                        <td className="px-6 py-4"><Badge variant="outline" className="text-[8px] font-black uppercase border-primary/20 bg-primary/5">{msg.type}</Badge></td>
                                                        <td className="px-6 py-4 text-[10px] font-bold whitespace-nowrap">{msg.date}</td>
                                                        <td className="px-6 py-4 text-[10px] font-black uppercase max-w-[200px] break-words">{msg.nameNumber}</td>
                                                        <td className="px-6 py-4"><pre className="text-[9px] font-mono leading-relaxed opacity-70 whitespace-pre-wrap max-h-40 overflow-y-auto no-scrollbar">{msg.content}</pre></td>
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
                                                    <td className="px-6 py-4"><p className="text-[10px] font-black">{tx.date}</p><p className="text-[8px] font-bold opacity-40 uppercase">{tx.bank}</p></td>
                                                    <td className="px-6 py-4"><p className="text-[10px] font-black uppercase truncate max-w-[150px]">{tx.counterparty}</p><p className="text-[8px] font-medium opacity-50 truncate max-w-[150px]">{tx.description}</p></td>
                                                    <td className={cn("px-6 py-4 text-right text-[10px] font-black", tx.direction === 'IN' ? "text-green-500" : "text-red-500")}>{tx.direction === 'IN' ? '+' : '-'}{formatCurrency(tx.amount)}</td>
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
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
                    <Card className="w-full max-w-xl rounded-[2.5rem] border-none shadow-2xl p-8"><div className="flex justify-between items-center mb-6"><h2 className="text-xl font-black uppercase tracking-tight">Importar SMS</h2><Button variant="ghost" onClick={() => setIsImporting(false)}>×</Button></div>
                        <textarea value={importText} onChange={e => setImportText(e.target.value)} placeholder="Pega los SMS aquí..." className="w-full h-40 p-4 bg-secondary/20 rounded-2xl text-xs focus:outline-none resize-none mb-4" />
                        <div className="flex justify-end gap-3"><Button variant="ghost" onClick={() => setIsImporting(false)} className="font-bold text-[10px] uppercase">Cancelar</Button><Button onClick={handleImport} className="rounded-xl bg-primary text-primary-foreground px-8 font-black uppercase text-[10px] h-11">Procesar</Button></div>
                    </Card>
                </div>
            )}
        </div>
    );
}
