'use client';

/**
 * CP-FIN · Vista B — Estados Financieros (ViewType 'financial-statements').
 *
 * Tres pestañas sobre el MISMO motor de partida doble (sin recálculos locales):
 *  · Situación — Estado de Situación Financiera a una fecha de corte, con la
 *    ecuación contable verificada y drilldown documental por categoría.
 *  · Rendimiento — Estado de Rendimiento por período (seccional).
 *  · Dashboard — KPIs ejecutivos, evolución mensual y alertas del motor.
 *
 * UI operacional en ESPAÑOL hardcodeada (sin next-intl). Filtros por pestaña
 * (corte vs período con presets), exportación PDF/Excel de la pestaña activa
 * (client-side, imports dinámicos) y toasts sonner para errores.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  Landmark,
  Loader2,
  RefreshCw,
  Scale,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
import { havanaNow, toDateInputValue } from '@/lib/sales-dashboard/periods';
import { BalanceSheetTab } from './BalanceSheetTab';
import { IncomeStatementTab } from './IncomeStatementTab';
import { DashboardTab } from './DashboardTab';
import {
  exportBalanceSheetExcel,
  exportBalanceSheetPdf,
  exportIncomeExcel,
  exportIncomeStatementPdf,
} from './exporters';
import type { BalanceSheetData, FinancialStatementTabId, IncomeStatementData } from './types';

// ── Presets de período (hora local de La Habana, igual que el resto del app) ─

type PeriodPresetId = 'this_month' | 'prev_month' | 'last3' | 'this_year';

const PERIOD_PRESETS: { id: PeriodPresetId; label: string }[] = [
  { id: 'this_month', label: 'Este mes' },
  { id: 'prev_month', label: 'Mes pasado' },
  { id: 'last3', label: 'Últimos 3 meses' },
  { id: 'this_year', label: 'Este año' },
];

const pad2 = (n: number): string => String(n).padStart(2, '0');
const ymd = (d: Date): string =>
  `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;

/** Rango {from, to} de un preset, calculado sobre el YMD de hoy (Havana). */
function presetRange(preset: PeriodPresetId): { from: string; to: string } {
  const today = toDateInputValue(havanaNow());
  const [y, m] = today.split('-').map(Number);
  const firstOfThisMonth = new Date(Date.UTC(y, m - 1, 1));
  switch (preset) {
    case 'this_month':
      return { from: ymd(firstOfThisMonth), to: today };
    case 'prev_month': {
      const lastOfPrev = new Date(firstOfThisMonth.getTime() - 24 * 3600 * 1000);
      return { from: `${lastOfPrev.getUTCFullYear()}-${pad2(lastOfPrev.getUTCMonth() + 1)}-01`, to: ymd(lastOfPrev) };
    }
    case 'last3': {
      const from = new Date(Date.UTC(y, m - 1 - 2, 1)); // Date.UTC normaliza meses negativos
      return { from: ymd(from), to: today };
    }
    case 'this_year':
      return { from: `${y}-01-01`, to: today };
  }
}

const TODAY = () => toDateInputValue(havanaNow());

// ── Vista ────────────────────────────────────────────────────────────────────

