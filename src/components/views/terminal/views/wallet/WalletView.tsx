'use client';

import React, { useState, useEffect, useMemo, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Wallet, ArrowUpRight, ArrowDownRight,
    Search, Filter, Plus, List, PieChart, Database, Table, FileText
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { parseRawSms, calculateAnalytics } from "@/lib/wallet/parser";
import { RawSms } from "@/lib/wallet/types";
import { toast } from "sonner";
import { useFocusTrap } from '@/hooks/ui/useFocusTrap';
import { CostProLoader } from '@/components/ui/CostProLoader';

const AnalyticsDashboard = dynamic(
  () => import('./components/AnalyticsDashboard').then(mod => mod.AnalyticsDashboard),
  {
    ssr: false,
    loading: () => (
        <div className="flex flex-col items-center justify-center p-20">
            <CostProLoader text="ANALYTICS" subtext="Cargando..." showText showSubtext />
        </div>
    )
  }
);

export default function WalletView() {
    const [rawSms, setRawSms] = useState<RawSms[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [importText, setImportText] = useState('');
    const [viewMode, setViewMode] = useState<'bd' | 'list' | 'analytics' | 'extracto'>('list');
    const importModalRef = useFocusTrap(isImporting);
    const isMounted = useSyncExternalStore(
        () => () => {},
        () => true,
        () => false
    );

    useEffect(() => {
        try {
            const saved = localStorage.getItem('wallet_raw_sms');
            if (saved) {
                const parsed = JSON.parse(saved);
                requestAnimationFrame(() => setRawSms(parsed));
            }
        } catch (e) { console.error('Storage error', e); }
    }, []);

    const saveRawSms = (newRaw: RawSms[]) => {
        setRawSms(newRaw);
        if (typeof window !== 'undefined') localStorage.setItem('wallet_raw_sms', JSON.stringify(newRaw));
    };

    const handleImport = () => {
        if (!importText.trim()) return;
        try {
            const parsed = parseRawSms(importText);
            if (parsed.length === 0) { toast.error('Sin datos válidos'); return; }

            const existingKeys = new Set(rawSms.map(sms => `${sms.type}|${sms.date}|${sms.content}`));
            const uniqueNew = parsed.filter(sms => !existingKeys.has(`${sms.type}|${sms.date}|${sms.content}`));

            if (uniqueNew.length === 0) {
                toast.info('No se encontraron mensajes nuevos');
            } else {
                saveRawSms([...uniqueNew, ...rawSms]);
                toast.success(`Importados ${uniqueNew.length} mensajes nuevos`);
            }
            setImportText(''); setIsImporting(false);
        } catch (e) { toast.error('Error al procesar'); }
    };

    const analytics = useMemo(() => calculateAnalytics(rawSms), [rawSms]);

    const formatCurrency = (val: number) => new Intl.NumberFormat('es-CU', { style: 'currency', currency: 'CUP' }).format(val);

    if (!isMounted) return null;

    return (
        <div className="flex flex-col h-full bg-background overflow-hidden animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between p-6 md:p-8 gap-4 shrink-0 bg-background/80 backdrop-blur-md z-10 border-b border-secondary/20">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20 shrink-0"><Wallet className="w-6 h-6 text-primary-foreground" /></div>
                    <div><h1 className="text-xl font-black uppercase tracking-tight">Billetera</h1><p className="text-[10px] font-black uppercase tracking-widest opacity-50">Fuente Única de Verdad</p></div>
                </div>
                <div className="flex items-center gap-2 bg-secondary/30 p-1 rounded-xl">
                    <Button variant={viewMode === 'bd' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('bd')} className="rounded-lg h-9 px-4 text-[10px] font-black uppercase tracking-widest"><Database className="w-4 h-4 mr-2" /> BD</Button>
                    <Button variant={viewMode === 'extracto' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('extracto')} className="rounded-lg h-9 px-4 text-[10px] font-black uppercase tracking-widest"><FileText className="w-4 h-4 mr-2" /> Extracto</Button>
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
                                <Card className="rounded-3xl border-none shadow-xl bg-success/10"><CardContent className="p-8"><p className="text-[10px] font-black uppercase tracking-widest opacity-50">Ingresos</p><h3 className="text-2xl font-black mt-2 text-success">{formatCurrency(analytics.summary.total_income)}</h3></CardContent></Card>
                                <Card className="rounded-3xl border-none shadow-xl bg-destructive/10"><CardContent className="p-8"><p className="text-[10px] font-black uppercase tracking-widest opacity-50">Gastos</p><h3 className="text-2xl font-black mt-2 text-destructive">{formatCurrency(analytics.summary.total_expenses)}</h3></CardContent></Card>
                                <Card className="rounded-3xl border-none shadow-xl bg-primary text-primary-foreground"><CardContent className="p-8"><p className="text-[10px] font-black uppercase tracking-widest opacity-60">Balance</p><h3 className="text-2xl font-black mt-2">{formatCurrency(analytics.summary.balance)}</h3></CardContent></Card>
                            </div>
                        )}

                        <div className="bg-card rounded-[2.5rem] border border-secondary/20 overflow-hidden">
                            <div className="p-6 border-b border-secondary/10 flex justify-between items-center">
                                <h2 className="text-[10px] font-black uppercase tracking-[0.2em]">
                                    {viewMode === 'bd' ? 'Fuente de Verdad (SMS Crudos)' :
                                     viewMode === 'extracto' ? 'Extracto de Operaciones' :
                                     'Tabla Analítica Detallada'}
                                </h2>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-50" />
                                    <Input
                                        placeholder="Buscar..."
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        className="pl-9 h-9 bg-secondary/20 border-none rounded-lg text-[9px] font-bold uppercase w-40"
                                    />
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-secondary/10">
                                            {viewMode === 'bd' ? (
                                                <>
                                                    <th className="px-6 py-4 text-[8px] font-black uppercase tracking-widest opacity-50">Tipo</th>
                                                    <th className="px-6 py-4 text-[8px] font-black uppercase tracking-widest opacity-50">Fecha</th>
                                                    <th className="px-6 py-4 text-[8px] font-black uppercase tracking-widest opacity-50">Nombre/Número</th>
                                                    <th className="px-6 py-4 text-[8px] font-black uppercase tracking-widest opacity-50">Contenido</th>
                                                </>
                                            ) : (
                                                <>
                                                    <th className="px-6 py-4 text-[8px] font-black uppercase tracking-widest opacity-50">Fecha</th>
                                                    <th className="px-6 py-4 text-[8px] font-black uppercase tracking-widest opacity-50">Banco</th>
                                                    <th className="px-6 py-4 text-[8px] font-black uppercase tracking-widest opacity-50">Operación</th>
                                                    <th className="px-6 py-4 text-[8px] font-black uppercase tracking-widest opacity-50">Categoría</th>
                                                    <th className="px-6 py-4 text-[8px] font-black uppercase tracking-widest opacity-50 text-right">Monto</th>
                                                </>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-secondary/10">
                                        {viewMode === 'bd' ? (
                                            analytics.rawSms
                                                .filter(sms => sms.content.toLowerCase().includes(searchQuery.toLowerCase()) || sms.nameNumber.toLowerCase().includes(searchQuery.toLowerCase()))
                                                .map(sms => (
                                                    <tr key={sms.id} className="hover:bg-primary/5 transition-colors">
                                                        <td className="px-6 py-4"><Badge variant="outline" className="text-[7px] font-black uppercase">{sms.type}</Badge></td>
                                                        <td className="px-6 py-4 text-[10px] font-medium">{sms.date}</td>
                                                        <td className="px-6 py-4 text-[10px] font-black">{sms.nameNumber}</td>
                                                        <td className="px-6 py-4 text-[9px] opacity-60 max-w-md truncate">{sms.content}</td>
                                                    </tr>
                                                ))
                                        ) : (
                                            analytics.transactions
                                                .filter(tx => {
                                                    const matchesSearch = tx.note.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                                                         tx.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                                                         tx.bank.toLowerCase().includes(searchQuery.toLowerCase());
                                                    if (viewMode === 'extracto') return matchesSearch && tx.isStatement;
                                                    if (viewMode === 'list') return matchesSearch && !tx.isStatement;
                                                    return matchesSearch;
                                                })
                                                .map(tx => (
                                                    <tr key={tx.id} className="hover:bg-primary/5 transition-colors">
                                                        <td className="px-6 py-4 text-[10px] font-medium">{tx.date}</td>
                                                        <td className="px-6 py-4 text-[10px] font-black">{tx.bank}</td>
                                                        <td className="px-6 py-4" aria-label={`${tx.typeOperation} - ${tx.note}`}>
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] font-black uppercase">{tx.typeOperation}</span>
                                                                <span className="text-[8px] opacity-50 uppercase font-bold">{tx.note}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4"><Badge className="text-[7px] font-black uppercase">{tx.category}</Badge></td>
                                                        <td className={cn("px-6 py-4 text-right text-[10px] font-black", tx.nature === 'CR' ? "text-success" : "text-destructive")}>
                                                            {tx.nature === 'CR' ? '+' : '-'}{formatCurrency(tx.amount)}
                                                        </td>
                                                    </tr>
                                                ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {isImporting && (
                <div ref={importModalRef} role="dialog" aria-modal="true" aria-label="Importar mensajes SMS" className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
                    <Card className="w-full max-w-xl rounded-[2.5rem] border-none shadow-2xl p-8">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-black uppercase tracking-tight">Importar SMS</h2>
                            <Button variant="ghost" onClick={() => setIsImporting(false)}>×</Button>
                        </div>
                        <p className="text-[9px] font-black uppercase tracking-widest opacity-50 mb-4">
                            Pega los mensajes en formato libre o tabla
                        </p>
                        <textarea
                            value={importText}
                            onChange={e => setImportText(e.target.value)}
                            placeholder="Pega aquí tus mensajes de Transfermóvil..."
                            aria-label="Área de texto para importar mensajes SMS"
                            className="w-full h-40 p-4 bg-secondary/20 rounded-2xl text-xs focus:outline-none resize-none mb-4"
                        />
                        <div className="flex justify-end gap-3">
                            <Button variant="ghost" onClick={() => setIsImporting(false)} className="font-bold text-[10px] uppercase">Cancelar</Button>
                            <Button onClick={handleImport} className="rounded-xl bg-primary text-primary-foreground px-8 font-black uppercase text-[10px] h-11">Procesar</Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}
