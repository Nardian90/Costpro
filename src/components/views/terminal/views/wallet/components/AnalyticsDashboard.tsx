'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WalletAnalytics } from "@/lib/wallet/types";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar, Cell, PieChart, Pie
} from 'recharts';
import {
  TrendingUp, Wallet, Smartphone,
  ShieldCheck, User, Banknote,
  ArrowUpRight, ArrowDownRight, ZapOff, Zap, History, Clock, Landmark
} from 'lucide-react';

const COLORS = ['#10b981', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

interface AnalyticsDashboardProps {
  analytics: WalletAnalytics;
}

export function AnalyticsDashboard({ analytics }: AnalyticsDashboardProps) {
  const [isMounted, setIsMounted] = useState(false);
  const { summary, banks, categories, transactions } = analytics;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const balanceData = useMemo(() => {
    return transactions
      .filter(tx => tx.balance_after !== undefined)
      .map(tx => ({
        date: tx.date,
        balance: tx.balance_after
      }));
  }, [transactions]);

  const transferStats = useMemo(() => {
    const beneficiaries: Record<string, { total: number, count: number, last: string }> = {};
    transactions.filter(tx => tx.type === 'TRANSFER_OUT').forEach(tx => {
      if (!beneficiaries[tx.counterparty]) {
        beneficiaries[tx.counterparty] = { total: 0, count: 0, last: tx.date };
      }
      beneficiaries[tx.counterparty].total += tx.amount;
      beneficiaries[tx.counterparty].count += 1;
      if (new Date(tx.date) > new Date(beneficiaries[tx.counterparty].last)) {
          beneficiaries[tx.counterparty].last = tx.date;
      }
    });
    return Object.entries(beneficiaries)
      .map(([id, stats]) => ({ id, ...stats }))
      .sort((a, b) => b.total - a.total).slice(0, 10);
  }, [transactions]);

  const failedOpsData = useMemo(() => {
    const reasons: Record<string, number> = {};
    transactions.filter(tx => tx.type === 'FAILED_OPERATION').forEach(tx => {
      const reason = tx.extra_data?.reason || 'Desconocido';
      reasons[reason] = (reasons[reason] || 0) + 1;
    });
    return Object.entries(reasons).map(([name, value]) => ({ name, value }));
  }, [transactions]);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('es-CU', { style: 'currency', currency: 'CUP' }).format(val);

  if (!isMounted) return null;

  return (
    <div className="space-y-8 p-4 md:p-8 animate-in fade-in duration-700">
      {/* 14. Indicadores Principales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="rounded-3xl border-none shadow-lg bg-green-500/10">
          <CardContent className="p-6 flex justify-between items-center">
            <div><p className="text-[9px] font-black uppercase opacity-60 tracking-widest">Ingresos</p><h4 className="text-xl font-black text-green-500">{formatCurrency(summary.total_income)}</h4></div>
            <ArrowUpRight className="text-green-500" />
          </CardContent>
        </Card>
        <Card className="rounded-3xl border-none shadow-lg bg-red-500/10">
          <CardContent className="p-6 flex justify-between items-center">
            <div><p className="text-[9px] font-black uppercase opacity-60 tracking-widest">Gastos</p><h4 className="text-xl font-black text-red-500">{formatCurrency(summary.total_expenses)}</h4></div>
            <ArrowDownRight className="text-red-500" />
          </CardContent>
        </Card>
        <Card className="rounded-3xl border-none shadow-lg bg-primary/10">
          <CardContent className="p-6 flex justify-between items-center">
            <div><p className="text-[9px] font-black uppercase opacity-60 tracking-widest">Balance</p><h4 className="text-xl font-black text-primary">{formatCurrency(summary.balance)}</h4></div>
            <Wallet className="text-primary" />
          </CardContent>
        </Card>
        <Card className="rounded-3xl border-none shadow-lg bg-blue-500/10">
          <CardContent className="p-6 flex justify-between items-center">
            <div><p className="text-[9px] font-black uppercase opacity-60 tracking-widest">Ahorro</p><h4 className="text-xl font-black text-blue-500">{summary.total_income > 0 ? ((summary.balance / summary.total_income) * 100).toFixed(1) : 0}%</h4></div>
            <ShieldCheck className="text-blue-500" />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 1. Evolución de Saldo */}
        <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden">
          <CardHeader className="p-8 pb-0">
              <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 text-primary">
                <TrendingUp className="w-4 h-4" /> 1. Evolución de Saldo
              </CardTitle>
          </CardHeader>
          <CardContent className="p-8 h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={balanceData}>
                <defs><linearGradient id="cBalance" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3}/><stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                <XAxis dataKey="date" hide />
                <YAxis hide />
                <Tooltip formatter={(v: any) => formatCurrency(v)} contentStyle={{borderRadius: '20px', border: 'none'}} />
                <Area type="monotone" dataKey="balance" stroke="var(--primary)" fill="url(#cBalance)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 2. Top Receptores */}
        <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden">
          <CardHeader className="p-8 pb-4">
              <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 text-primary">
                <User className="w-4 h-4" /> 2. Top 10 Receptores
              </CardTitle>
          </CardHeader>
          <CardContent className="p-8 pt-0 space-y-4">
            {transferStats.map((r, i) => (
              <div key={i} className="flex justify-between items-center text-[10px] font-bold py-2 border-b border-secondary/10 last:border-0">
                <div className="flex flex-col">
                    <span className="opacity-60 truncate max-w-[150px]">{r.id}</span>
                    <span className="text-[8px] opacity-40 uppercase">Ult: {r.last}</span>
                </div>
                <div className="text-right">
                    <p className="font-black text-primary shrink-0">{formatCurrency(r.total)}</p>
                    <p className="text-[8px] opacity-40 uppercase">{r.count} ops</p>
                </div>
              </div>
            ))}
            {transferStats.length === 0 && <p className="text-xs italic opacity-50 text-center py-10">Sin transferencias</p>}
          </CardContent>
        </Card>

        {/* 3. Gastos por Categoría */}
        <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden">
           <CardHeader className="p-8 pb-0">
              <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 text-primary">
                <Zap className="w-4 h-4" /> 3. Servicios y Categorías
              </CardTitle>
          </CardHeader>
          <CardContent className="p-8 h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={Object.entries(categories).map(([name, value]) => ({ name: name.replace('_', ' '), value }))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                <XAxis dataKey="name" fontSize={8} tickLine={false} axisLine={false} />
                <YAxis hide />
                <Tooltip formatter={(v: any) => formatCurrency(v)} contentStyle={{borderRadius: '20px', border: 'none'}} />
                <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                  {Object.entries(categories).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 6. Análisis de Fallos */}
        <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden">
           <CardHeader className="p-8 pb-0">
              <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 text-primary">
                <ZapOff className="w-4 h-4 text-red-500" /> 6. Análisis de Fallos
              </CardTitle>
          </CardHeader>
          <CardContent className="p-8 h-[250px] flex items-center">
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie data={failedOpsData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={5}>
                        {failedOpsData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{borderRadius: '20px', border: 'none'}} />
                </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 ml-4">
                {failedOpsData.map((op, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{backgroundColor: COLORS[i % COLORS.length]}} />
                        <span className="text-[8px] font-black uppercase truncate max-w-[80px]">{op.name}</span>
                        <span className="text-[8px] font-black">{op.value}</span>
                    </div>
                ))}
                {failedOpsData.length === 0 && <p className="text-[10px] italic opacity-40 uppercase">Sin fallos</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="rounded-3xl border-none shadow-xl bg-secondary/20 p-8">
            <h5 className="text-[9px] font-black uppercase opacity-50 mb-3 tracking-widest text-primary flex items-center gap-2"><Landmark className="w-3 h-3"/> 5. Bancos</h5>
            <p className="text-2xl font-black">{Object.keys(banks).length}</p>
            <p className="text-[8px] font-bold opacity-40 uppercase">Entidades Detectadas</p>
          </Card>
          <Card className="rounded-3xl border-none shadow-xl bg-secondary/20 p-8 text-red-500">
            <h5 className="text-[9px] font-black uppercase opacity-50 mb-3 tracking-widest flex items-center gap-2"><Banknote className="w-3 h-3"/> 11. Efectivo</h5>
            <p className="text-2xl font-black">{formatCurrency(transactions.filter(tx => ['CASH_ATM', 'CASH_EXTRA'].includes(tx.type)).reduce((acc, tx) => acc + tx.amount, 0))}</p>
            <p className="text-[8px] font-bold opacity-40 uppercase">Salidas Totales</p>
          </Card>
          <Card className="rounded-3xl border-none shadow-xl bg-primary text-primary-foreground p-8">
            <h5 className="text-[9px] font-black uppercase opacity-60 mb-3 tracking-widest flex items-center gap-2"><History className="w-3 h-3"/> 9. Actividad</h5>
            <p className="text-2xl font-black">{transactions.length}</p>
            <p className="text-[8px] font-black uppercase opacity-60">Ops Procesadas</p>
          </Card>
      </div>
    </div>
  );
}
