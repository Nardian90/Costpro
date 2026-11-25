'use client';

import React, { useState, useMemo, Fragment } from 'react';
import { AlertTriangle, Clock, CheckCircle2, Wallet, TrendingDown, Search, Table2, List, CreditCard, Download, CheckSquare, Square, Calendar, X, ArrowLeft, User } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { useAccountsPayable, type AgingTab, type PayableCategory, type GroupedPayable, type UnifiedPayable } from '@/hooks/api/useAccountsPayable';
import { StateRenderer } from '@/components/ui/StateRenderer'; // CP-CI-006 U1: estados canónicos
import PaymentModal, { type PayableDocument } from './PaymentModal';
import PaymentHistoryRow from './PaymentHistoryRow';
import { LiquidationModal, type LiquidationItem } from './LiquidationModal';
import { useDialogs } from '@/components/ui/dialogs';

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

const CATEGORY_FILTERS: { id: PayableCategory; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'receipts', label: 'Recepciones' },
  { id: 'services', label: 'Servicios' },
  { id: 'commissions', label: 'Comisiones' },
];

const METHOD_FILTERS = [
  { id: '', label: 'Todos los métodos' },
  { id: 'cash', label: 'Efectivo' },
  { id: 'transfer', label: 'Transferencia' },
  { id: 'zelle', label: 'Transf. Exterior' },
];

