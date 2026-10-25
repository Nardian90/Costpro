'use client';

/**
 * IngresosEgresosView — MISIÓN INGRESOS/EGRESOS DE CAJA (2026-10-20).
 *
 * Centro documental y operativo del dinero que ENTRA o SALE físicamente de
 * la caja de la tienda: constitución, reposición y devolución (total/parcial)
 * del fondo de cambio, y otros ingresos/egresos autorizados.
 *
 * NO confundir con: ventas, cobros, devoluciones comerciales, gastos de
 * proveedores, comisiones ni transferencias de stock — cada uno tiene su
 * módulo y su efecto contable propio; este módulo toca UNA vez el ledger
 * (payment_transactions ref_type='cash_flow').
 *
 * Estructura (patrones de ValesSalidaView/SalesHistoryView — casa):
 *   · Encabezado con tienda + estado del turno de caja + acción principal.
 *   · KPIs del RPC get_cash_flow_summary (saldo de caja, fondo vigente,
 *     ingresos/egresos del período por moneda, anulados).
 *   · Filtros: búsqueda, tipo, motivo, estado, moneda, rango de fechas
 *     operativas y responsable + limpiar filtros.
 *   · DOS modos (tarjetas/tabla) con persistencia, tabla densa ordenable.
 *   · Paginación numerada con tamaño de página (coherente con historial).
 *   · Modales: registro (2 pasos), detalle (comprobante imprimible) y
 *     anulación (motivo obligatorio ≥ 3).
 *
 * Autorización: RLS acota las filas por tienda; los roles espejan los RPC
 * (registrar: admin/manager/encargado/clerk · anular: admin/manager/encargado).
 * La base de datos sigue siendo la última barrera.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus, Search, Loader2, Eye, RefreshCcw, LayoutList, List, AlertTriangle,
  ArrowDownToLine, ArrowUpFromLine, Ban, Wallet, Coins, Landmark, FileText,
  ChevronLeft, ChevronRight, XCircle, History, Scale,
} from 'lucide-react';
import { cn, formatCurrency, formatDate, formatTime, touch } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { useUIStore } from '@/store';
import {
  useCashFlowDocuments, useCashFlowSummary, type CashFlowFilters,
} from '@/hooks/api/useCashFlow';
import { useActiveShift } from '@/hooks/api/useActiveShift';
import {
  CASH_FLOW_CONCEPTS, conceptLabel, conceptShortLabel, isFondoConcept,
} from '@/lib/cash-flow/constants';
import type { CashFlowDocument } from '@/types';
import { Button } from '@/components/ui/button';
import { CashFlowCreateModal } from './CashFlowCreateModal';
import { CashFlowDetailModal } from './CashFlowDetailModal';
import { CashFlowReverseModal } from './CashFlowReverseModal';
import CashLedgerPanel from './CashLedgerPanel';
import { useCashCurrencySummary } from '@/hooks/api/useCashLedger';
import { todayBusinessDay } from '@/lib/cash-report/period-attribution';

 type ViewMode = 'cards' | 'table';
type TypeFilter = 'all' | 'ingreso' | 'egreso';
type StatusFilter = 'all' | 'confirmado' | 'anulado';
type CurrencyFilter = 'all' | 'CUP' | 'USD';
type SortKey = 'operation_date' | 'amount' | 'document_number';
/** MISIÓN AUDITORÍA CAJA (2026-10-24) §Fase 2: pestañas del módulo. */
type SectionTab = 'documentos' | 'libro';

const VIEW_MODE_KEY = 'cash_flow_view_mode';
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;

const CREATE_ROLES = ['admin', 'manager', 'encargado', 'clerk'];
const ANNUL_ROLES = ['admin', 'manager', 'encargado'];

