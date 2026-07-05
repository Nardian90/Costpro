'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Wallet, ArrowDownRight, ArrowUpRight, Landmark, CreditCard,
    Plus, Upload, Smartphone, X, Tag, Calendar, BarChart3,
    TrendingUp, TrendingDown, Building2, ChevronRight, Edit2,
    PieChart as PieChartIcon, Search
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/wallet/types";

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const CAT_COLORS: Record<string, string> = {
    'Transferencia': '#3b82f6', 'Telecom': '#f59e0b', 'Electricidad': '#ef4444',
    'Agua': '#06b6d4', 'Gas': '#ec4899', 'Internet': '#8b5cf6',
    'Impuestos': '#dc2626', 'Servicios': '#10b981', 'Otros': '#6b7280',
    'Otros Ingresos': '#22c55e', 'Transferencia Recibida': '#16a34a',
};
const CAT_ICONS: Record<string, string> = {
    'Transferencia': '💸', 'Telecom': '📱', 'Electricidad': '⚡', 'Agua': '💧',
    'Gas': '🔥', 'Internet': '🌐', 'Impuestos': '🏛️', 'Servicios': '🧾',
    'Otros': '📦', 'Otros Ingresos': '💰', 'Transferencia Recibida': '📥',
};

type ViewMode = 'home' | 'movimientos' | 'categorias' | 'reportes';
interface WalletData {
    accounts: any[]; transactions: any[]; summary: any;
    banks: Record<string, any>; categories: Record<string, number>;
    monthly: Record<string, { income: number; expenses: number }>;
}

