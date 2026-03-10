import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WalletAnalytics, WalletTransaction } from "@/lib/wallet/types";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, Legend
} from 'recharts';
import {
  TrendingUp, TrendingDown, Wallet, CreditCard, Zap, Smartphone,
  AlertCircle, ShieldCheck, History, User, Landmark, Banknote, Clock,
  ArrowUpRight, ArrowDownRight, Percent, ZapOff, Scale
} from 'lucide-react';
import { cn } from "@/lib/utils";

const COLORS = ['#10b981', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

interface AnalyticsDashboardProps {
  analytics: WalletAnalytics;
}

export function AnalyticsDashboard({ analytics }: AnalyticsDashboardProps) {
  const { summary, banks, monthly, categories, transactions } = analytics;

  // 1. Balance Evolution & Unique Queries
  const balanceData = useMemo(() => {
    return transactions
      .filter(tx => tx.balance_after !== undefined)
      .map(tx => ({
        date: tx.date,
        balance: tx.balance_after,
        bank: tx.bank
      }));
  }, [transactions]);

  const uniqueBalanceQueries = useMemo(() => {
    const seen = new Set();
    return transactions
      .filter(tx => tx.type === 'BALANCE_QUERY')
      .filter(tx => {
        const key = `${tx.date}-${tx.balance_after}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions]);

  // 2. Transfers Analysis
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
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [transactions]);

  // 3. Recharge Efficiency
  const rechargeStats = useMemo(() => {
    const recharges = transactions.filter(tx => tx.type === 'PHONE_RECHARGE' || (tx.type === 'FAILED_OPERATION' && tx.description.toLowerCase().includes('recarga')));
    const success = recharges.filter(tx => tx.status === 'SUCCESS').length;
    const total = recharges.length;
    return {
      success,
      total,
      efficiency: total > 0 ? (success / total) * 100 : 0
    };
  }, [transactions]);

  // 4. Failed Operations Reasons
  const failedOpsData = useMemo(() => {
    const reasons: Record<string, number> = {};
    transactions.filter(tx => tx.type === 'FAILED_OPERATION').forEach(tx => {
      const reason = tx.extra_data?.reason || 'Desconocido';
      reasons[reason] = (reasons[reason] || 0) + 1;
    });
    return Object.entries(reasons).map(([name, value]) => ({ name, value }));
  }, [transactions]);

  // 5. Limit Change History
  const limitChanges = useMemo(() => {
    return transactions
      .filter(tx => tx.type === 'LIMIT_CHANGE')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions]);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('es-CU', { style: 'currency', currency: 'CUP' }).format(val);

  return (
    <div className="space-y-8 pb-20 p-4 md:p-8 overflow-x-hidden">
      {/* 14. KPI Cards (Indicadores Financieros Personales) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="rounded-3xl border-none shadow-xl bg-green-500/10 dark:bg-green-500/5">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Ingresos Totales</p>
                <h3 className="text-xl font-black mt-1 text-green-500">{formatCurrency(summary.total_income)}</h3>
              </div>
              <div className="bg-green-500 text-white p-2 rounded-xl"><ArrowUpRight className="w-4 h-4" /></div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-3xl border-none shadow-xl bg-red-500/10 dark:bg-red-500/5">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Gastos Totales</p>
                <h3 className="text-xl font-black mt-1 text-red-500">{formatCurrency(summary.total_expenses)}</h3>
              </div>
              <div className="bg-red-500 text-white p-2 rounded-xl"><ArrowDownRight className="w-4 h-4" /></div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-3xl border-none shadow-xl bg-primary/10">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Flujo Neto (Balance)</p>
                <h3 className="text-xl font-black mt-1">{formatCurrency(summary.balance)}</h3>
              </div>
              <div className="bg-primary text-primary-foreground p-2 rounded-xl"><Wallet className="w-4 h-4" /></div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-3xl border-none shadow-xl bg-blue-500/10">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Tasa de Ahorro</p>
                <h3 className="text-xl font-black mt-1 text-blue-500">
                  {summary.total_income > 0 ? ((summary.balance / summary.total_income) * 100).toFixed(1) : 0}%
                </h3>
              </div>
              <div className="bg-blue-500 text-white p-2 rounded-xl"><Scale className="w-4 h-4" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 1. Consultas de Saldo & Evolución */}
        <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden">
          <CardHeader className="p-8 pb-0">
            <CardTitle className="text-sm font-black uppercase tracking-[0.2em] flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              1. Evolución de Saldo Disponible
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8 pt-4 space-y-6">
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={balanceData}>
                  <defs>
                    <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                  <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}
                    formatter={(v: number) => formatCurrency(v)}
                  />
                  <Area type="monotone" dataKey="balance" stroke="var(--primary)" fillOpacity={1} fill="url(#colorBalance)" strokeWidth={4} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-3">Consultas Recientes (Sin Duplicados)</p>
              <div className="space-y-2 max-h-[150px] overflow-y-auto no-scrollbar">
                {uniqueBalanceQueries.map((q, i) => (
                  <div key={i} className="flex justify-between items-center text-[10px] font-bold py-1 border-b border-secondary/20">
                    <span className="opacity-60">{q.date}</span>
                    <span className="font-black text-primary">{formatCurrency(q.balance_after || 0)}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 2. Transferencias Realizadas */}
        <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden">
          <CardHeader className="p-8 pb-0">
            <CardTitle className="text-sm font-black uppercase tracking-[0.2em] flex items-center gap-2">
              <User className="w-4 h-4 text-primary" />
              2. Destinatarios de Transferencias
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8 pt-6">
            <div className="space-y-4">
              {transferStats.map((recipient, i) => (
                <div key={recipient.id} className="flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-secondary/30 flex items-center justify-center text-[10px] font-black">
                      {i + 1}
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase">{recipient.id}</p>
                      <p className="text-[9px] font-bold opacity-50 uppercase">{recipient.count} ops • Prom: {formatCurrency(recipient.total / recipient.count)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black">{formatCurrency(recipient.total)}</p>
                    <p className="text-[8px] font-bold opacity-40 uppercase">Ult: {recipient.last}</p>
                  </div>
                </div>
              ))}
              {transferStats.length === 0 && <p className="text-xs italic opacity-50 text-center py-10">Sin transferencias registradas</p>}
            </div>
          </CardContent>
        </Card>

        {/* 3 & 4. Servicios y Recargas */}
        <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden">
          <CardHeader className="p-8 pb-0">
            <CardTitle className="text-sm font-black uppercase tracking-[0.2em] flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              3 y 4. Gastos por Categoría y Recargas
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8 pt-4 space-y-8">
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={Object.entries(categories).map(([name, value]) => ({ name: name.replace('_', ' '), value }))}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                  <XAxis dataKey="name" fontSize={9} tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} hide />
                  <Tooltip
                    contentStyle={{ borderRadius: '20px', border: 'none' }}
                    formatter={(v: number) => formatCurrency(v)}
                  />
                  <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                    {Object.entries(categories).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-secondary/20 p-4 rounded-3xl">
                <p className="text-[8px] font-black uppercase tracking-widest opacity-50">Eficiencia Recargas</p>
                <div className="flex items-center justify-between mt-1">
                  <h4 className="text-lg font-black text-primary">{rechargeStats.efficiency.toFixed(0)}%</h4>
                  <Smartphone className="w-4 h-4 opacity-30" />
                </div>
                <p className="text-[8px] font-bold opacity-40 uppercase">{rechargeStats.success}/{rechargeStats.total} exitosas</p>
              </div>
              <div className="bg-secondary/20 p-4 rounded-3xl">
                <p className="text-[8px] font-black uppercase tracking-widest opacity-50">Pagos Electricidad</p>
                <div className="flex items-center justify-between mt-1">
                  <h4 className="text-lg font-black text-green-500">{formatCurrency(categories['ELECTRICITY'] || 0)}</h4>
                  <Zap className="w-4 h-4 opacity-30" />
                </div>
                <p className="text-[8px] font-bold opacity-40 uppercase">UNE (Electricidad)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 6. Transacciones Fallidas */}
        <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden">
          <CardHeader className="p-8 pb-0">
            <CardTitle className="text-sm font-black uppercase tracking-[0.2em] flex items-center gap-2">
              <ZapOff className="w-4 h-4 text-red-500" />
              6. Análisis de Transacciones Fallidas
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8 pt-4 h-[350px] flex flex-col md:flex-row items-center">
            <div className="w-full md:w-1/2 h-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={failedOpsData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {failedOpsData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '20px', border: 'none' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full md:w-1/2 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-4">Clasificación por Error</p>
              {failedOpsData.map((op, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <p className="text-[10px] font-black uppercase truncate">{op.name}</p>
                  <span className="ml-auto text-[10px] font-black">{op.value} ops</span>
                </div>
              ))}
              {failedOpsData.length === 0 && <p className="text-xs font-medium italic opacity-50">Excelente: No hay fallos</p>}
            </div>
          </CardContent>
        </Card>

        {/* 7. Gestión de Límites */}
        <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden">
          <CardHeader className="p-8 pb-0">
            <CardTitle className="text-sm font-black uppercase tracking-[0.2em] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              7. Gestión de Límites (ATM/POS/TOTAL)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8 pt-6">
            <div className="space-y-4">
              {limitChanges.map((lc, i) => (
                <div key={i} className="bg-secondary/10 p-4 rounded-2xl border border-secondary/20">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-black text-primary uppercase">Cambio Detectado</span>
                    <span className="text-[9px] font-bold opacity-50">{lc.date}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center">
                      <p className="text-[8px] font-black opacity-40 uppercase">ATM</p>
                      <p className="text-[10px] font-black">{formatCurrency(parseFloat(lc.extra_data?.atm || '0'))}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[8px] font-black opacity-40 uppercase">POS</p>
                      <p className="text-[10px] font-black">{formatCurrency(parseFloat(lc.extra_data?.pos || '0'))}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[8px] font-black opacity-40 uppercase">TOTAL</p>
                      <p className="text-[10px] font-black text-primary">{formatCurrency(parseFloat(lc.extra_data?.total || '0'))}</p>
                    </div>
                  </div>
                </div>
              ))}
              {limitChanges.length === 0 && <p className="text-xs italic opacity-50 text-center py-10">Sin cambios de límites registrados</p>}
            </div>
          </CardContent>
        </Card>

        {/* 5. Entidades Bancarias */}
        <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden">
          <CardHeader className="p-8 pb-0">
            <CardTitle className="text-sm font-black uppercase tracking-[0.2em] flex items-center gap-2">
              <Landmark className="w-4 h-4 text-primary" />
              5. Análisis por Entidad Bancaria
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8 pt-6">
            <div className="space-y-6">
              {Object.entries(banks).map(([name, data]) => (
                <div key={name} className="bg-secondary/20 rounded-[2rem] p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-sm font-black uppercase tracking-widest">{name}</h4>
                    <span className="text-[10px] font-black opacity-50 uppercase tracking-tighter">Último Saldo Conocido</span>
                  </div>
                  <div className="flex justify-between items-end">
                    <div>
                      <div className="flex items-center gap-2 text-green-500 mb-1">
                        <ArrowUpRight className="w-3 h-3" />
                        <span className="text-[10px] font-bold">+{formatCurrency(data.income)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-red-500">
                        <ArrowDownRight className="w-3 h-3" />
                        <span className="text-[10px] font-bold">-{formatCurrency(data.expenses)}</span>
                      </div>
                    </div>
                    <p className="text-2xl font-black">{formatCurrency(data.current_balance)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 9, 11, 12, 13 Summary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
         {/* 11. Efectivo */}
         <Card className="rounded-[2rem] border-none shadow-xl">
           <CardHeader className="p-6 pb-2">
             <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
               <Banknote className="w-3 h-3 text-primary" />
               11. Efectivo
             </CardTitle>
           </CardHeader>
           <CardContent className="p-6 pt-2">
              <p className="text-xl font-black">{formatCurrency(transactions.filter(tx => ['CASH_ATM', 'CASH_EXTRA'].includes(tx.type)).reduce((acc, tx) => acc + tx.amount, 0))}</p>
              <p className="text-[8px] font-bold opacity-40 uppercase mt-1">Cajero y Caja Extra</p>
           </CardContent>
         </Card>

         {/* 12. MiTurno */}
         <Card className="rounded-[2rem] border-none shadow-xl">
           <CardHeader className="p-6 pb-2">
             <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
               <Clock className="w-3 h-3 text-primary" />
               12. MiTurno
             </CardTitle>
           </CardHeader>
           <CardContent className="p-6 pt-2">
              <p className="text-xl font-black">{transactions.filter(tx => tx.type === 'MITURNO').length}</p>
              <p className="text-[8px] font-bold opacity-40 uppercase mt-1">Turnos Solicitados</p>
           </CardContent>
         </Card>

         {/* 13. Seguridad */}
         <Card className="rounded-[2rem] border-none shadow-xl">
           <CardHeader className="p-6 pb-2">
             <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
               <ShieldCheck className="w-3 h-3 text-primary" />
               13. Seguridad
             </CardTitle>
           </CardHeader>
           <CardContent className="p-6 pt-2">
              <p className="text-xl font-black">{transactions.filter(tx => tx.type === 'SECURITY_EVENT').length}</p>
              <p className="text-[8px] font-bold opacity-40 uppercase mt-1">Eventos Detectados</p>
           </CardContent>
         </Card>

         {/* 9. Patrones Temporales */}
         <Card className="rounded-[2rem] border-none shadow-xl bg-primary text-primary-foreground">
           <CardHeader className="p-6 pb-2">
             <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
               <History className="w-3 h-3" />
               9. Actividad
             </CardTitle>
           </CardHeader>
           <CardContent className="p-6 pt-2">
              <p className="text-xl font-black">{transactions.length}</p>
              <p className="text-[8px] font-black uppercase mt-1 opacity-60">Operaciones Totales</p>
           </CardContent>
         </Card>
      </div>
    </div>
  );
}