export default function IngresosEgresosView() {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId;
  const setCurrentView = useUIStore(s => s.setCurrentView);

  const canCreate = user?.roles?.some(r => CREATE_ROLES.includes(r)) ?? false;
  const canAnnul = user?.roles?.some(r => ANNUL_ROLES.includes(r)) ?? false;

  const storeName = useMemo(() => {
    const m = user?.memberships?.find(mem => mem.store_id === storeId);
    return (m?.store as { name?: string } | null | undefined)?.name ?? null;
  }, [user, storeId]);

  // ── Modo de visualización persistido ──
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'cards';
    return window.localStorage.getItem(VIEW_MODE_KEY) === 'table' ? 'table' : 'cards';
  });
  useEffect(() => {
    try { window.localStorage.setItem(VIEW_MODE_KEY, viewMode); } catch { /* SSR/private */ }
  }, [viewMode]);

  // ── MISIÓN AUDITORÍA CAJA (2026-10-24) §Fase 2: pestañas reales ──
  // El bloque «Movimientos que explican el saldo» deja de ser un acordeón y
  // pasa a ser una pestaña de navegación. Ambos paneles permanecen MONTADOS
  // (el inactivo se oculta con `hidden`) para conservar filtros, fechas y
  // datos de formulario no enviados al alternar — sin remontar ni duplicar
  // solicitudes (react-query mantiene la caché por clave).
  const [activeTab, setActiveTab] = useState<SectionTab>('documentos');

  // ── Filtros ──
  // MISIÓN AUDITORÍA CAJA (2026-10-24) §Fase 3: los selectores de fecha parten
  // de la FECHA ACTUAL de negocio (convención COSTPRO: America/Havana, vía
  // todayBusinessDay() — nunca una conversión UTC que cambie el día del
  // usuario). Se calculan UNA vez al montar: si el día gira con la vista
  // abierta, la selección inicial se conserva (estabilidad exigida §Fase 3.5:
  // la fecha no debe cambiar inesperadamente). El usuario puede ampliar el
  // rango libremente; «Limpiar filtros» restaura la fecha actual.
  const hoy = useState(() => todayBusinessDay())[0];
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [conceptFilter, setConceptFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [currencyFilter, setCurrencyFilter] = useState<CurrencyFilter>('all');
  const [responsibleFilter, setResponsibleFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>(hoy);
  const [dateTo, setDateTo] = useState<string>(hoy);
  const [sortKey, setSortKey] = useState<SortKey>('operation_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE;
    const saved = Number(window.localStorage.getItem('cash_flow_page_size'));
    return PAGE_SIZE_OPTIONS.includes(saved) ? saved : DEFAULT_PAGE_SIZE;
  });
  useEffect(() => {
    try { window.localStorage.setItem('cash_flow_page_size', String(pageSize)); } catch { /* noop */ }
  }, [pageSize]);

  const alternarOrden = useCallback((key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(key); setSortDir('desc'); }
  }, [sortKey]);

  // ── Modales ──
  const [createOpen, setCreateOpen] = useState(false);
  const [detalleDoc, setDetalleDoc] = useState<CashFlowDocument | null>(null);
  const [anularTarget, setAnularTarget] = useState<CashFlowDocument | null>(null);

  // ── Rango del período (para KPIs y filtros): fechas locales → ISO ──
  // Guard §Fase 3.6: intervalo invertido (Desde > Hasta) NO se aplica como
  // rango contable — se avisa igual que en CashReportView y las fechas quedan
  // como las dejó el usuario (sin reescritura silenciosa).
  const rangoInvalido = dateFrom !== '' && dateTo !== '' && dateFrom > dateTo;
  const periodFrom = dateFrom && !rangoInvalido ? new Date(dateFrom + 'T00:00:00').toISOString() : null;
  const periodTo = dateTo && !rangoInvalido ? new Date(dateTo + 'T23:59:59.999').toISOString() : null;

  const filters: CashFlowFilters = useMemo(() => ({
    search,
    docType: typeFilter,
    concept: conceptFilter,
    status: statusFilter,
    currency: currencyFilter,
    responsible: responsibleFilter,
    dateFrom: periodFrom,
    dateTo: periodTo,
    page,
    pageSize: pageSize + 1, // +1 para detectar página siguiente
    sortKey,
    sortDir,
  }), [search, typeFilter, conceptFilter, statusFilter, currencyFilter, responsibleFilter,
      periodFrom, periodTo, page, pageSize, sortKey, sortDir]);

  const query = useCashFlowDocuments(storeId, filters);
  const summaryQuery = useCashFlowSummary(storeId, periodFrom, periodTo);
  const activeShift = useActiveShift(storeId);
  // MISIÓN CAJA v2.24.0 (§9): libro físico por moneda — fuente de los saldos
  // físicos (CUP/USD separados) y de la validación de entregas sin turno.
  const currencySummary = useCashCurrencySummary(storeId);
  const saldoFisico = {
    CUP: currencySummary.data?.net?.CUP ?? null,
    USD: currencySummary.data?.net?.USD ?? null,
  };

  const docs = useMemo(() => query.data?.docs ?? [], [query.data]);
  const hasNextPage = query.data?.hasMore ?? false;

  // ── Búsqueda client-side sobre la página cargada (número, concepto,
  //    responsable, contraparte y observaciones — requisitos §5) ──
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return docs;
    return docs.filter(d =>
      d.document_number?.toLowerCase().includes(term)
      || conceptLabel(d.concept).toLowerCase().includes(term)
      || d.justification?.toLowerCase().includes(term)
      || d.notes?.toLowerCase().includes(term)
      || d.counterparty?.toLowerCase().includes(term)
      || d.responsible?.full_name?.toLowerCase().includes(term)
      || d.annulment_reason?.toLowerCase().includes(term)
    );
  }, [docs, search]);

  // Responsables vistos en la página (filtro por responsable)
  const responsables = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of docs) {
      if (d.responsible_user_id && d.responsible?.full_name) {
        map.set(d.responsible_user_id, d.responsible.full_name);
      }
    }
    return [...map.entries()];
  }, [docs]);

  const limpiarFiltros = useCallback(() => {
    setSearch(''); setTypeFilter('all'); setConceptFilter('all');
    setStatusFilter('all'); setCurrencyFilter('all'); setResponsibleFilter('all');
    // §Fase 3.4: restablecer devuelve al comportamiento predeterminado → la
    // fecha ACTUAL de negocio (no cadena vacía, no fecha fija de test).
    setDateFrom(hoy); setDateTo(hoy); setPage(1);
  }, [hoy]);

  // Filtros activos: los dates cuentan SOLO si difieren del predeterminado
  // (hoy → hoy). Así «Limpiar filtros» aparece cuando hay algo que restablecer.
  const hayFiltrosActivos = search.trim() !== '' || typeFilter !== 'all' || conceptFilter !== 'all'
    || statusFilter !== 'all' || currencyFilter !== 'all' || responsibleFilter !== 'all'
    || dateFrom !== hoy || dateTo !== hoy;

  const resumen = summaryQuery.data ?? null;
  const turnoAbierto = activeShift.data != null;
  const turnoCargando = activeShift.isLoading || summaryQuery.isLoading;

  // ── MISIÓN CONCILIACIÓN (2026-10-26) · Incidente A ──
  // Cuatro magnitudes con base contable DISTINTA (misión §3.2), nunca
  // intercambiables: (A) esperado canónico CUP — vista de VALOR de la fórmula
  // oficial de arqueo (cada movimiento a SU tasa histórica); (B)/(C) saldos
  // físicos CUP/USD — libro de BILLETES por moneda (get_cash_currency_summary);
  // (D) fondo de cambio vigente — mecanismo del RPC. La conciliación expone la
  // diferencia entre bases con su explicación; NO se fuerza la igualdad.
  const esperadoCanonico = resumen?.expected_cash ?? null;
  const fisicoCup = saldoFisico.CUP;
  const fisicoUsd = saldoFisico.USD;
  // Diferencia pendiente: esperado canónico − libros físicos. El USD físico NO
  // se convierte aquí (no existe una tasa única legítima para valorar billetes
  // ya entregados): la diferencia se presenta por separado y su explicación
  // documenta la causa (valorización a tasas históricas distintas).
  const diferenciaFisica = esperadoCanonico != null && fisicoCup != null
    ? esperadoCanonico - fisicoCup
    : null;
  const conciliado = diferenciaFisica != null && Math.abs(diferenciaFisica) < 0.005 && (fisicoUsd ?? 0) === 0;
  // Ventana del turno explícita: el esperado canónico se calcula sobre una
  // ventana (turno abierto → apertura; sin turno → desde el último cierre o
  // desde el origen). Sin turno abierto NO es «el saldo de un turno abierto».
  const ventanaTurno = resumen?.window_start
    ? new Date(resumen.window_start).toLocaleDateString('es-CU')
    : null;
  const hintVentana = resumen
    ? (resumen.has_pending_shift
        ? `Turno abierto · desde ${ventanaTurno}`
        : (ventanaTurno && resumen.window_start && new Date(resumen.window_start).getFullYear() > 1970
            ? `Sin turno abierto · acumulado desde el último cierre (${ventanaTurno})`
            : 'Sin turno abierto · acumulado histórico (sin cierres previos)'))
    : undefined;

  const totalPages = hasNextPage ? page + 1 : page;

  // ── Navegación por teclado de las pestañas (patrón WAI-ARIA Tabs,
  //    estética de CashReportView — módulo Caja) ──
  const TABS: Array<{ id: SectionTab; label: string; icon: React.ElementType }> = [
    { id: 'documentos', label: 'Ingresos / Egresos', icon: FileText },
    { id: 'libro', label: 'Movimientos que explican el saldo', icon: History },
  ];
  const onTablistKeyDown = useCallback((e: React.KeyboardEvent) => {
    const idx = TABS.findIndex(t => t.id === activeTab);
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = (idx + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    if (next != null) {
      e.preventDefault();
      const t = TABS[next];
      setActiveTab(t.id);
      document.getElementById(`ie-tab-${t.id}`)?.focus();
    }
  }, [activeTab]);

  const isLoading = query.isLoading;
  const queryError = query.error;

  return (
    <div className="space-y-4">
      {/* ── Encabezado + estado de sesión de caja ── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tight">Ingresos / Egresos de Caja</h2>
          <p className="text-xs text-muted-foreground">
            Entradas y salidas físicas de efectivo{storeName ? ` · ${storeName}` : ''} — fondo de cambio y otros movimientos autorizados
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setCreateOpen(true)}
          disabled={!canCreate || !storeId || activeShift.isLoading}
          title={!storeId
            ? 'Selecciona una tienda activa'
            : !turnoAbierto && !activeShift.isLoading
              ? 'Sin turno abierto: solo la ENTREGA de efectivo puede registrarse (rol admin/manager/encargado)'
              : canCreate
                ? 'Registrar un ingreso o egreso de efectivo'
                : 'No tienes permisos para registrar movimientos de caja'}
          className="h-10 px-4 rounded-xl text-xs font-black uppercase tracking-wide"
          aria-label="Registrar ingreso o egreso de caja"
        >
          <Plus className="w-4 h-4" /> Registrar Ingreso / Egreso
        </Button>
      </div>

      {/* ── Estado del turno (sesión de caja) ── */}
      <div className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border-2 px-4 py-3',
        turnoCargando ? 'border-border/60 bg-muted/20'
          : turnoAbierto ? 'border-success/30 bg-success/5'
          : 'border-warning/40 bg-warning/5',
      )} role="status" aria-live="polite">
        <span className={cn(
          'inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest',
          turnoCargando ? 'text-muted-foreground' : turnoAbierto ? 'text-success' : 'text-warning',
        )}>
          <span className={cn('w-2 h-2 rounded-full', turnoCargando ? 'bg-muted-foreground/50' : turnoAbierto ? 'bg-success' : 'bg-warning animate-pulse')} aria-hidden="true" />
          {turnoCargando ? 'Consultando caja…' : turnoAbierto ? 'Caja abierta' : 'Caja cerrada'}
        </span>
        {activeShift.data && (
          <span className="text-xs text-muted-foreground">
            Turno desde {formatDate(activeShift.data.created_at)} · {formatTime(activeShift.data.created_at)}
          </span>
        )}
        {resumen && (
          <span className="text-xs text-muted-foreground">
            Fondo inicial: <span className="font-bold tabular-nums">{formatCurrency(resumen.opening_balance)}</span>
          </span>
        )}
        {!turnoAbierto && !turnoCargando && (
          <span className="ml-auto text-xs font-bold text-warning">
            Sin turno: solo ENTREGA de efectivo autorizable (misión v2.24) ·
            <button
              type="button"
              onClick={() => setCurrentView('cash')}
              className="ml-1 underline underline-offset-4 hover:opacity-80 uppercase tracking-widest"
            >
              Abrir turno en Caja →
            </button>
          </span>
        )}
      </div>

      {/* ── MISIÓN AUDITORÍA CAJA (2026-10-24) §Fase 2: pestañas reales ──
          El acordeón «Movimientos que explican el saldo» se sustituye por un
          sistema de tabs (patrón del módulo Caja). Ambos paneles permanecen
          montados: el inactivo se oculta — filtros/fechas/scroll conservados. */}
      <div
        className="flex border-b border-border bg-card rounded-t-xl overflow-x-auto"
        role="tablist"
        aria-label="Secciones de Ingresos/Egresos de caja"
        onKeyDown={onTablistKeyDown}
      >
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`ie-tab-${id}`}
            aria-selected={activeTab === id}
            aria-controls={`ie-panel-${id}`}
            tabIndex={activeTab === id ? 0 : -1}
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex-1 py-2.5 px-3 text-[11px] sm:text-xs font-black uppercase tracking-widest transition-colors border-b-2 -mb-px flex items-center justify-center gap-1.5 min-h-[44px] whitespace-nowrap',
              activeTab === id
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30',
            )}
          >
            <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      {/* ── Panel: Documentos (pestaña Ingresos/Egresos) ── */}
      <div
        role="tabpanel"
        id="ie-panel-documentos"
        aria-labelledby="ie-tab-documentos"
        hidden={activeTab !== 'documentos'}
        className={cn(activeTab === 'documentos' ? 'space-y-4' : '')}
      >
      {/* ── KPIs (RPC get_cash_flow_summary — una sola fuente) ── */}
      {/* MISIÓN CONCILIACIÓN (2026-10-26): período EXPLÍCITO e inequívoco — el
          intervalo de negocio America/Havana con estado «abierto hasta ahora»
          cuando llega al día actual (nunca una flecha que sugiera filtro sin
          configurar). Los subtotales de ingresos/egresos corresponden SOLO a
          este intervalo; los indicadores de saldo no cambian de significado. */}
      <div
        className="flex items-center justify-between gap-2 flex-wrap text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
        data-testid="periodo-banner"
      >
        <span>
          Período: {dateFrom && dateTo && !rangoInvalido ? `${formatDate(periodFrom)} → ${formatDate(periodTo)}` : 'Sin rango válido'}
          <span className="normal-case font-medium"> · día de negocio (America/Havana)</span>
          {dateTo === hoy && dateTo >= dateFrom && !rangoInvalido && (
            <span className="ml-1 normal-case font-black text-primary">· abierto hasta ahora</span>
          )}
        </span>
        <span className={cn(rangoInvalido && 'text-destructive')}>
          {rangoInvalido ? 'Rango invertido — no aplicado' : `Subtotales del período únicamente`}
        </span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        <KpiCard
          icon={<Landmark className="w-4 h-4" />}
          label="Efectivo esperado (CUP canónico)"
          value={resumen ? formatCurrency(resumen.expected_cash) : '—'}
          tone="primary"
          hint={resumen ? `Valor contable según fórmula de arqueo (cada movimiento a su tasa histórica) · ${hintVentana}` : undefined}
        />
        {/* MISIÓN CAJA v2.24.0 (§9): saldos físicos por moneda separados — no se
            suman al canónico como si fueran unidades iguales */}
        <KpiCard
          icon={<Coins className="w-4 h-4" />}
          label="Saldo físico CUP"
          value={saldoFisico.CUP != null ? formatCurrency(saldoFisico.CUP) : '—'}
          tone="primary"
          hint="Libro físico de billetes CUP (movimientos persistidos)"
        />
        <KpiCard
          icon={<Coins className="w-4 h-4" />}
          label="Saldo físico USD"
          value={saldoFisico.USD != null ? formatCurrency(saldoFisico.USD, 'USD') : '—'}
          tone="warning"
          hint="Libro físico de billetes USD (movimientos persistidos)"
        />
        <KpiCard
          icon={<Coins className="w-4 h-4" />}
          label="Fondo de cambio vigente"
          value={resumen ? formatCurrency(resumen.fondo_vigente) : '—'}
          tone="warning"
          hint={resumen && resumen.has_pending_shift
            ? `Ingresado ${formatCurrency(resumen.fondo_ingresado)} · devuelto ${formatCurrency(resumen.fondo_devuelto)}`
            : 'Sin turno abierto'}
        />
        <KpiCard
          icon={<ArrowDownToLine className="w-4 h-4" />}
          label="Ingresos del período"
          value={resumen ? formatCurrency(resumen.period.in_cup) : '—'}
          extra={resumen && resumen.period.in_usd > 0 ? `${resumen.period.in_usd.toFixed(2)} USD` : undefined}
          tone="success"
          hint={resumen ? `${resumen.period.ingresos_count} documento(s)` : undefined}
        />
        <KpiCard
          icon={<ArrowUpFromLine className="w-4 h-4" />}
          label="Egresos del período"
          value={resumen ? formatCurrency(resumen.period.out_cup) : '—'}
          extra={resumen && resumen.period.out_usd > 0 ? `${resumen.period.out_usd.toFixed(2)} USD` : undefined}
          tone="destructive"
          hint={resumen ? `${resumen.period.egresos_count} documento(s)` : undefined}
        />
        <KpiCard
          icon={<Ban className="w-4 h-4" />}
          label="Anulados del período"
          value={resumen ? String(resumen.period.annulled_count) : '—'}
          tone="muted"
          hint={resumen ? `Período: ${formatDate(resumen.period.from)} → ${formatDate(resumen.period.to)}` : undefined}
        />
      </div>

      {/* ── MISIÓN CONCILIACIÓN (2026-10-26) · Incidente A ──
          Conciliación del esperado canónico con el libro físico por moneda.
          Magnitudes distintas POR DISEÑO (valor contable vs billetes): la
          diferencia se muestra con importes y explicación accesible; solo se
          declara «Conciliado» cuando la igualdad corresponde a la misma base,
          moneda y ventana. Nunca se presenta el esperado canónico como
          billetes físicamente disponibles sin respaldo del libro. */}
      <section
        aria-label="Conciliación con el libro físico"
        data-testid="conciliacion-fisica"
        className={cn(
          'rounded-2xl border p-4',
          conciliado ? 'border-success/30 bg-success/5' : 'border-warning/40 bg-warning/5',
        )}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
          <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-1.5">
            <Scale className="w-4 h-4" aria-hidden="true" />
            Conciliación con el libro físico
          </h3>
          <span
            className={cn(
              'text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full',
              conciliado ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
            )}
            data-testid="conciliacion-estado"
          >
            {diferenciaFisica == null ? 'Cargando libro físico…' : conciliado ? 'Conciliado' : 'Diferencia pendiente de conciliación'}
          </span>
        </div>
        {diferenciaFisica != null ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Esperado canónico (CUP)</div>
                <div className="text-sm font-black tabular-nums">{formatCurrency(esperadoCanonico ?? 0)}</div>
                <div className="text-[9px] text-muted-foreground/80">Fórmula de arqueo · valor contable</div>
              </div>
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Físico CUP</div>
                <div className="text-sm font-black tabular-nums">{formatCurrency(fisicoCup ?? 0)}</div>
                <div className="text-[9px] text-muted-foreground/80">Libro de billetes CUP</div>
              </div>
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Físico USD</div>
                <div className="text-sm font-black tabular-nums">{fisicoUsd != null ? `${fisicoUsd.toFixed(2)} USD` : '—'}</div>
                <div className="text-[9px] text-muted-foreground/80">Libro de billetes USD</div>
              </div>
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Diferencia</div>
                <div className={cn('text-sm font-black tabular-nums', conciliado ? 'text-success' : 'text-warning')}>
                  {formatCurrency(diferenciaFisica)}
                </div>
                <div className="text-[9px] text-muted-foreground/80">Esperado − físico CUP</div>
              </div>
            </div>
            {!conciliado && (
              <p className="text-[11px] leading-relaxed text-muted-foreground mt-2" data-testid="conciliacion-explicacion">
                El esperado canónico es una <strong>vista de valor</strong> (cada cobro y cada entrega se valora a la tasa
                histórica de su propia operación), mientras el libro físico cuenta <strong>billetes por moneda</strong>.
                Una diferencia puede surgir cuando los mismos billetes USD entran valorizados a la tasa de la venta y
                salen (entrega) valorizados a la tasa vigente del documento de caja: el residuo en CUP no respalda
                billetes físicos. Verifica los movimientos en la pestaña «Movimientos que explican el saldo».
              </p>
            )}
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground">Esperando el libro físico por moneda…</p>
        )}
      </section>

      {/* ── MISIÓN CAJA v2.24.0 (§7): movimientos que explican el saldo ──
          Ahora pestaña dedicada (antes acordeón). Ver panel abajo. */}

      {/* ── Filtros y búsqueda ── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar por número, concepto, responsable, contraparte u observaciones…"
              aria-label="Buscar movimientos de caja"
              className={cn('w-full pl-10 pr-4 rounded-xl border border-border bg-background text-sm', touch)}
            />
          </div>
          <select
            value={typeFilter}
            onChange={e => { setTypeFilter(e.target.value as TypeFilter); setConceptFilter('all'); setPage(1); }}
            className={cn('px-3 rounded-xl border border-border bg-background text-xs font-bold uppercase', touch)}
            aria-label="Filtrar por tipo"
          >
            <option value="all">Todos los tipos</option>
            <option value="ingreso">Ingresos</option>
            <option value="egreso">Egresos</option>
          </select>
          <select
            value={conceptFilter}
            onChange={e => { setConceptFilter(e.target.value); setPage(1); }}
            className={cn('px-3 rounded-xl border border-border bg-background text-xs font-bold uppercase', touch)}
            aria-label="Filtrar por motivo"
          >
            <option value="all">Todos los motivos</option>
            {CASH_FLOW_CONCEPTS
              .filter(c => typeFilter === 'all' || c.docType === typeFilter)
              .map(c => <option key={c.value} value={c.value}>{c.shortLabel}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value as StatusFilter); setPage(1); }}
            className={cn('px-3 rounded-xl border border-border bg-background text-xs font-bold uppercase', touch)}
            aria-label="Filtrar por estado"
          >
            <option value="all">Todos los estados</option>
            <option value="confirmado">Confirmados</option>
            <option value="anulado">Anulados</option>
          </select>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={currencyFilter}
            onChange={e => { setCurrencyFilter(e.target.value as CurrencyFilter); setPage(1); }}
            className={cn('px-3 rounded-xl border border-border bg-background text-xs font-bold uppercase', touch)}
            aria-label="Filtrar por moneda"
          >
            <option value="all">Todas las monedas</option>
            <option value="CUP">CUP</option>
            <option value="USD">USD</option>
          </select>
          {responsables.length > 0 && (
            <select
              value={responsibleFilter}
              onChange={e => { setResponsibleFilter(e.target.value); setPage(1); }}
              className={cn('px-3 rounded-xl border border-border bg-background text-xs font-bold uppercase', touch)}
              aria-label="Filtrar por responsable"
            >
              <option value="all">Todos los responsables</option>
              {responsables.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          )}
          <label className={cn('inline-flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground', touch)}>
            <span className="sr-only sm:not-sr-only">Desde</span>
            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={e => { setDateFrom(e.target.value); setPage(1); }}
              aria-label="Fecha operativa desde"
              aria-invalid={rangoInvalido || undefined}
              className="px-2 py-1.5 rounded-lg border border-border bg-background"
            />
          </label>
          <label className={cn('inline-flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground', touch)}>
            <span className="sr-only sm:not-sr-only">Hasta</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={e => { setDateTo(e.target.value); setPage(1); }}
              aria-label="Fecha operativa hasta"
              aria-invalid={rangoInvalido || undefined}
              className="px-2 py-1.5 rounded-lg border border-border bg-background"
            />
          </label>
          {rangoInvalido && (
            <p role="alert" className="w-full text-[11px] text-destructive flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" /> El intervalo es inválido: «Desde» no puede ser posterior a «Hasta».
            </p>
          )}
          {hayFiltrosActivos && (
            <Button
              type="button"
              variant="outline"
              onClick={limpiarFiltros}
              className="h-9 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest"
              aria-label="Limpiar filtros y restaurar vista predeterminada"
            >
              <XCircle className="w-3.5 h-3.5" /> Limpiar filtros
            </Button>
          )}
          <div className="flex items-center rounded-xl border border-border overflow-hidden ml-auto" role="group" aria-label="Modo de visualización">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              aria-pressed={viewMode === 'cards'}
              title="Ver como tarjetas"
              aria-label="Modo tarjetas"
              className={cn('px-3 py-2 inline-flex items-center gap-1.5 text-xs font-black uppercase transition-colors', viewMode === 'cards' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
            >
              <LayoutList className="w-4 h-4" aria-hidden="true" />
              <span className="hidden md:inline">Tarjetas</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              aria-pressed={viewMode === 'table'}
              title="Ver como tabla"
              aria-label="Modo tabla"
              className={cn('px-3 py-2 inline-flex items-center gap-1.5 text-xs font-black uppercase transition-colors border-l border-border', viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
            >
              <List className="w-4 h-4" aria-hidden="true" />
              <span className="hidden md:inline">Tabla</span>
            </button>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => { query.refetch(); summaryQuery.refetch(); }}
            className="h-10 w-10 p-2 rounded-xl"
            aria-label="Recargar movimientos"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* ── Contenido: estados + dos modos ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20" role="status" aria-label="Cargando movimientos">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : queryError ? (
        <div className="text-center py-20">
          <AlertTriangle className="w-10 h-10 text-destructive/60 mx-auto mb-3" aria-hidden="true" />
          <p className="text-sm font-bold text-destructive">No se pudieron cargar los movimientos</p>
          <p className="text-xs text-muted-foreground mt-1">{String((queryError as Error)?.message || queryError)}</p>
          <Button type="button" variant="outline" className="mt-4" onClick={() => query.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : !storeId ? (
        <div className="text-center py-20">
          <Wallet className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-bold text-muted-foreground">Sin tienda activa</p>
          <p className="text-xs text-muted-foreground mt-1">
            Selecciona una tienda para consultar sus ingresos y egresos de caja
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-bold text-muted-foreground">
            {docs.length === 0 && !hayFiltrosActivos
              ? 'Aún no hay ingresos ni egresos en esta tienda'
              : 'Ningún documento coincide con los filtros'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {docs.length === 0 && !hayFiltrosActivos
              ? 'Registra el dinero entregado para el fondo de cambio con «Registrar Ingreso / Egreso»'
              : 'Prueba con otro término o limpia los filtros'}
          </p>
        </div>
      ) : viewMode === 'table' ? (
        <TablaMovimientos
          docs={filtered}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={alternarOrden}
          canAnnul={canAnnul}
          onVer={setDetalleDoc}
          onAnular={setAnularTarget}
        />
      ) : (
        <div className="grid gap-2">
          {filtered.map(d => (
            <TarjetaMovimiento
              key={d.id}
              doc={d}
              canAnnul={canAnnul}
              onVer={setDetalleDoc}
              onAnular={setAnularTarget}
            />
          ))}
        </div>
      )}

      {/* ── Paginación numerada (coherente con Historial de Ventas) ── */}
      {!isLoading && !queryError && storeId && filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            Mostrando {filtered.length} documento(s) · página {page}{hasNextPage ? ` de ${totalPages}+` : ''}
          </span>
          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="px-2 py-1.5 rounded-lg border border-border bg-background text-[10px] font-bold uppercase"
              aria-label="Tamaño de página"
            >
              {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n} / pág.</option>)}
            </select>
            <Button
              type="button"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="h-9 w-9 p-0 rounded-lg"
              aria-label="Página anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-xs font-black tabular-nums px-1">{page}</span>
            <Button
              type="button"
              variant="outline"
              disabled={!hasNextPage}
              onClick={() => setPage(p => p + 1)}
              className="h-9 w-9 p-0 rounded-lg"
              aria-label="Página siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      </div>{/* ── fin panel documentos ── */}

      {/* ── Panel: Movimientos que explican el saldo (antes acordeón) ── */}
      <div
        role="tabpanel"
        id="ie-panel-libro"
        aria-labelledby="ie-tab-libro"
        hidden={activeTab !== 'libro'}
      >
        <CashLedgerPanel
          storeId={storeId ?? null}
          canonicalCup={resumen?.expected_cash ?? null}
          active={activeTab === 'libro'}
        />
      </div>

      {/* ── Registro (flujo dedicado de 2 pasos) ── */}
      <CashFlowCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        storeId={storeId ?? null}
        storeName={storeName}
        summary={resumen}
        onRegistrado={() => { /* invalidaciones en el hook */ }}
        saldoFisico={saldoFisico}
      />

      {/* ── Detalle del documento + comprobante ── */}
      <CashFlowDetailModal
        open={!!detalleDoc}
        onClose={() => setDetalleDoc(null)}
        doc={detalleDoc}
        storeName={storeName}
        canAnnul={canAnnul}
        onAnular={d => { setDetalleDoc(null); setAnularTarget(d); }}
      />

      {/* ── Anulación (motivo obligatorio) ── */}
      <CashFlowReverseModal
        isOpen={!!anularTarget}
        onClose={() => setAnularTarget(null)}
        doc={anularTarget}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// KPI card (patrón StatsBar de SalesHistoryView)
