'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Clock, AlertTriangle, CheckCircle2, TrendingUp, Search, Download, Phone, User, FileText } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { StateRenderer } from '@/components/ui/StateRenderer';

type AgingTab = 'all' | 'overdue' | '30' | '60' | '90' | '120' | 'paid';

const AGING_TABS: { id: AgingTab; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'overdue', label: 'Vencidas' },
  { id: '30', label: '0-30d' },
  { id: '60', label: '31-60d' },
  { id: '90', label: '61-90d' },
  { id: '120', label: '91-120d' },
  { id: 'paid', label: 'Pagadas' },
];

interface Receivable {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string | null;
  customer_ci: string | null;
  description: string;
  budget_total: number;
  budget_currency: string;
  paid_amount: number;
  balance: number;
  balance_cup: number;
  payment_status: string;
  status: string;
  order_date: string;
  age_days: number;
  aging_bucket: string;
}

interface KPIs {
  totalOverdue: number;
  totalUpcoming: number;
  totalPending: number;
  totalPaid: number;
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: 'Pendiente',
  partial: 'Parcial',
  paid: 'Pagado',
};

export default function AccountsReceivableView() {
  const [tab, setTab] = useState<AgingTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [data, setData] = useState<Receivable[]>([]);
  const [kpis, setKpis] = useState<KPIs>({ totalOverdue: 0, totalUpcoming: 0, totalPending: 0, totalPaid: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId || '';

  const fetchData = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setError(null);
    try {
      const token = useAuthStore.getState().token;
      const params = new URLSearchParams({ store_id: storeId, tab });
      if (searchQuery) params.set('search', searchQuery);
      const res = await fetch(`/api/accounts-receivable?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json.data || []);
      setKpis(json.kpis || { totalOverdue: 0, totalUpcoming: 0, totalPending: 0, totalPaid: 0 });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [storeId, tab, searchQuery]);

  React.useEffect(() => { fetchData(); }, [fetchData]);

  const handleExport = async () => {
    if (!storeId) return;
    try {
      const token = useAuthStore.getState().token;
      // Export simple CSV
      const csv = [
        'OT,Cliente,Telefono,CI,Descripcion,Presupuesto,Pagado,Saldo,Moneda,Dias,Antiguedad,Estado',
        ...data.map(r => `"${r.order_number}","${r.customer_name}","${r.customer_phone || ''}","${r.customer_ci || ''}","${r.description}","${r.budget_total}","${r.paid_amount}","${r.balance}","${r.budget_currency}","${r.age_days}","${r.aging_bucket}","${r.payment_status}"`)
      ].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cobros_antiguedad_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error('Export error:', e);
    }
  };

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[clamp(1.5rem,5vw,2rem)] font-black text-foreground tracking-tighter uppercase">
            Cobros por Antigüedad
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Antigüedad de saldos de clientes: órdenes de producción/servicio con saldo pendiente
          </p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 h-10 rounded-xl border border-border text-xs font-black uppercase hover:bg-muted transition-all"
        >
          <Download className="w-4 h-4" /> Exportar CSV
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl bg-destructive/5 border border-destructive/10 p-3 text-center">
          <AlertTriangle className="w-5 h-5 text-destructive mx-auto mb-1" />
          <p className="text-[10px] font-black uppercase text-muted-foreground">Vencido (+30d)</p>
          <p className="text-base font-black text-destructive tabular-nums">{formatCurrency(kpis.totalOverdue)}</p>
        </div>
        <div className="rounded-xl bg-amber-500/5 border border-amber-500/10 p-3 text-center">
          <Clock className="w-5 h-5 text-amber-500 mx-auto mb-1" />
          <p className="text-[10px] font-black uppercase text-muted-foreground">Por vencer (0-30d)</p>
          <p className="text-base font-black text-amber-500 tabular-nums">{formatCurrency(kpis.totalUpcoming)}</p>
        </div>
        <div className="rounded-xl bg-primary/5 border border-primary/10 p-3 text-center">
          <TrendingUp className="w-5 h-5 text-primary mx-auto mb-1" />
          <p className="text-[10px] font-black uppercase text-muted-foreground">Total Pendiente</p>
          <p className="text-base font-black text-primary tabular-nums">{formatCurrency(kpis.totalPending)}</p>
        </div>
        <div className="rounded-xl bg-success/5 border border-success/10 p-3 text-center">
          <CheckCircle2 className="w-5 h-5 text-success mx-auto mb-1" />
          <p className="text-[10px] font-black uppercase text-muted-foreground">Cobros Activos</p>
          <p className="text-base font-black text-success tabular-nums">{data.length}</p>
        </div>
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex border-b border-border overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {AGING_TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "py-2 px-3 text-xs font-black uppercase border-b-2 -mb-px whitespace-nowrap min-h-[40px] transition-colors",
                tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por cliente, OT o descripción..."
            className="w-full pl-10 pr-4 h-10 rounded-xl border border-border bg-background text-xs font-bold focus:ring-1 focus:ring-primary outline-none"
          />
        </div>
      </div>

      {/* Tabla */}
      <StateRenderer
        isLoading={loading}
        error={error}
        data={data}
        onRetry={fetchData}
        emptyComponent={
          <div className="text-center py-12">
            <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-3" />
            <p className="text-sm font-black uppercase text-muted-foreground">Sin cobros pendientes</p>
            <p className="text-xs text-muted-foreground mt-1">No hay órdenes con saldo pendiente en este filtro.</p>
          </div>
        }
      >
        {() => (
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/30 border-b border-border">
                <tr className="text-muted-foreground font-black uppercase text-[10px] tracking-widest">
                  <th className="p-3 text-left">OT</th>
                  <th className="p-3 text-left">Cliente</th>
                  <th className="p-3 text-left hidden sm:table-cell">Descripción</th>
                  <th className="p-3 text-right">Presupuesto</th>
                  <th className="p-3 text-right">Pagado</th>
                  <th className="p-3 text-right">Saldo</th>
                  <th className="p-3 text-center hidden sm:table-cell">Días</th>
                  <th className="p-3 text-center">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r, i) => (
                  <tr key={r.id} className={cn(
                    'border-b border-border/30 hover:bg-muted/20 transition-colors',
                    i % 2 === 1 && 'bg-muted/5'
                  )}>
                    <td className="p-3 font-bold text-primary text-xs whitespace-nowrap">{r.order_number}</td>
                    <td className="p-3">
                      <div className="font-bold text-xs truncate max-w-[150px]">{r.customer_name}</div>
                      {r.customer_phone && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Phone className="w-2.5 h-2.5" /> {r.customer_phone}
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground hidden sm:table-cell max-w-[200px] truncate">{r.description}</td>
                    <td className="p-3 text-right tabular-nums font-bold text-xs">{formatCurrency(r.budget_total)}</td>
                    <td className="p-3 text-right tabular-nums text-success text-xs">{formatCurrency(r.paid_amount)}</td>
                    <td className="p-3 text-right tabular-nums font-black text-destructive text-xs">{formatCurrency(r.balance)}</td>
                    <td className="p-3 text-center hidden sm:table-cell">
                      <span className={cn(
                        "text-[10px] font-black px-1.5 py-0.5 rounded",
                        r.age_days <= 30 ? "bg-success/10 text-success" :
                        r.age_days <= 60 ? "bg-amber-500/10 text-amber-500" :
                        r.age_days <= 90 ? "bg-orange-500/10 text-orange-500" :
                        "bg-destructive/10 text-destructive"
                      )}>
                        {r.age_days}d
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-[9px] font-black uppercase",
                        r.payment_status === 'paid' ? "bg-success/10 text-success" :
                        r.payment_status === 'partial' ? "bg-amber-500/10 text-amber-500" :
                        "bg-destructive/10 text-destructive"
                      )}>
                        {PAYMENT_STATUS_LABELS[r.payment_status] || r.payment_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              {data.length > 0 && (
                <tfoot>
                  <tr className="bg-foreground/10 border-t-2 border-foreground/30 font-black">
                    <td colSpan={5} className="p-3 uppercase text-xs tracking-widest text-right">Total Saldo Pendiente:</td>
                    <td className="p-3 text-right tabular-nums text-destructive">{formatCurrency(kpis.totalPending)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </StateRenderer>
    </div>
  );
}
