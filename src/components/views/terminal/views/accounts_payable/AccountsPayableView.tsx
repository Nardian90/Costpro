'use client';

import React, { useState, useMemo, Fragment } from 'react';
import { AlertTriangle, Clock, CheckCircle2, Wallet, TrendingDown, Search, Table2, List, CreditCard, User, Download, CheckSquare, Square } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { apiFetch } from '@/lib/api-fetch';
import { useAccountsPayable, type AgingTab, type GroupedPayable, type UnifiedPayable } from '@/hooks/api/useAccountsPayable';
import PaymentModal, { type PayableDocument } from './PaymentModal';
import PaymentHistoryRow from './PaymentHistoryRow';

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
  const [viewMode, setViewMode] = useState<'grouped' | 'list'>('grouped');
  const [paymentModalDoc, setPaymentModalDoc] = useState<PayableDocument | null>(null);
  const [exporting, setExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPaying, setBulkPaying] = useState(false);
  const [bulkMethod, setBulkMethod] = useState<'cash' | 'transfer' | 'mixed'>('cash');
  const [showBulkBar, setShowBulkBar] = useState(false);
  const { user } = useAuthStore();

  const { data, totals, kpis, summary, count, loading, error, refetch } = useAccountsPayable({
    tab,
    method: (methodFilter || undefined) as 'cash' | 'transfer' | 'zelle' | undefined,
    currency: currencyFilter || undefined,
    search: searchQuery || undefined,
    mode: viewMode,
  });

  const handleExport = async () => {
    if (!user?.activeStoreId) return;
    setExporting(true);
    try {
      // FIX-M9 (2026-07-13): usar token JWT via apiFetch pattern (no fetch directo)
      const token = useAuthStore.getState().token;
      const response = await fetch(`/api/accounts-payable/export?store_id=${user.activeStoreId}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(err.error || 'Error al exportar');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cuentas_por_pagar_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(`Error al exportar: ${e.message}`);
    } finally {
      setExporting(false);
    }
  };

  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useMemo(() => {
    let timer: ReturnType<typeof setTimeout>;
    return (value: string) => {
      clearTimeout(timer);
      timer = setTimeout(() => setSearchQuery(value), 400);
    };
  }, []);

  // Bulk actions
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setShowBulkBar(next.size > 0);
      return next;
    });
  };

  const toggleSelectAll = (items: UnifiedPayable[]) => {
    const payableItems = items.filter(p => p.payment_status !== 'paid');
    if (selectedIds.size === payableItems.length && payableItems.length > 0) {
      setSelectedIds(new Set());
      setShowBulkBar(false);
    } else {
      setSelectedIds(new Set(payableItems.map(p => p.id)));
      setShowBulkBar(true);
    }
  };

  const handleBulkPay = async () => {
    if (selectedIds.size === 0) return;
    const listData = data as UnifiedPayable[];
    const selected = listData.filter(p => selectedIds.has(p.id));

    if (!confirm(`¿Marcar ${selected.length} documento(s) como pagados con método "${bulkMethod}"?`)) return;

    setBulkPaying(true);
    try {
      const result = await apiFetch('/api/accounts-payable/bulk-pay', {
        method: 'POST',
        body: JSON.stringify({
          items: selected.map(p => ({ ref_type: p.ref_type, ref_id: p.ref_id })),
          payment_method: bulkMethod,
        }),
      });

      if (result.error_count > 0) {
        alert(`${result.success_count} pagados, ${result.error_count} con errores. Revisa la consola.`);
        console.error('Bulk pay errors:', result.results.filter((r: any) => !r.success));
      }

      setSelectedIds(new Set());
      setShowBulkBar(false);
      refetch();
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setBulkPaying(false);
    }
  };

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-tight">Cuentas por Pagar</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Antigüedad de saldos: recepciones y servicios recibidos
          </p>
        </div>

        {/* View mode toggle + Export */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border/40 overflow-hidden">
            <button
              onClick={() => setViewMode('grouped')}
              className={cn(
                "px-3 py-1.5 text-[10px] font-black uppercase flex items-center gap-1.5",
                viewMode === 'grouped' ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              <Table2 className="w-3.5 h-3.5" /> Por Proveedor
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                "px-3 py-1.5 text-[10px] font-black uppercase flex items-center gap-1.5",
                viewMode === 'list' ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              <List className="w-3.5 h-3.5" /> Detalle
            </button>
          </div>

          <button
            onClick={handleExport}
            disabled={exporting || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/40 text-[10px] font-black uppercase hover:bg-muted disabled:opacity-50"
            title="Exportar a Excel"
          >
            <Download className="w-3.5 h-3.5" />
            {exporting ? 'Exportando...' : 'Excel'}
          </button>
        </div>
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

      {/* Content */}
      {loading ? (
        <p className="text-center py-8 text-muted-foreground">Cargando...</p>
      ) : error ? null : viewMode === 'grouped' ? (
        <GroupedTableView data={data as GroupedPayable[]} totals={totals} />
      ) : (
        <ListView
          data={data as UnifiedPayable[]}
          onPay={(doc) => setPaymentModalDoc(doc)}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
        />
      )}

      {/* Bulk action bar */}
      {showBulkBar && viewMode === 'list' && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-background border border-border/40 rounded-2xl shadow-2xl p-3 flex items-center gap-3">
          <span className="text-xs font-black uppercase">
            {selectedIds.size} seleccionado(s)
          </span>
          <select
            value={bulkMethod}
            onChange={(e) => setBulkMethod(e.target.value as any)}
            className="px-2 py-1.5 rounded-lg border border-border/40 bg-background text-xs"
          >
            <option value="cash">Efectivo</option>
            <option value="transfer">Transferencia</option>
            <option value="mixed">Mixto</option>
          </select>
          <button
            onClick={handleBulkPay}
            disabled={bulkPaying}
            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[10px] font-black uppercase hover:bg-primary/90 disabled:opacity-50"
          >
            {bulkPaying ? 'Procesando...' : 'Marcar Pagadas'}
          </button>
          <button
            onClick={() => { setSelectedIds(new Set()); setShowBulkBar(false); }}
            className="px-2 py-1.5 rounded-lg border border-border/40 text-[10px] font-black uppercase hover:bg-muted"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Count */}
      {!loading && !error && count > 0 && (
        <p className="text-[10px] text-muted-foreground text-center">
          {count} {viewMode === 'grouped' ? 'proveedor(es)' : 'documento(s)'} en esta vista
        </p>
      )}

      {/* Payment Modal */}
      <PaymentModal
        document={paymentModalDoc}
        onClose={() => setPaymentModalDoc(null)}
        onPaymentRegistered={refetch}
      />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// GROUPED TABLE VIEW — estilo Excel con columnas por aging
// ═════════════════════════════════════════════════════════════════
function GroupedTableView({ data, totals }: { data: GroupedPayable[]; totals: any }) {
  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Wallet className="w-8 h-8 mx-auto opacity-30 mb-2" />
        <p className="text-sm">No hay cuentas por pagar en esta categoría</p>
      </div>
    );
  }

  const fmt = (n: number) => formatCurrency(n, 'CUP');
  const cellClass = (n: number) => cn(
    "p-2 text-right font-mono tabular-nums text-xs",
    n > 0 ? "font-bold" : "text-muted-foreground/40"
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-border/30">
      <table className="w-full text-sm">
        <thead className="bg-muted/30 sticky top-0">
          <tr className="text-[10px] font-black uppercase text-muted-foreground">
            <th className="p-2 text-left sticky left-0 bg-muted/30 z-10" rowSpan={2}>Proveedor / Acreedor</th>
            <th className="p-2 text-center" rowSpan={2}>Docs</th>
            <th className="p-2 text-right" rowSpan={2}>Total</th>
            <th className="p-2 text-right" rowSpan={2}>Pagado</th>
            <th className="p-2 text-right border-l border-border/40" rowSpan={2}>Saldo</th>
            <th className="p-2 text-center border-l border-border/40" colSpan={2}>Por Vencer</th>
            <th className="p-2 text-center border-l border-border/40" colSpan={5}>Vencido</th>
          </tr>
          <tr className="text-[9px] font-black uppercase text-muted-foreground">
            <th className="p-2 text-right border-l border-border/40">Corriente</th>
            <th className="p-2 text-right">Próx 7d</th>
            <th className="p-2 text-right border-l border-border/40 text-destructive">0-30d</th>
            <th className="p-2 text-right text-destructive">31-60d</th>
            <th className="p-2 text-right text-destructive">61-90d</th>
            <th className="p-2 text-right text-destructive">91-120d</th>
            <th className="p-2 text-right text-destructive">+120d</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={idx} className="border-t border-border/20 hover:bg-muted/10">
              <td className="p-2 text-xs font-bold sticky left-0 bg-background z-10">
                {row.supplier}
              </td>
              <td className="p-2 text-center text-xs text-muted-foreground">{row.count}</td>
              <td className={cellClass(row.total_cup)}>{fmt(row.total_cup)}</td>
              <td className={cellClass(row.paid_cup)}>{fmt(row.paid_cup)}</td>
              <td className={cn(cellClass(row.balance_cup), "border-l border-border/40 text-primary font-black")}>
                {fmt(row.balance_cup)}
              </td>
              <td className={cn(cellClass(row.aging.current), "border-l border-border/40")}>{fmt(row.aging.current)}</td>
              <td className={cellClass(0)}>—</td>
              <td className={cn(cellClass(row.aging['30']), "border-l border-border/40", row.aging['30'] > 0 && "text-destructive")}>{fmt(row.aging['30'])}</td>
              <td className={cn(cellClass(row.aging['60']), row.aging['60'] > 0 && "text-destructive")}>{fmt(row.aging['60'])}</td>
              <td className={cn(cellClass(row.aging['90']), row.aging['90'] > 0 && "text-destructive")}>{fmt(row.aging['90'])}</td>
              <td className={cn(cellClass(row.aging['120']), row.aging['120'] > 0 && "text-destructive")}>{fmt(row.aging['120'])}</td>
              <td className={cn(cellClass(row.aging['120+']), row.aging['120+'] > 0 && "text-destructive font-black")}>{fmt(row.aging['120+'])}</td>
            </tr>
          ))}
        </tbody>
        {totals && (
          <tfoot className="bg-primary/5 border-t-2 border-primary/30 sticky bottom-0">
            <tr className="text-[10px] font-black uppercase">
              <td className="p-2 text-left sticky left-0 bg-primary/5 z-10">TOTALES</td>
              <td className="p-2 text-center">—</td>
              <td className={cellClass(totals.total_cup)}>{fmt(totals.total_cup)}</td>
              <td className={cellClass(totals.paid_cup)}>{fmt(totals.paid_cup)}</td>
              <td className={cn(cellClass(totals.balance_cup), "border-l border-border/40 text-primary")}>{fmt(totals.balance_cup)}</td>
              <td className={cn(cellClass(totals.aging.current), "border-l border-border/40")}>{fmt(totals.aging.current)}</td>
              <td className={cellClass(0)}>—</td>
              <td className={cn(cellClass(totals.aging['30']), "border-l border-border/40", totals.aging['30'] > 0 && "text-destructive")}>{fmt(totals.aging['30'])}</td>
              <td className={cn(cellClass(totals.aging['60']), totals.aging['60'] > 0 && "text-destructive")}>{fmt(totals.aging['60'])}</td>
              <td className={cn(cellClass(totals.aging['90']), totals.aging['90'] > 0 && "text-destructive")}>{fmt(totals.aging['90'])}</td>
              <td className={cn(cellClass(totals.aging['120']), totals.aging['120'] > 0 && "text-destructive")}>{fmt(totals.aging['120'])}</td>
              <td className={cn(cellClass(totals.aging['120+']), totals.aging['120+'] > 0 && "text-destructive")}>{fmt(totals.aging['120+'])}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// LIST VIEW — detalle por documento (vista original mejorada)
// ═════════════════════════════════════════════════════════════════
function ListView({
  data,
  onPay,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}: {
  data: UnifiedPayable[];
  onPay: (doc: PayableDocument) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: (items: UnifiedPayable[]) => void;
}) {
  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Wallet className="w-8 h-8 mx-auto opacity-30 mb-2" />
        <p className="text-sm">No hay documentos en esta categoría</p>
      </div>
    );
  }

  const payableItems = data.filter(p => p.payment_status !== 'paid');
  const allSelected = payableItems.length > 0 && selectedIds.size === payableItems.length;

  return (
    <div className="overflow-x-auto rounded-xl border border-border/30">
      <table className="w-full text-sm">
        <thead className="bg-muted/30">
          <tr className="text-[10px] font-black uppercase text-muted-foreground">
            <th className="p-3 text-center w-10">
              <button
                onClick={() => onToggleSelectAll(data)}
                className="hover:text-primary"
                aria-label="Seleccionar todos"
              >
                {allSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
              </button>
            </th>
            <th className="p-3 text-left">Proveedor</th>
            <th className="p-3 text-center">Tipo</th>
            <th className="p-3 text-right">Total</th>
            <th className="p-3 text-right">Pagado</th>
            <th className="p-3 text-right">Saldo CUP</th>
            <th className="p-3 text-center">Vence</th>
            <th className="p-3 text-center">Estado</th>
            <th className="p-3 text-center">Acción</th>
          </tr>
        </thead>
        <tbody>
          {data.map((p) => (
            <Fragment key={p.id}>
              <tr className={cn(
                "border-t border-border/20 hover:bg-muted/10",
                selectedIds.has(p.id) && "bg-primary/5"
              )}>
                <td className="p-3 text-center">
                  {p.payment_status !== 'paid' && (
                    <button
                      onClick={() => onToggleSelect(p.id)}
                      aria-label="Seleccionar"
                    >
                      {selectedIds.has(p.id)
                        ? <CheckSquare className="w-4 h-4 text-primary" />
                        : <Square className="w-4 h-4 text-muted-foreground" />
                      }
                    </button>
                  )}
                </td>
                <td className="p-3">
                  <p className="font-bold text-xs">{p.supplier || 'Sin proveedor'}</p>
                  <p className="text-[10px] text-muted-foreground">{p.reference || 'Sin ref'}</p>
                </td>
                <td className="p-3 text-center text-xs">
                  {p.ref_type === 'receipt' ? '📦 Recepción' : p.ref_type === 'service' ? '🔧 Servicio' : '👤 Comisión'}
                </td>
                <td className="p-3 text-right">
                  <p className="font-mono font-bold tabular-nums text-xs">{formatCurrency(p.total, p.currency)}</p>
                  {p.currency !== 'CUP' && (
                    <p className="text-[9px] text-muted-foreground font-mono">= {formatCurrency(p.total_cup, 'CUP')}</p>
                  )}
                </td>
                <td className="p-3 text-right font-mono text-xs tabular-nums text-success">
                  {formatCurrency(p.paid_cup, 'CUP')}
                </td>
                <td className="p-3 text-right">
                  <p className="font-mono font-black tabular-nums text-xs text-primary">
                    {formatCurrency(p.balance_cup, 'CUP')}
                  </p>
                  {p.currency !== 'CUP' && p.balance > 0 && (
                    <p className="text-[9px] text-muted-foreground font-mono">{formatCurrency(p.balance, p.currency)}</p>
                  )}
                </td>
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
                          {p.is_overdue ? `Vencido ${Math.abs(p.days_until_due)}d` : `${p.days_until_due}d`}
                        </p>
                      )}
                    </div>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </td>
                <td className="p-3 text-center">
                  <span className={cn(
                    "px-2 py-1 rounded text-[10px] font-black uppercase",
                    p.payment_status === 'paid' ? "bg-success/10 text-success"
                    : p.payment_status === 'partial' ? "bg-amber-500/10 text-amber-500"
                    : "bg-destructive/10 text-destructive"
                  )}>
                    {p.payment_status === 'paid' ? '💰' : p.payment_status === 'partial' ? '⚖️' : '⏳'} {PAYMENT_STATUS_LABELS[p.payment_status]}
                  </span>
                </td>
                <td className="p-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    {p.payment_status !== 'paid' && (
                      <button
                        onClick={() => onPay({
                          ref_type: p.ref_type,
                          ref_id: p.ref_id,
                          supplier: p.supplier,
                          total: p.total,
                          total_cup: p.total_cup,
                          paid_cup: p.paid_cup,
                          balance_cup: p.balance_cup,
                          currency: p.currency,
                          exchange_rate: p.exchange_rate,
                          payment_status: p.payment_status,
                        })}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary text-primary-foreground text-[10px] font-black uppercase hover:bg-primary/90"
                      >
                        <CreditCard className="w-3 h-3" /> Pagar
                      </button>
                    )}
                    <PaymentHistoryRow
                      refType={p.ref_type}
                      refId={p.ref_id}
                      paidAmount={p.paid_cup}
                    />
                  </div>
                </td>
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