export default function WalletView() {
    const [data, setData] = useState<WalletData | null>(null);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<ViewMode>('home');
    const [isImporting, setIsImporting] = useState(false);
    const [importingTrm, setImportingTrm] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterBank, setFilterBank] = useState<string>('all');
    const [editingTxId, setEditingTxId] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const { useAuthStore } = await import('@/store');
            const token = useAuthStore.getState().token;
            const res = await fetch('/api/wallet/data', {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (res.ok) setData(await res.json());
        } catch (e) { console.error('Fetch error', e); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleTrmFile = async (file: File) => {
        setImportingTrm(true);
        try {
            const content = await file.text();
            const { useAuthStore } = await import('@/store');
            const token = useAuthStore.getState().token;
            const res = await fetch('/api/wallet/import-trm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ content }),
            });
            if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Error'); }
            const result = await res.json();
            toast.success(`Importado: ${result.transactions} transacciones, ${result.accounts} cuentas`);
            setIsImporting(false);
            fetchData();
        } catch (e: any) { toast.error('Error al importar .trm', { description: e.message }); }
        finally { setImportingTrm(false); }
    };

    const handleSetCategory = async (txId: string, category: string) => {
        setEditingTxId(null);
        try {
            const { useAuthStore } = await import('@/store');
            const token = useAuthStore.getState().token;
            const res = await fetch('/api/wallet/transaction', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ id: txId, category }),
            });
            if (!res.ok) throw new Error('Error');
            toast.success(`Clasificado: ${category}`);
            fetchData();
        } catch { toast.error('Error al clasificar'); }
    };

    // FIX-PHASE4 (2026-07-06): Agregar transacción manual
    const [showAddModal, setShowAddModal] = useState(false);
    const [addType, setAddType] = useState<'CR' | 'DB'>('DB');
    const [addForm, setAddForm] = useState({ amount: '', category: 'Otros', note: '', bank: 'BANDEC', date: new Date().toISOString().split('T')[0] });

    const handleAddTransaction = async () => {
        if (!addForm.amount || parseFloat(addForm.amount) <= 0) { toast.error('Monto inválido'); return; }
        try {
            const { useAuthStore } = await import('@/store');
            const token = useAuthStore.getState().token;
            const res = await fetch('/api/wallet/transaction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({
                    date: addForm.date,
                    bank: addForm.bank,
                    operation: addType,
                    amount: parseFloat(addForm.amount),
                    currency: 'CUP',
                    service: addType === 'CR' ? 'Ingreso manual' : 'Gasto manual',
                    category: addForm.category,
                    note: addForm.note,
                }),
            });
            if (!res.ok) throw new Error('Error');
            toast.success(addType === 'CR' ? 'Ingreso agregado' : 'Gasto agregado');
            setShowAddModal(false);
            setAddForm({ amount: '', category: 'Otros', note: '', bank: 'BANDEC', date: new Date().toISOString().split('T')[0] });
            fetchData();
        } catch { toast.error('Error al agregar'); }
    };

    // FIX-PHASE5 (2026-07-06): Eliminar transacción
    const handleDeleteTransaction = async (txId: string) => {
        if (!confirm('¿Eliminar esta transacción?')) return;
        try {
            const { useAuthStore } = await import('@/store');
            const token = useAuthStore.getState().token;
            const res = await fetch(`/api/wallet/transaction?id=${txId}`, {
                method: 'DELETE',
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (!res.ok) throw new Error('Error');
            toast.success('Transacción eliminada');
            fetchData();
        } catch { toast.error('Error al eliminar'); }
    };

    const fmt = (v: number) => new Intl.NumberFormat('es-CU', { style: 'currency', currency: 'CUP', maximumFractionDigits: 2 }).format(v || 0);
    const fmtShort = (v: number) => Math.abs(v) >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : Math.abs(v) >= 1000 ? `$${(v/1000).toFixed(1)}K` : `$${(v||0).toFixed(0)}`;

    const bankEntries = data ? Object.entries(data.banks).sort(([a],[b]) => a.localeCompare(b)) : [];
    const bankNames = bankEntries.map(([n]) => n);

    // Categorías para el donut chart (solo gastos)
    const expenseCats = useMemo(() => {
        if (!data) return [];
        return Object.entries(data.categories)
            .filter(([name]) => !name.includes('Ingreso') && !name.includes('Recibida'))
            .map(([name, total]) => ({ name, total, color: CAT_COLORS[name] || '#6b7280', icon: CAT_ICONS[name] || '📦' }))
            .sort((a, b) => b.total - a.total);
    }, [data]);

    const totalExpenses = expenseCats.reduce((s, c) => s + c.total, 0);

    const filteredTx = useMemo(() => {
        if (!data) return [];
        let txs = data.transactions;
        if (filterBank !== 'all') txs = txs.filter((t: any) => t.bank === filterBank);
        if (searchQuery) { const q = searchQuery.toLowerCase(); txs = txs.filter((t: any) => (t.service||'').toLowerCase().includes(q) || (t.category||'').toLowerCase().includes(q) || (t.bank||'').toLowerCase().includes(q)); }
        return txs;
    }, [data, filterBank, searchQuery]);

    if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
    if (!data) return <div className="flex flex-col items-center justify-center h-full gap-4"><Building2 className="w-12 h-12 text-muted-foreground/30" /><p className="text-sm text-muted-foreground">Sin datos. Importa un respaldo .trm.</p><Button onClick={() => setIsImporting(true)}><Upload className="w-4 h-4 mr-2" /> Importar</Button></div>;

    // SVG Donut chart
    const donutSegments = expenseCats.slice(0, 8);
    let cumulativePct = 0;
    const donutPaths = donutSegments.map(cat => {
        const pct = totalExpenses > 0 ? (cat.total / totalExpenses) * 100 : 0;
        const startAngle = (cumulativePct / 100) * 360 - 90;
        const endAngle = ((cumulativePct + pct) / 100) * 360 - 90;
        cumulativePct += pct;
        const r1 = 60, r2 = 90, cx = 100, cy = 100;
        const x1 = cx + r1 * Math.cos(startAngle * Math.PI / 180);
        const y1 = cy + r1 * Math.sin(startAngle * Math.PI / 180);
        const x2 = cx + r2 * Math.cos(startAngle * Math.PI / 180);
        const y2 = cy + r2 * Math.sin(startAngle * Math.PI / 180);
        const x3 = cx + r2 * Math.cos(endAngle * Math.PI / 180);
        const y3 = cy + r2 * Math.sin(endAngle * Math.PI / 180);
        const x4 = cx + r1 * Math.cos(endAngle * Math.PI / 180);
        const y4 = cy + r1 * Math.sin(endAngle * Math.PI / 180);
        const largeArc = pct > 50 ? 1 : 0;
        return { path: `M${x1},${y1} L${x2},${y2} A${r2},${r2} 0 ${largeArc} 1 ${x3},${y3} L${x4},${y4} A${r1},${r1} 0 ${largeArc} 0 ${x1},${y1} Z`, color: cat.color, name: cat.name, pct };
    });

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Header */}
            <div className="shrink-0 border-b border-border/20 bg-background/95 backdrop-blur-sm">
                <div className="flex items-center justify-between px-4 py-3 gap-3">
                    <div className="flex items-center gap-2.5 shrink-0">
                        <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center"><Wallet className="w-4.5 h-4.5 text-primary-foreground" /></div>
                        <div><h1 className="text-sm font-black leading-none">Billetera</h1><p className="text-[8px] text-muted-foreground font-bold uppercase tracking-wider mt-0.5">Finanzas</p></div>
                    </div>
                    <Button onClick={() => setIsImporting(true)} size="sm" className="h-8 px-3 text-[10px] font-black uppercase shrink-0"><Upload className="w-3.5 h-3.5 mr-1" /> .trm</Button>
                </div>
                <div className="flex items-center gap-0.5 px-2 pb-2 overflow-x-auto no-scrollbar">
                    {([{'id':'home','l':'Inicio','i':Wallet},{'id':'movimientos','l':'Movimientos','i':BarChart3},{'id':'categorias','l':'Categorías','i':Tag},{'id':'reportes','l':'Reportes','i':Calendar}] as const).map(t => (
                        <button key={t.id} onClick={() => setViewMode(t.id)} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase whitespace-nowrap shrink-0", viewMode === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50")}>
                            <t.i className="w-3.5 h-3.5" /> {t.l}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 pb-24 max-w-2xl mx-auto w-full">
                {/* ═══ HOME (estilo Monefy) ═══ */}
                {viewMode === 'home' && (
                    <div className="space-y-4">
                        {/* Donut chart central */}
                        <Card className="rounded-3xl border-border/30 p-6 flex flex-col items-center">
                            <svg width="200" height="200" viewBox="0 0 200 200" className="mb-4">
                                {donutPaths.map((seg, i) => <path key={i} d={seg.path} fill={seg.color} className="hover:opacity-80 transition-opacity cursor-pointer" onClick={() => setViewMode('categorias')} />)}
                                {donutPaths.length === 0 && <circle cx="100" cy="100" r="75" fill="none" stroke="hsl(var(--muted))" strokeWidth="2" strokeDasharray="4 4" />}
                            </svg>
                            <div className="text-center -mt-32 mb-4 pointer-events-none">
                                <p className="text-[9px] font-bold uppercase text-muted-foreground">Patrimonio</p>
                                <p className="text-2xl font-black italic text-primary">{fmtShort(data.summary.total_real_balance || 0)}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-3 w-full mt-8">
                                <div className="text-center p-3 rounded-xl bg-emerald-500/5">
                                    <TrendingUp className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
                                    <p className="text-[8px] font-bold uppercase text-muted-foreground">Ingresos</p>
                                    <p className="text-sm font-black text-emerald-500">{fmtShort(data.summary.total_income)}</p>
                                </div>
                                <div className="text-center p-3 rounded-xl bg-red-500/5">
                                    <TrendingDown className="w-4 h-4 text-red-500 mx-auto mb-1" />
                                    <p className="text-[8px] font-bold uppercase text-muted-foreground">Gastos</p>
                                    <p className="text-sm font-black text-red-500">{fmtShort(data.summary.total_expenses)}</p>
                                </div>
                            </div>
                        </Card>

                        {/* Cuentas */}
                        <div className="space-y-2">
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Cuentas</p>
                            {bankEntries.length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">Sin cuentas</p> :
                            bankEntries.map(([bankName, bank]) => (
                                <Card key={bankName} className="rounded-2xl border-border/30 p-4 cursor-pointer hover:shadow-md transition-all" onClick={() => { setFilterBank(bankName); setViewMode('movimientos'); }}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-xl bg-muted/40 flex items-center justify-center"><Landmark className="w-4.5 h-4.5" /></div>
                                            <div><p className="text-sm font-black uppercase">{bankName}</p>{bank.card && <p className="text-[8px] text-muted-foreground font-bold">{bank.card}</p>}</div>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
                                    </div>
                                    <div className="flex items-end justify-between mt-2">
                                        <p className={cn("text-lg font-black italic", bank.current_balance > 0 ? "text-emerald-500" : "text-red-500")}>{fmt(bank.current_balance)}</p>
                                        <p className="text-[8px] text-muted-foreground">{bank.transaction_count} mov.</p>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </div>
                )}

                {/* ═══ MOVIMIENTOS ═══ */}
                {viewMode === 'movimientos' && (
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative flex-1 min-w-[140px]">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                                <input placeholder="Buscar..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-8 h-8 bg-muted/20 border border-border/30 rounded-lg text-xs" />
                            </div>
                            <div className="flex items-center gap-0.5 bg-muted/20 p-0.5 rounded-lg">
                                <button onClick={() => setFilterBank('all')} className={cn("px-2 py-1 rounded text-[9px] font-bold uppercase", filterBank === 'all' ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>Todos</button>
                                {bankNames.map(b => <button key={b} onClick={() => setFilterBank(b)} className={cn("px-2 py-1 rounded text-[9px] font-bold uppercase", filterBank === b ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{b}</button>)}
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            {filteredTx.slice(0, 150).map((tx: any) => (
                                <Card key={tx.id} className="rounded-xl border-border/30 p-3">
                                    <div className="flex items-center gap-2.5">
                                        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", tx.operation === 'CR' ? "bg-emerald-500/10" : "bg-red-500/10")}>
                                            {tx.operation === 'CR' ? <ArrowDownRight className="w-4 h-4 text-emerald-500" /> : <ArrowUpRight className="w-4 h-4 text-red-500" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[10px] font-black uppercase truncate">{tx.service}</p>
                                            <p className="text-[8px] text-muted-foreground">{tx.date} · {tx.bank}{tx.card ? ` · ${tx.card}` : ''}</p>
                                        </div>
                                        <p className={cn("text-sm font-black italic shrink-0", tx.operation === 'CR' ? "text-emerald-500" : "text-red-500")}>{tx.operation === 'CR' ? '+' : '-'}{fmtShort(parseFloat(tx.amount))}</p>
                                    </div>
                                    <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-border/10">
                                        {editingTxId === tx.id ? (
                                            <select className="text-[9px] font-bold rounded border border-border bg-background px-1.5 h-6 flex-1 mr-2" onChange={e => handleSetCategory(tx.id, e.target.value)} defaultValue="">
                                                <option value="" disabled>...</option>
                                                {(tx.operation === 'CR' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        ) : (
                                            <Badge variant="outline" className="text-[7px] font-black uppercase cursor-pointer hover:bg-primary/10" onClick={() => setEditingTxId(tx.id)}>{tx.manual_category || tx.category}</Badge>
                                        )}
                                        <span className="text-[8px] text-muted-foreground/60">{tx.service_type}</span>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </div>
                )}

                {/* ═══ CATEGORÍAS ═══ */}
                {viewMode === 'categorias' && (
                    <div className="space-y-4">
                        <Card className="rounded-2xl border-border/30 p-4">
                            <h2 className="text-xs font-black uppercase tracking-widest flex items-center gap-2 mb-3"><TrendingDown className="w-4 h-4 text-red-500" /> Gastos</h2>
                            <div className="space-y-2">
                                {expenseCats.map(cat => (
                                    <div key={cat.name} className="space-y-0.5">
                                        <div className="flex items-center justify-between text-[10px]">
                                            <span className="font-bold flex items-center gap-1"><span>{cat.icon}</span> {cat.name}</span>
                                            <span className="font-black text-red-500">{fmt(cat.total)} <span className="text-muted-foreground font-normal">({totalExpenses > 0 ? ((cat.total/totalExpenses)*100).toFixed(0) : 0}%)</span></span>
                                        </div>
                                        <div className="h-3 rounded-full bg-muted/30 overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${totalExpenses > 0 ? Math.max((cat.total/totalExpenses)*100, 2) : 0}%`, backgroundColor: cat.color }} /></div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                        <Card className="rounded-2xl border-border/30 p-4">
                            <h2 className="text-xs font-black uppercase tracking-widest flex items-center gap-2 mb-2"><Edit2 className="w-4 h-4 text-primary" /> Sin Clasificar</h2>
                            <div className="space-y-1.5 max-h-60 overflow-y-auto no-scrollbar">
                                {data.transactions.filter((t: any) => { const c = t.manual_category || t.category; return c === 'Otros' || c === 'Otros Ingresos'; }).slice(0, 30).map((tx: any) => (
                                    <div key={tx.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/20">
                                        <div className="flex-1 min-w-0"><p className="text-[9px] font-bold truncate">{tx.service}</p><p className="text-[7px] text-muted-foreground">{tx.date} · {fmt(parseFloat(tx.amount))}</p></div>
                                        {editingTxId === tx.id ? (
                                            <select className="text-[8px] font-bold rounded border border-border bg-background px-1 h-5" onChange={e => handleSetCategory(tx.id, e.target.value)} defaultValue=""><option value="" disabled>...</option>{(tx.operation === 'CR' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(c => <option key={c} value={c}>{c}</option>)}</select>
                                        ) : <button onClick={() => setEditingTxId(tx.id)} className="text-muted-foreground hover:text-primary shrink-0"><Edit2 className="w-3 h-3" /></button>}
                                    </div>
                                ))}
                                {data.transactions.filter((t: any) => { const c = t.manual_category || t.category; return c === 'Otros' || c === 'Otros Ingresos'; }).length === 0 && <p className="text-[9px] text-muted-foreground text-center py-2">✓ Todo clasificado</p>}
                            </div>
                        </Card>
                    </div>
                )}

                {/* ═══ REPORTES ═══ */}
                {viewMode === 'reportes' && (
                    <div className="space-y-4">
                        <Card className="rounded-2xl border-border/30 p-4">
                            <h2 className="text-xs font-black uppercase tracking-widest mb-3">Mensual</h2>
                            {Object.keys(data.monthly).length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">Sin datos</p> :
                            <div className="space-y-3">
                                {Object.entries(data.monthly).sort(([a],[b]) => b.localeCompare(a)).map(([month, m]) => {
                                    const max = Math.max(m.income, m.expenses, 1);
                                    const mi = parseInt(month.split('-')[1]) - 1;
                                    return (
                                        <div key={month}>
                                            <div className="flex justify-between text-[10px] mb-1"><span className="font-bold">{MONTH_NAMES[mi] || month} {month.split('-')[0]}</span><span className={cn("font-black", m.income-m.expenses >= 0 ? "text-emerald-500" : "text-red-500")}>{m.income-m.expenses >= 0 ? '+' : ''}{fmtShort(m.income-m.expenses)}</span></div>
                                            <div className="flex gap-1 h-10 items-end">
                                                <div className="flex-1 flex flex-col items-center"><div className="w-full bg-emerald-500/70 rounded-t" style={{height: `${(m.income/max)*100}%`}} /><span className="text-[6px] font-bold text-emerald-500">{fmtShort(m.income)}</span></div>
                                                <div className="flex-1 flex flex-col items-center"><div className="w-full bg-red-500/70 rounded-t" style={{height: `${(m.expenses/max)*100}%`}} /><span className="text-[6px] font-bold text-red-500">{fmtShort(m.expenses)}</span></div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>}
                        </Card>
                    </div>
                )}
            </div>

            {/* Import Modal */}
            {isImporting && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/90 backdrop-blur-sm" onClick={() => setIsImporting(false)}>
                    <Card className="w-full max-w-lg rounded-3xl border-border/30 shadow-2xl p-5" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-3">
                            <h2 className="text-sm font-black uppercase">Importar .trm</h2>
                            <button onClick={() => setIsImporting(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                        </div>
                        <div onDragOver={e => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={e => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f?.name.endsWith('.trm')) handleTrmFile(f); else toast.error('Debe ser .trm'); }}
                            className={cn("border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer", isDragging ? "border-primary bg-primary/10" : "border-border/40 hover:border-primary/40")}
                            onClick={() => document.getElementById('trm-file-input')?.click()}>
                            {importingTrm ? (
                                <div className="space-y-2"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" /><p className="text-xs font-bold uppercase text-muted-foreground">Descifrando y guardando...</p></div>
                            ) : (
                                <div className="space-y-2"><Smartphone className="w-8 h-8 mx-auto text-muted-foreground/50" /><p className="text-xs font-bold uppercase">Arrastra tu .trm</p><p className="text-[10px] text-muted-foreground">Transfermóvil → Respaldo → Exportar</p></div>
                            )}
                            <input id="trm-file-input" type="file" accept=".trm" onChange={e => { const f = e.target.files?.[0]; if (f?.name.endsWith('.trm')) handleTrmFile(f); }} className="hidden" />
                        </div>
                    </Card>
                </div>
            )}

            {/* FIX-PHASE4: Botones flotantes + y - estilo Monefy Pro */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 z-50">
                <button onClick={() => { setAddType('DB'); setShowAddModal(true); }}
                    className="w-14 h-14 rounded-full bg-red-500 text-white shadow-xl flex items-center justify-center hover:scale-110 transition-transform"
                    aria-label="Agregar gasto">
                    <span className="text-2xl font-black">−</span>
                </button>
                <div className="px-4 py-2 rounded-full bg-card border border-border/30 shadow-lg">
                    <p className="text-[8px] font-bold uppercase text-muted-foreground text-center">Balance</p>
                    <p className={cn("text-sm font-black italic text-center", (data?.summary?.balance || 0) >= 0 ? "text-emerald-500" : "text-red-500")}>
                        {fmtShort(data?.summary?.balance || 0)}
                    </p>
                </div>
                <button onClick={() => { setAddType('CR'); setShowAddModal(true); }}
                    className="w-14 h-14 rounded-full bg-emerald-500 text-white shadow-xl flex items-center justify-center hover:scale-110 transition-transform"
                    aria-label="Agregar ingreso">
                    <span className="text-2xl font-black">+</span>
                </button>
            </div>

            {/* FIX-PHASE4: Modal agregar transacción */}
            {showAddModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/90 backdrop-blur-sm" onClick={() => setShowAddModal(false)}>
                    <Card className="w-full max-w-sm rounded-3xl border-border/30 shadow-2xl p-5" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-sm font-black uppercase">{addType === 'CR' ? '🟢 Nuevo Ingreso' : '🔴 Nuevo Gasto'}</h2>
                            <button onClick={() => setShowAddModal(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="text-[9px] font-bold uppercase text-muted-foreground">Monto</label>
                                <input type="number" step="0.01" value={addForm.amount} onChange={e => setAddForm({...addForm, amount: e.target.value})}
                                    placeholder="0.00" className="w-full h-10 px-3 bg-muted/20 rounded-xl text-lg font-black text-center border border-border/30" autoFocus />
                            </div>
                            <div>
                                <label className="text-[9px] font-bold uppercase text-muted-foreground">Categoría</label>
                                <select value={addForm.category} onChange={e => setAddForm({...addForm, category: e.target.value})}
                                    className="w-full h-10 px-3 bg-muted/20 rounded-xl text-xs font-bold border border-border/30">
                                    {(addType === 'CR' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[9px] font-bold uppercase text-muted-foreground">Banco</label>
                                <select value={addForm.bank} onChange={e => setAddForm({...addForm, bank: e.target.value})}
                                    className="w-full h-10 px-3 bg-muted/20 rounded-xl text-xs font-bold border border-border/30">
                                    <option value="BANDEC">BANDEC</option><option value="BPA">BPA</option><option value="METRO">METRO</option><option value="MANUAL">Efectivo</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-[9px] font-bold uppercase text-muted-foreground">Fecha</label>
                                <input type="date" value={addForm.date} onChange={e => setAddForm({...addForm, date: e.target.value})}
                                    className="w-full h-10 px-3 bg-muted/20 rounded-xl text-xs font-bold border border-border/30" />
                            </div>
                            <div>
                                <label className="text-[9px] font-bold uppercase text-muted-foreground">Nota</label>
                                <input type="text" value={addForm.note} onChange={e => setAddForm({...addForm, note: e.target.value})}
                                    placeholder="Descripción opcional..." className="w-full h-10 px-3 bg-muted/20 rounded-xl text-xs border border-border/30" />
                            </div>
                            <Button onClick={handleAddTransaction} className={cn("w-full h-11 rounded-xl font-black uppercase text-xs", addType === 'CR' ? "bg-emerald-500" : "bg-red-500")}>
                                {addType === 'CR' ? 'Agregar Ingreso' : 'Agregar Gasto'}
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}
