'use client';

/**
 * IPV — INGRESOS POR VENTAS (MISIÓN 2026-10-16).
 *
 * Vista canónica ÚNICA del informe (viewId `ipv_ventas`, bajo OPERACIÓN →
 * Ventas). El nombre evita la colisión con el módulo experimental 'ipv'
 * (conciliación bancaria en Dexie/IndexedDB) — este informe es Supabase.
 *
 * Arquitectura (espejo de CashReportView, AUDITORIA_IPV §diseño):
 *  · §2 Configuración ≠ cálculo: nada se consulta hasta pulsar Generar.
 *    `generatingRef` evita dobles envíos; AbortController cancela al
 *    desmontar/reconfigurar; `stale` marca resultados obsoletos.
 *  · Un dataset → tres representaciones: tabla visible, PDF y Excel usan
 *    el MISMO subconjunto de filas (filtro de búsqueda aplicado) y los
 *    mismos totales (totalsFromRows) — escenario K.
 *  · Solo lectura: ninguna acción escribe en datos comerciales.
 *
 * Accesibilidad (WCAG 2.2 AA): labels asociados, aria-live del estado,
 * aria-busy en acciones, caption de tabla, foco visible vía tokens shadcn,
 * targets táctiles ≥44px, el estado se comunica con icono+texto (no solo color).
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  ReceiptText, RefreshCw, Calculator, AlertTriangle, Eye, FileText, Sheet,
  Search, Store as StoreIcon, CalendarDays, CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api-fetch';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
import PageHeader from '@/components/ui/PageHeader';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  totalsFromRows,
  type IpvRow,
  type IpvIncidence,
  type IpvTotals,
} from '@/lib/ipv-ventas/compute';
import { formatIpvQty, formatIpvMoney } from '@/lib/ipv-ventas/format';
import { buildIpvVentasPdf, ipvFileName } from './ipv-ventas-pdf';
import { buildIpvVentasWorkbook } from './ipv-ventas-excel';

const touch = 'min-h-[44px]';

interface StoreOpt { id: string; name: string; }

interface AppliedReport {
  cfg: { storeId: string; startDate: string; endDate: string };
  storeName: string;
  rows: IpvRow[];
  incidences: IpvIncidence[];
  totals: IpvTotals;
  excludedCount: number;
  generatedAt: string;
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isDateRangeInvalid(startDate: string, endDate: string): boolean {
  return !!startDate && !!endDate && new Date(startDate).getTime() > new Date(endDate).getTime();
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const PERIOD_CHIPS: Array<{ label: string; range: () => [string, string] }> = [
  { label: 'Hoy', range: () => { const t = new Date(); return [isoDate(t), isoDate(t)]; } },
  { label: 'Ayer', range: () => { const t = new Date(); t.setDate(t.getDate() - 1); return [isoDate(t), isoDate(t)]; } },
  { label: 'Últimos 7 días', range: () => { const a = new Date(); const b = new Date(); a.setDate(a.getDate() - 6); return [isoDate(a), isoDate(b)]; } },
  { label: 'Últimos 30 días', range: () => { const a = new Date(); const b = new Date(); a.setDate(a.getDate() - 29); return [isoDate(a), isoDate(b)]; } },
  { label: 'Mes actual', range: () => { const n = new Date(); return [isoDate(new Date(n.getFullYear(), n.getMonth(), 1)), isoDate(new Date(n.getFullYear(), n.getMonth() + 1, 0))]; } },
  { label: 'Mes anterior', range: () => { const n = new Date(); return [isoDate(new Date(n.getFullYear(), n.getMonth() - 1, 1)), isoDate(new Date(n.getFullYear(), n.getMonth(), 0))]; } },
];

export default function IpvVentasView() {
  const user = useAuthStore((s) => s.user);

  // ── Configuración (no dispara cálculo) ───────────────────────────────────
  const [stores, setStores] = useState<StoreOpt[]>([]);
  const [storeId, setStoreId] = useState<string>(user?.activeStoreId ?? '');
  const [startDate, setStartDate] = useState<string>(() => isoDate(new Date()));
  const [endDate, setEndDate] = useState<string>(() => isoDate(new Date()));
  const [search, setSearch] = useState('');

  // ── Estado de cálculo ────────────────────────────────────────────────────
  const [applied, setApplied] = useState<AppliedReport | null>(null);
  const [loading, setLoading] = useState(false);
  const generatingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  // ── Representaciones y exportaciones ─────────────────────────────────────
  // Tab de resultados: «tabla» (datos + incidencias) y «pdf» (previsualización
  // fiel del documento — mismo dataset, escenarios K/L).
  const [resultTab, setResultTab] = useState<'tabla' | 'pdf'>('tabla');
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewSigRef = useRef<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const buildingPreviewRef = useRef(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  const rangeInvalid = isDateRangeInvalid(startDate, endDate);
  const stale = !!applied && (applied.cfg.storeId !== storeId || applied.cfg.startDate !== startDate || applied.cfg.endDate !== endDate);

  // Filas visibles = dataset aplicado ∩ filtro de búsqueda (código o descripción)
  const filteredRows = useMemo(() => {
    if (!applied) return [] as IpvRow[];
    const q = normalize(search.trim());
    if (!q) return applied.rows;
    return applied.rows.filter((r) => normalize(r.sku).includes(q) || normalize(r.name).includes(q));
  }, [applied, search]);

  // Totales de lo VISIBLE → compartidos por pantalla, PDF y Excel (§K)
  const visibleTotals = useMemo(() => totalsFromRows(filteredRows), [filteredRows]);

  // Incidencias agrupadas por categoría (MISIÓN CORRECTIVA §6: la lista debe
  // seguir siendo legible cuando crece; TODAS permanecen visibles — nada oculto).
  const incidencesByType = useMemo(() => {
    const groups = new Map<IpvIncidence['type'], IpvIncidence[]>();
    for (const inc of applied?.incidences ?? []) {
      const list = groups.get(inc.type) ?? [];
      list.push(inc);
      groups.set(inc.type, list);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [applied]);

  // ── Tiendas disponibles (mismo endpoint que Reporte Entrega) ─────────────
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const data = await apiFetch('/api/stores?status=all', { signal: ctrl.signal });
        const all: StoreOpt[] = (data?.data || data || []) as StoreOpt[];
        const memberships = (user?.memberships ?? []) as Array<{ store_id: string; status: string }>;
        const usable = user?.role === 'admin' || !user
          ? all
          : all.filter((s) => memberships.some((m) => m.store_id === s.id && m.status === 'active'));
        const list = usable.length > 0 ? usable : all.filter((s) => s.id === user?.activeStoreId);
        setStores(list);
        if (list.length > 0 && !list.some((s) => s.id === storeId)) {
          setStoreId(user?.activeStoreId ?? list[0].id);
        }
      } catch { /* selector opcional; el servidor valida la tienda final */ }
    })();
    return () => ctrl.abort();
  }, [user?.role, user?.activeStoreId]);

  useEffect(() => () => {
    abortRef.current?.abort();
    if (previewUrlRef.current) { try { URL.revokeObjectURL(String(previewUrlRef.current)); } catch { /* noop */ } }
  }, []);

  // ── §2 Generar / Actualizar (única vía de cálculo) ───────────────────────
  const handleGenerate = useCallback(async () => {
    if (generatingRef.current) return;
    if (!storeId) { toast.error('Selecciona una tienda.'); return; }
    if (isDateRangeInvalid(startDate, endDate)) { toast.error('La fecha inicial no puede ser posterior a la final.'); return; }
    generatingRef.current = true;
    setLoading(true);
    const ctrl = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ctrl;
    try {
      // Convención oficial de rangos de COSTPRO (idéntica a Reporte Entrega):
      // límites locales del día → ISO UTC, inclusivos en ambos extremos.
      const fromISO = new Date(`${startDate}T00:00:00`).toISOString();
      const toISO = new Date(`${endDate}T23:59:59.999`).toISOString();
      const qs = new URLSearchParams({ from: fromISO, to: toISO, store_id: storeId });
      const data = await apiFetch(`/api/ipv-ventas?${qs.toString()}`, { signal: ctrl.signal }) as {
        store: { id: string; name: string };
        result: { rows: IpvRow[]; incidences: IpvIncidence[]; totals: IpvTotals; excludedCount: number };
        generatedAt: string;
      };
      if (!ctrl.signal.aborted) {
        setApplied({
          cfg: { storeId, startDate, endDate },
          storeName: data.store?.name ?? 'Tienda',
          rows: data.result.rows ?? [],
          incidences: data.result.incidences ?? [],
          totals: data.result.totals,
          excludedCount: data.result.excludedCount ?? 0,
          generatedAt: data.generatedAt ?? new Date().toISOString(),
        });
        // Invalida preview anterior (nueva ejecución del informe)
        if (previewUrlRef.current) { try { URL.revokeObjectURL(String(previewUrlRef.current)); } catch { /* noop */ } }
        previewUrlRef.current = null; previewSigRef.current = null; setPreviewUrl(null);
        const nInc = data.result.incidences?.length ?? 0;
        toast.success(`IPV calculado: ${data.result.rows?.length ?? 0} productos${nInc > 0 ? ` · ${nInc} incidencia(s) de conciliación` : ''}`);
      }
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      const e = err as { message?: string };
      toast.error(e?.message || 'No se pudo generar el IPV.');
    } finally {
      generatingRef.current = false;
      setLoading(false);
    }
  }, [storeId, startDate, endDate]);

  // ── Construcción de PDF compartida por preview y descarga ────────────────
  const buildDoc = useCallback(async () => {
    if (!applied) return null;
    return buildIpvVentasPdf({
      storeName: applied.storeName,
      startDateLabel: applied.cfg.startDate,
      endDateLabel: applied.cfg.endDate,
      rows: filteredRows,
      incidences: applied.incidences,
      generatedAt: applied.generatedAt,
      totalsOverride: visibleTotals,
    });
  }, [applied, filteredRows, visibleTotals]);

  const previewSignature = applied
    ? `${applied.cfg.storeId}|${applied.cfg.startDate}|${applied.cfg.endDate}|${applied.generatedAt}|${search}|${filteredRows.length}`
    : null;

  const handlePreview = useCallback(async () => {
    if (!applied || buildingPreviewRef.current) return;
    if (previewUrlRef.current && previewSigRef.current === previewSignature) return; // cache vigente
    buildingPreviewRef.current = true;
    setPreviewLoading(true);
    try {
      const doc = await buildDoc();
      if (!doc) return;
      const url = String(doc.output('bloburl'));
      const old = previewUrlRef.current;
      previewUrlRef.current = url;
      previewSigRef.current = previewSignature;
      setPreviewUrl(url);
      if (old) { try { URL.revokeObjectURL(String(old)); } catch { /* noop */ } }
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || 'No se pudo generar la vista previa.');
    } finally {
      buildingPreviewRef.current = false;
      setPreviewLoading(false);
    }
  }, [applied, previewSignature, buildDoc]);

  // Entrar al tab «pdf» genera/renueva la previsualización (cache por firma;
  // si está vigente no se regenera). Se define tras handlePreview.
  useEffect(() => {
    if (resultTab === 'pdf' && applied) void handlePreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultTab, applied]);

  const handleDownloadPdf = useCallback(async () => {
    if (!applied || exportingPdf) return;
    setExportingPdf(true);
    try {
      const doc = await buildDoc();
      if (!doc) return;
      doc.save(ipvFileName('pdf', applied.storeName, applied.cfg.startDate, applied.cfg.endDate));
      toast.success('PDF generado');
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || 'Error al generar el PDF.');
    } finally {
      setExportingPdf(false);
    }
  }, [applied, exportingPdf, buildDoc]);

  const handleDownloadExcel = useCallback(async () => {
    if (!applied || exportingExcel) return;
    setExportingExcel(true);
    try {
      await buildIpvVentasWorkbook({
        storeName: applied.storeName,
        startDateLabel: applied.cfg.startDate,
        endDateLabel: applied.cfg.endDate,
        rows: filteredRows,
        incidences: applied.incidences,
        generatedAt: applied.generatedAt,
        excludedCount: applied.excludedCount,
      });
      toast.success('Excel generado');
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || 'Error al generar el Excel.');
    } finally {
      setExportingExcel(false);
    }
  }, [applied, exportingExcel, filteredRows]);

  const exportDisabled = !applied;
  const btnSecondary = cn(
    'px-3 rounded-xl border border-border/40 text-xs font-black uppercase hover:bg-muted flex items-center justify-center gap-1.5',
    touch,
  );
  const disabledCls = 'opacity-60 cursor-not-allowed';

  return (
    <div className="space-y-4 sm:space-y-6" data-testid="ipv-ventas-view">
      <PageHeader
        title="IPV — Ingresos por Ventas"
        description="Conciliación de inventario e ingresos: existencia inicial, movimientos del período, existencia final e importe vendido por producto."
        icon={ReceiptText}
        iconVariant="neutral"
        badge={
          !applied ? { text: 'Sin calcular', variant: 'default' }
            : stale ? { text: 'Resultados anteriores', variant: 'warning' }
              : { text: 'Al día', variant: 'success' }
        }
        primaryAction={
          <button
            onClick={handleGenerate}
            disabled={loading || rangeInvalid || !storeId}
            aria-busy={loading}
            className={cn(
              'rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase hover:opacity-90 flex items-center justify-center gap-2 px-4',
              touch,
              (loading || rangeInvalid || !storeId) && disabledCls,
            )}
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
            {loading ? 'Calculando…' : (!applied ? 'Generar informe' : 'Actualizar informe')}
          </button>
        }
        secondaryActions={
          <div className="flex items-center gap-2">
            <button onClick={handleDownloadPdf} disabled={exportDisabled || exportingPdf} title="Exportar PDF"
              className={cn(btnSecondary, (exportDisabled || exportingPdf) && disabledCls)} aria-busy={exportingPdf}>
              {exportingPdf ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              <span className="hidden sm:inline">PDF</span>
            </button>
            <button onClick={handleDownloadExcel} disabled={exportDisabled || exportingExcel} title="Exportar Excel"
              className={cn(btnSecondary, (exportDisabled || exportingExcel) && disabledCls)} aria-busy={exportingExcel}>
              {exportingExcel ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sheet className="w-4 h-4" />}
              <span className="hidden sm:inline">Excel</span>
            </button>
          </div>
        }
      />

      {/* Aviso de obsolescencia */}
      {stale && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Configuración modificada — estos resultados corresponden a {applied?.cfg.startDate} → {applied?.cfg.endDate}. Actualiza el informe.
        </div>
      )}

      {/* Aviso de limitación histórica (§5.1 — honestidad del saldo inicial) */}
      {applied && applied.incidences.some((i) => i.type === 'PRE_LEDGER' || i.type === 'RECONCILIATION') && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Algunos productos tienen saldos históricos con limitaciones de reconstrucción (carga inicial sin movimiento). Ver Incidencias — no se ajustaron valores.
        </div>
      )}

      {/* ── Configuración (§2) ── */}
      <section aria-labelledby="ipv-config-title" className="rounded-2xl border border-border bg-card p-4">
        <h2 id="ipv-config-title" className="sr-only">Parámetros del informe</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="ipv-store" className="flex items-center gap-1.5 text-xs font-bold uppercase text-muted-foreground mb-1.5">
              <StoreIcon className="w-3.5 h-3.5" /> Tienda
            </label>
            <select
              id="ipv-store"
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {stores.length === 0 && <option value={user?.activeStoreId ?? ''}>Tienda activa</option>}
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="ipv-start" className="flex items-center gap-1.5 text-xs font-bold uppercase text-muted-foreground mb-1.5">
              <CalendarDays className="w-3.5 h-3.5" /> Fecha inicial
            </label>
            <input id="ipv-start" type="date" value={startDate} max={endDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={cn('w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', rangeInvalid && 'border-red-500')}
            />
          </div>
          <div>
            <label htmlFor="ipv-end" className="flex items-center gap-1.5 text-xs font-bold uppercase text-muted-foreground mb-1.5">
              <CalendarDays className="w-3.5 h-3.5" /> Fecha final
            </label>
            <input id="ipv-end" type="date" value={endDate} min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={cn('w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', rangeInvalid && 'border-red-500')}
            />
          </div>
          <div>
            <label htmlFor="ipv-search" className="flex items-center gap-1.5 text-xs font-bold uppercase text-muted-foreground mb-1.5">
              <Search className="w-3.5 h-3.5" /> Buscar producto
            </label>
            <input id="ipv-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Por código o descripción"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>
        {rangeInvalid && (
          <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">La fecha inicial no puede ser posterior a la fecha final.</p>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Períodos rápidos">
          {PERIOD_CHIPS.map((p) => (
            <button key={p.label} type="button"
              onClick={() => { const [a, b] = p.range(); setStartDate(a); setEndDate(b); }}
              className="rounded-full border border-border/50 px-3 py-1.5 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {p.label}
            </button>
          ))}
        </div>
      </section>

      {/* Estado para lectores de pantalla */}
      <p aria-live="polite" className="sr-only">
        {loading ? 'Calculando el informe IPV' : applied ? `Informe calculado con ${filteredRows.length} productos visibles` : 'Informe sin calcular'}
      </p>

      {/* ── Resultados ── */}
      {!applied ? (
        <section className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
          <ReceiptText className="mx-auto w-10 h-10 text-muted-foreground/50" aria-hidden />
          <p className="mt-3 text-sm text-muted-foreground">
            Configura tienda y período, y pulsa <strong>Generar informe</strong>. El IPV reconstruye la existencia inicial
            del ledger de inventario, clasifica los movimientos del período y concilia la existencia final con el stock canónico.
          </p>
        </section>
      ) : (
        <section aria-labelledby="ipv-results-title" className="rounded-2xl border border-border bg-card">
          <h2 id="ipv-results-title" className="sr-only">Resultados del IPV</h2>
          {/* Encabezado del informe (MISIÓN §4) */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3 text-xs text-muted-foreground">
            <span className="font-bold text-foreground">{applied.storeName}</span>
            <span>{applied.cfg.startDate} → {applied.cfg.endDate}</span>
            <span>Generado: {new Date(applied.generatedAt).toLocaleString('es')}</span>
            <span>Monedas: CUP contable · USD informativo</span>
            <span>{filteredRows.length} de {applied.rows.length} productos</span>
            {applied.incidences.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-bold text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-3 h-3" aria-hidden /> {applied.incidences.length} incidencia(s)
              </span>
            )}
          </div>

          {applied.rows.length === 0 ? (
            <div className="p-10 text-center">
              <CheckCircle2 className="mx-auto w-10 h-10 text-muted-foreground/50" aria-hidden />
              <p className="mt-3 text-sm text-muted-foreground">
                Sin productos con existencia o movimientos en el período (regla de inclusión §6).
                {applied.excludedCount > 0 && ` Se excluyeron ${applied.excludedCount} producto(s) sin saldo ni movimiento.`}
              </p>
            </div>
          ) : (
            <Tabs value={resultTab} onValueChange={(v) => setResultTab(v === 'pdf' ? 'pdf' : 'tabla')}>
              {/* MISIÓN PRESENTACIÓN 2026-10-16: la previsualización del PDF
                  pasa a ser un TAB hermano de la tabla (antes iba debajo, al
                  final del reporte). Ambos tabs consumen el MISMO dataset. */}
              <div className="border-b border-border/60 px-4 pt-2">
                <TabsList aria-label="Representaciones del informe IPV">
                  <TabsTrigger value="tabla" className="min-h-[44px] px-4 text-xs font-bold">Tabla IPV</TabsTrigger>
                  <TabsTrigger value="pdf" className="min-h-[44px] px-4 text-xs font-bold">
                    Vista previa PDF
                    {previewLoading && <RefreshCw className="ml-1.5 w-3 h-3 animate-spin" aria-hidden />}
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="tabla" className="mt-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] border-collapse text-sm">
                  <caption className="sr-only">IPV — Ingresos por Ventas: conciliación de existencia inicial a final por producto con importe vendido</caption>
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
                      <th scope="col" className="px-3 py-2.5 text-left font-bold">Código</th>
                      <th scope="col" className="px-3 py-2.5 text-left font-bold min-w-[180px]">Descripción</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-bold">Exist. inicial</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-bold">Cant. vendidas</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-bold">Vales salidas</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-bold">Entradas</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-bold">Devoluciones</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-bold">Ajustes</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-bold">Transf.</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-bold">Exist. final</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-bold">Ventas (CUP)</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-bold">Ventas USD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.length === 0 ? (
                      <tr><td colSpan={12} className="px-4 py-8 text-center text-muted-foreground">Sin coincidencias para «{search}».</td></tr>
                    ) : filteredRows.map((r) => {
                      const hasInc = r.incidenceTypes.length > 0;
                      // Énfasis de legibilidad (petición 2026-10-16): filas con
                      // movimientos del período → valores en semibold y algo
                      // mayores; Ventas (CUP) ≠ 0 → negrita destacada. Los
                      // valores NO cambian — solo la forma.
                      const hasMov = r.hasPeriodMovements || Math.abs(r.ventasImporteCup) > 0.005 || Math.abs(r.ventasImporteUsd) > 0.005;
                      const numCls = hasMov ? 'text-[13px] font-semibold' : 'text-xs';
                      const cupCls = Math.abs(r.ventasImporteCup) > 0.005
                        ? 'text-[13px] font-bold'
                        : 'text-xs text-muted-foreground';
                      return (
                        <tr key={r.productId} className={cn('border-b border-border/40 hover:bg-muted/30', hasInc && 'border-l-2 border-l-amber-500', hasMov && 'bg-muted/20')}>
                          <td className={cn('px-3 py-2 font-mono', hasMov ? 'text-[13px] font-semibold' : 'text-xs')}>{r.sku}</td>
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center gap-1.5">
                              {hasInc && <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500" aria-label={`Incidencia: ${r.incidenceTypes.join(', ')}`} />}
                              <span className={cn('truncate max-w-[280px]', hasMov && 'font-semibold')} title={r.name}>{r.name}</span>
                            </span>
                          </td>
                          <td className={cn('px-3 py-2 text-right font-mono', numCls, r.existenciaInicial === null && 'text-muted-foreground italic')}>{formatIpvQty(r.existenciaInicial)}</td>
                          <td className={cn('px-3 py-2 text-right font-mono', numCls)}>{formatIpvQty(r.cantidadesVendidas)}</td>
                          <td className={cn('px-3 py-2 text-right font-mono', numCls)}>{formatIpvQty(r.valesSalidas)}</td>
                          <td className={cn('px-3 py-2 text-right font-mono', numCls)}>{formatIpvQty(r.entradas)}</td>
                          <td className={cn('px-3 py-2 text-right font-mono', numCls)}>{formatIpvQty(r.devoluciones)}</td>
                          <td className={cn('px-3 py-2 text-right font-mono', numCls)}>{formatIpvQty(r.ajustes)}</td>
                          <td className={cn('px-3 py-2 text-right font-mono', numCls)}>{formatIpvQty(r.transferencias)}</td>
                          <td className={cn('px-3 py-2 text-right font-mono font-bold', hasMov ? 'text-[13px]' : 'text-xs', r.existenciaFinal === null && 'text-muted-foreground italic')}>{formatIpvQty(r.existenciaFinal)}</td>
                          <td className={cn('px-3 py-2 text-right font-mono', cupCls)}>{formatIpvMoney(r.ventasImporteCup)}</td>
                          <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">{formatIpvMoney(r.ventasImporteUsd)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {filteredRows.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/40 font-bold">
                        <td colSpan={2} className="px-3 py-2.5 text-xs uppercase">Totales ({filteredRows.length} productos)</td>
                        <td className={cn('px-3 py-2.5 text-right font-mono text-xs', visibleTotals.existenciaInicial === null && 'italic text-muted-foreground')}>{formatIpvQty(visibleTotals.existenciaInicial)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs">{formatIpvQty(visibleTotals.cantidadesVendidas)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs">{formatIpvQty(visibleTotals.valesSalidas)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs">{formatIpvQty(visibleTotals.entradas)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs">{formatIpvQty(visibleTotals.devoluciones)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs">{formatIpvQty(visibleTotals.ajustes)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs">{formatIpvQty(visibleTotals.transferencias)}</td>
                        <td className={cn('px-3 py-2.5 text-right font-mono text-xs', visibleTotals.existenciaFinal === null && 'italic text-muted-foreground')}>{formatIpvQty(visibleTotals.existenciaFinal)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs">{formatIpvMoney(visibleTotals.ventasImporteCup)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs">{formatIpvMoney(visibleTotals.ventasImporteUsd)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* Incidencias de conciliación (§5.6) — agrupadas por tipo.
                  DEFECTO CORREGIDO (MISIÓN CORRECTIVA §6): antes el span
                  «calc: …» se renderizaba pegado al nombre (el texto extraíble
                  quedaba «Cemento Blanco 2 Kgcalc: 26») porque entre ambos
                  spans no hay nodo de texto. Ahora hay separador explícito
                  «· » en el DOM y flex gap en la presentación. */}
              {applied.incidences.length > 0 && (
                <details className="border-t border-border/60 px-4 py-3" open>
                  <summary className="cursor-pointer text-xs font-bold uppercase text-amber-600 dark:text-amber-400">
                    <span className="inline-flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" aria-hidden /> Incidencias de conciliación ({applied.incidences.length})</span>
                  </summary>
                  {incidencesByType.map(([type, list]) => (
                    <div key={type} className="mt-3">
                      <p className="text-[11px] font-black uppercase tracking-wide text-amber-700 dark:text-amber-400">
                        {type} — {list.length} producto(s)
                      </p>
                      <ul className="mt-1.5 space-y-2">
                        {list.map((inc, idx) => (
                          <li key={`${inc.productId}-${inc.type}-${idx}`} className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <span className="font-bold">{inc.sku} — {inc.name}</span>
                              {(inc.difference !== null && inc.difference !== undefined) && (
                                <span className="font-mono">
                                  {'· calc: '}{formatIpvQty(inc.calculated ?? null)}{' · esperado: '}{formatIpvQty(inc.expected ?? null)}{' · dif: '}{formatIpvQty(inc.difference)}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-muted-foreground">{inc.detail}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </details>
              )}
              </TabsContent>

              <TabsContent value="pdf" className="mt-0">
                {!previewUrl && previewLoading && (
                  <div role="status" className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
                    <RefreshCw className="w-4 h-4 animate-spin" aria-hidden /> Generando vista previa del PDF…
                  </div>
                )}
                {!previewUrl && !previewLoading && (
                  <div className="py-16 text-center">
                    <button onClick={handlePreview} className={cn(btnSecondary, 'mx-auto')} aria-busy={previewLoading}>
                      <Eye className="w-4 h-4" aria-hidden /> Generar vista previa
                    </button>
                  </div>
                )}
                {previewUrl && (
                  <div className="p-3">
                    <iframe src={previewUrl} title="Vista previa del IPV en PDF" className="h-[720px] w-full rounded-xl border border-border bg-white" />
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </section>
      )}
    </div>
  );
}