// ──────────────────────────────────────────────────────────────────────────

function KpiCard({
  icon, label, value, extra, tone, hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  extra?: string;
  tone: 'primary' | 'success' | 'destructive' | 'warning' | 'muted';
  hint?: string;
}) {
  const toneCls = {
    primary: 'bg-primary/5 border-primary/20 text-primary',
    success: 'bg-success/5 border-success/20 text-success',
    destructive: 'bg-destructive/5 border-destructive/20 text-destructive',
    warning: 'bg-warning/5 border-warning/30 text-warning',
    muted: 'bg-muted/40 border-border/60 text-muted-foreground',
  }[tone];
  return (
    <div className={cn('p-3 rounded-xl border text-center min-w-0', toneCls)} data-testid={`kpi-${label}`}>
      <div className="flex items-center justify-center gap-1.5 mb-1">
        <span aria-hidden="true">{icon}</span>
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground truncate">{label}</span>
      </div>
      <div className="text-base font-black tabular-nums text-foreground truncate" title={value}>{value}</div>
      {extra && <div className="text-[11px] font-bold tabular-nums text-muted-foreground">{extra}</div>}
      {hint && <div className="text-[9px] text-muted-foreground/80 mt-0.5 truncate" title={hint}>{hint}</div>}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Tarjeta (modo tarjetas)
// ──────────────────────────────────────────────────────────────────────────

function TarjetaMovimiento({
  doc: d, canAnnul, onVer, onAnular,
}: {
  doc: CashFlowDocument;
  canAnnul: boolean;
  onVer: (d: CashFlowDocument) => void;
  onAnular: (d: CashFlowDocument) => void;
}) {
  const esIngreso = d.doc_type === 'ingreso';
  const anulado = d.status === 'anulado';
  return (
    <div className={cn(
      'p-4 rounded-xl border bg-card hover:border-primary/30 transition-colors',
      anulado ? 'border-border/50 opacity-70' : 'border-border',
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              'text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded',
              esIngreso ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive',
            )}>
              {esIngreso ? <><ArrowDownToLine className="w-3 h-3 inline mr-1" aria-hidden="true" />Ingreso</> : <><ArrowUpFromLine className="w-3 h-3 inline mr-1" aria-hidden="true" />Egreso</>}
            </span>
            <span className="text-xs font-mono font-bold text-muted-foreground">{d.document_number}</span>
            {isFondoConcept(d.concept) && (
              <span className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-warning/10 text-warning">
                Fondo
              </span>
            )}
            {anulado && (
              <span className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">
                Anulado
              </span>
            )}
          </div>
          <p className="text-sm font-bold truncate mt-1" title={conceptLabel(d.concept)}>{conceptLabel(d.concept)}</p>
          <p className="text-xs text-muted-foreground truncate" title={d.justification}>{d.justification}</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {formatDate(d.operation_date)} · {formatTime(d.operation_date)}
            {d.responsible?.full_name ? ` · ${d.responsible.full_name}` : ''}
            {d.counterparty ? ` · entrega/recibe: ${d.counterparty}` : ''}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className={cn(
            'text-lg font-black tabular-nums',
            anulado ? 'text-muted-foreground line-through' : esIngreso ? 'text-success' : 'text-destructive',
          )}>
            {esIngreso ? '+' : '−'}{formatCurrency(d.amount, d.currency)}
          </p>
          {d.currency === 'USD' && (
            <p className="text-[10px] font-bold text-muted-foreground tabular-nums">
              ≈ {formatCurrency(d.amount_cup)} CUP · tasa {Number(d.exchange_rate).toFixed(2)}
            </p>
          )}
          <div className="flex items-center justify-end gap-1.5 mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onVer(d)}
              className="h-8 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest"
              aria-label={`Ver documento ${d.document_number}`}
            >
              <Eye className="w-3.5 h-3.5" /> Ver
            </Button>
            {canAnnul && !anulado && (
              <Button
                type="button"
                onClick={() => onAnular(d)}
                className="h-8 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest"
                aria-label={`Anular documento ${d.document_number}`}
              >
                <Ban className="w-3.5 h-3.5" /> Anular
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Tabla densa (modo tabla — trabajo administrativo)
// ──────────────────────────────────────────────────────────────────────────

function TablaMovimientos({
  docs, sortKey, sortDir, onSort, canAnnul, onVer, onAnular,
}: {
  docs: CashFlowDocument[];
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
  canAnnul: boolean;
  onVer: (d: CashFlowDocument) => void;
  onAnular: (d: CashFlowDocument) => void;
}) {
  const ThOrdenable = ({ label, k, className }: { label: string; k: SortKey; className?: string }) => (
    <th
      scope="col"
      aria-sort={sortKey === k ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('p-3 text-left font-black uppercase text-[10px] tracking-widest text-muted-foreground whitespace-nowrap', className)}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
        aria-label={`Ordenar por ${label}`}
      >
        {label}
        <span aria-hidden="true" className={cn('text-[8px]', sortKey === k ? 'text-primary' : 'text-muted-foreground/40')}>
          {sortKey === k ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
      </button>
    </th>
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 border-b border-border">
          <tr>
            <ThOrdenable label="Número" k="document_number" />
            <th scope="col" className="p-3 text-left font-black uppercase text-[10px] tracking-widest text-muted-foreground">Tipo</th>
            <th scope="col" className="p-3 text-left font-black uppercase text-[10px] tracking-widest text-muted-foreground">Motivo</th>
            <ThOrdenable label="Fecha operativa" k="operation_date" />
            <th scope="col" className="p-3 text-left font-black uppercase text-[10px] tracking-widest text-muted-foreground">Responsable</th>
            <th scope="col" className="p-3 text-left font-black uppercase text-[10px] tracking-widest text-muted-foreground">Estado</th>
            <ThOrdenable label="Importe" k="amount" className="text-right" />
            <th scope="col" className="p-3 text-right font-black uppercase text-[10px] tracking-widest text-muted-foreground">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {docs.map(d => {
            const esIngreso = d.doc_type === 'ingreso';
            const anulado = d.status === 'anulado';
            return (
              <tr key={d.id} className={cn('border-b border-border/50 hover:bg-muted/20', anulado && 'opacity-70')}>
                <td className="p-3 font-mono font-bold whitespace-nowrap">{d.document_number}</td>
                <td className="p-3 whitespace-nowrap">
                  <span className={cn(
                    'text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded',
                    esIngreso ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive',
                  )}>
                    {esIngreso ? 'Ingreso' : 'Egreso'}
                  </span>
                </td>
                <td className="p-3 max-w-[220px] truncate font-bold" title={`${conceptLabel(d.concept)} — ${d.justification}`}>
                  {conceptShortLabel(d.concept)}
                </td>
                <td className="p-3 text-muted-foreground whitespace-nowrap">
                  {formatDate(d.operation_date)} <span className="text-[10px]">{formatTime(d.operation_date)}</span>
                </td>
                <td className="p-3 max-w-[140px] truncate" title={d.responsible?.full_name ?? ''}>
                  {d.responsible?.full_name ?? '—'}
                </td>
                <td className="p-3 whitespace-nowrap">
                  <span className={cn(
                    'text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded',
                    anulado ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success',
                  )}>
                    {anulado ? 'Anulado' : 'Confirmado'}
                  </span>
                </td>
                <td className={cn('p-3 text-right tabular-nums font-black whitespace-nowrap',
                  anulado ? 'text-muted-foreground line-through' : esIngreso ? 'text-success' : 'text-destructive')}>
                  {esIngreso ? '+' : '−'}{formatCurrency(d.amount, d.currency)}
                  {d.currency === 'USD' && (
                    <span className="block text-[9px] font-bold text-muted-foreground">≈ {formatCurrency(d.amount_cup)} CUP</span>
                  )}
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onVer(d)}
                    className="h-8 w-8 p-0 rounded-lg"
                    aria-label={`Ver documento ${d.document_number}`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                  {canAnnul && !anulado && (
                    <Button
                      type="button"
                      onClick={() => onAnular(d)}
                      className="h-8 w-8 p-0 rounded-lg ml-1.5"
                      aria-label={`Anular documento ${d.document_number}`}
                      title="Anular documento"
                    >
                      <Ban className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
