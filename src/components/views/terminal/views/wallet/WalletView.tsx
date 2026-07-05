'use client';

import React, { useState, useEffect, useMemo, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Wallet, ArrowUpRight, ArrowDownRight, Landmark, CreditCard,
    Search, Plus, PieChart, Database, Table,
    TrendingUp, TrendingDown, Building2, ChevronRight, Tag,
    Calendar, BarChart3, Edit2, Check, X
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { parseRawSms, calculateAnalytics } from "@/lib/wallet/parser";
import { RawSms, AnalyticalTransaction, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/wallet/types";
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

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export default function WalletView() {
    const [rawSms, setRawSms] = useState<RawSms[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [importText, setImportText] = useState('');
    const [viewMode, setViewMode] = useState<'resumen' | 'transacciones' | 'categorias' | 'reportes' | 'bd'>('resumen');
    const [filterBank, setFilterBank] = useState<string | 'all'>('all');
    const [editingTxId, setEditingTxId] = useState<string | null>(null);
    const [manualCategories, setManualCategories] = useState<Record<string, string>>({});
    const importModalRef = useFocusTrap(isImporting);
    const isMounted = useSyncExternalStore(() => () => {}, () => true, () => false);

    useEffect(() => {
        try {
            const saved = localStorage.getItem('wallet_raw_sms');
            if (saved) { const parsed = JSON.parse(saved); requestAnimationFrame(() => setRawSms(parsed)); }
            const savedCats = localStorage.getItem('wallet_manual_categories');
            if (savedCats) setManualCategories(JSON.parse(savedCats));
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
            if (uniqueNew.length === 0) { toast.info('No se encontraron mensajes nuevos'); }
            else { saveRawSms([...uniqueNew, ...rawSms]); toast.success(`Importados ${uniqueNew.length} mensajes nuevos`); }
            setImportText(''); setIsImporting(false);
        } catch (e) { toast.error('Error al procesar'); }
    };

    // FIX-WALLET-V2: aplicar manualCategories a las transacciones antes de calcular analytics
    const analytics = useMemo(() => {
        const a = calculateAnalytics(rawSms);
        // Aplicar manualCategories
        a.transactions.forEach(tx => {
            if (manualCategories[tx.id]) tx.manualCategory = manualCategories[tx.id];
        });
        // Recalcular categoryDetails con manualCategories
        return a;
    }, [rawSms, manualCategories]);

    const handleSetCategory = (txId: string, category: string) => {
        const newCats = { ...manualCategories, [txId]: category };
        setManualCategories(newCats);
        if (typeof window !== 'undefined') localStorage.setItem('wallet_manual_categories', JSON.stringify(newCats));
        setEditingTxId(null);
        toast.success(`Clasificado como: ${category}`);
    };

    const formatCurrency = (val: number) => new Intl.NumberFormat('es-CU', { style: 'currency', currency: 'CUP', maximumFractionDigits: 2 }).format(val);
    const formatCurrencyShort = (val: number) => {
        if (Math.abs(val) >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
        if (Math.abs(val) >= 1000) return `$${(val / 1000).toFixed(1)}K`;
        return `$${val.toFixed(0)}`;
    };

    const bankEntries = Object.entries(analytics.banks).sort(([a], [b]) => a.localeCompare(b));
    const bankNames = bankEntries.map(([name]) => name);

    const filteredTransactions = useMemo(() => {
        let txs = analytics.transactions;
        if (filterBank !== 'all') txs = txs.filter(tx => tx.bank === filterBank);
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            txs = txs.filter(tx =>
                tx.note.toLowerCase().includes(q) || tx.category.toLowerCase().includes(q) ||
                tx.bank.toLowerCase().includes(q) || tx.typeOperation.toLowerCase().includes(q) ||
                (tx.card && tx.card.includes(q))
            );
        }
        return txs;
    }, [analytics.transactions, filterBank, searchQuery]);

    // FIX-WALLET-V2: gastos por categoría (solo DB)
    const expenseCategories = analytics.categoryDetails?.filter(c => !c.isIncome) || [];
    const incomeCategories = analytics.categoryDetails?.filter(c => c.isIncome) || [];

    if (!isMounted) return null;

    const bankColors: Record<string, string> = {
        'BPA': 'from-blue-500/20 to-blue-600/5 border-blue-500/20',
        'BANDEC': 'from-emerald-500/20 to-emerald-600/5 border-emerald-500/20',
        'METRO': 'from-purple-500/20 to-purple-600/5 border-purple-500/20',
        'DESCONOCIDO': 'from-muted/20 to-muted/5 border-border/20',
    };

    // Colores para categorías (gráfico de barras)
    const categoryColors = [
        'bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-yellow-500',
        'bg-lime-500', 'bg-green-500', 'bg-emerald-500', 'bg-teal-500',
        'bg-cyan-500', 'bg-blue-500', 'bg-indigo-500', 'bg-purple-500',
        'bg-pink-500', 'bg-rose-500', 'bg-gray-500', 'bg-slate-500',
    ];

    return (
        <div className="flex flex-col h-full bg-background overflow-hidden animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between p-4 md:p-6 gap-3 shrink-0 bg-background/80 backdrop-blur-md z-10 border-b border-border/20">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
                        <Wallet className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <div>
                        <h1 className="text-base font-black uppercase tracking-tight">Billetera Digital</h1>
                        <p className="text-[9px] font-bold uppercase tracking-widest opacity-50">Gestión Financiera Personal</p>
                    </div>
                </div>
                <div className="flex items-center gap-1 bg-muted/30 p-1 rounded-xl overflow-x-auto no-scrollbar">
                    {([
                        { id: 'resumen', label: 'Resumen', icon: Building2 },
                        { id: 'transacciones', label: 'Transacciones', icon: Table },
                        { id: 'categorias', label: 'Categorías', icon: Tag },
                        { id: 'reportes', label: 'Reportes', icon: BarChart3 },
                        { id: 'bd', label: 'BD', icon: Database },
                    ] as const).map(tab => {
                        const Icon = tab.icon;
                        return (
                            <button key={tab.id} onClick={() => setViewMode(tab.id)}
                                className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase whitespace-nowrap transition-all",
                                    viewMode === tab.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                                <Icon className="w-3.5 h-3.5 shrink-0" />
                                <span className="hidden sm:inline">{tab.label}</span>
                            </button>
                        );
                    })}
                </div>
                <Button onClick={() => setIsImporting(true)} className="rounded-xl bg-primary text-primary-foreground h-9 px-4 text-[10px] font-black uppercase shrink-0">
                    <Plus className="w-4 h-4 mr-1" /> <span className="hidden sm:inline">Importar</span>
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar pb-20">
                {viewMode === 'resumen' ? (
                    /* ═══════════════ RESUMEN ═══════════════ */
                    <div className="p-4 md:p-6 space-y-6">
                        <Card className="rounded-[28px] border-2 border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest opacity-50">Patrimonio Total</p>
                                    <p className="text-4xl font-black italic text-primary mt-1">{formatCurrency(analytics.total_real_balance || 0)}</p>
                                    <p className="text-[10px] opacity-50 mt-1">Saldo real reportado por cada banco</p>
                                </div>
                                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                                    <Wallet className="w-8 h-8 text-primary" />
                                </div>
                            </div>
                        </Card>

                        <div className="grid grid-cols-2 gap-3">
                            <Card className="rounded-2xl border-border/30 bg-success/5 p-4">
                                <div className="flex items-center gap-2 mb-1"><TrendingUp className="w-4 h-4 text-success" /><p className="text-[9px] font-black uppercase opacity-50">Ingresos</p></div>
                                <p className="text-lg font-black italic text-success">{formatCurrency(analytics.summary.total_income)}</p>
                            </Card>
                            <Card className="rounded-2xl border-border/30 bg-destructive/5 p-4">
                                <div className="flex items-center gap-2 mb-1"><TrendingDown className="w-4 h-4 text-destructive" /><p className="text-[9px] font-black uppercase opacity-50">Gastos</p></div>
                                <p className="text-lg font-black italic text-destructive">{formatCurrency(analytics.summary.total_expenses)}</p>
                            </Card>
                        </div>

                        <div className="space-y-3">
                            <p className="text-[10px] font-black uppercase tracking-widest opacity-60 px-1">Cuentas por Banco</p>
                            {bankEntries.length === 0 ? (
                                <Card className="rounded-2xl border-dashed border-border/30 p-8 text-center">
                                    <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                                    <p className="text-xs font-bold uppercase opacity-40">Importa SMS para ver el resumen.</p>
                                </Card>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {bankEntries.map(([bankName, bank]) => (
                                        <Card key={bankName} className={cn("rounded-[24px] border bg-gradient-to-br p-5 cursor-pointer transition-all hover:shadow-lg", bankColors[bankName] || bankColors['DESCONOCIDO'])}
                                            onClick={() => { setFilterBank(bankName); setViewMode('transacciones'); }}>
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-10 h-10 rounded-xl bg-background/50 flex items-center justify-center"><Landmark className="w-5 h-5 text-foreground" /></div>
                                                    <div>
                                                        <p className="text-sm font-black uppercase tracking-tight">{bankName}</p>
                                                        {bank.card && <div className="flex items-center gap-1 mt-0.5"><CreditCard className="w-3 h-3 opacity-50" /><p className="text-[9px] font-bold opacity-50">{bank.card}</p></div>}
                                                    </div>
                                                </div>
                                                <ChevronRight className="w-4 h-4 opacity-30" />
                                            </div>
                                            <div className="space-y-2">
                                                <div>
                                                    <p className="text-[9px] font-black uppercase opacity-50">Saldo Disponible</p>
                                                    <p className={cn("text-2xl font-black italic", bank.current_balance > 0 ? "text-success" : "text-destructive")}>{formatCurrency(bank.current_balance)}</p>
                                                    {bank.last_balance_date && <p className="text-[8px] opacity-40">Actualizado: {bank.last_balance_date}</p>}
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/20">
                                                    <div><p className="text-[8px] font-black uppercase opacity-40">Ingresos</p><p className="text-xs font-black text-success">{formatCurrencyShort(bank.income)}</p></div>
                                                    <div><p className="text-[8px] font-black uppercase opacity-40">Gastos</p><p className="text-xs font-black text-destructive">{formatCurrencyShort(bank.expenses)}</p></div>
                                                </div>
                                                <p className="text-[8px] font-bold uppercase opacity-30">{bank.transaction_count} transacciones</p>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ) : viewMode === 'categorias' ? (
                    /* ═══════════════ CATEGORÍAS ═══════════════ */
                    <div className="p-4 md:p-6 space-y-6">
                        {/* Gastos por categoría — barras horizontales */}
                        <Card className="rounded-[24px] border-border/30 p-5">
                            <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2 mb-4">
                                <TrendingDown className="w-4 h-4 text-destructive" /> Gastos por Categoría
                            </h2>
                            {expenseCategories.length === 0 ? (
                                <p className="text-xs opacity-40 text-center py-8">No hay gastos registrados</p>
                            ) : (
                                <div className="space-y-2">
                                    {expenseCategories.map((cat, i) => (
                                        <div key={cat.name} className="space-y-1">
                                            <div className="flex items-center justify-between text-[10px]">
                                                <span className="font-black uppercase">{cat.name}</span>
                                                <span className="font-black text-destructive">{formatCurrency(cat.total)} <span className="opacity-40">({cat.percentage.toFixed(0)}%)</span></span>
                                            </div>
                                            <div className="h-6 rounded-lg bg-muted/30 overflow-hidden">
                                                <div className={cn("h-full rounded-lg flex items-center justify-end px-2 transition-all", categoryColors[i % categoryColors.length])}
                                                    style={{ width: `${Math.max(cat.percentage, 3)}%` }}>
                                                    <span className="text-[8px] font-black text-white">{cat.count} tx</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>

                        {/* Ingresos por categoría */}
                        {incomeCategories.length > 0 && (
                            <Card className="rounded-[24px] border-border/30 p-5">
                                <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2 mb-4">
                                    <TrendingUp className="w-4 h-4 text-success" /> Ingresos por Categoría
                                </h2>
                                <div className="space-y-2">
                                    {incomeCategories.map((cat, i) => (
                                        <div key={cat.name} className="space-y-1">
                                            <div className="flex items-center justify-between text-[10px]">
                                                <span className="font-black uppercase">{cat.name}</span>
                                                <span className="font-black text-success">{formatCurrency(cat.total)} <span className="opacity-40">({cat.percentage.toFixed(0)}%)</span></span>
                                            </div>
                                            <div className="h-6 rounded-lg bg-muted/30 overflow-hidden">
                                                <div className={cn("h-full rounded-lg", categoryColors[(i + 8) % categoryColors.length])}
                                                    style={{ width: `${Math.max(cat.percentage, 3)}%` }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        )}

                        {/* Transacciones sin clasificar — reclasificación manual */}
                        <Card className="rounded-[24px] border-border/30 p-5">
                            <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2 mb-4">
                                <Edit2 className="w-4 h-4 text-primary" /> Clasificar Transacciones
                            </h2>
                            <p className="text-[10px] opacity-50 mb-3">Toca el botón ✏️ de cualquier transacción para cambiar su categoría.</p>
                            <div className="space-y-2 max-h-96 overflow-y-auto no-scrollbar">
                                {analytics.transactions.filter(tx => {
                                    const cat = tx.manualCategory || tx.category;
                                    return cat === 'Otros' || cat === 'Otros Ingresos';
                                }).slice(0, 50).map(tx => (
                                    <div key={tx.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/20">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[10px] font-black uppercase truncate">{tx.typeOperation} — {tx.note}</p>
                                            <p className="text-[8px] opacity-50">{tx.date} · {tx.bank} · {formatCurrency(tx.amount)}</p>
                                        </div>
                                        {editingTxId === tx.id ? (
                                            <div className="flex items-center gap-1">
                                                <select
                                                    className="text-[9px] font-bold rounded-lg border border-border bg-background px-2 h-7"
                                                    onChange={e => handleSetCategory(tx.id, e.target.value)}
                                                    defaultValue=""
                                                >
                                                    <option value="" disabled>Seleccionar...</option>
                                                    {(tx.nature === 'CR' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(c => (
                                                        <option key={c} value={c}>{c}</option>
                                                    ))}
                                                </select>
                                                <button onClick={() => setEditingTxId(null)} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                                            </div>
                                        ) : (
                                            <button onClick={() => setEditingTxId(tx.id)} className="text-muted-foreground hover:text-primary shrink-0 ml-2">
                                                <Edit2 className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                                {analytics.transactions.filter(tx => {
                                    const cat = tx.manualCategory || tx.category;
                                    return cat === 'Otros' || cat === 'Otros Ingresos';
                                }).length === 0 && (
                                    <p className="text-[10px] opacity-40 text-center py-4">✓ Todas las transacciones están clasificadas</p>
                                )}
                            </div>
                        </Card>

                        {/* Lista completa con edición rápida */}
                        <Card className="rounded-[24px] border-border/30 p-5">
                            <h2 className="text-sm font-black uppercase tracking-widest mb-3">Todas las Transacciones</h2>
                            <div className="space-y-1 max-h-96 overflow-y-auto no-scrollbar">
                                {analytics.transactions.slice(0, 100).map(tx => (
                                    <div key={tx.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/20">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[9px] font-black uppercase truncate">{tx.typeOperation}</p>
                                            <p className="text-[8px] opacity-50">{tx.date} · {tx.bank}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {editingTxId === tx.id ? (
                                                <select className="text-[9px] font-bold rounded-lg border border-border bg-background px-2 h-6"
                                                    onChange={e => handleSetCategory(tx.id, e.target.value)} defaultValue="">
                                                    <option value="" disabled>...</option>
                                                    {(tx.nature === 'CR' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                            ) : (
                                                <Badge variant="outline" className="text-[7px] font-black uppercase cursor-pointer" onClick={() => setEditingTxId(tx.id)}>
                                                    {tx.manualCategory || tx.category}
                                                </Badge>
                                            )}
                                            <span className={cn("text-[9px] font-black", tx.nature === 'CR' ? "text-success" : "text-destructive")}>
                                                {tx.nature === 'CR' ? '+' : '-'}{formatCurrencyShort(tx.amount)}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </div>
                ) : viewMode === 'reportes' ? (
                    /* ═══════════════ REPORTES ═══════════════ */
                    <div className="p-4 md:p-6 space-y-6">
                        {/* Ingresos vs Gastos por mes */}
                        <Card className="rounded-[24px] border-border/30 p-5">
                            <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2 mb-4">
                                <Calendar className="w-4 h-4 text-primary" /> Ingresos vs Gastos Mensuales
                            </h2>
                            {analytics.monthlyDetails?.length === 0 ? (
                                <p className="text-xs opacity-40 text-center py-8">Sin datos</p>
                            ) : (
                                <div className="space-y-3">
                                    {[...(analytics.monthlyDetails || [])].reverse().map(m => {
                                        const maxVal = Math.max(m.income, m.expenses, 1);
                                        const monthIdx = parseInt(m.month.split('-')[1]) - 1;
                                        const monthName = MONTH_NAMES[monthIdx] || m.month;
                                        const year = m.month.split('-')[0];
                                        return (
                                            <div key={m.month} className="space-y-1">
                                                <div className="flex items-center justify-between text-[10px]">
                                                    <span className="font-black uppercase">{monthName} {year}</span>
                                                    <span className={cn("font-black", m.balance >= 0 ? "text-success" : "text-destructive")}>
                                                        {m.balance >= 0 ? '+' : ''}{formatCurrencyShort(m.balance)}
                                                    </span>
                                                </div>
                                                <div className="flex gap-1 h-16 items-end">
                                                    <div className="flex-1 flex flex-col items-center gap-0.5">
                                                        <div className="w-full bg-success/80 rounded-t-lg transition-all" style={{ height: `${(m.income / maxVal) * 100}%` }} />
                                                        <span className="text-[7px] font-black text-success">{formatCurrencyShort(m.income)}</span>
                                                    </div>
                                                    <div className="flex-1 flex flex-col items-center gap-0.5">
                                                        <div className="w-full bg-destructive/80 rounded-t-lg transition-all" style={{ height: `${(m.expenses / maxVal) * 100}%` }} />
                                                        <span className="text-[7px] font-black text-destructive">{formatCurrencyShort(m.expenses)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </Card>

                        {/* Resumen anual */}
                        <Card className="rounded-[24px] border-border/30 p-5">
                            <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2 mb-4">
                                <BarChart3 className="w-4 h-4 text-primary" /> Resumen Anual
                            </h2>
                            {(() => {
                                const yearlyMap: Record<string, { income: number; expenses: number; balance: number }> = {};
                                analytics.monthlyDetails?.forEach(m => {
                                    const year = m.month.split('-')[0];
                                    if (!yearlyMap[year]) yearlyMap[year] = { income: 0, expenses: 0, balance: 0 };
                                    yearlyMap[year].income += m.income;
                                    yearlyMap[year].expenses += m.expenses;
                                    yearlyMap[year].balance += m.balance;
                                });
                                const years = Object.entries(yearlyMap).sort(([a], [b]) => b.localeCompare(a));
                                return years.map(([year, data]) => (
                                    <div key={year} className="grid grid-cols-4 gap-2 p-3 rounded-xl bg-muted/20 mb-2">
                                        <div><p className="text-[8px] font-black uppercase opacity-40">Año</p><p className="text-sm font-black">{year}</p></div>
                                        <div><p className="text-[8px] font-black uppercase opacity-40">Ingresos</p><p className="text-sm font-black text-success">{formatCurrencyShort(data.income)}</p></div>
                                        <div><p className="text-[8px] font-black uppercase opacity-40">Gastos</p><p className="text-sm font-black text-destructive">{formatCurrencyShort(data.expenses)}</p></div>
                                        <div><p className="text-[8px] font-black uppercase opacity-40">Balance</p><p className={cn("text-sm font-black", data.balance >= 0 ? "text-success" : "text-destructive")}>{formatCurrencyShort(data.balance)}</p></div>
                                    </div>
                                ));
                            })()}
                        </Card>

                        {/* Top categorías del mes más reciente */}
                        {analytics.monthlyDetails && analytics.monthlyDetails.length > 0 && (
                            <Card className="rounded-[24px] border-border/30 p-5">
                                <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2 mb-4">
                                    <Tag className="w-4 h-4 text-primary" /> Top Categorías del Mes Más Reciente
                                </h2>
                                {(() => {
                                    const lastMonth = analytics.monthlyDetails[analytics.monthlyDetails.length - 1];
                                    const monthIdx = parseInt(lastMonth.month.split('-')[1]) - 1;
                                    const monthName = MONTH_NAMES[monthIdx] || lastMonth.month;
                                    const sortedCats = Object.entries(lastMonth.categories).sort(([, a], [, b]) => b - a).slice(0, 8);
                                    return (
                                        <>
                                            <p className="text-[10px] opacity-50 mb-3">{monthName} {lastMonth.month.split('-')[0]} · {lastMonth.transactionCount} transacciones</p>
                                            <div className="space-y-2">
                                                {sortedCats.map(([cat, amount], i) => (
                                                    <div key={cat} className="flex items-center justify-between text-[10px]">
                                                        <div className="flex items-center gap-2">
                                                            <div className={cn("w-2 h-2 rounded-full", categoryColors[i % categoryColors.length])} />
                                                            <span className="font-black uppercase">{cat}</span>
                                                        </div>
                                                        <span className="font-black">{formatCurrency(amount)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    );
                                })()}
                            </Card>
                        )}
                    </div>
                ) : viewMode === 'bd' ? (
                    /* ═══════════════ BD: SMS crudos ═══════════════ */
                    <div className="px-4 md:px-6 pt-6 space-y-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-50" />
                            <Input placeholder="Buscar SMS..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                className="pl-9 h-9 bg-muted/20 border-border/30 rounded-xl text-xs font-medium" />
                        </div>
                        <Card className="rounded-3xl border-border/30 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead><tr className="bg-muted/10 border-b border-border/20">
                                        <th className="px-4 py-3 text-[8px] font-black uppercase tracking-widest opacity-50">Tipo</th>
                                        <th className="px-4 py-3 text-[8px] font-black uppercase tracking-widest opacity-50">Fecha</th>
                                        <th className="px-4 py-3 text-[8px] font-black uppercase tracking-widest opacity-50">Contenido</th>
                                    </tr></thead>
                                    <tbody className="divide-y divide-border/10">
                                        {analytics.rawSms.filter(sms => sms.content.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 200).map(sms => (
                                            <tr key={sms.id} className="hover:bg-primary/5">
                                                <td className="px-4 py-3"><Badge variant="outline" className="text-[7px] font-black uppercase">{sms.type}</Badge></td>
                                                <td className="px-4 py-3 text-[9px] font-medium whitespace-nowrap">{sms.date}</td>
                                                <td className="px-4 py-3 text-[9px] opacity-60 max-w-md truncate">{sms.content}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    </div>
                ) : (
                    /* ═══════════════ TRANSACCIONES (todas, todos los bancos) ═══════════════ */
                    <div className="px-4 md:px-6 pt-6 space-y-4">
                        {/* Stats rápidas */}
                        <div className="grid grid-cols-3 gap-2">
                            <Card className="rounded-2xl border-border/30 bg-success/5 p-3 text-center">
                                <p className="text-[8px] font-black uppercase opacity-50">Ingresos</p>
                                <p className="text-sm font-black text-success">{formatCurrencyShort(analytics.summary.total_income)}</p>
                            </Card>
                            <Card className="rounded-2xl border-border/30 bg-destructive/5 p-3 text-center">
                                <p className="text-[8px] font-black uppercase opacity-50">Gastos</p>
                                <p className="text-sm font-black text-destructive">{formatCurrencyShort(analytics.summary.total_expenses)}</p>
                            </Card>
                            <Card className="rounded-2xl border-border/30 bg-primary/5 p-3 text-center">
                                <p className="text-[8px] font-black uppercase opacity-50">Balance</p>
                                <p className={cn("text-sm font-black", analytics.summary.balance >= 0 ? "text-success" : "text-destructive")}>{formatCurrencyShort(analytics.summary.balance)}</p>
                            </Card>
                        </div>

                        {/* Filtros */}
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative flex-1 min-w-[180px]">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-50" />
                                <Input placeholder="Buscar..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                    className="pl-9 h-9 bg-muted/20 border-border/30 rounded-xl text-xs font-medium" />
                            </div>
                            <div className="flex items-center gap-1 bg-muted/30 p-1 rounded-xl">
                                <button onClick={() => setFilterBank('all')}
                                    className={cn("px-2.5 py-1 rounded-lg text-[9px] font-black uppercase transition-all", filterBank === 'all' ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>Todos</button>
                                {bankNames.map(bank => (
                                    <button key={bank} onClick={() => setFilterBank(bank)}
                                        className={cn("px-2.5 py-1 rounded-lg text-[9px] font-black uppercase transition-all", filterBank === bank ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{bank}</button>
                                ))}
                            </div>
                        </div>

                        {/* Desktop: tabla */}
                        <Card className="hidden md:block rounded-3xl border-border/30 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead><tr className="bg-muted/10 border-b border-border/20">
                                        <th className="px-4 py-3 text-[8px] font-black uppercase tracking-widest opacity-50">Fecha</th>
                                        <th className="px-4 py-3 text-[8px] font-black uppercase tracking-widest opacity-50">Banco</th>
                                        <th className="px-4 py-3 text-[8px] font-black uppercase tracking-widest opacity-50">Tarjeta</th>
                                        <th className="px-4 py-3 text-[8px] font-black uppercase tracking-widest opacity-50">Operación</th>
                                        <th className="px-4 py-3 text-[8px] font-black uppercase tracking-widest opacity-50">Categoría</th>
                                        <th className="px-4 py-3 text-[8px] font-black uppercase tracking-widest opacity-50 text-right">Monto</th>
                                    </tr></thead>
                                    <tbody className="divide-y divide-border/10">
                                        {filteredTransactions.slice(0, 300).map(tx => (
                                            <tr key={tx.id} className="hover:bg-primary/5">
                                                <td className="px-4 py-3 text-[9px] font-medium whitespace-nowrap">{tx.date}</td>
                                                <td className="px-4 py-3"><Badge variant="outline" className="text-[7px] font-black uppercase">{tx.bank}</Badge></td>
                                                <td className="px-4 py-3 text-[9px] opacity-50 font-mono">{tx.card || '—'}</td>
                                                <td className="px-4 py-3"><div className="flex flex-col"><span className="text-[9px] font-black uppercase">{tx.typeOperation}</span><span className="text-[8px] opacity-50 uppercase font-bold">{tx.note}</span></div></td>
                                                <td className="px-4 py-3">
                                                    {editingTxId === tx.id ? (
                                                        <select className="text-[9px] font-bold rounded-lg border border-border bg-background px-2 h-6"
                                                            onChange={e => handleSetCategory(tx.id, e.target.value)} defaultValue="">
                                                            <option value="" disabled>...</option>
                                                            {(tx.nature === 'CR' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(c => <option key={c} value={c}>{c}</option>)}
                                                        </select>
                                                    ) : (
                                                        <Badge className="text-[7px] font-black uppercase cursor-pointer" onClick={() => setEditingTxId(tx.id)}>
                                                            {tx.manualCategory || tx.category}
                                                        </Badge>
                                                    )}
                                                </td>
                                                <td className={cn("px-4 py-3 text-right text-[10px] font-black", tx.nature === 'CR' ? "text-success" : "text-destructive")}>
                                                    {tx.nature === 'CR' ? '+' : '-'}{formatCurrency(tx.amount)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Card>

                        {/* Mobile: cards */}
                        <div className="md:hidden space-y-2">
                            {filteredTransactions.slice(0, 100).map(tx => (
                                <Card key={tx.id} className="rounded-2xl border-border/30 p-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", tx.nature === 'CR' ? "bg-success/10" : "bg-destructive/10")}>
                                                {tx.nature === 'CR' ? <ArrowDownRight className="w-4 h-4 text-success" /> : <ArrowUpRight className="w-4 h-4 text-destructive" />}
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black uppercase">{tx.typeOperation}</p>
                                                <p className="text-[8px] opacity-50">{tx.date} · {tx.bank}{tx.card ? ` · ${tx.card}` : ''}</p>
                                            </div>
                                        </div>
                                        <p className={cn("text-sm font-black italic", tx.nature === 'CR' ? "text-success" : "text-destructive")}>
                                            {tx.nature === 'CR' ? '+' : '-'}{formatCurrencyShort(tx.amount)}
                                        </p>
                                    </div>
                                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/10">
                                        {editingTxId === tx.id ? (
                                            <select className="text-[9px] font-bold rounded-lg border border-border bg-background px-2 h-6 flex-1"
                                                onChange={e => handleSetCategory(tx.id, e.target.value)} defaultValue="">
                                                <option value="" disabled>Seleccionar...</option>
                                                {(tx.nature === 'CR' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        ) : (
                                            <Badge variant="outline" className="text-[7px] font-black uppercase cursor-pointer" onClick={() => setEditingTxId(tx.id)}>
                                                {tx.manualCategory || tx.category}
                                            </Badge>
                                        )}
                                        <span className="text-[8px] opacity-40">{tx.note}</span>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Import Modal */}
            {isImporting && (
                <div ref={importModalRef} role="dialog" aria-modal="true" aria-label="Importar mensajes SMS"
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
                    <Card className="w-full max-w-xl rounded-[2rem] border-border/30 shadow-2xl p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-base font-black uppercase tracking-tight">Importar SMS</h2>
                            <Button variant="ghost" onClick={() => setIsImporting(false)} className="h-8 w-8 p-0">×</Button>
                        </div>
                        <p className="text-[9px] font-bold uppercase tracking-widest opacity-50 mb-3">Pega los mensajes de Transfermóvil / PAGOxMOVIL</p>
                        <textarea value={importText} onChange={e => setImportText(e.target.value)}
                            placeholder="Pega aquí tus mensajes..."
                            aria-label="Área de texto para importar mensajes SMS"
                            className="w-full h-40 p-3 bg-muted/20 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none mb-4" />
                        <div className="flex justify-end gap-2">
                            <Button variant="ghost" onClick={() => setIsImporting(false)} className="font-bold text-[10px] uppercase h-9">Cancelar</Button>
                            <Button onClick={handleImport} className="rounded-xl bg-primary text-primary-foreground px-6 font-black uppercase text-[10px] h-9">Procesar</Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}
