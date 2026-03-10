'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WalletAnalytics } from "@/lib/wallet/types";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar, Cell
} from 'recharts';
import {
  TrendingUp, Wallet, Smartphone,
  ShieldCheck, User, Banknote,
  ArrowUpRight, ArrowDownRight, ZapOff, Zap, History, Clock
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
    const beneficiaries: Record<string, { total: number, count: number }> = {};
    transactions.filter(tx => tx.type === 'TRANSFER_OUT').forEach(tx => {
      if (!beneficiaries[tx.counterparty]) beneficiaries[tx.counterparty] = { total: 0, count: 0 };
      beneficiaries[tx.counterparty].total += tx.amount;
      beneficiaries[tx.counterparty].count += 1;
    });
    return Object.entries(beneficiaries)
      .map(([id, stats]) => ({ id, ...stats }))
      .sort((a, b) => b.total - a.total).slice(0, 5);
  }, [transactions]);

  const rechargeStats = useMemo(() => {
    const recharges = transactions.filter(tx => tx.type === 'PHONE_RECHARGE' || (tx.type === 'FAILED_OPERATION' && tx.description.toLowerCase().includes('recarga')));
    const success = recharges.filter(tx => tx.status === 'SUCCESS').length;
    const total = recharges.length;
    return { success, total, efficiency: total > 0 ? (success / total) * 100 : 0 };
  }, [transactions]);

  const categoryData = useMemo(() => {
      return Object.entries(categories)
        .map(([name, value]) => ({ name: name.replace('_', ' '), value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);
  }, [categories]);

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

        {/* 3. Gastos por Categoría */}
        <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden">
          <CardHeader className="p-8 pb-0">
              <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 text-primary">
                <Zap className="w-4 h-4" /> 3. Gastos por Categoría
              </CardTitle>
          </CardHeader>
          <CardContent className="p-8 h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                <XAxis dataKey="name" fontSize={8} tickLine={false} axisLine={false} />
                <YAxis hide />
                <Tooltip formatter={(v: any) => formatCurrency(v)} contentStyle={{borderRadius: '20px', border: 'none'}} />
                <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 2. Top Receptores */}
        <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden">
          <CardHeader className="p-8 pb-4">
              <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 text-primary">
                <User className="w-4 h-4" /> 2. Top Receptores
              </CardTitle>
          </CardHeader>
          <CardContent className="p-8 pt-0 space-y-4">
            {transferStats.map((r, i) => (
              <div key={i} className="flex justify-between items-center text-[10px] font-bold py-2 border-b border-secondary/10 last:border-0">
                <span className="opacity-60 truncate max-w-[150px]">{r.id}</span>
                <span className="font-black text-primary shrink-0">{formatCurrency(r.total)}</span>
              </div>
            ))}
            {transferStats.length === 0 && <p className="text-xs italic opacity-50 text-center py-10">Sin transferencias</p>}
          </CardContent>
        </Card>

        {/* 4 & 5. Recargas y Bancos */}
        <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden">
           <CardHeader className="p-8 pb-4">
              <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 text-primary">
                <Landmark className="w-4 h-4" /> 5. Bancos y Recargas
              </CardTitle>
          </CardHeader>
          <CardContent className="p-8 pt-0 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                  <div className="bg-secondary/20 p-4 rounded-2xl">
                      <p className="text-[8px] font-black uppercase opacity-50">Eficiencia Recargas</p>
                      <p className="text-lg font-black text-primary mt-1">{rechargeStats.efficiency.toFixed(0)}%</p>
                  </div>
                  <div className="bg-secondary/20 p-4 rounded-2xl">
                      <p className="text-[8px] font-black uppercase opacity-50">Bancos</p>
                      <p className="text-lg font-black text-primary mt-1">{Object.keys(banks).length}</p>
                  </div>
              </div>
              <div className="space-y-3">
                  {Object.entries(banks).map(([name, data]) => (
                      <div key={name} className="flex justify-between items-center">
                          <span className="text-[10px] font-black uppercase">{name}</span>
                          <span className="text-[10px] font-black">{formatCurrency(data.current_balance)}</span>
                      </div>
                  ))}
              </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="rounded-3xl border-none shadow-xl bg-secondary/10 p-8">
            <h5 className="text-[9px] font-black uppercase opacity-50 mb-3 tracking-widest text-primary flex items-center gap-2"><ZapOff className="w-3 h-3"/> 6. Fallos</h5>
            <p className="text-2xl font-black">{transactions.filter(tx => tx.type === 'FAILED_OPERATION').length}</p>
            <p className="text-[8px] font-bold opacity-40 uppercase">Errores Detectados</p>
          </Card>
          <Card className="rounded-3xl border-none shadow-xl bg-secondary/10 p-8 text-red-500">
            <h5 className="text-[9px] font-black uppercase opacity-50 mb-3 tracking-widest flex items-center gap-2"><Banknote className="w-3 h-3"/> 11. Efectivo</h5>
            <p className="text-2xl font-black">{formatCurrency(transactions.filter(tx => ['CASH_ATM', 'CASH_EXTRA'].includes(tx.type)).reduce((acc, tx) => acc + tx.amount, 0))}</p>
            <p className="text-[8px] font-bold opacity-40 uppercase">Salidas de Efectivo</p>
          </Card>
          <Card className="rounded-3xl border-none shadow-xl bg-primary text-primary-foreground p-8">
            <h5 className="text-[9px] font-black uppercase opacity-60 mb-3 tracking-widest flex items-center gap-2"><History className="w-3 h-3"/> 9. Actividad</h5>
            <p className="text-2xl font-black">{transactions.length}</p>
            <p className="text-[8px] font-black uppercase opacity-60">Operaciones Procesadas</p>
          </Card>
      </div>
    </div>
  );
}
