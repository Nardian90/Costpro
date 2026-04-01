'use client';

import React, { useMemo, useState } from 'react';
import {
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    BarChart, Bar, Cell, PieChart, Pie, AreaChart, Area
} from 'recharts';
import { Card } from '@/components/ui/card';
import { BankTransaction, ReconciliationLine } from '@/lib/dexie';
import { formatCurrency, formatCurrencyCents } from '@/lib/utils';
import {
    calculateIPVMetrics,
    getDailySalesHistory,
    getTopProducts,
    getTopPayers
} from '@/lib/ipv/calculations';
import {
    TrendingUp,
    Users,
    PieChart as PieIcon,
    Percent,
    ArrowUpRight,
    ArrowDownRight,
    DollarSign,
    Package,
    Activity,
    ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Props {
    transactions: BankTransaction[];
    reconciliationLines: ReconciliationLine[];
    onStart?: () => void;
}

export function IPVInstitutionalDashboard({ transactions, reconciliationLines, onStart }: Props) {
    const [selectedPayer, setSelectedPayer] = useState<string | null>(null);

    // Filter transactions if a payer is selected
    const filteredTransactions = useMemo(() => {
        if (!selectedPayer) return transactions;
        return transactions.filter(tx => {
            const payer = tx.observaciones?.toUpperCase(); // Simplified check for filtering
            return payer?.includes(selectedPayer.toUpperCase());
        });
    }, [transactions, selectedPayer]);

    const metrics = useMemo(() =>
        calculateIPVMetrics(reconciliationLines, filteredTransactions),
    [reconciliationLines, filteredTransactions]);

    const dailyHistory = useMemo(() =>
        getDailySalesHistory(reconciliationLines, filteredTransactions),
    [reconciliationLines, filteredTransactions]);

    const topProducts = useMemo(() =>
        getTopProducts(reconciliationLines),
    [reconciliationLines]);

    const topPayers = useMemo(() =>
        getTopPayers(transactions),
    [transactions]);

    const categoryData = [
        { name: 'Efectivo', value: metrics.cashSales, color: '#10b981' },
        { name: 'Transferencia', value: metrics.transferSales, color: '#3b82f6' }
    ];

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-10">
            {/* Header / Filter State */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
                    <div>
                        <h2 className="text-2xl font-black tracking-tight text-foreground uppercase">
                            Panel de Control Ejecutivo
                        </h2>
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest opacity-70">
                            Blindaje Contable e Inteligencia de Ventas
                        </p>
                    </div>
                    {onStart && (
                        <Button
                            onClick={onStart}
                            className="bg-primary text-primary-foreground font-black uppercase tracking-widest px-8 h-12 rounded-2xl shadow-lg hover:scale-105 transition-all flex gap-2 animate-pulse rounded-full"
                        >
                            Comenzar
                            <ArrowRight className="w-5 h-5" />
                        </Button>
                    )}
                </div>
                {selectedPayer && (
                    <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 px-4 py-2 rounded-full flex gap-2 items-center">
                        Filtrado por: {selectedPayer}
                        <button onClick={() => setSelectedPayer(null)} className="hover:text-foreground">
                            <FilterX className="w-3 h-3" />
                        </button>
                    </Badge>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                <MetricCard
                    title="Ventas Totales"
                    value={formatCurrencyCents(metrics.totalSales)}
                    icon={<DollarSign className="w-4 h-4" />}
                    subtitle="Desglose Declarado"
                    color="blue"
                />
                <MetricCard
                    title="Ingresos Banco"
                    value={formatCurrencyCents(metrics.bankCredits)}
                    icon={<ArrowUpRight className="w-4 h-4" />}
                    subtitle="Realidad Bancaria"
                    color="emerald"
                />
                <MetricCard
                    title="Salud Contable"
                    value={`${metrics.healthPercent.toFixed(1)}%`}
                    icon={<Activity className="w-4 h-4" />}
                    subtitle="Conciliación Cr vs Tr"
                    color={metrics.healthPercent > 95 ? "emerald" : "rose"}
                />
                <MetricCard
                    title="Débitos/Gastos"
                    value={formatCurrencyCents(metrics.bankDebits)}
                    icon={<ArrowDownRight className="w-4 h-4" />}
                    subtitle="Egresos Bancarios"
                    color="rose"
                />
                <MetricCard
                    title="Impuestos Est."
                    value={formatCurrencyCents(metrics.totalTaxes)}
                    icon={<Percent className="w-4 h-4" />}
                    subtitle="Retenciones/Tasas"
                    color="purple"
                />
                <MetricCard
                    title="Comisiones"
                    value={formatCurrencyCents(metrics.totalCommissions)}
                    icon={<TrendingUp className="w-4 h-4" />}
                    subtitle="Costos Bancarios"
                    color="amber"
                />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* 1. Main Trend Chart */}
                <Card className="p-6 rounded-[32px] border-none bg-card/50 backdrop-blur-sm shadow-xl xl:col-span-2 space-y-6">
                    <div className="flex justify-between items-center">
                        <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                            <TrendingUp className="w-4 h-4" />
                            Comportamiento Diario de Ventas
                        </h3>
                    </div>
                    <div className="h-[400px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={dailyHistory}>
                                <defs>
                                    <linearGradient id="colorCash" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                    </linearGradient>
                                    <linearGradient id="colorTransfer" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                <XAxis
                                    dataKey="date"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 10, fontWeight: 700, fill: 'currentColor' }}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 10, fontWeight: 700, fill: 'currentColor' }}
                                    tickFormatter={(val) => `$${val}`}
                                />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', fontSize: '12px' }}
                                />
                                <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', paddingBottom: '20px' }} />
                                <Area type="monotone" dataKey="cash" stroke="#10b981" fill="url(#colorCash)" name="Efectivo" stackId="1" />
                                <Area type="monotone" dataKey="transfer" stroke="#3b82f6" fill="url(#colorTransfer)" name="Transferencia" stackId="1" />
                                <Area type="monotone" dataKey="debits" stroke="#f43f5e" fill="transparent" name="Egresos Banco" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                {/* 2. Top Payers */}
                <Card className="p-6 rounded-[32px] border-none bg-card/50 backdrop-blur-sm shadow-xl space-y-4">
                    <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        Top Pagadores
                    </h3>
                    <div className="h-[400px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={topPayers} layout="vertical" margin={{ left: -20, right: 20 }}>
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={100} tick={{ fontSize: 9, fontWeight: 800, fill: '#888' }} />
                                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                                <Bar dataKey="amount" radius={[0, 10, 10, 0]} name="Importe" fill="#3b82f6">
                                    {topPayers.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={selectedPayer === entry.name ? '#39FF14' : '#3b82f6'} onClick={() => setSelectedPayer(entry.name)} className="cursor-pointer" />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 3. Top Products by Channel */}
                <Card className="p-6 rounded-[32px] border-none bg-card/50 backdrop-blur-sm shadow-xl space-y-4">
                    <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                        <Package className="w-4 h-4" />
                        Top 10 Productos por Canal
                    </h3>
                    <div className="h-[350px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={topProducts} layout="vertical" margin={{ left: -20, right: 20 }}>
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={100} tick={{ fontSize: 9, fontWeight: 800, fill: '#888' }} />
                                <Tooltip />
                                <Legend />
                                <Bar dataKey="cash" name="Efectivo" stackId="a" fill="#10b981" />
                                <Bar dataKey="transfer" name="Transferencia" stackId="a" fill="#3b82f6" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                {/* 4. Distribution Mix */}
                <Card className="p-6 rounded-[32px] border-none bg-card/50 backdrop-blur-sm shadow-xl space-y-4">
                    <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                        <PieIcon className="w-4 h-4" />
                        Mix de Canales
                    </h3>
                    <div className="h-[350px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={categoryData}
                                    innerRadius={80}
                                    outerRadius={120}
                                    paddingAngle={5}
                                    dataKey="value"
                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                >
                                    {categoryData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            </div>
        </div>
    );
}

function MetricCard({ title, value, icon, subtitle, color }: { title: string, value: string, icon: React.ReactNode, subtitle?: string, color: string }) {
    const colorClasses: Record<string, string> = {
        emerald: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
        rose: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
        purple: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
        amber: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
        blue: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    };

    return (
        <Card className="p-6 border-none bg-card/50 backdrop-blur-sm shadow-lg rounded-[24px] relative overflow-hidden group hover:scale-[1.02] transition-all">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                {icon}
            </div>
            <div className="space-y-2 relative z-10">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">{title}</p>
                <div className="flex items-baseline gap-2">
                    <h3 className="text-2xl font-black text-foreground">{value}</h3>
                </div>
                {subtitle && <p className="text-[10px] font-bold text-muted-foreground uppercase opacity-60 tracking-wider">{subtitle}</p>}
            </div>
        </Card>
    );
}

const FilterX = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M4 4h16v2.172a2 2 0 0 1-.586 1.414L15 12l-4.414 4.414a2 2 0 0 1-1.414.586H4V4z"/>
        <line x1="15" y1="9" x2="9" y2="15"/>
        <line x1="9" y1="9" x2="15" y2="15"/>
    </svg>
);