export default function FinancialStatementsView() {
  const user = useAuthStore((s) => s.user);
  const storeId = user?.activeStoreId ?? '';

  const [activeTab, setActiveTab] = useState<FinancialStatementTabId>('situacion');

  // Borradores de los filtros (se aplican con «Actualizar» o al tocar un preset).
  const [draftAsOf, setDraftAsOf] = useState<string>(TODAY);
  const [draftFrom, setDraftFrom] = useState<string>(() => presetRange('this_month').from);
  const [draftTo, setDraftTo] = useState<string>(() => presetRange('this_month').to);
  const [preset, setPreset] = useState<PeriodPresetId | null>('this_month');

  // Filtros aplicados: los consumen las pestañas (evita fetch por cada tecla).
  const [applied, setApplied] = useState<{ asOf: string; from: string; to: string }>(() => ({
    asOf: TODAY(),
    ...presetRange('this_month'),
  }));
  const [refreshKey, setRefreshKey] = useState(0);

  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  // Datos cargados de cada pestaña (fuente de las exportaciones de la pestaña activa).
  const balanceDataRef = useRef<BalanceSheetData | null>(null);
  const incomeDataRef = useRef<IncomeStatementData | null>(null);
  const [hasBalanceData, setHasBalanceData] = useState(false);
  const [hasIncomeData, setHasIncomeData] = useState(false);

  /** Nombre de la tienda activa: membresía del usuario → legacy stores → 'Tienda'. */
  const storeName = useMemo(() => {
    const membership = (user?.memberships ?? []).find((mm) => mm.store_id === user?.activeStoreId);
    if (membership?.store?.name) return membership.store.name;
    const legacy = (user as unknown as { stores?: { id: string; name: string }[] } | undefined)?.stores;
    const found = legacy?.find((s) => s.id === user?.activeStoreId);
    return found?.name ?? 'Tienda';
  }, [user]);

  const onBalanceLoaded = useCallback((d: BalanceSheetData | null) => {
    balanceDataRef.current = d;
    setHasBalanceData(!!d);
  }, []);

  const onIncomeLoaded = useCallback((d: IncomeStatementData | null) => {
    incomeDataRef.current = d;
    setHasIncomeData(!!d);
  }, []);

  const applyFilters = useCallback(() => {
    if (activeTab === 'situacion') {
      if (!draftAsOf) {
        toast.error('Indica una fecha de corte válida');
        return;
      }
      setApplied((prev) => ({ ...prev, asOf: draftAsOf }));
    } else {
      if (!draftFrom || !draftTo) {
        toast.error('Indica un período válido (desde/hasta)');
        return;
      }
      if (draftFrom > draftTo) {
        toast.error('El período es inválido: la fecha inicial es posterior a la final');
        return;
      }
      setApplied((prev) => ({ ...prev, from: draftFrom, to: draftTo }));
    }
    setRefreshKey((k) => k + 1);
  }, [activeTab, draftAsOf, draftFrom, draftTo]);

  const onPresetClick = useCallback((p: PeriodPresetId) => {
    const range = presetRange(p);
    setPreset(p);
    setDraftFrom(range.from);
    setDraftTo(range.to);
    setApplied((prev) => ({ ...prev, from: range.from, to: range.to }));
    setRefreshKey((k) => k + 1);
  }, []);

  const activeTabHasData = activeTab === 'situacion' ? hasBalanceData : activeTab === 'rendimiento' ? hasIncomeData : false;
  const exportsDisabled = activeTab === 'dashboard' || !activeTabHasData || exportingPdf || exportingExcel;

  const handleExportPdf = useCallback(async () => {
    if (exportsDisabled || exportingPdf) return;
    if (activeTab === 'situacion') {
      const d = balanceDataRef.current;
      if (!d) return;
      setExportingPdf(true);
      try {
        await exportBalanceSheetPdf(d, storeName);
        toast.success('PDF del Estado de Situación generado');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Error al generar el PDF');
      } finally {
        setExportingPdf(false);
      }
      return;
    }
    if (activeTab === 'rendimiento') {
      const d = incomeDataRef.current;
      if (!d) return;
      setExportingPdf(true);
      try {
        await exportIncomeStatementPdf(d, storeName, applied.from, applied.to);
        toast.success('PDF del Estado de Rendimiento generado');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Error al generar el PDF');
      } finally {
        setExportingPdf(false);
      }
    }
  }, [activeTab, applied.from, applied.to, exportsDisabled, exportingPdf, storeName]);

  const handleExportExcel = useCallback(async () => {
    if (exportsDisabled || exportingExcel) return;
    if (activeTab === 'situacion') {
      const d = balanceDataRef.current;
      if (!d) return;
      setExportingExcel(true);
      try {
        await exportBalanceSheetExcel(d, storeName);
        toast.success('Excel del Estado de Situación generado');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Error al generar el Excel');
      } finally {
        setExportingExcel(false);
      }
      return;
    }
    if (activeTab === 'rendimiento') {
      const d = incomeDataRef.current;
      if (!d) return;
      setExportingExcel(true);
      try {
        await exportIncomeExcel(d, storeName, applied.from, applied.to);
        toast.success('Excel del Estado de Rendimiento generado');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Error al generar el Excel');
      } finally {
        setExportingExcel(false);
      }
    }
  }, [activeTab, applied.from, applied.to, exportsDisabled, exportingExcel, storeName]);

  // Sin tienda activa: mensaje y return (patrón de vistas operativas).
  if (!storeId) {
    return (
      <div className="w-full max-w-7xl mx-auto p-4">
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center bg-card border border-border rounded-2xl">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
            <Landmark className="w-8 h-8 text-muted-foreground" />
          </div>
          <div className="max-w-md space-y-1">
            <h2 className="text-lg font-black uppercase tracking-tight text-foreground">
              Estados Financieros
            </h2>
            <p className="text-xs text-muted-foreground">
              Selecciona una tienda activa para consultar sus estados financieros. El motor de
              partida doble genera la información por tienda.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const isPeriodTab = activeTab !== 'situacion';

  return (
    <div className="w-full max-w-7xl mx-auto space-y-5 p-4" data-testid="financial-statements-view">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-success flex items-center justify-center shrink-0">
          <BarChart3 className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tighter text-foreground">
            Estados Financieros
          </h1>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
            Motor de partida doble · Información automática
          </p>
        </div>
      </div>

      {/* Filtros globales */}
      <div className="rounded-xl border border-border bg-card p-3 sm:p-4 shadow-sm" data-testid="financial-filters">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-2">
            {activeTab === 'situacion' ? (
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Fecha de corte
                </span>
                <input
                  type="date"
                  value={draftAsOf}
                  onChange={(e) => setDraftAsOf(e.target.value)}
                  max={TODAY()}
                  className="h-11 rounded-lg border border-border bg-background px-2.5 text-xs font-bold outline-none min-h-[44px]"
                  aria-label="Fecha de corte"
                  data-testid="filter-as-of"
                />
              </label>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Presets de período">
                  {PERIOD_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onPresetClick(p.id)}
                      aria-pressed={preset === p.id}
                      className={cn(
                        'h-11 px-3 rounded-lg border text-xs font-black uppercase tracking-wide transition-all min-h-[44px]',
                        preset === p.id
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted',
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Desde</span>
                  <input
                    type="date"
                    value={draftFrom}
                    onChange={(e) => {
                      setDraftFrom(e.target.value);
                      setPreset(null);
                    }}
                    className="h-11 rounded-lg border border-border bg-background px-2.5 text-xs font-bold outline-none min-h-[44px]"
                    aria-label="Fecha inicial"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Hasta</span>
                  <input
                    type="date"
                    value={draftTo}
                    onChange={(e) => {
                      setDraftTo(e.target.value);
                      setPreset(null);
                    }}
                    className="h-11 rounded-lg border border-border bg-background px-2.5 text-xs font-bold outline-none min-h-[44px]"
                    aria-label="Fecha final"
                  />
                </label>
              </>
            )}

            <div className="flex flex-wrap items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={applyFilters}
                className="h-11 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-black uppercase tracking-wide hover:opacity-90 transition-all min-h-[44px] flex items-center gap-1.5"
                data-testid="apply-filters"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Actualizar
              </button>
              <button
                type="button"
                onClick={handleExportPdf}
                disabled={exportsDisabled}
                title={
                  activeTab === 'dashboard'
                    ? 'Exportación disponible en las pestañas Situación y Rendimiento'
                    : activeTabHasData
                      ? 'Exportar la pestaña activa a PDF'
                      : 'Carga los datos primero'
                }
                className="h-11 px-3 rounded-lg border border-border text-xs font-black uppercase tracking-wide text-muted-foreground hover:bg-muted transition-all min-h-[44px] flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="export-pdf"
              >
                {exportingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                Exportar PDF
              </button>
              <button
                type="button"
                onClick={handleExportExcel}
                disabled={exportsDisabled}
                title={
                  activeTab === 'dashboard'
                    ? 'Exportación disponible en las pestañas Situación y Rendimiento'
                    : activeTabHasData
                      ? 'Exportar la pestaña activa a Excel'
                      : 'Carga los datos primero'
                }
                className="h-11 px-3 rounded-lg border border-border text-xs font-black uppercase tracking-wide text-muted-foreground hover:bg-muted transition-all min-h-[44px] flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="export-excel"
              >
                {exportingExcel ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                )}
                Exportar Excel
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-bold">{storeName}</span>
            <span aria-hidden>·</span>
            <span>
              {isPeriodTab
                ? `Período consultado: ${applied.from} — ${applied.to}`
                : `Fecha de corte: ${applied.asOf}`}
            </span>
            <span aria-hidden>·</span>
            <span>Importes en CUP (moneda contable)</span>
          </div>
        </div>
      </div>

      {/* Tabs (patrón SalesHistoryView: botones underline, sin Tabs de shadcn) */}
      <div className="flex border-b border-border overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {(
          [
            { id: 'situacion', label: 'Estado de Situación', icon: Scale, testId: 'tab-situacion' },
            { id: 'rendimiento', label: 'Estado de Rendimiento', icon: TrendingUp, testId: 'tab-rendimiento' },
            { id: 'dashboard', label: 'Dashboard', icon: BarChart3, testId: 'tab-dashboard' },
          ] as { id: FinancialStatementTabId; label: string; icon: React.ElementType; testId: string }[]
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex-1 py-3 px-4 text-xs font-black uppercase border-b-2 -mb-px whitespace-nowrap min-h-[44px] transition-colors',
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
            aria-label={tab.label}
            data-testid={tab.testId}
          >
            <tab.icon className="w-3.5 h-3.5 inline mr-1" /> {tab.label}
          </button>
        ))}
      </div>

      {/* Contenido por pestaña */}
      {activeTab === 'situacion' && (
        <BalanceSheetTab
          storeId={storeId}
          asOf={applied.asOf}
          refreshKey={refreshKey}
          onDataLoaded={onBalanceLoaded}
        />
      )}
      {activeTab === 'rendimiento' && (
        <IncomeStatementTab
          storeId={storeId}
          from={applied.from}
          to={applied.to}
          refreshKey={refreshKey}
          onDataLoaded={onIncomeLoaded}
        />
      )}
      {activeTab === 'dashboard' && (
        <DashboardTab
          storeId={storeId}
          from={applied.from}
          to={applied.to}
          refreshKey={refreshKey}
          onGoToTab={setActiveTab}
        />
      )}
    </div>
  );
}
