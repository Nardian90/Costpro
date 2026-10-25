'use client';

/**
 * CashReportView — Vista dedicada «Reporte de Caja — Entrega».
 *
 * ════════════════════════════════════════════════════════════════════════
 * CAMBIO 2026-10: el antiguo CashReportModal (overlay max-w-2xl) se convierte
 * en vista de primer nivel dentro de Ventas (viewId existente `cash_report`).
 * Única implementación del reporte (fuente compartida con la plantilla PDF);
 * el modal se elimina y sus accesos redirigen aquí (Caja → setCurrentView).
 * ════════════════════════════════════════════════════════════════════════
 *
 * §2 Configuración ≠ cálculo: cambiar tipo/fechas NO dispara fetches. Un único
 *    botón principal (Generar / Actualizar) calcula con los parámetros
 *    completos y validados; sin recálculos por render ni efectos por campo;
 *    sin solicitudes duplicadas (guard + abort); estado de carga no bloqueante
 *    e indicador de resultados vigentes vs anteriores.
 * §3 La plantilla persiste en localStorage (clave versionada, validada contra
 *    los ids canónicos, restaurada post-mount sin errores de hidratación).
 * §4 Pestaña «Vista previa»: MISMO builder que la descarga (doc.output
 *    'bloburl' en iframe); jspdf se carga en diferido solo al previsualizar o
 *    exportar; el blob se revoca al regenerar/desmontar; cache por firma.
 * §5 Paridad CUP/USD: ambas monedas con sugerir, configurar, personalizadas,
 *    conteo, total, esperado y cuadre. CUP añade 2000/5000. Sin cambios de
 *    reglas contables (esperado CUP = cash_balance_cup de la API; USD replica
 *    client-side la misma fórmula, sin conversión cambiaria).
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Printer, Download, DollarSign, TrendingUp, TrendingDown,
  ChevronDown, ChevronRight, Eye, Trash2, Save, RotateCcw, Settings,
  Sparkles, FileText, CheckSquare, Square, RefreshCw, AlertTriangle,
  Plus, X, ListChecks, FileSearch, Calculator, Users, Minus, BookOpen, Sheet,
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { isAdminLevel } from '@/lib/roles';
import { apiFetch } from '@/lib/api-fetch';
import { useAuthStore, useUIStore, type CommissionNavContext } from '@/store';
import { toast } from 'sonner';
import type { CashReport } from '@/types';
// MISIÓN 2026-10-23 (§8): flag central de desactivación temporal del ajuste
// extraordinario — la MISMA fuente que consulta el backend (feature-flags.ts).
import {
  CASH_ADJUSTMENT_DISABLED_MSG,
  isCashReportExtraordinaryAdjustmentEnabled,
} from '@/lib/feature-flags';
// FIX-RE-1510: ventana determinista en TZ de negocio (antes: new Date(day+'T00:00:00')
// dependía de la TZ del navegador → ventanas distintas según el equipo).
import { businessDayWindow } from '@/lib/cash-report/period-attribution';
import PageHeader from '@/components/ui/PageHeader';
import {
  DEFAULT_PDF_OPTIONS, buildCashReportPdf, fetchDiarioSummaries,
  loadPdfOptions, savePdfOptions, methodLabel,
  type CashReportStoreInfo, type CashReportPdfOptions, type CashReportSummaries,
} from './cash-report-pdf';
import { descargarCashReportExcel } from './cash-report-excel';
import {
  TEMPLATES, CUP_DEFAULT_DENOMS, USD_DEFAULT_DENOMS, LS_KEYS,
  loadPdfTemplate, savePdfTemplate, validatePdfTemplate,
  loadPdfOrientation, savePdfOrientation,
  PDF_ORIENTATIONS, DEFAULT_PDF_ORIENTATION,
  loadEnabledDenoms, saveEnabledDenoms,
  loadCustomDenoms, saveCustomDenoms,
  loadWorkingBreakdown, saveWorkingBreakdown, clearWorkingBreakdown,
  validateCustomDenom, addCustomDenom as addCustomDenomTo,
  removeCustomDenom as removeCustomDenomFrom,
  sanitizeCount, breakdownTotal, suggestBreakdown, computeExpectedCash,
  isDateRangeInvalid, isReportStale,
  loadHistory, saveHistory, formatUsd, formatDenomValue,
  type PdfTemplate, type PdfOrientation, type Breakdown, type Currency, type CustomDenoms, type SavedBreakdown,
} from './cash-report-core';
import { computeDailySummary, computeCuadre, cuadreLabel, type DailySummary } from '@/lib/cash-report/summary';
// MISIÓN CONCILIACIÓN (2026-10-26): cálculo personalizado según conceptos
// activos + resultado oficial de referencia (misma fuente que PDF y Excel).
import { computeCustomCurrencyResult, auditStatusLabel, type CustomCurrencyResult } from '@/lib/cash-report/custom-result';
// MISIÓN PERSONALIZACIÓN REPORTE ENTREGA (2026-10-25): selección de
// conceptos del Resumen del Día (persistida POR TIENDA) + selección de las
// ventas que se computan (filtro por composición real de pagos + checkbox
// por fila). Capa de presentación sobre las fuentes existentes: pantalla,
// vista previa, PDF y Excel consumen el MISMO reporte ajustado.
import {
  SUMMARY_CONCEPTS,
  DEFAULT_SUMMARY_CONCEPTS,
  SUMMARY_CONCEPT_KEYS,
  hasAnySummaryConcept,
  isDefaultSummaryConcepts,
  loadSummaryConcepts,
  saveSummaryConcepts,
  selectAllSummaryConcepts,
  deselectAllSummaryConcepts,
  classifySaleByPayments,
  buildSelectionAdjustedReport,
  buildSalesMethodGroups,
  buildItemsSummaryForSales,
  computeSelectedSalesTotals,
  selectionMethodLabel,
  type SaleRow,
  type SummaryConceptsSelection,
  type SummaryConceptKey,
  type SaleCurrencyClass,
} from '@/lib/cash-report/report-selection';

type ReportTab = 'resultados' | 'desglose' | 'preview';

type StoreInfo = CashReportStoreInfo;
const touch = 'min-h-[44px]';

export default function CashReportView() {
  const { user } = useAuthStore();
  const { setCurrentView, setCommissionNavContext } = useUIStore();

  // ── §2 Configuración (draft) — nunca dispara cálculos por sí misma ──
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));

  // ── §3 Plantilla: default legítimo en el primer render; restauración en mount ──
  // AUDITORÍA 2026-10 (§1): default = Diario (Empresa) ('diario' canónico).
  const [pdfTemplate, setPdfTemplate] = useState<PdfTemplate>('diario');
  // §1 del brief: orientación del documento, persistida como la plantilla.
  const [pdfOrientation, setPdfOrientation] = useState<PdfOrientation>(DEFAULT_PDF_ORIENTATION);
  // Opciones del documento (secciones del PDF) — aplican a vista previa y descarga.
  // MISIÓN 2026-10-22 (Parte A): restauradas de localStorage en mount y
  // persistidas al cambiar (patrón AUTO de plantilla/orientación — no hay
  // botón Guardar para las opciones, el guardado es explícito SOLO para el
  // conteo del desglose). El default solo aplica sin preferencia previa válida.
  const [pdfOptions, setPdfOptions] = useState<CashReportPdfOptions>(DEFAULT_PDF_OPTIONS);

  // ── §5: gestión de comisiones — NAV-2026-10 (callback definido tras `applied`) ──

  // ── Resultados aplicados (solo cambian al pulsar el botón principal) ──
  const [applied, setApplied] = useState<{ cfg: { startDate: string; endDate: string }; report: CashReport } | null>(null);
  const [loading, setLoading] = useState(false);
  const generatingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  // ── NAV-2026-10: «Gestionar comisiones» navega a la vista real Trabajadores y
  // Comisiones (workers) llevando el período del reporte en commissionNavContext
  // (consumo único, caduca a los 30 min). El flujo de cobro/confirmación vive en
  // esa vista (CommissionsManageModal reubicado allí); sin módulos duplicados.
  const gestionarComisiones = useCallback(() => {
    const period = applied?.cfg ?? { startDate, endDate };
    setCommissionNavContext({ period, setAt: Date.now() });
    setCurrentView('workers');
  }, [applied, startDate, endDate, setCommissionNavContext, setCurrentView]);

  // ── Desgloses (estado de conteo del usuario, independiente del cálculo) ──
  const [cupBreakdown, setCupBreakdown] = useState<Breakdown>({});
  const [usdBreakdown, setUsdBreakdown] = useState<Breakdown>({});
  // MISIÓN 2026-10-22 (Parte A): snapshot del último conteo GUARDADO explícitamente
  // («Guardar desglose» / Restaurar). Comparado con el conteo en marcha → indicador
  // discreto de cambios pendientes de guardar (nunca «guardado» falso).
  const [savedWorking, setSavedWorking] = useState<{ CUP: Breakdown; USD: Breakdown }>({ CUP: {}, USD: {} });
  const [workingSavedAt, setWorkingSavedAt] = useState('');
  const [cupDenoms, setCupDenoms] = useState<number[]>(CUP_DEFAULT_DENOMS);
  const [usdDenoms, setUsdDenoms] = useState<number[]>(USD_DEFAULT_DENOMS);
  const [customDenoms, setCustomDenoms] = useState<CustomDenoms>({ CUP: [], USD: [] });
  const [deliveredBy, setDeliveredBy] = useState('');
  const [recipientName, setRecipientName] = useState('');
  // INC-2026-10-19: tercer nombre del pie de firmas del Diario («Hecho por»).
  // Los tres se definen en la UI (Opciones del documento → Pie de firmas) y
  // se persisten como deliveredBy/recipient — NADA hardcodeado en el PDF.
  const [madeBy, setMadeBy] = useState('');
  const [savedHistory, setSavedHistory] = useState<SavedBreakdown[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showCupConfig, setShowCupConfig] = useState(false);
  const [showUsdConfig, setShowUsdConfig] = useState(false);
  const [showSuggested, setShowSuggested] = useState(false);
  const [cupCustomInput, setCupCustomInput] = useState('');
  const [usdCustomInput, setUsdCustomInput] = useState('');
  const [cupCustomError, setCupCustomError] = useState<string | null>(null);
  const [usdCustomError, setUsdCustomError] = useState<string | null>(null);

  // ── UI ──
  const [activeTab, setActiveTab] = useState<ReportTab>('resultados');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [itemDetails, setItemDetails] = useState<Record<string, unknown[]>>({});
  const [loadingDetails, setLoadingDetails] = useState<Set<string>>(new Set());
  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<Record<string, unknown> | null>(null);
  const [filterCurrency, setFilterCurrency] = useState<string>('');
  const [filterMethod, setFilterMethod] = useState<string>('');
  const [exporting, setExporting] = useState(false);

  // ══ MISIÓN PERSONALIZACIÓN (2026-10-25) · FUNCIÓN A — conceptos ══
  // Todos activados por defecto: reproduce el comportamiento actual para quien
  // aún no personaliza el reporte. Se restaura post-mount desde localStorage
  // AISLADO POR TIENDA (cada tienda entrega un dinero distinto — misión §6).
  const [summaryConcepts, setSummaryConcepts] = useState<SummaryConceptsSelection>(DEFAULT_SUMMARY_CONCEPTS);

  // ══ MISIÓN PERSONALIZACIÓN · FUNCIÓN B — selección de ventas ══
  // Estado natural = TODO seleccionado ( Set de ids EXCLUIDOS). NO se
  // persiste: un reporte de otro día/tienda/período nunca hereda selecciones
  // (misión §6) — se reconstruye al cambiar de tienda o período.
  const [excludedSales, setExcludedSales] = useState<ReadonlySet<string>>(() => new Set<string>());
  // Filtro por composición REAL de los pagos (CUP/USD/Mixta) — no conversión.
  const [saleClassFilter, setSaleClassFilter] = useState<'' | SaleCurrencyClass>('');
  // Acordeón de grupos de ventas (solo con sales_rows) + carga incremental.
  const [expandedSaleGroups, setExpandedSaleGroups] = useState<Set<string>>(new Set());
  const [saleRowsLimit, setSaleRowsLimit] = useState<Record<string, number>>({});

  // ── §3 Restauración de preferencias (post-mount, sin tocar hidratación) ──
  useEffect(() => {
    setPdfTemplate(loadPdfTemplate());
    setPdfOrientation(loadPdfOrientation());
    // MISIÓN 2026-10-22 (Parte A): las OPCIONES del documento también se
    // restauran — antes vivían solo en memoria y se perdían al reabrir el módulo.
    setPdfOptions(loadPdfOptions());
    setCupDenoms(loadEnabledDenoms('CUP'));
    setUsdDenoms(loadEnabledDenoms('USD'));
    setCustomDenoms(loadCustomDenoms());
    setDeliveredBy(localStorage.getItem(LS_KEYS.deliveredBy) || '');
    setRecipientName(localStorage.getItem(LS_KEYS.recipient) || '');
    setMadeBy(localStorage.getItem(LS_KEYS.madeBy) || '');
    setSavedHistory(loadHistory());
    // MISIÓN 2026-10-22 (Parte A): desglose de efectivo LABORAL — el conteo que
    // el usuario guardó explícitamente se restaura al abrir el módulo.
    const wb = loadWorkingBreakdown();
    setCupBreakdown(wb.CUP);
    setUsdBreakdown(wb.USD);
    setSavedWorking({ CUP: wb.CUP, USD: wb.USD });
    setWorkingSavedAt(wb.savedAt);
    // MISIÓN PERSONALIZACIÓN: conceptos del Resumen del Día — restaurados de
    // localStorage PROPIEDAD DE LA TIENDA ACTIVA (aislamiento §6).
    setSummaryConcepts(loadSummaryConcepts(user?.activeStoreId));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restauración post-mount
  }, []);

  // ── NAV-2026-10 (NAV-03): al Volver a Reporte Entrega, restaurar el período del
  // reporte que originó «Gestionar comisiones» (contexto consumo único, caduca a
  // los 30 min para no sorprender en sesiones posteriores).
  const commissionNavContext = useUIStore((s: { commissionNavContext: CommissionNavContext | null }) => s.commissionNavContext);
  useEffect(() => {
    if (!commissionNavContext) return;
    const fresh = Date.now() - commissionNavContext.setAt < 30 * 60 * 1000;
    if (fresh) {
      setStartDate(commissionNavContext.period.startDate);
      setEndDate(commissionNavContext.period.endDate);
    }
    setCommissionNavContext(null); // consumo único
    // eslint-disable-next-line react-hooks/exhaustive-deps -- consumo único en mount
  }, []);

  // Persistencia de datos de entrega (mismo comportamiento que el modal)
  useEffect(() => { if (deliveredBy) localStorage.setItem(LS_KEYS.deliveredBy, deliveredBy); }, [deliveredBy]);
  useEffect(() => { if (recipientName) localStorage.setItem(LS_KEYS.recipient, recipientName); }, [recipientName]);
  useEffect(() => { if (madeBy) localStorage.setItem(LS_KEYS.madeBy, madeBy); }, [madeBy]);

  const setTemplatePersisted = useCallback((t: PdfTemplate) => {
    setPdfTemplate(t);
    savePdfTemplate(t);
  }, []);

  // §1: la orientación persiste al cambiar (mismo mecanismo que la plantilla).
  const setOrientationPersisted = useCallback((o: PdfOrientation) => {
    setPdfOrientation(o);
    savePdfOrientation(o);
  }, []);

  // MISIÓN 2026-10-22 (Parte A): las opciones del documento persisten al
  // cambiar (patrón AUTO de plantilla/orientación — no existe botón Guardar
  // para ellas; el guardado explícito es SOLO del conteo del desglose).
  const togglePdfOption = useCallback((key: keyof CashReportPdfOptions) => {
    setPdfOptions(prev => {
      const next = { ...prev, [key]: !prev[key] };
      savePdfOptions(next);
      return next;
    });
  }, []);

  // ── Info de la tienda activa (misma lógica del modal) ──
  useEffect(() => {
    if (!user?.activeStoreId) return;
    const ctrl = new AbortController();
    (async () => {
      try {
        const data = await apiFetch(`/api/stores?status=all`);
        const stores = data?.data || data || [];
        const store = Array.isArray(stores) ? stores.find((s: Record<string, unknown>) => s.id === user.activeStoreId) : null;
        if (store && !ctrl.signal.aborted) {
          setStoreInfo({
            name: store.name || 'Tienda', logo_url: store.logo_url || null, address: store.address || null,
            phone: store.phone || null, email: store.email || null, reeup: store.reeup || null, nit: store.nit || null,
          });
        }
      } catch {}
    })();
    return () => ctrl.abort();
  }, [user?.activeStoreId]);

  // ── §2 Generar / Actualizar (única vía de cálculo) ──
  const rangeInvalid = isDateRangeInvalid({ startDate, endDate });
  const stale = isReportStale(applied?.cfg ?? null, { startDate, endDate });

  const handleGenerate = useCallback(async () => {
    if (generatingRef.current) return; // sin solicitudes duplicadas
    if (isDateRangeInvalid({ startDate, endDate })) {
      toast.error('Revisa el intervalo de fechas: la fecha inicial no puede ser posterior a la final.');
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    generatingRef.current = true;
    setLoading(true);
    try {
      // FIX-RE-1510: conversión determinista del día calendario a la TZ de negocio
      // (America/Havana) — misma ventana desde cualquier navegador/servidor.
      const { startIso: s } = businessDayWindow(startDate);
      const { endIso: e } = businessDayWindow(endDate);
      const data = await apiFetch(`/api/cash-report?start_date=${encodeURIComponent(s)}&end_date=${encodeURIComponent(e)}`, { signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      setApplied({ cfg: { startDate, endDate }, report: data });
      setExpandedItems(new Set());
      setItemDetails({});
      setLoadingDetails(new Set());
      toast.success(`Reporte calculado: ${startDate} → ${endDate}`);
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      if (e?.name === 'AbortError') return;
      if (!ctrl.signal.aborted) toast.error(e?.message || 'Error al generar el reporte. Tu configuración se conserva.');
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
      generatingRef.current = false;
    }
  }, [startDate, endDate]);

  // ══ MISIÓN PERSONALIZACIÓN · estado derivado de la selección ══
  // El reporte AJUSTADO sustituye SOLO lo derivado de las ventas (grupos,
  // split, equivalencias) por el recalculado con el conjunto seleccionado —
  // los cálculos existentes (computeDailySummary, PDF, Excel) operan sobre
  // este objeto: UNA sola fuente para pantalla, vista previa, PDF y Excel.
  const salesRows = useMemo<readonly SaleRow[]>(
    () => ((applied?.report as { sales_rows?: SaleRow[] } | undefined)?.sales_rows) ?? [],
    [applied],
  );
  const selection = useMemo(() => {
    if (!applied?.report) {
      return {
        report: null as CashReport | null,
        selectionActive: false,
        totals: computeSelectedSalesTotals([], new Set<string>()),
        rows: [] as readonly SaleRow[],
      };
    }
    return buildSelectionAdjustedReport(applied.report, salesRows, excludedSales);
  }, [applied, salesRows, excludedSales]);
  // La selección se RECONSTRUYE al cambiar de tienda o período (misión §6:
  // nunca hereda registros de otro día/tienda). El cambio de filtro de
  // composición NO la borra (misión §3.2).
  useEffect(() => {
    setExcludedSales(new Set<string>());
    setExpandedSaleGroups(new Set());
    setSaleRowsLimit({});
  }, [applied?.cfg.startDate, applied?.cfg.endDate, user?.activeStoreId]);

  // ── AUDITORÍA 2026-10: Resumen del Día con la fórmula centralizada (misma que PDF) ──
  const cupSummaryMemo = useMemo<DailySummary>(() => computeDailySummary(selection.report, 'CUP'), [selection]);
  const usdSummaryMemo = useMemo<DailySummary>(() => computeDailySummary(selection.report, 'USD'), [selection]);

  // ── MISIÓN CONCILIACIÓN (2026-10-26): resultado personalizado + oficial ──
  // Misma fuente que vista previa, PDF, impresión y Excel (custom-result.ts):
  // la selección de conceptos GOBIERNA el cálculo del esperado que muestra la
  // pantalla — EXACTAMENTE el mismo que se exporta. El oficial de referencia
  // queda disponible para el resumen de diferencias (misión §4.1/§6).
  const customResultsView = useMemo(() => {
    if (!applied?.report) return null;
    const base = applied.report;
    const sel = selection.report ?? base;
    const cupOficial = computeDailySummary(base, 'CUP');
    const usdOficial = computeDailySummary(base, 'USD');
    const cupSeleccion = computeDailySummary(sel, 'CUP');
    const usdSeleccion = computeDailySummary(sel, 'USD');
    const counts = { validas: selection.totals.totalCount, seleccionadas: selection.totals.includedCount };
    return {
      CUP: computeCustomCurrencyResult('CUP', cupOficial, cupSeleccion, summaryConcepts, counts),
      USD: computeCustomCurrencyResult('USD', usdOficial, usdSeleccion, summaryConcepts, counts),
    };
  }, [applied, selection, summaryConcepts]);

  // ── Totales y esperados (§5.4: sin conversión, monedas separadas) ──
  const cupTotal = useMemo(() => breakdownTotal(cupBreakdown), [cupBreakdown]);
  const usdTotal = useMemo(() => breakdownTotal(usdBreakdown), [usdBreakdown]);
  // AUDITORÍA 2026-10 (D4): esperado CUP desde la MISMA fórmula centralizada que
  // el PDF (antes: cash_balance_cup del RPC que excluía el efectivo de mixtas;
  // fallback a balance_cup del RPC que INCLUÍA transferencias — inconsistente).
  // MISIÓN CONCILIACIÓN: el esperado de la pantalla es el PERSONALIZADO (los
  // conceptos activos gobiernan el cálculo) — idéntico al exportado.
  const expectedCup = customResultsView?.CUP.efectivoEsperadoPersonalizado ?? cupSummaryMemo.efectivoEsperado;
  const expectedUsd = customResultsView?.USD.efectivoEsperadoPersonalizado ?? usdSummaryMemo.efectivoEsperado;
  const cupDifference = cupTotal - expectedCup;
  const usdDifference = usdTotal - expectedUsd;

  // ── MISIÓN PERSONALIZACIÓN: conceptos — persistencia y acciones ──
  // Persistencia AUTO (patrón de plantilla/orientación/opciones), POR TIENDA.
  // Al CAMBIAR de tienda se recarga la preferencia de la tienda activa.
  useEffect(() => {
    setSummaryConcepts(loadSummaryConcepts(user?.activeStoreId));
  }, [user?.activeStoreId]);
  const toggleSummaryConcept = useCallback((key: SummaryConceptKey) => {
    setSummaryConcepts(prev => {
      const next = { ...prev, [key]: !prev[key] };
      saveSummaryConcepts(user?.activeStoreId, next);
      return next;
    });
  }, [user?.activeStoreId]);
  const setAllSummaryConcepts = useCallback((all: boolean) => {
    const next = all ? selectAllSummaryConcepts() : deselectAllSummaryConcepts();
    setSummaryConcepts(next);
    saveSummaryConcepts(user?.activeStoreId, next);
    toast.info(all
      ? 'Todos los conceptos activados: el reporte reproduce el contenido completo.'
      : 'Todos los conceptos desactivados: selecciona al menos uno para poder exportar.',
      { duration: 5000 });
  }, [user?.activeStoreId]);
  const conceptsNone = !hasAnySummaryConcept(summaryConcepts);

  // ── MISIÓN PERSONALIZACIÓN: selección de ventas — acciones ──
  // «Seleccionar todas» = todas las ventas del período que cumplen el filtro
  // de composición ACTIVO (cargadas o no — el conjunto vive en memoria y es
  // determinista; se comunica con toast para que no sorprenda).
  const salesRowsForFilter = useMemo(
    () => (saleClassFilter ? salesRows.filter(r => classifySaleByPayments(r) === saleClassFilter) : salesRows),
    [salesRows, saleClassFilter],
  );
  const toggleSaleExcluded = useCallback((id: string) => {
    setExcludedSales(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const setSalesIncluded = useCallback((included: boolean, scopeNote: string) => {
    setExcludedSales(prev => {
      const next = new Set(prev);
      for (const row of salesRowsForFilter) {
        if (included) next.delete(row.id);
        else next.add(row.id);
      }
      return next;
    });
    const n = salesRowsForFilter.length;
    toast.info(included
      ? `Seleccionadas las ${n} ${n === 1 ? 'venta' : 'ventas'} del filtro${scopeNote ? ` (${scopeNote})` : ''}.`
      : `Desmarcadas las ${n} ${n === 1 ? 'venta' : 'ventas'} del filtro${scopeNote ? ` (${scopeNote})` : ''}: no computan en el reporte.`,
      { duration: 4000 });
  }, [salesRowsForFilter]);
  // Metadatos del documento (misión §5: el destinatario sabe qué conjunto ve).
  const selectionMeta = useMemo(() => ({
    included: selection.totals.includedCount,
    total: selection.totals.totalCount,
    filterLabel: saleClassFilter ? (saleClassFilter === 'MIXTA' ? 'Mixta' : saleClassFilter === 'OTRA' ? 'Otra moneda' : saleClassFilter) : undefined,
  }), [selection.totals, saleClassFilter]);

  // Denominaciones visibles: activadas ∪ personalizadas ∪ con conteo (nada contado se oculta)
  const cupDisplayDenoms = useMemo(() => {
    const set = new Set<number>([...cupDenoms, ...customDenoms.CUP, ...Object.keys(cupBreakdown).map(Number)]);
    return [...set].sort((a, b) => b - a);
  }, [cupDenoms, customDenoms.CUP, cupBreakdown]);
  const usdDisplayDenoms = useMemo(() => {
    const set = new Set<number>([...usdDenoms, ...customDenoms.USD, ...Object.keys(usdBreakdown).map(Number)]);
    return [...set].sort((a, b) => b - a);
  }, [usdDenoms, customDenoms.USD, usdBreakdown]);

  // Desglose sugerido del sistema (CUP, desde la API — informativo)
  const systemSuggested = applied?.report?.cash_breakdown ?? [];

  // ── Acciones de desglose por moneda (paridad §5.1) ──
  const handleSuggest = useCallback((currency: Currency) => {
    if (!applied?.report) {
      toast.info('Genera el reporte primero: pulsa «Generar reporte».');
      return;
    }
    const expected = currency === 'CUP' ? expectedCup : expectedUsd;
    if (expected <= 0) {
      toast.info(`No hay efectivo ${currency} para desglosar. El balance es ${currency === 'CUP' ? formatCurrency(expected) : formatUsd(expected)}.`, {
        description: expected < 0 ? 'Las salidas superan a los ingresos en efectivo.' : 'Los ingresos en efectivo igualan exactamente a las salidas.',
        duration: 5000,
      });
      if (currency === 'CUP') setCupBreakdown({}); else setUsdBreakdown({});
      return;
    }
    const denoms = [...(currency === 'CUP' ? cupDenoms : usdDenoms), ...customDenoms[currency]].sort((a, b) => b - a);
    const s = suggestBreakdown(expected, denoms);
    if (currency === 'CUP') setCupBreakdown(s); else setUsdBreakdown(s);
    toast.success(`Desglose sugerido aplicado: ${currency === 'CUP' ? formatCurrency(expected) : formatUsd(expected)}`);
  }, [applied, expectedCup, expectedUsd, cupDenoms, usdDenoms, customDenoms]);

  const handleClear = useCallback((currency: Currency) => {
    if (currency === 'CUP') setCupBreakdown({}); else setUsdBreakdown({});
  }, []);

  // «Limpiar todo» descarta también el conteo guardado explícitamente: al
  // reabrir el módulo NO reaparecen conteos que el usuario ya descartó.
  const handleClearAll = useCallback(() => {
    setCupBreakdown({});
    setUsdBreakdown({});
    clearWorkingBreakdown();
    setSavedWorking({ CUP: {}, USD: {} });
    setWorkingSavedAt('');
  }, []);

  const handleCountChange = useCallback((currency: Currency, denom: number, raw: string) => {
    const v = sanitizeCount(raw);
    const setter = currency === 'CUP' ? setCupBreakdown : setUsdBreakdown;
    setter(prev => ({ ...prev, [denom]: v }));
  }, []);

  const toggleDefaultDenom = useCallback((currency: Currency, d: number) => {
    if (currency === 'CUP') {
      setCupDenoms(prev => {
        const u = prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => b - a);
        saveEnabledDenoms('CUP', u);
        return u;
      });
    } else {
      setUsdDenoms(prev => {
        const u = prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => b - a);
        saveEnabledDenoms('USD', u);
        return u;
      });
    }
  }, []);

  const submitCustomDenom = useCallback((currency: Currency) => {
    const raw = currency === 'CUP' ? cupCustomInput : usdCustomInput;
    const res = validateCustomDenom(raw, currency, customDenoms);
    if (!res.ok) {
      if (currency === 'CUP') setCupCustomError(res.reason); else setUsdCustomError(res.reason);
      toast.error(res.reason);
      return;
    }
    const next = addCustomDenomTo(customDenoms, currency, res.value);
    setCustomDenoms(next);
    saveCustomDenoms(next);
    if (currency === 'CUP') { setCupCustomInput(''); setCupCustomError(null); } else { setUsdCustomInput(''); setUsdCustomError(null); }
    toast.success(`Denominación ${formatDenomValue(res.value, currency)} ${currency} añadida`);
  }, [cupCustomInput, usdCustomInput, customDenoms]);

  const handleRemoveCustomDenom = useCallback((currency: Currency, value: number) => {
    const next = removeCustomDenomFrom(customDenoms, currency, value);
    setCustomDenoms(next);
    saveCustomDenoms(next);
    // La eliminación de la denominación también retira su conteo (no queda nada invisible).
    const setter = currency === 'CUP' ? setCupBreakdown : setUsdBreakdown;
    setter(prev => {
      const { [value]: _removed, ...rest } = prev;
      return rest;
    });
    toast.info(`Denominación ${formatDenomValue(value, currency)} ${currency} eliminada`);
  }, [customDenoms]);

  const handleSaveHistory = useCallback(() => {
    const entry: SavedBreakdown = {
      id: Date.now().toString(),
      label: `${new Date().toLocaleDateString('es-CU')} ${deliveredBy || ''}`.trim(),
      date: new Date().toISOString(),
      breakdown: cupBreakdown,
      deliveredBy,
      recipientName,
      madeBy,
      total: cupTotal,
      usdBreakdown: usdBreakdown,
      usdTotal: usdTotal,
    };
    const u = [entry, ...savedHistory].slice(0, 10);
    setSavedHistory(u);
    saveHistory(u);
    // MISIÓN 2026-10-22 (Parte A): además del historial, el conteo queda como
    // DESGLOSE LABORAL persistido — al reabrir el módulo se restaura tal cual
    // (el defecto original: «Guardar desglose» solo creaba una entrada de
    // historial y el conteo en marcha se perdía al salir del módulo).
    const now = new Date().toISOString();
    saveWorkingBreakdown({ CUP: cupBreakdown, USD: usdBreakdown, savedAt: now });
    setSavedWorking({ CUP: cupBreakdown, USD: usdBreakdown });
    setWorkingSavedAt(now);
    toast.success(`Guardado (${u.length}/10) — el conteo queda activo al reabrir`);
  }, [cupBreakdown, usdBreakdown, cupTotal, usdTotal, deliveredBy, recipientName, madeBy, savedHistory]);

  const handleRestoreHistory = useCallback((h: SavedBreakdown) => {
    setCupBreakdown(h.breakdown || {});
    setUsdBreakdown(h.usdBreakdown || {});
    setDeliveredBy(h.deliveredBy || '');
    setRecipientName(h.recipientName || '');
    setMadeBy(h.madeBy || '');
    setShowHistory(false);
    // Restaurar también persiste el conteo restaurado como desglose laboral
    // (el usuario lo acaba de traer a la mesa de trabajo deliberadamente).
    const now = new Date().toISOString();
    saveWorkingBreakdown({ CUP: h.breakdown || {}, USD: h.usdBreakdown || {}, savedAt: now });
    setSavedWorking({ CUP: h.breakdown || {}, USD: h.usdBreakdown || {} });
    setWorkingSavedAt(now);
    toast.success('Desglose restaurado');
  }, []);

  // ── Detalle por acordeón (misma lógica del modal, con fechas aplicadas) ──
  const toggleAccordion = useCallback(async (key: string, type: 'sale' | 'payment', method: string, currency: string, refType?: string) => {
    const n = new Set(expandedItems);
    if (n.has(key)) { n.delete(key); setExpandedItems(n); return; }
    n.add(key); setExpandedItems(n);
    if (!itemDetails[key]) {
      const nl = new Set(loadingDetails); nl.add(key); setLoadingDetails(nl);
      try {
        const cfg = applied?.cfg;
        if (!cfg) throw new Error('Sin reporte calculado');
        // FIX-RE-1510: ventana de negocio determinista (día inicio → día fin)
        const { startIso: s, endIso: e } = (() => {
          const a = businessDayWindow(cfg.startDate);
          const b = businessDayWindow(cfg.endDate);
          return { startIso: a.startIso, endIso: b.endIso };
        })();
        let url = `/api/cash-report/details?type=${type}&method=${method}&currency=${currency}&start_date=${encodeURIComponent(s)}&end_date=${encodeURIComponent(e)}`;
        if (refType) url += `&ref_type=${refType}`;
        const data = await apiFetch(url);
        setItemDetails(prev => ({ ...prev, [key]: Array.isArray(data) ? data : (data?.data || []) }));
      } catch {
        setItemDetails(prev => ({ ...prev, [key]: [] }));
        toast.error('Error al cargar documentos');
      } finally {
        const nl2 = new Set(loadingDetails); nl2.delete(key); setLoadingDetails(nl2);
      }
    }
  }, [expandedItems, itemDetails, loadingDetails, applied]);

  // ── §4 Vista previa: mismo builder que la descarga, cache por firma ──
  // MISIÓN PERSONALIZACIÓN: la firma incluye conceptos + selección de ventas
  // (invalida el cache al cambiar CUALQUIER entrada del documento) y el ctx
  // inyecta el reporte AJUSTADO + concepts + selectionMeta, de modo que vista
  // previa y descarga son IDÉNTICAS por construcción (misma fuente).
  const previewSignature = useMemo(() => JSON.stringify({
    template: pdfTemplate,
    orientation: pdfOrientation, // §1: la orientación cambia el documento → invalida el cache
    options: pdfOptions, // opciones siempre parte de la firma
    concepts: summaryConcepts,
    excludedSales: [...excludedSales].sort(),
    cfg: applied?.cfg ?? null,
    cupBreakdown, usdBreakdown, deliveredBy, recipientName, madeBy,
    cupDenoms, usdDenoms, customDenoms,
  }), [pdfTemplate, pdfOrientation, pdfOptions, summaryConcepts, excludedSales, applied, cupBreakdown, usdBreakdown, deliveredBy, recipientName, madeBy, cupDenoms, usdDenoms, customDenoms]);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewSigRef = useRef<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const previewDocRef = useRef<Awaited<ReturnType<typeof buildCashReportPdf>> | null>(null);
  const buildingRef = useRef(false);

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current) {
      try { URL.revokeObjectURL(String(previewUrlRef.current)); } catch {}
      previewUrlRef.current = null;
    }
    previewDocRef.current = null;
    previewSigRef.current = null;
  }, []);

  useEffect(() => () => {
    // Libera el blob al desmontar la vista (§4 rendimiento y memoria)
    if (previewUrlRef.current) { try { URL.revokeObjectURL(String(previewUrlRef.current)); } catch {} }
  }, []);

  // MISIÓN PERSONALIZACIÓN: helper compartido por vista previa y exportaciones.
  // Aplica el reporte AJUSTADO (selección de ventas), los conceptos y los
  // metadatos del filtro; con selección activa, la tabla por producto se
  // recalcula del conjunto seleccionado con la MISMA función del servidor
  // (buildItemsSummary) — sin algoritmo paralelo.
  // MISIÓN CONCILIACIÓN (2026-10-26): además inyecta el REPORTE OFICIAL
  // (universo completo — applied.report SIN ajuste) y los conteos de ventas:
  // PDF, impresión, vista previa y Excel consumen el MISMO contrato con el
  // resultado personalizado + oficial + auditoría (misión §6).
  const buildSelectionCtx = useCallback(() => ({
    report: (selection.report ?? applied?.report)!,
    officialReport: applied?.report ?? undefined,
    salesCounts: {
      validas: selection.totals.totalCount,
      seleccionadas: selection.totals.includedCount,
    },
    concepts: summaryConcepts,
    selectionMeta,
  }), [selection, applied, summaryConcepts, selectionMeta]);
  const applySelectionToSummaries = useCallback((summaries: CashReportSummaries | undefined): CashReportSummaries | undefined => {
    if (!summaries || !selection.selectionActive) return summaries;
    const selectedRows = salesRows.filter(r => !excludedSales.has(r.id));
    return { ...summaries, itemsSummary: buildItemsSummaryForSales(selectedRows) };
  }, [selection.selectionActive, salesRows, excludedSales]);

  const buildPreview = useCallback(async (force = false) => {
    if (!applied?.report) return;
    if (conceptsNone) {
      setPreviewError('Selecciona al menos un concepto del Resumen del Día para generar el reporte.');
      setPreviewUrl(null);
      return;
    }
    if (buildingRef.current) return;
    if (!force && previewUrlRef.current && previewSigRef.current === previewSignature) return; // cache vigente
    buildingRef.current = true;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      let summaries: CashReportSummaries | undefined;
      if (pdfTemplate === 'diario') {
        // El diario necesita 4 resúmenes: fetch una vez y reutilizable por export
        summaries = await fetchDiarioSummaries(applied.cfg.startDate, applied.cfg.endDate);
      }
      summaries = applySelectionToSummaries(summaries);
      const selCtx = buildSelectionCtx();
      const doc = await buildCashReportPdf({
        report: selCtx.report,
        officialReport: selCtx.officialReport,
        salesCounts: selCtx.salesCounts,
        template: pdfTemplate,
        startDate: applied.cfg.startDate,
        endDate: applied.cfg.endDate,
        storeInfo, deliveredBy, recipientName, madeBy,
        cupDenoms: cupDenoms, usdDenoms: usdDenoms,
        cupBreakdown, usdBreakdown,
        options: pdfOptions,
        orientation: pdfOrientation,
        concepts: selCtx.concepts,
        selectionMeta: selCtx.selectionMeta,
      }, summaries);
      const url = doc.output('bloburl');
      const old = previewUrlRef.current;
      previewUrlRef.current = String(url);
      previewSigRef.current = previewSignature;
      previewDocRef.current = doc;
      setPreviewUrl(String(url));
      if (old) { try { URL.revokeObjectURL(String(old)); } catch {} }
    } catch (err: unknown) {
      const e = err as { message?: string };
      setPreviewError(e?.message || 'No se pudo generar la vista previa.');
    } finally {
      buildingRef.current = false;
      setPreviewLoading(false);
    }
  }, [applied, pdfTemplate, pdfOrientation, pdfOptions, storeInfo, deliveredBy, recipientName, madeBy, cupDenoms, usdDenoms, cupBreakdown, usdBreakdown, previewSignature, conceptsNone, applySelectionToSummaries, buildSelectionCtx]);

  // Al abrir la pestaña de vista previa con reporte calculado: construir si no hay cache
  useEffect(() => {
    if (activeTab === 'preview' && applied?.report) {
      void buildPreview(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const previewStale = !!applied && !!previewSigRef.current && previewSigRef.current !== previewSignature;

  // ── Exportar PDF (acción explícita e independiente de la vista previa) ──
  const [exportingExcel, setExportingExcel] = useState(false);

  // ── MISIÓN EXCEL 2026-10-21 (Parte B): exportar Excel .xlsx real ──
  // MISMA fuente de datos y parámetros que el PDF: reporte APLICADO (no el
  // borrador), mismos summaries (fetch una sola vez), mismas opciones. Sin
  // efectos contables: solo lectura del reporte ya calculado.
  const handleExportExcel = useCallback(async () => {
    if (!applied?.report) {
      toast.info('Genera el reporte primero: pulsa «Generar reporte».');
      return;
    }
    if (conceptsNone) {
      toast.error('Selecciona al menos un concepto del Resumen del Día: un reporte sin conceptos quedaría aparentemente vacío.');
      setActiveTab('resultados');
      return;
    }
    if (exportingExcel || exporting) return;
    setExportingExcel(true);
    try {
      let summaries: CashReportSummaries | undefined;
      if (pdfTemplate === 'diario') summaries = await fetchDiarioSummaries(applied.cfg.startDate, applied.cfg.endDate);
      summaries = applySelectionToSummaries(summaries);
      const selCtx = buildSelectionCtx();
      const filename = await descargarCashReportExcel({
        report: selCtx.report, template: pdfTemplate,
        officialReport: selCtx.officialReport,
        salesCounts: selCtx.salesCounts,
        startDate: applied.cfg.startDate, endDate: applied.cfg.endDate,
        storeInfo, deliveredBy, recipientName, madeBy,
        cupDenoms, usdDenoms, cupBreakdown, usdBreakdown, options: pdfOptions,
        orientation: pdfOrientation,
        concepts: selCtx.concepts,
        selectionMeta: selCtx.selectionMeta,
      }, summaries);
      toast.success(`Excel generado: ${filename}`);
    } catch (err: unknown) {
      const e = err as { message?: string };
      toast.error(e?.message || 'Error al generar el Excel.');
    } finally {
      setExportingExcel(false);
    }
  }, [applied, pdfTemplate, pdfOrientation, pdfOptions, storeInfo, deliveredBy, recipientName, madeBy, cupDenoms, usdDenoms, cupBreakdown, usdBreakdown, exporting, exportingExcel, conceptsNone, applySelectionToSummaries, buildSelectionCtx]);

  const handleExport = useCallback(async () => {
    if (!applied?.report) {
      toast.info('Genera el reporte primero: pulsa «Generar reporte».');
      return;
    }
    if (conceptsNone) {
      toast.error('Selecciona al menos un concepto del Resumen del Día: un reporte sin conceptos quedaría aparentemente vacío.');
      setActiveTab('resultados');
      return;
    }
    if (exporting) return;
    setExporting(true);
    try {
      // Reutiliza el documento ya construido si la configuración es idéntica (evita regenerar)
      let doc = previewDocRef.current;
      if (!doc || previewSigRef.current !== previewSignature) {
        let summaries: CashReportSummaries | undefined;
        if (pdfTemplate === 'diario') summaries = await fetchDiarioSummaries(applied.cfg.startDate, applied.cfg.endDate);
        summaries = applySelectionToSummaries(summaries);
        const selCtx = buildSelectionCtx();
        doc = await buildCashReportPdf({
          report: selCtx.report, template: pdfTemplate,
          officialReport: selCtx.officialReport,
          salesCounts: selCtx.salesCounts,
          startDate: applied.cfg.startDate, endDate: applied.cfg.endDate,
          storeInfo, deliveredBy, recipientName, madeBy,
          cupDenoms, usdDenoms, cupBreakdown, usdBreakdown, options: pdfOptions,
          orientation: pdfOrientation,
          concepts: selCtx.concepts,
          selectionMeta: selCtx.selectionMeta,
        }, summaries);
        if (previewSigRef.current === previewSignature) { previewDocRef.current = doc; }
      }
      const sn = (storeInfo?.name || 'Tienda').replace(/\s+/g, '_');
      const base = applied.cfg.startDate;
      const name = pdfTemplate === 'diario' ? `reporte_diario_${sn}_${base}.pdf` : `reporte_caja_${sn}_${base}.pdf`;
      doc.save(name);
      toast.success('PDF generado');
    } catch (err: unknown) {
      const e = err as { message?: string };
      toast.error(e?.message || 'Error al generar el PDF.');
    } finally {
      setExporting(false);
    }
  }, [applied, pdfTemplate, pdfOrientation, pdfOptions, storeInfo, deliveredBy, recipientName, madeBy, cupDenoms, usdDenoms, cupBreakdown, usdBreakdown, previewSignature, exporting, conceptsNone, applySelectionToSummaries, buildSelectionCtx]);

  // ── Acción principal (§2): Generar (sin resultados) / Actualizar (con resultados) ──
  const generateLabel = !applied ? 'Generar reporte' : 'Actualizar reporte';

  // ══ MISIÓN 2026-10-22 (rediseño Parte B): panel lateral INTEGRADO ══
  // Defecto corregido: el panel anterior era un overlay modal (fixed inset-0
  // + backdrop bg-background/70 backdrop-blur) — en tema oscuro el velo
  // oscurecía el reporte entero ("el contenido principal desaparece") y el
  // backdrop interceptaba los clics ("queda inutilizable"). Rediseño tomando
  // como referencia el patrón del MENÚ PRINCIPAL IZQUIERDO de COSTPRO
  // (Sidebar fija + redistribución del espacio con transición de 300ms
  // ease-in-out; en móvil, hoja superpuesta con backdrop) y el aside integrado
  // de POSExpressMode: en escritorio el panel es una COLUMNA REAL del layout
  // (flex) que cede espacio del reporte mediante redistribución controlada —
  // el reporte permanece VISIBLE y UTILIZABLE mientras el panel está abierto.
  const [configOpen, setConfigOpen] = useState(false);
  const configPanelRef = useRef<HTMLElement>(null);
  const configTriggerRef = useRef<HTMLButtonElement>(null);

  // Escritorio (≥lg): panel integrado no-modal. Móvil/tablet: hoja modal.
  // Mismo patrón de lectura que useIsMobile (innerWidth + resize).
  const [isDesktopViewport, setIsDesktopViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);
  useEffect(() => {
    const onResize = () => setIsDesktopViewport(window.innerWidth >= 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const closeConfig = useCallback(() => {
    setConfigOpen(false);
    // Devolver el foco al disparador (patrón dialog accesible).
    configTriggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!configOpen) return;
    // Foco inicial dentro del panel: el contenedor mismo (tabIndex -1); el Tab
    // fluye luego por los controles en orden natural (escritorio: no-modal —
    // el reporte sigue siendo alcanzable con Tab, como el resto de la app).
    configPanelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeConfig(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [configOpen, closeConfig]);

  // Opción «Desglose de efectivo» OFF → la pestaña de conteo no forma parte del
  // reporte (efecto consistente UI/PDF/Excel). Si estaba activa, volver a Resultados.
  const cashBreakdownEnabled = pdfOptions.includeCashBreakdown !== false;
  useEffect(() => {
    if (!cashBreakdownEnabled && activeTab === 'desglose') setActiveTab('resultados');
  }, [cashBreakdownEnabled, activeTab]);

  // Indicador discreto de cambios pendientes de guardar (conteo del desglose —
  // guardado EXPLÍCITO): compara el conteo en marcha con el último guardado.
  const workingDirty = useMemo(
    () => JSON.stringify(cupBreakdown) !== JSON.stringify(savedWorking.CUP)
      || JSON.stringify(usdBreakdown) !== JSON.stringify(savedWorking.USD),
    [cupBreakdown, usdBreakdown, savedWorking],
  );

  const fmt = (n: number, cur: string = 'CUP') => cur === 'CUP' ? formatCurrency(n) : `$${n.toFixed(2)}`;
  const btnIcn = `p-2 rounded-lg border border-border/40 hover:bg-muted ${touch} flex items-center justify-center`;

  return (
    // MISIÓN 2026-10-22 (rediseño Parte B): fila flex en escritorio — columna del
    // reporte (flex-1, TODO el contenido de la vista) + panel de configuración
    // integrado. Al abrir el panel, la columna cede espacio con la MISMA
    // transición del menú principal (300ms ease-in-out) — redistribución
    // controlada, sin overlay que oculte o bloquee el reporte.
    <div className="flex flex-col lg:flex-row lg:items-stretch" data-testid="cash-report-view">
      <div className="min-w-0 flex-1 space-y-4 sm:space-y-6">
      <PageHeader
        title="Reporte de Caja — Entrega"
        description="Cuadre y desglose de efectivo para la entrega de dinero del periodo."
        icon={Printer}
        // MISIÓN 2026-10-15 (RE): chip neutro para esta acción utilitaria —
        // en Dark+Enhanced el chip de marca (bg-brand → #39ff14) resultaba un
        // verde chillón confundible con un estado de éxito. Solo esta vista
        // opta por 'neutral'; el resto de PageHeaders conserva 'brand'.
        iconVariant="neutral"
        badge={
          !applied ? { text: 'Sin calcular', variant: 'default' }
            : stale ? { text: 'Resultados anteriores', variant: 'warning' }
              : { text: 'Al día', variant: 'success' }
        }
        primaryAction={
          <button
            onClick={handleGenerate}
            disabled={loading || rangeInvalid}
            aria-busy={loading}
            className={cn(
              'rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase hover:opacity-90 flex items-center justify-center gap-2 px-4',
              touch,
              (loading || rangeInvalid) && 'opacity-60 cursor-not-allowed',
            )}
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
            {loading ? 'Calculando…' : generateLabel}
          </button>
        }
        secondaryActions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Parte C: control visible y reconocible del panel de configuración. */}
            <button
              ref={configTriggerRef}
              onClick={() => setConfigOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={configOpen}
              data-testid="cash-report-config-trigger"
              title="Tipo de reporte, orientación y opciones del documento"
              className={cn(
                'px-3 rounded-xl border border-primary/40 bg-primary/10 text-primary text-xs font-black uppercase hover:bg-primary/20 flex items-center justify-center gap-1.5',
                touch,
              )}
            >
              <Settings className="w-4 h-4" />
              Configuración del reporte
            </button>
            <button
              onClick={handleExport}
              disabled={exporting || !applied}
              title={applied ? `Descarga el PDF de ${applied.cfg.startDate} → ${applied.cfg.endDate}` : 'Genera el reporte antes de exportar'}
              className={cn(
                'px-3 rounded-xl border border-border/40 text-xs font-black uppercase hover:bg-muted flex items-center justify-center gap-1.5',
                touch,
                (exporting || !applied) && 'opacity-60 cursor-not-allowed',
              )}
            >
              {exporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Exportar PDF
            </button>
            {/* MISIÓN EXCEL 2026-10-21: exportación .xlsx junto al PDF —
                misma fuente de datos, parámetros y reglas de negocio. */}
            <button
              onClick={handleExportExcel}
              disabled={exportingExcel || !applied}
              title={applied ? `Descarga el Excel (.xlsx) de ${applied.cfg.startDate} → ${applied.cfg.endDate}` : 'Genera el reporte antes de exportar'}
              data-testid="cash-report-export-excel"
              className={cn(
                'px-3 rounded-xl border border-border/40 text-xs font-black uppercase hover:bg-muted flex items-center justify-center gap-1.5',
                touch,
                (exportingExcel || !applied) && 'opacity-60 cursor-not-allowed',
              )}
            >
              {exportingExcel ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sheet className="w-4 h-4" />}
              Exportar Excel
            </button>
          </div>
        }
      />

      {/* Indicador de obsolescencia (§2): resultados de una configuración anterior */}
      {applied && stale && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-xs text-warning">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            Los resultados corresponden al periodo <strong>{applied.cfg.startDate} → {applied.cfg.endDate}</strong>.
            La configuración actual es <strong>{startDate} → {endDate}</strong>. Pulsa «Actualizar reporte» para calcularla.
          </span>
        </div>
      )}

      {/* ══ MISIÓN 2026-10-22 (Parte C): filtro esencial en la vista principal ══ */}
      {/* La vista prioriza el reporte: periodo + tabs + generación/exportación
          (acciones en el encabezado). La configuración de documento (tipo,
          orientación y opciones) vive en el panel lateral desplegable. */}
      <section aria-label="Periodo del reporte" className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[150px] max-w-[240px]">
            <label htmlFor="cr-sd" className="text-[10px] font-black uppercase text-muted-foreground">Desde</label>
            <input
              id="cr-sd" type="date" value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={cn('w-full px-3 py-2 rounded-lg border border-border/40 bg-background text-xs', touch)}
            />
          </div>
          <div className="flex-1 min-w-[150px] max-w-[240px]">
            <label htmlFor="cr-ed" className="text-[10px] font-black uppercase text-muted-foreground">Hasta</label>
            <input
              id="cr-ed" type="date" value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={cn('w-full px-3 py-2 rounded-lg border border-border/40 bg-background text-xs', touch)}
            />
          </div>
          <div className="flex-1 min-w-[220px] pt-1">
            {rangeInvalid && (
              <p role="alert" className="text-[11px] text-destructive flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> El intervalo es inválido: «Desde» no puede ser posterior a «Hasta».
              </p>
            )}
            {!rangeInvalid && (
              <p className="text-[10px] text-muted-foreground">
                Se calculará <strong className="text-foreground">{startDate} → {endDate}</strong> al pulsar «{generateLabel}».
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ══ Contenido del reporte (ancho completo, sin columna de configuración) ══ */}
      <div className="min-w-0">
          <div className="flex border-b border-border bg-card rounded-t-xl overflow-hidden" role="tablist" aria-label="Secciones del reporte">
            {(
              [
                ['resultados', 'Resultados', ListChecks],
                // MISIÓN 2026-10-22 (Parte B): la pestaña de conteo solo existe con
                // la opción «Desglose de efectivo» activa (efecto consistente UI/PDF/Excel).
                ...(cashBreakdownEnabled
                  ? ([['desglose', 'Desglose de efectivo', Calculator]] as Array<[ReportTab, string, React.ElementType]>)
                  : []),
                ['preview', 'Vista previa', FileSearch],
              ] as Array<[ReportTab, string, React.ElementType]>
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                role="tab"
                id={`cr-tab-${id}`}
                aria-selected={activeTab === id}
                aria-controls={`cr-panel-${id}`}
                onClick={() => setActiveTab(id)}
                className={cn(
                  'flex-1 py-2.5 px-3 text-[11px] sm:text-xs font-black uppercase tracking-widest transition-colors border-b-2 -mb-px flex items-center justify-center gap-1.5 min-h-[44px]',
                  activeTab === id
                    ? 'border-primary text-primary bg-primary/5'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30',
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{label}</span>
                {id === 'preview' && previewStale && <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-warning shrink-0" title="Vista previa desactualizada" />}
              </button>
            ))}
          </div>

          <div className="border border-t-0 border-border rounded-b-xl p-3 sm:p-4" role="tabpanel" id={`cr-panel-${activeTab}`} aria-labelledby={`cr-tab-${activeTab}`}>
            {activeTab === 'resultados' && (
              <ResultadosPanel
                applied={applied}
                loading={loading}
                expectedCup={expectedCup}
                summary={cupSummaryMemo}
                cupTotal={cupTotal}
                showCuadre={cashBreakdownEnabled}
                onGestionarComisiones={gestionarComisiones}
                onRefresh={handleGenerate}
                filterCurrency={filterCurrency}
                filterMethod={filterMethod}
                setFilterCurrency={setFilterCurrency}
                setFilterMethod={setFilterMethod}
                toggleAccordion={toggleAccordion}
                expandedItems={expandedItems}
                itemDetails={itemDetails}
                loadingDetails={loadingDetails}
                setSelectedDoc={setSelectedDoc}
                concepts={summaryConcepts}
                customResult={customResultsView?.CUP ?? null}
                onToggleConcept={toggleSummaryConcept}
                onSetAllConcepts={setAllSummaryConcepts}
                salesRows={salesRows}
                salesRowsTruncated={!!(applied?.report as { sales_rows_truncated?: boolean } | undefined)?.sales_rows_truncated}
                excludedSales={excludedSales}
                onToggleSale={toggleSaleExcluded}
                onSetSalesIncluded={setSalesIncluded}
                saleClassFilter={saleClassFilter}
                setSaleClassFilter={setSaleClassFilter}
                expandedSaleGroups={expandedSaleGroups}
                setExpandedSaleGroups={setExpandedSaleGroups}
                saleRowsLimit={saleRowsLimit}
                setSaleRowsLimit={setSaleRowsLimit}
              />
            )}

            {activeTab === 'desglose' && (
              <DesglosePanel
                applied={applied}
                cupDisplayDenoms={cupDisplayDenoms}
                usdDisplayDenoms={usdDisplayDenoms}
                cupDenoms={cupDenoms}
                usdDenoms={usdDenoms}
                customDenoms={customDenoms}
                cupBreakdown={cupBreakdown}
                usdBreakdown={usdBreakdown}
                cupTotal={cupTotal}
                usdTotal={usdTotal}
                expectedCup={expectedCup}
                expectedUsd={expectedUsd}
                cupDifference={cupDifference}
                usdDifference={usdDifference}
                systemSuggested={systemSuggested}
                showSuggested={showSuggested}
                setShowSuggested={setShowSuggested}
                showCupConfig={showCupConfig}
                showUsdConfig={showUsdConfig}
                setShowCupConfig={setShowCupConfig}
                setShowUsdConfig={setShowUsdConfig}
                cupCustomInput={cupCustomInput}
                usdCustomInput={usdCustomInput}
                setCupCustomInput={setCupCustomInput}
                setUsdCustomInput={setUsdCustomInput}
                cupCustomError={cupCustomError}
                usdCustomError={usdCustomError}
                setCupCustomError={setCupCustomError}
                setUsdCustomError={setUsdCustomError}
                showHistory={showHistory}
                setShowHistory={setShowHistory}
                savedHistory={savedHistory}
                workingDirty={workingDirty}
                workingSavedAt={workingSavedAt}
                onCountChange={handleCountChange}
                onToggleDefault={toggleDefaultDenom}
                onSubmitCustom={submitCustomDenom}
                onRemoveCustom={handleRemoveCustomDenom}
                onSuggest={handleSuggest}
                onClear={handleClear}
                onClearAll={handleClearAll}
                onSaveHistory={handleSaveHistory}
                onRestoreHistory={handleRestoreHistory}
              />
            )}

            {activeTab === 'preview' && (
              <PreviewPanel
                applied={applied}
                previewUrl={previewUrl}
                previewLoading={previewLoading}
                previewError={previewError}
                previewStale={previewStale}
                onBuild={() => void buildPreview(true)}
                onExport={handleExport}
                templateLabel={TEMPLATES.find(t => t.id === pdfTemplate)?.label ?? ''}
              />
            )}
          </div>
      </div>

      {/* ══ MISIÓN 2026-10-22 (rediseño Parte B): fin de la columna del reporte ══ */}
      </div>

      {/* Backdrop SOLO en móvil/tablet (<lg) — mismo patrón del menú principal
          izquierdo en móvil (bg-black/50 + cierre al pulsar). En escritorio NO
          existe: el panel está integrado y el reporte queda visible y clicable. */}
      {configOpen && (
        <div
          className="fixed inset-0 z-[204] bg-black/50 lg:hidden"
          onClick={closeConfig}
          aria-hidden="true"
          data-testid="cash-report-config-backdrop"
        />
      )}

      {/* ══ MISIÓN 2026-10-22 (rediseño Parte B): panel lateral INTEGRADO ══ */}
      {/* Escritorio (lg+): columna real del layout (patrón POSExpressMode aside
          + redistribución del menú principal): lg:w-[400px] con transición de
          anchura de 300ms ease-in-out — el reporte cede espacio sin ocultarse
          NI bloquearse (sin velo bg-background/70, sin backdrop). El contenido
          interno mantiene su ancho fijo (lg:w-[400px]) para no refluidar durante
          la transición. Móvil/tablet: hoja lateral derecha (fixed) con backdrop
          — patrón del menú izquierdo en móvil. Cierre: botón explícito, backdrop
          (móvil) o Escape; foco devuelto al disparador. Siempre montado: la
          visibilidad (visible/invisible + aria-hidden) gobierna el acceso — no
          hay desmontaje del reporte ni de la vista previa al abrir/cerrar. */}
      <aside
        ref={configPanelRef}
        tabIndex={-1}
        data-testid="cash-report-config-panel"
        data-open={configOpen}
        aria-hidden={!configOpen}
        role="dialog"
        aria-modal={configOpen && !isDesktopViewport ? true : undefined}
        aria-labelledby="cr-config-title"
        className={cn(
          // Móvil/tablet: hoja lateral derecha superpuesta.
          'fixed inset-y-0 right-0 z-[205] w-full max-w-[420px] bg-card border-l border-border shadow-2xl flex flex-col',
          'transition-[transform,width,opacity,visibility] duration-300 ease-in-out motion-reduce:transition-none',
          configOpen
            ? 'translate-x-0 visible opacity-100'
            : 'translate-x-full invisible opacity-0 pointer-events-none',
          // Escritorio: columna INTEGRADA (static) — empuja, no tapa.
          'lg:static lg:z-auto lg:max-w-none lg:translate-x-0 lg:shadow-none lg:rounded-2xl lg:border lg:border-border lg:border-l-0 lg:overflow-hidden lg:shrink-0 lg:min-w-0',
          configOpen ? 'lg:w-[400px] lg:visible lg:opacity-100' : 'lg:w-0 lg:invisible lg:opacity-0',
        )}
      >
        {/* Ancho fijo del contenido en escritorio: sin reflujo de controles
            durante la transición de anchura del aside. */}
        <div className="h-full w-full lg:w-[400px] flex flex-col">
            <header className="flex items-center justify-between px-4 py-3 border-b border-border/60 shrink-0">
              <h2 id="cr-config-title" className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                <Settings className="w-4 h-4 text-primary" /> Configuración del reporte
              </h2>
              <button
                onClick={closeConfig}
                aria-label="Cerrar configuración"
                data-testid="cash-report-config-close"
                className={cn('p-2 rounded-lg hover:bg-muted', touch)}
              >
                <X className="w-4 h-4" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {/* ── Tipo de reporte ── */}
              <section aria-label="Tipo de reporte" className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tipo de reporte</p>
                <div className="space-y-1.5" role="radiogroup" aria-label="Tipo de reporte">
                  {TEMPLATES.map(t => (
                    <button
                      key={t.id}
                      role="radio"
                      aria-checked={pdfTemplate === t.id}
                      onClick={() => setTemplatePersisted(t.id)}
                      className={cn(
                        'w-full flex items-start gap-2 p-2.5 rounded-lg border text-left transition-colors',
                        pdfTemplate === t.id ? 'border-primary bg-primary/10' : 'border-border/40 hover:bg-muted/30',
                      )}
                    >
                      <FileText className={cn('w-4 h-4 mt-0.5 shrink-0', pdfTemplate === t.id ? 'text-primary' : 'text-muted-foreground')} />
                      <span className="min-w-0">
                        <span className={cn('block text-xs font-bold', pdfTemplate === t.id && 'text-primary')}>{t.label}</span>
                        <span className="block text-[10px] text-muted-foreground leading-snug">{t.desc}</span>
                      </span>
                    </button>
                  ))}
                </div>
                {/* §3: la selección persiste en localStorage al cambiar (setTemplatePersisted). */}
              </section>

              {/* ── Orientación del documento ── */}
              <section aria-label="Orientación del documento" className="border-t border-border/40 pt-4 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Orientación del documento</p>
                <div className="space-y-1.5" role="radiogroup" aria-label="Orientación del documento">
                  {PDF_ORIENTATIONS.map(o => (
                    <button
                      key={o.id}
                      role="radio"
                      aria-checked={pdfOrientation === o.id}
                      onClick={() => setOrientationPersisted(o.id)}
                      className={cn(
                        'w-full flex items-center gap-2 p-2 rounded-lg border text-left transition-colors',
                        pdfOrientation === o.id ? 'border-primary bg-primary/10' : 'border-border/40 hover:bg-muted/30',
                      )}
                    >
                      <BookOpen className={cn('w-3.5 h-3.5 shrink-0', pdfOrientation === o.id ? 'text-primary' : 'text-muted-foreground')} />
                      <span className="min-w-0">
                        <span className={cn('block text-xs font-bold', pdfOrientation === o.id && 'text-primary')}>{o.label}</span>
                        <span className="block text-[10px] text-muted-foreground leading-snug">{o.desc}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              {/* ── Opciones del documento ── */}
              <section aria-label="Opciones del documento" className="border-t border-border/40 pt-4 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Opciones del documento</p>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Se aplican a la vista previa, el PDF y el Excel de la plantilla <strong>{TEMPLATES.find(t => t.id === pdfTemplate)?.label}</strong>.
                  Las secciones Productos Vendidos y Comisiones se incluyen siempre.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {(
                    [
                      // MISIÓN 2026-10-22 (Parte B): «Desglose de efectivo» — bloque
                      // completo (denominaciones + contado + cuadre) en UI/PDF/Excel.
                      ['includeCashBreakdown', 'Desglose de efectivo'],
                      ['includeBreakdown', 'Desglose billetes'],
                      ['includeUsd', 'Cuadre USD'],
                      ['includeSignature', 'Líneas de firma'],
                      // §9: false = CUP y USD corridos en la misma hoja; true = hojas separadas.
                      ['usdSeparatePage', 'USD en hoja separada'],
                      // §8.1: incluir/omitir el Reporte de Órdenes de Trabajo.
                      ['includeOtReport', 'Reporte de Órdenes de Trabajo'],
                      // §8.2: columna Comisión conmutable (el cálculo del resumen se conserva).
                      ['includeCommissionColumn', 'Columna Comisión'],
                      ['detailPayments', 'Detalle pagos'],
                      ['detailProduction', 'Detalle producción'],
                    ] as Array<[keyof CashReportPdfOptions, string]>
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => togglePdfOption(key)}
                      aria-pressed={!!pdfOptions[key]}
                      data-testid={`cr-option-${key}`}
                      className={cn(
                        'flex items-center gap-2 p-2 rounded-lg border text-left text-xs transition-colors',
                        pdfOptions[key] ? 'border-primary bg-primary/10 text-primary' : 'border-border/40 text-muted-foreground hover:bg-muted/30',
                      )}
                    >
                      {pdfOptions[key] ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                      <span className="font-bold">{label}</span>
                    </button>
                  ))}
                </div>

                {/* INC-2026-10-19 · Pie de firmas: los nombres se definen AQUÍ (nada
                    hardcodeado en el PDF). Visible «si procede»: con la opción
                    «Líneas de firma» activa. Se imprimen en ambos reportes (CUP y
                    USD) cuando comparten hoja o cada uno en la suya. */}
                {pdfOptions.includeSignature && (
                  <div className="rounded-xl border border-border/30 bg-muted/10 p-3 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nombres del pie de firmas</p>
                    <div className="grid grid-cols-1 gap-2">
                      <div>
                        <label htmlFor="cr-firmas-hecho" className="text-[9px] font-black uppercase text-muted-foreground">Hecho por</label>
                        <input
                          id="cr-firmas-hecho" type="text" value={madeBy}
                          onChange={(e) => setMadeBy(e.target.value)}
                          className={cn('w-full px-3 py-2 rounded border border-border/40 bg-background text-xs', touch)}
                          placeholder="Quien elabora el reporte"
                          autoComplete="off"
                        />
                      </div>
                      <div>
                        <label htmlFor="cr-firmas-entrega" className="text-[9px] font-black uppercase text-muted-foreground">Entregado por</label>
                        <input
                          id="cr-firmas-entrega" type="text" value={deliveredBy}
                          onChange={(e) => setDeliveredBy(e.target.value)}
                          className={cn('w-full px-3 py-2 rounded border border-border/40 bg-background text-xs', touch)}
                          placeholder="Quien entrega el dinero"
                          autoComplete="off"
                        />
                      </div>
                      <div>
                        <label htmlFor="cr-firmas-recibe" className="text-[9px] font-black uppercase text-muted-foreground">Recibido por</label>
                        <input
                          id="cr-firmas-recibe" type="text" value={recipientName}
                          onChange={(e) => setRecipientName(e.target.value)}
                          className={cn('w-full px-3 py-2 rounded border border-border/40 bg-background text-xs', touch)}
                          placeholder="Quien recibe el dinero"
                          autoComplete="off"
                        />
                      </div>
                    </div>
                    <p className="text-[9px] text-muted-foreground leading-relaxed">
                      Se imprimen bajo las líneas de firma del PDF (Hecho por / Entregado por / Recibido por). Sin nombre, la línea queda en blanco para firmar a mano — ningún nombre viene fijo del sistema.
                    </p>
                  </div>
                )}
              </section>
            </div>

            <footer className="px-4 py-3 border-t border-border/60 text-[10px] text-muted-foreground leading-relaxed shrink-0">
              Los cambios se guardan automáticamente en este navegador y se aplican a la vista previa, el PDF y el Excel.
              El conteo del desglose se guarda con «Guardar desglose».
            </footer>
        </div>
      </aside>

      {/* Overlay de detalle de documento (ojo) — portado del modal */}
      {selectedDoc && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={() => setSelectedDoc(null)}>
          <div className="w-full max-w-md bg-card border border-border/50 rounded-2xl shadow-2xl p-4 space-y-3" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Detalle de documento">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black uppercase">Detalle de Documento</h3>
              <button onClick={() => setSelectedDoc(null)} aria-label="Cerrar" className={cn('p-2 rounded-lg hover:bg-muted', touch)}><span className="text-lg">✕</span></button>
            </div>
            <DocDetail doc={selectedDoc} />
            <div className="flex gap-2 pt-2 border-t border-border/30">
              <button
                onClick={() => {
                  const type = selectedDoc._type as string;
                  const refType = selectedDoc._refType as string | undefined;
                  if (type === 'sale') setCurrentView('sales');
                  else if (refType === 'receipt') setCurrentView('reception_list');
                  else if (refType === 'service') setCurrentView('received-services');
                  else if (refType === 'commission') setCurrentView('workers');
                  else if (refType === 'production_order' || refType === 'work') setCurrentView('production-orders');
                  setSelectedDoc(null);
                }}
                className={cn('flex-1 rounded-lg bg-primary text-primary-foreground text-xs font-black uppercase hover:opacity-90 flex items-center justify-center gap-1.5', touch)}
              >
                <Eye className="w-3.5 h-3.5" /> Ver en módulo
              </button>
              <button onClick={() => setSelectedDoc(null)} className={cn('flex-1 rounded-lg border border-border/40 text-xs font-black uppercase hover:bg-muted', touch)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
      {/* NAV-2026-10: el modal de comisiones se reubicó en Trabajadores y Comisiones
          (WorkersView). «Gestionar comisiones» navega a esa vista conservando tienda y
          período — ver gestionarComisiones() arriba. */}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Sub-componentes
// ═══════════════════════════════════════════════════════════════════════════

function DocDetail({ doc }: { doc: Record<string, unknown> }) {
  const fmt = (n: number, cur: string = 'CUP') => cur === 'CUP' ? formatCurrency(n) : `$${n.toFixed(2)}`;
  const methodLabelLocal = methodLabel;
  return (
    <div className="space-y-2 text-xs">
      <div className="flex justify-between"><span className="text-muted-foreground">Tipo:</span><span className="font-bold">{doc._type === 'sale' ? 'Venta' : 'Pago a Proveedor'}</span></div>
      {doc._refType ? <div className="flex justify-between"><span className="text-muted-foreground">Ref. Tipo:</span><span className="font-bold capitalize">{String(doc._refType)}</span></div> : null}
      <div className="flex justify-between"><span className="text-muted-foreground">Fecha:</span><span className="font-mono">{String(doc.created_at || doc.payment_date || '—').slice(0, 16).replace('T', ' ') || '—'}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">Monto:</span><span className="font-mono font-black">{fmt(Number(doc.amount || doc.total || doc.total_amount || doc.amount_cup || 0), String(doc._currency || 'CUP'))}</span></div>
      {doc.payment_method ? <div className="flex justify-between"><span className="text-muted-foreground">Método:</span><span className="font-bold">{methodLabelLocal(String(doc.payment_method))}</span></div> : null}
      {doc.customer_name ? <div className="flex justify-between"><span className="text-muted-foreground">Cliente:</span><span className="font-bold">{String(doc.customer_name)}</span></div> : null}
      {doc.reference ? <div className="flex justify-between"><span className="text-muted-foreground">Referencia:</span><span className="font-mono">{String(doc.reference)}</span></div> : null}
      {doc.notes ? <div className="flex justify-between"><span className="text-muted-foreground">Notas:</span><span className="text-right">{String(doc.notes)}</span></div> : null}
      {doc.cash_amount != null && Number(doc.cash_amount) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Efectivo:</span><span className="font-mono">{formatCurrency(Number(doc.cash_amount))}</span></div>}
      {doc.transfer_amount != null && Number(doc.transfer_amount) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Transferencia:</span><span className="font-mono">{formatCurrency(Number(doc.transfer_amount))}</span></div>}
      {doc.status ? <div className="flex justify-between"><span className="text-muted-foreground">Estado:</span><span className="font-bold">{String(doc.status)}</span></div> : null}
      <div className="flex justify-between"><span className="text-muted-foreground">ID:</span><span className="font-mono text-[9px] text-muted-foreground">{String(doc.id ?? '')}</span></div>
    </div>
  );
}

// ── Fila del Resumen del Día ───────────────────────────────────────────
function SummaryRow({ label, value, strong, negative, note }: { label: string; value: number; strong?: boolean; negative?: boolean; note?: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2">
      <div className="min-w-0 pr-2">
        <p className={cn('text-xs', strong ? 'font-black' : 'font-normal', negative && 'text-muted-foreground')}>{label}</p>
        {note && <p className="text-[9px] text-muted-foreground italic">{note}</p>}
      </div>
      <p className={cn('text-sm font-mono font-bold tabular-nums shrink-0', negative ? 'text-destructive' : strong ? 'text-foreground' : 'text-foreground/90')}
        data-testid="summary-row-value" data-label={label}>
        {value < 0 ? '−' : ''}{formatCurrency(Math.abs(value))}
      </p>
    </div>
  );
}

// ══ MISIÓN PERSONALIZACIÓN (2026-10-25) · FUNCIÓN A ════════════════════════
// «Conceptos que se incluirán en el reporte»: checkbox independiente por
// concepto del Resumen del Día. Todos activados por defecto (= contenido
// actual). Desactivar un concepto lo omite de pantalla, vista previa, PDF e
// Excel. Seleccionar todos / Desmarcar todos + conteo activo. Sin conceptos
// activos: aviso claro y bloqueo de exportación (nada de reporte vacío).
function ConceptosSelector({ concepts, onToggle, onSetAll }: {
  concepts: SummaryConceptsSelection;
  onToggle: (key: SummaryConceptKey) => void;
  onSetAll: (all: boolean) => void;
}) {
  const activeCount = SUMMARY_CONCEPT_KEYS.filter(k => concepts[k]).length;
  const none = activeCount === 0;
  return (
    <section aria-label="Conceptos que se incluirán en el reporte" data-testid="conceptos-selector" className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-border/40 bg-muted/20">
        <h3 className="text-xs font-black uppercase tracking-wider">Conceptos que se incluirán en el reporte</h3>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground" aria-live="polite">
            {activeCount}/{SUMMARY_CONCEPT_KEYS.length} activos
          </span>
          <button
            onClick={() => onSetAll(true)}
            className="px-2.5 rounded-lg border border-border/40 text-[10px] font-black uppercase hover:bg-muted"
            data-testid="conceptos-seleccionar-todos"
          >
            Seleccionar todos
          </button>
          <button
            onClick={() => onSetAll(false)}
            className="px-2.5 rounded-lg border border-border/40 text-[10px] font-black uppercase hover:bg-muted"
            data-testid="conceptos-desmarcar-todos"
          >
            Desmarcar todos
          </button>
        </div>
      </div>
      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {SUMMARY_CONCEPTS.map(c => (
          <label
            key={c.key}
            className={cn(
              'flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-colors',
              concepts[c.key] ? 'border-primary/40 bg-primary/5' : 'border-border/40 opacity-70 hover:bg-muted/30',
            )}
          >
            <input
              type="checkbox"
              checked={concepts[c.key]}
              onChange={() => onToggle(c.key)}
              aria-label={c.label}
              data-testid={`concepto-${c.key}`}
              className="mt-0.5 w-4 h-4 accent-primary shrink-0 cursor-pointer"
            />
            <span className="min-w-0">
              <span className={cn('block text-xs font-bold leading-snug', concepts[c.key] ? 'text-foreground' : 'text-muted-foreground')}>{c.label}</span>
              {c.hint && <span className="block text-[10px] text-muted-foreground leading-snug">{c.hint}</span>}
            </span>
          </label>
        ))}
      </div>
      {none && (
        <p role="alert" className="px-4 py-2.5 border-t border-warning/30 bg-warning/10 text-[11px] text-warning flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          No hay conceptos seleccionados: el reporte quedaría aparentemente vacío. Activa al menos un concepto para poder previsualizarlo y exportarlo.
        </p>
      )}
      <p className="px-4 py-2 text-[10px] text-muted-foreground border-t border-border/20">
        La selección <strong className="text-foreground">gobierna el cálculo</strong> del reporte personalizado (conceptos
        activos + ventas seleccionadas) y se documenta en el <strong className="text-foreground">anexo de auditoría</strong> del
        PDF/Excel con la diferencia frente al reporte oficial. Nunca modifica saldos reales, el libro de caja ni registros
        almacenados.
      </p>
    </section>
  );
}

// ══ MISIÓN PERSONALIZACIÓN · FUNCIÓN B ════════════════════════════════════
// «Ventas por Método» con selección de ventas: filtro por composición REAL de
// los pagos (CUP/USD/Mixta — jamás la equivalencia contable) + checkbox por
// fila + acciones sobre el conjunto del filtro. Los importes de los grupos y
// del Resumen corresponden SOLO a las ventas seleccionadas; cada componente de
// pago se cuenta una sola vez en su grupo (método × moneda) y las monedas
// NUNCA se mezclan entre sí. La selección se conserva al cambiar el filtro.
function VentasSeleccionables(p: {
  salesRows: readonly SaleRow[];
  salesRowsTruncated: boolean;
  excludedSales: ReadonlySet<string>;
  onToggleSale: (id: string) => void;
  onSetSalesIncluded: (included: boolean, scopeNote: string) => void;
  saleClassFilter: '' | SaleCurrencyClass;
  setSaleClassFilter: (v: '' | SaleCurrencyClass) => void;
  expandedSaleGroups: ReadonlySet<string>;
  setExpandedSaleGroups: (v: Set<string>) => void;
  saleRowsLimit: Record<string, number>;
  setSaleRowsLimit: (v: Record<string, number>) => void;
  filterMethod: string;
}) {
  const fmtNative = (n: number, cur: string) => cur === 'CUP' ? formatCurrency(n) : `$${n.toFixed(2)}`;
  const ROWS_PER_PAGE = 30;
  // La opción «Otra moneda» solo aparece cuando existen ventas en monedas
  // distintas de CUP/USD (p. ej. MLC): nunca se excluyen silenciosamente.
  const hasOtra = p.salesRows.some(r => classifySaleByPayments(r) === 'OTRA');
  const filteredRows = useMemo(
    () => (p.saleClassFilter ? p.salesRows.filter(r => classifySaleByPayments(r) === p.saleClassFilter) : p.salesRows),
    [p.salesRows, p.saleClassFilter],
  );
  const groups = useMemo(
    () => buildSalesMethodGroups(filteredRows, p.excludedSales).filter(g => !p.filterMethod || g.method === p.filterMethod),
    [filteredRows, p.excludedSales, p.filterMethod],
  );
  const includedCount = filteredRows.length - filteredRows.filter(r => p.excludedSales.has(r.id)).length;
  const filterLabel = p.saleClassFilter === '' ? 'todas las ventas del período'
    : p.saleClassFilter === 'MIXTA' ? 'ventas mixtas (CUP + USD u otra)'
      : p.saleClassFilter === 'OTRA' ? 'ventas en otra moneda'
        : `ventas cobradas íntegramente en ${p.saleClassFilter}`;

  const toggleGroup = (key: string) => {
    const next = new Set(p.expandedSaleGroups);
    if (next.has(key)) next.delete(key); else next.add(key);
    p.setExpandedSaleGroups(next);
  };

  return (
    <div data-testid="ventas-seleccionables">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h3 className="text-[11px] font-black uppercase text-muted-foreground">Ventas por Método</h3>
        <p className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground" aria-live="polite" data-testid="ventas-seleccion-contador">
          {includedCount} de {filteredRows.length} ventas seleccionadas
        </p>
      </div>

      {/* Filtro por composición REAL de los pagos + acciones del conjunto */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <label htmlFor="cr-sale-class" className="text-[10px] font-black uppercase text-muted-foreground">Composición del pago</label>
        <select
          id="cr-sale-class"
          value={p.saleClassFilter}
          onChange={(e) => p.setSaleClassFilter(e.target.value as '' | SaleCurrencyClass)}
          aria-label="Filtrar ventas por composición real de los pagos"
          className="px-3 py-2 rounded-lg border border-border/40 bg-background text-xs min-h-[44px]"
          data-testid="ventas-filtro-composicion"
        >
          <option value="">Todas</option>
          <option value="CUP">CUP</option>
          <option value="USD">USD</option>
          <option value="MIXTA">Mixta</option>
          {hasOtra && <option value="OTRA">Otra moneda</option>}
        </select>
        <button
          onClick={() => p.onSetSalesIncluded(true, filterLabel)}
          disabled={filteredRows.length === 0}
          className="px-2.5 rounded-lg border border-border/40 text-[10px] font-black uppercase hover:bg-muted disabled:opacity-50 min-h-[36px]"
          data-testid="ventas-seleccionar-todas"
          title={`Selecciona ${filterLabel} del período (cargadas o no)`}
        >
          Seleccionar todas
        </button>
        <button
          onClick={() => p.onSetSalesIncluded(false, filterLabel)}
          disabled={filteredRows.length === 0}
          className="px-2.5 rounded-lg border border-border/40 text-[10px] font-black uppercase hover:bg-muted disabled:opacity-50 min-h-[36px]"
          data-testid="ventas-desmarcar-todas"
          title={`Desmarca ${filterLabel} del período`}
        >
          Desmarcar todas
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground mb-2">
        «Seleccionar todas» actúa sobre <strong className="text-foreground">{filterLabel}</strong> del período consultado. Cambiar el filtro no borra la selección anterior.
      </p>
      {p.salesRowsTruncated && (
        <p role="status" className="text-[10px] text-warning mb-2 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          El período excede el límite de filas cargables (1000): la selección cubre las ventas mostradas; los totales del reporte se calculan siempre sobre el período completo.
        </p>
      )}

      {/* Grupos (método × moneda): importes SOLO de las ventas seleccionadas */}
      <div className="space-y-1">
        {groups.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">Sin ventas para el filtro actual</p>
        ) : groups.map(g => {
          const expanded = p.expandedSaleGroups.has(g.key);
          const limit = p.saleRowsLimit[g.key] ?? ROWS_PER_PAGE;
          const visibleRows = g.rows.slice(0, limit);
          const remaining = g.rows.length - visibleRows.length;
          const groupAmountLabel = g.selectedBuckets.length === 0
            ? fmtNative(0, g.currency)
            : g.selectedBuckets.map(b => `${fmtNative(b.amount, b.currency)}`).join(' + ');
          return (
            <div key={g.key} className="rounded-lg border border-border/30 overflow-hidden" data-testid={`venta-grupo-${g.key}`}>
              <button
                onClick={() => toggleGroup(g.key)}
                aria-expanded={expanded}
                aria-controls={`vg-${g.key}`}
                className="w-full flex items-center justify-between p-3 bg-muted/10 hover:bg-muted/20 transition-colors min-h-[44px]"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{g.method === 'cash' ? '💵' : g.method === 'transfer' ? '📱' : '💳'}</span>
                  <div className="text-left">
                    <p className="text-xs font-bold">{selectionMethodLabel(g.method)} ({g.currency})</p>
                    <p className="text-[10px] text-muted-foreground">
                      {g.includedCount} de {g.totalCount} seleccionadas · {g.rows.length} {g.rows.length === 1 ? 'venta' : 'ventas'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-mono font-black tabular-nums">{groupAmountLabel}</p>
                  {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                </div>
              </button>
              {expanded && (
                <div id={`vg-${g.key}`} role="region" className="border-t border-border/20 bg-background">
                  <div className="max-h-80 overflow-y-auto">
                    <table className="w-full text-[10px]">
                      <thead className="sticky top-0 bg-muted/30 z-10">
                        <tr className="text-[9px] font-black uppercase text-muted-foreground border-b border-border/30">
                          <th className="p-1.5 w-8 text-center" scope="col">
                            <span className="sr-only">Incluir en el reporte</span>
                          </th>
                          <th className="p-1.5 text-left" scope="col">Fecha</th>
                          <th className="p-1.5 text-left" scope="col">Referencia / Cliente</th>
                          <th className="p-1.5 text-left" scope="col">Composición</th>
                          <th className="p-1.5 text-right shrink-0" scope="col">Monto ({g.currency})</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRows.map(row => {
                          const excluded = p.excludedSales.has(row.id);
                          const bucket = row.buckets.find(b => (b.method === 'transfer' || b.method === 'zelle' ? b.method : 'cash') === g.method && String(b.currency).toUpperCase() === g.currency);
                          const amount = bucket ? Number(bucket.amount) : 0;
                          const date = String(row.created_at || '').slice(0, 16).replace('T', ' ') || '—';
                          const composition = row.buckets
                            .map(b => `${selectionMethodLabel((b.method === 'transfer' || b.method === 'zelle') ? b.method : 'cash')} ${fmtNative(Math.abs(Number(b.amount)), String(b.currency).toUpperCase())}`)
                            .join(' + ');
                          return (
                            <tr key={row.id} className={cn('border-b border-border/10 hover:bg-muted/20', excluded && 'opacity-50')} data-testid={`venta-fila-${row.id}`} data-excluded={excluded}>
                              <td className="p-1.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={!excluded}
                                  onChange={() => p.onToggleSale(row.id)}
                                  aria-label={`Incluir la venta del ${date}${row.customer_name ? ` de ${row.customer_name}` : ''} por ${fmtNative(amount, g.currency)} ${g.currency} en el reporte`}
                                  className="w-4 h-4 accent-primary cursor-pointer"
                                />
                              </td>
                              <td className="p-1.5 font-mono text-[9px] whitespace-nowrap">{date}</td>
                              <td className="p-1.5">
                                {row.customer_name && <p className="text-[10px] font-bold truncate max-w-[160px]">{String(row.customer_name)}</p>}
                                {row.reference && <p className="text-[9px] text-muted-foreground truncate max-w-[160px]">{String(row.reference)}</p>}
                              </td>
                              <td className="p-1.5 text-[9px] text-muted-foreground">{composition}</td>
                              <td className="p-1.5 text-right font-mono tabular-nums font-bold whitespace-nowrap">
                                {fmtNative(amount, g.currency)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="sticky bottom-0 bg-primary/10 border-t-2 border-primary/30">
                        <tr className="text-[10px] font-black uppercase">
                          <td className="p-1.5" colSpan={4}>TOTAL SELECCIONADO ({g.includedCount} de {g.totalCount})</td>
                          <td className="p-1.5 text-right font-mono tabular-nums">{groupAmountLabel}</td>
                        </tr>
                      </tfoot>
                    </table>
                    {remaining > 0 && (
                      <div className="p-2 border-t border-border/20 text-center">
                        <button
                          onClick={() => p.setSaleRowsLimit({ ...p.saleRowsLimit, [g.key]: limit + ROWS_PER_PAGE })}
                          className="px-3 py-1.5 rounded-lg border border-border/40 text-[10px] font-black uppercase hover:bg-muted"
                        >
                          Ver más ({remaining} restantes)
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground mt-2">
        Las ventas desmarcadas no computan en los totales, los desgloses por método ni las exportaciones (PDF, impresión y Excel). Los egresos de caja y demás conceptos no dependen de esta selección.
      </p>
    </div>
  );
}

// ── §7: Ajustes extraordinarios (vía excepcional, nota obligatoria, auditada) ─
// MISIÓN 2026-10-23 (§8) — DESACTIVACIÓN TEMPORAL:
//   · No administradores: el contenedor NO se renderiza (ni inputs ni envío).
//   · Administradores: el apartado se MUESTRA en modo deshabilitado con el
//     aviso del flag central — pueden ver el estado y los ajustes históricos
//     del período, pero NO ejecutar (inputs/select/botón deshabilitados).
//   · El control REAL vive en el backend (POST /api/cash-report/adjustments
//     devuelve 503 para todos): manipular el frontend no permite ejecutar.
function AjustesExtraordinarios({ applied, onRefresh }: { applied: { cfg: { startDate: string; endDate: string }; report: CashReport } | null; onRefresh: () => void }) {
  const [direction, setDirection] = useState<'in' | 'out'>('out');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const touch = 'min-h-[44px]';

  // Flag central único (misma fuente que el backend) + rol GLOBAL admin
  // (no confundir con el acceso a una tienda específica — roles.ts).
  const ajusteActivo = isCashReportExtraordinaryAdjustmentEnabled();
  const isAdmin = useAuthStore(s => isAdminLevel(s.user?.role));

  const adjustments = ((applied?.report as unknown as { adjustments?: Array<{ id: string; direction: 'in' | 'out'; amount: number; note: string; created_at?: string }> })?.adjustments) || [];

  const canSubmit = ajusteActivo && applied && Number(amount) > 0 && note.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!applied || !canSubmit) return;
    setFormError(null);
    setSubmitting(true);
    try {
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error('El importe debe ser mayor que cero.');
      if (!note.trim()) throw new Error('La nota justificativa es obligatoria.');
      await apiFetch('/api/cash-report/adjustments', {
        method: 'POST',
        body: JSON.stringify({
          amount: amt,
          direction,
          note: note.trim(),
          payment_date: applied.cfg.startDate,
        }),
      });
      toast.success(`Ajuste ${direction === 'in' ? 'positivo' : 'negativo'} de ${formatCurrency(amt)} registrado`);
      setAmount(''); setNote('');
      onRefresh(); // recálculo del reporte con el ajuste incorporado
    } catch (err: unknown) {
      const e = err as { message?: string };
      const msg = e?.message || 'No se pudo registrar el ajuste.';
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // No administradores: contenedor OCULTO por completo (§8 — no pueden
  // seleccionar dirección, introducir importes, registrar notas ni confirmar).
  if (!isAdmin) return null;

  return (
    <section aria-label="Ajustes extraordinarios" data-testid="ajustes-extraordinarios" aria-disabled={!ajusteActivo} className={cn('rounded-2xl border border-warning/30 bg-warning/5 p-4 space-y-3', !ajusteActivo && 'opacity-70')}>
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
        <div>
          <h3 className="text-xs font-black uppercase tracking-wider">Ajuste extraordinario</h3>
          <p className="text-[10px] text-muted-foreground leading-snug">
            Vía excepcional para diferencias no clasificables. Requiere nota justificativa; queda auditado con usuario y fecha.
            No se usa para compensar errores de fórmulas.
          </p>
        </div>
      </div>
      {!ajusteActivo && (
        <p role="note" data-testid="ajustes-extraordinarios-desactivado" className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-[11px] font-bold text-warning">
          {CASH_ADJUSTMENT_DISABLED_MSG}
        </p>
      )}
      <div className={cn('grid grid-cols-1 sm:grid-cols-[110px_130px_minmax(0,1fr)_auto] gap-2 items-end', !ajusteActivo && 'pointer-events-none opacity-60')}>
        <div>
          <label htmlFor="adj-direction" className="block text-[10px] font-black uppercase text-muted-foreground mb-1">Dirección</label>
          <select id="adj-direction" value={direction} disabled={!ajusteActivo} onChange={e => setDirection(e.target.value as 'in' | 'out')} className={cn('w-full px-3 rounded-lg border border-border/40 bg-background text-xs', touch)}>
            <option value="out">Negativo (−)</option>
            <option value="in">Positivo (+)</option>
          </select>
        </div>
        <div>
          <label htmlFor="adj-amount" className="block text-[10px] font-black uppercase text-muted-foreground mb-1">Importe CUP</label>
          <input id="adj-amount" type="number" min="0" step="0.01" value={amount} disabled={!ajusteActivo} onChange={e => setAmount(e.target.value)}
            placeholder="0.00" className={cn('w-full px-3 rounded-lg border border-border/40 bg-background text-xs font-mono', touch)} />
        </div>
        <div>
          <label htmlFor="adj-note" className="block text-[10px] font-black uppercase text-muted-foreground mb-1">Nota justificativa *</label>
          <input id="adj-note" type="text" value={note} disabled={!ajusteActivo} onChange={e => setNote(e.target.value)} maxLength={500}
            placeholder="Motivo del ajuste (obligatorio)" className={cn('w-full px-3 rounded-lg border border-border/40 bg-background text-xs', touch)} />
        </div>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          aria-busy={submitting}
          aria-disabled={!canSubmit}
          className={cn('px-4 rounded-xl bg-warning text-white text-xs font-black uppercase hover:opacity-90 flex items-center gap-1.5', touch, !canSubmit && 'opacity-50 cursor-not-allowed')}
        >
          {submitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          {submitting ? 'Registrando…' : 'Registrar ajuste'}
        </button>
      </div>
      {formError && <p role="alert" className="text-[11px] text-destructive">{formError}</p>}
      {adjustments.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-black uppercase text-muted-foreground">Ajustes del período ({adjustments.length})</p>
          {adjustments.map(a => (
            <div key={a.id} className="flex items-center justify-between rounded-lg border border-border/40 bg-background px-3 py-2">
              <div className="min-w-0 pr-2">
                <p className="text-xs font-bold truncate">{a.direction === 'in' ? '+' : '−'}{formatCurrency(a.amount)}</p>
                <p className="text-[10px] text-muted-foreground truncate" title={a.note}>{a.note}</p>
              </div>
              <p className="text-[9px] font-mono text-muted-foreground shrink-0">{(a.created_at || '').slice(0, 10)}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Pestaña Resultados: Resumen del Día (fórmula centralizada) + ajustes + acordeones ─
interface ResultadosPanelProps {
  applied: { cfg: { startDate: string; endDate: string }; report: CashReport } | null;
  loading: boolean;
  expectedCup: number;
  /** AUDITORÍA 2026-10: resumen con la MISMA fórmula que el PDF (computeDailySummary). */
  summary: DailySummary | null;
  /** Total contado en el desglose de billetes CUP (efectivo entregado). */
  cupTotal: number;
  /** MISIÓN 2026-10-22 (Parte B): con «Desglose de efectivo» desactivado el
   *  bloque de cuadre (contado/diferencia) no forma parte del reporte — solo
   * se muestra el efectivo esperado (efecto consistente UI/PDF/Excel). */
  showCuadre: boolean;
  onGestionarComisiones: () => void;
  onRefresh: () => void;
  filterCurrency: string;
  filterMethod: string;
  setFilterCurrency: (v: string) => void;
  setFilterMethod: (v: string) => void;
  toggleAccordion: (key: string, type: 'sale' | 'payment', method: string, currency: string, refType?: string) => void;
  expandedItems: Set<string>;
  itemDetails: Record<string, unknown[]>;
  loadingDetails: Set<string>;
  setSelectedDoc: (d: Record<string, unknown> | null) => void;
  // ══ MISIÓN PERSONALIZACIÓN (2026-10-25) ══
  /** Conceptos activos (todos activados = comportamiento actual). */
  concepts: SummaryConceptsSelection;
  // ══ MISIÓN CONCILIACIÓN (2026-10-26) ══
  /** Resultado personalizado + oficial de la hoja CUP (custom-result.ts).
   *  Null-safe: sin reporte calculado la vista degrada al comportamiento previo. */
  customResult?: CustomCurrencyResult | null;
  onToggleConcept: (key: SummaryConceptKey) => void;
  onSetAllConcepts: (all: boolean) => void;
  /** Filas de venta individuales (vacío ⇔ no disponibles: fallback acordeón). */
  salesRows: readonly SaleRow[];
  salesRowsTruncated: boolean;
  excludedSales: ReadonlySet<string>;
  onToggleSale: (id: string) => void;
  onSetSalesIncluded: (included: boolean, scopeNote: string) => void;
  saleClassFilter: '' | SaleCurrencyClass;
  setSaleClassFilter: (v: '' | SaleCurrencyClass) => void;
  expandedSaleGroups: ReadonlySet<string>;
  setExpandedSaleGroups: (v: Set<string>) => void;
  saleRowsLimit: Record<string, number>;
  setSaleRowsLimit: (v: Record<string, number>) => void;
}

function ResultadosPanel(p: ResultadosPanelProps) {
  const fmt = (n: number, cur: string = 'CUP') => cur === 'CUP' ? formatCurrency(n) : `$${n.toFixed(2)}`;
  const touch = 'min-h-[44px]';
  const report = p.applied?.report;
  // Resumen del Día (fórmula centralizada — misma que el PDF). Null-safe.
  const s: DailySummary = p.summary ?? {
    currency: 'CUP', ventasCash: 0, ventasTransfer: 0, ventasZelle: 0, ventasMixed: 0,
    ventasTotales: 0, otIngresosCash: 0, comisionesCash: 0, comisionesTransfer: 0,
    serviciosRecibidosCash: 0, recibosProveedoresCash: 0, ajustesPositivos: 0,
    ajustesNegativos: 0, ajustesNeto: 0, ingresosCaja: 0, egresosCaja: 0, reembolsosCash: 0, reembolsosVoucher: 0,
    equivCashOtraMoneda: 0, equivVouchersOtraMoneda: 0,
    efectivoEsperado: p.expectedCup, saldoInicial: 0, liquidacionBilletes: 0, cobrosBilletes: 0,
  };
  const diferencia = computeCuadre(p.cupTotal, p.expectedCup);
  const cuadreState = cuadreLabel(diferencia);

  const filterSales = (s: Record<string, unknown>) => (!p.filterCurrency || s.currency === p.filterCurrency) && (!p.filterMethod || s.payment_method === p.filterMethod);
  const filterPayments = (q: Record<string, unknown>) => (!p.filterCurrency || q.currency === p.filterCurrency) && (!p.filterMethod || q.payment_method === p.filterMethod);

  const renderAccordionItem = (key: string, pm: string, currency: string, sublabel: string, amount: number, isNeg = false, refType?: string) => {
    const docs = p.itemDetails[key] || [];
    const isLoading = p.loadingDetails.has(key);
    const isExpanded = p.expandedItems.has(key);
    const docsTotal = docs.reduce((s: number, d: unknown) => s + Number((d as Record<string, unknown>).amount_cup || (d as Record<string, unknown>).amount || (d as Record<string, unknown>).total || (d as Record<string, unknown>).total_amount || 0), 0);
    return (
      <div key={key} className="rounded-lg border border-border/30 overflow-hidden">
        <button onClick={() => p.toggleAccordion(key, isNeg ? 'payment' : 'sale', pm, currency, refType)}
          aria-expanded={isExpanded} aria-controls={`p-${key}`}
          className={cn('w-full flex items-center justify-between p-3 bg-muted/10 hover:bg-muted/20 transition-colors', touch)}>
          <div className="flex items-center gap-2">
            <span className="text-lg">{pm === 'cash' ? '💵' : pm === 'transfer' ? '📱' : '💳'}</span>
            <div className="text-left">
              <p className="text-xs font-bold">{methodLabel(pm)} ({currency}){refType ? ` · ${refType}` : ''}</p>
              <p className="text-[10px] text-muted-foreground">{sublabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <p className={cn('text-sm font-mono font-black tabular-nums', isNeg ? 'text-destructive' : '')}>{isNeg ? '−' : ''}{fmt(amount, currency)}</p>
            {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </div>
        </button>
        {isExpanded && (
          <div id={`p-${key}`} role="region" className="border-t border-border/20 bg-background">
            {isLoading ? (
              <p className="text-xs text-muted-foreground text-center py-3">Cargando documentos...</p>
            ) : docs.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">Sin documentos</p>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-[10px]">
                  <thead className="sticky top-0 bg-muted/30 z-10">
                    <tr className="text-[9px] font-black uppercase text-muted-foreground border-b border-border/30">
                      <th className="p-1.5 text-left">Fecha</th>
                      <th className="p-1.5 text-left">Referencia / Cliente</th>
                      <th className="p-1.5 text-right shrink-0">Monto {currency}</th>
                      <th className="p-1.5 text-center w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map((raw, i: number) => {
                      const doc = raw as Record<string, unknown>;
                      const date = (String(doc.created_at || doc.payment_date || '')).slice(0, 16).replace('T', ' ') || '—';
                      const amt = Number(doc.amount_cup || doc.amount || doc.total || doc.total_amount || 0);
                      const ref = String(doc.reference || doc.reference_doc || doc.notes || '');
                      const customer = String(doc.customer_name || '');
                      const docRefType = String(doc.ref_type || '');
                      return (
                        <tr key={i} className="border-b border-border/10 hover:bg-muted/20">
                          <td className="p-1.5 font-mono text-[9px] whitespace-nowrap">{date}</td>
                          <td className="p-1.5">
                            {customer && <p className="text-[10px] font-bold truncate max-w-[160px]">{customer}</p>}
                            {ref && <p className="text-[9px] text-muted-foreground truncate max-w-[160px]">{ref}</p>}
                            {docRefType && <span className="inline-block mt-0.5 px-1 rounded bg-muted/40 text-[8px] text-muted-foreground">{docRefType}</span>}
                          </td>
                          <td className="p-1.5 text-right font-mono tabular-nums font-bold whitespace-nowrap">
                            {isNeg ? '−' : ''}{fmt(amt, currency)}
                          </td>
                          <td className="p-1.5 text-center">
                            <button
                              onClick={() => p.setSelectedDoc({ ...doc, _type: isNeg ? 'payment' : 'sale', _refType: docRefType, _currency: currency, _method: pm })}
                              aria-label="Ver documento"
                              className="p-1 rounded hover:bg-primary/10"
                            >
                              <Eye className="w-3 h-3 text-muted-foreground hover:text-primary" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-primary/10 border-t-2 border-primary/30">
                    <tr className="text-[10px] font-black uppercase">
                      <td className="p-1.5" colSpan={2}>TOTAL ({docs.length} docs)</td>
                      <td className="p-1.5 text-right font-mono tabular-nums">{isNeg ? '−' : ''}{fmt(docsTotal, currency)}</td>
                      <td className="p-1.5"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (p.loading) {
    return (
      <div className="p-8 text-center text-muted-foreground" aria-live="polite">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-xs">Calculando reporte...</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="p-8 text-center space-y-3">
        <ListChecks className="w-10 h-10 mx-auto text-muted-foreground/40" />
        <p className="text-sm font-bold">Sin reporte calculado</p>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          Configura el intervalo de fechas, abre «Configuración del reporte» para el tipo y las opciones del documento, y pulsa «Generar reporte» en el encabezado.
          No se calcula nada automáticamente al cambiar la configuración.
        </p>
      </div>
    );
  }

  const sales = (report.sales || []) as Array<Record<string, unknown>>;
  const payments = (report.payments || []) as Array<Record<string, unknown>>;
  const commissions = (report.commissions || []) as Array<Record<string, unknown>>;
  const production = ((report as unknown as { production?: Array<Record<string, unknown>> }).production || []);

  return (
    <div className="space-y-4">
      {/* ══ MISIÓN PERSONALIZACIÓN · FUNCIÓN A: conceptos del Resumen ══ */}
      <ConceptosSelector
        concepts={p.concepts}
        onToggle={p.onToggleConcept}
        onSetAll={p.onSetAllConcepts}
      />

      {/* AUDITORÍA 2026-10: Resumen del Día — fórmula centralizada, MISMA que el PDF.
          Orden lógico §4 del brief. Nombres inequívocos (esperado vs contado vs cuadre).
          MISIÓN PERSONALIZACIÓN: las filas cuyos conceptos están desactivados se
          OMITEN (misma regla que PDF/Excel — presentación pura: el esperado del
          pie NO se recalcula por ocultar una fila). */}
      <section aria-label="Resumen del Día" data-testid="resumen-del-dia" className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/20">
          <h3 className="text-xs font-black uppercase tracking-wider">Resumen del Día</h3>
          {/* §5.1: acción contextual para gestionar el pago de comisiones */}
          <button
            onClick={p.onGestionarComisiones}
            className={cn('px-3 rounded-xl bg-primary text-primary-foreground text-[10px] font-black uppercase hover:opacity-90 flex items-center gap-1.5', touch)}
          >
            <Users className="w-3.5 h-3.5" /> Gestionar comisiones
          </button>
        </div>
        <div className="divide-y divide-border/20">
          {/* MISIÓN CORRECTIVA 2026-10-25: saldo inicial del período (libro de
              caja) — partida real que abre el resumen; ocultarla (concepto) NO
              la saca del cálculo del esperado (presentación pura, §5). */}
          {p.concepts.saldoInicial && (
            <SummaryRow label="Saldo inicial / fondo de caja" value={s.saldoInicial} note="saldo del libro de caja inmediatamente anterior al período" />
          )}
          {p.concepts.resumenDia && <SummaryRow label="Ventas totales (efectivo + transferencia)" value={p.customResult?.ventasTotalesPersonalizado ?? s.ventasTotales} strong />}
          {p.concepts.ventasEfectivo && <SummaryRow label="Ventas en efectivo" value={s.ventasCash} />}
          {p.concepts.ventasTransferencia && <SummaryRow label="Ventas por transferencia" value={s.ventasTransfer} />}
          {p.concepts.ventasZelle && s.ventasZelle > 0 && <SummaryRow label="Ventas por Zelle" value={s.ventasZelle} />}
          {/* MISIÓN DEFINITIVA 2026-10-24: la equivalencia canónica NO es una
              segunda venta — línea propia de consolidación (contrato único §2).
              MISIÓN CORRECTIVA 2026-10-25: consolidación de PRESENTACIÓN —
              los billetes de ese cobro viven en la hoja USD y ya están en su
              esperado; no alimentan el esperado de la hoja CUP. */}
          {p.concepts.equivalenciaCup && s.equivCashOtraMoneda > 0 && <SummaryRow label="Equivalencia CUP de cobros en efectivo en otras monedas" value={s.equivCashOtraMoneda} note="consolidación contable — no es una segunda venta; no es efectivo físico CUP" />}
          {p.concepts.equivalenciaCup && s.equivVouchersOtraMoneda > 0 && <SummaryRow label="Equivalencia CUP de vouchers en otras monedas" value={s.equivVouchersOtraMoneda} note="informativo — no es efectivo físico" />}
          {p.concepts.otIngresos && s.otIngresosCash > 0 && <SummaryRow label="Órdenes de trabajo (anticipos)" value={s.otIngresosCash} />}
          {p.concepts.otrosEgresos && s.comisionesCash > 0 && <SummaryRow label="Comisiones pagadas en efectivo" value={-s.comisionesCash} negative />}
          {p.concepts.otrosEgresos && s.comisionesTransfer > 0 && <SummaryRow label="Comisiones pagadas por transferencia" value={-s.comisionesTransfer} negative note="no reduce el efectivo físico" />}
          {p.concepts.otrosEgresos && s.serviciosRecibidosCash > 0 && <SummaryRow label="Servicios recibidos pagados en efectivo" value={-s.serviciosRecibidosCash} negative />}
          {p.concepts.otrosEgresos && s.recibosProveedoresCash > 0 && <SummaryRow label="Pagos a proveedores (efectivo)" value={-s.recibosProveedoresCash} negative />}
          {p.concepts.ajustes && s.ajustesPositivos > 0 && <SummaryRow label="Ajustes extraordinarios (+)" value={s.ajustesPositivos} />}
          {p.concepts.ajustes && s.ajustesNegativos > 0 && <SummaryRow label="Ajustes extraordinarios (−)" value={-s.ajustesNegativos} negative />}
          {/* MISIÓN PERSONALIZACIÓN: los documentos de caja (fondo y otros) se
              muestran igual que en el PDF/Excel — la vista prevé el MISMO
              contenido del documento; «Egresos de caja» es concepto gobernable. */}
          {p.concepts.ingresosCaja && s.ingresosCaja > 0 && <SummaryRow label="Ingresos de caja (fondo y otros)" value={s.ingresosCaja} />}
          {p.concepts.egresosCaja && s.egresosCaja > 0 && <SummaryRow label="Egresos de caja (fondo y otros)" value={-s.egresosCaja} negative />}
          {p.concepts.reembolsos && s.reembolsosCash > 0 && <SummaryRow label="Reembolsos de devoluciones (efectivo)" value={-s.reembolsosCash} negative />}
          {p.concepts.reembolsos && s.reembolsosVoucher > 0 && <SummaryRow label="Reembolsos por voucher (transfer/Zelle)" value={-s.reembolsosVoucher} negative note="informativo — no reduce el efectivo físico" />}
          {/* MISIÓN CORRECTIVA 2026-10-25: liquidación de billetes (vuelto
              cruzado de cobros con liquidación explícita) — partida contable
              de la conciliación física; siempre visible cuando ≠ 0. */}
          {Math.abs(s.liquidacionBilletes) > 0.005 && (
            <SummaryRow
              label={s.currency === 'CUP' ? 'Vuelto dado en CUP de cobros en otras monedas' : 'Billetes recibidos en exceso (vuelto dado en CUP)'}
              value={s.liquidacionBilletes}
              negative={s.currency === 'CUP'}
              note="conciliación física de billetes (regla del libro de caja)"
            />
          )}
        </div>
        <div className="flex items-center justify-between px-4 py-3 bg-primary/10 border-t-2 border-primary/40">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase text-primary">{p.customResult?.esPersonalizado ? 'Efectivo esperado (personalizado)' : 'Efectivo esperado a entregar'}</p>
            {p.customResult?.esPersonalizado && (
              <p className="text-[9px] text-warning font-bold uppercase tracking-wide truncate">
                Reporte personalizado — conceptos seleccionados · el oficial va en el anexo de auditoría
              </p>
            )}
          </div>
          <p className="text-lg font-mono font-black tabular-nums text-primary">{formatCurrency(p.expectedCup)}</p>
        </div>
        {/* MISIÓN INTEGRIDAD DEL ANEXO (P1): resumen de diferencias frente al
            oficial — MISMA convención de signos que el PDF/impresión/Excel:
            diferencia = personalizado − oficial (positivo ⇒ el personalizado
            EXCEDE al oficial). Estado tri-estado inequívoco. */}
        {p.customResult?.esPersonalizado && (
          <div className="px-4 py-2 bg-warning/5 border-t border-warning/20 text-[10px] text-muted-foreground flex flex-wrap gap-x-4 gap-y-0.5" data-testid="resumen-diferencias">
            <span>Oficial: <strong className="text-foreground font-mono">{formatCurrency(p.customResult.conciliacion.efectivoEsperadoOficial)}</strong></span>
            <span>Dif. total (pers. − ofi.): <strong className="text-foreground font-mono">{p.customResult.conciliacion.diferenciaTotal >= 0 ? '+' : ''}{formatCurrency(p.customResult.conciliacion.diferenciaTotal)}</strong></span>
            <span>· por conceptos: <strong className="text-foreground font-mono">{p.customResult.conciliacion.diferenciaPorConceptos >= 0 ? '+' : ''}{formatCurrency(p.customResult.conciliacion.diferenciaPorConceptos)}</strong></span>
            <span>· por ventas: <strong className="text-foreground font-mono">{p.customResult.conciliacion.diferenciaPorVentas >= 0 ? '+' : ''}{formatCurrency(p.customResult.conciliacion.diferenciaPorVentas)}</strong></span>
            <span className={cn(
              'font-bold',
              p.customResult.conciliacion.estado === 'sin-diferencias' && 'text-success',
              p.customResult.conciliacion.estado === 'explicadas' && 'text-primary',
              p.customResult.conciliacion.estado === 'pendiente' && 'text-warning',
            )}>
              {auditStatusLabel(p.customResult.conciliacion.estado)}
            </span>
          </div>
        )}
      </section>

      {/* Cuadre: esperado vs contado — etiquetas inequívocas (§4). Con «Desglose
          de efectivo» OFF, el contado/diferencia no existe en el reporte. */}
      <section aria-label="Cuadre de caja" className={cn('grid gap-2', p.showCuadre ? 'grid-cols-3' : 'grid-cols-1')}>
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-center">
          <p className="text-[9px] font-black uppercase text-muted-foreground">{p.customResult?.esPersonalizado ? 'Efectivo esperado (personalizado)' : 'Efectivo esperado'}</p>
          <p className="text-base sm:text-lg font-mono font-black tabular-nums text-primary">{formatCurrency(p.expectedCup)}</p>
        </div>
        {p.showCuadre && (
          <>
            <div className="rounded-xl border border-info/20 bg-info/5 p-3 text-center">
              <p className="text-[9px] font-black uppercase text-muted-foreground">Efectivo contado</p>
              <p className="text-base sm:text-lg font-mono font-black tabular-nums text-foreground">{formatCurrency(p.cupTotal)}</p>
            </div>
            <div className={cn('rounded-xl border p-3 text-center', cuadreState === 'cuadrado' ? 'border-success/20 bg-success/5' : 'border-warning/30 bg-warning/5')}>
              <p className="text-[9px] font-black uppercase text-muted-foreground">
                Diferencia de cuadre {cuadreState === 'cuadrado' ? '(cuadrado)' : cuadreState === 'sobrante' ? '(sobrante)' : '(faltante)'}
              </p>
              <p className={cn('text-base sm:text-lg font-mono font-black tabular-nums', cuadreState === 'cuadrado' ? 'text-success' : 'text-warning')}>
                {diferencia > 0 ? '+' : ''}{formatCurrency(diferencia)}
              </p>
            </div>
          </>
        )}
      </section>

      {/* §7: Ajustes extraordinarios — vía excepcional con nota obligatoria */}
      <AjustesExtraordinarios applied={p.applied} onRefresh={p.onRefresh} />

      <p className="text-[10px] text-muted-foreground">
        Resultados de <strong className="text-foreground">{p.applied?.cfg.startDate} → {p.applied?.cfg.endDate}</strong>
      </p>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={p.filterCurrency} onChange={(e) => p.setFilterCurrency(e.target.value)} aria-label="Filtrar por moneda" className={cn('px-3 py-2 rounded-lg border border-border/40 bg-background text-xs', touch)}>
          <option value="">Todas las monedas</option>
          <option value="CUP">CUP</option>
          <option value="USD">USD</option>
          <option value="MLC">MLC</option>
        </select>
        <select value={p.filterMethod} onChange={(e) => p.setFilterMethod(e.target.value)} aria-label="Filtrar por método de pago" className={cn('px-3 py-2 rounded-lg border border-border/40 bg-background text-xs', touch)}>
          <option value="">Todos los métodos</option>
          <option value="cash">Efectivo</option>
          <option value="transfer">Transferencia</option>
          <option value="zelle">Zelle</option>
        </select>
      </div>

      {/* Ventas — MISIÓN PERSONALIZACIÓN: con sales_rows (reconstrucción por
          venta) la sección se rige por la SELECCIÓN de ventas: filtro por
          composición real de pagos + checkbox por fila + totales del conjunto
          seleccionado. Sin sales_rows (entorno sin reconstrucción) conserva el
          acordeón agregado previo, con la selección no disponible (documentada). */}
      {p.salesRows.length > 0 ? (
        <VentasSeleccionables
          salesRows={p.salesRows}
          salesRowsTruncated={p.salesRowsTruncated}
          excludedSales={p.excludedSales}
          onToggleSale={p.onToggleSale}
          onSetSalesIncluded={p.onSetSalesIncluded}
          saleClassFilter={p.saleClassFilter}
          setSaleClassFilter={p.setSaleClassFilter}
          expandedSaleGroups={p.expandedSaleGroups}
          setExpandedSaleGroups={p.setExpandedSaleGroups}
          saleRowsLimit={p.saleRowsLimit}
          setSaleRowsLimit={p.setSaleRowsLimit}
          filterMethod={p.filterMethod}
        />
      ) : (
        <div>
          <h3 className="text-[11px] font-black uppercase text-muted-foreground mb-2">Ventas por Método</h3>
          {(sales.length > 0) && (
            <p className="text-[10px] text-muted-foreground italic mb-2">
              La selección individual de ventas no está disponible para este período (sin reconstrucción por venta); se muestran todas las ventas del reporte.
            </p>
          )}
          <div className="space-y-1">
            {sales.filter(filterSales).length === 0 ? <p className="text-xs text-muted-foreground text-center py-2">Sin ventas</p> :
              sales.filter(filterSales).map((s, i) => renderAccordionItem(`s-${s.payment_method}-${s.currency}-${i}`, String(s.payment_method), String(s.currency), `${s.transaction_count} transacciones`, Number(s.total)))}
          </div>
        </div>
      )}

      {/* Pagos */}
      <div>
        <h3 className="text-[11px] font-black uppercase text-muted-foreground mb-2">Pagos a Proveedores</h3>
        <div className="space-y-1">
          {payments.filter(filterPayments).length === 0 ? <p className="text-xs text-muted-foreground text-center py-2">Sin pagos</p> :
            payments.filter(filterPayments).map((q, i) => renderAccordionItem(`p-${q.payment_method}-${q.currency}-${q.ref_type}-${i}`, String(q.payment_method), String(q.currency), `${q.payment_count} pagos`, Number(q.total), true, String(q.ref_type)))}
        </div>
      </div>

      {/* Comisiones */}
      {commissions.length > 0 && (
        <div>
          <h3 className="text-[11px] font-black uppercase text-muted-foreground mb-2 flex items-center gap-2">
            <span>Comisiones a Trabajadores</span>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground">
              {commissions.reduce((s: number, c: Record<string, unknown>) => s + Number(c.commission_count), 0)} pagos · {formatCurrency(commissions.reduce((s: number, c: Record<string, unknown>) => s + Number(c.total), 0))}
            </span>
          </h3>
          <div className="space-y-1">
            {commissions.filter(filterSales).length === 0 ? (
              <p className="text-[10px] text-muted-foreground italic py-2 text-center">
                Las comisiones existen pero están filtradas por la selección de moneda/método.
              </p>
            ) : (
              commissions.filter(filterSales).map((c, i) => renderAccordionItem(`c-${c.payment_method}-${c.currency}-${i}`, String(c.payment_method), String(c.currency), `${c.commission_count} comisiones`, Number(c.total), true, 'commission'))
            )}
          </div>
        </div>
      )}

      {/* Órdenes de Producción/Servicios — anticipos + pagos recibidos (INGRESOS) */}
      {production.length > 0 && (
        <div>
          <h3 className="text-[11px] font-black uppercase text-success mb-2">
            Órdenes de Producción/Servicios (Anticipos + Pagos recibidos)
          </h3>
          <div className="space-y-1">
            {production.filter(filterPayments).map((q: Record<string, unknown>, i: number) =>
              renderAccordionItem(`po-${q.payment_method}-${q.currency}-${q.ref_type}-${i}`, String(q.payment_method), String(q.currency), `${q.payment_count} pagos · ${q.ref_type === 'production_order' ? 'Producción' : 'Trabajo'}`, Number(q.total), false, String(q.ref_type)))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Pestaña Desglose: paridad CUP/USD ───────────────────────────────────────
interface DesglosePanelProps {
  applied: { cfg: { startDate: string; endDate: string }; report: CashReport } | null;
  cupDisplayDenoms: number[];
  usdDisplayDenoms: number[];
  cupDenoms: number[];
  usdDenoms: number[];
  customDenoms: CustomDenoms;
  cupBreakdown: Breakdown;
  usdBreakdown: Breakdown;
  cupTotal: number;
  usdTotal: number;
  expectedCup: number;
  expectedUsd: number;
  cupDifference: number;
  usdDifference: number;
  systemSuggested: Array<{ denom: number; count: number; total: number }>;
  showSuggested: boolean;
  setShowSuggested: (v: boolean) => void;
  showCupConfig: boolean;
  showUsdConfig: boolean;
  setShowCupConfig: (v: boolean) => void;
  setShowUsdConfig: (v: boolean) => void;
  cupCustomInput: string;
  usdCustomInput: string;
  setCupCustomInput: (v: string) => void;
  setUsdCustomInput: (v: string) => void;
  cupCustomError: string | null;
  usdCustomError: string | null;
  setCupCustomError: (v: string | null) => void;
  setUsdCustomError: (v: string | null) => void;
  showHistory: boolean;
  setShowHistory: (v: boolean) => void;
  savedHistory: SavedBreakdown[];
  /** MISIÓN 2026-10-22 (Parte A): indicador discreto de conteo pendiente de
   *  guardar (guardado explícito) y marca temporal del último guardado. */
  workingDirty: boolean;
  workingSavedAt: string;
  onCountChange: (currency: Currency, denom: number, raw: string) => void;
  onToggleDefault: (currency: Currency, d: number) => void;
  onSubmitCustom: (currency: Currency) => void;
  onRemoveCustom: (currency: Currency, value: number) => void;
  onSuggest: (currency: Currency) => void;
  onClear: (currency: Currency) => void;
  onClearAll: () => void;
  onSaveHistory: () => void;
  onRestoreHistory: (h: SavedBreakdown) => void;
}

function DenominationCountGrid({ currency, denoms, breakdown, onCountChange, custom }: {
  currency: Currency;
  denoms: number[];
  breakdown: Breakdown;
  onCountChange: (currency: Currency, denom: number, raw: string) => void;
  custom: number[];
}) {
  const touch = 'min-h-[44px]';
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
      {denoms.map(denom => {
        const isCustom = custom.includes(denom);
        return (
          <div key={denom} className={cn('flex items-center gap-1 rounded-lg px-1.5', isCustom && 'bg-info/5 border border-info/20')}>
            <span className="text-[10px] font-bold w-10 shrink-0" title={isCustom ? 'Denominación personalizada' : 'Denominación del catálogo'}>{formatDenomValue(denom, currency)}</span>
            {isCustom && <span className="text-[8px] font-black uppercase text-info shrink-0" aria-label="personalizada">P</span>}
            <span className="text-[10px] text-muted-foreground">×</span>
            <input
              type="number" min="0" step="1" inputMode="numeric"
              value={breakdown[denom] ?? ''}
              aria-label={`Cantidad de billetes de ${formatDenomValue(denom, currency)} ${currency}`}
              onChange={(e) => onCountChange(currency, denom, e.target.value)}
              className={cn('w-full min-w-0 px-2 py-2 rounded border border-border/40 bg-background text-xs font-mono', touch)}
              placeholder="0"
            />
          </div>
        );
      })}
    </div>
  );
}

function CustomDenomForm({ currency, value, setValue, error, setError, onSubmit }: {
  currency: Currency;
  value: string;
  setValue: (v: string) => void;
  error: string | null;
  setError: (v: string | null) => void;
  onSubmit: (currency: Currency) => void;
}) {
  const touch = 'min-h-[44px]';
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <input
          type="number" min="0" step="any" inputMode="decimal"
          value={value}
          aria-label={`Valor de nueva denominación personalizada ${currency}`}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSubmit(currency); } }}
          placeholder="Valor (ej. 300)"
          className={cn('flex-1 min-w-0 px-2 py-2 rounded border border-border/40 bg-background text-xs font-mono', touch)}
        />
        <button
          onClick={() => onSubmit(currency)}
          aria-label={`Añadir denominación personalizada ${currency}`}
          className={cn('px-3 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs font-black uppercase hover:bg-primary/20 flex items-center gap-1 shrink-0', touch)}
        >
          <Plus className="w-4 h-4" /> Añadir
        </button>
      </div>
      {error && <p role="alert" className="mt-1 text-[10px] text-destructive">{error}</p>}
    </div>
  );
}

function DenomConfigPanel({ currency, defaults, enabled, onToggleDefault, open, setOpen, customInput, setCustomInput, customError, setCustomError, onSubmitCustom, customDenoms, onRemoveCustom }: {
  currency: Currency;
  defaults: number[];
  enabled: number[];
  onToggleDefault: (currency: Currency, d: number) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  customInput: string;
  setCustomInput: (v: string) => void;
  customError: string | null;
  setCustomError: (v: string | null) => void;
  onSubmitCustom: (currency: Currency) => void;
  customDenoms: number[];
  onRemoveCustom: (currency: Currency, value: number) => void;
}) {
  return (
    <div className="mb-2">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center gap-1.5 text-[10px] font-black uppercase text-muted-foreground hover:text-foreground transition-colors py-1.5">
        <Settings className="w-3.5 h-3.5" /> Configurar denominaciones
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <div className="p-3 rounded-xl border border-border/30 bg-muted/10 space-y-3">
          <div>
            <p className="text-[10px] font-black uppercase text-muted-foreground mb-2">Catálogo {currency} (activa/desactiva):</p>
            <div className="flex flex-wrap gap-1.5">
              {defaults.map(d => (
                <button
                  key={d}
                  onClick={() => onToggleDefault(currency, d)}
                  aria-pressed={enabled.includes(d)}
                  aria-label={`Denominación ${formatDenomValue(d, currency)} ${currency}`}
                  className={cn('px-3 py-2 rounded-lg text-[10px] font-bold border min-h-[36px]', enabled.includes(d) ? 'border-primary bg-primary/10 text-primary' : 'border-border/40 text-muted-foreground')}
                >
                  {formatDenomValue(d, currency)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase text-muted-foreground mb-2">Añadir denominación personalizada:</p>
            <CustomDenomForm currency={currency} value={customInput} setValue={setCustomInput} error={customError} setError={setCustomError} onSubmit={onSubmitCustom} />
          </div>
          {customDenoms.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase text-muted-foreground mb-2">Personalizadas ({customDenoms.length}):</p>
              <div className="flex flex-wrap gap-1.5">
                {customDenoms.map(d => (
                  <span key={d} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold border border-info/30 bg-info/10 text-info">
                    {formatDenomValue(d, currency)}
                    <button
                      onClick={() => onRemoveCustom(currency, d)}
                      aria-label={`Eliminar denominación personalizada ${formatDenomValue(d, currency)} ${currency}`}
                      className="p-0.5 rounded hover:bg-info/20 focus:outline-none focus:ring-1 focus:ring-info/50"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DesglosePanel(p: DesglosePanelProps) {
  const touch = 'min-h-[44px]';
  const hasReport = !!p.applied;

  return (
    <div className="space-y-4">
      {!hasReport ? (
        <div className="p-6 text-center space-y-2">
          <Calculator className="w-8 h-8 mx-auto text-muted-foreground/40" />
          <p className="text-sm font-bold">Genera el reporte para contar el efectivo</p>
          <p className="text-xs text-muted-foreground">El desglose se coteja contra el balance esperado del periodo calculado.</p>
        </div>
      ) : (
        <>
          {/* Desglose sugerido por el sistema (CUP, informativo) */}
          {p.systemSuggested.length > 0 && (
            <div>
              <button onClick={() => p.setShowSuggested(!p.showSuggested)} aria-expanded={p.showSuggested} className="w-full flex items-center gap-2 text-[11px] font-black uppercase text-muted-foreground hover:text-foreground transition-colors py-2">
                {p.showSuggested ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />} Desglose Sugerido (CUP)
                <span className="ml-auto text-[10px] font-mono tabular-nums text-muted-foreground">{formatCurrency(p.expectedCup)}</span>
              </button>
              {p.showSuggested && (
                <div className="mt-2 rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-1">
                  {p.systemSuggested.map((d) => (
                    <div key={String(d.denom)} className="flex items-center justify-between text-sm">
                      <span className="font-bold">${d.denom} × {d.count}</span>
                      <span className="font-mono tabular-nums text-muted-foreground">{formatCurrency(Number(d.total))}</span>
                    </div>
                  ))}
                  <div className="border-t border-primary/20 pt-2 flex items-center justify-between">
                    <span className="text-xs font-black uppercase">Total sugerido:</span>
                    <span className="font-mono font-black text-primary">{formatCurrency(p.expectedCup)}</span>
                  </div>
                  <p className="text-[9px] text-muted-foreground pt-1">
                    Usa el botón <Sparkles className="w-2.5 h-2.5 inline" /> (Sugerir) de cada moneda para aplicar el desglose automáticamente.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* INC-2026-10-19: los nombres del pie de firmas (antes Entrega/Recibe
              aquí) se configuran en «Opciones del documento → Nombres del pie
              de firmas», junto al toggle «Líneas de firma» que los rige. */}

          {/* ── CUP ── */}
          <DenomPanel
            currency="CUP"
            title="Desglose para Entrega — CUP"
            totalLabel="Total CUP:"
            total={p.cupTotal}
            formatTotal={formatCurrency}
            expected={p.expectedCup}
            formatExpected={formatCurrency}
            difference={p.cupDifference}
            displayDenoms={p.cupDisplayDenoms}
            defaults={CUP_DEFAULT_DENOMS}
            enabled={p.cupDenoms}
            custom={p.customDenoms.CUP}
            breakdown={p.cupBreakdown}
            configOpen={p.showCupConfig}
            setConfigOpen={p.setShowCupConfig}
            customInput={p.cupCustomInput}
            setCustomInput={p.setCupCustomInput}
            customError={p.cupCustomError}
            setCustomError={p.setCupCustomError}
            onCountChange={p.onCountChange}
            onToggleDefault={p.onToggleDefault}
            onSubmitCustom={p.onSubmitCustom}
            onRemoveCustom={p.onRemoveCustom}
            onSuggest={() => p.onSuggest('CUP')}
            onClear={() => p.onClear('CUP')}
          />

          {/* ── USD (paridad §5.1: mismas capacidades) ── */}
          <DenomPanel
            currency="USD"
            title="Desglose para Entrega — USD"
            totalLabel="Total USD:"
            total={p.usdTotal}
            formatTotal={formatUsd}
            expected={p.expectedUsd}
            formatExpected={formatUsd}
            difference={p.usdDifference}
            displayDenoms={p.usdDisplayDenoms}
            defaults={USD_DEFAULT_DENOMS}
            enabled={p.usdDenoms}
            custom={p.customDenoms.USD}
            breakdown={p.usdBreakdown}
            configOpen={p.showUsdConfig}
            setConfigOpen={p.setShowUsdConfig}
            customInput={p.usdCustomInput}
            setCustomInput={p.setUsdCustomInput}
            customError={p.usdCustomError}
            setCustomError={p.setUsdCustomError}
            onCountChange={p.onCountChange}
            onToggleDefault={p.onToggleDefault}
            onSubmitCustom={p.onSubmitCustom}
            onRemoveCustom={p.onRemoveCustom}
            onSuggest={() => p.onSuggest('USD')}
            onClear={() => p.onClear('USD')}
          />

          {/* Historial + acciones globales */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button onClick={p.onSaveHistory} className={cn('px-3 rounded-lg border text-xs font-black uppercase flex items-center gap-1.5', touch, p.workingDirty ? 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/20' : 'border-border/40 hover:bg-muted')}>
              <Save className="w-4 h-4 text-primary" /> Guardar desglose
              {/* Indicador discreto de cambios pendientes (Parte A/C): solo con
                  conteo sin guardar — nunca «guardado» falso. */}
              {p.workingDirty && (
                <span data-testid="cr-working-dirty" title="Conteo sin guardar" aria-label="Conteo sin guardar"
                  className="w-1.5 h-1.5 rounded-full bg-warning shrink-0" />
              )}
            </button>
            <button onClick={() => p.setShowHistory(!p.showHistory)} aria-expanded={p.showHistory} className={cn('px-3 rounded-lg border border-border/40 text-xs font-black uppercase hover:bg-muted flex items-center gap-1.5', touch)}>
              <RotateCcw className="w-4 h-4" /> Restaurar
            </button>
            <button onClick={p.onClearAll} className={cn('px-3 rounded-lg border border-border/40 text-xs font-black uppercase hover:bg-muted flex items-center gap-1.5', touch)}>
              <Trash2 className="w-4 h-4 text-destructive" /> Limpiar todo
            </button>
            <span className="text-[10px] text-muted-foreground ml-auto" data-testid="cr-working-status">
              {p.workingDirty
                ? 'Conteo sin guardar — pulsa «Guardar desglose» para conservarlo al reabrir.'
                : p.workingSavedAt
                  ? `Guardado ${new Date(p.workingSavedAt).toLocaleString('es')} — se restaura al reabrir el módulo.`
                  : 'Guarda CUP + USD y los nombres del pie de firmas.'}
            </span>
          </div>
          {p.showHistory && (
            <div className="p-3 rounded-xl border border-border/30 bg-muted/10 max-h-40 overflow-y-auto">
              <p className="text-[10px] font-black uppercase text-muted-foreground mb-2">Historial ({p.savedHistory.length}/10):</p>
              {p.savedHistory.length === 0 ? <p className="text-xs text-muted-foreground">Sin guardados</p> :
                p.savedHistory.map(h => (
                  <button key={h.id} onClick={() => p.onRestoreHistory(h)} className="w-full flex items-center justify-between p-2 rounded hover:bg-muted/30 text-left min-h-[36px]">
                    <span className="text-[10px]">{h.label}</span>
                    <span className="text-[10px] font-mono">{formatCurrency(h.total)}{h.usdTotal ? ` · ${formatUsd(h.usdTotal)}` : ''}</span>
                  </button>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Panel de una moneda (paridad: mismo componente para CUP y USD) ─────────
interface DenomPanelProps {
  currency: Currency;
  title: string;
  totalLabel: string;
  total: number;
  formatTotal: (n: number) => string;
  expected: number;
  formatExpected: (n: number) => string;
  difference: number;
  displayDenoms: number[];
  defaults: number[];
  enabled: number[];
  custom: number[];
  breakdown: Breakdown;
  configOpen: boolean;
  setConfigOpen: (v: boolean) => void;
  customInput: string;
  setCustomInput: (v: string) => void;
  customError: string | null;
  setCustomError: (v: string | null) => void;
  onCountChange: (currency: Currency, denom: number, raw: string) => void;
  onToggleDefault: (currency: Currency, d: number) => void;
  onSubmitCustom: (currency: Currency) => void;
  onRemoveCustom: (currency: Currency, value: number) => void;
  onSuggest: () => void;
  onClear: () => void;
}

function DenomPanel(props: DenomPanelProps) {
  const touch = 'min-h-[44px]';
  const btnIcn = `p-2 rounded-lg border border-border/40 hover:bg-muted ${touch} flex items-center justify-center`;
  const { difference } = props;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h3 className="text-[11px] font-black uppercase text-muted-foreground">{props.title}</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={props.onSuggest} aria-label={`Sugerir desglose ${props.currency}`} title={`Sugerir desglose ${props.currency}`} className={btnIcn}><Sparkles className="w-4 h-4 text-primary" /></button>
          <button onClick={props.onClear} aria-label={`Limpiar desglose ${props.currency}`} title={`Limpiar desglose ${props.currency}`} className={btnIcn}><Trash2 className="w-4 h-4 text-destructive" /></button>
          <button onClick={() => props.setConfigOpen(!props.configOpen)} aria-label={`Configurar denominaciones ${props.currency}`} aria-expanded={props.configOpen} title="Configurar denominaciones" className={btnIcn}><Settings className="w-4 h-4" /></button>
        </div>
      </div>
      {props.configOpen && (
        <div className="mb-2">
          <DenomConfigPanel
            currency={props.currency}
            defaults={props.defaults}
            enabled={props.enabled}
            onToggleDefault={props.onToggleDefault}
            open={props.configOpen}
            setOpen={props.setConfigOpen}
            customInput={props.customInput}
            setCustomInput={props.setCustomInput}
            customError={props.customError}
            setCustomError={props.setCustomError}
            onSubmitCustom={props.onSubmitCustom}
            customDenoms={props.custom}
            onRemoveCustom={props.onRemoveCustom}
          />
        </div>
      )}
      <div className="rounded-xl border border-border/40 p-3 space-y-2">
        <DenominationCountGrid
          currency={props.currency}
          denoms={props.displayDenoms}
          breakdown={props.breakdown}
          onCountChange={props.onCountChange}
          custom={props.custom}
        />
        {props.displayDenoms.length === 0 && (
          <p className="text-[10px] text-muted-foreground italic text-center py-2">No hay denominaciones activadas. Actívalas en «Configurar denominaciones».</p>
        )}
        <div className="border-t border-border/40 pt-2 space-y-1">
          <div className="flex items-center justify-between"><span className="text-xs font-black uppercase">{props.totalLabel}</span><span className="font-mono font-black">{props.formatTotal(props.total)}</span></div>
          <div className="flex items-center justify-between"><span className="text-xs font-black uppercase">Esperado:</span><span className="font-mono font-black text-primary">{props.formatExpected(props.expected)}</span></div>
          <div className={cn('flex items-center justify-between rounded-lg px-2 py-1.5', difference === 0 ? 'bg-success/10' : 'bg-destructive/10')}>
            <span className="text-xs font-black uppercase">{difference === 0 ? 'Cuadrado' : difference > 0 ? 'Sobrante' : 'Faltante'}:</span>
            <span className={cn('font-mono font-black', difference === 0 ? 'text-success' : 'text-destructive')}>{props.formatExpected(Math.abs(difference))}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Pestaña Vista previa (§4) ───────────────────────────────────────────────
interface PreviewPanelProps {
  applied: { cfg: { startDate: string; endDate: string }; report: CashReport } | null;
  previewUrl: string | null;
  previewLoading: boolean;
  previewError: string | null;
  previewStale: boolean;
  onBuild: () => void;
  onExport: () => void;
  templateLabel: string;
}

function PreviewPanel(p: PreviewPanelProps) {
  if (!p.applied) {
    return (
      <div className="p-8 text-center space-y-3">
        <FileSearch className="w-10 h-10 mx-auto text-muted-foreground/40" />
        <p className="text-sm font-bold">Nada que previsualizar todavía</p>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          La vista previa muestra el documento real (misma plantilla que el PDF descargado) una vez calculado el reporte.
          Pulsa «Generar reporte» en el encabezado y vuelve a esta pestaña.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {p.previewStale && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-warning/30 bg-warning/5 px-3 py-2.5 text-xs text-warning">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1 min-w-[200px]">La vista previa corresponde a la configuración anterior (datos, plantilla o desgloses). Regenera antes de considerar el documento vigente.</span>
          <button onClick={p.onBuild} className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-1.5 text-[10px] font-black uppercase hover:bg-warning/20 shrink-0 min-h-[36px]">
            Regenerar vista previa
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span>
          Documento <strong className="text-foreground">{p.templateLabel}</strong> · periodo {p.applied.cfg.startDate} → {p.applied.cfg.endDate}
        </span>
        <button onClick={p.onExport} className="rounded-lg border border-border/40 px-3 py-1.5 text-[10px] font-black uppercase hover:bg-muted flex items-center gap-1.5 min-h-[36px]">
          <Download className="w-3.5 h-3.5" /> Descargar PDF
        </button>
      </div>

      {p.previewLoading ? (
        <div className="p-10 text-center text-muted-foreground" aria-live="polite">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs">Generando vista previa del documento…</p>
        </div>
      ) : p.previewError ? (
        <div className="p-6 text-center space-y-2" role="alert">
          <AlertTriangle className="w-8 h-8 mx-auto text-destructive/60" />
          <p className="text-xs text-destructive">{p.previewError}</p>
          <button onClick={p.onBuild} className="rounded-lg border border-border/40 px-3 py-2 text-[10px] font-black uppercase hover:bg-muted min-h-[36px]">Reintentar</button>
        </div>
      ) : p.previewUrl ? (
        <div className="rounded-lg overflow-hidden border border-border/40 bg-white" style={{ height: 'min(72vh, 900px)' }}>
          {/* El iframe muestra el MISMO documento que se descarga (blob del builder compartido) */}
          <iframe
            key={p.previewUrl}
            src={p.previewUrl}
            title={`Vista previa del reporte de caja (${p.templateLabel})`}
            className="w-full h-full"
          />
        </div>
      ) : (
        <div className="p-8 text-center space-y-2">
          <FileSearch className="w-8 h-8 mx-auto text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">Pulsa «Regenerar vista previa» para construir el documento.</p>
        </div>
      )}
      <p className="text-[9px] text-muted-foreground text-center">
        La descarga del PDF es una acción separada y explícita; la vista previa no descarga nada.
      </p>
    </div>
  );
}
