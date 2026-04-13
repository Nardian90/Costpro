'use client';

import React, { useMemo, useSyncExternalStore } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    TrendingUp, User, Zap, ZapOff, ArrowUpRight, ArrowDownRight,
    Wallet, ShieldCheck, Landmark, Banknote, History
} from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    BarChart, Bar, Cell, PieChart, Pie
} from 'recharts';
import { WalletAnalytics } from "@/lib/wallet/types";

const COLORS = ['#16a34a', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'];

interface Props {
  analytics: WalletAnalytics;
}

const emptySubscribe = () => () => {};

export function AnalyticsDashboard({ analytics }: Props) {
  const { summary, banks, monthly, categories, transactions } = analytics;
  const isMounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  const balanceData = useMemo(() => {
    return transactions.reduce<{ date: string; balance: number }[]>((acc, tx) => {
      const prevBalance = acc.length > 0 ? acc[acc.length - 1].balance : 0;
      const balance = tx.nature === 'CR' ? prevBalance + tx.amount : prevBalance - tx.amount;
      acc.push({ date: tx.date, balance });
      return acc;
    }, []);
  }, [transactions]);

  const transferStats = useMemo(() => {
    const map: Record<string, { total: number, count: number, last: string }> = {};
    transactions
      .filter(tx => tx.typeOperation === 'Transferencia')
      .forEach(tx => {
        if (!map[tx.counterparty]) map[tx.counterparty] = { total: 0, count: 0, last: tx.date };
        map[tx.counterparty].total += tx.amount;
        map[tx.counterparty].count += 1;
        map[tx.counterparty].last = tx.date;
      });
    return Object.entries(map)
      .map(([id, stats]) => ({ id, ...stats }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [transactions]);

  const failedOpsData = useMemo(() => {
    const reasons: Record<string, number> = {};
    // Note: in the new schema, we don't have FAILED_OPERATION explicitly in typeOperation for all cases yet,
    // but we can filter by note or category if we want. For now, let's keep it simple.
    return [];
  }, [transactions]);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('es-CU', { style: 'currency', currency: 'CUP' }).format(val);

  if (!isMounted) return null;

  return (
    <div className="space-y-8 p-4 md:p-8 animate-in fade-in duration-700">
      {/* Indicadores Principales */}
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
        {/* Evolución de Saldo */}
        <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden">
          <CardHeader className="p-8 pb-0">
              <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 text-primary">
                <TrendingUp className="w-4 h-4" /> Evolución de Saldo
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

        {/* Top Receptores */}
        <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden">
          <CardHeader className="p-8 pb-4">
              <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 text-primary">
                <User className="w-4 h-4" /> Top 10 Contrapartes
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
            {transferStats.length === 0 && <p className="text-xs italic opacity-50 text-center py-10">Sin datos suficientes</p>}
          </CardContent>
        </Card>

        {/* Gastos por Categoría */}
        <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden">
           <CardHeader className="p-8 pb-0">
              <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 text-primary">
                <Zap className="w-4 h-4" /> Servicios y Categorías
              </CardTitle>
          </CardHeader>
          <CardContent className="p-8 h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={Object.entries(categories).map(([name, value]) => ({ name, value }))}>
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="rounded-3xl border-none shadow-xl bg-secondary/20 p-8">
            <h5 className="text-[9px] font-black uppercase opacity-50 mb-3 tracking-widest text-primary flex items-center gap-2"><Landmark className="w-3 h-3"/> Bancos</h5>
            <p className="text-2xl font-black">{Object.keys(banks).length}</p>
            <p className="text-[8px] font-bold opacity-40 uppercase">Entidades Detectadas</p>
          </Card>
          <Card className="rounded-3xl border-none shadow-xl bg-secondary/20 p-8">
            <h5 className="text-[9px] font-black uppercase opacity-50 mb-3 tracking-widest flex items-center gap-2"><Banknote className="w-3 h-3"/> Mensajes</h5>
            <p className="text-2xl font-black">{analytics.rawSms.length}</p>
            <p className="text-[8px] font-bold opacity-40 uppercase">Total en BD</p>
          </Card>
          <Card className="rounded-3xl border-none shadow-xl bg-primary text-primary-foreground p-8">
            <h5 className="text-[9px] font-black uppercase opacity-60 mb-3 tracking-widest flex items-center gap-2"><History className="w-3 h-3"/> Actividad</h5>
            <p className="text-2xl font-black">{transactions.length}</p>
            <p className="text-[8px] font-black uppercase opacity-60">Ops Consolidadas</p>
          </Card>
      </div>
    </div>
  );
}
