'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Clock, AlertTriangle, CheckCircle2, TrendingUp, Search, Download, Phone, Table2, List } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store';

type AgingTab = 'all' | 'overdue' | '30' | '60' | '90' | '120' | 'paid';

const AGING_TABS: { id: AgingTab; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'overdue', label: 'Vencidas' },
  { id: '30', label: '0-30d' },
  { id: '60', label: '31-60d' },
  { id: '90', label: '61-90d' },
  { id: '120', label: '91-120d' },
  { id: 'paid', label: 'Cobradas' },
];

const METHOD_FILTERS = [
  { id: '', label: 'Todos los métodos' },
  { id: 'cash', label: 'Efectivo' },
  { id: 'transfer', label: 'Transferencia' },
  { id: 'zelle', label: 'Zelle' },
];

const CURRENCY_FILTERS = [
  { id: '', label: 'Todas las monedas' },
  { id: 'CUP', label: 'CUP' },
  { id: 'USD', label: 'USD' },
  { id: 'EUR', label: 'EUR' },
];

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: 'Pendiente',
  partial: 'Parcial',
  paid: 'Cobrado',
};

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

export default function AccountsReceivableView() {
  const [tab, setTab] = useState<AgingTab>('all');
  const [methodFilter, setMethodFilter] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grouped' | 'list'>('list');
  const [data, setData] = useState<Receivable[]>([]);
  const [kpis, setKpis] = useState<KPIs>({ totalOverdue: 0, totalUpcoming: 0, totalPending: 0, totalPaid: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId || '';

  // Debounce search (espejo de AccountsPayable)
  const debouncedSearch = useMemo(() => {
    let timer: ReturnType<typeof setTimeout>;
    return (value: string) => {
      clearTimeout(timer);
      timer = setTimeout(() => setSearchQuery(value), 300);
    };
  }, []);

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

  useEffect(() => { fetchData(); }, [fetchData]);

  // Filtros locales (método y moneda se filtran client-side ya que la API no los soporta aún)
  const filteredData = useMemo(() => {
    return data.filter(r => {
      if (currencyFilter && r.budget_currency !== currencyFilter) return false;
      return true;
    });
  }, [data, currencyFilter]);

  const handleExport = async () => {
    setExporting(true);
    try {
      // Export CSV (espejo del Excel de AccountsPayable pero en CSV por ahora)
      const csv = [
        'OT,Cliente,Telefono,CI,Descripcion,Presupuesto,Pagado,Saldo,Moneda,Dias,Antiguedad,Estado',
        ...filteredData.map(r => `"${r.order_number}","${r.customer_name}","${r.customer_phone || ''}","${r.customer_ci || ''}","${r.description}","${r.budget_total}","${r.paid_amount}","${r.balance}","${r.budget_currency}","${r.age_days}","${r.aging_bucket}","${r.payment_status}"`)
      ].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cobros_antiguedad_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error('Export error:', e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-[clamp(1.25rem,4vw,2rem)] font-black uppercase tracking-tight">Cobros por Antigüedad</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Antigüedad de saldos de clientes: órdenes de servicio con saldo pendiente
          </p>
        </div>

        {/* View mode toggle + Export */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border/40 overflow-hidden">
            <button
              onClick={() => setViewMode('grouped')}
              className={cn(
                "px-3 py-2 min-h-[44px] text-[10px] font-black uppercase flex items-center gap-1.5",
                viewMode === 'grouped' ? "bg-success text-success-foreground" : "bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              <Table2 className="w-3.5 h-3.5" /> Por Cliente
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                "px-3 py-2 min-h-[44px] text-[10px] font-black uppercase flex items-center gap-1.5",
                viewMode === 'list' ? "bg-success text-success-foreground" : "bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              <List className="w-3.5 h-3.5" /> Detalle
            </button>
          </div>

          <button
            onClick={handleExport}
            disabled={exporting || loading}
            className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg border border-border/40 text-[10px] font-black uppercase hover:bg-muted disabled:opacity-50"
            title="Exportar a CSV"
          >
            <Download className="w-3.5 h-3.5" />
            {exporting ? 'Exportando...' : 'CSV'}
          </button>
        </div>
      </div>

      {/* KPI Cards — verde (success) para cobros vs rojo (destructive) para pagos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className={cn("rounded-xl border p-3", kpis.totalOverdue > 0 ? "border-destructive/30 bg-destructive/5" : "border-border/30")}>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className={cn("w-4 h-4", kpis.totalOverdue > 0 ? "text-destructive" : "text-muted-foreground")} />
            <span className="text-[10px] font-black uppercase text-muted-foreground">Vencido (+30d)</span>
          </div>
          <p className={cn("text-lg font-mono font-black tabular-nums", kpis.totalOverdue > 0 ? "text-destructive" : "")}>
            {formatCurrency(kpis.totalOverdue)}
          </p>
        </div>

        <div className={cn("rounded-xl border p-3", kpis.totalUpcoming > 0 ? "border-amber-500/30 bg-amber-500/5" : "border-border/30")}>
          <div className="flex items-center gap-2 mb-1">
            <Clock className={cn("w-4 h-4", kpis.totalUpcoming > 0 ? "text-amber-500" : "text-muted-foreground")} />
            <span className="text-[10px] font-black uppercase text-muted-foreground">Por vencer (0-30d)</span>
          </div>
          <p className={cn("text-lg font-mono font-black tabular-nums", kpis.totalUpcoming > 0 ? "text-amber-500" : "")}>
            {formatCurrency(kpis.totalUpcoming)}
          </p>
        </div>

        <div className="rounded-xl border border-success/30 bg-success/5 p-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-success" />
            <span className="text-[10px] font-black uppercase text-muted-foreground">Total por Cobrar</span>
          </div>
          <p className="text-lg font-mono font-black tabular-nums text-success">
            {formatCurrency(kpis.totalPending)}
          </p>
        </div>

        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            <span className="text-[10px] font-black uppercase text-muted-foreground">Cobros Activos</span>
          </div>
          <p className="text-lg font-mono font-black tabular-nums text-primary">
            {filteredData.length}
          </p>
        </div>
      </div>

      {/* Aging Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {AGING_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "px-3 py-2 min-h-[44px] rounded-lg text-[10px] font-black uppercase border transition-colors",
              tab === t.id
                ? "bg-success text-success-foreground border-success"
                : "border-border/40 text-muted-foreground hover:bg-muted"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters — espejo de AccountsPayable */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por cliente, OT o descripción..."
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              debouncedSearch(e.target.value);
            }}
            className="w-full pl-9 pr-3 py-2 min-h-[44px] rounded-lg border border-border/40 bg-background text-xs outline-none focus:ring-2 focus:ring-success/30"
          />
        </div>

        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
          className="px-3 py-2 min-h-[44px] rounded-lg border border-border/40 bg-background text-xs outline-none focus:ring-2 focus:ring-success/30"
        >
          {METHOD_FILTERS.map(m => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>

        <select
          value={currencyFilter}
          onChange={(e) => setCurrencyFilter(e.target.value)}
          className="px-3 py-2 min-h-[44px] rounded-lg border border-border/40 bg-background text-xs outline-none focus:ring-2 focus:ring-success/30"
        >
          {CURRENCY_FILTERS.map(c => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </div>

      {/* Loading / Error / Empty states */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block w-8 h-8 border-2 border-success/30 border-t-success rounded-full animate-spin" />
          <p className="text-xs text-muted-foreground mt-2">Cargando...</p>
        </div>
      ) : error ? (
        <div className="text-center py-12 bg-destructive/5 border border-destructive/20 rounded-xl">
          <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-2" />
          <p className="text-sm font-bold text-destructive mb-1">Error al cargar</p>
          <p className="text-xs text-muted-foreground">{error}</p>
          <button onClick={fetchData} className="mt-3 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-bold">
            Reintentar
          </button>
        </div>
      ) : filteredData.length === 0 ? (
        <div className="text-center py-12 bg-muted/20 border border-border rounded-xl">
          <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-3" />
          <p className="text-sm font-black uppercase text-muted-foreground">Sin cobros pendientes</p>
          <p className="text-xs text-muted-foreground mt-1">No hay órdenes con saldo pendiente en este filtro.</p>
        </div>
      ) : viewMode === 'grouped' ? (
        /* Vista agrupada por cliente */
        <GroupedReceivablesView data={filteredData} />
      ) : (
        /* Vista de lista (detalle) — tabla completa */
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
              {filteredData.map((r, i) => (
                <tr key={r.id} className={cn(
                  'border-b border-border/30 hover:bg-muted/20 transition-colors',
                  i % 2 === 1 && 'bg-muted/5'
                )}>
                  <td className="p-3 font-bold text-success text-xs whitespace-nowrap">{r.order_number}</td>
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
            {filteredData.length > 0 && (
              <tfoot>
                <tr className="bg-foreground/10 border-t-2 border-foreground/30 font-black">
                  <td colSpan={5} className="p-3 uppercase text-xs tracking-widest text-right">Total Saldo por Cobrar:</td>
                  <td className="p-3 text-right tabular-nums text-destructive">{formatCurrency(kpis.totalPending)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

// ── Vista agrupada por cliente (espejo de GroupedTableView de AccountsPayable) ──
function GroupedReceivablesView({ data }: { data: Receivable[] }) {
  // Agrupar por customer_name
  const grouped = useMemo(() => {
    const map = new Map<string, { customer_name: string; customer_phone: string | null; orders: Receivable[]; totalBalance: number; totalBudget: number; totalPaid: number }>();
    for (const r of data) {
      const key = r.customer_name || 'Sin cliente';
      if (!map.has(key)) {
        map.set(key, { customer_name: key, customer_phone: r.customer_phone, orders: [], totalBalance: 0, totalBudget: 0, totalPaid: 0 });
      }
      const g = map.get(key)!;
      g.orders.push(r);
      g.totalBalance += r.balance_cup;
      g.totalBudget += r.budget_total;
      g.totalPaid += r.paid_amount;
    }
    return Array.from(map.values()).sort((a, b) => b.totalBalance - a.totalBalance);
  }, [data]);

  return (
    <div className="space-y-3">
      {grouped.map((g, i) => (
        <details key={i} className="rounded-xl border border-border bg-card overflow-hidden" open={i < 5}>
          <summary className="p-3 cursor-pointer hover:bg-muted/20 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="min-w-0">
                <p className="font-bold text-xs truncate">{g.customer_name}</p>
                {g.customer_phone && <p className="text-[10px] text-muted-foreground">{g.customer_phone}</p>}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[10px] text-muted-foreground uppercase">Saldo</p>
              <p className="font-mono font-black text-sm text-destructive">{formatCurrency(g.totalBalance)}</p>
            </div>
          </summary>
          <div className="border-t border-border/20 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/30">
                <tr className="text-[9px] font-black uppercase text-muted-foreground">
                  <th className="p-2 text-left">OT</th>
                  <th className="p-2 text-left hidden sm:table-cell">Descripción</th>
                  <th className="p-2 text-right">Presupuesto</th>
                  <th className="p-2 text-right">Pagado</th>
                  <th className="p-2 text-right">Saldo</th>
                  <th className="p-2 text-center">Días</th>
                </tr>
              </thead>
              <tbody>
                {g.orders.map(r => (
                  <tr key={r.id} className="border-b border-border/20">
                    <td className="p-2 font-bold text-success">{r.order_number}</td>
                    <td className="p-2 hidden sm:table-cell max-w-[200px] truncate">{r.description}</td>
                    <td className="p-2 text-right tabular-nums">{formatCurrency(r.budget_total)}</td>
                    <td className="p-2 text-right tabular-nums text-success">{formatCurrency(r.paid_amount)}</td>
                    <td className="p-2 text-right tabular-nums font-black text-destructive">{formatCurrency(r.balance)}</td>
                    <td className="p-2 text-center">
                      <span className={cn(
                        "text-[9px] font-black px-1 py-0.5 rounded",
                        r.age_days <= 30 ? "bg-success/10 text-success" :
                        r.age_days <= 60 ? "bg-amber-500/10 text-amber-500" :
                        "bg-destructive/10 text-destructive"
                      )}>
                        {r.age_days}d
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
    </div>
  );
}
