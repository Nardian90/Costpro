'use client';

import React, { useState, useEffect, useMemo, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Wallet, ArrowUpRight, ArrowDownRight, Landmark, CreditCard,
    Search, Plus, Tag, Calendar, BarChart3, Edit2, X,
    TrendingUp, TrendingDown, Building2, ChevronRight, Table as TableIcon
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { parseRawSms, calculateAnalytics } from "@/lib/wallet/parser";
import { RawSms, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/wallet/types";
import { toast } from "sonner";
import { CostProLoader } from '@/components/ui/CostProLoader';

const AnalyticsDashboard = dynamic(
  () => import('./components/AnalyticsDashboard').then(mod => mod.AnalyticsDashboard),
  { ssr: false, loading: () => <div className="flex items-center justify-center p-20"><CostProLoader text="ANALYTICS" subtext="Cargando..." showText showSubtext /></div> }
);

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const CATEGORY_COLORS = ['bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-yellow-500', 'bg-lime-500', 'bg-green-500', 'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500', 'bg-blue-500', 'bg-indigo-500', 'bg-purple-500', 'bg-pink-500', 'bg-rose-500', 'bg-gray-500', 'bg-slate-500'];

type ViewMode = 'resumen' | 'transacciones' | 'categorias' | 'reportes' | 'analytics' | 'bd';

export default function WalletView() {
    const [rawSms, setRawSms] = useState<RawSms[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [importText, setImportText] = useState('');
    const [viewMode, setViewMode] = useState<ViewMode>('resumen');
    const [filterBank, setFilterBank] = useState<string | 'all'>('all');
    const [editingTxId, setEditingTxId] = useState<string | null>(null);
    const [manualCategories, setManualCategories] = useState<Record<string, string>>({});
    const isMounted = useSyncExternalStore(() => () => {}, () => true, () => false);

    useEffect(() => {
        try {
            const saved = localStorage.getItem('wallet_raw_sms');
            if (saved) requestAnimationFrame(() => setRawSms(JSON.parse(saved)));
            const savedCats = localStorage.getItem('wallet_manual_categories');
            if (savedCats) setManualCategories(JSON.parse(savedCats));
        } catch (e) { console.error('Storage error', e); }
    }, []);

    const handleImport = () => {
        if (!importText.trim()) return;
        try {
            const parsed = parseRawSms(importText);
            if (parsed.length === 0) { toast.error('Sin datos válidos'); return; }
            const existingKeys = new Set(rawSms.map(sms => `${sms.type}|${sms.date}|${sms.content}`));
            const uniqueNew = parsed.filter(sms => !existingKeys.has(`${sms.type}|${sms.date}|${sms.content}`));
            if (uniqueNew.length === 0) { toast.info('No se encontraron mensajes nuevos'); }
            else { setRawSms(prev => { const next = [...uniqueNew, ...prev]; localStorage.setItem('wallet_raw_sms', JSON.stringify(next)); return next; }); toast.success(`${uniqueNew.length} mensajes importados`); }
            setImportText(''); setIsImporting(false);
        } catch (e) { toast.error('Error al procesar'); }
    };

    const analytics = useMemo(() => {
        const a = calculateAnalytics(rawSms);
        a.transactions.forEach(tx => { if (manualCategories[tx.id]) tx.manualCategory = manualCategories[tx.id]; });
        return a;
    }, [rawSms, manualCategories]);

    const handleSetCategory = (txId: string, category: string) => {
        const newCats = { ...manualCategories, [txId]: category };
        setManualCategories(newCats);
        localStorage.setItem('wallet_manual_categories', JSON.stringify(newCats));
        setEditingTxId(null);
        toast.success(`Clasificado: ${category}`);
    };

    const fmt = (val: number) => new Intl.NumberFormat('es-CU', { style: 'currency', currency: 'CUP', maximumFractionDigits: 2 }).format(val);
    const fmtShort = (val: number) => Math.abs(val) >= 1000000 ? `$${(val/1000000).toFixed(1)}M` : Math.abs(val) >= 1000 ? `$${(val/1000).toFixed(1)}K` : `$${val.toFixed(0)}`;

    const bankEntries = Object.entries(analytics.banks).sort(([a],[b]) => a.localeCompare(b));
    const bankNames = bankEntries.map(([n]) => n);
    const filteredTx = useMemo(() => {
        let txs = analytics.transactions;
        if (filterBank !== 'all') txs = txs.filter(t => t.bank === filterBank);
        if (searchQuery) { const q = searchQuery.toLowerCase(); txs = txs.filter(t => t.note.toLowerCase().includes(q) || t.category.toLowerCase().includes(q) || t.bank.toLowerCase().includes(q) || t.typeOperation.toLowerCase().includes(q) || (t.card && t.card.includes(q))); }
        return txs;
    }, [analytics.transactions, filterBank, searchQuery]);

    if (!isMounted) return null;

    const bankColors: Record<string,string> = { 'BPA': 'border-blue-500/30 bg-blue-500/5', 'BANDEC': 'border-emerald-500/30 bg-emerald-500/5', 'METRO': 'border-purple-500/30 bg-purple-500/5', 'DESCONOCIDO': 'border-border/30 bg-muted/5' };

    const tabs: {id: ViewMode, label: string, icon: any}[] = [
        {id:'resumen',label:'Resumen',icon:Building2},{id:'transacciones',label:'Movimientos',icon:TableIcon},
        {id:'categorias',label:'Categorías',icon:Tag},{id:'reportes',label:'Reportes',icon:BarChart3},
        {id:'analytics',label:'Análisis',icon:Wallet},{id:'bd',label:'SMS',icon:Search},
    ];

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Header compacto */}
            <div className="shrink-0 border-b border-border/20 bg-background/95 backdrop-blur-sm">
                <div className="flex items-center justify-between px-4 py-3 gap-3">
                    <div className="flex items-center gap-2.5 shrink-0">
                        <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center"><Wallet className="w-4.5 h-4.5 text-primary-foreground" /></div>
                        <div>
                            <h1 className="text-sm font-black tracking-tight leading-none">Billetera</h1>
                            <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-wider mt-0.5">Finanzas Personales</p>
                        </div>
                    </div>
                    <Button onClick={() => setIsImporting(true)} size="sm" className="h-8 px-3 text-[10px] font-black uppercase shrink-0">
                        <Plus className="w-3.5 h-3.5 mr-1" /> Importar
                    </Button>
                </div>
                {/* Tabs scroll horizontal */}
                <div className="flex items-center gap-0.5 px-2 pb-2 overflow-x-auto no-scrollbar">
                    {tabs.map(tab => {
                        const Icon = tab.icon;
                        return (
                            <button key={tab.id} onClick={() => setViewMode(tab.id)}
                                className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase whitespace-nowrap transition-all shrink-0",
                                    viewMode === tab.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50")}>
                                <Icon className="w-3.5 h-3.5" /> {tab.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Contenido scrollable */}
            <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 pb-24">
                {viewMode === 'resumen' && (
                    <div className="space-y-4 max-w-2xl mx-auto">
                        {/* Patrimonio Total */}
                        <Card className="rounded-3xl border-2 border-primary/20 bg-gradient-to-br from-primary/10 to-transparent p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Patrimonio Total</p>
                                    <p className="text-3xl font-black italic text-primary mt-1">{fmt(analytics.total_real_balance || 0)}</p>
                                </div>
                                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center"><Wallet className="w-7 h-7 text-primary" /></div>
                            </div>
                        </Card>
                        {/* Ingresos / Gastos */}
                        <div className="grid grid-cols-2 gap-3">
                            <Card className="rounded-2xl border-border/30 p-4">
                                <div className="flex items-center gap-1.5 mb-1"><TrendingUp className="w-3.5 h-3.5 text-emerald-500" /><p className="text-[9px] font-black uppercase text-muted-foreground">Ingresos</p></div>
                                <p className="text-lg font-black text-emerald-500">{fmt(analytics.summary.total_income)}</p>
                            </Card>
                            <Card className="rounded-2xl border-border/30 p-4">
                                <div className="flex items-center gap-1.5 mb-1"><TrendingDown className="w-3.5 h-3.5 text-red-500" /><p className="text-[9px] font-black uppercase text-muted-foreground">Gastos</p></div>
                                <p className="text-lg font-black text-red-500">{fmt(analytics.summary.total_expenses)}</p>
                            </Card>
                        </div>
                        {/* Tarjetas por banco */}
                        <div className="space-y-2">
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Cuentas</p>
                            {bankEntries.length === 0 ? (
                                <Card className="rounded-2xl border-dashed border-border/30 p-8 text-center">
                                    <Building2 className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                                    <p className="text-xs font-bold text-muted-foreground">Importa SMS para comenzar</p>
                                </Card>
                            ) : bankEntries.map(([bankName, bank]) => (
                                <Card key={bankName} className={cn("rounded-2xl border p-4 cursor-pointer transition-all hover:shadow-md", bankColors[bankName] || bankColors['DESCONOCIDO'])}
                                    onClick={() => { setFilterBank(bankName); setViewMode('transacciones'); }}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-xl bg-background/60 flex items-center justify-center"><Landmark className="w-4.5 h-4.5" /></div>
                                            <div>
                                                <p className="text-sm font-black uppercase leading-none">{bankName}</p>
                                                {bank.card && <div className="flex items-center gap-1 mt-1"><CreditCard className="w-2.5 h-2.5 text-muted-foreground" /><p className="text-[8px] font-bold text-muted-foreground">{bank.card}</p></div>}
                                            </div>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
                                    </div>
                                    <div className="mt-3 flex items-end justify-between">
                                        <div>
                                            <p className="text-[8px] font-black uppercase text-muted-foreground">Saldo</p>
                                            <p className={cn("text-xl font-black italic", bank.current_balance > 0 ? "text-emerald-500" : "text-red-500")}>{fmt(bank.current_balance)}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[8px] text-muted-foreground">{bank.transaction_count} mov.</p>
                                            {bank.last_balance_date && <p className="text-[7px] text-muted-foreground/60">{bank.last_balance_date}</p>}
                                        </div>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </div>
                )}

                {viewMode === 'transacciones' && (
                    <div className="space-y-3 max-w-4xl mx-auto">
                        {/* Stats compactas */}
                        <div className="grid grid-cols-3 gap-2">
                            <Card className="rounded-xl p-2.5 text-center border-border/30"><p className="text-[8px] font-bold uppercase text-muted-foreground">Ingresos</p><p className="text-sm font-black text-emerald-500">{fmtShort(analytics.summary.total_income)}</p></Card>
                            <Card className="rounded-xl p-2.5 text-center border-border/30"><p className="text-[8px] font-bold uppercase text-muted-foreground">Gastos</p><p className="text-sm font-black text-red-500">{fmtShort(analytics.summary.total_expenses)}</p></Card>
                            <Card className="rounded-xl p-2.5 text-center border-border/30"><p className="text-[8px] font-bold uppercase text-muted-foreground">Balance</p><p className={cn("text-sm font-black", analytics.summary.balance >= 0 ? "text-emerald-500" : "text-red-500")}>{fmtShort(analytics.summary.balance)}</p></Card>
                        </div>
                        {/* Filtros */}
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative flex-1 min-w-[140px]">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                                <Input placeholder="Buscar..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-8 h-8 bg-muted/20 border-border/30 rounded-lg text-xs" />
                            </div>
                            <div className="flex items-center gap-0.5 bg-muted/20 p-0.5 rounded-lg">
                                <button onClick={() => setFilterBank('all')} className={cn("px-2 py-1 rounded text-[9px] font-bold uppercase", filterBank === 'all' ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>Todos</button>
                                {bankNames.map(b => <button key={b} onClick={() => setFilterBank(b)} className={cn("px-2 py-1 rounded text-[9px] font-bold uppercase", filterBank === b ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{b}</button>)}
                            </div>
                        </div>
                        {/* Lista mobile-first */}
                        <div className="space-y-1.5">
                            {filteredTx.slice(0, 150).map(tx => (
                                <Card key={tx.id} className="rounded-xl border-border/30 p-3">
                                    <div className="flex items-center gap-2.5">
                                        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", tx.nature === 'CR' ? "bg-emerald-500/10" : "bg-red-500/10")}>
                                            {tx.nature === 'CR' ? <ArrowDownRight className="w-4 h-4 text-emerald-500" /> : <ArrowUpRight className="w-4 h-4 text-red-500" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[10px] font-black uppercase truncate">{tx.typeOperation}</p>
                                            <p className="text-[8px] text-muted-foreground">{tx.date} · {tx.bank}{tx.card ? ` · ${tx.card}` : ''}</p>
                                        </div>
                                        <p className={cn("text-sm font-black italic shrink-0", tx.nature === 'CR' ? "text-emerald-500" : "text-red-500")}>{tx.nature === 'CR' ? '+' : '-'}{fmtShort(tx.amount)}</p>
                                    </div>
                                    <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-border/10">
                                        {editingTxId === tx.id ? (
                                            <select className="text-[9px] font-bold rounded border border-border bg-background px-1.5 h-6 flex-1 mr-2" onChange={e => handleSetCategory(tx.id, e.target.value)} defaultValue="">
                                                <option value="" disabled>Seleccionar...</option>
                                                {(tx.nature === 'CR' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        ) : (
                                            <Badge variant="outline" className="text-[7px] font-black uppercase cursor-pointer hover:bg-primary/10" onClick={() => setEditingTxId(tx.id)}>{tx.manualCategory || tx.category}</Badge>
                                        )}
                                        <span className="text-[8px] text-muted-foreground/60">{tx.note}</span>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </div>
                )}

                {viewMode === 'categorias' && (
                    <div className="space-y-4 max-w-2xl mx-auto">
                        <Card className="rounded-2xl border-border/30 p-4">
                            <h2 className="text-xs font-black uppercase tracking-widest flex items-center gap-2 mb-3"><TrendingDown className="w-4 h-4 text-red-500" /> Gastos</h2>
                            {analytics.categoryDetails?.filter(c => !c.isIncome).length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">Sin gastos</p> :
                            <div className="space-y-2">
                                {analytics.categoryDetails?.filter(c => !c.isIncome).map((cat, i) => (
                                    <div key={cat.name} className="space-y-0.5">
                                        <div className="flex justify-between text-[10px]"><span className="font-bold">{cat.name}</span><span className="font-black text-red-500">{fmt(cat.total)} <span className="text-muted-foreground font-normal">({cat.percentage.toFixed(0)}%)</span></span></div>
                                        <div className="h-4 rounded bg-muted/30 overflow-hidden"><div className={cn("h-full rounded", CATEGORY_COLORS[i % CATEGORY_COLORS.length])} style={{width: `${Math.max(cat.percentage, 2)}%`}} /></div>
                                    </div>
                                ))}
                            </div>}
                        </Card>
                        <Card className="rounded-2xl border-border/30 p-4">
                            <h2 className="text-xs font-black uppercase tracking-widest flex items-center gap-2 mb-3"><TrendingUp className="w-4 h-4 text-emerald-500" /> Ingresos</h2>
                            {analytics.categoryDetails?.filter(c => c.isIncome).length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">Sin ingresos</p> :
                            <div className="space-y-2">
                                {analytics.categoryDetails?.filter(c => c.isIncome).map((cat, i) => (
                                    <div key={cat.name} className="space-y-0.5">
                                        <div className="flex justify-between text-[10px]"><span className="font-bold">{cat.name}</span><span className="font-black text-emerald-500">{fmt(cat.total)} <span className="text-muted-foreground font-normal">({cat.percentage.toFixed(0)}%)</span></span></div>
                                        <div className="h-4 rounded bg-muted/30 overflow-hidden"><div className={cn("h-full rounded", CATEGORY_COLORS[(i+8) % CATEGORY_COLORS.length])} style={{width: `${Math.max(cat.percentage, 2)}%`}} /></div>
                                    </div>
                                ))}
                            </div>}
                        </Card>
                        <Card className="rounded-2xl border-border/30 p-4">
                            <h2 className="text-xs font-black uppercase tracking-widest flex items-center gap-2 mb-2"><Edit2 className="w-4 h-4 text-primary" /> Sin Clasificar</h2>
                            <div className="space-y-1.5 max-h-60 overflow-y-auto no-scrollbar">
                                {analytics.transactions.filter(tx => { const c = tx.manualCategory || tx.category; return c === 'Otros' || c === 'Otros Ingresos'; }).slice(0, 30).map(tx => (
                                    <div key={tx.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/20">
                                        <div className="flex-1 min-w-0"><p className="text-[9px] font-bold truncate">{tx.typeOperation} — {tx.note}</p><p className="text-[7px] text-muted-foreground">{tx.date} · {fmt(tx.amount)}</p></div>
                                        {editingTxId === tx.id ? (
                                            <select className="text-[8px] font-bold rounded border border-border bg-background px-1 h-5" onChange={e => handleSetCategory(tx.id, e.target.value)} defaultValue=""><option value="" disabled>...</option>{(tx.nature === 'CR' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(c => <option key={c} value={c}>{c}</option>)}</select>
                                        ) : <button onClick={() => setEditingTxId(tx.id)} className="text-muted-foreground hover:text-primary shrink-0"><Edit2 className="w-3 h-3" /></button>}
                                    </div>
                                ))}
                                {analytics.transactions.filter(tx => { const c = tx.manualCategory || tx.category; return c === 'Otros' || c === 'Otros Ingresos'; }).length === 0 && <p className="text-[9px] text-muted-foreground text-center py-2">✓ Todo clasificado</p>}
                            </div>
                        </Card>
                    </div>
                )}

                {viewMode === 'reportes' && (
                    <div className="space-y-4 max-w-2xl mx-auto">
                        <Card className="rounded-2xl border-border/30 p-4">
                            <h2 className="text-xs font-black uppercase tracking-widest flex items-center gap-2 mb-3"><Calendar className="w-4 h-4 text-primary" /> Mensual</h2>
                            {analytics.monthlyDetails?.length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">Sin datos</p> :
                            <div className="space-y-3">
                                {[...(analytics.monthlyDetails || [])].reverse().map(m => {
                                    const max = Math.max(m.income, m.expenses, 1);
                                    const mi = parseInt(m.month.split('-')[1]) - 1;
                                    return (
                                        <div key={m.month}>
                                            <div className="flex justify-between text-[10px] mb-1"><span className="font-bold">{MONTH_NAMES[mi] || m.month} {m.month.split('-')[0]}</span><span className={cn("font-black", m.balance >= 0 ? "text-emerald-500" : "text-red-500")}>{m.balance >= 0 ? '+' : ''}{fmtShort(m.balance)}</span></div>
                                            <div className="flex gap-1 h-12 items-end">
                                                <div className="flex-1 flex flex-col items-center"><div className="w-full bg-emerald-500/70 rounded-t" style={{height: `${(m.income/max)*100}%`}} /><span className="text-[6px] font-bold text-emerald-500 mt-0.5">{fmtShort(m.income)}</span></div>
                                                <div className="flex-1 flex flex-col items-center"><div className="w-full bg-red-500/70 rounded-t" style={{height: `${(m.expenses/max)*100}%`}} /><span className="text-[6px] font-bold text-red-500 mt-0.5">{fmtShort(m.expenses)}</span></div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>}
                        </Card>
                        <Card className="rounded-2xl border-border/30 p-4">
                            <h2 className="text-xs font-black uppercase tracking-widest mb-3">Anual</h2>
                            {(() => {
                                const yr: Record<string, {i:number,e:number}> = {};
                                analytics.monthlyDetails?.forEach(m => { const y = m.month.split('-')[0]; if (!yr[y]) yr[y] = {i:0,e:0}; yr[y].i += m.income; yr[y].e += m.expenses; });
                                return Object.entries(yr).sort(([a],[b]) => b.localeCompare(a)).map(([y,d]) => (
                                    <div key={y} className="grid grid-cols-4 gap-2 p-2.5 rounded-lg bg-muted/20 mb-1.5 text-[10px]">
                                        <div><p className="text-[7px] uppercase text-muted-foreground">Año</p><p className="font-black">{y}</p></div>
                                        <div><p className="text-[7px] uppercase text-muted-foreground">Ing.</p><p className="font-black text-emerald-500">{fmtShort(d.i)}</p></div>
                                        <div><p className="text-[7px] uppercase text-muted-foreground">Gas.</p><p className="font-black text-red-500">{fmtShort(d.e)}</p></div>
                                        <div><p className="text-[7px] uppercase text-muted-foreground">Bal.</p><p className={cn("font-black", d.i-d.e >= 0 ? "text-emerald-500" : "text-red-500")}>{fmtShort(d.i-d.e)}</p></div>
                                    </div>
                                ));
                            })()}
                        </Card>
                    </div>
                )}

                {viewMode === 'analytics' && <AnalyticsDashboard analytics={analytics} />}

                {viewMode === 'bd' && (
                    <div className="space-y-3 max-w-2xl mx-auto">
                        <div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" /><Input placeholder="Buscar SMS..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-8 h-8 bg-muted/20 border-border/30 rounded-lg text-xs" /></div>
                        <div className="space-y-1.5">
                            {analytics.rawSms.filter(s => s.content.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 100).map(sms => (
                                <Card key={sms.id} className="rounded-xl border-border/30 p-2.5">
                                    <div className="flex items-center gap-2 mb-1"><Badge variant="outline" className="text-[7px] font-black uppercase shrink-0">{sms.type}</Badge><span className="text-[8px] text-muted-foreground">{sms.date}</span></div>
                                    <p className="text-[9px] text-muted-foreground/80 leading-snug">{sms.content.substring(0, 200)}{sms.content.length > 200 ? '...' : ''}</p>
                                </Card>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Import Modal */}
            {isImporting && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/90 backdrop-blur-sm" onClick={() => setIsImporting(false)}>
                    <Card className="w-full max-w-lg rounded-3xl border-border/30 shadow-2xl p-5" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-3"><h2 className="text-sm font-black uppercase">Importar SMS</h2><button onClick={() => setIsImporting(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button></div>
                        <textarea value={importText} onChange={e => setImportText(e.target.value)} placeholder="Pega mensajes de Transfermóvil..." className="w-full h-32 p-3 bg-muted/20 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none mb-3" />
                        <div className="flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => setIsImporting(false)} className="text-[10px] uppercase">Cancelar</Button><Button size="sm" onClick={handleImport} className="text-[10px] uppercase">Procesar</Button></div>
                    </Card>
                </div>
            )}
        </div>
    );
}
