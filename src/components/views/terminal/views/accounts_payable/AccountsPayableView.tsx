'use client';

import React, { useState, useMemo } from 'react';
import { AlertTriangle, Clock, CheckCircle2, Wallet, TrendingDown, Search, Package, Wrench, Filter } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useAccountsPayable, type AgingTab } from '@/hooks/api/useAccountsPayable';

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: 'Pendiente',
  partial: 'Parcial',
  paid: 'Pagado',
};

const AGING_TABS: { id: AgingTab; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'overdue', label: 'Vencidas' },
  { id: '30', label: '0-30d' },
  { id: '60', label: '31-60d' },
  { id: '90', label: '61-90d' },
  { id: '120', label: '91-120d' },
  { id: 'paid', label: 'Pagadas' },
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
  { id: 'MLC', label: 'MLC' },
];

export default function AccountsPayableView() {
  const [tab, setTab] = useState<AgingTab>('all');
  const [methodFilter, setMethodFilter] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const { data, kpis, summary, count, loading, error } = useAccountsPayable({
    tab,
    method: methodFilter || undefined,
    currency: currencyFilter || undefined,
    search: searchQuery || undefined,
  });

  // Debounce search
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useMemo(() => {
    let timer: ReturnType<typeof setTimeout>;
    return (value: string) => {
      clearTimeout(timer);
      timer = setTimeout(() => setSearchQuery(value), 400);
    };
  }, []);

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-black uppercase tracking-tight">Cuentas por Pagar</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Obligaciones pendientes: recepciones y servicios recibidos
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className={cn("rounded-xl border p-3", (kpis?.totalOverdue ?? 0) > 0 ? "border-destructive/30 bg-destructive/5" : "border-border/30")}>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className={cn("w-4 h-4", (kpis?.totalOverdue ?? 0) > 0 ? "text-destructive" : "text-muted-foreground")} />
            <span className="text-[10px] font-black uppercase text-muted-foreground">Vencido</span>
          </div>
          <p className={cn("text-lg font-mono font-black tabular-nums", (kpis?.totalOverdue ?? 0) > 0 ? "text-destructive" : "")}>
            {formatCurrency(kpis?.totalOverdue ?? 0)}
          </p>
        </div>

        <div className={cn("rounded-xl border p-3", (kpis?.totalUpcoming ?? 0) > 0 ? "border-amber-500/30 bg-amber-500/5" : "border-border/30")}>
          <div className="flex items-center gap-2 mb-1">
            <Clock className={cn("w-4 h-4", (kpis?.totalUpcoming ?? 0) > 0 ? "text-amber-500" : "text-muted-foreground")} />
            <span className="text-[10px] font-black uppercase text-muted-foreground">Próx. 7 días</span>
          </div>
          <p className={cn("text-lg font-mono font-black tabular-nums", (kpis?.totalUpcoming ?? 0) > 0 ? "text-amber-500" : "")}>
            {formatCurrency(kpis?.totalUpcoming ?? 0)}
          </p>
        </div>

        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="w-4 h-4 text-primary" />
            <span className="text-[10px] font-black uppercase text-muted-foreground">Total Pendiente</span>
          </div>
          <p className="text-lg font-mono font-black tabular-nums text-primary">
            {formatCurrency(kpis?.totalPending ?? 0)}
          </p>
        </div>

        <div className="rounded-xl border border-success/30 bg-success/5 p-3">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-success" />
            <span className="text-[10px] font-black uppercase text-muted-foreground">Pagado</span>
          </div>
          <p className="text-lg font-mono font-black tabular-nums text-success">
            {formatCurrency(kpis?.totalPaid ?? 0)}
          </p>
        </div>
      </div>

      {/* Summary by type */}
      {summary && (
        <div className="flex gap-2 text-[10px] text-muted-foreground">
          <span className="px-2 py-1 rounded-lg bg-muted/30">
            📦 Recepciones: <strong className="text-foreground">{summary.receipts.count}</strong> · {formatCurrency(summary.receipts.balance_cup)}
          </span>
          <span className="px-2 py-1 rounded-lg bg-muted/30">
            🔧 Servicios: <strong className="text-foreground">{summary.services.count}</strong> · {formatCurrency(summary.services.balance_cup)}
          </span>
        </div>
      )}

      {/* Aging Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {AGING_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase border transition-colors",
              tab === t.id
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border/40 text-muted-foreground hover:bg-muted"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por proveedor..."
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              debouncedSearch(e.target.value);
            }}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border/40 bg-background text-xs outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-border/40 bg-background text-xs outline-none focus:ring-2 focus:ring-primary/30"
        >
          {METHOD_FILTERS.map(m => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>

        <select
          value={currencyFilter}
          onChange={(e) => setCurrencyFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-border/40 bg-background text-xs outline-none focus:ring-2 focus:ring-primary/30"
        >
          {CURRENCY_FILTERS.map(c => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-xs text-destructive font-bold">Error: {error}</p>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <p className="text-center py-8 text-muted-foreground">Cargando...</p>
      ) : data.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Wallet className="w-8 h-8 mx-auto opacity-30 mb-2" />
          <p className="text-sm">No hay cuentas por pagar en esta categoría</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/30">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr className="text-[10px] font-black uppercase text-muted-foreground">
                <th className="p-3 text-left">Proveedor</th>
                <th className="p-3 text-center">Tipo</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3 text-right">Pagado</th>
                <th className="p-3 text-right">Saldo CUP</th>
                <th className="p-3 text-center">Vence</th>
                <th className="p-3 text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id} className="border-t border-border/20 hover:bg-muted/10">
                  {/* Proveedor */}
                  <td className="p-3">
                    <p className="font-bold text-xs">{p.supplier || 'Sin proveedor'}</p>
                    <p className="text-[10px] text-muted-foreground">{p.reference || 'Sin ref'}</p>
                  </td>

                  {/* Tipo */}
                  <td className="p-3 text-center">
                    {p.ref_type === 'receipt' ? (
                      <span className="inline-flex items-center gap-1 text-xs" title="Recepción">
                        <Package className="w-3.5 h-3.5" /> Recepción
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs" title="Servicio">
                        <Wrench className="w-3.5 h-3.5" /> Servicio
                      </span>
                    )}
                  </td>

                  {/* Total (con moneda original) */}
                  <td className="p-3 text-right">
                    <p className="font-mono font-bold tabular-nums text-xs">
                      {formatCurrency(p.total, p.currency)}
                    </p>
                    {p.currency !== 'CUP' && (
                      <p className="text-[9px] text-muted-foreground font-mono">
                        = {formatCurrency(p.total_cup, 'CUP')}
                      </p>
                    )}
                  </td>

                  {/* Pagado */}
                  <td className="p-3 text-right font-mono text-xs tabular-nums text-success">
                    {formatCurrency(p.paid_cup, 'CUP')}
                  </td>

                  {/* Saldo CUP */}
                  <td className="p-3 text-right">
                    <p className="font-mono font-black tabular-nums text-xs text-primary">
                      {formatCurrency(p.balance_cup, 'CUP')}
                    </p>
                    {p.currency !== 'CUP' && p.balance > 0 && (
                      <p className="text-[9px] text-muted-foreground font-mono">
                        {formatCurrency(p.balance, p.currency)}
                      </p>
                    )}
                  </td>

                  {/* Vence */}
                  <td className="p-3 text-center">
                    {p.due_date ? (
                      <div>
                        <p className={cn("text-xs font-bold", p.is_overdue ? "text-destructive" : "")}>
                          {new Date(p.due_date).toLocaleDateString('es-CU')}
                        </p>
                        {p.payment_status !== 'paid' && p.days_until_due !== null && (
                          <p className={cn(
                            "text-[10px]",
                            p.is_overdue ? "text-destructive font-bold" : p.days_until_due <= 7 ? "text-amber-500" : "text-muted-foreground"
                          )}>
                            {p.is_overdue
                              ? `Vencido ${Math.abs(p.days_until_due)}d`
                              : `${p.days_until_due}d`}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* Estado */}
                  <td className="p-3 text-center">
                    <span className={cn(
                      "px-2 py-1 rounded text-[10px] font-black uppercase",
                      p.payment_status === 'paid'
                        ? "bg-success/10 text-success"
                        : p.payment_status === 'partial'
                          ? "bg-amber-500/10 text-amber-500"
                          : "bg-destructive/10 text-destructive"
                    )}>
                      {p.payment_status === 'paid' ? '💰' : p.payment_status === 'partial' ? '⚖️' : '⏳'} {PAYMENT_STATUS_LABELS[p.payment_status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Count */}
      {!loading && count > 0 && (
        <p className="text-[10px] text-muted-foreground text-center">
          {count} documento{count !== 1 ? 's' : ''} en esta vista
        </p>
      )}
    </div>
  );
}
