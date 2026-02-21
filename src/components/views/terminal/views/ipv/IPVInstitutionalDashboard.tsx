'use client';

import React, { useMemo, useState } from 'react';
import {
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    BarChart, Bar, Cell, PieChart, Pie, AreaChart, Area
} from 'recharts';
import { Card } from '@/components/ui/card';
import { parseTransactions } from '@/lib/ipv/parser';
import { BankTransaction } from '@/lib/dexie';
import { formatCurrency } from '@/lib/utils';
import {
    TrendingUp,
    Users,
    PieChart as PieIcon,
    Percent,
    ArrowUpRight,
    ArrowDownRight,
    DollarSign,
    FilterX
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Props {
    transactions: BankTransaction[];
}

export function IPVInstitutionalDashboard({ transactions }: Props) {
    const [selectedPayer, setSelectedPayer] = useState<string | null>(null);

    const parsedData = useMemo(() => parseTransactions(transactions), [transactions]);

    const filteredData = useMemo(() => {
        if (!selectedPayer) return parsedData;
        return parsedData.filter(tx => tx.pagador === selectedPayer);
    }, [parsedData, selectedPayer]);

    // --- Metrics ---
    const metrics = useMemo(() => {
        const totalCr = filteredData.filter(tx => tx.tipo === 'Cr').reduce((sum, tx) => sum + tx.monto, 0);
        const totalDb = filteredData.filter(tx => tx.tipo === 'Db').reduce((sum, tx) => sum + tx.monto, 0);
        const taxPayments = filteredData.filter(tx => tx.esImpuesto);
        const totalTaxes = taxPayments.reduce((sum, tx) => sum + tx.monto, 0);
        const taxPercentage = totalCr > 0 ? (totalTaxes / totalCr) * 100 : 0;
        const totalCommissions = filteredData.reduce((sum, tx) => sum + tx.comision, 0);

        return { totalCr, totalDb, taxPercentage, totalCommissions };
    }, [filteredData]);

    // --- Chart Data ---

    // 1. Time-Series Line Chart
    const timeSeriesData = useMemo(() => {
        const groups: Record<string, { fecha: string, Cr: number, Db: number }> = {};
        filteredData.forEach(tx => {
            if (!groups[tx.fecha]) groups[tx.fecha] = { fecha: tx.fecha, Cr: 0, Db: 0 };
            if (tx.tipo === 'Cr') groups[tx.fecha].Cr += tx.monto;
            else groups[tx.fecha].Db += tx.monto;
        });
        return Object.values(groups).sort((a, b) => a.fecha.localeCompare(b.fecha));
    }, [filteredData]);

    // 2. Top Payers
    const topPayersData = useMemo(() => {
        const groups: Record<string, number> = {};
        parsedData.forEach(tx => {
            if (tx.tipo === 'Cr') {
                groups[tx.pagador] = (groups[tx.pagador] || 0) + tx.monto;
            }
        });
        return Object.entries(groups)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);
    }, [parsedData]);

    // 3. Category Distribution (Donut)
    const categoryData = useMemo(() => {
        const tax = filteredData.filter(tx => tx.esImpuesto).reduce((sum, tx) => sum + tx.monto, 0);
        const regular = filteredData.filter(tx => !tx.esImpuesto).reduce((sum, tx) => sum + tx.monto, 0);
        return [
            { name: 'Impuestos', value: tax, color: '#8b5cf6' }, // Purple
            { name: 'Regulares', value: regular, color: '#3b82f6' }  // Blue
        ];
    }, [filteredData]);

    // 4. Commission Analysis (Stacked Bar)
    const commissionData = useMemo(() => {
        const withComm = filteredData.filter(tx => tx.tieneComision).length;
        const withoutComm = filteredData.filter(tx => !tx.tieneComision).length;
        return [
            { name: 'Estado', Con: withComm, Sin: withoutComm }
        ];
    }, [filteredData]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-10">
            {/* Header / Filter State */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="space-y-1">
                    <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground flex items-center gap-2">
                        <TrendingUp className="text-primary w-6 h-6" />
                        Dashboard Financiero Institucional
                    </h2>
                    <p className="text-xs font-black text-muted-foreground uppercase tracking-widest opacity-70">Análisis Inteligente de Transacciones IPV</p>
                </div>
                {selectedPayer && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedPayer(null)}
                        className="rounded-xl border-primary/20 bg-primary/5 text-xs font-black uppercase"
                    >
                        <FilterX className="w-4 h-4 mr-2" />
                        Limpiar Filtro: {selectedPayer}
                    </Button>
                )}
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                    title="Total Ingresos (Cr)"
                    value={formatCurrency(metrics.totalCr)}
                    icon={<ArrowUpRight className="text-emerald-500" />}
                    color="emerald"
                />
                <MetricCard
                    title="Total Egresos (Db)"
                    value={formatCurrency(metrics.totalDb)}
                    icon={<ArrowDownRight className="text-rose-500" />}
                    color="rose"
                />
                <MetricCard
                    title="% Pagos Impuestos"
                    value={`${metrics.taxPercentage.toFixed(1)}%`}
                    icon={<Percent className="text-purple-500" />}
                    subtitle="Proveniente de NIT"
                    color="purple"
                />
                <MetricCard
                    title="Total Comisiones"
                    value={formatCurrency(metrics.totalCommissions)}
                    icon={<DollarSign className="text-amber-500" />}
                    subtitle="Cargos Bancarios"
                    color="amber"
                />
            </div>

            {/* Main Charts Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

                {/* 1. Time-Series Line Chart */}
                <Card className="xl:col-span-2 p-6 rounded-[32px] border-none bg-card/50 backdrop-blur-sm shadow-xl space-y-4">
                    <div className="flex justify-between items-center">
                        <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Tendencia de Liquidez (Cr vs Db)</h3>
                    </div>
                    <div className="h-[350px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={timeSeriesData}>
                                <defs>
                                    <linearGradient id="colorCr" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                    </linearGradient>
                                    <linearGradient id="colorDb" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                <XAxis
                                    dataKey="fecha"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 10, fontWeight: 700, fill: 'currentColor' }}
                                    dy={10}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 10, fontWeight: 700, fill: 'currentColor' }}
                                    tickFormatter={(val) => `$${val}`}
                                />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', fontSize: '12px' }}
                                    itemStyle={{ fontWeight: 800 }}
                                />
                                <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', paddingBottom: '20px' }} />
                                <Area type="monotone" dataKey="Cr" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorCr)" name="Ingresos" />
                                <Area type="monotone" dataKey="Db" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorDb)" name="Egresos" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                {/* 2. Top Payers */}
                <Card className="p-6 rounded-[32px] border-none bg-card/50 backdrop-blur-sm shadow-xl space-y-4">
                    <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        Top Pagadores (Cr)
                    </h3>
                    <div className="h-[350px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={topPayersData}
                                layout="vertical"
                                margin={{ left: -20, right: 20 }}
                                onClick={(data) => {
                                    if (data && data.activeLabel) {
                                        setSelectedPayer(data.activeLabel);
                                    }
                                }}
                            >
                                <XAxis type="number" hide />
                                <YAxis
                                    dataKey="name"
                                    type="category"
                                    axisLine={false}
                                    tickLine={false}
                                    width={100}
                                    tick={{ fontSize: 9, fontWeight: 800, fill: '#888' }}
                                />
                                <Tooltip
                                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px' }}
                                />
                                <Bar dataKey="value" radius={[0, 10, 10, 0]} name="Volumen">
                                    {topPayersData.map((entry, index) => (
                                        <Cell
                                            key={`cell-${index}`}
                                            fill={selectedPayer === entry.name ? '#39FF14' : '#3b82f6'}
                                            className="cursor-pointer hover:opacity-80 transition-opacity"
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <p className="text-[10px] text-center font-bold text-muted-foreground uppercase tracking-widest opacity-50">Haz clic en una barra para filtrar</p>
                </Card>

                {/* 3. Distribution & Commissions */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-6 xl:col-span-1">
                    {/* Donut Chart */}
                    <Card className="p-6 rounded-[32px] border-none bg-card/50 backdrop-blur-sm shadow-xl space-y-4">
                        <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                            <PieIcon className="w-4 h-4" />
                            Distribución de Pagos
                        </h3>
                        <div className="h-[200px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={categoryData}
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {categoryData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#18181b', border: 'none', borderRadius: '12px' }}
                                    />
                                    <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>

                    {/* Stacked Bar for Commissions */}
                    <Card className="p-6 rounded-[32px] border-none bg-card/50 backdrop-blur-sm shadow-xl space-y-4">
                        <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Análisis de Comisiones</h3>
                        <div className="h-[120px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={commissionData} layout="vertical">
                                    <XAxis type="number" hide />
                                    <YAxis type="category" dataKey="name" hide />
                                    <Tooltip cursor={false} contentStyle={{ backgroundColor: '#18181b', border: 'none' }} />
                                    <Legend verticalAlign="bottom" iconType="rect" wrapperStyle={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase' }} />
                                    <Bar dataKey="Con" stackId="a" fill="#f59e0b" name="Con Comisión" radius={[10, 0, 0, 10]} />
                                    <Bar dataKey="Sin" stackId="a" fill="#94a3b8" name="Sin Comisión" radius={[0, 10, 10, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <p className="text-[10px] text-muted-foreground font-medium uppercase text-center mt-2">Frecuencia de cargos bancarios</p>
                    </Card>
                </div>
            </div>
        </div>
    );
}

function MetricCard({ title, value, icon, subtitle, color }: { title: string, value: string, icon: React.ReactNode, trend?: string, subtitle?: string, color: string }) {
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