const CURRENCY_FILTERS = [
  { id: '', label: 'Todas las monedas' },
  { id: 'CUP', label: 'CUP' },
  { id: 'USD', label: 'USD' },
  { id: 'MLC', label: 'MLC' },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** dd/MM/yyyy legible para el banner de corte. */
function fmtDay(iso: string | null | undefined): string {
  if (!iso || !DATE_RE.test(iso)) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export default function AccountsPayableView() {
  // CP-UX-FINAL-POLISH-003 §3.1: sistema unificado de diálogos (sin alert() nativo).
  const dialogs = useDialogs();
  const [tab, setTab] = useState<AgingTab>('all');
  const [category, setCategory] = useState<PayableCategory>('all');
  const [methodFilter, setMethodFilter] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grouped' | 'list'>('grouped');
  const [paymentModalDoc, setPaymentModalDoc] = useState<PayableDocument | null>(null);
  const [exporting, setExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkBar, setShowBulkBar] = useState(false);
  const { user } = useAuthStore();

  // ── Filtro personalizado por fechas (misión FASE 4) ──
  // Inputs locales → «Aplicar» los confirma → mueve la consulta. La fecha
  // final es además la FECHA DE CORTE de saldos y antigüedad (§6.2).
  const [dateFromInput, setDateFromInput] = useState('');
  const [dateToInput, setDateToInput] = useState('');
  const [dateFrom, setDateFrom] = useState<string | undefined>(undefined);
  const [dateTo, setDateTo] = useState<string | undefined>(undefined);

  const datesValid =
    (!dateFromInput || DATE_RE.test(dateFromInput)) &&
    (!dateToInput || DATE_RE.test(dateToInput)) &&
    (!dateFromInput || !dateToInput || dateFromInput <= dateToInput);
  const datesDirty = dateFromInput !== (dateFrom ?? '') || dateToInput !== (dateTo ?? '');

  // ── Drill-down Por proveedor → Detalles (misión FASE 5/6) ──
  const [supplierDrill, setSupplierDrill] = useState<string | null>(null);

  const applyDates = () => {
    if (!datesValid) return;
    setDateFrom(dateFromInput || undefined);
    setDateTo(dateToInput || undefined);
  };
  const clearDates = () => {
    setDateFromInput('');
    setDateToInput('');
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  const { data, totals, kpis, summary, meta, count, loading, error, refetch } = useAccountsPayable({
    tab,
    category,
    // CP-FIN-004: el filtro 'zelle' (Transf. Exterior) consulta ambos valores
    // (canónico external_transfer + heredado) — el hook expande el alias.
    method: (methodFilter || undefined) as 'cash' | 'transfer' | 'zelle' | 'external_transfer' | undefined,
    currency: currencyFilter || undefined,
    search: searchQuery || undefined,
    supplier: supplierDrill ?? undefined,
    dateFrom,
    dateTo,
    mode: viewMode,
  });

  // El hook ya reporta loading durante la ventana de carrera (stale) — la
  // guarda de FORMA aquí es defensa en profundidad: nunca renderizar la tabla
  // agrupada con filas sin .aging (crash original de «volver a Por proveedor»).
  const groupedRows = useMemo(() => {
    if (viewMode !== 'grouped') return null;
    const rows = (data as unknown as GroupedPayable[]) ?? [];
    return rows.length > 0 && typeof rows[0].aging === 'object' && rows[0].aging !== null ? rows : null;
  }, [data, viewMode]);
  const listRows = useMemo(() => {
    if (viewMode !== 'list') return null;
    const rows = (data as unknown as UnifiedPayable[]) ?? [];
    return rows.length > 0 && typeof rows[0].ref_type === 'string' ? rows : null;
  }, [data, viewMode]);

  const handleExport = async () => {
    if (!user?.activeStoreId) return;
    setExporting(true);
    try {
      const token = useAuthStore.getState().token;
      const qp = new URLSearchParams({ store_id: user.activeStoreId });
      if (dateFrom) qp.set('date_from', dateFrom);
      if (dateTo) qp.set('date_to', dateTo);
      const response = await fetch(`/api/accounts-payable/export?${qp.toString()}`, {
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
      a.download = `cuentas_por_pagar_${(dateTo || new Date().toISOString().slice(0, 10))}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      // CP-UX-FINAL-POLISH-003 §3.1: aviso propio (antes alert() nativo). Sin
      // await: el finally libera `exporting` de inmediato y no bloquea la UI.
      dialogs.alert({ title: 'Error al exportar', message: e.message, variant: 'error' });
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
    const payableItems = items.filter(p => !p.is_settled);
    if (selectedIds.size === payableItems.length && payableItems.length > 0) {
      setSelectedIds(new Set());
      setShowBulkBar(false);
    } else {
      setSelectedIds(new Set(payableItems.map(p => p.id)));
      setShowBulkBar(true);
    }
  };

  // CP-OPS-ENERVIDA §6: liquidación múltiple EXPLÍCITA — el botón de estados
  // en bloque se sustituyó por un flujo contable verificable: panel por
  // documento con importe total/parcial, un método y una moneda por lote,
  // lote ATÓMICO e idempotente (/api/payments/multi).
  const [liquidationOpen, setLiquidationOpen] = useState(false);
  const liquidationItems: LiquidationItem[] = useMemo(() => {
    const listData = listRows ?? [];
    return listData
      .filter(p => selectedIds.has(p.id) && !p.is_settled && p.balance_cup > 0)
      .map(p => ({
        id: p.id,
        ref_type: p.ref_type as 'receipt' | 'service',
        ref_id: p.ref_id,
        supplier: p.supplier,
        reference: p.reference || '',
        balance: p.balance_cup ?? p.balance,
        currency: p.currency,
      }));
  }, [listRows, selectedIds]);
  const selectedTotalPending = liquidationItems.reduce((s, it) => s + it.balance, 0);

  const openLiquidation = () => {
    const listData = listRows ?? [];
    const invalid = listData.filter(p => selectedIds.has(p.id) && (p.is_settled || p.ref_type === 'commission'));
    if (invalid.length > 0) {
      // CP-UX-FINAL-POLISH-003 §3.1: aviso propio (antes alert() nativo). El
      // flujo termina aquí igual que antes (return) sin bloquear la UI.
      dialogs.alert({
        title: 'Selección inválida para liquidar',
        message: `${invalid.length} documento(s) seleccionado(s) ya están pagados o son comisiones (flujo propio) — desmárcalos para liquidar.`,
        variant: 'warning',
      });
      return;
    }
    if (liquidationItems.length === 0) return;
    setLiquidationOpen(true);
  };

  const closeBulk = () => { setSelectedIds(new Set()); setShowBulkBar(false); };

  // Navegación interna (misión FASE 5): Por proveedor → Detalles → Por proveedor
  // sin recargar, preservando sucursal, filtros, fechas y categoría.
  const openSupplierDetails = (supplier: string) => {
    setSelectedIds(new Set());
    setShowBulkBar(false);
    setSupplierDrill(supplier);
    setViewMode('list');
  };
  const backToSuppliers = () => {
    setSelectedIds(new Set());
    setShowBulkBar(false);
    setSupplierDrill(null);
    setViewMode('grouped');
  };
  const switchViewMode = (mode: 'grouped' | 'list') => {
    if (mode === 'grouped') setSupplierDrill(null); // la vista agrupada es global
    setViewMode(mode);
  };

  const periodActive = Boolean(dateFrom || dateTo);
  const historical = Boolean(dateTo);

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-tight">Cuentas por Pagar</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Antigüedad de saldos: recepciones, servicios recibidos y comisiones
          </p>
        </div>

        {/* View mode toggle + Export */}
        <div className="flex items-center gap-2">
          {supplierDrill && (
            <button
              onClick={backToSuppliers}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/40 text-[10px] font-black uppercase hover:bg-muted"
              data-testid="cxp-volver-proveedores"
              title="Volver a la vista Por proveedor"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Por proveedor
            </button>
          )}
          <div className="flex rounded-lg border border-border/40 overflow-hidden">
            <button
              onClick={() => switchViewMode('grouped')}
              className={cn(
                "px-3 py-1.5 text-[10px] font-black uppercase flex items-center gap-1.5",
                viewMode === 'grouped' ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              <Table2 className="w-3.5 h-3.5" /> Por Proveedor
            </button>
            <button
              onClick={() => switchViewMode('list')}
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

      {/* Banner de fecha de corte (misión §6.2: la antigüedad corresponde al
          corte seleccionado y debe verse en pantalla) */}
      <div className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2 text-xs",
        historical ? "border-primary/40 bg-primary/5" : "border-border/40 bg-muted/20"
      )} data-testid="cxp-corte-banner">
        <span className="flex items-center gap-1.5 font-black uppercase text-[10px] text-muted-foreground">
          <Calendar className="w-3.5 h-3.5" /> Corte
        </span>
        <span className="font-mono font-bold tabular-nums">{fmtDay(meta?.cutoff)}</span>
        {periodActive && (
          <span className="text-muted-foreground">
            Período de documentos: <span className="font-mono tabular-nums">{dateFrom ? fmtDay(dateFrom) : 'inicio'}</span> → <span className="font-mono tabular-nums">{dateTo ? fmtDay(dateTo) : 'hoy'}</span>
          </span>
        )}
        {historical && (
          <span className="text-[10px] font-black uppercase text-primary">
            Vista histórica — pagos posteriores al corte no se contabilizan
          </span>
        )}
        {!historical && (
          <span className="text-[10px] text-muted-foreground">
            Saldo y antigüedad calculados a esta fecha (pagos aplicados hasta el corte)
          </span>
        )}
      </div>

      {/* KPI Cards — conciliados: Pagado = Σ pagos aplicados a las obligaciones
          incluidas (misma base que la columna «Pagado» de Por proveedor). */}
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
          <p className="text-[9px] text-muted-foreground mt-0.5">
            Aplicado a las obligaciones en vista
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

      {/* Filters: fechas personalizadas + categoría + método/moneda + búsqueda */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Filtro por fechas (misión FASE 4) */}
        <div className={cn(
          "flex flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5",
          datesValid ? "border-border/40" : "border-destructive/60 bg-destructive/5"
        )} data-testid="cxp-filtro-fechas">
          <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            type="date"
            aria-label="Fecha inicial del período de documentos"
            value={dateFromInput}
            max={dateToInput || undefined}
            onChange={(e) => setDateFromInput(e.target.value)}
            className="px-1.5 py-1 rounded border border-border/40 bg-background text-xs outline-none focus:ring-2 focus:ring-primary/30"
          />
          <span className="text-muted-foreground text-xs">→</span>
          <input
            type="date"
            aria-label="Fecha final del período (fecha de corte)"
            value={dateToInput}
            min={dateFromInput || undefined}
            onChange={(e) => setDateToInput(e.target.value)}
            className="px-1.5 py-1 rounded border border-border/40 bg-background text-xs outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            onClick={applyDates}
            disabled={!datesValid || !datesDirty}
            className="px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-[10px] font-black uppercase hover:bg-primary/90 disabled:opacity-50"
            data-testid="cxp-fechas-aplicar"
          >
            Aplicar
          </button>
          <button
            onClick={clearDates}
            disabled={!dateFrom && !dateTo}
            className="px-2.5 py-1 rounded-lg border border-border/40 text-[10px] font-black uppercase hover:bg-muted disabled:opacity-50"
            data-testid="cxp-fechas-limpiar"
          >
            Limpiar
          </button>
          {!datesValid && (
            <span className="text-[10px] font-bold text-destructive">Inicial &gt; final</span>
          )}
        </div>

        {/* Categoría (misión §6.3) */}
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as PayableCategory)}
          aria-label="Categoría de documentos"
          className="px-3 py-2 rounded-lg border border-border/40 bg-background text-xs outline-none focus:ring-2 focus:ring-primary/30"
        >
          {CATEGORY_FILTERS.map(c => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>

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
          aria-label="Método de pago"
          className="px-3 py-2 rounded-lg border border-border/40 bg-background text-xs outline-none focus:ring-2 focus:ring-primary/30"
        >
          {METHOD_FILTERS.map(m => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>

        <select
          value={currencyFilter}
          onChange={(e) => setCurrencyFilter(e.target.value)}
          aria-label="Moneda del documento"
          className="px-3 py-2 rounded-lg border border-border/40 bg-background text-xs outline-none focus:ring-2 focus:ring-primary/30"
        >
          {CURRENCY_FILTERS.map(c => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </div>

      {/* Chip de proveedor en drill-down */}
      {supplierDrill && viewMode === 'list' && (
        <div className="flex items-center gap-2" data-testid="cxp-chip-proveedor">
          <span className="flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/5 px-3 py-1 text-xs font-bold">
            <User className="w-3 h-3" /> {supplierDrill}
            <button
              onClick={backToSuppliers}
              aria-label="Quitar filtro de proveedor"
              className="ml-1 text-muted-foreground hover:text-destructive"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
          <span className="text-[10px] text-muted-foreground uppercase font-black">
            Detalles del proveedor
          </span>
        </div>
      )}

      {/* Content — estados canónicos cargando/vacío/error vía StateRenderer (CP-CI-006 U1).
          El hook mantiene loading=true durante la ventana de carrera (stale):
          nunca se renderiza una tabla con datos del otro modo. */}
      <StateRenderer
        isLoading={loading}
        error={error ? new Error(error) : null}
        onRetry={refetch}
        data={(groupedRows ?? listRows ?? []) as UnifiedPayable[]}
        emptyComponent={
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-center text-muted-foreground bg-muted/20 border border-border rounded-2xl">
            <Wallet className="w-8 h-8 opacity-30 mb-1" />
            <p className="text-sm">
              {viewMode === 'grouped' ? 'No hay cuentas por pagar en esta categoría' : 'No hay documentos en esta categoría'}
            </p>
          </div>
        }
      >
        {() =>
          viewMode === 'grouped' ? (
            <GroupedTableView
              data={groupedRows ?? []}
              totals={totals}
              onSupplierClick={openSupplierDetails}
            />
          ) : (
            <ListView
              data={listRows ?? []}
              onPay={(doc) => setPaymentModalDoc(doc)}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onToggleSelectAll={toggleSelectAll}
            />
          )
        }
      </StateRenderer>

      {/* Bulk action bar — CP-OPS-ENERVIDA §6.1: contador + total pendiente
          seleccionado + acción «Liquidar seleccionadas» (flujo detallado). */}
      {showBulkBar && viewMode === 'list' && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-background border border-border/40 rounded-2xl shadow-2xl p-3 flex items-center gap-3" data-testid="cxp-bulk-bar">
          <span className="text-xs font-black uppercase">
            {liquidationItems.length} seleccionado(s)
          </span>
          <span className="text-xs text-muted-foreground">
            Pendiente: <span className="font-mono font-bold tabular-nums">{formatCurrency(selectedTotalPending)}</span>
          </span>
          <button
            onClick={openLiquidation}
            disabled={liquidationItems.length === 0}
            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[10px] font-black uppercase hover:bg-primary/90 disabled:opacity-50"
            data-testid="cxp-liquidar-seleccionadas"
          >
            Liquidar seleccionadas
          </button>
          <button
            onClick={closeBulk}
            className="px-2 py-1.5 rounded-lg border border-border/40 text-[10px] font-black uppercase hover:bg-muted"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Panel de liquidación múltiple (§6.2/§6.3) */}
      <LiquidationModal
        open={liquidationOpen}
        onClose={() => setLiquidationOpen(false)}
        items={liquidationItems}
        onSettled={() => { closeBulk(); refetch(); }}
      />

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
// CP-AP-FORENSIC-RECONCILIATION-001: incluye documentos totalmente pagados
// (saldo 0) para que Total − Pagado = Saldo sea verificable por fila y global;
// cada proveedor abre sus Detalles (drill-down) preservando los filtros.
// ═════════════════════════════════════════════════════════════════
function GroupedTableView({
  data,
  totals,
  onSupplierClick,
}: {
  data: GroupedPayable[];
  totals: any;
  onSupplierClick?: (supplier: string) => void;
}) {
  // Estado vacío canónico manejado por StateRenderer en la vista madre (CP-CI-006 U1)
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
            <tr
              key={idx}
              onClick={onSupplierClick ? () => onSupplierClick(row.supplier) : undefined}
              className={cn(
                "border-t border-border/20 hover:bg-muted/10",
                onSupplierClick && "cursor-pointer"
              )}
              title={onSupplierClick ? `Ver detalles de ${row.supplier}` : undefined}
              data-testid="cxp-fila-proveedor"
            >
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
              <td className={cn(cellClass(row.aging.upcoming7 || 0), row.aging.upcoming7 > 0 && "text-amber-500")}>{fmt(row.aging.upcoming7 || 0)}</td>
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
              <td className={cn(cellClass(totals.aging.upcoming7 || 0), totals.aging.upcoming7 > 0 && "text-amber-500")}>{fmt(totals.aging.upcoming7 || 0)}</td>
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
// LIST VIEW — detalle por documento (misión FASE 6: cada importe
// verificable — original, aplicado, saldo, vencimiento y estado a corte)
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
  // Estado vacío canónico manejado por StateRenderer en la vista madre (CP-CI-006 U1)
  const payableItems = data.filter(p => !p.is_settled);
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
            <th className="p-3 text-center">Fecha doc.</th>
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
                  {!p.is_settled && (
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
                  <p className="font-bold text-xs">{p.supplier}</p>
                  <p className="text-[10px] text-muted-foreground">{p.reference || 'Sin ref'}</p>
                </td>
                <td className="p-3 text-center text-xs">
                  {p.ref_type === 'receipt' ? '📦 Recepción' : p.ref_type === 'service' ? '🔧 Servicio' : '👤 Comisión'}
                </td>
                <td className="p-3 text-center text-xs text-muted-foreground">
                  {p.doc_date ?? '—'}
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
                  <p className={cn("font-mono font-black tabular-nums text-xs", p.is_settled ? "text-muted-foreground" : "text-primary")}>
                    {formatCurrency(Math.max(0, p.balance_cup), 'CUP')}
                  </p>
                  {p.currency !== 'CUP' && p.balance_cup > 0 && (
                    <p className="text-[9px] text-muted-foreground font-mono">{formatCurrency(p.balance, p.currency)}</p>
                  )}
                </td>
                <td className="p-3 text-center">
                  {p.due_date ? (
                    <div>
                      <p className={cn("text-xs font-bold", p.is_overdue ? "text-destructive" : "")}>
                        {fmtDay(p.due_date)}
                      </p>
                      {!p.is_settled && p.days_until_due !== null && (
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
                    {!p.is_settled && (
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
                      totalCup={p.total_cup}
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
